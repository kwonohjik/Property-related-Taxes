/**
 * 감사 확정 결함 회귀 테스트 — lib/tax-engine/transfer-tax-rental-housing-step.ts
 *
 * 결함 ref: transfer-tax-rental-housing-step.ts:94 (CONFIRMED, correctness, medium)
 *   장기임대주택 거주주택 비과세 특례(§155⑳·§161) 조기반환 경로가 기본공제를
 *   parsedRates.basicDeductionRules.annualLimit(전액 250만)로 고정하여
 *   effectiveInput.annualBasicDeductionUsed(동일연도 기사용분)를 무시했다.
 *   → 같은 해 다른 양도에서 기본공제를 이미 사용한 경우 250만원을 재차 전액 공제
 *      → 과세표준 과소·세액 과소.
 *
 *   법령 근거: 소득세법 §103① — 양도소득 기본공제는 소득별로 해당 과세기간(연)의
 *   양도소득금액에서 각각 연 250만원을 공제(인별·연 합산 한도).
 *   따라서 동일연도 기사용분(annualUsed)만큼 잔여 한도가 줄어야 한다:
 *     잔여 = max(0, 2,500,000 − annualUsed).
 *
 *   기대값은 §103①에서 독립 도출(수정 코드 출력을 베끼지 않음):
 *     annualUsed = 0          → 기본공제 min(2,500,000, 과세대상양도소득) = 2,500,000
 *     annualUsed = 1,000,000  → 기본공제 min(1,500,000, ...)             = 1,500,000
 *     annualUsed = 2,500,000  → 기본공제 0
 *   과세표준 = 과세대상 양도소득금액 − 기본공제.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();

const rentalException: NonNullable<TransferTaxInput["rentalHousingException"]> = {
  applyException: true,
  scenario: "A",
  rentalUnits: [
    {
      registrationDate: new Date("2018-06-01"),
      rentalType: "long-8",
      rentalAcquisitionType: "purchase",
      isApartment: false,
      region: "non-metro",
      standardPriceAtRentalStart: 250_000_000,
      rentalMonths: 96,
      rentalAutoTermination: false,
      requirementsConfirmed: true,
    },
  ],
};

// 고가(15억) 거주주택 → §161 과세대상 양도소득금액이 250만을 크게 초과하도록 구성
// (기본공제 상한이 과세대상양도소득이 아니라 잔여 연 한도에 의해 결정되게 함).
const base = (annualUsed: number): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_500_000_000,
    acquisitionPrice: 1_100_000_000,
    acquisitionDate: new Date("2014-06-01"),
    transferDate: new Date("2024-06-01"),
    residencePeriodMonths: 60,
    isOneHousehold: true,
    householdHousingCount: 1,
    expenses: 0,
    annualBasicDeductionUsed: annualUsed,
    rentalHousingException: rentalException,
  });

describe("audit fix: 장기임대 거주주택 특례 경로 기본공제 annualBasicDeductionUsed 반영 (§103①)", () => {
  const r0 = calculateTransferTax(base(0), rates);
  const r1 = calculateTransferTax(base(1_000_000), rates);
  const r2 = calculateTransferTax(base(2_500_000), rates);

  it("세 경로 모두 특례 적용(조기반환)", () => {
    expect(r0.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(r1.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(r2.rentalHousingExceptionDetail?.applied).toBe(true);
  });

  it("과세대상 양도소득금액은 annualBasicDeductionUsed와 무관하게 동일", () => {
    // 기본공제 기사용분은 taxableGain(§161 과세대상 양도소득금액)에 영향 주지 않음.
    expect(r1.taxableGain).toBe(r0.taxableGain);
    expect(r2.taxableGain).toBe(r0.taxableGain);
    // 잔여 한도 상한이 과세대상양도소득에 의해 잘리지 않도록 충분히 큰지 확인.
    expect(r0.taxableGain).toBeGreaterThan(2_500_000);
  });

  it("annualUsed=0 → 기본공제 250만 전액, 과세표준 = 과세대상 − 250만", () => {
    expect(r0.basicDeduction).toBe(2_500_000);
    expect(r0.taxBase).toBe(r0.taxableGain - 2_500_000);
  });

  it("annualUsed=1,000,000 → 잔여 150만만 공제(§103①), 과세표준 = 과세대상 − 150만", () => {
    expect(r1.basicDeduction).toBe(1_500_000);
    expect(r1.taxBase).toBe(r1.taxableGain - 1_500_000);
  });

  it("annualUsed=2,500,000(전액 소진) → 기본공제 0, 과세표준 = 과세대상 전액 (재공제 방지)", () => {
    expect(r2.basicDeduction).toBe(0);
    expect(r2.taxBase).toBe(r2.taxableGain);
  });

  it("버그 회귀 가드: annualUsed 증가분만큼 과세표준이 정확히 증가 (수정 전엔 불변이라 실패)", () => {
    // 수정 전: 세 경로 모두 basicDeduction 250만 고정 → taxBase 동일.
    expect(r1.taxBase - r0.taxBase).toBe(1_000_000);
    expect(r2.taxBase - r0.taxBase).toBe(2_500_000);
    // 과세표준이 커지면 산출세액도 커져야 함(과다공제 제거 확인).
    expect(r2.calculatedTax).toBeGreaterThan(r0.calculatedTax);
  });
});
