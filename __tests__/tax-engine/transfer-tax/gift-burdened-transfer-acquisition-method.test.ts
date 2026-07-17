/**
 * gift-burdened-transfer-acquisition-method.test.ts — Pre-Do anchor
 *
 * 증여세 부담부증여 양도세 "취득가액 실지(K-4)·환산(K-5) 모드" 이식의 Pre-Do anchor.
 * 설계: docs/02-design/features/gift-burdened-transfer-acquisition-cost.engine.design.md §Anchor 기대값
 *
 * ★ Pre-Do 상태(현재 코드 = valuationMode 고정 sangjeungbeop_standard):
 *   - A-K4 / A-K5: 현재 buildGiftBurdenedTransferBody가 bgt.valuationMode·acquisitionMethod·
 *     actualAcquisitionTotal·marketValueAtTransfer·capitalExpenditure를 읽지 않으므로 **실패해야 정상**.
 *     이 실패가 "K-4/K-5 미구현" 디자인 환류 신호. Do(④ API 변환)에서 통과로 전환된다.
 *   - A-회귀: 현행 K-1~K-3(기준시가 안분) 동작 → **통과해야 정상**(회귀 가드).
 *
 * 미래 필드(BurdenedGiftTransferTaxInput에 아직 없음)는 `as EstateItem` 캐스팅으로 주입 — 타입 변경 0.
 */

import { describe, it, expect } from "vitest";
import { buildGiftBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import { buildBurdenedGiftBreakdown } from "@/lib/tax-engine/burdened-gift-apportionment";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { FormState } from "@/components/calc/gift-tax-form-shared";

// ─────────────────────────────────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

function makeForm(overrides: Partial<FormState> = {}): FormState {
  return {
    giftDate: "2024-03-01",
    donorRelation: "lineal_ascendant_adult",
    donor: "father",
    isGenerationSkip: false,
    isMinorDonee: false,
    isSubstituteGift: false,
    giftItems: [],
    stockItems: [],
    exemptionItems: [],
    priorGifts: [],
    marriageExemption: "",
    birthExemption: "",
    priorUsedDeduction: "",
    priorUsedMarriageBirthDeduction: "",
    isFiledOnTime: true,
    foreignTaxPaid: "",
    specialTreatment: "",
    startupInvestmentCompleted: false,
    startupNewHiresAtLeast10: false,
    familyBusinessYears: "",
    splitPaymentEnabled: false,
    splitPaymentAmount: "",
    ...overrides,
  } as FormState;
}

/**
 * 주택(housing) 자산 — burdenedGiftTransferTax에 미래 필드(bgtExtra)를 주입.
 * bgtExtra는 BurdenedGiftTransferTaxInput에 아직 없는 필드 → 전체 `as EstateItem` 캐스팅.
 */
function makeHousingItem(bgtExtra: Record<string, unknown> = {}): EstateItem {
  return {
    id: "apt-1",
    category: "real_estate_apartment",
    name: "테스트 아파트",
    standardPrice: 400_000_000, // 양도시 기준시가 (A-K5 분자 ÷ 분모)
    leaseDeposit: 0,
    mortgageAmount: 0,
    assumedDebtForGift: 200_000_000, // 채무액 B
    monthlyRent: 0,
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2009-06-01"),
      standardPriceAtAcquisition: 100_000_000, // 취득 기준시가
      isOneHousehold: false,
      householdHousingCount: 2,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      residencePeriodMonths: 0,
      isUnregistered: false,
      ...bgtExtra,
    },
  } as EstateItem;
}

const bgi = (body: Record<string, unknown>) =>
  body.burdenedGiftInfo as Record<string, unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// A-회귀: 기준시가 모드(현행 K-1~K-3) — 통과 기대 (회귀 가드)
// ─────────────────────────────────────────────────────────────────────────────

