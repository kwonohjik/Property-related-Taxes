/**
 * 주식수 → 지분율(%) 산출 유닛 테스트
 * computeShareRatioFromShares: 분자/분모로부터 % 단위 문자열 산출.
 * 분모 0/빈값 → null (자동 0 fallback 금지 정책).
 */

import { describe, it, expect } from "vitest";
import { computeShareRatioFromShares } from "@/components/calc/stock-transfer/MajorShareholderBlock";

describe("computeShareRatioFromShares", () => {
  it("SR-1: 100,000주 × 3,000주 보유 → 3.0000%", () => {
    expect(computeShareRatioFromShares("3000", "100000")).toBe("3.0000");
  });

  it("SR-2: 100,000주 × 0주 보유 → 0.0000%", () => {
    expect(computeShareRatioFromShares("0", "100000")).toBe("0.0000");
  });

  it("SR-3: 분모 0 → null (자동 0 fallback 금지)", () => {
    expect(computeShareRatioFromShares("3000", "0")).toBeNull();
  });

  it("SR-4: 분모 빈문자 → null", () => {
    expect(computeShareRatioFromShares("3000", "")).toBeNull();
  });

  it("SR-5: 분자 빈문자 → null", () => {
    expect(computeShareRatioFromShares("", "100000")).toBeNull();
  });

  it("SR-6: 1,234주 ÷ 100,000주 = 1.2340%", () => {
    expect(computeShareRatioFromShares("1234", "100000")).toBe("1.2340");
  });

  it("SR-7: 콤마 포함 입력 처리 (parseDecimal 호환)", () => {
    expect(computeShareRatioFromShares("3,000", "100,000")).toBe("3.0000");
  });

  it("SR-8: 분자 > 분모 (산출은 수행 — validation에서 별도 차단)", () => {
    expect(computeShareRatioFromShares("150000", "100000")).toBe("150.0000");
  });
});
