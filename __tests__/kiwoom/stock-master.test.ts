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
});
