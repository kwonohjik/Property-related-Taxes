/**
 * 재개발/재건축 양도세 — transfer-tax.ts 통합 finalize
 *
 * transfer-tax.ts STEP 0.6 다음 분기에서 호출되어
 * runRedevelopment 결과를 TransferTaxResult 로 마감 (STEP 5·6·7·7.5·9·10).
 *
 * 본 분기는 일반 housing/right_to_move_in 분기를 우회한다:
 * - STEP 2 (calcTransferGain) skip — redevelopment 3분할 결과 사용
 * - STEP 3 (12억 안분) — §95③·시행령 §160 활성화 (사례 45 1세대1주택 + 12억 초과)
 * - STEP 4 (calcLongTermHoldingDeduction) skip — 분기별 LTHD 이미 산정
 * - STEP 5·6·7 통상 흐름 (기본공제·과세표준·산출세액)
 * - STEP 7.5·9·10 농특세·지방소득세·세액합계 (transfer-tax-finalize.ts 재사용)
 *
 * 사례 44 anchor (1세대1주택 X — STEP 3 미발동):
 *   산출세액 56,799,400 / 지방소득세 5,679,940 / 세액합계 62,479,340
 *
 * 사례 45 anchor (1세대1주택 + 양도가 15억 + 12억 초과):
 *   산출세액 11,311,376 / 지방소득세 1,131,137 / 세액합계 12,442,514
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
const HIGH_VALUE_THRESHOLD = 1_200_000_000;

export function calculateRedevelopmentTax(
  input: TransferTaxInput,
  parsedRates: ParsedRates,
  baseSteps: CalculationStep[],
): TransferTaxResult {
  const steps: CalculationStep[] = [...baseSteps];
  const isOneHouseSingle = input.isOneHousehold === true && input.householdHousingCount === 1;

  // ─ Step A: redevelopment orchestrator 호출 ─
  const redevRaw: RedevelopmentResult = runRedevelopment({
    redevelopment: input.redevelopment!,
    acquisitionDate: input.acquisitionDate,
    transferDate: input.transferDate,
    transferPrice: input.transferPrice,
    actualAcquisitionPrice: input.useEstimatedAcquisition ? undefined : input.acquisitionPrice,
    useEstimatedAcquisition: input.useEstimatedAcquisition ?? false,
    isOneHouseSingle,
    residencePeriodMonths: input.residencePeriodMonths,
    priorHouseResidenceMonths: input.redevelopment!.priorHouseResidenceMonths,
    newHouseResidenceMonths: input.redevelopment!.newHouseResidenceMonths,
    isSuccessorRightToMoveIn: input.isSuccessorRightToMoveIn,
  });

  // ─ Step A.5: STEP 3 (12억 안분) — §95③·시행령 §160 ─
  // 1세대1주택 + 양도가액 > 12억 시: 분기별 양도차익·LTHD 를 taxableRatio 비례 축소.
  // 그 외: redevRaw.total 그대로 사용 (사례 44 회귀 0).
  const isHighValue = isOneHouseSingle && input.transferPrice > HIGH_VALUE_THRESHOLD;
  const redev: RedevelopmentResult = isHighValue
    ? applyHighValueAllocation(redevRaw, input.transferPrice, input.redevelopment!)
    : redevRaw;

  if (isHighValue && redev.highValueAllocation) {
    const ha = redev.highValueAllocation;
    steps.push({
      label: "1세대1주택 12억 초과 과세대상 양도차익 안분",
      formula: `전체 양도차익 ${redevRaw.total.gain.toLocaleString()} × (양도가액 ${input.transferPrice.toLocaleString()} - 12억) / 양도가액 = ${ha.taxableGain.toLocaleString()} (비과세분 ${ha.nontaxableGain.toLocaleString()})`,
      amount: ha.taxableGain,
      legalBasis: REDEVELOPMENT.REDEV_HIGH_VALUE_ALLOCATION,
    });
  }

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
  // calcBasicDeduction(taxableGain, lth) 시그니처: afterLTH = taxableGain - lth.
  // redev.total.gain 을 첫 인자로 전달 (taxableIncome 은 이미 lthd 차감 후 — 이중 차감 방지).
  const basicDeduction = calcBasicDeduction(
    redev.total.gain,
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
// 내부 헬퍼 — STEP 3 (12억 안분) §95③·시행령 §160
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 1세대1주택 + 양도가액 > 12억 시 분기별 양도차익·LTHD 를 과세대상으로 축소.
 *
 * 산식 (시행령 §160):
 *   taxableRatio  = (transferPrice − 12억) / transferPrice
 *   branchTaxableGain = floor(branchGain × taxableRatio)
 *   branchTaxableLthd = floor(branchTaxableGain × branchRate)
 *
 * 분기별로 floor 적용 — 양도코리아 xlsx 결과 일치 (xlsx D17·E17·F17 각각 분기별 산정 후 합산).
 *
 * @param redevRaw runRedevelopment 결과 (분기별 gain·lthd 가 전체 양도차익 기준)
 * @param transferPrice 양도가액 (양도가액 - 12억 비율 산정용)
 * @param redevInfo 입력 redevelopment (lthdResidenceAttribution 부착용)
 */
