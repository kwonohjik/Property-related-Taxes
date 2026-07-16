/**
 * 부담부증여 — stale 취득가액 산정방식이 §159 안분 취득가액을 덮어쓰는 버그 anchor.
 *
 * 계획서: docs/02-design/features/burdened-gift-stale-acquisition-method.plan.md
 *
 * 버그: 부담부증여 UI는 「취득가액 산정 방식」을 숨기지만 **폼 상태는 보존**한다
 * (CompanionAcqPurchaseBlock.tsx:338-341 — 재토글 복원 목적, 의도된 설계).
 * 사용자가 매매사례가액·감정가액을 골랐다가 부담부증여로 전환하면 그 값이 살아남아
 * API(가드 없음) → 엔진 스텝(acquisitionMethod 미리셋) → calcTransferGain의
 * appraisal/salesCase 분기로 흘러 `similarSalesValue ?? acquisitionPrice`가
 * §159 안분 취득가액을 **덮어쓴다**(과소납부).
 *
 * `useEstimatedAcquisition: false`(burdened-gift-step.ts:79)는 **환산 분기만** 막았고
 * acquisitionMethod 기반 분기는 무방비였다.
 *
 * 픽스처는 burdened-gift-housing.test.ts 케이스 4를 재사용 — 기준선 양도차익 242,500,000 검증됨.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

const TRANSFER_DATE = new Date("2024-03-01");
const ACQUISITION_DATE = new Date("2009-03-01");

/** 케이스 4 픽스처 — §159 안분: 양도 500M / 취득 250M / 개산공제 7.5M → 양도차익 242,500,000 */
const bgInfo: BurdenedGiftInfo = {
  valuationMode: "sangjeungbeop_standard",
  lendingDepositTotal: 300_000_000,
  mortgageDebtAmount: 200_000_000,
  annualRentTotal: 0,
  landStdPriceAtTransfer: 0,
  buildingStdPriceAtTransfer: 1_000_000_000,
  landStdPriceAtAcquisition: 0,
  buildingStdPriceAtAcquisition: 500_000_000,
};

function makeInput(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferDate: TRANSFER_DATE,
    acquisitionDate: ACQUISITION_DATE,
    transferPrice: 0, // 엔진이 §159로 override
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: false,
    transferType: "burdened_gift",
    acquisitionCause: "gift",
    isOneHousehold: false,
    householdHousingCount: 2,
    burdenedGiftInfo: bgInfo,
    ...overrides,
  });
}

/** §159 안분값으로 계산한 정상 양도차익 */
const EXPECTED_GAIN = 242_500_000;

describe("부담부증여 stale 산정방식 — §159 안분 취득가액 보존", () => {
  it("케이스 1: 산정방식 미선택 → §159 안분값 정상 (회귀 방어)", () => {
    const r = calculateTransferTax(makeInput(), rates);
    expect(r.transferGain).toBe(EXPECTED_GAIN);
  });

  it("케이스 2: 🔴 stale salesCase + similarSalesValue → §159 안분값이 유지되어야 함", () => {
    const r = calculateTransferTax(
      makeInput({
        acquisitionMethod: "salesCase",
        similarSalesValue: 900_000_000,
      } as Partial<TransferTaxInput>),
      rates,
    );
    expect(
      r.transferGain,
      "매매사례가액(9억)이 §159 안분 취득가액(2.5억)을 덮어쓰면 안 됨",
    ).toBe(EXPECTED_GAIN);
  });

  it("케이스 3: 🔴 stale appraisal + appraisalValue → §159 안분값이 유지되어야 함", () => {
    const r = calculateTransferTax(
      makeInput({
        acquisitionMethod: "appraisal",
        appraisalValue: 900_000_000,
      } as Partial<TransferTaxInput>),
      rates,
    );
    expect(
      r.transferGain,
      "감정가액(9억)이 §159 안분 취득가액(2.5억)을 덮어쓰면 안 됨",
    ).toBe(EXPECTED_GAIN);
  });

  it("케이스 4: stale useEstimatedAcquisition=true → 이미 :79가 false로 리셋 (회귀 방어)", () => {
    const r = calculateTransferTax(makeInput({ useEstimatedAcquisition: true }), rates);
    expect(r.transferGain).toBe(EXPECTED_GAIN);
  });

  it("케이스 7: 부담부증여 + 토지·건물 취득일 분리 + stale salesCase → §159 안분값 유지", () => {
    // split 경로(calcSplitGain)는 calcTransferGain 내부에서 effectiveInput을 받으므로
    // 스텝의 acquisitionMethod 정규화가 split에도 함께 적용된다.
    // housing은 land=0/building 통째 구조라 landStdPriceAtAcquisition=0 → calcApportionRatio가
    // null을 반환해 split 미진입 → 비-split과 동일 결과. 그 동등성을 고정한다.
    const r = calculateTransferTax(
      makeInput({
        landAcquisitionDate: new Date("2005-06-10"),
        acquisitionMethod: "salesCase",
        similarSalesValue: 900_000_000,
      } as Partial<TransferTaxInput>),
      rates,
    );
    expect(r.transferGain, "취득일 분리 여부와 무관하게 §159 안분값이 유지되어야 함").toBe(EXPECTED_GAIN);
  });

  it("케이스 8: 과잉 수정 방어 — 일반 양도(비-부담부증여)의 salesCase는 그대로 동작", () => {
    // 부담부증여 아님 → §159 스텝 미진입 → salesCase 추계액이 정상 적용되어야 한다.
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "housing",
        transferDate: TRANSFER_DATE,
        acquisitionDate: ACQUISITION_DATE,
        transferPrice: 1_000_000_000,
        acquisitionPrice: 0,
        expenses: 0,
        useEstimatedAcquisition: false,
        isOneHousehold: false,
        householdHousingCount: 2,
        standardPriceAtAcquisition: 500_000_000,
        acquisitionMethod: "salesCase",
        similarSalesValue: 400_000_000,
      } as Partial<TransferTaxInput>),
      rates,
    );
    // 취득가액 = 매매사례가액 4억, 개산공제 = 5억 × 3% = 15,000,000
    // 양도차익 = 10억 − 4억 − 15,000,000 = 585,000,000
    expect(r.transferGain, "일반 양도의 매매사례가액 경로는 건드리면 안 됨").toBe(585_000_000);
  });
});

