/**
 * 부담부증여 — 건물(building, 토지 외 단독) propertyType anchor 테스트 (Phase 2, 2026-05-12)
 *
 * 케이스 인벤토리 행 9 (디자인 문서: transfer-tax-burdened-gift-phase2.engine.design.md)
 *   - 케이스 9: 건물(토지 외) 부담부증여 — §159 + §95 표1
 *
 * 법령 근거:
 *   - 소득세법 시행령 §159 (부담부증여 양도차익)
 *   - 소득세법 §95 ② 표1 + §95 ④ 본문 (보유기간·장특공)
 *   - 상증법 §60~§66 (Max 평가)
 *
 * 합성 anchor — 양도연도(2024) 누진세율표 §55 자가검증.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

// ============================================================
// 케이스 9: 건물(토지 외) — 단일 기준시가 + §95 표1
// ============================================================
//
// 합성 시나리오:
//   건물(building) — 보유 10년 (2014-01-01 ~ 2024-01-01)
//   건물 양도시 기준시가 = 600,000,000
//   건물 취득시 기준시가 = 200,000,000
//   인수채무: 임대보증금 200M + 담보차입금 100M = 300,000,000
//
// Max 평가:
//   supplementary = 600,000,000 (building)
//   mortgage      = 200M + 100M = 300,000,000
//   rental        = 200M + 0 = 200,000,000
//   → max = 600,000,000 (supplementary)
//
// 채무비율 = 300M / 600M = 0.5
//
// §159 비례 안분:
//   transferPrice = 600M × 0.5 = 300,000,000
//   acquisitionPrice = 200M × 0.5 = 100,000,000
//   estimatedDeduction = 100M × 3% = 3,000,000
//
// 양도차익 = 300,000,000 - 100,000,000 - 3,000,000 = 197,000,000
//
// 장특공 표1 (보유 9년 환산, 18%):
//   197,000,000 × 0.18 = 35,460,000
//
// 양도소득금액 = 197,000,000 - 35,460,000 = 161,540,000
// 과세표준 = 161,540,000 - 2,500,000 = 159,040,000
//
// §55 2024 누진세율 자가검증:
//   150M~300M = 38% (누진공제 19,940,000)
//   159,040,000 × 0.38 - 19,940,000 = 60,435,200 - 19,940,000 = 40,495,200

describe("케이스 9 — 부담부증여 + 건물(토지 외)", () => {
  const TRANSFER_DATE = new Date("2024-01-01");
  const ACQUISITION_DATE = new Date("2014-01-01");

  const buildingBurdenedGiftInfo: BurdenedGiftInfo = {
    valuationMode: "sangjeungbeop_standard",
    lendingDepositTotal: 200_000_000,
    mortgageDebtAmount: 100_000_000,
    annualRentTotal: 0,
    // building: 토지 0, 건물 자리 사용 (api 헬퍼 분기 규칙)
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: 600_000_000,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: 200_000_000,
  };

  function makeCase9Input(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
    return baseTransferInput({
      propertyType: "building",
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
      burdenedGiftInfo: buildingBurdenedGiftInfo,
      ...overrides,
    });
  }

  it("§159 안분: transferPrice = 300,000,000 / acquisitionPrice = 100,000,000", () => {
    const result = calculateTransferTax(makeCase9Input(), rates);
    const b = result.transferBurdenedGiftBreakdown!;
    expect(b.assumedDebtAmount).toBe(300_000_000);
    expect(b.debtRatio).toBeCloseTo(0.5, 7);
    expect(b.sangjeungbeopValuation.max).toBe(600_000_000);
    expect(b.sangjeungbeopValuation.selectedMode).toBe("supplementary");
    expect(b.perAsset.building.transferPrice).toBe(300_000_000);
    expect(b.perAsset.building.acquisitionPrice).toBe(100_000_000);
    expect(b.perAsset.building.estimatedDeduction).toBe(3_000_000);
  });

  it("양도차익 = 197,000,000 / 장특공 표1 18%", () => {
    const result = calculateTransferTax(makeCase9Input(), rates);
    expect(result.transferGain).toBe(197_000_000);
    expect(result.longTermHoldingDeduction).toBe(35_460_000);
    expect(result.longTermHoldingRate).toBeCloseTo(0.18, 7);
  });

  it("§55 양도연도 누진세율 자가검증 → 산출세액 = 40,495,200", () => {
    const result = calculateTransferTax(makeCase9Input(), rates);
    // 과세표준 = (197M - 35.46M) - 2.5M = 159,040,000
    expect(result.taxBase).toBe(159_040_000);
    // §55 2024 누진세율: 150M~300M = 38% (누진공제 19,940,000)
    // 159,040,000 × 0.38 - 19,940,000 = 60,435,200 - 19,940,000 = 40,495,200
    expect(result.calculatedTax).toBe(40_495_200);
  });
});
