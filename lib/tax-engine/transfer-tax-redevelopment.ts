/**
 * 재개발/재건축 양도세 — transfer-tax.ts 통합 finalize
 *
 * transfer-tax.ts STEP 0.6 다음 분기에서 호출되어
 * runRedevelopment 결과를 TransferTaxResult 로 마감 (STEP 5·6·7·7.5·9·10).
 *
 * 본 분기는 일반 housing/right_to_move_in 분기를 우회한다:
 * - STEP 2 (calcTransferGain) skip — redevelopment 3분할 결과 사용
 * - STEP 3 (12억 안분) — 향후 §95③·§160 통합 (현재 사례 44 1세대1주택 아님, skip)
 * - STEP 4 (calcLongTermHoldingDeduction) skip — 분기별 LTHD 이미 산정
 * - STEP 5·6·7 통상 흐름 (기본공제·과세표준·산출세액)
 * - STEP 7.5·9·10 농특세·지방소득세·세액합계 (transfer-tax-finalize.ts 재사용)
 *
 * 사례 44 anchor:
 *   산출세액 56,799,400 / 지방소득세 5,679,940 / 세액합계 62,479,340
 */

import { runRedevelopment, isRedevelopmentActive } from "./redevelopment";
import { calcTax } from "./transfer-tax-rate-calc";
import { calcBasicDeduction } from "./transfer-tax-helpers";
import { applyRate, truncateToWon } from "./tax-utils";
import { REDEVELOPMENT, TRANSFER } from "./legal-codes";
import { resolveLTHDStartDate } from "./transfer-tax-finalize";
import type {
  TransferTaxInput,
  TransferTaxResult,
  RedevelopmentResult,
  CalculationStep,
} from "./types/transfer.types";
import type { ParsedRates } from "./transfer-tax-helpers";

// ──────────────────────────────────────────────────────────────────────────────
// 진입점 — transfer-tax.ts 에서 분기 라우팅
// ──────────────────────────────────────────────────────────────────────────────

/**
 * redevelopment 분기 활성 여부 (transfer-tax.ts 에서 분기 판정).
 * 재수출 (편의용).
 */
export { isRedevelopmentActive };

/**
 * redevelopment 분기 진입 — TransferTaxResult 까지 직접 빌드.
 *
 * @param input 원본 TransferTaxInput (workingInput, burdenedGift override 후)
 * @param parsedRates 세율 데이터
 * @param baseSteps STEP 0 ~ STEP 0.6 까지 누적된 steps (현재 사용처에서 빈 배열 또는 누적 배열 전달)
 */
