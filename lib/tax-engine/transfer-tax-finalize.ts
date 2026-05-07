/**
 * 양도소득세 — 산출세액 이후 단계 통합 (Finalize 모듈)
 *
 * STEP 7.5 §99의3 농어촌특별세 → STEP 8 감면세액 → STEP 9 결정세액 →
 * STEP 10.5 §114조의2 가산세 → STEP 10 지방소득세 → STEP 12 신고불성실·납부지연 →
 * STEP 11 총 납부세액
 *
 * 산출세액(`taxResult.calculatedTax`) 이후의 finalize 단계를 단일 함수로 묶어
 * `transfer-tax.ts` 800줄 정책 내 여유 확보.
 *
 * 부수효과: `steps` 배열에 9~12개 step push (가산세 합계·sub 항목 포함).
 */

import { applyRate, truncateToWon } from "./tax-utils";
import { TRANSFER } from "./legal-codes";
import { calculateBuildingPenalty, calcTax, calcReductions } from "./transfer-tax-rate-calc";
import {
  emitPenaltySteps,
  getReductionLegalBasis,
  type ParsedRates,
} from "./transfer-tax-helpers";
import type {
  TransferTaxInput,
  CalculationStep,
  TransferTaxResult,
} from "./types/transfer.types";
import type { New993Result } from "./transfer-reductions/new-99-3";
import type { MultiHouseSurchargeResult } from "./multi-house-surcharge";
import type { TransferTaxPenaltyResult } from "./transfer-tax-penalty";

export interface FinalizeArgs {
  input: TransferTaxInput;
  effectiveInput: TransferTaxInput;
  steps: CalculationStep[];
  taxResult: ReturnType<typeof calcTax>;
  taxRateInput: TransferTaxInput;
  parsedRates: ParsedRates;
  multiHouseSurchargeResult?: MultiHouseSurchargeResult;
  taxableGain: number;
  longTermHoldingDeduction: number;
  basicDeduction: number;
  taxBase: number;
  estimatedBase?: number;
  /** §99의3 감면 전 양도소득금액 (산출세액 차감 비교 기준) */
  transferIncomeBefore993: number;
  new993PreliminaryResult?: New993Result;
}

export interface FinalizeResult {
  // 농특세
  new993FinalResult?: New993Result;
  ruralSurtax993: number;
  // 감면 (calcReductions return의 fan-out)
  reductionAmount: number;
  reductionType: ReturnType<typeof calcReductions>["reductionType"];
  reductionTypeApplied: ReturnType<typeof calcReductions>["reductionTypeApplied"];
  reducibleIncome?: number;
  rentalReductionDetail: TransferTaxResult["rentalReductionDetail"];
  newHousingReductionDetail: TransferTaxResult["newHousingReductionDetail"];
  publicExpropriationDetail: TransferTaxResult["publicExpropriationDetail"];
  selfFarmingReductionDetail: TransferTaxResult["selfFarmingReductionDetail"];
  // 결정세액·가산세
  determinedTax: number;
  penaltyTax: number;
  penaltyBase: number;
  determinedTaxWithPenalty: number;
  // 지방소득세
  localIncomeTax: number;
  // STEP 12 가산세
  penaltyDetail?: TransferTaxPenaltyResult;
  filingDelayedPenalty: number;
  totalAllPenalty: number;
  // 총 납부세액
  totalTax: number;
}

/**
 * STEP 7.5 ~ STEP 11/12 통합 finalize.
 */