function applyHighValueAllocation(
  redevRaw: RedevelopmentResult,
  transferPrice: number,
  redevInfo: NonNullable<TransferTaxInput["redevelopment"]>,
): RedevelopmentResult {
  const taxableRatio = (transferPrice - HIGH_VALUE_THRESHOLD) / transferPrice;
  const nontaxableThreshold = HIGH_VALUE_THRESHOLD;

  // 분기별 과세대상 양도차익·LTHD 산정 (정수연산 — 분기별 floor)
  const scaleBranch = (branch: RedevelopmentResult["preApproval"]) => {
    if (branch.gain <= 0) {
      return { ...branch, gainBeforeAllocation: branch.gain, nontaxableGain: 0 };
    }
    const originalGain = branch.gain;
    const taxableGain = Math.floor(originalGain * taxableRatio);
    const nontaxableGain = originalGain - taxableGain; // 정수연산 보존: 비과세 = 안분 전 - 과세대상
    const taxableLthd = branch.lthdRate > 0 ? Math.floor(taxableGain * branch.lthdRate) : 0;
    // 12억 안분 후 보유분/거주분 비율은 lthdHoldingPart/lthd 비율로 보존
    const hasSplit = branch.lthdHoldingPart !== undefined || branch.lthdResidencePart !== undefined;
    let taxableHoldingPart: number | undefined;
    let taxableResidencePart: number | undefined;
    if (hasSplit && taxableLthd > 0) {
      const holdingFraction = branch.lthd > 0 ? (branch.lthdHoldingPart ?? 0) / branch.lthd : 1;
      taxableHoldingPart = Math.floor(taxableLthd * holdingFraction);
      taxableResidencePart = taxableLthd - taxableHoldingPart;
    } else if (hasSplit) {
      taxableHoldingPart = 0;
      taxableResidencePart = 0;
    }
    return {
      ...branch,
      gain: taxableGain,
      lthd: taxableLthd,
      gainBeforeAllocation: originalGain,
      nontaxableGain,
      ...(hasSplit ? { lthdHoldingPart: taxableHoldingPart, lthdResidencePart: taxableResidencePart } : {}),
    };
  };

  const preApproval = scaleBranch(redevRaw.preApproval);
  const postApprovalExistingHouse = scaleBranch(redevRaw.postApprovalExistingHouse);
  const settlement = scaleBranch(redevRaw.settlement);

  const totalGain = preApproval.gain + postApprovalExistingHouse.gain + settlement.gain;
  const totalLthd = preApproval.lthd + postApprovalExistingHouse.lthd + settlement.lthd;
  const taxableIncome = totalGain - totalLthd;

  // 12억 안분 메타 (UI·결과카드 표시용)
  const nontaxableGain = redevRaw.total.gain - Math.floor(redevRaw.total.gain * taxableRatio);
  const taxableGainTotal = Math.floor(redevRaw.total.gain * taxableRatio);

  // LTHD 거주월수 귀속 메타 (사전법령해석재산 2020-386 + §155⑰ 노출)
  const prior = redevInfo.priorHouseResidenceMonths ?? 0;
  const newMonths = redevInfo.newHouseResidenceMonths ?? 0;
  const existingResidenceMonths =
    redevInfo.priorHouseResidenceMonths !== undefined || redevInfo.newHouseResidenceMonths !== undefined
      ? prior + newMonths
      : 0;
  const payResidenceMonths =
    redevInfo.priorHouseResidenceMonths !== undefined || redevInfo.newHouseResidenceMonths !== undefined
      ? newMonths
      : 0;

  return {
    ...redevRaw,
    preApproval,
    postApprovalExistingHouse,
    settlement,
    total: {
      gain: totalGain,
      lthd: totalLthd,
      taxableIncome,
    },
    highValueAllocation: {
      nontaxableGain,
      taxableGain: taxableGainTotal,
      taxableRatio,
      nontaxableThreshold,
    },
    lthdResidenceAttribution: {
      existingResidenceMonths,
      payResidenceMonths,
      existingTable: preApproval.lthdRate > 0.30 ? "table2" : "table1",
      payTable: settlement.lthdRate > 0.30 ? "table2" : "table1",
      ...(redevInfo.priorResidenceStartDate && redevInfo.priorResidenceEndDate
        ? {
            priorPeriod: {
              start: redevInfo.priorResidenceStartDate,
              end: redevInfo.priorResidenceEndDate,
            },
          }
        : {}),
      ...(redevInfo.newResidenceStartDate && redevInfo.newResidenceEndDate
        ? {
            newPeriod: {
              start: redevInfo.newResidenceStartDate,
              end: redevInfo.newResidenceEndDate,
            },
          }
        : {}),
    },
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
