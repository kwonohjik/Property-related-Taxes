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
import { applyAnnualLimits, applyFiveYearLimits, buildLimitGroups } from "./aggregate-reduction-limits";
import { TRANSFER } from "./legal-codes";
import { calculateBuildingPenalty, calcTax, calcReductions, resolveExtensionPenaltyBase } from "./transfer-tax-rate-calc";
import {
  emitPenaltySteps,
  getReductionLegalBasis,
  buildMultiHouseSurchargeDetail,
  calcTransferGain,
  type ParsedRates,
  type CommercialBuildingStepResult,
} from "./transfer-tax-helpers";
import type { NonBusinessLandJudgment } from "./non-business-land";
import type { Pre1990LandValuationResult } from "./pre-1990-land-valuation";
import type { CarryoverTaxationDetail } from "./types/transfer-carryover.types";
import type { InheritedAcquisitionStepResult } from "./inheritance-acquisition-helpers";
import type {
  TransferTaxInput,
  CalculationStep,
  TransferTaxResult,
} from "./types/transfer.types";
import type { New993Result } from "./transfer-reductions/new-99-3";
import type { New99Result } from "./transfer-reductions/new-99";
import type { Unsold988Result } from "./transfer-reductions/unsold-98-8";
import type { UnsoldHybridResult } from "./transfer-reductions/unsold-hybrid";
import type { MultiHouseSurchargeResult } from "./multi-house-surcharge";
import type { TransferTaxPenaltyResult } from "./transfer-tax-penalty";
import { computeAmendment } from "./transfer-tax-amendment";
import { resolveLTHDStartDate } from "./transfer-tax-lthd-start"; // 로컬 사용(buildExemptEarlyResult) — 421행 re-export와 별개
import type { AmendmentDetail } from "./types/transfer-amendment.types";

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
  /** 차감형 감면 전 양도소득금액 (산출세액 차감 비교 기준) */
  transferIncomeBefore993: number;
  new993PreliminaryResult?: New993Result;
  new99PreliminaryResult?: New99Result;
  unsold988PreliminaryResult?: Unsold988Result;
  /** 하이브리드 (P2 §98의7·§99의2 + P3 §98의3·§98의5·§98의6) — router 평가 결과 */
  unsold987PreliminaryResult?: UnsoldHybridResult;
  unsold992PreliminaryResult?: UnsoldHybridResult;
  unsold983PreliminaryResult?: UnsoldHybridResult;
  unsold985PreliminaryResult?: UnsoldHybridResult;
  unsold986PreliminaryResult?: UnsoldHybridResult;
  unsold982PreliminaryResult?: UnsoldHybridResult;
  unsold984PreliminaryResult?: UnsoldHybridResult;
  unsold98PreliminaryResult?: UnsoldHybridResult;
}

