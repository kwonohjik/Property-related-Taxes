/**
 * STEP 0.48 — 부담부증여 §159 (Phase 2/F-1/F-2) step 모듈
 *
 * transfer-tax.ts 800줄 정책 분리 (P5, 2026-06-12). 로직 무변경 이전:
 * transferType OR legacy + propertyType 4종 + overshoot fail-fast + 5-a 해석 B + 케이스 12 안내.
 */

import { buildBurdenedGiftBreakdown, assertBurdenedGiftEligible, detectBurdenedGiftMultiHouseWarning } from "./burdened-gift-apportionment";
import { BURDENED_GIFT_TRANSFER } from "./legal-codes/burdened-gift";
import type { TransferBurdenedGiftBreakdown } from "./types/transfer-burdened-gift.types";
import type { TransferTaxInput, CalculationStep } from "./types/transfer.types";

export function runBurdenedGiftStep(
  rawInput: TransferTaxInput,
  workingInputIn: TransferTaxInput,
  steps: CalculationStep[],
  warnings: string[],
): { breakdown?: TransferBurdenedGiftBreakdown; workingInput: TransferTaxInput } {
  let workingInput = workingInputIn;
  let transferBurdenedGiftBreakdown: TransferBurdenedGiftBreakdown | undefined;
  const isBurdenedGiftEngine =
    rawInput.transferType === "burdened_gift" ||
    rawInput.acquisitionCause === "burdened_gift";
  if (isBurdenedGiftEngine && rawInput.burdenedGiftInfo) {
    // Phase 2 게이트 — propertyType 허용 범위·overshoot fail-fast·고가주택 후속 PR 차단
    assertBurdenedGiftEligible({
      propertyType: workingInput.propertyType,
      isOneHousehold: workingInput.isOneHousehold,
      info: rawInput.burdenedGiftInfo,
    });
    transferBurdenedGiftBreakdown = buildBurdenedGiftBreakdown({
      landStdPriceAtTransfer: rawInput.burdenedGiftInfo.landStdPriceAtTransfer,
      buildingStdPriceAtTransfer: rawInput.burdenedGiftInfo.buildingStdPriceAtTransfer,
      landStdPriceAtAcquisition: rawInput.burdenedGiftInfo.landStdPriceAtAcquisition,
      buildingStdPriceAtAcquisition: rawInput.burdenedGiftInfo.buildingStdPriceAtAcquisition,
      info: rawInput.burdenedGiftInfo,
      giftDate: rawInput.transferDate, // Phase 2 — 증여일 = 양도일
    });
    const land = transferBurdenedGiftBreakdown.perAsset.land;
    const building = transferBurdenedGiftBreakdown.perAsset.building;
    const totalTransferPrice = land.transferPrice + building.transferPrice;
    const totalAcquisitionPrice = land.acquisitionPrice + building.acquisitionPrice;
    const totalEstimatedDeduction = land.estimatedDeduction + building.estimatedDeduction;
    // override: §159 산정값으로 본 계산 진행 (§114⑦ 환산경로와 분리).
    // F-1: burdenedGiftDenominator = giftValuation C — 12억 안분 해석 B 분모.
    workingInput = {
      ...workingInput,
      transferPrice: totalTransferPrice,
      acquisitionPrice: totalAcquisitionPrice,
      expenses: totalEstimatedDeduction,
      capitalExpenditure: undefined,
      transferExpense: undefined,
      useEstimatedAcquisition: false,
      burdenedGiftDenominator: transferBurdenedGiftBreakdown.sangjeungbeopValuation.max,
    };
    steps.push({
      label: "부담부증여 양도차익 산정 (소령 §159)",
      formula:
        `양도가 = 인수채무 ${transferBurdenedGiftBreakdown.assumedDebtAmount.toLocaleString()} ` +
        `(${transferBurdenedGiftBreakdown.sangjeungbeopValuation.selectedMode} 평가 ${transferBurdenedGiftBreakdown.sangjeungbeopValuation.max.toLocaleString()} 중 ` +
        `${(transferBurdenedGiftBreakdown.debtRatio * 100).toFixed(4)}% 안분)`,
      amount: totalTransferPrice,
      legalBasis: BURDENED_GIFT_TRANSFER.VALUATION_159,
    });
    // F-2: 케이스 12 다주택 중과 비스코프 안내 (양도자 = 증여자 → §97의2 미적용).
    const multiHouseWarning = detectBurdenedGiftMultiHouseWarning({
      propertyType: workingInput.propertyType,
      isRegulatedArea: workingInput.isRegulatedArea,
      householdHousingCount: workingInput.householdHousingCount,
    });
    if (multiHouseWarning) warnings.push(multiHouseWarning);
  }
  return { breakdown: transferBurdenedGiftBreakdown, workingInput };
}
