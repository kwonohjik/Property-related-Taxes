import { describe, expect, it } from "vitest";
import {
  PUBLIC_EXPROPRIATION_ANNUAL_LIMIT,
  PUBLIC_EXPROPRIATION_RATES,
  calculatePublicExpropriationReduction,
} from "@/lib/tax-engine/public-expropriation-reduction";

/**
 * 조특법 §77 공익사업 수용 감면 정확 산식 (이미지 사례 기준)
 *
 *   ① 양도소득금액을 보상액 비율로 안분 → 현금분/채권분 소득금액
 *   ② 기본공제를 감면율 낮은 자산에서 먼저 차감 (소득법 §103②)
 *   ③ 자산별 감면금액 = (자산분 소득 − 자산별 기본공제) × 감면율
 *   ④ 감면대상소득금액 = 현금 감면금액 + 채권 감면금액
 *   ⑤ 감면세액 = 산출세액 × 감면대상소득금액 / 과세표준
 */

describe("R77-1: 현금 단독 감면 10%", () => {
  it("현금 1억 보상 · 산출세액 50,000,000 / 과세표준 100,000,000 → (1억−250만)×10%×산출세액/과세표준", () => {
    const result = calculatePublicExpropriationReduction({
      cashCompensation: 100_000_000,
      bondCompensation: 0,
      businessApprovalDate: new Date("2020-01-01"),
      transferDate: new Date("2023-02-16"),
      calculatedTax: 50_000_000,
      transferIncome: 100_000_000,
      basicDeduction: 2_500_000,
      taxBase: 97_500_000,
    });
    expect(result.isEligible).toBe(true);
    expect(result.useLegacyRates).toBe(false);
    expect(result.breakdown.cashRate).toBe(0.10);
    expect(result.breakdown.cashIncome).toBe(100_000_000);
    expect(result.breakdown.bondIncome).toBe(0);
    expect(result.breakdown.basicDeductionOnCash).toBe(2_500_000);
    expect(result.breakdown.cashReduction).toBe(9_750_000); // (100,000,000 − 2,500,000) × 10%
    expect(result.breakdown.bondReduction).toBe(0);
    expect(result.breakdown.reducibleIncome).toBe(9_750_000);
    // 감면세액 = 50,000,000 × 9,750,000 / 97,500,000 = 5,000,000
    expect(result.rawReductionAmount).toBe(5_000_000);
    expect(result.reductionAmount).toBe(5_000_000);
  });
});

describe("R77-2: 채권 단독 감면 15%", () => {
  it("채권 2억 · 산출세액 30,000,000 / 과세표준 197,500,000", () => {
    const result = calculatePublicExpropriationReduction({
      cashCompensation: 0,
      bondCompensation: 200_000_000,
      businessApprovalDate: new Date("2020-01-01"),
      transferDate: new Date("2023-02-16"),
      calculatedTax: 30_000_000,
      transferIncome: 200_000_000,
      basicDeduction: 2_500_000,
      taxBase: 197_500_000,
    });
    expect(result.breakdown.bondRate).toBe(0.15);
    expect(result.breakdown.bondIncome).toBe(200_000_000);
    expect(result.breakdown.basicDeductionOnBond).toBe(2_500_000);
    expect(result.breakdown.bondReduction).toBe(29_625_000); // (200,000,000 − 2,500,000) × 15%
    expect(result.breakdown.reducibleIncome).toBe(29_625_000);
    // 감면세액 = 30,000,000 × 29,625,000 / 197,500,000 = 4,500,000
    expect(result.rawReductionAmount).toBe(4_500_000);
  });
});

describe("R77-3: 채권 3년 만기특약 30%", () => {
  it("채권 1억 · 3년특약 · 산출세액 10,000,000 / 과세표준 97,500,000", () => {
    const result = calculatePublicExpropriationReduction({
      cashCompensation: 0,
      bondCompensation: 100_000_000,
      bondHoldingYears: 3,
      businessApprovalDate: new Date("2020-01-01"),
      transferDate: new Date("2023-02-16"),
      calculatedTax: 10_000_000,
      transferIncome: 100_000_000,
      basicDeduction: 2_500_000,
      taxBase: 97_500_000,
    });
    expect(result.breakdown.bondRate).toBe(0.30);
    expect(result.breakdown.bondReduction).toBe(29_250_000); // (100,000,000 − 2,500,000) × 30%
    // 감면세액 = 10,000,000 × 29,250,000 / 97,500,000 = 3,000,000
    expect(result.rawReductionAmount).toBe(3_000_000);
  });
});

