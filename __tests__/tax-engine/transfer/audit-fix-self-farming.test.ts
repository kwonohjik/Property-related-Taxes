/**
 * 감사 확정 결함 회귀 테스트
 * ref: self-farming-reduction.ts:212 (integer-rounding)
 *
 * 편입일 부분감면(조특령 §66⑤)의 감면대상 양도소득금액을 float 비율 곱
 * (`Math.floor(transferIncome * ratio)`) 대신 정수 분수연산으로 산정해야
 * 1원 과소산정을 방지한다.
 *
 * 기대값 도출(엔진 출력을 베끼지 않고 산식에서 독립 도출):
 *   감면대상소득 = floor(transferIncome × (편입기준시가−취득기준시가)
 *                                       ÷ (양도기준시가−취득기준시가))
 */
import { describe, it, expect } from "vitest";
import { calculateSelfFarmingReduction } from "@/lib/tax-engine/self-farming-reduction";

describe("self-farming §66⑤ 편입일 부분감면 — 정수 분수연산(1원 과소산정 방지)", () => {
  it("float 비율 곱이 1원 과소산정하는 시나리오에서 정확한 floor 정수를 반환한다", () => {
    // failureScenario: transferIncome=379,247,040, 기준시가 취득 100·편입 107·양도 110
    // numerator = 107 - 100 = 7, denom = 110 - 100 = 10
    // 379,247,040 × 7 = 2,654,729,280 ; ÷ 10 = 265,472,928.0 (정수)
    // → 정확값 265,472,928. float(×0.7)은 265,472,927.99999997 → floor 265,472,927 (1원 부족)
    const transferIncome = 379_247_040;
    const expectedReducible = 265_472_928;

    const result = calculateSelfFarmingReduction({
      transferIncome,
      farmingYears: 8,
      minFarmingYears: 8,
      acquisitionDate: new Date("2005-01-01"),
      transferDate: new Date("2021-06-01"),
      incorporationDate: new Date("2020-01-01"), // 2002-01-01 이후 & 3년 내 양도
      incorporationZoneType: "residential",
      standardPriceAtAcquisition: 100,
      standardPriceAtIncorporation: 107,
      standardPriceAtTransfer: 110,
    });

    expect(result.qualifies).toBe(true);
    expect(result.partialReductionApplied).toBe(true);
    expect(result.reducibleIncome).toBe(expectedReducible);
    // 자기일관성: 감면불가분 = 전체 − 감면대상
    expect(result.nonReducibleIncome).toBe(transferIncome - expectedReducible);
  });

  it("편입기준시가 > 양도기준시가(비율 > 1)일 때 감면대상소득이 transferIncome으로 상한된다", () => {
    // stdAcq=100, stdIncorp=120, stdTransfer=110 → numerator=20 > denom=10
    // safeMultiplyThenDivide = transferIncome×2 이지만 Math.min으로 transferIncome 상한 유지.
    const transferIncome = 100_000_000;

    const result = calculateSelfFarmingReduction({
      transferIncome,
      farmingYears: 8,
      minFarmingYears: 8,
      acquisitionDate: new Date("2005-01-01"),
      transferDate: new Date("2021-06-01"),
      incorporationDate: new Date("2020-01-01"),
      incorporationZoneType: "commercial",
      standardPriceAtAcquisition: 100,
      standardPriceAtIncorporation: 120,
      standardPriceAtTransfer: 110,
    });

    expect(result.qualifies).toBe(true);
    expect(result.partialReductionApplied).toBe(true);
    expect(result.reducibleIncome).toBe(transferIncome); // 상한 유지
    expect(result.nonReducibleIncome).toBe(0);
  });
});
