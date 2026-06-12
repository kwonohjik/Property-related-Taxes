/**
 * cite-check 단위 테스트
 *
 * 신호 스캔·정규화·status 위계는 순수 함수로 직접 검증.
 * 오케스트레이션은 fetchJson(검색) + getDecisionText(본문) 이중 mock.
 * 실 API 검증은 anchor로 수행(2013다61381 대법원 6건 스캔·자기참조 제외 확인).
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

vi.mock("@/lib/korean-law/client", () => ({
  getDecisionText: vi.fn(),
}));

import { fetchJson } from "@/lib/korean-law/client-core";
import { getDecisionText } from "@/lib/korean-law/client";
import {
  scanForChangeSignals,
  isEnBanc,
  hasFullTextSource,
  normalizeCaseNo,
  decideStatus,
  checkPrecedentStatus,
} from "@/lib/korean-law/cite-check";

const mockFetchJson = fetchJson as ReturnType<typeof vi.fn>;
const mockGetText = getDecisionText as ReturnType<typeof vi.fn>;

describe("cite-check 순수 함수 — 신호 스캔", () => {
  it("변경 선언 감지", () => {
    const t = "원심은 대법원 2010두1234 판결의 견해는 더 이상 유지될 수 없으므로 이를 변경하기로 한다.";
    const r = scanForChangeSignals(t, "2010두1234");
    expect(r?.label).toBe("판례 변경 선언");
  });
  it("폐기 선언 감지", () => {
    const r = scanForChangeSignals("종전 2009두555 판결을 폐기한다.", "2009두555");
    expect(r?.label).toBe("판례 폐기 선언");
  });
  it("대상 사건번호 미언급 → null (본문검색 노이즈 배제)", () => {
    expect(scanForChangeSignals("변경하기로 한다", "2010두1234")).toBeNull();
  });
  it("사건번호는 있으나 신호 없음 → null", () => {
    expect(scanForChangeSignals("2010두1234 판결을 인용한다.", "2010두1234")).toBeNull();
  });
});

describe("cite-check 순수 함수 — 판정 헬퍼", () => {
  it("isEnBanc", () => {
    expect(isEnBanc("부당이득금 [전원합의체]")).toBe(true);
    expect(isEnBanc("일반 판결")).toBe(false);
  });
  it("hasFullTextSource — 대법원만", () => {
    expect(hasFullTextSource("대법원")).toBe(true);
    expect(hasFullTextSource("국세법령정보시스템")).toBe(false);
  });
  it("normalizeCaseNo — 출처별 표기 흡수", () => {
    expect(normalizeCaseNo("2021두59908")).toBe("2021두59908");
    expect(normalizeCaseNo("대법원-2021-두-59908")).toBe("2021두59908");
    expect(normalizeCaseNo("부산고등법원(울산)-2021-누-10817")).toBe("2021누10817");
  });
  it("decideStatus 위계", () => {
    expect(decideStatus([{ citingCaseNo: "x", citingDate: "", label: "l", excerpt: "e" }], [], 5)).toBe("review_needed");
    expect(decideStatus([], [{ caseNo: "x", title: "", court: "", date: "", isEnBanc: true, id: "1", hasFullText: false }], 5)).toBe("review_needed");
    expect(decideStatus([], [], 3)).toBe("no_signal");
    expect(decideStatus([], [], 0)).toBe("no_citations");
  });
});

describe("cite-check — 오케스트레이션 (mock)", () => {
  beforeEach(() => {
    mockFetchJson.mockReset();
    mockGetText.mockReset();
  });

  function searchResult(precs: Record<string, string>[]) {
    return { PrecSearch: { prec: precs } };
  }

  it("대법원 전합이 변경 선언 → review_needed + signal", async () => {
    mockFetchJson.mockResolvedValue(
      searchResult([
        // 대상 자신(다른 출처 형식) — 제외돼야
        { 사건번호: "대법원-2018-두-100", 데이터출처명: "국세법령정보시스템", 사건명: "자기참조", 판례일련번호: "0" },
        // 변경 선언하는 대법원 전합
        { 사건번호: "2022두9999", 데이터출처명: "대법원", 사건명: "법인세 [전원합의체]", 선고일자: "2024.01.01", 판례일련번호: "111" },
        // 단순 인용 하급심(본문 미제공)
        { 사건번호: "서울고법-2020-누-1", 데이터출처명: "국세법령정보시스템", 사건명: "단순인용", 판례일련번호: "222" },
      ])
    );
    mockGetText.mockResolvedValue({
      reasoning: "대법원 2018두100 판결은 더 이상 유지될 수 없어 이를 변경하기로 한다.",
      holdings: "",
      summary: "",
    });

    const r = await checkPrecedentStatus("2018두100");
    expect(r.status).toBe("review_needed");
    expect(r.citingCount).toBe(2); // 자기참조 제외 → 전합 + 하급심
    expect(r.scannedCount).toBe(1); // 대법원 1건만 본문 스캔
    expect(r.signals).toHaveLength(1);
    expect(r.signals[0].label).toBe("판례 변경 선언");
    expect(r.signals[0].citingCaseNo).toBe("2022두9999");
  });

  it("대법원 인용 있으나 신호 없음 → no_signal", async () => {
    mockFetchJson.mockResolvedValue(
      searchResult([
        { 사건번호: "2023두1", 데이터출처명: "대법원", 사건명: "단순 인용", 선고일자: "2025.01.01", 판례일련번호: "1" },
      ])
    );
    mockGetText.mockResolvedValue({ reasoning: "2018두100 판결의 법리에 따른다.", holdings: "", summary: "" });

    const r = await checkPrecedentStatus("2018두100");
    expect(r.status).toBe("no_signal");
    expect(r.scannedCount).toBe(1);
    expect(r.signals).toHaveLength(0);
  });

  it("후속 인용 0건 → no_citations", async () => {
    mockFetchJson.mockResolvedValue(searchResult([]));
    const r = await checkPrecedentStatus("2018두100");
    expect(r.status).toBe("no_citations");
    expect(r.citingCount).toBe(0);
  });

  it("빈 사건번호 → BAD_REQUEST", async () => {
    await expect(checkPrecedentStatus("  ")).rejects.toThrow();
  });
});