describe("R77-4: 채권 5년 만기특약 40%", () => {
  it("채권 1억 · 5년특약", () => {
    const result = calculatePublicExpropriationReduction({
      cashCompensation: 0,
      bondCompensation: 100_000_000,
      bondHoldingYears: 5,
      businessApprovalDate: new Date("2020-01-01"),
      transferDate: new Date("2023-02-16"),
      calculatedTax: 10_000_000,
      transferIncome: 100_000_000,
      basicDeduction: 2_500_000,
      taxBase: 97_500_000,
    });
    expect(result.breakdown.bondRate).toBe(0.40);
    expect(result.breakdown.bondReduction).toBe(39_000_000); // (100,000,000 − 2,500,000) × 40%
    // 감면세액 = 10,000,000 × 39,000,000 / 97,500,000 = 4,000,000
    expect(result.rawReductionAmount).toBe(4_000_000);
  });
});

describe("R77-5: 이미지 사례 — 현금 168.3M + 채권 392M (원단위 정답)", () => {
  it("감면세액 12,125,580원 (이미지 정답)", () => {
    const result = calculatePublicExpropriationReduction({
      cashCompensation: 168_287_470,
      bondCompensation: 392_000_000,
      bondHoldingYears: null,
      businessApprovalDate: new Date("2017-04-23"),
      transferDate: new Date("2023-02-16"),
      calculatedTax: 89_629_667,
      transferIncome: 290_841_229, // 양도차익 415,487,470 − 장특공제 124,646,241
      basicDeduction: 2_500_000,
      taxBase: 288_341_229,
    });

    expect(result.isEligible).toBe(true);
    expect(result.useLegacyRates).toBe(false);
    expect(result.breakdown.cashRate).toBe(0.10);
    expect(result.breakdown.bondRate).toBe(0.15);

    // ① 양도소득금액 안분
    expect(result.breakdown.cashIncome).toBe(87_356_825);
    expect(result.breakdown.bondIncome).toBe(203_484_404);

    // ② 기본공제 배정 — 현금율(10%) < 채권율(15%) → 현금에 전액 배정
    expect(result.breakdown.basicDeductionOnCash).toBe(2_500_000);
    expect(result.breakdown.basicDeductionOnBond).toBe(0);

    // ③ 자산별 감면금액
    //    현금: (87,356,825 − 2,500,000) × 10% = 8,485,682 (.5 절사)
    //    채권: 203,484,404 × 15% = 30,522,660 (.6 절사)
    expect(result.breakdown.cashReduction).toBe(8_485_682);
    expect(result.breakdown.bondReduction).toBe(30_522_660);

    // ④ 감면대상소득금액
    expect(result.breakdown.reducibleIncome).toBe(39_008_342);

    // ⑤ 감면세액 = 89,629,667 × 39,008,342 / 288,341,229 = 12,125,580
    expect(result.rawReductionAmount).toBe(12_125_580);
    expect(result.reductionAmount).toBe(12_125_580);
    expect(result.cappedByAnnualLimit).toBe(false);
  });
});

