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
import { applyReductionStatutoryCap } from "./transfer-tax-reduction-cap";
import { resolveTaxCreditRuralSurtax, HYBRID_ARTICLE } from "./transfer-tax-rural-surtax";
import { TRANSFER } from "./legal-codes";
import { calculateBuildingPenalty, calcTax, calcReductions, resolveExtensionPenaltyBase } from "./transfer-tax-rate-calc";
import { resolveSplitAwareTax } from "./transfer-tax-split-rate";
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

/**
 * §99의3 2-pass 후 formulaSteps의 농특세 관련 두 step(preliminary 세액 0)을 확정값으로 교체.
 * computeNew993는 preliminary 호출 시 calculatedTaxBefore/After=0으로 push → finalize에서 실값 반영.
 */
function patchNew993SurtaxSteps(
  steps: New993Result["formulaSteps"],
  taxBefore: number,
  taxAfter: number,
  reduction: number,
  ruralSurtax: number,
): New993Result["formulaSteps"] {
  return steps.map((s) => {
    if (s.label === "양도세 감면세액 (농특세 기준)") {
      return {
        ...s,
        value: reduction,
        formula: `감면 전 산출세액 ${taxBefore.toLocaleString()} − 감면 후 산출세액 ${taxAfter.toLocaleString()} = ${reduction.toLocaleString()}`,
      };
    }
    if (s.label === "농어촌특별세 (20%)") {
      return {
        ...s,
        value: ruralSurtax,
        formula: `감면세액 ${reduction.toLocaleString()} × 20% = ${ruralSurtax.toLocaleString()}`,
      };
    }
    return s;
  });
}

/**
 * 🔴 **§114조의2 — 토지·건물 분리 자산의 판정 축은 「건물 파트」다** (2026-08-13).
 *
 * 「소득세법」 제114조의2 제1항은 base를 **「해당 건물의」 감정가액 또는 환산취득가액**으로
 * 명시한다(증축은 증축 부분 한정). 그런데 분리(§166⑥) 자산에서 게이트·base는 둘 다
 * **자산-수준** 값에서 왔다:
 *
 *   · 게이트: `calculateBuildingPenalty`가 읽는 `acquisitionMethod` — 파트 라디오
 *     (`landAcqMode`/`buildingAcqMode`)는 이 값을 갱신하지 않는다. 건물 파트가 환산이어도
 *     자산-수준이 실가면 **가산세가 발동하지 않는다**(실측: 0원).
 *   · base: `calcTransferGain`의 split 분기가 `estimatedBase = 토지 + 건물 합계`를 낸다.
 *     자산-수준을 환산으로 돌려 게이트를 켜면 이번엔 **토지 실취득가까지 base에 섞인다**
 *     (실측: 425,000,000 × 5% = 21,250,000 — 법정 정답 225,000,000 × 5% = 11,250,000의 약 1.9배).
 *
 * ⇒ 두 값을 **파트-국소 신호**(`SplitPartResult.acqMode`·`acquisitionPrice`)에서 가져온다.
 *   자산-수준 `useEstimatedAcquisition`을 파트에서 역파생하는 방식은 **채택하지 않는다** —
 *   그 플래그의 소비 지점이 이 엔진 안에만 35곳이고(split-gain `deriveLegacyAcqMode`의 모드
 *   미지정 파트 자동 환산 승격 · helpers `estimatedBase` 합계화 · 상가 STEP 0.35 · 공익수용
 *   평가 · 재개발), 과소를 과대로 바꿀 뿐이다. 같은 교리를 이미 쓰는 선례는
 *   `app/api/calc/transfer/general-building-route-cards.ts`(카드가 속한 파트의 축만 싣는다).
 *
 * 건물 파트가 실가·매매사례이면 `undefined`를 반환해 **종전 자산-수준 경로를 그대로 둔다**
 * (§114조의2 대상이 아니므로 `calculateBuildingPenalty`가 어차피 null을 낸다).
 *
 * ⚠️ 손실 조기반환 경로(`transfer-tax.ts` — §114조의2②, 산출세액 0에도 적용)는 **아직 이 축을
 *    쓰지 않는다**. 그쪽도 같은 불일치를 갖고 있으므로 배선할 때 이 함수를 재사용할 것
 *    (재구현하면 dual-truth가 된다 — `resolveExtensionPenaltyBase`와 같은 이유로 export한다).
 */
