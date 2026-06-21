/**
 * burdened-gift-114-2-penalty.test.ts — §114조의2 부담부증여 환산 5% 가산세 anchor
 *
 * 설계: docs/00-pm/burdened-gift-114-2-penalty.plan.md + .engine.design.md
 *
 * §114의2: 신축·증축 건물을 취득(증축)일~5년 내 양도하면서 환산취득가액(또는 감정가액)을
 *   취득가액으로 한 경우 그 건물 환산취득가액 × 5% 가산세. 부담부증여 양도분(채무액분)에도 적용.
 *   - base = perAsset.building.acquisitionPrice (채무비율 안분 후 건물 환산취득가)
 *   - K-5 환산만 발동 / K-4 실지·표준(기준시가) 미발동 (§114의2① 나목 — 가목 실지 제외)
 *   - §114의2②: 양도소득 산출세액 없어도 부과
 *
 * 시나리오(housing — land=0·building 통째):
 *   marketValueAtTransfer(C)=500M, 채무 B=200M → debtRatio=0.4
 *   building 양도가(채무안분) = 200M
 *   환산취득가 = 200M × (취득기준시가 100M ÷ 양도기준시가 400M) = 50M
 *   penalty = 50M × 5% = 2,500,000
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();
const TRANSFER_DATE = new Date("2024-03-01");
const CONSTRUCTION_DATE = new Date("2021-01-01"); // 신축일 = 취득일, 양도까지 5년 이내

function k5Info(overrides: Partial<BurdenedGiftInfo> = {}): BurdenedGiftInfo {
  return {
    valuationMode: "sangjeungbeop_market",
    acquisitionMethod: "converted",
    marketValueAtTransfer: 500_000_000, // 분모 C
    lendingDepositTotal: 0,
    mortgageDebtAmount: 200_000_000, // 채무 B
    annualRentTotal: 0,
    mortgageSetAmount: 200_000_000,
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: 400_000_000,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: 100_000_000,
    ...overrides,
  };
}

function makeInput(overrides: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferDate: TRANSFER_DATE,
    acquisitionDate: CONSTRUCTION_DATE,
    transferPrice: 0,
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: false,
    transferType: "burdened_gift",
    isOneHousehold: false,
    householdHousingCount: 2,
    isSelfBuilt: true,
    buildingType: "new",
    constructionDate: CONSTRUCTION_DATE,
    burdenedGiftInfo: k5Info(),
    ...overrides,
  });
}

describe("§114조의2 부담부증여 K-5 환산 신축 가산세", () => {
  it("[P-1] K-5 환산 + 신축 5년내 → penaltyTax = 건물환산취득가 50M × 5% = 2,500,000", () => {
    const result = calculateTransferTax(makeInput(), rates);
    expect(result.transferBurdenedGiftBreakdown!.perAsset.building.acquisitionPrice).toBe(
      50_000_000,
    );
    expect(result.penaltyTax).toBe(2_500_000);
  });

  it("[P-2 회귀] 신축 아님(isSelfBuilt=false) → penaltyTax = 0", () => {
    const result = calculateTransferTax(makeInput({ isSelfBuilt: false }), rates);
    expect(result.penaltyTax).toBe(0);
  });

  it("[P-3 회귀] K-4 실지취득가액 → penaltyTax = 0 (§114의2① 나목 환산·감정만, 가목 실지 제외)", () => {
    const result = calculateTransferTax(
      makeInput({
        burdenedGiftInfo: k5Info({ acquisitionMethod: "actual", actualAcquisitionTotal: 80_000_000 }),
      }),
      rates,
    );
    expect(result.penaltyTax).toBe(0);
  });

  it("[P-4 회귀] 표준(기준시가) 모드 → penaltyTax = 0", () => {
    const result = calculateTransferTax(
      makeInput({
        burdenedGiftInfo: k5Info({
          valuationMode: "sangjeungbeop_standard",
          acquisitionMethod: undefined,
        }),
      }),
      rates,
    );
    expect(result.penaltyTax).toBe(0);
  });

  it("[P-5 §114의2②] 양도차익≤0(환산취득가>양도가)이어도 가산세 부과", () => {
    // buildingStdPriceAtAcquisition 500M > AtTransfer 400M → 환산 = 200M × 500/400 = 250M > 양도가 200M
    const result = calculateTransferTax(
      makeInput({
        burdenedGiftInfo: k5Info({ buildingStdPriceAtAcquisition: 500_000_000 }),
      }),
      rates,
    );
    // 조기반환(transferGain≤0) 경로 — 산출세액 0이어도 §114의2② 가산세 부과
    expect(result.calculatedTax).toBe(0);
    expect(result.penaltyTax).toBe(12_500_000); // 건물환산취득가 250M × 5%
  });
});
