/**
 * 상속세 메인 계산 엔진 (상증법 §11~§30)
 *
 * 계산 파이프라인:
 *   1. 재산 평가 (property-valuation.ts)
 *   2. 비과세 차감 (exemption-evaluator.ts)
 *   3. 장례비·채무 차감 (§14)
 *   4. 사전증여재산 합산 (§13 — 10년/5년)
 *   5. 상속세 과세가액 확정
 *   6. 상속공제 적용 (§18~§24)
 *   7. 과세표준 = 과세가액 - 공제
 *   8. 산출세액 = 누진세율 (§26)
 *   9. 세대생략 할증 (§27)
 *  10. 세액공제 (§28~§30·§69)
 *  11. 결정세액 = 산출 + 할증 - 공제
 *
 * Pure Engine: DB 호출 없음, 입력 검증 없음 (Orchestrator 담당)
 */

import { INH } from "./legal-codes";
import { runEstateValuationSteps } from "./inheritance-tax-estate-steps";
import { runInheritanceDeductionStep } from "./inheritance-tax-deduction-step";
import type {
  InheritanceTaxInput,
  InheritanceTaxResult,
  CalculationStep,
} from "./types/inheritance-gift.types";
import type {
} from "./types/inheritance-deduction-detail.types";

import { evaluateAllEstateItems, resolveValuationMethod } from "./property-valuation";
import {
} from "./exemption-evaluator";
import {
} from "./deductions/inheritance-deductions";
import { calcAppraisalFeeDeduction } from "./deductions/appraisal-fee-deduction";
import {
  calcInheritanceGiftFilingPenalty,
  calcInheritanceGiftLatePayment,
} from "./inheritance-gift-penalty";
import { calcCulturalHeritageDeferral } from "./inheritance-cultural-heritage-deferral";
import {
  DEFAULT_INHERITANCE_GIFT_BRACKETS,
  calcInheritanceGiftTax,
  findApplicableBracket,
} from "./inheritance-gift-common";
import { calcInheritanceTaxCredits } from "./inheritance-gift-tax-credit";
import { buildFamilyBusinessPostMgmtMeta } from "./credits/family-business-postmgmt-orchestrator";
import { computeCorporateExemptionStep } from "./inheritance-corporate-exemption-step";
import { calcHeirAllocation } from "./inheritance-allocation";
import { reconcileSummaryWithAllocation } from "./inheritance-summary-reconcile";
import { computeGenerationSkipSurcharge } from "./inheritance-generation-skip";
import { derivePriorGiftTaxBase } from "./inheritance-prior-gift-taxbase";
import { buildSummaryCategory } from "./inheritance-asset-category";
import { computeLegalShares } from "./inheritance-legal-share";
import { toCollateralDebtItems } from "./inheritance-collateral-debt";
import type { TaxBracket } from "./types";

// ============================================================
// 상속세 메인 계산
// ============================================================

export interface InheritanceTaxEngineOptions {
  /** §26 누진세율 구간 (DB에서 로드; 기본값 사용 시 undefined) */
  brackets?: TaxBracket[];
  /** @deprecated 도달 불가 — 미사용. §29 한도는 creditInput.foreignInheritanceTaxBase + 엔진 taxBase로 계산. */
  foreignPropertyRatio?: number;
}

/**
 * 상속세 전체 계산
 *
 * @param input 상속세 계산 입력
 * @param options 세율 구간 등 옵션
 */
