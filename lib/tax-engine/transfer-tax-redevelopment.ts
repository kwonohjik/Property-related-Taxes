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
import { emitPenaltySteps } from "./transfer-tax-penalty-steps";
import { computeAmendment } from "./transfer-tax-amendment";
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
  const allocated: RedevelopmentResult = isHighValue
    ? applyHighValueAllocation(redevRaw, input.transferPrice, input.redevelopment!)
    : redevRaw;

  if (isHighValue && allocated.highValueAllocation) {
    const ha = allocated.highValueAllocation;
    steps.push({
      label: "1세대1주택 12억 초과 과세대상 양도차익 안분",
      formula: `전체 양도차익 ${redevRaw.total.gain.toLocaleString()} × (양도가액 ${input.transferPrice.toLocaleString()} - 12억) / 양도가액 = ${ha.taxableGain.toLocaleString()} (비과세분 ${ha.nontaxableGain.toLocaleString()})`,
      amount: ha.taxableGain,
      legalBasis: REDEVELOPMENT.REDEV_HIGH_VALUE_ALLOCATION,
    });
  }

  // ─ Step A.6: 사례 47 settlement 분기 1세대1주택 비과세 차감 ─
  // 트리거: settlementDirection="receive" + exemptionEligibleAtApproval=true
  //         + rightsValue ≤ 12억 + receiveOnlyMode !== true + isOneHouseSingle=true
  // 근거: PDF 사례수정 2 (2)-1번 주석 + 서면2016-법령해석재산-2705
  const redev: RedevelopmentResult = applySettlementExemption(
    allocated,
    input.redevelopment!,
    isOneHouseSingle,
  );

  if (redev.settlementExemptionApplied) {
    const exemptedGain = redev.exemptedGain ?? 0;
    const exemptedLthd = redev.exemptedLthd ?? 0;
    steps.push({
      label: "청산금 수령분 1세대1주택 비과세 차감",
      formula: `안분 후 양도차익 ${exemptedGain.toLocaleString()} + LTHD ${exemptedLthd.toLocaleString()} 합산 제외 (인가일 평가액 ${input.redevelopment!.rightsValue.toLocaleString()} ≤ 12억 + 1세대1주택 비과세 요건 충족 — 서면2016-법령해석재산-2705)`,
      amount: -(exemptedGain - exemptedLthd),
      legalBasis: REDEVELOPMENT.GAIN_BASE,
    });
  }

  // ─ Step A.7: 사례 36 §89①4호 가목 1세대1입주권 비과세 게이트 ─
  // 트리거: subject="right" + exemptionEligibleAtApproval=true + householdHousingCount=0
  //         + householdRightCount=1 + isOneHousehold=true
  // - 12억 이하: 전액 비과세 (3분기 gain/lthd 모두 0 → 산출세액 0)
  // - 12억 초과: §89①4호 가목 단서 안분 (taxableRatio 적용 후 비과세분 마스킹)
  // subject="right" 가드 — 사례 44~48 (apt) 경로 영향 0 (회귀 안전)
  const redevAfterRight: RedevelopmentResult = applyOneRightExemption(
    redev,
    input.redevelopment!,
    input,
  );

  if (redevAfterRight.oneRightExemptionApplied) {
    steps.push({
      label: "1세대1입주권 비과세",
      formula: `§89①4호 가목 — 양도일 현재 입주권 1개 + 다른 주택 없음 + 인가일 기준 종전주택 비과세 요건 충족 + 양도가액 ${input.transferPrice.toLocaleString()} ≤ 12억 → 전액 비과세`,
      amount: 0,
      legalBasis: REDEVELOPMENT.GAIN_BASE,
    });
  }

  if (redevAfterRight.oneRightHighValueApplied && redevAfterRight.highValueAllocation) {
    const ha = redevAfterRight.highValueAllocation;
    steps.push({
      label: "1세대1입주권 12억 초과 과세대상 양도차익 안분",
      formula: `§89①4호 가목 단서 + §95③ — 전체 양도차익 ${redev.total.gain.toLocaleString()} × (양도가액 ${input.transferPrice.toLocaleString()} - 12억) / 양도가액 = ${ha.taxableGain.toLocaleString()} (비과세분 ${ha.nontaxableGain.toLocaleString()})`,
      amount: ha.taxableGain,
      legalBasis: REDEVELOPMENT.REDEV_HIGH_VALUE_ALLOCATION,
    });
  }

  // ─ Step B: 양도차익·LTHD steps emit (인가전 / 인가후 기존 / 청산금 3분할) ─
  emitRedevelopmentSteps(steps, redevAfterRight, input.redevelopment!);

  // ─ Step C: 양도소득금액 ─
  const transferIncome = redevAfterRight.total.taxableIncome;
  steps.push({
    label: "양도소득금액",
    formula: `양도차익 ${redevAfterRight.total.gain.toLocaleString()} - 장기보유공제 ${redevAfterRight.total.lthd.toLocaleString()}`,
    amount: transferIncome,
    legalBasis: REDEVELOPMENT.GAIN_BASE,
  });

  // ─ Step D: 기본공제 (STEP 5) ─
  // calcBasicDeduction(taxableGain, lth) 시그니처: afterLTH = taxableGain - lth.
  // redevAfterRight.total.gain 을 첫 인자로 전달 (taxableIncome 은 이미 lthd 차감 후 — 이중 차감 방지).
  const basicDeduction = calcBasicDeduction(
    redevAfterRight.total.gain,
    redevAfterRight.total.lthd,
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
  // 재개발 경로는 §114조의2 환산가액적용가산세 대상이 아니므로 determinedTax = 산출세액.
  const determinedTax = taxResult.calculatedTax;
  const localIncomeTax = truncateToWon(applyRate(determinedTax, 0.1));
  if (determinedTax > 0) {
    steps.push({
      label: "지방소득세",
      formula: `${determinedTax.toLocaleString()} × 10%`,
      amount: localIncomeTax,
      legalBasis: TRANSFER.LOCAL_INCOME_TAX,
    });
  }

  // ─ Step G.5: 신고불성실·납부지연 가산세 (국세기본법 §47의2~4) ─
  // 일반 finalize 경로와 동일하게 emitPenaltySteps 재사용 — 재개발/입주권 양도도
  // 가산세는 자산 종류와 무관한 보편 항목이다. 입력에 filingPenaltyDetails·
  // delayedPaymentDetails가 없으면 filingDelayedPenalty=0·step 미푸시로 기존 동작 불변(additive).
  const { penaltyDetail, filingDelayedPenalty, totalAllPenalty } = emitPenaltySteps(
    input,
    steps,
    determinedTax,
    0, // penaltyTax(§114조의2 환산가액적용가산세) — 재개발 경로 미해당
    0, // penaltyBase
    undefined,
  );

  // ─ Step H: 세액합계 ─
  const totalTax = determinedTax + localIncomeTax + filingDelayedPenalty;
  steps.push({
    label: "세액합계",
    formula: filingDelayedPenalty > 0
      ? `총결정세액 ${(determinedTax + totalAllPenalty).toLocaleString()} + 지방소득세 ${localIncomeTax.toLocaleString()}`
      : `산출세액 ${determinedTax.toLocaleString()} + 지방소득세 ${localIncomeTax.toLocaleString()}`,
    amount: totalTax,
    legalBasis: REDEVELOPMENT.GAIN_BASE,
  });

  // ─ Step H.5: 수정신고(경정) — 추가납부세액 + 선택적 가산세 (끝 append) ─
  // input.amendment 없으면 undefined → 무영향(additive). finalize STEP 12.5와 동일 패턴.
  const amendmentDetail = input.amendment
    ? computeAmendment(input.amendment, determinedTax)
    : undefined;
  if (amendmentDetail) {
    for (const s of amendmentDetail.steps) steps.push({ ...s, sub: s.sub ?? true });
  }

  // ─ Step I: TransferTaxResult 빌드 ─
  return {
    isExempt: redevAfterRight.oneRightExemptionApplied === true, // 전액 비과세 시 true
    transferGain: redevAfterRight.total.gain,
    taxableGain: redevAfterRight.total.gain,
    usedEstimatedAcquisition: input.useEstimatedAcquisition ?? false,
    longTermHoldingDeduction: redevAfterRight.total.lthd,
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
    determinedTax,
    penaltyTax: 0,
    penaltyBase: 0,
    localIncomeTax,
    penaltyDetail,
    totalTax,
    amendmentDetail,
    steps,
    // 재개발 상세 부착
    redevelopmentDetail: redevAfterRight,
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

  // LTHD 거주월수 귀속 메타 (사전법령해석재산 2020-386 + §154⑧ 노출)
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
// 내부 헬퍼 — Step A.6 사례 47 settlement 비과세 차감
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 사례 47 (신축APT 양도 + 청산금 수령 동시신고) settlement 분기 비과세 차감.
 *
 * PDF 사례수정 2 (2)-1번 주석:
 *   "청산금 수령액은 기존부동산이 비과세 요건을 갖추었고 관리처분계획인가일 현재
 *    기존부동산 평가액이 12억원 이하이므로 고가주택에 해당하지 않아 비과세된다."
 *
 * 근거: 서면2016-법령해석재산-2705 (비과세 판정 시점 = 관리처분계획인가일)
 *
 * 트리거 (AND):
 *   1. settlementDirection === "receive"
 *   2. exemptionEligibleAtApproval === true (인가일 기준 1세대1주택 비과세 요건 충족)
 *   3. rightsValue ≤ HIGH_VALUE_THRESHOLD (1,200,000,000)
 *   4. receiveOnlyMode !== true (사례 46 단독신고는 별도 분기 — 본 함수 미적용)
 *   5. isOneHouseSingle === true (LTHD 표2 진입 가드)
 *
 * 동작:
 *   - 3분기 gainAfterAllocation·lthdAfterAllocation 모두 보존 (안분 후 trace)
 *   - settlement.gain → 0 마스킹 (totalGain 재계산용)
 *   - settlement.lthd → 0 마스킹 (totalLthd 재계산용)
 *   - exemptedGain/exemptedLthd 메타 분리 저장
 *   - settlementExemptionApplied = true 플래그
 *
 * 미적용 케이스에서는 redev 입력 그대로 반환 (회귀 안전).
 */
function applySettlementExemption(
  redev: RedevelopmentResult,
  redevInfo: NonNullable<TransferTaxInput["redevelopment"]>,
  isOneHouseSingle: boolean,
): RedevelopmentResult {
  // 트리거 조건 검사
  if (
    redevInfo.settlementDirection !== "receive" ||
    redevInfo.exemptionEligibleAtApproval !== true ||
    redevInfo.rightsValue > HIGH_VALUE_THRESHOLD ||
    redevInfo.receiveOnlyMode === true ||
    !isOneHouseSingle
  ) {
    return redev;
  }

  const exemptedGain = redev.settlement.gain;
  const exemptedLthd = redev.settlement.lthd;

  // settlement 마스킹 + 3분기 안분 후 값 trace 보존
  const newPreApproval = {
    ...redev.preApproval,
    gainAfterAllocation: redev.preApproval.gain,
    lthdAfterAllocation: redev.preApproval.lthd,
  };
  const newPostApprovalExistingHouse = {
    ...redev.postApprovalExistingHouse,
    gainAfterAllocation: redev.postApprovalExistingHouse.gain,
    lthdAfterAllocation: redev.postApprovalExistingHouse.lthd,
  };
  const newSettlement = {
    ...redev.settlement,
    gainAfterAllocation: redev.settlement.gain,
    lthdAfterAllocation: redev.settlement.lthd,
    gain: 0,
    lthd: 0,
  };

  // total 재계산 (settlement 마스킹 반영)
  const totalGain =
    newPreApproval.gain + newPostApprovalExistingHouse.gain + newSettlement.gain;
  const totalLthd =
    newPreApproval.lthd + newPostApprovalExistingHouse.lthd + newSettlement.lthd;

  return {
    ...redev,
    preApproval: newPreApproval,
    postApprovalExistingHouse: newPostApprovalExistingHouse,
    settlement: newSettlement,
    total: {
      gain: totalGain,
      lthd: totalLthd,
      taxableIncome: totalGain - totalLthd,
    },
    settlementExemptionApplied: true,
    exemptedGain,
    exemptedLthd,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 내부 헬퍼 — Step A.7 사례 36 1세대1입주권 비과세 (§89①4호 가목)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 사례 36 — §89①4호 가목 1세대1입주권 비과세 게이트.
 *
 * 트리거 (AND 4조건):
 *   1. subject === "right"  ◀── 사례 45/47 (apt) 경로 완전 격리
 *   2. exemptionEligibleAtApproval === true  ◀── 기존 필드 재사용 (사례 47 도입)
 *      (인가일 기준 종전주택 §89①3호 가목 요건 충족 — 사용자 자기선언)
 *   3. householdHousingCount === 0 AND householdRightCount === 1
 *      (양도일 현재 다른 주택 없음 + 1입주권만 — §89①4호 가목 본문)
 *   4. isOneHousehold === true
 *
 * 동작:
 *   - transferPrice ≤ 12억 → 3분기 모두 gain/lthd 0 마스킹 → 산출세액 0 (전액 비과세)
 *     → oneRightExemptionApplied = true
 *   - transferPrice > 12억 → §89①4호 가목 단서 + §95③ 안분
 *     → taxableRatio × 각 분기 gain/lthd 보존, 비과세분 마스킹
 *     → oneRightHighValueApplied = true
 *
 * 법령 근거:
 *   - 소득세법 §89①4호 가목 본문: 1세대1입주권 비과세
 *   - 소득세법 §89①4호 가목 단서: 12억 초과 시 안분과세
 *   - 소득세법 §95③ + 시행령 §160: 안분 산식 (taxableRatio = (양도가 − 12억) / 양도가)
 *   - 시행령 §154: 1세대 범위
 *
 * 국세청 해석례 근거 (분모 = transferPrice 단일 — 해석 A):
 *   - "고가주택에 해당하는 조합원입주권 양도차익 산정방법" (국세청, 2010.11.01)
 *   - "1세대1주택인 고가주택의 입주권을 양도하는 경우 양도차익 산정방법" (국세청, 2008.01.10)
 *   (링크: https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000144597)
 *
 * 미적용 케이스에서는 redev 입력 그대로 반환 (회귀 안전).
 * subject="right" 가드로 사례 44~48 (apt) 경로 영향 0.
 */
function applyOneRightExemption(
  redev: RedevelopmentResult,
  redevInfo: NonNullable<TransferTaxInput["redevelopment"]>,
  input: TransferTaxInput,
): RedevelopmentResult {
  // 트리거 조건 1: subject 가드 — apt 경로 완전 격리
  if (redevInfo.subject !== "right") {
    return redev;
  }

  // 트리거 조건 2~4: 자기선언 + 세대 구성
  if (
    redevInfo.exemptionEligibleAtApproval !== true ||
    input.isOneHousehold !== true ||
    input.householdHousingCount !== 0 ||
    input.householdRightCount !== 1
  ) {
    return redev;
  }

  if (input.transferPrice <= HIGH_VALUE_THRESHOLD) {
    // ── 전액 비과세 (12억 이하) ──
    // 3분기 모두 trace 보존 후 0 마스킹
    const maskBranch = (branch: RedevelopmentResult["preApproval"]) => ({
      ...branch,
      gainAfterAllocation: branch.gain,
      lthdAfterAllocation: branch.lthd,
      gain: 0,
      lthd: 0,
    });
    return {
      ...redev,
      preApproval: maskBranch(redev.preApproval),
      postApprovalExistingHouse: maskBranch(redev.postApprovalExistingHouse),
      settlement: maskBranch(redev.settlement),
      total: { gain: 0, lthd: 0, taxableIncome: 0 },
      oneRightExemptionApplied: true,
    };
  } else {
    // ── 12억 초과 안분과세 (§89①4호 가목 단서 + §95③) ──
    // apt 분기 applyHighValueAllocation 과 동일 taxableRatio 로직 적용
    // 단, isOneHouseSingle 조건(householdHousingCount===1)과 별개로 right 전용 처리
    const taxableRatio = (input.transferPrice - HIGH_VALUE_THRESHOLD) / input.transferPrice;

    const scaleBranch = (branch: RedevelopmentResult["preApproval"]) => {
      if (branch.gain <= 0) {
        return { ...branch, gainBeforeAllocation: branch.gain, nontaxableGain: 0 };
      }
      const originalGain = branch.gain;
      const taxableGain = Math.floor(originalGain * taxableRatio);
      const nontaxableGain = originalGain - taxableGain;
      // subject="right": postApprovalExistingHouse.gain=0, settlement LTHD=0 (§94①2호)
      const taxableLthd = branch.lthdRate > 0 ? Math.floor(taxableGain * branch.lthdRate) : 0;
      return {
        ...branch,
        gain: taxableGain,
        lthd: taxableLthd,
        gainBeforeAllocation: originalGain,
        nontaxableGain,
      };
    };

    const preApproval = scaleBranch(redev.preApproval);
    const postApprovalExistingHouse = scaleBranch(redev.postApprovalExistingHouse);
    const settlement = scaleBranch(redev.settlement);

    const totalGain = preApproval.gain + postApprovalExistingHouse.gain + settlement.gain;
    const totalLthd = preApproval.lthd + postApprovalExistingHouse.lthd + settlement.lthd;
    const nontaxableGainTotal = redev.total.gain - Math.floor(redev.total.gain * taxableRatio);
    const taxableGainTotal = Math.floor(redev.total.gain * taxableRatio);

    return {
      ...redev,
      preApproval,
      postApprovalExistingHouse,
      settlement,
      total: {
        gain: totalGain,
        lthd: totalLthd,
        taxableIncome: totalGain - totalLthd,
      },
      oneRightHighValueApplied: true,
      highValueAllocation: {
        nontaxableGain: nontaxableGainTotal,
        taxableGain: taxableGainTotal,
        taxableRatio,
        nontaxableThreshold: HIGH_VALUE_THRESHOLD,
      },
    };
  }
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