describe("A-회귀: 기준시가 모드 현행 동작 (K-1~K-3 회귀 가드 — 통과 기대)", () => {
  const item = makeHousingItem(); // 미래 필드 없음 = 현행
  const body = buildGiftBurdenedTransferBody(item, makeForm());

  it("burdenedGiftInfo.valuationMode === 'sangjeungbeop_standard'", () => {
    expect(bgi(body).valuationMode).toBe("sangjeungbeop_standard");
  });

  it("취득 기준시가(분자) buildingStdPriceAtAcquisition = 100M", () => {
    expect(bgi(body).buildingStdPriceAtAcquisition).toBe(100_000_000);
  });

  it("양도가액 B = 채무액 200M", () => {
    expect(body.transferPrice).toBe(200_000_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A-K4: 시가 평가 + 실지취득가액 — Pre-Do 실패 기대 (Do에서 통과 전환)
// ─────────────────────────────────────────────────────────────────────────────

describe("A-K4: 시가 평가 + 실지취득가액 안분 (Pre-Do 실패 기대)", () => {
  const item = makeHousingItem({
    valuationMode: "sangjeungbeop_market",
    acquisitionMethod: "actual",
    actualAcquisitionTotal: 200_000_000,
    marketValueAtTransfer: 500_000_000, // 분모 C
    capitalExpenditure: 5_000_000,
  });
  const body = buildGiftBurdenedTransferBody(item, makeForm());

  it("burdenedGiftInfo.valuationMode === 'sangjeungbeop_market'", () => {
    expect(bgi(body).valuationMode).toBe("sangjeungbeop_market");
  });

  it("burdenedGiftInfo.acquisitionMethod === 'actual'", () => {
    expect(bgi(body).acquisitionMethod).toBe("actual");
  });

  it("burdenedGiftInfo.actualAcquisitionTotal === 200M", () => {
    expect(bgi(body).actualAcquisitionTotal).toBe(200_000_000);
  });

  it("burdenedGiftInfo.marketValueAtTransfer === 500M (분모 C)", () => {
    expect(bgi(body).marketValueAtTransfer).toBe(500_000_000);
  });

  it("body.capitalExpenditure === 5M (burdenedGiftInfo 밖 — 최상위)", () => {
    expect(body.capitalExpenditure).toBe(5_000_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A-K5: 시가 평가 + 환산취득가액 — Pre-Do 실패 기대 (Do에서 통과 전환)
// ─────────────────────────────────────────────────────────────────────────────

describe("A-K5: 시가 평가 + 환산취득가액 (Pre-Do 실패 기대)", () => {
  const item = makeHousingItem({
    valuationMode: "sangjeungbeop_market",
    acquisitionMethod: "converted",
    marketValueAtTransfer: 500_000_000, // 분모 C
  });
  const body = buildGiftBurdenedTransferBody(item, makeForm());

  it("burdenedGiftInfo.valuationMode === 'sangjeungbeop_market'", () => {
    expect(bgi(body).valuationMode).toBe("sangjeungbeop_market");
  });

  it("burdenedGiftInfo.acquisitionMethod === 'converted'", () => {
    expect(bgi(body).acquisitionMethod).toBe("converted");
  });

  it("burdenedGiftInfo.marketValueAtTransfer === 500M (분모 C)", () => {
    expect(bgi(body).marketValueAtTransfer).toBe(500_000_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A-ENGINE: 엔진 통합 anchor — K-5 환산취득가 계산 정확성
// 설계 §Anchor 기대값: 환산취득가 50M, 개산공제 1.2M(§163⑥ 취득기준시가 base), 양도차익 148.8M
// ─────────────────────────────────────────────────────────────────────────────

describe("A-ENGINE: K-5 환산취득가 엔진 통합 anchor", () => {
  // 시나리오:
  //   - 주택(아파트), 채무인수 200M, 시가C=500M → 채무비율 0.4
  //   - 양도시 기준시가(buildingStdPriceAtTransfer) = 400M
  //   - 취득시 기준시가(buildingStdPriceAtAcquisition) = 100M
  //   - 환산취득가(전체) = 시가C × (100M/400M) = 125M
  //   - 환산취득가(안분) = 125M × 0.4 = 50M
  //   - 개산공제(§163⑥) = 취득기준시가 100M × 채무비율 0.4 × 3% = 1.2M (환산취득가 base 아님, M-4)
  //   - 양도차익 = 200M - 50M - 1.2M = 148.8M
  const breakdown = buildBurdenedGiftBreakdown({
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: 400_000_000, // 양도시 기준시가
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: 100_000_000, // 취득시 기준시가
    info: {
      valuationMode: "sangjeungbeop_market",
      acquisitionMethod: "converted",
      marketValueAtTransfer: 500_000_000, // 시가 C (분모)
      lendingDepositTotal: 0,
      mortgageDebtAmount: 200_000_000,
      annualRentTotal: 0,
      mortgageSetAmount: 200_000_000,
      donorRelation: "lineal_ascendant_adult",
      // BurdenedGiftInfo required 필드 (buildBurdenedGiftBreakdown 최상위와 동일값)
      landStdPriceAtTransfer: 0,
      buildingStdPriceAtTransfer: 400_000_000,
      landStdPriceAtAcquisition: 0,
      buildingStdPriceAtAcquisition: 100_000_000,
    },
  });

  it("acquisitionMethodUsed === 'converted'", () => {
    expect(breakdown.acquisitionMethodUsed).toBe("converted");
  });

  it("건물 환산취득가(안분 후) = 50M", () => {
    expect(breakdown.perAsset.building.acquisitionPrice).toBe(50_000_000);
  });

  it("건물 개산공제(§163⑥ 취득기준시가 base 3%) = 1.2M", () => {
    // 취득건물기준시가 100M × 채무비율 0.4 × 3% = 1,200,000 (환산취득가 50M × 3% 아님)
    expect(breakdown.perAsset.building.estimatedDeduction).toBe(1_200_000);
  });

  it("양도차익 = 148.8M", () => {
    // 양도차익 = 양도가액 − 취득가액 − 개산공제
    const gain =
      breakdown.perAsset.building.transferPrice -
      breakdown.perAsset.building.acquisitionPrice -
      breakdown.perAsset.building.estimatedDeduction;
    expect(gain).toBe(148_800_000);
  });
});
