/**
 * 양도차손(또는 양도차익 0) 조기반환 — 「소득세법」 §92③3호 총결정세액 조립.
 *
 * 산출세액이 0이어도 **가산세는 남는다**. §114조의2②(환산가액 적용)는 산출세액 없이도
 * 부과되고, 국세기본법 §47의2~§47의4는 「초과신고한 환급세액」·「납부하지 아니한 세액」이
 * base라 결정세액과 독립이다(조심 2012서2857 — 통산으로 세액이 소멸해도 그 이전의
 * 과소신고·미납분 가산세는 유지된다).
 *
 * 🔑 이 경로는 **비과세 판정이 없었던 것이 아니다** — §89①3호 해당 여부·§159 명세·
 *    중과 판정 결과를 정상 경로와 똑같이 실어야 한다. 빠뜨리면 §97의2②2호 자동 판정이
 *    「B는 1세대1주택이 아니다」로 오판해 이월과세를 잘못 배제한다.
 *
 * `transfer-tax.ts`에서 분리했다(파일 크기 정책). **동작은 그대로**다 —
 * 지역변수를 인자로 받는 것 외에 바뀐 것이 없다.
 */
import { applyRate } from "./tax-utils";
import { calculateBuildingPenalty, resolveExtensionPenaltyBase } from "./transfer-tax-building-penalty";
import { computeAmendment } from "./transfer-tax-amendment";
import { emitPenaltySteps } from "./transfer-tax-penalty-steps";
import { resolveLTHDStartDate } from "./transfer-tax-lthd-start";
import { buildTransferResultDetails } from "./transfer-tax-finalize";
import { TRANSFER } from "./legal-codes/transfer";
import type { CalculationStep, TransferTaxInput, TransferTaxResult } from "./types/transfer.types";

export interface LossReturnArgs {
  input: TransferTaxInput;
  effectiveInput: TransferTaxInput;
  estimatedBase: number;
  steps: CalculationStep[];
  warnings: string[];
  transferGain: number;
  usedEstimated: boolean;
  exemptionResult: { isPartialExempt: boolean; exemptReason?: string };
  transferBurdenedGiftBreakdown: TransferTaxResult["transferBurdenedGiftBreakdown"];
  multiHouseSurchargeResult: Parameters<typeof buildTransferResultDetails>[0]["multiHouseSurchargeResult"];
  nonBusinessLandJudgment: Parameters<typeof buildTransferResultDetails>[0]["nonBusinessLandJudgment"];
  pre1990LandResult: Parameters<typeof buildTransferResultDetails>[0]["pre1990LandResult"];
  carryoverDetail: Parameters<typeof buildTransferResultDetails>[0]["carryoverDetail"];
  inheritedAcquisitionStep: Parameters<typeof buildTransferResultDetails>[0]["inheritedAcquisitionStep"];
  cbStep: Parameters<typeof buildTransferResultDetails>[0]["cbStep"];
  splitDetail: Parameters<typeof buildTransferResultDetails>[0]["splitDetail"];
}