export function finalizeTransferTax(args: FinalizeArgs): FinalizeResult {
  const {
    input, effectiveInput, steps, taxResult, taxRateInput, parsedRates,
    multiHouseSurchargeResult, taxableGain, longTermHoldingDeduction,
    basicDeduction, taxBase, estimatedBase,
    transferIncomeBefore993, new993PreliminaryResult,
  } = args;

  // ── STEP 7.5: §99의3 농어촌특별세 ──
  let new993FinalResult: New993Result | undefined = new993PreliminaryResult;
  let ruralSurtax993 = 0;
  if (new993PreliminaryResult?.isEligible) {
    const taxBaseBefore993 = Math.max(0, transferIncomeBefore993 - basicDeduction);
    const taxResultBefore993 = calcTax(taxBaseBefore993, parsedRates, taxRateInput, multiHouseSurchargeResult);
    const taxReduction993 = Math.max(0, taxResultBefore993.calculatedTax - taxResult.calculatedTax);
    ruralSurtax993 = applyRate(taxReduction993, 0.2);
    new993FinalResult = {
      ...new993PreliminaryResult,
      taxReductionForRuralSurtax: taxReduction993,
      ruralSurtax: ruralSurtax993,
    };
    if (taxReduction993 > 0) {
      steps.push({
        label: "§99의3 농어촌특별세 (감면세액 × 20%)",
        formula: `(감면 전 산출세액 ${taxResultBefore993.calculatedTax.toLocaleString()} − 감면 후 산출세액 ${taxResult.calculatedTax.toLocaleString()}) × 20% = ${ruralSurtax993.toLocaleString()}`,
        amount: ruralSurtax993,
        legalBasis: "농특세법 §3·§5",
      });
    }
  }

  // ── STEP 8: 감면세액 ──
  const {
    reductionAmount,
    reductionType,
    reductionTypeApplied,
    reducibleIncome,
    rentalReductionDetail,
    newHousingReductionDetail,
    publicExpropriationDetail,
    selfFarmingReductionDetail,
  } = calcReductions(
    taxResult.calculatedTax,
    input.reductions,
    parsedRates.selfFarmingRules,
    input.rentalReductionDetails,
    parsedRates.longTermRentalRules,
    input.newHousingDetails,
    parsedRates.newHousingMatrix,
    input.transferDate,
    // 양도소득금액 = 과세양도차익 − 장기보유특별공제 (§77 감면 소득 안분 기준)
    Math.max(0, taxableGain - longTermHoldingDeduction),
    basicDeduction,
    taxBase,
    input.acquisitionDate,
    input.standardPriceAtAcquisition,
    input.standardPriceAtTransfer,
  );
  steps.push({
    label: "감면세액",
    formula: reductionType ? `${reductionType} 감면 ${reductionAmount.toLocaleString()}` : "감면 없음",
    amount: reductionAmount,
    legalBasis: getReductionLegalBasis(reductionType, publicExpropriationDetail?.useLegacyRates),
  });

  // ── STEP 9: 결정세액 = 산출세액 - 감면 (원 미만 절사) ──
  const determinedTax = truncateToWon(Math.max(0, taxResult.calculatedTax - reductionAmount));
  steps.push({
    label: "결정세액",
    formula: `산출세액 ${taxResult.calculatedTax.toLocaleString()} - 감면 ${reductionAmount.toLocaleString()} (원 미만 절사)`,
    amount: determinedTax,
    legalBasis: TRANSFER.FINAL_TAX,
  });

  // ── STEP 10.5: §114조의2 신축·증축 가산세 (step은 STEP 12에서 통합 emit) ──
  const penaltyBase = input.acquisitionMethod === "appraisal"
    ? (input.appraisalValue ?? 0)
    : (input.useEstimatedAcquisition ? (estimatedBase ?? 0) : 0);
  const penaltyResult = calculateBuildingPenalty(effectiveInput, penaltyBase);
  const penaltyTax = penaltyResult?.penalty ?? 0;
  const determinedTaxWithPenalty = determinedTax + penaltyTax;

  // ── STEP 10: 지방소득세 (총결정세액 × 10%, 원 미만 절사) ──
  const localIncomeTax = applyRate(determinedTaxWithPenalty, 0.1);
  steps.push({
    label: "지방소득세",
    formula: `${determinedTaxWithPenalty.toLocaleString()} × 10%`,
    amount: localIncomeTax,
    legalBasis: TRANSFER.LOCAL_INCOME_TAX,
  });

  // ── STEP 12: 신고불성실·납부지연 가산세 ──
  const { penaltyDetail, filingDelayedPenalty, totalAllPenalty } = emitPenaltySteps(
    input,
    steps,
    determinedTax,
    penaltyTax,
    penaltyBase,
    penaltyResult?.note,
  );

  // ── STEP 11: 총 납부세액 ──
  const totalTax = determinedTaxWithPenalty + localIncomeTax + filingDelayedPenalty + ruralSurtax993;
  steps.push({
    label: "총 납부세액",
    formula: `${totalAllPenalty > 0 ? "총결정세액" : "결정세액"} ${(determinedTax + totalAllPenalty).toLocaleString()} + 지방소득세 ${localIncomeTax.toLocaleString()}${ruralSurtax993 > 0 ? ` + 농특세 ${ruralSurtax993.toLocaleString()}` : ""}`,
    amount: totalTax,
    legalBasis: `${TRANSFER.FINAL_TAX} + ${TRANSFER.LOCAL_INCOME_TAX}`,
  });

  return {
    new993FinalResult,
    ruralSurtax993,
    reductionAmount,
    reductionType,
    reductionTypeApplied,
    reducibleIncome,
    rentalReductionDetail,
    newHousingReductionDetail,
    publicExpropriationDetail,
    selfFarmingReductionDetail,
    determinedTax,
    penaltyTax,
    penaltyBase,
    determinedTaxWithPenalty,
    localIncomeTax,
    penaltyDetail,
    filingDelayedPenalty,
    totalAllPenalty,
    totalTax,
  };
}