export function calculateRedevelopmentTax(
  input: TransferTaxInput,
  parsedRates: ParsedRates,
  baseSteps: CalculationStep[],
): TransferTaxResult {
  const steps: CalculationStep[] = [...baseSteps];

  // ─ Step A: redevelopment orchestrator 호출 ─
  const redev: RedevelopmentResult = runRedevelopment({
    redevelopment: input.redevelopment!,
    acquisitionDate: input.acquisitionDate,
    transferDate: input.transferDate,
    transferPrice: input.transferPrice,
    actualAcquisitionPrice: input.useEstimatedAcquisition ? undefined : input.acquisitionPrice,
    useEstimatedAcquisition: input.useEstimatedAcquisition ?? false,
    isOneHouseSingle: input.isOneHousehold === true && input.householdHousingCount === 1,
    residencePeriodMonths: input.residencePeriodMonths,
    isSuccessorRightToMoveIn: input.isSuccessorRightToMoveIn,
  });

  // ─ Step B: 양도차익·LTHD steps emit (인가전 / 인가후 기존 / 청산금 3분할) ─
  emitRedevelopmentSteps(steps, redev, input.redevelopment!);

  // ─ Step C: 양도소득금액 ─
  const transferIncome = redev.total.taxableIncome;
  steps.push({
    label: "양도소득금액",
    formula: `양도차익 ${redev.total.gain.toLocaleString()} - 장기보유공제 ${redev.total.lthd.toLocaleString()}`,
    amount: transferIncome,
    legalBasis: REDEVELOPMENT.GAIN_BASE,
  });

  // ─ Step D: 기본공제 (STEP 5) ─
  const basicDeduction = calcBasicDeduction(
    transferIncome,
    redev.total.lthd,
    input.annualBasicDeductionUsed,
    input.isUnregistered ?? false,
    parsedRates.basicDeductionRules,
  );
  steps.push({
    label: "기본공제",
    formula: `연 한도 ${parsedRates.basicDeductionRules.annualLimit.toLocaleString()} - 기사용 ${input.annualBasicDeductionUsed.toLocaleString()}`,
    amount: basicDeduction,
    legalBasis: TRANSFER.BASIC_DEDUCTION,
  });

  // ─ Step E: 과세표준 (STEP 6) ─
  const taxBase = Math.max(0, transferIncome - basicDeduction);
  steps.push({
    label: "과세표준",
    formula: `양도소득금액 ${transferIncome.toLocaleString()} - 기본공제 ${basicDeduction.toLocaleString()}`,
    amount: taxBase,
    legalBasis: TRANSFER.TAX_BASE_CALC,
  });

  // ─ Step F: 산출세액 (STEP 7) — calcTax 재사용 ─
  const taxResult = calcTax(taxBase, parsedRates, input);
  const fmtPct = (r: number) => `${Math.round(r * 100)}%`;
  steps.push({
    label: "산출세액",
    formula: `과세표준 ${taxBase.toLocaleString()} × 세율 ${fmtPct(taxResult.appliedRate)}`,
    amount: taxResult.calculatedTax,
    legalBasis: TRANSFER.TAX_RATE,
  });

  // ─ Step G: 지방소득세 (10%, 원 미만 절사) ─
  const localIncomeTax = truncateToWon(applyRate(taxResult.calculatedTax, 0.1));
  if (taxResult.calculatedTax > 0) {
    steps.push({
      label: "지방소득세",
      formula: `${taxResult.calculatedTax.toLocaleString()} × 10%`,
      amount: localIncomeTax,
      legalBasis: TRANSFER.LOCAL_INCOME_TAX,
    });
  }

  // ─ Step H: 세액합계 ─
  const totalTax = taxResult.calculatedTax + localIncomeTax;
  steps.push({
    label: "세액합계",
    formula: `산출세액 ${taxResult.calculatedTax.toLocaleString()} + 지방소득세 ${localIncomeTax.toLocaleString()}`,
    amount: totalTax,
    legalBasis: REDEVELOPMENT.GAIN_BASE,
  });

  // ─ Step I: TransferTaxResult 빌드 ─
  return {
    isExempt: false,
    transferGain: redev.total.gain,
    taxableGain: redev.total.gain,
    usedEstimatedAcquisition: input.useEstimatedAcquisition ?? false,
    longTermHoldingDeduction: redev.total.lthd,
    longTermHoldingRate: 0, // 분기별 율 (3종) — redevelopmentDetail.preApproval/postApproval/settlement.lthdRate 참조
    lthdStartDate: resolveLTHDStartDate(input),
    basicDeduction,
    taxBase,
    appliedRate: taxResult.appliedRate,
    progressiveDeduction: taxResult.progressiveDeduction,
    calculatedTax: taxResult.calculatedTax,
    isSurchargeSuspended: taxResult.surchargeSuspended,
    surchargeRate: taxResult.surchargeRate,
    reductionAmount: 0,
    determinedTax: taxResult.calculatedTax,
    penaltyTax: 0,
    penaltyBase: 0,
    localIncomeTax,
    totalTax,
    steps,
    // 재개발 상세 부착
    redevelopmentDetail: redev,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 내부 헬퍼 — 3분할 양도차익·LTHD steps emit
// ──────────────────────────────────────────────────────────────────────────────

function emitRedevelopmentSteps(
  steps: CalculationStep[],
  redev: RedevelopmentResult,
  redevInfo: NonNullable<TransferTaxInput["redevelopment"]>,
): void {
  // 환산 메타 (UI 배지)
  if (redev.valuationMeta && redev.valuationMeta.method !== "actual") {
    steps.push({
      label: "환산취득가 적용",
      formula: redev.valuationMeta.rationale,
      amount: redev.preApproval.apportionedAcquisition,
      legalBasis: REDEVELOPMENT.CONVERTED_ACQ,
    });
  }

  // 분양가 (subject="apt" 만 의미)
  if (redev.salePriceTotal != null && redevInfo.subject === "apt") {
    const sign = redevInfo.settlementDirection === "pay" ? "+" : "-";
    steps.push({
      label: "분양가",
      formula: `권리가액 ${redevInfo.rightsValue.toLocaleString()} ${sign} 청산금 ${redevInfo.settlementAmount.toLocaleString()}`,
      amount: redev.salePriceTotal,
      legalBasis: REDEVELOPMENT.EVALUATION,
    });
  }

  // 인가전 분 양도차익
  steps.push({
    label: "인가전 분 양도차익",
    formula: `의제 양도가액 ${redev.preApproval.apportionedTransfer.toLocaleString()} - 취득가 ${redev.preApproval.apportionedAcquisition.toLocaleString()} - 필요경비 ${redevInfo.preApprovalExpenses.toLocaleString()}`,
    amount: redev.preApproval.gain,
    legalBasis: redevInfo.subject === "apt" ? REDEVELOPMENT.APT_PAY : REDEVELOPMENT.RIGHT_PAY,
  });

  // 인가후 기존주택분 양도차익 (apt 만)
  if (redev.postApprovalExistingHouse.gain > 0) {
    steps.push({
      label: "인가후 기존주택분 양도차익",
      formula: `안분 양도가 ${redev.postApprovalExistingHouse.apportionedTransfer.toLocaleString()} - 안분 취득가 ${redev.postApprovalExistingHouse.apportionedAcquisition.toLocaleString()}`,
      amount: redev.postApprovalExistingHouse.gain,
      legalBasis: REDEVELOPMENT.APT_PAY,
    });
  }

  // 청산금 분 양도차익
  if (redev.settlement.gain > 0) {
    steps.push({
      label: redevInfo.settlementDirection === "pay" ? "청산금 납부분 양도차익" : "청산금 수령분 양도차익",
      formula: `안분 양도가 ${redev.settlement.apportionedTransfer.toLocaleString()} - 안분 취득가 ${redev.settlement.apportionedAcquisition.toLocaleString()}`,
      amount: redev.settlement.gain,
      legalBasis: redevInfo.settlementDirection === "pay" ? REDEVELOPMENT.APT_PAY : REDEVELOPMENT.RIGHT_RECEIVE,
    });
  }

  // LTHD 3줄 (finalize emit 매칭 — FilingFormTable 3열)
  pushLthdStep(steps, "인가전 분 장기보유공제", redev.preApproval.gain, redev.preApproval.lthdRate, redev.preApproval.lthd, redev.preApproval.holdingMonths);
  pushLthdStep(steps, "인가후 기존주택분 장기보유공제", redev.postApprovalExistingHouse.gain, redev.postApprovalExistingHouse.lthdRate, redev.postApprovalExistingHouse.lthd, redev.postApprovalExistingHouse.holdingMonths);
  pushLthdStep(steps, "청산금 분 장기보유공제", redev.settlement.gain, redev.settlement.lthdRate, redev.settlement.lthd, redev.settlement.holdingMonths);
}

function pushLthdStep(
  steps: CalculationStep[],
  label: string,
  gain: number,
  rate: number,
  amount: number,
  holdingMonths: number,
): void {
  if (gain <= 0 && amount === 0) return; // 대상 부존재 분기 skip
  const years = Math.floor(holdingMonths / 12);
  const months = holdingMonths % 12;
  steps.push({
    label,
    formula: `양도차익 ${gain.toLocaleString()} × ${Math.round(rate * 100)}% (보유 ${years}년 ${months}개월, ${REDEVELOPMENT.LTHD_PERIOD})`,
    amount,
    legalBasis: REDEVELOPMENT.LTHD_PERIOD,
  });
}