export function buildLossTransferTaxResult({
  input,
  effectiveInput,
  estimatedBase,
  steps,
  warnings,
  transferGain,
  usedEstimated,
  exemptionResult,
  transferBurdenedGiftBreakdown,
  multiHouseSurchargeResult,
  nonBusinessLandJudgment,
  pre1990LandResult,
  carryoverDetail,
  inheritedAcquisitionStep,
  cbStep,
  splitDetail,
}: LossReturnArgs): TransferTaxResult {
  // ⚠️ acquisitionMethod 판정은 effectiveInput 기준 — finalize.ts penaltyBase와 동일 이유·동일 근거
  // (부담부증여는 §159 스텝이 정규화하나 원본 input에는 UI가 보존한 stale 산정방식이 남는다).
  let pb0 = effectiveInput.acquisitionMethod === "appraisal"
    ? (effectiveInput.appraisalValue ?? 0)
    : ((input.useEstimatedAcquisition || effectiveInput.usedEstimatedAcquisition)
        ? (estimatedBase || effectiveInput.estimatedBase || 0)
        : 0);
  // §114조의2① 손실(산출세액 0, ②) 경로도 증축부분 한정 base 적용 — 정상 경로 finalize와 동일 헬퍼(dual-truth 방지)
  pb0 = resolveExtensionPenaltyBase(input, pb0);
  const pr0 = calculateBuildingPenalty(effectiveInput, pb0);
  const pt0 = pr0?.penalty ?? 0;
  const lit0 = pt0 > 0 ? applyRate(pt0, 0.1) : 0;
  if (pt0 > 0) {
    steps.push({ label: "지방소득세", formula: `${pt0.toLocaleString()} × 10%`, amount: lit0, legalBasis: TRANSFER.LOCAL_INCOME_TAX });
  }
  /**
   * 🔑 **양도차손 경로도 국세기본법 §47의2~§47의4 가산세를 싣는다** (2026-08-13 F33).
   *
   * 「소득세법」 §92③3호는 양도소득 **총결정세액**을 「양도소득 결정세액에 제114조의2,
   * 제115조 및 「국세기본법」 제47조의2부터 제47조의4까지에 따른 가산세를 더하여」 계산하도록
   * 정한다. 종전 조기반환은 §114조의2만 싣고 국기법 가산세를 **통째로 버렸다** —
   * `penaltyDetail`이 undefined가 되어 산출근거 표시까지 사라졌다.
   *
   * 결정세액이 0이어도 base가 양수일 수 있는 축이 둘 있다:
   *   · §47의3① — 「초과신고한 **환급세액**」(`filingPenaltyDetails.excessRefundAmount`)
   *   · §47의4①1·2호 — 「납부하지 아니한 세액」·「초과환급받은 세액」(`delayedPaymentDetails.unpaidTax`)
   * 순수 차손이고 초과환급·미납이 없으면 `calculateFilingPenalty`가 base 0으로 0을 반환하므로
   * 종전과 값이 같다(조심 2012서2857 — 통산으로 세액이 소멸해도 그 이전의 과소신고·미납분
   * 가산세는 유지된다. 예정신고·납부의무는 확정신고·납부의무와 별개의 독립적 의무).
   *
   * ⚠️ **지방소득세 base는 §114조의2분(pt0)만이다** — 정상 경로(`transfer-tax-finalize.ts`
   *    STEP 10)·다건 집계(`transfer-tax-aggregate.ts`)와 같은 축을 유지한다. 신고불성실·
   *    납부지연분을 base에 넣으면 「지방세 산출세액 ≠ result.localIncomeTax」 불일치가 생긴다.
   *
   * §114조의2 step은 `emitPenaltySteps`가 「환산가액적용가산세 (§114조의2)」로 통합 emit한다
   * (정상 경로와 동일) — 종전의 별도 「신축·증축 가산세」 push는 여기서 중복이 되므로 없앴다.
   */
  const { penaltyDetail: lossPenaltyDetail, filingDelayedPenalty: lossFilingDelayed } =
    emitPenaltySteps(input, steps, 0, pt0, pb0, pr0?.note);
  const lossTotalTax = pt0 + lit0 + lossFilingDelayed;
  if (lossTotalTax > 0) {
    steps.push({
      label: "총 납부세액",
      formula: `가산세 합계 ${(pt0 + lossFilingDelayed).toLocaleString()} + 지방소득세 ${lit0.toLocaleString()}`,
      amount: lossTotalTax,
      legalBasis: TRANSFER.BUILDING_PENALTY,
    });
  }
  return {
    isExempt: false,
    /**
     * 🔑 **양도차손 경로에도 §89①3호 해당 여부를 실어야 한다** (2026-08-10 D-8).
     *
     * 이 조기반환은 「양도차익 ≤ 0」이라 세액이 0인 것이지 **비과세 판정이 없었던 것이
     * 아니다**. 빠뜨리면 §97의2②2호 자동 판정이 「B는 1세대1주택이 아니다」로 오판해
     * **이월과세를 잘못 배제**한다(anchor OH-2가 이 누락을 잡았다).
     */
    isPartialExempt: exemptionResult.isPartialExempt,
    // [F1] 경정 결과 양도차손(산출세액 0) → 조기반환. refund면 전액환급(determinedTax=0).
    amendmentDetail: input.amendment ? computeAmendment(input.amendment, 0) : undefined,
    exemptReason: exemptionResult.exemptReason,
    warnings: warnings.length > 0 ? warnings : undefined,
    transferGain: transferGain,
    taxableGain: transferGain,
    usedEstimatedAcquisition: usedEstimated,
    longTermHoldingDeduction: 0,
    lthdStartDate: resolveLTHDStartDate(effectiveInput),
    longTermHoldingRate: 0,
    basicDeduction: 0,
    taxBase: 0,
    appliedRate: 0,
    progressiveDeduction: 0,
    calculatedTax: 0,
    isSurchargeSuspended: false,
    reductionAmount: 0,
    determinedTax: 0,
    penaltyTax: pt0,
    penaltyBase: pt0 > 0 ? pb0 : 0,
    localIncomeTax: lit0,
    // 국기법 §47의2~§47의4분(lossFilingDelayed)은 지방소득세 base에 넣지 않는다 — 위 주석 참조.
    penaltyDetail: lossPenaltyDetail,
    totalTax: lossTotalTax,
    steps,
    /**
     * 🔴 **양도차손 경로에도 §159 명세를 싣는다** (2026-08-10 D-7a).
     *
     * 종전에는 이 조기반환에만 빠져 있어, 부담부증여로 양도차익이 0 이하가 되면
     * 결과 화면이 **산출근거를 통째로 잃었다**. 이월과세 증여세 상당액 산입(§97의2①3호)은
     * 한도까지 채우면 양도차익이 정확히 0이 되므로 이 경로를 **정상적으로** 탄다.
     */
    transferBurdenedGiftBreakdown,
    // 다건 집계는 `skipLossFloor=true`로 차손 자산도 이 경로를 태운 뒤 세율을 다시 구한다 —
    // 정상 경로와 같은 정밀 판정을 쓰도록 여기서도 echo한다 (F01).
    multiHouseSurchargeEvaluation: multiHouseSurchargeResult,
    ...buildTransferResultDetails({
      multiHouseSurchargeResult,
      nonBusinessLandJudgment,
      pre1990LandResult,
      carryoverDetail,
      inheritedAcquisitionStep,
      cbStep,
      splitDetail,
    }),
  };
}
