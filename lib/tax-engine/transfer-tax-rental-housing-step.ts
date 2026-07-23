/**
 * STEP 2.5 헬퍼 — 장기임대주택 보유자 거주주택 비과세 특례 (소령 §155⑳ + §161)
 *
 * transfer-tax.ts의 800줄 제한 준수를 위해 분리. 순수 함수 (DB 호출 없음).
 *
 * applied=true 시 TransferTaxResult를 반환(호출측이 즉시 return) — STEP 3 이후를 건너뜀.
 * applied=false 시 steps에 미적용 사유만 기록하고 null 반환(호출측 일반 경로 계속).
 *
 * 법령 근거: 소득세법 시행령 §155⑳ + §161
 */

import { applyRate, calculateHoldingPeriod, truncateToWon } from "./tax-utils";
import { TRANSFER_RENTAL_HOUSING } from "./legal-codes/transfer";
import { calculateRentalHousingException } from "./transfer-tax/rental-housing-exception";
import { checkEligibility } from "./transfer-tax/rental-housing-exception/eligibility";
import type {
  TransferTaxInput,
  CalculationStep,
  TransferTaxResult,
} from "./types/transfer.types";
import type { MultiHouseSurchargeResult } from "./multi-house-surcharge";
import { calcTax } from "./transfer-tax-rate-calc";
import type { ParsedRates } from "./transfer-tax-helpers";
import { emitPenaltySteps } from "./transfer-tax-helpers";
import { resolveLTHDStartDate } from "./transfer-tax-finalize";

/**
 * §155⑳ 시나리오 B(임대→거주 전환 PHRP) 여부 — STEP 1a 전액 비과세 조기 반환 억제 게이트.
 * B는 §161①(직전거주주택 양도일 이후 기간분만 비과세) 안분이 필요하므로 일반 1세대1주택
 * 요건 충족이어도 조기 반환하면 안분 미도달 오답. A(거주주택 양도)는 eligibility 충족 시 전액 비과세가
 * 정답이므로 조기반환 가능하나, **미충족 시엔 조기반환하면 안 됨**(아래 isPrhpScenarioAIneligible).
 */
export function isPrhpScenarioB(effectiveInput: TransferTaxInput): boolean {
  return (
    effectiveInput.rentalHousingException?.applyException === true &&
    effectiveInput.rentalHousingException.scenario === "B"
  );
}

/**
 * §155⑳ 시나리오 A(거주주택 양도) + 임대주택 eligibility 미충족 여부 — STEP 1a 조기반환 억제 게이트.
 * A는 사용자가 householdHousingCount=1(임대주택 제외 전제)을 입력하면 checkExemption이 isExempt=true를
 * 내주는데, STEP 1a가 그대로 조기반환하면 STEP 2.5의 checkEligibility가 우회되어 임대 요건 미충족인데도
 * 전액 비과세되는 over-exemption 버그. 미충족 시 조기반환을 억제하면 STEP 2.5가 "적용 불가"(null)로
 * 정상 과세 경로에 넘긴다. eligible 케이스는 false 반환 → 현행 조기반환 유지(무변경).
 */
export function isPrhpScenarioAIneligible(effectiveInput: TransferTaxInput): boolean {
  const rhe = effectiveInput.rentalHousingException;
  if (rhe?.applyException !== true || rhe.scenario !== "A") return false;
  const holdYears = calculateHoldingPeriod(
    effectiveInput.acquisitionDate,
    effectiveInput.transferDate,
  ).years;
  const liveYears = Math.floor(effectiveInput.residencePeriodMonths / 12);
  // 거주주택 보유·거주 연수 = holdYears·liveYears (runRentalHousingExceptionStep와 동일 인자 관례)
  return !checkEligibility(rhe.rentalUnits, holdYears, liveYears).passed;
}

/**
 * STEP 1a 전액 비과세 조기반환 허용 여부 — §155⑳ 두 억제 게이트를 결합(orchestrator 800줄 정책).
 * B 시나리오(§161 안분 필요)·A 시나리오 eligibility 미충족(over-exemption 차단) 시 false → STEP 2.5 위임.
 */
export function canEarlyReturnPrhp(effectiveInput: TransferTaxInput): boolean {
  return !isPrhpScenarioB(effectiveInput) && !isPrhpScenarioAIneligible(effectiveInput);
}

export interface RentalHousingStepArgs {
  /** carryover 등 보정 완료된 유효 입력 */
  effectiveInput: TransferTaxInput;
  /** 원본 입력 (가산세 입력 filingPenaltyDetails/delayedPaymentDetails 참조용) */
  input: TransferTaxInput;
  /** 양도차익 (STEP 2 결과) */
  transferGain: number;
  /** 환산취득가 사용 여부 */
  usedEstimated: boolean;
  /** 환산취득가 (분리 표기용) */
  estimatedBase: number;
  /** 개산공제 (분리 표기용) */
  estimatedDeduction: number;
  parsedRates: ParsedRates;
  multiHouseSurchargeResult?: MultiHouseSurchargeResult;
  /** 계산 단계 배열 (push 부수효과) */
  steps: CalculationStep[];
}

/**
 * STEP 2.5: 장기임대주택 거주주택 비과세 특례 처리.
 * gain 계산 완료 후 호출. 호출측은 `if (effectiveInput.rentalHousingException?.applyException)` 가드 후 호출.
 */