describe("R77-6: 부칙 §53 종전 감면율 (현금 20%)", () => {
  it("고시 2015-06-30 + 양도 2017-06-30 → LEGACY", () => {
    const result = calculatePublicExpropriationReduction({
      cashCompensation: 100_000_000,
      bondCompensation: 0,
      businessApprovalDate: new Date("2015-06-30"),
      transferDate: new Date("2017-06-30"),
      calculatedTax: 10_000_000,
      transferIncome: 100_000_000,
      basicDeduction: 2_500_000,
      taxBase: 97_500_000,
    });
    expect(result.useLegacyRates).toBe(true);
    expect(result.breakdown.cashRate).toBe(PUBLIC_EXPROPRIATION_RATES.LEGACY.cash);
    expect(result.breakdown.cashReduction).toBe(19_500_000); // (100M − 2.5M) × 20%
    // 감면세액 = 10,000,000 × 19,500,000 / 97,500,000 = 2,000,000
    expect(result.rawReductionAmount).toBe(2_000_000);
  });

  it("고시 2015-06-30이지만 양도 2018-01-01이면 CURRENT", () => {
    const result = calculatePublicExpropriationReduction({
      cashCompensation: 100_000_000,
      bondCompensation: 0,
      businessApprovalDate: new Date("2015-06-30"),
      transferDate: new Date("2018-01-01"),
      calculatedTax: 10_000_000,
      transferIncome: 100_000_000,
      basicDeduction: 2_500_000,
      taxBase: 97_500_000,
    });
    expect(result.useLegacyRates).toBe(false);
    expect(result.breakdown.cashReduction).toBe(9_750_000); // (100M − 2.5M) × 10%
    expect(result.rawReductionAmount).toBe(1_000_000);
  });
});

describe("R77-7: §133 연간 한도 2억원 capping", () => {
  it("rawReduction > 2억이면 2억으로 capping", () => {
    // 채권 200억 × 40% = 80억 감면소득, 과세표준도 충분히 커서 산출세액 대부분 차감
    const result = calculatePublicExpropriationReduction({
      cashCompensation: 0,
      bondCompensation: 20_000_000_000,
      bondHoldingYears: 5,
      businessApprovalDate: new Date("2020-01-01"),
      transferDate: new Date("2023-02-16"),
      calculatedTax: 3_000_000_000,
      transferIncome: 20_000_000_000,
      basicDeduction: 2_500_000,
      taxBase: 19_997_500_000,
    });
    // reducibleIncome = (20,000,000,000 − 2,500,000) × 40% = 7,999,000,000
    // raw = 3,000,000,000 × 7,999,000,000 / 19,997,500,000 = 1,199,849,981
    // 한도 2억 초과 → capping
    expect(result.cappedByAnnualLimit).toBe(true);
    expect(result.reductionAmount).toBe(PUBLIC_EXPROPRIATION_ANNUAL_LIMIT);
  });
});

describe("R77-8: 입력 유효성", () => {
  it("보상액 0 → 비적격", () => {
    const result = calculatePublicExpropriationReduction({
      cashCompensation: 0,
      bondCompensation: 0,
      businessApprovalDate: new Date("2020-01-01"),
      transferDate: new Date("2023-02-16"),
      calculatedTax: 10_000_000,
      transferIncome: 100_000_000,
      basicDeduction: 2_500_000,
      taxBase: 97_500_000,
    });
    expect(result.isEligible).toBe(false);
    expect(result.reductionAmount).toBe(0);
  });

  it("산출세액 0 → 비적격", () => {
    const result = calculatePublicExpropriationReduction({
      cashCompensation: 100_000_000,
      bondCompensation: 0,
      businessApprovalDate: new Date("2020-01-01"),
      transferDate: new Date("2023-02-16"),
      calculatedTax: 0,
      transferIncome: 100_000_000,
      basicDeduction: 2_500_000,
      taxBase: 97_500_000,
    });
    expect(result.isEligible).toBe(false);
  });

  it("양도소득금액 0 → 비적격", () => {
    const result = calculatePublicExpropriationReduction({
      cashCompensation: 100_000_000,
      bondCompensation: 0,
      businessApprovalDate: new Date("2020-01-01"),
      transferDate: new Date("2023-02-16"),
      calculatedTax: 10_000_000,
      transferIncome: 0,
      basicDeduction: 2_500_000,
      taxBase: 97_500_000,
    });
    expect(result.isEligible).toBe(false);
    expect(result.notEligibleReason).toContain("양도소득금액");
  });

  it("과세표준 0 → 비적격", () => {
    const result = calculatePublicExpropriationReduction({
      cashCompensation: 100_000_000,
      bondCompensation: 0,
      businessApprovalDate: new Date("2020-01-01"),
      transferDate: new Date("2023-02-16"),
      calculatedTax: 10_000_000,
      transferIncome: 100_000_000,
      basicDeduction: 2_500_000,
      taxBase: 0,
    });
    expect(result.isEligible).toBe(false);
    expect(result.notEligibleReason).toContain("과세표준");
  });
});
