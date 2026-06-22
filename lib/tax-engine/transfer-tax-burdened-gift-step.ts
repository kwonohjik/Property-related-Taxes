/**
 * STEP 0.48 — 부담부증여 §159 (Phase 2/F-1/F-2) step 모듈
 *
 * transfer-tax.ts 800줄 정책 분리 (P5, 2026-06-12). 로직 무변경 이전:
 * transferType OR legacy + propertyType 4종 + overshoot fail-fast + 5-a 해석 B + 케이스 12 안내.
 */

import { buildBurdenedGiftBreakdown, assertBurdenedGiftEligible, detectBurdenedGiftMultiHouseWarning } from "./burdened-gift-apportionment";
import { calculateEstimatedAcquisitionPrice } from "./tax-utils";
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
      // K-4(실지취득가) 실비: 채무비율 안분 후 estimatedDeduction 슬롯에 반영
      // (workingInput.capitalExpenditure는 중복 방지 위해 undefined 유지).
      capitalExpenditure: rawInput.capitalExpenditure,
      transferExpense: rawInput.transferExpense,
    });
    const land = transferBurdenedGiftBreakdown.perAsset.land;
    const building = transferBurdenedGiftBreakdown.perAsset.building;
    const totalTransferPrice = land.transferPrice + building.transferPrice;
    const totalAcquisitionPrice = land.acquisitionPrice + building.acquisitionPrice;
    const totalEstimatedDeduction = land.estimatedDeduction + building.estimatedDeduction;
    // override: §159 산정값으로 본 계산 진행 (§114⑦ 환산경로와 분리).
    // F-1: burdenedGiftDenominator = giftValuation C — 12억 안분 해석 B 분모.
    // §114조의2: K-5(환산취득가) + 신축·증축 시 건물분 환산취득가(채무비율 안분 후)를
    // penalty base로 신호. estimatedBase·usedEstimatedAcquisition은 finalize STEP 10.5가
    // 읽는 penalty 전용 신호이며, 본 양도차익은 위 §159 안분값(useEstimatedAcquisition:false)으로 계산.
    // 발동 게이트(5년·85㎡·acquisitionMethod=estimated)는 calculateBuildingPenalty가 최종 판정.
    const isK5SelfBuilt =
      rawInput.burdenedGiftInfo.acquisitionMethod === "converted" &&
      rawInput.isSelfBuilt === true;
    // §114조의2① 증축: penalty base를 증축부분 한정 환산취득가로 교체 (건물 전체 base 과대부과 방지).
    // 증축부분 환산취득가 = 채무안분 건물양도가 × (증축부분 취득기준시가 ÷ 양도시 건물 기준시가).
    // 기존 환산취득가 헬퍼 재사용(single-source) — 통상 양도 경로와 동일 산식.
    const extensionPenaltyBase =
      isK5SelfBuilt &&
      rawInput.buildingType === "extension" &&
      (rawInput.extensionStdPriceAtAcquisition ?? 0) > 0 &&
      rawInput.burdenedGiftInfo.buildingStdPriceAtTransfer > 0
        ? calculateEstimatedAcquisitionPrice(
            building.transferPrice,
            rawInput.extensionStdPriceAtAcquisition!,
            rawInput.burdenedGiftInfo.buildingStdPriceAtTransfer,
          )
        : undefined;
    workingInput = {
      ...workingInput,
      transferPrice: totalTransferPrice,
      acquisitionPrice: totalAcquisitionPrice,
      expenses: totalEstimatedDeduction,
      capitalExpenditure: undefined,
      transferExpense: undefined,
      useEstimatedAcquisition: false,
      burdenedGiftDenominator: transferBurdenedGiftBreakdown.sangjeungbeopValuation.max,
      ...(isK5SelfBuilt
        ? {
            acquisitionMethod: "estimated" as const,
            usedEstimatedAcquisition: true,
            // 증축: 증축부분 한정 base / 신축: 건물 전체 환산취득가 (기존 동작)
            estimatedBase: extensionPenaltyBase ?? building.acquisitionPrice,
            // 85㎡ 게이트(rate-calc)가 읽는 신호 — spread 의존 제거용 명시 전달(안전 강화)
            buildingType: rawInput.buildingType,
            extensionFloorArea: rawInput.extensionFloorArea,
          }
        : {}),
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