export function runRentalHousingExceptionStep(
  args: RentalHousingStepArgs,
): TransferTaxResult | null {
  const {
    effectiveInput, input, transferGain, usedEstimated,
    estimatedBase, estimatedDeduction, parsedRates, multiHouseSurchargeResult, steps,
  } = args;

  const holdPeriod = calculateHoldingPeriod(effectiveInput.acquisitionDate, effectiveInput.transferDate);
  const holdYears = holdPeriod.years;
  const liveYears = Math.floor(effectiveInput.residencePeriodMonths / 12);
  const rhe = calculateRentalHousingException(
    effectiveInput.rentalHousingException!,
    transferGain,
    effectiveInput.transferPrice,
    holdYears,
    liveYears,
    holdYears,    // 거주주택 보유연수 (B 시나리오 시 PHRP 보유연수와 동일)
    liveYears,    // 거주주택 거주연수
  );

  // applied=false: 미적용 사유를 steps에 기록하여 결과 화면에서 노출 (침묵 실패 차단)
  if (!rhe.applied) {
    const reasons = [
      ...rhe.eligibility.residenceFailReasons,
      ...rhe.eligibility.failReasons.map((r) => r.message),
    ];
    const reasonText =
      reasons.length > 0 ? reasons.join(" · ") : "장기임대주택 거주주택 비과세 특례 요건 미충족";
    steps.push({
      label: "장기임대주택 거주주택 비과세 특례 — 적용 불가",
      formula: reasonText,
      amount: 0,
      legalBasis: TRANSFER_RENTAL_HOUSING.PIT_RD_155_20,
    });
    return null;
  }

  // ── 특례 적용: taxableGain을 특례 결과로 대체하고 최종 결과 반환 ──
  steps.push({
    label: "장기임대주택 보유자 거주주택 비과세 특례",
    formula: `§155⑳ + §161 — ${rhe.scenarioId} 시나리오 적용`,
    amount: rhe.taxableGain,
    legalBasis: TRANSFER_RENTAL_HOUSING.PIT_RD_155_20,
  });
  const rheBasicDeduction = parsedRates.basicDeductionRules.annualLimit;
  const rheTaxBase = truncateToWon(Math.max(0, rhe.taxableGain - rheBasicDeduction));
  const rheTaxResult = calcTax(rheTaxBase, parsedRates, effectiveInput, multiHouseSurchargeResult);

  // §161 비과세 양도소득금액 = §95① 양도소득금액 − 과세대상 양도소득금액.
  // 명세서 카드 "비과세 양도소득금액 (소령 §161①)" 행에서 step.formula 자동 매핑.
  const nontaxableGainAmount = Math.max(0, rhe.formulaTrace.gain95Table1 - rhe.taxableGain);
  if (nontaxableGainAmount > 0) {
    steps.push({
      label: "비과세 양도소득금액 (소령 §161①)",
      formula: `§95① 양도소득금액 ${rhe.formulaTrace.gain95Table1.toLocaleString()} − 과세대상 양도소득금액 ${rhe.taxableGain.toLocaleString()} = ${nontaxableGainAmount.toLocaleString()}`,
      amount: nontaxableGainAmount,
      legalBasis: TRANSFER_RENTAL_HOUSING.PIT_RD_155_20,
    });
  }

  // L-2 (2026-06-03): 특례 경로는 finalizeTransferTax를 거치지 않으므로
  // 신고불성실·납부지연 가산세를 emitPenaltySteps로 직접 반영 (미입력 시 no-op).
  const rheDeterminedTax = rheTaxResult.calculatedTax; // 특례 경로 감면 없음
  const rheLocalIncomeTax = applyRate(rheDeterminedTax, 0.1);
  const { penaltyDetail, filingDelayedPenalty } = emitPenaltySteps(
    input,
    steps,
    rheDeterminedTax,
    0,
    0,
    undefined,
  );

  return {
    isExempt: rhe.taxableGain === 0,
    exemptReason: rhe.taxableGain === 0 ? "장기임대주택 보유자 거주주택 비과세 (§155⑳)" : undefined,
    transferGain,
    taxableGain: rhe.taxableGain,
    usedEstimatedAcquisition: usedEstimated,
    // 환산취득가·개산공제 분리 표기를 위해 result에 명시 (FilingFormTable 환산 분기 진입 조건)
    estimatedBase: usedEstimated ? estimatedBase : undefined,
    estimatedDeduction: usedEstimated ? estimatedDeduction : undefined,
    longTermHoldingDeduction: rhe.formulaTrace.gain95Table1 > 0
      ? transferGain - rhe.formulaTrace.gain95Table1
      : 0,
    // 장기보유공제율 — 0 강제 시 결과 카드에 "0%"로 잘못 표시되므로 실제 공제율 산출
    longTermHoldingRate: transferGain > 0 && rhe.formulaTrace.gain95Table1 > 0
      ? (transferGain - rhe.formulaTrace.gain95Table1) / transferGain
      : 0,
    lthdStartDate: resolveLTHDStartDate(effectiveInput),
    nontaxableGainAmount,
    basicDeduction: rhe.taxableGain > 0 ? rheBasicDeduction : 0,
    taxBase: rheTaxBase,
    appliedRate: rheTaxResult.appliedRate,
    progressiveDeduction: rheTaxResult.progressiveDeduction,
    calculatedTax: rheTaxResult.calculatedTax,
    isSurchargeSuspended: false,
    reductionAmount: 0,
    determinedTax: rheDeterminedTax,
    penaltyTax: 0,
    penaltyBase: 0,
    localIncomeTax: rheLocalIncomeTax,
    totalTax: rheDeterminedTax + rheLocalIncomeTax + filingDelayedPenalty,
    steps,
    rentalHousingExceptionDetail: rhe,
    penaltyDetail,
  };
}
