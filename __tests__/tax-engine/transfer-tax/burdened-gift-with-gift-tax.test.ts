/**
 * 부담부증여 — Phase 3 증여세 통합 anchor (2026-05-12)
 *
 * 책임:
 *   - 부담부증여 양도세 결과의 `transferBurdenedGiftBreakdown.giftTax`가 채워지는지 검증
 *   - 무상이전분(C − B)에 대한 증여세 산출 — 상증법 §53(증여재산공제)·§56(세율)·§69(신고세액공제)
 *   - 관계별 공제(spouse 6억·lineal_descendant 5천만·other_relative 1천만)
 *   - 세대생략 할증(§57 30%·미성년 20억 초과 40%)
 *   - 양도세는 변동 없이 그대로 보존 — 사례 4·F-3-1 회귀 100%
 *
 * 양도자=증여자(donor), 수증자(donee) 별도 납세의무자 분리.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const rates = makeMockRates();

// ============================================================
// P3-1: 직계비속 + 신고기한 내 신고 (사례 4 기반)
// ============================================================
// 시나리오 (케이스 4 동일):
//   주택, 채무 500M, 평가 max 1B → gratuitousPortion = 500M
//   donorRelation = "lineal_descendant" (default)
//   isGenerationSkip = false, isMinorDonee = false (default)
//   isFiledOnTime = true (default)
//
// 증여세 산식 (상증법 §53·§56·§69):
//   과세표준 = 500,000,000 − 50,000,000 (직계비속 공제) = 450,000,000
//   §56 누진세율 (1억~5억 구간 20%, 누진공제 10,000,000):
//     산출세액 = 450,000,000 × 0.2 − 10,000,000 = 80,000,000
//   §69 신고세액공제 3%: 80,000,000 × 0.03 = 2,400,000
//   결정세액 = 80,000,000 − 2,400,000 = 77,600,000

describe("P3-1 — 직계비속 부담부증여 + 신고기한 내", () => {
  const TRANSFER_DATE = new Date("2024-03-01");
  const ACQUISITION_DATE = new Date("2009-03-01");

  const info: BurdenedGiftInfo = {
    valuationMode: "sangjeungbeop_standard",
    lendingDepositTotal: 300_000_000,
    mortgageDebtAmount: 200_000_000,
    annualRentTotal: 0,
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: 1_000_000_000,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: 500_000_000,
    // Phase 3 신규: 모두 default 사용 (lineal_descendant·신고기한 내)
  };

  const input = baseTransferInput({
    propertyType: "housing",
    transferDate: TRANSFER_DATE,
    acquisitionDate: ACQUISITION_DATE,
    transferPrice: 0,
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: false,
    transferType: "burdened_gift",
    acquisitionCause: "purchase",
    isOneHousehold: false,
    householdHousingCount: 0,
    burdenedGiftInfo: info,
  });

  it("gratuitousPortion = 500,000,000 (C − B)", () => {
    const result = calculateTransferTax(input, rates);
    const bg = result.transferBurdenedGiftBreakdown!;
    expect(bg.gratuitousPortion).toBe(500_000_000);
  });

  it("증여세 결과 객체 존재 + donorRelation = lineal_descendant (default)", () => {
    const result = calculateTransferTax(input, rates);
    const gt = result.transferBurdenedGiftBreakdown!.giftTax!;
    expect(gt.donorRelation).toBe("lineal_descendant");
    expect(gt.grossGiftValue).toBe(500_000_000);
  });

  it("증여재산공제 = 50,000,000 (직계비속) → 과세표준 450,000,000", () => {
    const result = calculateTransferTax(input, rates);
    const gt = result.transferBurdenedGiftBreakdown!.giftTax!;
    expect(gt.deduction).toBe(50_000_000);
    expect(gt.taxBase).toBe(450_000_000);
  });

  it("§56 누진세율 → 산출세액 80,000,000 (= 450M × 20% − 10M)", () => {
    const result = calculateTransferTax(input, rates);
    const gt = result.transferBurdenedGiftBreakdown!.giftTax!;
    expect(gt.computedTax).toBe(80_000_000);
  });

  it("§69 신고세액공제 3% = 2,400,000 → 결정세액 77,600,000", () => {
    const result = calculateTransferTax(input, rates);
    const gt = result.transferBurdenedGiftBreakdown!.giftTax!;
    expect(gt.filingCredit).toBe(2_400_000);
    expect(gt.finalTax).toBe(77_600_000);
  });

  it("양도세는 변동 없음 — 케이스 4 회귀 보존 (산출세액 45,458,000)", () => {
    const result = calculateTransferTax(input, rates);
    expect(result.calculatedTax).toBe(45_458_000);
  });
});

// ============================================================
// P3-2: 배우자 공제 6억 — 과세표준 0 (무상이전분 < 공제)
// ============================================================
// 배우자 부담부증여 + 무상이전분 500M < 공제 600M → 과세표준 0, 결정세액 0

describe("P3-2 — 배우자 부담부증여 (공제 6억으로 비과세)", () => {
  const info: BurdenedGiftInfo = {
    valuationMode: "sangjeungbeop_standard",
    lendingDepositTotal: 300_000_000,
    mortgageDebtAmount: 200_000_000,
    annualRentTotal: 0,
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: 1_000_000_000,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: 500_000_000,
    donorRelation: "spouse",
  };

  const input = baseTransferInput({
    propertyType: "housing",
    transferDate: new Date("2024-03-01"),
    acquisitionDate: new Date("2009-03-01"),
    transferPrice: 0,
    acquisitionPrice: 0,
    expenses: 0,
    transferType: "burdened_gift",
    acquisitionCause: "purchase",
    isOneHousehold: false,
    householdHousingCount: 0,
    burdenedGiftInfo: info,
  });

  it("배우자 공제 한도 6억 (가액 한도) → 적용 공제 500M, 과세표준 0", () => {
    const result = calculateTransferTax(input, rates);
    const gt = result.transferBurdenedGiftBreakdown!.giftTax!;
    expect(gt.donorRelation).toBe("spouse");
    // 상증법 §53 ① 단서: 공제 한도는 증여재산가액. 500M < 6억이므로 적용 공제 = 500M
    expect(gt.deduction).toBe(500_000_000);
    expect(gt.taxBase).toBe(0);
    expect(gt.computedTax).toBe(0);
    expect(gt.finalTax).toBe(0);
  });
});

// ============================================================
// P3-3: 기타 친족 공제 1천만 — 가장 적은 공제
// ============================================================
// other_relative + 무상이전분 500M:
//   과세표준 = 500M − 10M = 490M
//   산출세액 = 490M × 20% − 10M = 88,000,000
//   신고세액공제 = 2,640,000 → 결정세액 = 85,360,000

describe("P3-3 — 기타 친족 부담부증여", () => {
  const info: BurdenedGiftInfo = {
    valuationMode: "sangjeungbeop_standard",
    lendingDepositTotal: 300_000_000,
    mortgageDebtAmount: 200_000_000,
    annualRentTotal: 0,
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: 1_000_000_000,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: 500_000_000,
    donorRelation: "other_relative",
  };

  const input = baseTransferInput({
    propertyType: "housing",
    transferDate: new Date("2024-03-01"),
    acquisitionDate: new Date("2009-03-01"),
    transferPrice: 0,
    acquisitionPrice: 0,
    expenses: 0,
    transferType: "burdened_gift",
    acquisitionCause: "purchase",
    isOneHousehold: false,
    householdHousingCount: 0,
    burdenedGiftInfo: info,
  });

  it("기타 친족 공제 10M → 과세표준 490M / 산출세액 88M / 결정세액 85,360,000", () => {
    const result = calculateTransferTax(input, rates);
    const gt = result.transferBurdenedGiftBreakdown!.giftTax!;
    expect(gt.deduction).toBe(10_000_000);
    expect(gt.taxBase).toBe(490_000_000);
    expect(gt.computedTax).toBe(88_000_000);
    expect(gt.filingCredit).toBe(2_640_000);
    expect(gt.finalTax).toBe(85_360_000);
  });
});

// ============================================================
// P3-4: 신고기한 경과 — 신고세액공제 0 (isFiledOnTime=false)
// ============================================================
// P3-1과 동일 시나리오에서 isFiledOnTime=false → filingCredit=0, finalTax=80M

describe("P3-4 — 신고기한 경과 (§69 신고세액공제 미적용)", () => {
  const info: BurdenedGiftInfo = {
    valuationMode: "sangjeungbeop_standard",
    lendingDepositTotal: 300_000_000,
    mortgageDebtAmount: 200_000_000,
    annualRentTotal: 0,
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: 1_000_000_000,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: 500_000_000,
    isFiledOnTime: false,
  };

  const input = baseTransferInput({
    propertyType: "housing",
    transferDate: new Date("2024-03-01"),
    acquisitionDate: new Date("2009-03-01"),
    transferPrice: 0,
    acquisitionPrice: 0,
    expenses: 0,
    transferType: "burdened_gift",
    acquisitionCause: "purchase",
    isOneHousehold: false,
    householdHousingCount: 0,
    burdenedGiftInfo: info,
  });

  it("신고기한 경과 → filingCredit = 0, 결정세액 = computedTax", () => {
    const result = calculateTransferTax(input, rates);
    const gt = result.transferBurdenedGiftBreakdown!.giftTax!;
    expect(gt.filingCredit).toBe(0);
    expect(gt.finalTax).toBe(80_000_000);
  });
});

// ============================================================
// P3-5: 10년 이내 사전증여 합산 (상증법 §47②·§58 기납부세액공제)
// ============================================================
// 시나리오: P3-1과 동일 부담부증여 (gratuitousPortion 500M, 직계비속)
//   사전증여: 2년 전 200M 증여, 당시 납부 17,500,000원
//   (사전증여 200M − 직계비속 공제 50M = 과세표준 150M
//    150M × 20% − 10M = 20,000,000, 신고세액공제 2,500,000 → 17,500,000 자진납부 가정)
//
// 합산 후 누적가액 = 500M + 200M = 700M
// 누적 과세표준 = 700M − 50M (직계비속 공제, §53는 10년 합산 한도) = 650,000,000
// §56 5억~10억 30% (누진공제 60M): 650M × 0.3 − 60M = 195M − 60M = 135,000,000
// §58 기납부세액공제: 17,500,000 (사전증여세액 안분, 한도 = 안분 계산 결과)
// 신고세액공제 3%: (135M − 17.5M) × 0.03 = 117,500,000 × 0.03 = 3,525,000
// 결정세액 = 135M − 17,500,000 − 3,525,000 = 113,975,000
// (정확값은 엔진이 §58 안분 한도 계산 후 산정 — 본 anchor는 priorGifts 전달 자체 검증)

describe("P3-5 — 10년 이내 사전증여 합산 (§47②·§58)", () => {
  const info: BurdenedGiftInfo = {
    valuationMode: "sangjeungbeop_standard",
    lendingDepositTotal: 300_000_000,
    mortgageDebtAmount: 200_000_000,
    annualRentTotal: 0,
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: 1_000_000_000,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: 500_000_000,
    donorRelation: "lineal_descendant",
    priorGiftsWithin10Years: [
      {
        giftDate: "2022-03-01", // 2년 전
        giftAmount: 200_000_000,
        giftTaxPaid: 17_500_000,
      },
    ],
  };

  const input = baseTransferInput({
    propertyType: "housing",
    transferDate: new Date("2024-03-01"),
    acquisitionDate: new Date("2009-03-01"),
    transferPrice: 0,
    acquisitionPrice: 0,
    expenses: 0,
    transferType: "burdened_gift",
    acquisitionCause: "purchase",
    isOneHousehold: false,
    householdHousingCount: 0,
    burdenedGiftInfo: info,
  });

  it("사전증여 200M 합산 → grossGiftValue (당기) = 500M, taxBase = 650M", () => {
    const result = calculateTransferTax(input, rates);
    const gt = result.transferBurdenedGiftBreakdown!.giftTax!;
    // 당기 증여재산가액 (Phase 3 grossGiftValue는 당기만, 합산은 taxBase에서)
    expect(gt.grossGiftValue).toBe(500_000_000);
    // 누적 과세표준 = (500M + 200M) − 50M = 650M
    expect(gt.taxBase).toBe(650_000_000);
  });

  it("합산 후 산출세액 (650M × 30% − 60M) = 135,000,000", () => {
    const result = calculateTransferTax(input, rates);
    const gt = result.transferBurdenedGiftBreakdown!.giftTax!;
    expect(gt.computedTax).toBe(135_000_000);
  });

  it("§58 기납부세액공제 적용 후 결정세액 — 사전증여 미합산 케이스(P3-1 finalTax 77.6M)보다 증가", () => {
    const result = calculateTransferTax(input, rates);
    const gt = result.transferBurdenedGiftBreakdown!.giftTax!;
    // 합산으로 누진세율 상승 → 결정세액은 P3-1(77,600,000)보다 큼
    expect(gt.finalTax).toBeGreaterThan(77_600_000);
    // 양도세는 변동 없음 (사전증여는 증여세에만 영향)
    expect(result.calculatedTax).toBe(45_458_000);
  });
});