export function resolveSplitBuildingPenaltyAxis(
  splitDetail: TransferTaxResult["splitDetail"],
): { acquisitionMethod: "estimated" | "appraisal"; base: number } | undefined {
  const mode = splitDetail?.building.acqMode;
  if (mode !== "estimated" && mode !== "appraisal") return undefined;
  return { acquisitionMethod: mode, base: splitDetail!.building.acquisitionPrice };
}

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
  /** 토지·건물 분리 결과 — 감면 전 산출세액 재계산도 파트별 세율을 따라야 한다(§104⑤ 이중 진실 방지) */
  splitDetailForRate?: TransferTaxResult["splitDetail"];
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
    transferIncomeBefore993, splitDetailForRate, new993PreliminaryResult,
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
    // 감면 전 산출세액도 STEP 7과 같은 경로로 구한다 — split 자산에서 여기만 자산 단위
    // 단일세율로 남으면 농특세 기초(감면액)가 과대·과소가 된다(이중 진실).
    const taxResultBefore993 = resolveSplitAwareTax({
      taxBase: taxBaseBefore993,
      transferIncome: transferIncomeBefore993,
      basicDeduction,
      splitDetail: splitDetailForRate,
      parsedRates,
      taxRateInput,
      multiHouseSurchargeResult,
    });
    const taxReduction993 = Math.max(0, taxResultBefore993.calculatedTax - taxResult.calculatedTax);
    ruralSurtax993 = isExempt ? 0 : applyRate(taxReduction993, 0.2);
    const surtaxFields = { taxReductionForRuralSurtax: taxReduction993, ruralSurtax: ruralSurtax993 };
    if (activePrelim === new993PreliminaryResult)
      new993FinalResult = {
        ...new993PreliminaryResult!,
        ...surtaxFields,
        // preliminary formulaSteps의 농특세 관련 두 step은 세액 0(2-pass 前) → 확정값으로 교체.
        formulaSteps: patchNew993SurtaxSteps(
          new993PreliminaryResult!.formulaSteps,
          taxResultBefore993.calculatedTax,
          taxResult.calculatedTax,
          taxReduction993,
          ruralSurtax993,
        ),
      };
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
  // 규칙은 `transfer-tax-reduction-cap.ts` 단일 소스 — §155⑳ 특례 경로와 공용이다(F08).
  // aggregate 경로(2자산 이상·일반건물 dispatch)는 transfer-tax-aggregate.ts M-8에서
  // 동일 모듈(applyFiveYearLimits)로 별도 적용 — per-asset 입력에는 이력이 없어 이중 차감 없음.
  const cap = applyReductionStatutoryCap({
    reductionAmount,
    reductionTypeApplied,
    transferYear: input.transferDate.getFullYear(),
    priorUsage: input.priorReductionUsage ?? [],
  });
  const cappedReductionAmount = cap.cappedAmount;
  if (cap.step) steps.push(cap.step);

  // ── STEP 8.7: 하이브리드(§98의7·§99의2) 5년 내 세액감면 농어촌특별세 — 감면세액 × 20% ──
  // 농특세법 §2①1호 "조특법에 따라 감면받는 세액". §98의3·§98의5(P3)는 농특세령 §4⑦1호 비과세 —
  // 본 2조문은 비과세 열거 없음 (plan §2-1).
  let ruralSurtaxHybrid = 0;
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
  // 🔴 **토지·건물 분리 자산은 「건물 파트」가 §114조의2의 축이다** (2026-08-13).
  //    `resolveSplitBuildingPenaltyAxis` 참조 — 게이트(산정방식)·base 둘 다 건물 파트에서 온다.
  const splitPenaltyAxis = resolveSplitBuildingPenaltyAxis(splitDetailForRate);
  let penaltyBase = splitPenaltyAxis
    ? splitPenaltyAxis.base
    : effectiveInput.acquisitionMethod === "appraisal"
      ? (effectiveInput.appraisalValue ?? 0)
      : (isEstimatedMode ? effectiveEstimatedBase : 0);
  // §114조의2① 통상(비-부담부) 증축: penalty base를 증축부분 환산취득가로 교체 (부담부는 step override가 effectiveInput.estimatedBase에 반영).
  // 손실 조기반환(transfer-tax.ts)과 동일 헬퍼 — single-source, dual-truth 방지.
  penaltyBase = resolveExtensionPenaltyBase(input, penaltyBase);
  const penaltyResult = calculateBuildingPenalty(
    splitPenaltyAxis
      ? { ...effectiveInput, acquisitionMethod: splitPenaltyAxis.acquisitionMethod }
      : effectiveInput,
    penaltyBase,
  );
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
  /**
   * ── STEP 8.8: 세액감면형 감면의 농어촌특별세 (감면세액 × 20%) ──────────────
   *
   * 「농어촌특별세법」 §5①1호가 **조특법 감면세액 × 20%**를 농특세로 정하는데, 종전에는
   * **차감형(§99의3)과 하이브리드(§98의7·§99의2 등)에만** 계산하고 §77·§77의2·§77의3·§97 시리즈
   * 에는 **아예 계산하지 않았다**(실측: §77 감면 67,700,250에 농특세 0).
   *
   * 비과세는 **열거주의**다 — 농특세령 §4①1호가 「§66부터 §70까지 … §77[**직접 경작한 토지**로
   * 한정] …」로 열거하므로, §69 자경농지는 무조건 비과세이고 §77은 조건부이며 그 밖의 조문
   * (§77의2·§77의3·§97 시리즈)은 **과세**다. 판정은 `transfer-tax-rural-surtax.ts` 단일 소스.
   *
   * ⚠️ 하이브리드는 **위 STEP 8.7이 이미 계산**했으므로 여기서 제외한다(이중 부과 방지).
   */
  let ruralSurtaxCredit = 0;
  if (
    reductionTypeApplied !== undefined &&
    HYBRID_ARTICLE[reductionTypeApplied] === undefined &&
    cappedReductionAmount > 0
  ) {
    const verdict = resolveTaxCreditRuralSurtax({
      reductionTypeApplied,
      reductionAmount: cappedReductionAmount,
      isSelfCultivatedExpropriatedLand: input.isSelfCultivatedExpropriatedLand,
    });
    ruralSurtaxCredit = verdict.surtax;
    if (verdict.surtax > 0) {
      steps.push({
        label: "농어촌특별세 (감면세액 × 20%)",
        formula: `감면세액 ${cappedReductionAmount.toLocaleString()} × 20% = ${verdict.surtax.toLocaleString()} — ${verdict.reason}`,
        amount: verdict.surtax,
        legalBasis: verdict.legalBasis,
      });
    } else if (verdict.verdict === "unknown") {
      // 침묵 금지 — 근거를 못 찾아 부과하지 않았다는 사실 자체를 남긴다.
      steps.push({
        label: "농어촌특별세 — 미판정",
        formula: verdict.reason,
        amount: 0,
        legalBasis: verdict.legalBasis,
      });
    }
  }

  const ruralSurtaxTotal = ruralSurtax993 + ruralSurtaxHybrid + ruralSurtaxCredit;
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

