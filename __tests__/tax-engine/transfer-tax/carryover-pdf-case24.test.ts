/**
 * C-01: 배우자 이월과세 + 기준시가 직접 환산 — 예제 사례 24 anchor
 *
 * 출처: 예제 PDF 사례 24 (검증 2026-05-04)
 * 법령: 소득세법 §97조의2, §97① 1호 나목, 시행령 §163⑥
 *
 * 사례 개요:
 *   - 자산: 서울 마포구 상암동 상암월드컵3단지 307동 301호 (84.84㎡)
 *   - 증여자 취득일: 2006-05-21 (증여자)
 *   - 증여 등기접수일: 2018-06-19 (§97조의2 ③ 기산점)
 *   - 양도일: 2023-02-16
 *   - 양도가액: 700,000,000
 *   - 취득방식: 기준시가 직접 환산 (APD/PHD 아님)
 *     취득시 기준시가 (2006년 공동주택): 404,000,000
 *     양도시 기준시가 (2022년 공동주택): 794,000,000
 *   - 증여세 상당액: 10,000,000
 *   - 거주기간: 0 (수증자 직접 거주 없음)
 *   - wasRegulatedAtAcquisition: false (2006년 취득, 조정대상지역 지정 이전)
 *
 * M-5 임계값 적용 결과:
 *   Scenario A: 우리 엔진 64,684,518 = 예제 64,684,518 → 완전 일치
 *   Scenario B: 우리 엔진 64,062,800 = 예제 64,062,800 → 완전 일치
 *
 * 계산 방식:
 *   우리 엔진 양도세는 과세표준 천원 미만 절사를 별도 적용하지 않음.
 *   산출세액 = floor(과세표준 × 세율) - 누진공제로 계산하며 예제와 동일.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

// ──────────────────────────────────────────────────────────────
// 사례 24 입력 상수 (PDF 정확값)
// ──────────────────────────────────────────────────────────────

/** 양도가액 */
const C01_TRANSFER_PRICE = 700_000_000;
/** 양도일 */
const C01_TRANSFER_DATE = new Date("2023-02-16");

/** 증여 등기접수일 (§97조의2 ③ 기산점) */
const C01_GIFT_REGISTRY_DATE = new Date("2018-06-19");
/** 증여자의 취득일 (§95 ④ 보유기간 기산) */
const C01_DONOR_ACQUISITION_DATE = new Date("2006-05-21");

/** 취득시 기준시가 (2006년 공동주택공시가격) */
const C01_STD_AT_ACQUISITION = 404_000_000;
/** 양도시 기준시가 (2022년 공동주택공시가격) */
const C01_STD_AT_TRANSFER = 794_000_000;

/** 증여세 상당액 */
const C01_GIFT_TAX_AMOUNT = 10_000_000;

/** 증여 당시 평가액 (Scenario B 취득가액) */
const C01_GIFT_DATE_VALUATION = 457_000_000;

// ──────────────────────────────────────────────────────────────
// 예제 검증값 (PDF 정확값)
// ──────────────────────────────────────────────────────────────

// Scenario A: 이월과세 적용 (증여자 취득일 기산, 환산취득가)
const EXAMPLE_A_EST_ACQ = 356_171_284;      // 700M × 404M / 794M
const EXAMPLE_A_DEDUCTION = 12_120_000;     // 404M × 3%
const EXAMPLE_A_GIFT_TAX_EXPENSE = 10_000_000;
const EXAMPLE_A_TRANSFER_GAIN = 321_708_716; // 700M - 356,171,284 - 12,120,000 - 10,000,000
const EXAMPLE_A_LTHD = 96_512_614;          // 321,708,716 × 30% (16년 이상 → max 30%)
const EXAMPLE_A_TAXABLE_INCOME = 225_196_102;
const EXAMPLE_A_DETERMINED_TAX = 64_684_518; // 예제 값 (천원 미절사 방식)

// Scenario B: 이월과세 미적용 (증여 등기일 기산, 실가)
const EXAMPLE_B_TRANSFER_GAIN = 243_000_000; // 700M - 457M
const EXAMPLE_B_LTHD = 19_440_000;           // 243M × 8% (4년 → 8%)
const EXAMPLE_B_TAXABLE_INCOME = 223_560_000;
const EXAMPLE_B_DETERMINED_TAX = 64_062_800;

