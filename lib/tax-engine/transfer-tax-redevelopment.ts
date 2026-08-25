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
import { resolveSurchargeApplication } from "./transfer-tax-surcharge-predicate";
import {
  HIGH_VALUE_THRESHOLD,
  applyLthdExclusion,
  applyHighValueAllocation,
  applySettlementExemption,
  applyOneRightExemption,
  emitRedevelopmentSteps,
} from "./transfer-tax-redevelopment-transforms";
import type { MultiHouseSurchargeResult } from "./types/multi-house-surcharge.types";
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

export function calculateRedevelopmentTax(
  input: TransferTaxInput,
  parsedRates: ParsedRates,
  baseSteps: CalculationStep[],
  /**
   * 다주택 중과 정밀 판정(`houses[]` 기반). 종전에는 `transfer-tax.ts`가 **넘기지 않아**
   * 재개발 신축주택에 §104⑦이 통째로 미적용됐다(실측 Δ 59,823,642원 과소).
   * 미제공이면 `resolveSurchargeApplication`이 원시 플래그로 fallback한다.
   */
  multiHouseSurchargeResult?: MultiHouseSurchargeResult,
): TransferTaxResult {
  const steps: CalculationStep[] = [...baseSteps];
  // 토지만 출자한 조합원입주권은 1세대1주택 특례(비과세·LTHD 표2) 대상이 아니다.
  //
  //   §89①4호 본문 — 「조합원입주권을 1개 보유한 1세대[…관리처분계획의 인가일… 현재
  //     **제3호가목에 해당하는 기존주택을 소유하는 세대**]가 …양도하는 경우」
  //     ⇒ 토지 출자는 인가일 현재 기존주택이 없어 비과세 요건 자체가 불성립.
  //   §95② 단서 — 「…1세대 1주택(이에 딸린 토지를 포함한다)에 해당하는 **자산**의 경우에는
  //     …표 2…」 ⇒ 종전자산이 주택이 아니면 표2 진입 불가(표1만).
  //
  // 환산 경로는 이미 `isOneHouseSingle: false` 고정이었으나
  // (`redevelopment-land-contribution.ts:166`) 실가 경로(`runOriginalMember`)는
  // 이 값을 그대로 전달해(`redevelopment.ts:535`) 표2가 적용됐다(2026-08-13 제보).
  //
  // ⚠️ subject="right" 한정 — 토지를 출자하고 **완공 APT**를 양도하는 경우(subject="apt")는
  //    주택 양도라 §89①3호·§95② 표2 대상이 될 수 있다.
  const isLandContributedRight =
    input.redevelopment!.subject === "right" &&
    input.redevelopment!.originalAssetType === "land";
  const isOneHouseSingle =
    !isLandContributedRight &&
    input.isOneHousehold === true &&
    input.householdHousingCount === 1;

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
    ownershipRatio: input.ownershipRatio,
    isUnregistered: input.isUnregistered,
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
  const redevAfterRightRaw: RedevelopmentResult = applyOneRightExemption(
    redev,
    input.redevelopment!,
    input,
  );

  // ─ Step A.8: §95② 장기보유특별공제 배제 (다주택 중과 대상) ─
  //
  // 「소득세법」 §95② — 「"장기보유 특별공제액"이란 제94조제1항제1호에 따른 자산(제104조제3항에
  // 따른 미등기양도자산과 **같은 조 제7항 각 호에 따른 자산은 제외한다**)으로서 …」
  // 재개발 신축주택(완공 APT)은 §94①1호 자산(건물)이라 이 괄호가 그대로 걸린다.
  //
  // ⚠️ **일반 경로의 배제(`transfer-tax-lthd.ts` L-1)를 타지 않는다** — 재개발은 LTHD를
  //    `runRedevelopment`가 **분기별로** 산정해 넘기므로 배제가 자동으로 따라오지 않는다.
  //    그래서 여기서 같은 술어(`resolveSurchargeApplication` 단일 소스)로 직접 건다.
  //
  // 🔑 **분기 3개와 합계를 함께 0으로** 만든다. 합계만 0으로 두면 결과 화면이
  //    「공제 0인데 분기엔 값이 있다」로 어긋난다(memory `feedback_engine_result_display_drift`).
  const surchargeApplication = resolveSurchargeApplication(
    input,
    multiHouseSurchargeResult,
    parsedRates.surchargeSpecialRules,
  );
  const lthdExcludedBySurcharge = surchargeApplication.isSurchargeApplied;
  const redevAfterRight: RedevelopmentResult = lthdExcludedBySurcharge
    ? applyLthdExclusion(redevAfterRightRaw)
    : redevAfterRightRaw;

  if (lthdExcludedBySurcharge) {
    steps.push({
      label: "장기보유특별공제 배제 (다주택 중과)",
      formula:
        `§95② 괄호 — 「제104조제7항 각 호에 따른 자산은 제외한다」. ` +
        `중과 유형 ${surchargeApplication.surchargeTypeKey} · 배제 전 공제액 ${redevAfterRightRaw.total.lthd.toLocaleString()}`,
      amount: 0,
      legalBasis: TRANSFER.LONG_TERM_DEDUCTION,
    });
  }

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
  const taxResult = calcTax(taxBase, parsedRates, input, multiHouseSurchargeResult);
  const fmtPct = (r: number) => `${Math.round(r * 100)}%`;
  steps.push({
    label: "산출세액",
    formula: `과세표준 ${taxBase.toLocaleString()} × 세율 ${fmtPct(taxResult.appliedRate)}${taxResult.progressiveDeduction ? ` - 누진공제 ${taxResult.progressiveDeduction.toLocaleString()}` : ""}`,
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
    surchargeType: taxResult.surchargeType,
    /**
     * 🔴 **다건 집계가 중과를 재판정하지 않게 하는 echo** (F01과 동형).
     *
     * `transfer-tax-aggregate-helpers.ts`의 `assetTaxOf`는 자산별 세율을 다시 구하면서
     * `records[i].result.multiHouseSurchargeEvaluation`을 `calcTax`에 넘긴다. 이 필드가
     * 없으면 `calcTax`가 **원시 플래그로 재판정**해 단건이 배제한 중과가 다건에서 되살아난다
     * (optional이라 TypeScript가 못 잡는다).
     *
     * 종전에는 재개발 경로 자체가 중과를 안 걸어서 드러나지 않았다 — **중과를 여는 이 배치가
     * 그 위험을 새로 활성화**한다(memory `feedback_ui_gate_expansion_activates_latent_defect`).
     */
    multiHouseSurchargeEvaluation: multiHouseSurchargeResult,
    /**
     * 🔑 **배제한 이유를 화면까지 보낸다** — 일반 경로(`transfer-tax-lthd.ts`)는 이 필드를
     * 채우는데 재개발 경로만 비어 있었다. 그러면 상세명세서·결과 카드가 「양도차익 × **0%**」로만
     * 표시해 **왜 0인지 알 수 없다**(memory `feedback_engine_result_display_drift`).
     *
     * 배제 여부와 이 필드는 **같은 술어**(`lthdExcludedBySurcharge`)에서 나온다 — 따로 판정하면
     * 「공제는 0인데 사유는 없다」는 세 번째 진실이 생긴다.
     */
    ...(lthdExcludedBySurcharge ? { lthdExclusionReason: "multi_house_surcharge" as const } : {}),
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