// ============================================================
// K-5(§114조의2 환산 신축 가산세) — stale 산정방식 교차
// 픽스처: burdened-gift-114-2-penalty.test.ts 재사용 (기대 penaltyTax = 50,000,000 × 5% = 2,500,000)
// ============================================================

const K5_TRANSFER_DATE = new Date("2024-03-01");
const K5_CONSTRUCTION_DATE = new Date("2021-01-01");

const k5Info: BurdenedGiftInfo = {
  valuationMode: "sangjeungbeop_market",
  acquisitionMethod: "converted",
  marketValueAtTransfer: 500_000_000,
  lendingDepositTotal: 0,
  mortgageDebtAmount: 200_000_000,
  annualRentTotal: 0,
  mortgageSetAmount: 200_000_000,
  landStdPriceAtTransfer: 0,
  buildingStdPriceAtTransfer: 400_000_000,
  landStdPriceAtAcquisition: 0,
  buildingStdPriceAtAcquisition: 100_000_000,
};

function makeK5Input(overrides: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferDate: K5_TRANSFER_DATE,
    acquisitionDate: K5_CONSTRUCTION_DATE,
    transferPrice: 0,
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: false,
    transferType: "burdened_gift",
    isOneHousehold: false,
    householdHousingCount: 2,
    isSelfBuilt: true,
    buildingType: "new",
    constructionDate: K5_CONSTRUCTION_DATE,
    burdenedGiftInfo: k5Info,
    ...overrides,
  });
}

describe("부담부증여 K-5 penalty — stale 산정방식 교차 (회귀 방어)", () => {
  it("케이스 5: K-5 기준선 → penaltyTax = 2,500,000 (건물 환산취득가 50M × 5%)", () => {
    const r = calculateTransferTax(makeK5Input(), rates);
    expect(r.transferBurdenedGiftBreakdown!.perAsset.building.acquisitionPrice).toBe(50_000_000);
    expect(r.penaltyTax, "acquisitionMethod:'actual' 정규화가 K-5의 'estimated' override를 덮으면 안 됨").toBe(
      2_500_000,
    );
  });

  it("케이스 5-b: K-5 + stale appraisal → penalty base가 stale 감정가액으로 오염되면 안 됨", () => {
    // 스텝의 acquisitionMethod 정규화만으로는 닫히지 않았던 구멍 — finalize.ts penaltyBase가
    // raw `input.acquisitionMethod`를 보고 있었다(실측: penaltyTax 2,500,000 → 45,000,000, 18배 과다).
    // 발동 게이트(calculateBuildingPenalty)는 effectiveInput을 읽는데 base만 raw라 층위가 어긋난 것.
    // → penaltyBase도 effectiveInput 기준으로 교체해 해소. 이 케이스가 그 회귀를 고정한다.
    const r = calculateTransferTax(
      makeK5Input({
        acquisitionMethod: "appraisal",
        appraisalValue: 900_000_000,
      } as Partial<TransferTaxInput>),
      rates,
    );
    expect(
      r.penaltyTax,
      "penalty base = K-5 건물 환산취득가(50M)여야 함 — stale 감정가액(9억) 아님",
    ).toBe(2_500_000);
  });

  it("케이스 6: 비-K5 부담부증여 + stale appraisal + 신축 → 가짜 penalty 발동 금지", () => {
    // calculateBuildingPenalty는 effectiveInput.acquisitionMethod를 보므로(rate-calc.ts:58)
    // A1이 "actual"로 정규화하면 isPenaltyMethod=false → penalty 0.
    // 종전에는 stale "appraisal"(+ 양도 ≥2020)이 살아 penalty가 잘못 발동했다.
    const r = calculateTransferTax(
      makeK5Input({
        burdenedGiftInfo: { ...k5Info, acquisitionMethod: "actual" }, // K-4 실지 → isK5SelfBuilt=false
        acquisitionMethod: "appraisal",
        appraisalValue: 900_000_000,
      } as Partial<TransferTaxInput>),
      rates,
    );
    expect(r.penaltyTax, "부담부증여 K-4인데 stale 감정가액으로 §114의2 가산세가 발동하면 안 됨").toBe(0);
  });
});
