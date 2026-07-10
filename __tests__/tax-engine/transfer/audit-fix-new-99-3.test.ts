/**
 * 감사 확정 결함 회귀 테스트 — lib/tax-engine/transfer-reductions/new-99-3.ts
 *
 * findingRef 1 (confirmed, new-99-3.ts:305): calcSignedAllocation의 (+,+) 안분이
 *   부동소수 비율(numerator/denominator) × Math.floor 로 계산 → 곱이 정수인 입력에서
 *   1원 과소산정. safeMultiplyThenDivide(정수 분수연산 + BigInt overflow 가드)로 정정.
 *
 * findingRef 2 (plausible, new-99-3.ts:401): 5년-후 (+,+) 안분 결과 reducibleTransferIncome를
 *   양도소득금액으로 상한 클램프하지 않아 numerator>denominator(5년시점 기준시가 > 양도시
 *   기준시가) 케이스에서 감면 대상 소득금액이 실제 양도소득금액을 초과. 조특법 §99의3①
 *   "5년간 발생한 양도소득금액" 총액 상한(new-99.ts:258·unsold-98-8.ts:302 동형)으로 정정.
 *
 * 기대값은 조문 산식에서 독립 도출한 법령상 정확값을 하드코딩 (엔진 출력 복사 금지).
 */

import { describe, it, expect } from "vitest";
import {
  evaluateNew993,
  calcSignedAllocation,
  type New993Input,
} from "@/lib/tax-engine/transfer-reductions/new-99-3";

/**
 * 모든 적용 배제를 통과하는 5년-후 양도 기본 입력.
 * - contractDate 2001-06-01: 신축주택취득기간(2001.5.23~2003.6.30) 내
 * - exclusiveAreaSqm 100㎡: hvBaseDate(2001-06-01, ~2002.9.30 구간)에서 고가주택 조건
 *   (면적 165㎡ 이상 AND 6억 초과)을 면적으로 배제 → transferPrice 무관하게 비고가
 * - transferDate 2015-01-01: 취득(2003-01-01)+5년 초과 → 5년 후 양도
 */
function makeEligibleAfter5Y(overrides: Partial<New993Input> = {}): New993Input {
  return {
    transferDate: new Date("2015-01-01"),
    acquisitionDate: new Date("2003-01-01"),
    contractDate: new Date("2001-06-01"),
    usageApprovalDate: new Date("2003-02-01"),
    transferIncome: 700_000_000,
    standardPriceAtAcquisition: 100_000_000,
    standardPriceAt5Years: 170_000_000,
    standardPriceAtTransfer: 200_000_000,
    transferPrice: 500_000_000,
    exclusiveAreaSqm: 100,
    region: "outside_speculation",
    isResident: true,
    isHousingConstructionBusiness: false,
    acquisitionType: "from_builder",
    hasOccupancyAtContract: false,
    calculatedTaxBeforeReduction: 100_000_000,
    calculatedTaxAfterReduction: 50_000_000,
    ...overrides,
  };
}

describe("findingRef 1 — calcSignedAllocation 정수 분수연산 (1원 과소산정 정정)", () => {
  it("계산 결과의 곱이 정수인 (+,+) 입력에서 정확 정수를 반환한다 (490,000,000)", () => {
    // 법령 산식: 감면 = 양도소득금액 × (5년시점 − 취득시) ÷ (양도시 − 취득시)
    //   = 700,000,000 × 70,000,000 ÷ 100,000,000 = 700,000,000 × 0.7 = 490,000,000 (정확)
    // 부동소수 경로(Math.floor(700,000,000 × 0.7))는 489,999,999로 1원 과소.
    const alloc = calcSignedAllocation(700_000_000, 70_000_000, 100_000_000);
    expect(alloc.signCase).toBe("all_positive");
    expect(alloc.reducibleIncome).toBe(490_000_000);
  });

  it("BigInt overflow 경계(분자×양도소득금액 = 4.9e16 > 2^53)에서도 정확", () => {
    // 분자×양도소득금액 = 70,000,000 × 700,000,000 = 4.9e16 > Number.MAX_SAFE_INTEGER(9.007e15)
    // safeMultiplyThenDivide의 BigInt 분기로 정확 정수 보장.
    expect(70_000_000 * 700_000_000).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
    const alloc = calcSignedAllocation(700_000_000, 70_000_000, 100_000_000);
    expect(alloc.reducibleIncome).toBe(490_000_000);
  });

  it("evaluateNew993 end-to-end — reducibleTransferIncome === 490,000,000", () => {
    const r = evaluateNew993(makeEligibleAfter5Y());
    expect(r.isEligible).toBe(true);
    expect(r.isWithin5Years).toBe(false);
    expect(r.signCase).toBe("all_positive");
    expect(r.reducibleTransferIncome).toBe(490_000_000);
  });
});

describe("findingRef 2 — 감면 대상 소득금액 양도소득금액 상한 클램프", () => {
  it("5년시점 기준시가 > 양도시 기준시가(ratio>1)에서 양도소득금액을 초과하지 않는다", () => {
    // numerator = 300M − 100M = 200,000,000, denominator = 200M − 100M = 100,000,000 (ratio=2)
    // 미클램프 시 감면 = 100,000,000 × 2 = 200,000,000 (양도소득금액 100,000,000 초과).
    // 조특법 §99의3① "5년간 발생한 양도소득금액"은 총 양도소득금액을 넘을 수 없음 → 100,000,000 상한.
    const r = evaluateNew993(
      makeEligibleAfter5Y({
        transferIncome: 100_000_000,
        standardPriceAtAcquisition: 100_000_000,
        standardPriceAt5Years: 300_000_000,
        standardPriceAtTransfer: 200_000_000,
      }),
    );
    expect(r.isEligible).toBe(true);
    expect(r.isWithin5Years).toBe(false);
    expect(r.signCase).toBe("all_positive");
    expect(r.reducibleTransferIncome).toBeLessThanOrEqual(100_000_000);
    expect(r.reducibleTransferIncome).toBe(100_000_000);
  });

  it("산출근거 표시(formulaSteps)의 감면 양도소득금액도 양도소득금액을 초과하지 않는다", () => {
    const r = evaluateNew993(
      makeEligibleAfter5Y({
        transferIncome: 100_000_000,
        standardPriceAtAcquisition: 100_000_000,
        standardPriceAt5Years: 300_000_000,
        standardPriceAtTransfer: 200_000_000,
      }),
    );
    const step = r.formulaSteps.find((s) => s.label === "감면 양도소득금액");
    expect(step).toBeDefined();
    expect(step!.value).toBeLessThanOrEqual(100_000_000);
  });

  it("정상 (+,+) 안분(ratio<1)은 클램프 영향 없이 정확값 유지", () => {
    // 회귀 방어: 클램프가 정상 케이스를 왜곡하지 않는지 확인.
    // 700,000,000 × 70,000,000 ÷ 100,000,000 = 490,000,000 < 700,000,000 → 클램프 미적용.
    const r = evaluateNew993(makeEligibleAfter5Y());
    expect(r.reducibleTransferIncome).toBe(490_000_000);
  });
});