export function calcInheritanceTax(
  input: InheritanceTaxInput,
  options: InheritanceTaxEngineOptions = {},
): InheritanceTaxResult {
  const brackets = options.brackets ?? DEFAULT_INHERITANCE_GIFT_BRACKETS;
  const appliedLawDate = input.deathDate;
  const allBreakdown: CalculationStep[] = [];
  const allWarnings: string[] = [];
  const allLaws: Set<string> = new Set([INH.TAXABLE_VALUE]);

  // ─────────────────────────────────────────────
  // STEP 0.5: §53 증여재산공제 사전 도출 (상증법 §53, KoreanLaw mst 276123 검증 2026-06-01)
  //   상속세 모드 UI(GiftRowEditor)는 giftTaxBase 입력란이 없어(증여세 모드 전용) 항상 undefined.
  //   → doneeId → heirs.relation → §53 관계공제(배우자 6억·직계비속 5천 등, 수증자 단위 10년 통산)를
  //     미리 도출하여 이후 전 STEP(§19 배우자공제·§24 종합한도·STEP 13 상속인별 배부)에서 일관 사용.
  //   ① giftTaxBase 명시 건은 보존(회귀 0) ② doneeId/관계 기반 도출 ④ legatee·corporate·orphan 미개입.
  //   이후 `input.preGiftsWithin10Years` 직접 참조 금지 — `preGifts`로 통일.
  // ─────────────────────────────────────────────
  const preGifts =
    input.preGiftsWithin10Years && input.heirs && input.heirs.length > 0
      ? derivePriorGiftTaxBase(input.preGiftsWithin10Years, input.heirs)
      : (input.preGiftsWithin10Years ?? []);

  /**
   * ─ STEP 1~5 — **재산 평가 · 비과세 · §14 차감 · §15 추정상속 · §13 사전증여 합산 · 과세가액**.
   *
   * `inheritance-tax-estate-steps.ts`로 분리했다(800줄 정책 — 이 함수가 772줄이었다).
   * 입력 4개(누적 배열 3 + `preGifts`)로 이음매가 좁고, 호출부가 **구조분해로 받으므로
   * 하류 참조가 하나도 바뀌지 않는다**.
   */
  const estate = runEstateValuationSteps(input, allBreakdown, allLaws, allWarnings, preGifts);
  const {
    collateralDebts,
    cutoffFilteredGifts,
    deductedBeforeAggregation,
    exemptAmount,
    exemptionDetail,
    funeralDeduction,
    grossEstateValue,
    nonFuneralDebts,
    presumedDetail,
    presumedTotal,
    taxableEstateValue,
    valuationResults,
    priorGiftAggregated,
  } = estate;

  /**
   * ─ STEP 6 — **상속공제(§18~§24) + 종합한도(§24)**.
   *
   * `inheritance-tax-deduction-step.ts`로 분리했다(800줄 정책). 입력 5·출력 2로 이음매가 좁다.
   */
  const { deductionResult, totalDeduction, heirOnlyGifts } = runInheritanceDeductionStep(
    input, allBreakdown, allLaws, allWarnings, brackets, preGifts, estate,
  );

  // ─────────────────────────────────────────────
  // STEP 7: 과세표준 (상증법 §25 — 절사 규정 없음, 원 단위)
  //   §25①2호 감정평가수수료 공제 차감 (시행령 §20의3)
  // ─────────────────────────────────────────────
  const hasAppraisalValuation = input.estateItems.some(
    (i) => (i.valuationMethod ?? resolveValuationMethod(i)) === "appraisal",
  );
  const appraisalFee = calcAppraisalFeeDeduction(input.appraisalFee, {
    hasAppraisalValuation,
    taxType: "inheritance",
  });
  const taxBase = Math.max(
    0,
    taxableEstateValue - totalDeduction - appraisalFee.total,
  );

  if (appraisalFee.total > 0) {
    allBreakdown.push({
      label: "감정평가수수료 공제",
      amount: -appraisalFee.total,
      lawRef: INH.APPRAISAL_FEE,
    });
    allLaws.add(INH.APPRAISAL_FEE);
  }

  allBreakdown.push({
    label: "과세표준",
    amount: taxBase,
    lawRef: INH.TAX_RATE,
  });

  // ─────────────────────────────────────────────
  // STEP 8: 산출세액 (§26 누진세율)
  // ─────────────────────────────────────────────
  const computedTax = calcInheritanceGiftTax(taxBase, brackets);
  // ⑦ 산식 표시용 echo — 적용 한계세율·누진공제 (계산 영향 0, 동일 brackets 조회)
  const { rate: computedTaxAppliedRate, deduction: computedTaxProgressiveDeduction } =
    findApplicableBracket(taxBase, brackets);
  allLaws.add(INH.TAX_RATE);

  allBreakdown.push({
    label: `산출세액 (${INH.TAX_RATE} 누진세율)`,
    amount: computedTax,
    lawRef: INH.TAX_RATE,
  });

  // valuatedAmountById — STEP 8.5(genSkip) 및 STEP 13(calcHeirAllocation) 공유
  const valuatedAmountById = new Map(
    valuationResults.map((v) => [v.estateItemId, v.valuatedAmount]),
  );

  // ─────────────────────────────────────────────
  // STEP 8.5 + 9: 세대생략 할증 (§27) — inheritance-generation-skip.ts 분리 (800줄 정책)
  // ─────────────────────────────────────────────
  const genSkip = computeGenerationSkipSurcharge({
    input,
    computedTax,
    taxBase,
    taxableEstateValue,
    preGifts: preGifts ?? [],
    cutoffFilteredGifts,
    valuatedAmountById,
  });
  const {
    generationSkipSurcharge,
    perHeirSurcharge,
    generationSkipDetail,
    nonHeirNonLegateeGifts,
  } = genSkip;
  allBreakdown.push(...genSkip.breakdown);
  if (genSkip.lawApplied) allLaws.add(INH.GENERATION_SKIP);

  // ─────────────────────────────────────────────
  // STEP 10: 영리법인 §3의2② 면제 (Phase B) — inheritance-corporate-exemption-step.ts 분리
  // ─────────────────────────────────────────────
  const corpStep = computeCorporateExemptionStep(
    preGifts,
    input.deathDate,
    input.heirs,
    computedTax,
    taxBase,
  );
  const { corporateExemption, corporateGiftTaxBase } = corpStep;
  allBreakdown.push(...corpStep.breakdown);
  for (const law of corpStep.appliedLaws) allLaws.add(law);

  // ─────────────────────────────────────────────
  // STEP 11: 세액공제 (§28~§30·§69)
  // ─────────────────────────────────────────────
  const creditResult = calcInheritanceTaxCredits({
    creditInput: input.creditInput,
    computedTax,
    generationSkipSurcharge,
    foreignPropertyRatio: options.foreignPropertyRatio,
    taxableEstateValue,
    taxBase,
    deathDate: input.deathDate,
    // §69①2호 — 영리법인 면제(§3의2②)를 신고세액공제 기준에서 차감 (Path B fallback)
    corporateExemptionAmount: corporateExemption?.amount ?? 0,
  });

  let totalTaxCredit = creditResult.totalCredit;
  allBreakdown.push(...creditResult.breakdown);
  for (const law of creditResult.appliedLaws) allLaws.add(law);

  // STEP 12: 결정세액 = 산출 + 할증 − 영리법인 면제(§3의2②) − 세액공제.
  //   배부 발동 시(Path A) STEP 13.5에서 배부표 합으로 정합. 미발동 시(Path B) 본 값. breakdown은 13.5 후 push.
  let finalTax = Math.max(
    0,
    computedTax + generationSkipSurcharge - (corporateExemption?.amount ?? 0) - totalTaxCredit,
  );

  // ─────────────────────────────────────────────
  // STEP 13: 상속인별 배부 (Phase C) — heirs·doneeId·세대생략 수유자가 제공된 경우
  // ─────────────────────────────────────────────
  let heirAllocationResult: ReturnType<typeof calcHeirAllocation> | undefined;
  // 자연인 상속인(corporate·legatee·isHeir=false 제외)이 1명 이상이면 항상 상속인별 배부.
  // 세대생략 수유자(isGenerationSkipBeneficiary)가 있어도 배부 진입 (D2 추가).
  const hasHeirAllocations =
    computeLegalShares(input.heirs).shares.length > 0 ||
    preGifts.some((g) => g.doneeId) ||
    input.heirs.some((h) => h.isGenerationSkipBeneficiary);

  // H-16: 레거시 전역 isGenerationSkip 경로(perHeirSurcharge 미산출)는 §27 할증을 특정 상속인·수유자에
  //   귀속할 수 없다. 이 경우 배부표를 만들면 §27 할증이 어느 상속인에게도 가산되지 않아 Σ perHeir.finalTax가
  //   결정세액보다 할증액만큼 적어진다(배부표 붕괴). 자동 안분(전 상속인 균등 가산)은 §27 법리에 반하므로
  //   금지 → 배부표를 생략(undefined)하고 경고. 세대생략 상속인·수유자를 개별 지정하면 per-heir 경로로 정확 배부.
  const genSkipUnallocatable = perHeirSurcharge == null && generationSkipSurcharge > 0;

  if (hasHeirAllocations && genSkipUnallocatable) {
    allWarnings.push(
      "세대생략 할증(§27)이 전역 입력으로 지정되어 상속인별 배부표를 산출하지 않습니다. 할증은 특정 세대생략 상속인·수유자에게만 가산되므로, 정확한 배부표를 위해 해당 상속인을 세대생략 수유자로 개별 지정(isGenerationSkipBeneficiary)하세요. (결정세액에는 할증이 정상 반영됨)",
    );
  } else if (hasHeirAllocations) {
    // 추정상속재산 id→addedAmount Map 작성
    const presumedAddedById = new Map<string, number>();
    if (presumedDetail) {
      for (const ir of presumedDetail.items) {
        presumedAddedById.set(ir.id, ir.addedAmount);
      }
    }

    // 2-C 수정: calcHeirAllocation에 cutoff-필터된 증여만 전달 (§13 도과분 제외).
    //   cutoffFilteredGifts는 STEP 4.5에서 이미 계산 (단일 진실).
    heirAllocationResult = calcHeirAllocation({
      heirs: input.heirs,
      estateItems: input.estateItems,
      presumedItems: input.presumedItems ?? [],
      // 담보채무 §14 자동공제분을 협의분할 채무에 합산 (heirAllocations 비율 환산 완료)
      debtItems: [...(input.debtItems ?? []), ...toCollateralDebtItems(collateralDebts)],
      // H-34/M-8: 장례비 인별 안분 단일진실 — 엔진 총액(§9② floor·한도·비거주자 반영) 주입
      funeralDeduction,
      priorGifts: cutoffFilteredGifts,
      presumedAddedById,
      valuatedAmountById,
      taxBase,
      computedTax,
      generationSkipSurcharge,
      perHeirSurcharge,
      corporateExemption: corporateExemption?.amount ?? 0,
      corporateGiftTaxBase,
      grossEstateWithGifts: taxableEstateValue,
      isFiledOnTime: input.creditInput.isFiledOnTime,
      filingCreditRate: creditResult.filingCreditRate!, // §69 연도율 — 요약 단일진실(항상 설정·3% 고정 회귀 방지)
      // 작업4: 비과세 협의분할 — 인정 비과세액(itemResults[].exemptAmount)을 ruleId 키로 주입
      exemptionItems: input.exemptions ?? [],
      recognizedExemptByRuleId: new Map(
        (exemptionDetail?.itemResults ?? []).map((r) => [r.ruleId, r.exemptAmount]),
      ),
    });
    allBreakdown.push(...heirAllocationResult.breakdown);
  }

  // STEP 13.5: §69 신고세액공제를 배부표 per-heir round 합과 일치 (가드 충족 시).
  //   상세 근거·가드: inheritance-summary-reconcile.ts
  if (heirAllocationResult) {
    const r = reconcileSummaryWithAllocation(heirAllocationResult, creditResult, finalTax);
    creditResult.filingCredit = r.filingCredit;
    creditResult.filingCreditBase = r.filingCreditBase;
    creditResult.totalCredit = r.totalCredit;
    totalTaxCredit = r.totalCredit;
    finalTax = r.finalTax;
  }

  allBreakdown.push({
    label: "결정세액",
    amount: finalTax,
    note: "= 산출세액 + 세대생략할증 - 영리법인 면제 - 세액공제",
  });

  // Phase B5: summaryTable 조립 (PDF 표8 합계행 echo, 산식 변경 0)
  // heir-allocation-summary-table.engine.design.md §B5
  const corporateGiftTaxBaseForSummary = (preGifts ?? []).reduce(
    (sum, g) => sum + (g.beneficiaryType === "corporate" ? (g.giftTaxBase ?? g.giftAmount) : 0),
    0,
  );
  // ⑩b 합계열 — §3의2② 영리법인 면제 한도 = floor(산출세액 × 영리법인 과세표준 / 상속세 과세표준).
  //   영리법인은 §27 세대생략 할증 무관(상증령 §3① 면제 비율 산식에 할증 근거 없음, 세대 개념 부재).
  //   → generationSkipSurcharge 미포함 = perHeir corpLimit(inheritance-allocation.ts:492)와 단일화.
  //   (GAP-1 2026-06-07: 기존 PDF 표8 재현 anchor가 ⑨소계 할증포함을 곱한 277,943,123이었으나,
  //    사용자 결정 "법령 정합" → 할증 미포함 272,874,251로 정정. KoreanLaw 상증령 §3① mst283637.)
  const corporateExemptionLimitDisplay =
    corporateGiftTaxBaseForSummary > 0 && taxBase > 0
      ? Math.floor((computedTax * corporateGiftTaxBaseForSummary) / taxBase)
      : 0;
  const categoryTotals = (() => {
    const t = { financial: 0, realEstate: 0, stock: 0, other: 0 };
    for (const item of input.estateItems ?? []) {
      const cat = buildSummaryCategory(item);
      const valuated =
        valuationResults.find((v) => v.estateItemId === item.id)
          ?.valuatedAmount ?? 0;
      t[cat] += valuated;
    }
    return t;
  })();
  const summaryTable = heirAllocationResult
    ? {
        distributableTaxBase: heirAllocationResult.indirectDistributionBase,
        surchargeTargetTaxableValue:
          taxableEstateValue - nonHeirNonLegateeGifts,
        distributableTaxBaseAfterGifts:
          heirAllocationResult.computedTaxShareDenominator,
        corporateExemptionLimitDisplay,
        categoryTotals,
        totalExcludedFromTaxation: exemptAmount,
      }
    : undefined;

  // 가업상속공제 사후관리 트래킹 메타 (PR-2) — 가업공제 > 0 시 prefill 소스 set (계산 영향 0)
  const familyBusinessPostMgmtMeta = buildFamilyBusinessPostMgmtMeta({
    familyBusinessDeduction: deductionResult.familyBusinessDeduction,
    familyBusinessDetail: deductionResult.familyBusinessDetail,
    estateItems: input.estateItems,
    deathDate: input.deathDate,
    baseTaxableAmount: taxBase, // §18의2⑤ 추징 재계산 base (가업공제 적용 후 과세표준)
  });

  // STEP 12.5: §74 지정문화유산 등 징수유예 (상증령 §76① 비례 방식) — appended.
  //   finalTax(결정세액) 불변 — echo 필드로만 반환. 별지9호 ㉖ 표시 + ㊳(납부세액)에서만 차감.
  const culturalHeritageDeferral = calcCulturalHeritageDeferral({
    estateItems: input.estateItems,
    valuatedAmountById,
    computedTax,
    grossEstateValue,
    priorGiftAggregated,
  });
  if (culturalHeritageDeferral.lawApplied) {
    allBreakdown.push(...culturalHeritageDeferral.breakdown);
    allLaws.add(INH.CULTURAL_HERITAGE_DEFERRAL);
  }

  // STEP 12.6: 🔴 G-07 B1 — 신고불성실가산세 (「국세기본법」 §47의2·§47의3).
  //
  //   ⭐ **신고 단위 1회**다 — 상속인별로 안분하지 않는다. §47의2①의 base 는 「그 신고로
  //      납부하여야 할 세액」이고 상속세는 **1건의 신고**이므로, 가산세도 그 신고에 1회 붙는다.
  //      ⇒ `inheritance-allocation.ts`(상속인별 배부표)는 건드리지 않는다.
  //
  //   🔑 `finalTax`(결정세액)는 **불변**이다 — 별지9호 ㉔ 축이고 연부연납·분납 base 다.
  //      가산세는 별지9호 ㊱ 과 `totalPayableWithPenalty`(㊳)로만 나간다.
  const filingPenaltyResult = calcInheritanceGiftFilingPenalty(
    finalTax,
    input.filingPenalty ?? { filingStatus: "on_time" },
  );

  // 🔴 G-07 B3 — 납부지연가산세(「국세기본법」 §47의4). 신고불성실과 **독립**이다:
  //    §47의4①1호는 「법정납부기한까지 납부하지 아니한」 사실만 요건으로 하므로,
  //    정기·정확 신고를 했어도 납부가 늦으면 붙는다.
  const latePaymentResult = calcInheritanceGiftLatePayment(
    input.filingPenalty ?? { filingStatus: "on_time" },
  );
  const totalPenalty = filingPenaltyResult.filingPenalty + latePaymentResult.penalty;

  return {
    decedentType: input.decedentType, // M-17: 신고기한 §67④ 비거주자 9개월 표시용 echo
    grossEstateValue,
    exemptAmount,
    exemptionDetail,
    deductedBeforeAggregation,
    priorGiftAggregated,
    priorGiftToHeirTotal: heirOnlyGifts, // 물납 §73①1호 분모 echo (계산 불변)
    taxableEstateValue,
    totalDeduction,
    taxBase,
    appraisalFeeDeduction: appraisalFee.total,
    appraisalFeeDetail: appraisalFee,
    computedTax,
    computedTaxAppliedRate,
    computedTaxProgressiveDeduction,
    generationSkipSurcharge,
    generationSkipDetail,
    totalTaxCredit,
    finalTax,
    deductionDetail: deductionResult,
    creditDetail: creditResult,
    valuationResults,
    familyBusinessPostMgmtMeta,
    breakdown: allBreakdown,
    appliedLaws: Array.from(allLaws),
    warnings: allWarnings,
    appliedLawDate,
    // 종합사례 PDF 확장
    presumedInheritanceDetail: presumedDetail,
    corporateExemption,
    heirAllocationResult,
    collateralDebtDetail: collateralDebts.length > 0 ? collateralDebts : undefined,
    // Phase B5 echo
    summaryTable,
    // §74 징수유예 (echo — finalTax 불변, 별지9호 ㉖·㊳)
    culturalHeritageDeferredTax: culturalHeritageDeferral.deferredTax,
    culturalHeritageDeferralDetail: culturalHeritageDeferral.detail ?? undefined,
    // 🔴 G-07 B1 — 신고불성실가산세 (별지9호 ㊱). 입력이 없으면 0(종전 동작 보존).
    underreportPenalty: filingPenaltyResult.filingPenalty,
    ...(filingPenaltyResult.filingPenalty > 0 || filingPenaltyResult.exclusionApplied
      ? { filingPenaltyDetail: filingPenaltyResult }
      : {}),
    // 🔴 G-07 B3 — 납부지연가산세 (별지9호 ㊲)
    latePaymentPenalty: latePaymentResult.penalty,
    ...(latePaymentResult.penalty > 0 || latePaymentResult.exclusionApplied
      ? { latePaymentPenaltyDetail: latePaymentResult }
      : {}),
    ...(totalPenalty > 0 ? { totalPayableWithPenalty: finalTax + totalPenalty } : {}),
  };
}