export interface FinalizeResult {
  // 농특세 (차감형 — §99의3·§99·§98의8 중 적용 1건)
  new993FinalResult?: New993Result;
  new99FinalResult?: New99Result;
  unsold988FinalResult?: Unsold988Result;
  // 하이브리드 (P2+P3) — 농특세 채움 후 최종 detail
  unsold987FinalResult?: UnsoldHybridResult;
  unsold992FinalResult?: UnsoldHybridResult;
  unsold983FinalResult?: UnsoldHybridResult;
  unsold985FinalResult?: UnsoldHybridResult;
  unsold986FinalResult?: UnsoldHybridResult;
  unsold982FinalResult?: UnsoldHybridResult;
  unsold984FinalResult?: UnsoldHybridResult;
  unsold98FinalResult?: UnsoldHybridResult;
  ruralSurtax993: number;
  // 감면 (calcReductions return의 fan-out)
  reductionAmount: number;
  reductionType: ReturnType<typeof calcReductions>["reductionType"];
  reductionTypeApplied: ReturnType<typeof calcReductions>["reductionTypeApplied"];
  reducibleIncome?: number;
  rentalReductionDetail: TransferTaxResult["rentalReductionDetail"];
  newHousingReductionDetail: TransferTaxResult["newHousingReductionDetail"];
  publicExpropriationDetail: TransferTaxResult["publicExpropriationDetail"];
  gbDesignatedLandDetail: TransferTaxResult["gbDesignatedLandDetail"];
  replacementLandDetail: TransferTaxResult["replacementLandDetail"];
  selfFarmingReductionDetail: TransferTaxResult["selfFarmingReductionDetail"];
  rental97TaxDetail: TransferTaxResult["rental97TaxDetail"];
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
  // 수정신고 (input.amendment 제공 시)
  amendmentDetail?: AmendmentDetail;
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
    new99PreliminaryResult, unsold988PreliminaryResult,
    unsold987PreliminaryResult, unsold992PreliminaryResult,
    unsold983PreliminaryResult, unsold985PreliminaryResult, unsold986PreliminaryResult,
    unsold982PreliminaryResult, unsold984PreliminaryResult, unsold98PreliminaryResult,
  } = args;

  // ── STEP 7.5: 차감형 감면(§99의3·§99·§98의8 + 하이브리드 5년 후) 농어촌특별세 — 2-pass 공통 ──
  // 농특세법 §2①1호 "소득공제" 해당 — 감면 전후 산출세액 차 × 20% (§99의3 선례 일반화, P1·P2)
  let new993FinalResult: New993Result | undefined = new993PreliminaryResult;
  let new99FinalResult: New99Result | undefined = new99PreliminaryResult;
  let unsold988FinalResult: Unsold988Result | undefined = unsold988PreliminaryResult;
  let unsold987FinalResult: UnsoldHybridResult | undefined = unsold987PreliminaryResult;
  let unsold992FinalResult: UnsoldHybridResult | undefined = unsold992PreliminaryResult;
  let unsold983FinalResult: UnsoldHybridResult | undefined = unsold983PreliminaryResult;
  let unsold985FinalResult: UnsoldHybridResult | undefined = unsold985PreliminaryResult;
  let unsold986FinalResult: UnsoldHybridResult | undefined = unsold986PreliminaryResult;
  // P4: §98의2(특칙 전용)·§98의4(단일 세액감면) — 2-pass 비대상, 그대로 echo (§98의4는 STEP 8.7)
  const unsold982FinalResult: UnsoldHybridResult | undefined = unsold982PreliminaryResult;
  let unsold984FinalResult: UnsoldHybridResult | undefined = unsold984PreliminaryResult;
  // P5: §98 (세율 20% 특례) — 2-pass·STEP 8.7 비대상, 그대로 echo
  const unsold98FinalResult: UnsoldHybridResult | undefined = unsold98PreliminaryResult;
  let ruralSurtax993 = 0;
  // 하이브리드는 5년 후(income_deduction)만 2-pass — 5년 내(tax_amount)는 STEP 8.7
  const hybridIncomePrelims = [
    unsold987PreliminaryResult, unsold992PreliminaryResult,
    unsold983PreliminaryResult, unsold985PreliminaryResult, unsold986PreliminaryResult,
  ].filter((d) => d?.isEligible && d.effectCategory === "income_deduction");
  const activePrelim = [
    new993PreliminaryResult, new99PreliminaryResult, unsold988PreliminaryResult,
    ...hybridIncomePrelims,
  ].find((d) => d?.isEligible);
  if (activePrelim) {
    const articleLabel =
      activePrelim === unsold988PreliminaryResult ? "§98의8"
      : activePrelim === new99PreliminaryResult ? "§99"
      : activePrelim === unsold987PreliminaryResult ? "§98의7"
      : activePrelim === unsold992PreliminaryResult ? "§99의2"
      : activePrelim === unsold983PreliminaryResult ? "§98의3"
      : activePrelim === unsold985PreliminaryResult ? "§98의5"
      : activePrelim === unsold986PreliminaryResult ? "§98의6"
      : "§99의3";
    // 농특세 비과세 (농특세령 §4⑦1호 — §98의3·§98의5): 차감 효과는 유지, 농특세만 0
    const isExempt =
      "ruralSurtaxExempt" in activePrelim! && (activePrelim as UnsoldHybridResult).ruralSurtaxExempt;
    const taxBaseBefore993 = Math.max(0, transferIncomeBefore993 - basicDeduction);
    const taxResultBefore993 = calcTax(taxBaseBefore993, parsedRates, taxRateInput, multiHouseSurchargeResult);
    const taxReduction993 = Math.max(0, taxResultBefore993.calculatedTax - taxResult.calculatedTax);
    ruralSurtax993 = isExempt ? 0 : applyRate(taxReduction993, 0.2);
    const surtaxFields = { taxReductionForRuralSurtax: taxReduction993, ruralSurtax: ruralSurtax993 };
    if (activePrelim === new993PreliminaryResult) new993FinalResult = { ...new993PreliminaryResult!, ...surtaxFields };
    else if (activePrelim === new99PreliminaryResult) new99FinalResult = { ...new99PreliminaryResult!, ...surtaxFields };
    else if (activePrelim === unsold987PreliminaryResult) unsold987FinalResult = { ...unsold987PreliminaryResult!, ...surtaxFields };
    else if (activePrelim === unsold992PreliminaryResult) unsold992FinalResult = { ...unsold992PreliminaryResult!, ...surtaxFields };
    else if (activePrelim === unsold983PreliminaryResult) unsold983FinalResult = { ...unsold983PreliminaryResult!, ...surtaxFields };
    else if (activePrelim === unsold985PreliminaryResult) unsold985FinalResult = { ...unsold985PreliminaryResult!, ...surtaxFields };
    else if (activePrelim === unsold986PreliminaryResult) unsold986FinalResult = { ...unsold986PreliminaryResult!, ...surtaxFields };
    else unsold988FinalResult = { ...unsold988PreliminaryResult!, ...surtaxFields };
    if (taxReduction993 > 0 && !isExempt) {
      steps.push({
        label: `${articleLabel} 농어촌특별세 (감면세액 × 20%)`,
        formula: `(감면 전 산출세액 ${taxResultBefore993.calculatedTax.toLocaleString()} − 감면 후 산출세액 ${taxResult.calculatedTax.toLocaleString()}) × 20% = ${ruralSurtax993.toLocaleString()}`,
        amount: ruralSurtax993,
        legalBasis: TRANSFER.RURAL_SURTAX_993,
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
    gbDesignatedLandDetail,
    replacementLandDetail,
    selfFarmingReductionDetail,
    rental97TaxDetail,
    hybridTaxDetail,
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
    // Phase 2 (2026-06-11): §97의2·§97의5 시한 — 매매계약일 우선
    input.assetContractDate,
  );
  steps.push({
    label: "감면세액",
    formula: reductionType ? `${reductionType} 감면 ${reductionAmount.toLocaleString()}` : "감면 없음",
    amount: reductionAmount,
    legalBasis: getReductionLegalBasis(reductionType, publicExpropriationDetail?.useLegacyRates),
  });

  // ── STEP 8.5: §133② 5년 누적 한도 — 과거 4개 과세연도 감면 이력 차감 ──
  // aggregate 경로(2자산 이상·일반건물 dispatch)는 transfer-tax-aggregate.ts M-8에서
  // 동일 모듈(applyFiveYearLimits)로 별도 적용 — per-asset 입력에는 이력이 없어 이중 차감 없음.
  let cappedReductionAmount = reductionAmount;
  const priorUsage = input.priorReductionUsage ?? [];
  if (reductionAmount > 0 && reductionTypeApplied && priorUsage.length > 0) {
    // 연간 한도 선처리 — applyFiveYearLimits 인자 계약("연간 캡 적용 후 값") 준수.
    // 현행 자경·공익수용은 calcReductions 내부에서 이미 연간 캡이 적용되어 등가(no-op)이나,
    // 내부 캡 없는 감면 유형이 향후 추가될 때 silent 과감면을 방지한다.
    // §133 한도는 양도연도 분기 그룹(2025+ §77 그룹 2억/3억, 이전 1억/2억)으로 적용.
    const limitGroups = buildLimitGroups(input.transferDate.getFullYear());
    const { cappedByType: annuallyCappedByType, capInfoByType } = applyAnnualLimits(
      new Map([[reductionTypeApplied, reductionAmount]]),
      limitGroups,
    );
    const { fiveYearCappedByType, fiveYearCapInfoByType } = applyFiveYearLimits(
      annuallyCappedByType,
      priorUsage,
      input.transferDate.getFullYear(),
      limitGroups,
    );
    const fiveInfo = fiveYearCapInfoByType.get(reductionTypeApplied);
    const annualInfo = capInfoByType.get(reductionTypeApplied);
    const capped = fiveYearCappedByType.get(reductionTypeApplied) ?? reductionAmount;
    if (capped < reductionAmount) {
      steps.push({
        label: "§133 종합한도",
        formula: fiveInfo?.cappedByFiveYear
          ? `감면세액 ${reductionAmount.toLocaleString()} → ${capped.toLocaleString()} (5년 한도 ${fiveInfo.fiveYearLimit.toLocaleString()} − 과거 4개 연도 누적 ${fiveInfo.priorGroupSum.toLocaleString()} = 잔여 ${fiveInfo.remaining.toLocaleString()})`
          : `감면세액 ${reductionAmount.toLocaleString()} → ${capped.toLocaleString()} (연간 한도 ${Number.isFinite(annualInfo?.annualLimit) ? annualInfo!.annualLimit.toLocaleString() : ""})`,
        amount: capped,
        legalBasis: fiveInfo?.cappedByFiveYear ? fiveInfo.legalBasis : annualInfo?.legalBasis ?? "",
      });
      cappedReductionAmount = capped;
    }
  }

  // ── STEP 8.7: 하이브리드(§98의7·§99의2) 5년 내 세액감면 농어촌특별세 — 감면세액 × 20% ──
  // 농특세법 §2①1호 "조특법에 따라 감면받는 세액". §98의3·§98의5(P3)는 농특세령 §4⑦1호 비과세 —
  // 본 2조문은 비과세 열거 없음 (plan §2-1).
  let ruralSurtaxHybrid = 0;
  const HYBRID_ARTICLE: Record<string, string> = {
    unsold_98_7: "§98의7", unsold_99_2: "§99의2",
    unsold_98_3: "§98의3", unsold_98_5: "§98의5", unsold_98_6: "§98의6",
    unsold_98_4: "§98의4",
  };
  if (
    reductionTypeApplied !== undefined &&
    HYBRID_ARTICLE[reductionTypeApplied] !== undefined &&
    cappedReductionAmount > 0
  ) {
    // 농특세 비과세 (농특세령 §4⑦1호): §98의3·§98의5 — evaluator의 exempt 플래그 단일 진실
    const isExemptTax = hybridTaxDetail?.ruralSurtaxExempt === true;
    ruralSurtaxHybrid = isExemptTax ? 0 : applyRate(cappedReductionAmount, 0.2);
    if (!isExemptTax) {
      steps.push({
        label: `${HYBRID_ARTICLE[reductionTypeApplied]} 농어촌특별세 (감면세액 × 20%)`,
        formula: `감면세액 ${cappedReductionAmount.toLocaleString()} × 20% = ${ruralSurtaxHybrid.toLocaleString()}`,
        amount: ruralSurtaxHybrid,
        legalBasis: "농어촌특별세법 §5①1호",
      });
    }
    // 최종 detail에 감면액·농특세 echo (calcReductions 평가본 우선 — reductionAmount 보유)
    if (hybridTaxDetail && hybridTaxDetail.id === reductionTypeApplied) {
      const merged: UnsoldHybridResult = {
        ...hybridTaxDetail,
        reductionAmount: cappedReductionAmount,
        taxReductionForRuralSurtax: isExemptTax ? 0 : cappedReductionAmount,
        ruralSurtax: ruralSurtaxHybrid,
      };
      if (merged.id === "unsold_98_7") unsold987FinalResult = merged;
      else if (merged.id === "unsold_99_2") unsold992FinalResult = merged;
      else if (merged.id === "unsold_98_3") unsold983FinalResult = merged;
      else if (merged.id === "unsold_98_5") unsold985FinalResult = merged;
      else if (merged.id === "unsold_98_4") unsold984FinalResult = merged;
      else unsold986FinalResult = merged;
    }
  }

  // ── STEP 9: 결정세액 = 산출세액 - 감면 (원 미만 절사) ──
  const determinedTax = truncateToWon(Math.max(0, taxResult.calculatedTax - cappedReductionAmount));
  steps.push({
    label: "결정세액",
    formula: `산출세액 ${taxResult.calculatedTax.toLocaleString()} - 감면 ${cappedReductionAmount.toLocaleString()} (원 미만 절사)`,
    amount: determinedTax,
    legalBasis: TRANSFER.FINAL_TAX,
  });

  // ── STEP 10.5: §114조의2 신축·증축 가산세 (step은 STEP 12에서 통합 emit) ──
  // penaltyBase: 환산취득가 모드 = estimatedBase 사용
  //   - useEstimatedAcquisition: true  → 단건 엔진 calcTransferGain() 결과 estimatedBase (FinalizeArgs)
  //   - usedEstimatedAcquisition: true → aggregate 경로(일반건물 등) — calcTransferGain 미경유.
  //     이때 estimatedBase(args)=0이므로 input.estimatedBase(카드에서 전달된 값)를 fallback.
  // 부담부증여 K-5 신축(§114조의2): step override가 effectiveInput에 usedEstimatedAcquisition·
  // estimatedBase(건물분 환산취득가)를 실어보냄 → 원본 input 외 effectiveInput도 penalty base 인식.
  const isEstimatedMode =
    input.useEstimatedAcquisition || input.usedEstimatedAcquisition || effectiveInput.usedEstimatedAcquisition;
  const effectiveEstimatedBase =
    estimatedBase ||
    (input.usedEstimatedAcquisition ? (input.estimatedBase ?? 0) : 0) ||
    (effectiveInput.usedEstimatedAcquisition ? (effectiveInput.estimatedBase ?? 0) : 0);
  // ⚠️ acquisitionMethod 판정은 **effectiveInput**을 본다(원본 input 아님).
  // 부담부증여는 §159 스텝이 acquisitionMethod를 정규화하는데(burdened-gift-step: "actual",
  // K-5는 "estimated"), 원본 input에는 UI가 숨긴 채 보존한 stale 산정방식(감정·매매사례)이 남아 있다.
  // input을 보면 K-5 + stale 감정가액에서 penalty base가 K-5 건물 환산취득가 대신
  // stale appraisalValue로 뒤바뀐다(실측: 2,500,000 → 45,000,000, 18배 과다).
  // 회귀 0 근거: 비-부담부에도 override가 1곳 있으나(transfer-tax-carryover.ts:261 — 환산+증여세 차감
  // 시나리오 A의 실가 전환에서 undefined), 발동 게이트인 calculateBuildingPenalty가 **이미**
  // effectiveInput.acquisitionMethod를 읽으므로(rate-calc.ts:58·63-66) 그 경로는 penaltyTax=0으로 수렴한다.
  // 즉 종전에는 "게이트는 effectiveInput / base는 raw input"으로 층위가 어긋나 있었고 이 변경이 그 불일치를 없앤다.
  let penaltyBase = effectiveInput.acquisitionMethod === "appraisal"
    ? (effectiveInput.appraisalValue ?? 0)
    : (isEstimatedMode ? effectiveEstimatedBase : 0);
  // §114조의2① 통상(비-부담부) 증축: penalty base를 증축부분 환산취득가로 교체 (부담부는 step override가 effectiveInput.estimatedBase에 반영).
  // 손실 조기반환(transfer-tax.ts)과 동일 헬퍼 — single-source, dual-truth 방지.
  penaltyBase = resolveExtensionPenaltyBase(input, penaltyBase);
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
  const ruralSurtaxTotal = ruralSurtax993 + ruralSurtaxHybrid;
  const totalTax = determinedTaxWithPenalty + localIncomeTax + filingDelayedPenalty + ruralSurtaxTotal;
  steps.push({
    label: "총 납부세액",
    formula: `${totalAllPenalty > 0 ? "총결정세액" : "결정세액"} ${(determinedTax + totalAllPenalty).toLocaleString()} + 지방소득세 ${localIncomeTax.toLocaleString()}${ruralSurtaxTotal > 0 ? ` + 농특세 ${ruralSurtaxTotal.toLocaleString()}` : ""}`,
    amount: totalTax,
    legalBasis: `${TRANSFER.FINAL_TAX} + ${TRANSFER.LOCAL_INCOME_TAX}`,
  });

  // ── STEP 12.5: 수정신고(경정) — 추가납부세액 + 선택적 가산세 (끝 append) ──
  // 당초 결정세액은 입력값, 수정 결정세액은 이번 run → 2-pass 불필요.
  const amendmentDetail = input.amendment
    ? computeAmendment(input.amendment, determinedTax)
    : undefined;
  if (amendmentDetail) {
    for (const s of amendmentDetail.steps) steps.push({ ...s, sub: s.sub ?? true });
  }

  return {
    new993FinalResult,
    new99FinalResult,
    unsold988FinalResult,
    unsold987FinalResult,
    unsold992FinalResult,
    unsold983FinalResult,
    unsold985FinalResult,
    unsold986FinalResult,
    unsold982FinalResult,
    unsold984FinalResult,
    unsold98FinalResult,
    ruralSurtax993,
    // STEP 8.5 5년 한도 반영값 — 결과 표시(결정세액 산식)와 일관 유지
    reductionAmount: cappedReductionAmount,
    reductionType,
    reductionTypeApplied,
    reducibleIncome,
    rentalReductionDetail,
    newHousingReductionDetail,
    publicExpropriationDetail,
    gbDesignatedLandDetail,
    replacementLandDetail,
    selfFarmingReductionDetail,
    rental97TaxDetail,
    determinedTax,
    penaltyTax,
    penaltyBase,
    determinedTaxWithPenalty,
    localIncomeTax,
    penaltyDetail,
    filingDelayedPenalty,
    totalAllPenalty,
    totalTax,
    amendmentDetail,
  };
}

// LTHD/세율 보유기간 기산일 결정(사례 35·48)은 transfer-tax-lthd-start.ts로 이동했다
// (리뷰 Low #8 — rate-calc ↔ finalize 순환 import 해소). 하위 호환을 위해 re-export 유지.
export { resolveLTHDStartDate, getEffectiveAcquisitionDate } from "./transfer-tax-lthd-start";

/**
 * 결과 detail 필드 공통 빌더 — 조기 반환(비과세·손실)과 정상 반환의 detail 누락 방지.
 *
 * 각 detail은 해당 STEP 변수가 존재할 때만 채운다. 조기 반환 시점에 아직
 * 선언되지 않은 변수(cbStep·splitDetail 등)는 호출측에서 ctx에 생략하면 undefined로 처리된다.
 */
export function buildTransferResultDetails(ctx: {
  multiHouseSurchargeResult?: MultiHouseSurchargeResult;
  nonBusinessLandJudgment?: NonBusinessLandJudgment;
  pre1990LandResult?: Pre1990LandValuationResult;
  carryoverDetail?: CarryoverTaxationDetail;
  inheritedAcquisitionStep?: InheritedAcquisitionStepResult;
  cbStep?: CommercialBuildingStepResult;
  splitDetail?: TransferTaxResult["splitDetail"];
}): Pick<
  TransferTaxResult,
  | "multiHouseSurchargeDetail"
  | "nonBusinessLandJudgmentDetail"
  | "pre1990LandValuationDetail"
  | "carryoverTaxationDetail"
  | "inheritedAcquisitionDetail"
  | "inheritedHouseValuationDetail"
  | "commercialBuildingValuationDetail"
  | "splitDetail"
  | "preHousingDisclosureDetail"
  | "surchargeSuspensionBasis"
  | "surchargeSuspensionDeadline"
> {
  return {
    multiHouseSurchargeDetail: ctx.multiHouseSurchargeResult
      ? buildMultiHouseSurchargeDetail(ctx.multiHouseSurchargeResult)
      : undefined,
    // ⑦ echo — 중과 유예 근거 목(가/나/다)·양도기한 (§167의3①12의2 나·다목 UI 표시용)
    surchargeSuspensionBasis: ctx.multiHouseSurchargeResult?.surchargeSuspensionBasis,
    surchargeSuspensionDeadline: ctx.multiHouseSurchargeResult?.surchargeSuspensionDeadline,
    nonBusinessLandJudgmentDetail: ctx.nonBusinessLandJudgment,
    pre1990LandValuationDetail: ctx.pre1990LandResult,
    carryoverTaxationDetail: ctx.carryoverDetail,
    inheritedAcquisitionDetail: ctx.inheritedAcquisitionStep?.result,
    inheritedHouseValuationDetail: ctx.inheritedAcquisitionStep?.houseValuationResult,
    commercialBuildingValuationDetail: ctx.cbStep?.detail,
    splitDetail: ctx.splitDetail ?? undefined,
    preHousingDisclosureDetail: ctx.splitDetail?.preHousingDisclosureDetail,
  };
}

/**
 * STEP 1a 전액 비과세 조기반환 결과 조립 (transfer-tax.ts에서 격리 — 800줄 정책).
 * finalize 미경유 경로이므로 amendmentDetail(refund 전액환급 F1)·detail 카드를 여기서 부착.
 * detail 3종은 TransferTaxResult 인덱스 타입으로 참조(underlying 타입 import 불필요).
 */
export function buildExemptEarlyResult(p: {
  input: TransferTaxInput;
  effectiveInput: TransferTaxInput;
  steps: CalculationStep[];
  exemptReason: TransferTaxResult["exemptReason"];
  new994Detail: TransferTaxResult["new994Detail"];
  unsold989Detail: TransferTaxResult["unsold989Detail"];
  specialHouseExclusionDetail: TransferTaxResult["specialHouseExclusionDetail"];
  warnings: TransferTaxResult["warnings"];
  multiHouseSurchargeResult?: MultiHouseSurchargeResult;
  nonBusinessLandJudgment?: NonBusinessLandJudgment;
  pre1990LandResult?: Pre1990LandValuationResult;
  carryoverDetail?: CarryoverTaxationDetail;
  inheritedAcquisitionStep?: InheritedAcquisitionStepResult;
}): TransferTaxResult {
  // [echo] 표시 전용 gross 양도차익 + 환산 내역 — 세액 로직·transferGain(0) 불변. 순수함수 calcTransferGain 1회 호출.
  // 환산 echo 미노출 시 신고서가 실가 역산 분기로 추락해 취득가액에 개산공제가 합산 표시됨(분리표시 정책 위반).
  const grossForEcho = calcTransferGain(p.effectiveInput);
  return {
    isExempt: true,
    // [F1] 경정 결과 비과세 → refund면 전액환급 산출(determinedTax=0)
    amendmentDetail: p.input.amendment ? computeAmendment(p.input.amendment, 0) : undefined,
    exemptReason: p.exemptReason,
    new994Detail: p.new994Detail,
    unsold989Detail: p.unsold989Detail,
    specialHouseExclusionDetail: p.specialHouseExclusionDetail,
    warnings: p.warnings,
    transferGain: 0,
    exemptGrossGain: Math.max(0, grossForEcho.gain),
    taxableGain: 0,
    usedEstimatedAcquisition: p.effectiveInput.useEstimatedAcquisition,
    ...(grossForEcho.usedEstimated
      ? { estimatedBase: grossForEcho.estimatedBase, estimatedDeduction: grossForEcho.estimatedDeduction }
      : {}),
    longTermHoldingDeduction: 0,
    longTermHoldingRate: 0,
    lthdStartDate: resolveLTHDStartDate(p.effectiveInput),
    basicDeduction: 0,
    taxBase: 0,
    appliedRate: 0,
    progressiveDeduction: 0,
    calculatedTax: 0,
    isSurchargeSuspended: false,
    reductionAmount: 0,
    determinedTax: 0,
    penaltyTax: 0,
    penaltyBase: 0,
    localIncomeTax: 0,
    totalTax: 0,
    steps: p.steps,
    ...buildTransferResultDetails({
      multiHouseSurchargeResult: p.multiHouseSurchargeResult,
      nonBusinessLandJudgment: p.nonBusinessLandJudgment,
      pre1990LandResult: p.pre1990LandResult,
      carryoverDetail: p.carryoverDetail,
      inheritedAcquisitionStep: p.inheritedAcquisitionStep,
    }),
  };
}

