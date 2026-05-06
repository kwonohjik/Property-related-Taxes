/**
 * STEP 2.5 헬퍼 — 장기임대주택 보유자 거주주택 비과세 특례 결과 조립
 *
 * transfer-tax.ts의 800줄 제한 준수를 위해 분리.
 * 순수 함수: DB 호출 없음, 매개변수로만 의존.
 *
 * 법령 근거: 소득세법 시행령 §155⑳ + §161
 */

import {
  applyRate,
} from "./tax-utils";
import { TRANSFER_RENTAL_HOUSING } from "./legal-codes/transfer";
import {
  calculateRentalHousingException,
  type RentalHousingExceptionResult,
} from "./transfer-tax/rental-housing-exception";
import type {
  TransferTaxInput,
  CalculationStep,
  TransferTaxResult,
} from "./types/transfer.types";
import type { MultiHouseSurchargeResult } from "./multi-house-surcharge";
import { calcTax } from "./transfer-tax-rate-calc";
import type { ParsedRates } from "./transfer-tax-helpers";
import { calculateHoldingPeriod } from "./tax-utils";

// ============================================================
// STEP 2.5 — 특례 호출 + 결과 조립
// ============================================================

export type RentalHousingStepResult =
  | { applied: false; detail: RentalHousingExceptionResult }
  | { applied: true; detail: RentalHousingExceptionResult; result: TransferTaxResult };

/**
 * STEP 2.5: 장기임대주택 거주주택 비과세 특례 처리
 *
 * gain 계산 완료 후 호출. applied=true 시 caller가 즉시 result를 반환해야 함.
 *
 * @param effectiveInput 유효 입력 (carryover 등 보정 완료된 값)
 * @param transferGain 양도차익 (STEP 2 결과)
 * @param parsedRates 파싱된 세율
 * @param multiHouseSurchargeResult 다주택 중과세 판정 결과
 * @param steps 계산 단계 배열 (push용)
 * @param usedEstimated 환산취득가 사용 여부
 */
export function applyRentalHousingExceptionStep(
  effectiveInput: TransferTaxInput,
  transferGain: number,
  parsedRates: ParsedRates,
  multiHouseSurchargeResult: MultiHouseSurchargeResult | null,
  steps: CalculationStep[],
  usedEstimated: boolean,
): RentalHousingStepResult {
  const rhe = effectiveInput.rentalHousingException!;
  const holdPeriod = calculateHoldingPeriod(
    effectiveInput.acquisitionDate,
    effectiveInput.transferDate,
  );
  const holdYears = holdPeriod.years;
  const liveYears = Math.floor(effectiveInput.residencePeriodMonths / 12);

  const detail = calculateRentalHousingException(
    rhe,
    transferGain,
    effectiveInput.transferPrice,
    holdYears,
    liveYears,
    holdYears,   // 거주주택 보유연수 (PHRP 보유연수와 동일)
    liveYears,   // 거주주택 거주연수
  );

  if (!detail.applied) {
    return { applied: false, detail };
  }

  // ── 특례 적용: 결과 조립 ───────────────────────────────────
  steps.push({
    label: "장기임대주택 보유자 거주주택 비과세 특례",
    formula: `소령 §155⑳ + §161 — ${detail.scenarioId} 시나리오`,
    amount: detail.taxableGain,
    legalBasis: TRANSFER_RENTAL_HOUSING.PIT_RD_155_20,
  });

  const BASIC_DEDUCTION = 2_500_000;
  const hasGain = detail.taxableGain > 0;
  const basicDeduction = hasGain ? BASIC_DEDUCTION : 0;

  // 과세표준 = 과세 양도소득금액 − 기본공제 (천원 절사)
  const taxBase = hasGain
    ? Math.floor(Math.max(0, detail.taxableGain - basicDeduction) / 1000) * 1000
    : 0;

  const taxResult = calcTax(taxBase, parsedRates, effectiveInput, multiHouseSurchargeResult ?? undefined);

  // 장기보유공제액 역산 (표1 기준)
  const ltcDeduction = detail.formulaTrace.gain95Table1 > 0
    ? Math.max(0, transferGain - detail.formulaTrace.gain95Table1)
    : 0;
  const ltcRate = transferGain > 0 ? ltcDeduction / transferGain : 0;

  const localIncomeTax = applyRate(taxResult.calculatedTax, 0.1);

  const result: TransferTaxResult = {
    isExempt: detail.taxableGain === 0,
    exemptReason: detail.taxableGain === 0
      ? "장기임대주택 보유자 거주주택 비과세 (소령 §155⑳)"
      : undefined,
    transferGain,
    taxableGain: detail.taxableGain,
    usedEstimatedAcquisition: usedEstimated,
    longTermHoldingDeduction: ltcDeduction,
    longTermHoldingRate: ltcRate,
    basicDeduction,
    taxBase,
    appliedRate: taxResult.appliedRate,
    progressiveDeduction: taxResult.progressiveDeduction,
    calculatedTax: taxResult.calculatedTax,
    isSurchargeSuspended: false,
    reductionAmount: 0,
    determinedTax: taxResult.calculatedTax,
    penaltyTax: 0,
    localIncomeTax,
    totalTax: taxResult.calculatedTax + localIncomeTax,
    steps,
    rentalHousingExceptionDetail: detail,
  };

  return { applied: true, detail, result };
}
