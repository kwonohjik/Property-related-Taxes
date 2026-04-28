/**
 * 상속 부동산 취득가액 의제 — transfer-tax.ts STEP 0.45 helper
 *
 * transfer-tax.ts 800줄 정책 준수를 위해 분리.
 * 순환 의존 방지: 이 파일은 transfer-tax.ts를 import하지 않는다.
 */

import { calculateInheritanceAcquisitionPrice } from "./inheritance-acquisition-price";
import { DEEMED_ACQUISITION_DATE } from "./types/inheritance-acquisition.types";
import { calculateInheritanceHouseValuation, HOUSE_FIRST_DISCLOSURE_DATE } from "./inheritance-house-valuation";
import type { InheritanceAcquisitionInput, InheritanceAcquisitionResult } from "./types/inheritance-acquisition.types";
import type { InheritanceHouseValuationResult } from "./types/inheritance-house-valuation.types";
import type { TransferTaxInput, CalculationStep } from "./types/transfer.types";
import type { Pre1990LandValuationResult } from "./pre-1990-land-valuation";

/** STEP 0.45 실행 결과 */
export interface InheritedAcquisitionStepResult {
  updatedInput: TransferTaxInput;
  result: InheritanceAcquisitionResult;
  step: CalculationStep;
  houseValuationResult?: InheritanceHouseValuationResult;
}

/**
 * STEP 0.45: 상속 부동산 취득가액 의제 적용.
 *
 * - rawInput.inheritedAcquisition이 없으면 null 반환 (skip 신호).
 * - case A + 토지: pre1990LandResult.standardPriceAtAcquisition을
 *   standardPriceAtDeemedDate로 자동 주입 (사용자 미입력 시).
 * - case A + 주택 + 상속개시일 < 2005-04-30: inheritedHouseValuation 결과로
 *   standardPriceAtDeemedDate / standardPriceAtTransfer 자동 주입 (사용자 미입력 시).
 */
export function runInheritedAcquisitionStep(
  rawInput: TransferTaxInput,
  currentInput: TransferTaxInput,
  pre1990LandResult: Pre1990LandValuationResult | undefined,
): InheritedAcquisitionStepResult | null {
  if (!rawInput.inheritedAcquisition) return null;

  // 주택 미공시 환산이 필요하면 먼저 산출
  const houseValuationResult = resolveHouseValuation(rawInput);

  const resolvedInput = resolveInheritedAcquisitionInput(
    rawInput,
    currentInput,
    pre1990LandResult,
    houseValuationResult,
  );

  const result = calculateInheritanceAcquisitionPrice(resolvedInput);

  const updatedInput = applyResultToInput(currentInput, result, resolvedInput);

  const step: CalculationStep = {
    label: "상속 취득가액 의제",
    formula: result.formula,
    amount: result.acquisitionPrice,
    legalBasis: result.legalBasis,
  };

  return { updatedInput, result, step, houseValuationResult };
}

// ─── 내부 헬퍼 ────────────────────────────────────────────────────────────

/**
 * 주택 자산 + 상속개시일 < 2005-04-30 시 inheritedHouseValuation 자동 산출.
 * inheritedHouseValuation 입력이 없으면 null.
 */
function resolveHouseValuation(
  rawInput: TransferTaxInput,
): InheritanceHouseValuationResult | undefined {
  if (!rawInput.inheritedHouseValuation) return undefined;
  return calculateInheritanceHouseValuation(rawInput.inheritedHouseValuation);
}

function resolveInheritedAcquisitionInput(
  rawInput: TransferTaxInput,
  currentInput: TransferTaxInput,
  pre1990LandResult: Pre1990LandValuationResult | undefined,
  houseValuationResult: InheritanceHouseValuationResult | undefined,
): InheritanceAcquisitionInput {
  const base = rawInput.inheritedAcquisition!;

  const isPreDeemed =
    base.inheritanceDate.getTime() < DEEMED_ACQUISITION_DATE.getTime();

  const isHousePreDisclosure =
    base.inheritanceDate.getTime() < HOUSE_FIRST_DISCLOSURE_DATE.getTime() &&
    (base.assetKind === "house_individual" || base.assetKind === "house_apart");

  // case A + 주택 미공시: houseValuationResult로 standardPriceAtDeemedDate / standardPriceAtTransfer 주입
  const shouldInjectHouseValuation =
    houseValuationResult && isPreDeemed && isHousePreDisclosure && !base.standardPriceAtDeemedDate;

  // case A + 토지: STEP 0.4 결과 자동 주입 (사용자가 standardPriceAtDeemedDate 미입력 시, 주택 주입보다 낮은 우선순위)
  const shouldInjectPre1990 =
    !shouldInjectHouseValuation && pre1990LandResult && isPreDeemed && !base.standardPriceAtDeemedDate;

  let standardPriceAtDeemedDate = base.standardPriceAtDeemedDate;
  let standardPriceAtTransfer = base.standardPriceAtTransfer ?? currentInput.standardPriceAtTransfer;

  if (shouldInjectHouseValuation) {
    // 주택 §176조의2④ 환산취득가는 개별주택가격 단일값을 분자/분모로 사용
    // (토지+건물 합계 기준시가가 아님). 개산공제도 동일 base × 3%.
    standardPriceAtDeemedDate = houseValuationResult.housePriceAtInheritanceUsed;
    standardPriceAtTransfer =
      rawInput.inheritedHouseValuation?.housePriceAtTransfer ?? standardPriceAtTransfer;
  } else if (shouldInjectPre1990) {
    standardPriceAtDeemedDate = pre1990LandResult.standardPriceAtAcquisition;
  }

  return {
    ...base,
    standardPriceAtDeemedDate,
    standardPriceAtTransfer,
    transferDate: base.transferDate ?? rawInput.transferDate,
    transferPrice: base.transferPrice ?? rawInput.transferPrice,
  };
}

function applyResultToInput(
  currentInput: TransferTaxInput,
  result: InheritanceAcquisitionResult,
  resolvedInput: InheritanceAcquisitionInput,
): TransferTaxInput {
  const isConvertedSelected =
    result.preDeemedBreakdown?.selectedMethod === "converted";

  return {
    ...currentInput,
    acquisitionPrice: result.acquisitionPrice,
    // case A에서 환산취득가가 채택된 경우: 이후 단계의 useEstimatedAcquisition 흐름과 일치
    ...(isConvertedSelected && resolvedInput.standardPriceAtDeemedDate && {
      useEstimatedAcquisition: true,
      acquisitionMethod: "estimated" as const,
      standardPriceAtAcquisition: resolvedInput.standardPriceAtDeemedDate,
      standardPriceAtTransfer:
        resolvedInput.standardPriceAtTransfer ?? currentInput.standardPriceAtTransfer,
    }),
  };
}
