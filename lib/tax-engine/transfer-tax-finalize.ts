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
import { applyAnnualLimits, applyFiveYearLimits } from "./aggregate-reduction-limits";
import { TRANSFER } from "./legal-codes";
import { calculateBuildingPenalty, calcTax, calcReductions } from "./transfer-tax-rate-calc";
import {
  emitPenaltySteps,
  getReductionLegalBasis,
  buildMultiHouseSurchargeDetail,
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
    unsold982PreliminaryResult, unsold984PreliminaryResult,
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
    const { cappedByType: annuallyCappedByType, capInfoByType } = applyAnnualLimits(
      new Map([[reductionTypeApplied, reductionAmount]]),
    );
    const { fiveYearCappedByType, fiveYearCapInfoByType } = applyFiveYearLimits(
      annuallyCappedByType,
      priorUsage,
      input.transferDate.getFullYear(),
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
  const isEstimatedMode = input.useEstimatedAcquisition || input.usedEstimatedAcquisition;
  const effectiveEstimatedBase = estimatedBase || (input.usedEstimatedAcquisition ? (input.estimatedBase ?? 0) : 0);
  const penaltyBase = input.acquisitionMethod === "appraisal"
    ? (input.appraisalValue ?? 0)
    : (isEstimatedMode ? effectiveEstimatedBase : 0);
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
    ruralSurtax993,
    // STEP 8.5 5년 한도 반영값 — 결과 표시(결정세액 산식)와 일관 유지
    reductionAmount: cappedReductionAmount,
    reductionType,
    reductionTypeApplied,
    reducibleIncome,
    rentalReductionDetail,
    newHousingReductionDetail,
    publicExpropriationDetail,
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
  };
}

/**
 * 장기보유특별공제 보유기간 기산일 결정 — 사례 35.
 *
 * 사전법규재산 2022-684·881 / 서울행법 2012구단26961:
 *  - 다주택 상태에서 주택을 상가로 용도변경 후 양도 시 변경일 이전 기간은 LTHD 배제.
 *  - 1주택 상태 용도변경은 당초 취득일 기산.
 *
 * 본 함수는 `acquisitionDate`를 교체하지 않으며, LTHD 보유기간 산정 시점만 이동시킨다.
 * 취득가액·양도차익·필요경비 등 LTHD 외 모든 계산에는 영향 없음.
 */
export function resolveLTHDStartDate(input: TransferTaxInput): Date {
  // 사례 48 — 승계조합원 신축APT 양도 (관리처분 후 입주권 승계).
  // 사전-2019-법령해석재산-0649 + 시행령 §162①4호 — 보유기간 기산일 = 준공일.
  if (
    input.propertyType === "redevelopment_apt" &&
    input.redevelopment?.isSuccessorMember === true &&
    input.redevelopment?.completionDate
  ) {
    return input.redevelopment.completionDate;
  }

  // 사례 35 — 주택→상가 용도변경 (기존)
  if (!input.houseToCommercialConversion) return input.acquisitionDate;
  if (!input.wasMultiHouseAtConversion) return input.acquisitionDate;
  return input.conversionDate ?? input.acquisitionDate;
}

/**
 * LTHD + 세율 보유기간 통합 기산일 결정 (사례 48 도입).
 *
 * 단기세율 분기(§104①2/3호 — 1년/2년 미만)와 LTHD 보유기간 모두 동일 기산일 사용.
 * 현재는 resolveLTHDStartDate 와 동일 결과 — 후속 PR에서 분기 차이 발생 시 분리.
 */
export function getEffectiveAcquisitionDate(input: TransferTaxInput): Date {
  return resolveLTHDStartDate(input);
}

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
> {
  return {
    multiHouseSurchargeDetail: ctx.multiHouseSurchargeResult
      ? buildMultiHouseSurchargeDetail(ctx.multiHouseSurchargeResult)
      : undefined,
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

