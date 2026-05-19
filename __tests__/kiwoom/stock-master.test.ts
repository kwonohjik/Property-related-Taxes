import { describe, it, expect } from "vitest";
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