// 우리 엔진 anchor값 (예제와 완전 일치)
const ENGINE_A_DETERMINED_TAX = 64_684_518; // 222,696,102 × 38% - 19,940,000 (과세표준 절사 미적용)
const ENGINE_B_DETERMINED_TAX = 64_062_800; // Scenario B는 완전 일치

const MOCK_RATES = makeMockRates();

function makeC01Input(): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: C01_TRANSFER_PRICE,
    transferDate: C01_TRANSFER_DATE,
    acquisitionPrice: 0, // 환산취득가 사용
    acquisitionDate: C01_DONOR_ACQUISITION_DATE, // Scenario A에서 carryover가 donorAcquisitionDate로 교체
    expenses: 0,
    useEstimatedAcquisition: true,
    standardPriceAtAcquisition: C01_STD_AT_ACQUISITION,
    standardPriceAtTransfer: C01_STD_AT_TRANSFER,
    householdHousingCount: 1,
    residencePeriodMonths: 0,       // 거주 없음 → 표1 LTHD (일반 보유 연 2%)
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: true, // 수증자 취득(2018-06-19) 당시 마포구 상암동 조정대상지역
    // → 거주요건 2년 필요 but 거주 0개월 → 비과세 불가 → 과세
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: true,
    reductions: [],
    annualBasicDeductionUsed: 0,
    acquisitionCause: "carryover_gift",
    carryoverTaxation: {
      giftRegistryDate: C01_GIFT_REGISTRY_DATE,
      donorAcquisitionDate: C01_DONOR_ACQUISITION_DATE,
      useEstimatedAcquisition: true, // 기준시가 직접 환산 (standardPriceAtAcquisition 사용)
      giftTaxAmount: C01_GIFT_TAX_AMOUNT,
      giftDateValuation: C01_GIFT_DATE_VALUATION,
      donorCapitalExpenditure: 0,
    },
  });
}

// ──────────────────────────────────────────────────────────────
// C-01 테스트 스위트
// ──────────────────────────────────────────────────────────────

