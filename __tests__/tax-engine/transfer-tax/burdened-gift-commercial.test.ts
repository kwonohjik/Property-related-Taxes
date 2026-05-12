/**
 * 부담부증여 — 상업용건물·오피스텔(commercial_building) propertyType anchor (Phase 2, F-3, 2026-05-12)
 *
 * 케이스 인벤토리 후속:
 *   - F-3-1: 상업용건물 부담부증여 + 기준시가 모드 + §95 표1 (일반)
 *   - F-3-2: 미지원 propertyType(예: presale_right) → throw 검증
 *
 * 설계 의사결정:
 *   상업용건물의 cb* 필드(cbExclusiveArea·cbUnitPriceAtTransfer 등)는 환산취득가(useEstimatedAcquisition) 전용.
 *   부담부증여 모드에서는 사용자가 standardPriceAtTransfer / standardPriceAtAcq에 상증법 §61 평가액을 직접 입력.
 *   housing/building/commercial_building 모두 동일한 단일 가격 fallback 패턴.
 *
 * 법령 근거:
 *   - 소득세법 시행령 §159 (부담부증여 양도차익)
 *   - 소득세법 §95 ② 표1 + §95 ④ 본문 (보유기간·장특공)
 *   - 상증법 §60~§66 (Max 평가)
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

// ============================================================
// F-3-1: 상업용건물 부담부증여 + 기준시가 모드 + §95 표1
// ============================================================
//
// 합성 시나리오:
//   상업용건물(오피스텔) — 보유 12년 (2012-01-01 ~ 2024-01-01)
//   양도시 호별고시가 (단일 기준시가) = 1,000,000,000 (상증법 §61 평가)
//   취득시 호별고시가 = 400,000,000
//   인수채무: 보증금 200M + 차입금 200M = 400,000,000
//
// 평가 Max:
//   supplementary = 1,000,000,000 (commercial_building → buildingStdPrice 자리)
//   mortgage      = 200M + 200M = 400,000,000
//   rental        = 200M + 0 = 200,000,000
//   → giftValuation C = 1,000,000,000
//
// 채무비율 B/C = 400M / 1B = 0.4
//
// §159 안분:
//   transferPrice = 1B × 0.4 = 400,000,000
//   acquisitionPrice = 400M × 0.4 = 160,000,000
//   estimatedDeduction = 160M × 3% = 4,800,000
//
// transferGain = 400M - 160M - 4.8M = 235,200,000
//
// 장특공 표1 (보유 11년 환산, 22%): 235,200,000 × 0.22 = 51,744,000
// 양도소득금액 = 235,200,000 - 51,744,000 = 183,456,000
// 과세표준 = 183,456,000 - 2,500,000 = 180,956,000
//
// §55 2024 누진세율: 150M~300M = 38% (누진공제 19,940,000)
//   180,956,000 × 0.38 - 19,940,000 = 68,763,280 - 19,940,000 = 48,823,280

describe("F-3-1 — 상업용건물 부담부증여 + §95 표1", () => {
  const TRANSFER_DATE = new Date("2024-01-01");
  const ACQUISITION_DATE = new Date("2012-01-01");

  const cbBurdenedGiftInfo: BurdenedGiftInfo = {
    valuationMode: "sangjeungbeop_standard",
    lendingDepositTotal: 200_000_000,
    mortgageDebtAmount: 200_000_000,
    annualRentTotal: 0,
    // commercial_building: 단일 기준시가 — buildingStdPrice 자리에 통째
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: 1_000_000_000,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: 400_000_000,
  };

  function makeF31Input(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
    return baseTransferInput({
      propertyType: "commercial_building",
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
      burdenedGiftInfo: cbBurdenedGiftInfo,
      ...overrides,
    });
  }

  it("§159 안분: transferPrice = 400,000,000 / acquisitionPrice = 160,000,000", () => {
    const result = calculateTransferTax(makeF31Input(), rates);
    const b = result.transferBurdenedGiftBreakdown!;
    expect(b.assumedDebtAmount).toBe(400_000_000);
    expect(b.debtRatio).toBeCloseTo(0.4, 7);
    expect(b.sangjeungbeopValuation.max).toBe(1_000_000_000);
    expect(b.sangjeungbeopValuation.selectedMode).toBe("supplementary");
    expect(b.perAsset.building.transferPrice).toBe(400_000_000);
    expect(b.perAsset.building.acquisitionPrice).toBe(160_000_000);
    expect(b.perAsset.building.estimatedDeduction).toBe(4_800_000);
  });

  it("양도차익 = 235,200,000 / 장특공 표1 22%", () => {
    const result = calculateTransferTax(makeF31Input(), rates);
    expect(result.transferGain).toBe(235_200_000);
    expect(result.longTermHoldingDeduction).toBe(51_744_000);
    expect(result.longTermHoldingRate).toBeCloseTo(0.22, 7);
  });

  it("§55 양도연도 누진세율 자가검증 → 산출세액 = 48,823,280", () => {
    const result = calculateTransferTax(makeF31Input(), rates);
    // 과세표준 = (235.2M - 51.744M) - 2.5M = 180,956,000
    expect(result.taxBase).toBe(180_956_000);
    // 150M~300M = 38% (누진공제 19,940,000) → 180,956,000 × 0.38 - 19,940,000 = 48,823,280
    expect(result.calculatedTax).toBe(48_823_280);
  });

  // Phase 3 (2026-05-12): 증여세 통합 anchor
  // gratuitousPortion = 1B − 400M = 600,000,000
  // donorRelation default "lineal_descendant" 공제 50M → 과세표준 550,000,000
  // §56 5억~10억 30% (누진공제 60M): 550M × 0.3 − 60M = 165M − 60M = 105,000,000
  // §69 신고세액공제 3%: 105M × 0.03 = 3,150,000 → 결정세액 101,850,000
  it("Phase 3 증여세 통합 — gratuitousPortion 600M, finalTax 101,850,000", () => {
    const result = calculateTransferTax(makeF31Input(), rates);
    const bg = result.transferBurdenedGiftBreakdown!;
    expect(bg.gratuitousPortion).toBe(600_000_000);
    const gt = bg.giftTax!;
    expect(gt.donorRelation).toBe("lineal_descendant");
    expect(gt.grossGiftValue).toBe(600_000_000);
    expect(gt.deduction).toBe(50_000_000);
    expect(gt.taxBase).toBe(550_000_000);
    expect(gt.computedTax).toBe(105_000_000);
    expect(gt.filingCredit).toBe(3_150_000);
    expect(gt.finalTax).toBe(101_850_000);
  });
});

// ============================================================
// F-3-2: 미지원 propertyType 차단 회귀
// ============================================================

describe("F-3-2 — 미지원 propertyType (presale_right) 차단", () => {
  it("presale_right(분양권) → assertBurdenedGiftEligible throw", () => {
    const input = baseTransferInput({
      propertyType: "presale_right",
      transferDate: new Date("2024-01-01"),
      acquisitionDate: new Date("2022-01-01"),
      transferPrice: 0,
      acquisitionPrice: 0,
      expenses: 0,
      transferType: "burdened_gift",
      acquisitionCause: "purchase",
      isOneHousehold: false,
      householdHousingCount: 0,
      burdenedGiftInfo: {
        valuationMode: "sangjeungbeop_standard",
        lendingDepositTotal: 100_000_000,
        mortgageDebtAmount: 100_000_000,
        annualRentTotal: 0,
        landStdPriceAtTransfer: 0,
        buildingStdPriceAtTransfer: 500_000_000,
        landStdPriceAtAcquisition: 0,
        buildingStdPriceAtAcquisition: 300_000_000,
      },
    });
    expect(() => calculateTransferTax(input, rates)).toThrow(/주택·토지·건물·일반건물·상업용건물|미지원/);
  });
});
