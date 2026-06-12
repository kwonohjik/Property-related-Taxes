/**
 * time-travel 단위 테스트
 *
 * LCS diff·조문 추출은 순수 함수로 직접 검증, 오케스트레이션은 fetchJson mock.
 * 실 API 검증은 anchor로 별도 수행(소득세법 §59의2 자녀세액공제 = 실제 변경 확인).
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
  diffLines,
  hasChanges,
  extractLawAndArticle,
  compareLatestAmendment,
} from "@/lib/korean-law/time-travel";

const mockFetchJson = fetchJson as ReturnType<typeof vi.fn>;

describe("time-travel — diffLines (LCS)", () => {
  it("추가·삭제·유지 라인 분류", () => {
    const d = diffLines("가\n나\n다", "가\n나 수정\n다\n라");
    expect(d).toEqual([
      { kind: "keep", text: "가" },
      { kind: "remove", text: "나" },
      { kind: "add", text: "나 수정" },
      { kind: "keep", text: "다" },
      { kind: "add", text: "라" },
    ]);
  });

  it("동일 본문 → 모두 keep, hasChanges false", () => {
    const d = diffLines("가\n나", "가\n나");
    expect(d.every((l) => l.kind === "keep")).toBe(true);
    expect(hasChanges(d)).toBe(false);
  });

  it("공백·빈 줄 정규화", () => {
    const d = diffLines("  가  \n\n나", "가\n나");
    expect(hasChanges(d)).toBe(false);
  });

  it("전면 교체", () => {
    const d = diffLines("옛 본문", "새 본문");
    expect(hasChanges(d)).toBe(true);
    expect(d.some((l) => l.kind === "remove")).toBe(true);
    expect(d.some((l) => l.kind === "add")).toBe(true);
  });
});

describe("time-travel — extractLawAndArticle", () => {
  it("법령명 + 조문번호 추출", () => {
    expect(extractLawAndArticle("소득세법 89조 개정")).toEqual({
      lawName: "소득세법",
      articleNo: "제89조",
    });
    expect(extractLawAndArticle("소득세법 제18조의2 신구대조")).toEqual({
      lawName: "소득세법",
      articleNo: "제18조의2",
    });
  });
  it("조문번호 없으면 null", () => {
    expect(extractLawAndArticle("양도소득세 개정 이력")).toBeNull();
    expect(extractLawAndArticle("소득세법 연혁")).toBeNull();
  });
});

describe("time-travel — compareLatestAmendment (mock)", () => {
  beforeEach(() => mockFetchJson.mockReset());

  /** eflaw 본문 응답 빌더 */
  function articleResponse(text: string) {
    return {
      법령: {
        조문: {
          조문단위: [
            { 조문여부: "전문" },
            { 조문여부: "조문", 조문번호: "59", 조문제목: "자녀세액공제", 조문내용: text },
          ],
        },
      },
    };
  }

  it("실제 변경된 인접 버전쌍을 찾아 diff", async () => {
    // 버전: MST C(최신)=현행, B=중간(동일), A=옛(다름)
    mockFetchJson.mockImplementation(async (endpoint: string, params: Record<string, string>) => {
      if (endpoint === "lawSearch.do" && params.target === "eflaw") {
        return {
          LawSearch: {
            law: [
              { 법령명한글: "소득세법", 법령일련번호: "C", 시행일자: "20260101", 공포일자: "20251231", 공포번호: "3", 제개정구분명: "일부개정", 현행연혁코드: "현행" },
              { 법령명한글: "소득세법", 법령일련번호: "B", 시행일자: "20250101", 공포일자: "20241231", 공포번호: "2", 제개정구분명: "일부개정", 현행연혁코드: "연혁" },
              { 법령명한글: "소득세법", 법령일련번호: "A", 시행일자: "20240101", 공포일자: "20231231", 공포번호: "1", 제개정구분명: "일부개정", 현행연혁코드: "연혁" },
            ],
          },
        };
      }
      if (endpoint === "lawService.do" && params.target === "eflaw") {
        // C, B 동일 / A 다름 → 최근 실질 개정은 B(=20250101) vs A 가 아니라 B vs C는 동일
        // 인접쌍 C-B 동일 → B-A 비교 → 다름 → before=A, after=B
        const text = params.MST === "A" ? "제59조의2(자녀) ① 8세 이상" : "제59조의2(자녀) ① 7세 이상";
        return articleResponse(text);
      }
      return {};
    });

    const r = await compareLatestAmendment("소득세법", "제59조의2");
    expect(r).not.toBeNull();
    expect(r!.identical).toBe(false);
    expect(r!.before?.version.mst).toBe("A");
    expect(r!.after?.version.mst).toBe("B");
    expect(r!.diff.some((l) => l.kind === "add")).toBe(true);
    expect(r!.diff.some((l) => l.kind === "remove")).toBe(true);
  });

  it("변경 없으면 identical=true", async () => {
    mockFetchJson.mockImplementation(async (endpoint: string, params: Record<string, string>) => {
      if (endpoint === "lawSearch.do" && params.target === "eflaw") {
        return {
          LawSearch: {
            law: [
              { 법령명한글: "소득세법", 법령일련번호: "C", 시행일자: "20260101", 공포일자: "20251231", 공포번호: "3", 제개정구분명: "일부개정", 현행연혁코드: "현행" },
              { 법령명한글: "소득세법", 법령일련번호: "B", 시행일자: "20250101", 공포일자: "20241231", 공포번호: "2", 제개정구분명: "일부개정", 현행연혁코드: "연혁" },
            ],
          },
        };
      }
      if (endpoint === "lawService.do") return articleResponse("제59조의2(자녀) ① 동일 본문");
      return {};
    });
    const r = await compareLatestAmendment("소득세법", "제59조의2");
    expect(r!.identical).toBe(true);
  });

  it("버전 1개뿐 → null", async () => {
    mockFetchJson.mockImplementation(async (endpoint: string, params: Record<string, string>) => {
      if (endpoint === "lawSearch.do" && params.target === "eflaw") {
        return {
          LawSearch: {
            law: [
              { 법령명한글: "소득세법", 법령일련번호: "C", 시행일자: "20260101", 공포일자: "20251231", 공포번호: "3", 제개정구분명: "제정", 현행연혁코드: "현행" },
            ],
          },
        };
      }
      return {};
    });
    expect(await compareLatestAmendment("소득세법", "제59조의2")).toBeNull();
  });
});