describe("C-01: 배우자 이월과세 + 기준시가 직접 환산 (예제 사례 24 anchor)", () => {

  it("C-01-1: carryoverTaxationDetail 이 결과에 포함되어야 한다", () => {
    const result = calculateTransferTax(makeC01Input(), MOCK_RATES);
    expect(result.carryoverTaxationDetail).toBeDefined();
  });

  it("C-01-2: 이월과세 적용 가능 (isEligible = true)", () => {
    const result = calculateTransferTax(makeC01Input(), MOCK_RATES);
    expect(result.carryoverTaxationDetail?.isEligible).toBe(true);
  });

  it("C-01-3: 5년 룰 적용 (증여 등기일 2018-06-19 < 2023-01-01)", () => {
    const result = calculateTransferTax(makeC01Input(), MOCK_RATES);
    expect(result.carryoverTaxationDetail?.applicablePeriodYears).toBe(5);
  });

  it("C-01-4: Scenario A 환산취득가액 — 예제 일치 (356,171,284)", () => {
    /**
     * 환산공식: 700,000,000 × (404,000,000 / 794,000,000) = 356,171,284
     * Math.floor(700M × 404M / 794M) = 356,171,284
     */
    const result = calculateTransferTax(makeC01Input(), MOCK_RATES);
    const acqPrice = result.carryoverTaxationDetail?.scenarioA.acquisitionPrice ?? 0;
    expect(acqPrice).toBe(EXAMPLE_A_EST_ACQ);
  });

  it("C-01-5: Scenario A 증여세 상당액 차감 = 10,000,000", () => {
    /**
     * §163의2 ② 단서: giftTaxAmount(10M) ≤ gainBeforeGiftTax(321,708,716 + 10M = 331,708,716)
     * → giftTaxAddedToExpense = 10,000,000 (한도 미적용)
     */
    const result = calculateTransferTax(makeC01Input(), MOCK_RATES);
    const detail = result.carryoverTaxationDetail?.scenarioA;
    expect(detail?.giftTaxAddedToExpense).toBe(EXAMPLE_A_GIFT_TAX_EXPENSE);
    expect(detail?.giftTaxLimitApplied).toBe(false);
  });

  it("C-01-6: Scenario A 개산공제 — 404M × 3% = 12,120,000 (환산 모드 필요경비)", () => {
    /**
     * §163⑥: 환산취득가액 적용 시 개산공제 = 취득시 기준시가 × 3%
     * 404,000,000 × 3% = 12,120,000
     */
    // 양도차익 역산으로 개산공제 확인
    // 양도차익 = 700M - 환산취득가 - 개산공제 - 증여세
    const result = calculateTransferTax(makeC01Input(), MOCK_RATES);
    const detail = result.carryoverTaxationDetail?.scenarioA;
    // 양도차익이 321,708,716인지 확인 (개산공제 12,120,000이 정확히 차감됐음을 간접 검증)
    expect(detail?.transferGain).toBe(EXAMPLE_A_TRANSFER_GAIN);
  });

  it("C-01-7: Scenario A 양도차익 = 321,708,716 (예제 일치)", () => {
    /**
     * 700,000,000 - 356,171,284 - 12,120,000 - 10,000,000 = 321,708,716
     */
    const result = calculateTransferTax(makeC01Input(), MOCK_RATES);
    expect(result.carryoverTaxationDetail?.scenarioA.transferGain).toBe(EXAMPLE_A_TRANSFER_GAIN);
  });

  it("C-01-8: Scenario A 결정세액 = 64,684,518 (예제 완전 일치)", () => {
    /**
     * 양도소득금액: 321,708,716 × (1 - 0.30) = 225,196,102 (LTHD 30%)
     * 과세표준: 225,196,102 - 2,500,000 = 222,696,102
     * 산출세액: floor(222,696,102 × 0.38) - 19,940,000 = 84,624,518 - 19,940,000 = 64,684,518
     *
     * 우리 엔진과 예제 모두 동일. M-5: 완전 일치.
     */
    const result = calculateTransferTax(makeC01Input(), MOCK_RATES);
    const detA = result.carryoverTaxationDetail?.scenarioA.determinedTax ?? 0;
    expect(detA).toBe(ENGINE_A_DETERMINED_TAX);
    // 예제 값과의 차이가 100원 이하 확인 (M-5 anchor 채택 요건)
    expect(Math.abs(detA - EXAMPLE_A_DETERMINED_TAX)).toBeLessThanOrEqual(100);
  });

  it("C-01-9: Scenario B 양도차익 = 243,000,000 (예제 일치)", () => {
    /**
     * 700,000,000 - 457,000,000 = 243,000,000
     */
    const result = calculateTransferTax(makeC01Input(), MOCK_RATES);
    expect(result.carryoverTaxationDetail?.scenarioB.transferGain).toBe(EXAMPLE_B_TRANSFER_GAIN);
  });

  it("C-01-10: Scenario B 결정세액 = 64,062,800 (예제 완전 일치)", () => {
    /**
     * 양도소득금액: 243,000,000 × (1 - 0.08) = 223,560,000 (LTHD 8%, 4년 × 2%)
     * 과세표준: 223,560,000 - 2,500,000 = 221,060,000 (천원 절사 적용 없음 — 이미 1000의 배수)
     * 산출세액: 221,060,000 × 38% - 19,940,000 = 84,002,800 - 19,940,000 = 64,062,800
     */
    const result = calculateTransferTax(makeC01Input(), MOCK_RATES);
    expect(result.carryoverTaxationDetail?.scenarioB.determinedTax).toBe(ENGINE_B_DETERMINED_TAX);
  });

  it("C-01-11: Scenario A(64,684,480) > Scenario B(64,062,800) → A 채택 (이월과세 적용)", () => {
    const result = calculateTransferTax(makeC01Input(), MOCK_RATES);
    const detail = result.carryoverTaxationDetail;
    expect(detail?.adoptedScenario).toBe("A");
    expect(detail?.comparisonExclusion).toBe(false);
  });

  it("C-01-12: main result가 Scenario A(채택) 값으로 promote되어야 한다", () => {
    /**
     * adoptedInput 패턴: carryoverResult.adoptedInput으로 workingInput을 교체한 후
     * STEP 2~11이 재실행되므로 main result 모든 필드가 자동으로 채택 시나리오 값을 가짐.
     * 별도 promote 코드 없이 자동으로 처리됨.
     */
    const result = calculateTransferTax(makeC01Input(), MOCK_RATES);

    // main result — 결정세액 (Scenario A와 동일해야 함)
    expect(result.determinedTax).toBe(64_684_518);

    // main result — 양도차익 (Scenario A 채택이므로 증여자 취득일 기산 환산취득가 기반)
    expect(result.transferGain).toBe(321_708_716);

    // main result — 장기보유특별공제 (Scenario A, 16년 보유 → 30%)
    expect(result.longTermHoldingDeduction).toBe(96_512_614);

    // main result — 지방소득세 (결정세액 × 10%)
    expect(result.localIncomeTax).toBe(6_468_451);

    // main result — 총 납부세액
    expect(result.totalTax).toBe(71_152_969);

    // 보유기간은 main result가 아닌 carryover 상세에 있음
    const holdingYears = result.carryoverTaxationDetail?.scenarioA.holdingPeriodYears ?? 0;
    expect(holdingYears).toBeGreaterThanOrEqual(16);
    expect(holdingYears).toBeLessThan(17);
  });

  it("C-01-13: 증여자 capex 시행시기 가드 — 양도일 2023-02-16 < 2024-01-01 → donorCapexGuardApplied=true", () => {
    const result = calculateTransferTax(makeC01Input(), MOCK_RATES);
    expect(result.carryoverTaxationDetail?.scenarioA.donorCapexGuardApplied).toBe(true);
    expect(result.carryoverTaxationDetail?.scenarioA.donorCapexAddedToExpense).toBe(0);
  });

  it("C-01-14: Scenario A LTHD 30% — 보유 16년 이상 (증여자 취득일 2006-05-21 기산) → 표1 max 30%", () => {
    /**
     * 보유기간: 2006-05-21 ~ 2023-02-16 (초일불산입: 2006-05-22 기산)
     * → 약 16년 → 표1 일반 연 2% × 16 = 32% → max 30%
     * LTHD = 321,708,716 × 30% = floor(96,512,614.8) = 96,512,614
     * 양도소득금액 = 321,708,716 - 96,512,614 = 225,196,102
     */
    const result = calculateTransferTax(makeC01Input(), MOCK_RATES);
    const detail = result.carryoverTaxationDetail?.scenarioA;
    // transferGain과 결정세액 기반으로 LTHD를 간접 검증
    expect(detail?.transferGain).toBe(EXAMPLE_A_TRANSFER_GAIN);
    expect(detail?.determinedTax).toBe(ENGINE_A_DETERMINED_TAX);
  });

  it("C-01-15: Scenario B LTHD 8% — 보유 4년 (2018-06-19 기산)", () => {
    /**
     * 보유기간: 2018-06-19 ~ 2023-02-16 → 4년 → 표1 일반 4 × 2% = 8%
     * LTHD = 243,000,000 × 8% = 19,440,000
     * 양도소득금액 = 243,000,000 - 19,440,000 = 223,560,000
     */
    const result = calculateTransferTax(makeC01Input(), MOCK_RATES);
    expect(result.carryoverTaxationDetail?.scenarioB.transferGain).toBe(EXAMPLE_B_TRANSFER_GAIN);
    expect(result.carryoverTaxationDetail?.scenarioB.determinedTax).toBe(ENGINE_B_DETERMINED_TAX);
  });

  it("C-01-16: Scenario A/B 예제 정확값과의 차이 M-5 임계값 검증", () => {
    const result = calculateTransferTax(makeC01Input(), MOCK_RATES);
    const detA = result.carryoverTaxationDetail?.scenarioA.determinedTax ?? 0;
    const detB = result.carryoverTaxationDetail?.scenarioB.determinedTax ?? 0;

    // Scenario A: ≤100원 차이 → anchor 채택
    expect(Math.abs(detA - EXAMPLE_A_DETERMINED_TAX)).toBeLessThanOrEqual(100);

    // Scenario B: 완전 일치
    expect(detB).toBe(EXAMPLE_B_DETERMINED_TAX);
  });
});
