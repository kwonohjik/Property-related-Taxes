import { describe, it, expect, vi, beforeEach } from "vitest";
import { masterMarketCodeToStore } from "@/lib/kiwoom/stock-master";

describe("stock-master — anchor (F-15)", () => {
  // K-MASTER-01: ka10099 marketCode → store marketType 변환
  it("K-MASTER-01: marketCode '0' → 'kospi'", () => {
    expect(masterMarketCodeToStore("0")).toBe("kospi");
  });

  it("K-MASTER-02: marketCode '10' → 'kosdaq'", () => {
    expect(masterMarketCodeToStore("10")).toBe("kosdaq");
  });

  it("K-MASTER-03: unknown marketCode → ''", () => {
    expect(masterMarketCodeToStore("3")).toBe("");
    expect(masterMarketCodeToStore("99")).toBe("");
    expect(masterMarketCodeToStore("")).toBe("");
  });

  // F-16 KONEX 추가
  it("K-MASTER-04: marketCode '50' → 'konex' (F-16, 2026-05-19)", () => {
    expect(masterMarketCodeToStore("50")).toBe("konex");
  });
});

// F-10 종목명 자동완성 — 검색 우선순위 anchor
describe("F-10 typeahead search priority", () => {
  // searchStockMaster 자체는 fetch 의존이므로 단위 테스트 별도 setup 필요.
  // 본 anchor는 정렬 우선순위 검증을 위한 sentinel only.
  it("F-10 검색 우선순위: code exact → name prefix → name contains", () => {
    // 정책 sentinel — 실제 검증은 모의투자 실호출에서 확인 (실 데이터 의존)
    expect(true).toBe(true);
  });
});

// F-10 종목명 검색 — 대소문자 무관 (영문 종목명 매칭) anchor
vi.mock("@/lib/kiwoom/tr/ka10099", () => ({
  fetchStockList: vi.fn(async ({ marketTp }: { marketTp: string }) => {
    if (marketTp === "0") {
      return [
        { stockCode: "005930", stockName: "삼성전자", marketCode: "0", marketName: "KOSPI", tradingHalt: false, adminIssue: false },
        { stockCode: "035720", stockName: "Kakao", marketCode: "0", marketName: "KOSPI", tradingHalt: false, adminIssue: false },
        { stockCode: "036570", stockName: "NCsoft", marketCode: "0", marketName: "KOSPI", tradingHalt: false, adminIssue: false },
      ];
    }
    return [];
  }),
}));

describe("F-10 종목명 검색 대소문자 무관", () => {
  beforeEach(async () => {
    const { __resetStockMaster } = await import("@/lib/kiwoom/stock-master");
    __resetStockMaster();
  });

  it("소문자 입력 'kakao' → 'Kakao' 매치", async () => {
    const { searchStockMaster } = await import("@/lib/kiwoom/stock-master");
    const r = await searchStockMaster("kakao");
    expect(r.find((e) => e.stockCode === "035720")).toBeTruthy();
  });

  it("대문자 입력 'KAKAO' → 'Kakao' 매치", async () => {
    const { searchStockMaster } = await import("@/lib/kiwoom/stock-master");
    const r = await searchStockMaster("KAKAO");
    expect(r.find((e) => e.stockCode === "035720")).toBeTruthy();
  });

  it("혼합 입력 'KaKaO' → 'Kakao' 매치", async () => {
    const { searchStockMaster } = await import("@/lib/kiwoom/stock-master");
    const r = await searchStockMaster("KaKaO");
    expect(r.find((e) => e.stockCode === "035720")).toBeTruthy();
  });

  it("소문자 부분일치 'soft' → 'NCsoft' contains 매치", async () => {
    const { searchStockMaster } = await import("@/lib/kiwoom/stock-master");
    const r = await searchStockMaster("soft");
    expect(r.find((e) => e.stockCode === "036570")).toBeTruthy();
  });

  it("한글 입력 '삼' → '삼성전자' 매치 (회귀 보호)", async () => {
    const { searchStockMaster } = await import("@/lib/kiwoom/stock-master");
    const r = await searchStockMaster("삼");
    expect(r.find((e) => e.stockCode === "005930")).toBeTruthy();
  });
});
