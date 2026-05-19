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
