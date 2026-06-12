/**
 * applicable-law 단위 테스트
 *
 * 순수 함수(날짜·버전 선택·부칙 발췌)는 직접 검증, 오케스트레이션은 fetchJson mock.
 * 실 API 검증은 Pre-Do anchor(/tmp/applicable-law-anchor.mjs)로 별도 수행 — 2021 소득세법 §89.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/korean-law/client-core", async (orig) => {
  const actual = await orig<typeof import("@/lib/korean-law/client-core")>();
  return {
    ...actual,
    fetchJson: vi.fn(),
    readCache: vi.fn(async () => null),
    writeCache: vi.fn(async () => undefined),
  };
});

import { fetchJson } from "@/lib/korean-law/client-core";
import {
  normalizeYmd,
  sortVersionsDesc,
  selectApplicableVersion,
  selectLaterVersions,
  normalizeAncNo,
  extractTransitionExcerpts,
  isSameArticleText,
  getApplicableLaw,
  type AddendumUnit,
} from "@/lib/korean-law/applicable-law";
import type { LawVersionEntry } from "@/lib/korean-law/types";

const mockFetchJson = fetchJson as ReturnType<typeof vi.fn>;

function v(mst: string, efYd: string, ancNo: string, ancYd: string, status = "연혁"): LawVersionEntry {
  return { mst, efYd, ancYd, ancNo, rrCls: "일부개정", statusLabel: status };
}

describe("applicable-law 순수 함수 — 날짜", () => {
  it("normalizeYmd 다양한 입력", () => {
    expect(normalizeYmd("2021-06-01")).toBe("20210601");
    expect(normalizeYmd("2021.6.1")).toBe("20210601");
    expect(normalizeYmd("20210601")).toBe("20210601");
    expect(normalizeYmd("2021/06/01")).toBe("20210601");
  });
  it("normalizeYmd 잘못된 입력 → null", () => {
    expect(normalizeYmd("2021-13-01")).toBeNull();
    expect(normalizeYmd("abc")).toBeNull();
    expect(normalizeYmd("1800-01-01")).toBeNull();
  });
  it("normalizeAncNo 0 패딩 흡수", () => {
    expect(normalizeAncNo("09897")).toBe("9897");
    expect(normalizeAncNo("9897")).toBe("9897");
  });
});

describe("applicable-law 순수 함수 — 버전 선택", () => {
  const versions = sortVersionsDesc([
    v("A", "20240101", "100", "20231231", "현행"),
    v("B", "20230301", "90", "20230228"),
    v("C", "20200101", "80", "20191231"),
  ]);

  it("sortVersionsDesc — 시행일 내림차순", () => {
    expect(versions.map((x) => x.efYd)).toEqual(["20240101", "20230301", "20200101"]);
  });

  it("selectApplicableVersion — 기준일 이하 최신", () => {
    expect(selectApplicableVersion(versions, "20230510")?.efYd).toBe("20230301");
    expect(selectApplicableVersion(versions, "20240101")?.efYd).toBe("20240101");
    expect(selectApplicableVersion(versions, "20191231")).toBeNull(); // 제정 전
  });

  it("selectLaterVersions — 기준일~오늘 사이 개정", () => {
    const later = selectLaterVersions(versions, "20230510", "20250101");
    expect(later.map((x) => x.efYd)).toEqual(["20240101"]);
  });

  it("selectLaterVersions — 공포번호 중복 제거", () => {
    const dup = sortVersionsDesc([
      v("A", "20240101", "100", "20231231"),
      v("A2", "20240601", "100", "20231231"), // 같은 공포번호(단계시행)
      v("B", "20230301", "90", "20230228"),
    ]);
    const later = selectLaterVersions(dup, "20230510", "20250101");
    expect(later).toHaveLength(1); // 공포번호 100 한 번만
  });
});

describe("applicable-law 순수 함수 — 부칙 발췌", () => {
  const addenda: AddendumUnit[] = [
    {
      ancNo: "18578",
      ancYd: "20211208",
      content:
        "부칙 <제18578호,2021.12.8>\n제1조(시행일) 이 법은 2022년 1월 1일부터 시행한다.\n3. 제89조제1항제3호의 개정규정: 공포한 날",
    },
    {
      ancNo: "21548",
      ancYd: "20260421",
      content:
        "부칙 <제21548호,2026.4.21>\n제2조(자녀세액공제 적용례) 제59조의2의 개정규정은 이 법 시행일이 속하는 과세기간분부터 적용한다.",
    },
  ];

  it("조문 직접 언급 발췌가 일반 경과규정보다 우선 (articleSpecific=true)", () => {
    const out = extractTransitionExcerpts(
      addenda,
      new Set(["18578", "21548"]),
      "제89조"
    );
    expect(out[0].articleSpecific).toBe(true);
    expect(out[0].lines[0]).toContain("제89조");
    // 자녀세액공제는 articleSpecific=false로 뒤에
    const generic = out.find((e) => e.ancNo === "21548");
    expect(generic?.articleSpecific).toBe(false);
  });

  it("relevantAncNos 필터 — 무관 부칙 제외", () => {
    const out = extractTransitionExcerpts(addenda, new Set(["18578"]), "제89조");
    expect(out.every((e) => e.ancNo === "18578")).toBe(true);
  });

  it("제89조 매칭이 제89조의2를 오탐하지 않음", () => {
    const a: AddendumUnit[] = [
      { ancNo: "1", ancYd: "20200101", content: "제89조의2의 개정규정은 적용례에 따른다." },
    ];
    const out = extractTransitionExcerpts(a, new Set(["1"]), "제89조");
    // 제89조 전용 라인 없음 → articleSpecific false (제89조의2는 별개 조문)
    expect(out[0]?.articleSpecific ?? false).toBe(false);
  });
});

describe("applicable-law 순수 함수 — 본문 비교", () => {
  it("공백 차이 무시", () => {
    expect(isSameArticleText("제89조  본문", "제89조 본문")).toBe(true);
    expect(isSameArticleText("제89조 본문 A", "제89조 본문 B")).toBe(false);
  });
});

describe("getApplicableLaw — 오케스트레이션 (mock)", () => {
  beforeEach(() => mockFetchJson.mockReset());

  it("기준일 시행 버전 + 조문 + 부칙 통합", async () => {
    mockFetchJson.mockImplementation(async (endpoint: string, params: Record<string, string>) => {
      if (endpoint === "lawSearch.do" && params.target === "eflaw") {
        // 버전 목록 (page 1에서 종료)
        return {
          LawSearch: {
            law: [
              { 법령명한글: "소득세법", 법령일련번호: "224801", 시행일자: "20210601", 공포일자: "20201229", 공포번호: "17757", 제개정구분명: "일부개정", 현행연혁코드: "연혁" },
              { 법령명한글: "소득세법", 법령일련번호: "285523", 시행일자: "20260421", 공포일자: "20260421", 공포번호: "21548", 제개정구분명: "일부개정", 현행연혁코드: "현행" },
              { 법령명한글: "소득세법 시행령", 법령일련번호: "999", 시행일자: "20210601", 공포일자: "20201229", 공포번호: "1", 제개정구분명: "일부개정", 현행연혁코드: "연혁" },
            ],
          },
        };
      }
      if (endpoint === "lawService.do" && params.target === "eflaw") {
        const isCurrent = params.MST === "285523";
        return {
          법령: {
            조문: {
              조문단위: [
                { 조문여부: "전문" },
                { 조문여부: "조문", 조문번호: "89", 조문제목: "비과세 양도소득", 조문내용: `제89조(비과세 양도소득) ① ${isCurrent ? "현행" : "구"} 본문` },
              ],
            },
          },
        };
      }
      if (endpoint === "lawService.do" && params.target === "law") {
        return {
          법령: {
            부칙: {
              부칙단위: [
                { 부칙공포번호: "17757", 부칙공포일자: "20201229", 부칙내용: "제89조의 개정규정은 이 법 시행 이후 양도분부터 적용한다." },
              ],
            },
          },
        };
      }
      return {};
    });

    const r = await getApplicableLaw("소득세법", "89", "2021-06-01");
    expect(r.lawName).toBe("소득세법");
    expect(r.articleNo).toBe("제89조");
    expect(r.version.efYd).toBe("20210601");
    expect(r.version.mst).toBe("224801");
    expect(r.currentVersion?.efYd).toBe("20260421");
    expect(r.isCurrentVersion).toBe(false);
    expect(r.article?.title).toBe("비과세 양도소득");
    expect(r.sameAsCurrentText).toBe(false); // 구 본문 ≠ 현행 본문
    expect(r.transitionExcerpts.length).toBeGreaterThan(0);
    expect(r.transitionExcerpts[0].articleSpecific).toBe(true);
  });

  it("연혁 0건 → NOT_FOUND", async () => {
    mockFetchJson.mockResolvedValue({ LawSearch: {} });
    await expect(getApplicableLaw("없는법", "1", "2021-01-01")).rejects.toThrow(/연혁/);
  });

  it("제정 전 기준일 → NOT_FOUND", async () => {
    mockFetchJson.mockResolvedValue({
      LawSearch: {
        law: [{ 법령명한글: "소득세법", 법령일련번호: "1", 시행일자: "20200101", 공포일자: "20191231", 공포번호: "1", 제개정구분명: "제정", 현행연혁코드: "연혁" }],
      },
    });
    await expect(getApplicableLaw("소득세법", "89", "1990-01-01")).rejects.toThrow(/시행 중인/);
  });
});
