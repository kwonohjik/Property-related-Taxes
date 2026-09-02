/**
 * 다필지 분리 계산 분기 (「소득세법 시행령」 §166) — 오케스트레이터 조기 반환 경로.
 *
 * `transfer-tax-rate-calc.ts`에서 분리(2026-08-11 — §104① 후단 배선으로 800줄 초과, 800줄 정책).
 * 세율 결정(§104)이 아니라 **필지별로 나눠 계산한 뒤 합치는 조립 절차**라 축이 다르다.
 *
 * ⚠️ **재수출하지 않는다** — 이 모듈이 `calcTax`(rate-calc)를 쓰므로 rate-calc이 되받으면
 *   순환 의존이 된다. 소비처(`transfer-tax.ts`)가 이 경로에서 직접 import한다.
 */

import { applyRate, truncateToWon } from "./tax-utils";
import type { MultiHouseSurchargeResult } from "./multi-house-surcharge";
import type { ParsedRates } from "./transfer-tax-helpers";
import { calcBasicDeduction } from "./transfer-tax-helpers";
import type { TransferTaxInput, CalculationStep, TransferTaxResult } from "./types/transfer.types";
import { TRANSFER } from "./legal-codes";
import { calculateMultiParcelTransfer } from "./multi-parcel-transfer";
import { type TransferTaxPenaltyResult, calculateTransferTaxPenalty } from "./transfer-tax-penalty";
import type { Pre1990LandValuationResult } from "./pre-1990-land-valuation";
import type { CarryoverTaxationDetail } from "./types/transfer-carryover.types";
import type { TransferTaxAcquisitionOptions } from "./transfer-tax-acquisition-override";
import { calcTax } from "./transfer-tax-rate-calc";
import { calcReductions } from "./transfer-tax-reductions-calc";
import { calculateBuildingPenalty } from "./transfer-tax-building-penalty";
import { applyReductionStatutoryCap } from "./transfer-tax-reduction-cap";
import { resolveTaxCreditRuralSurtax, HYBRID_ARTICLE } from "./transfer-tax-rural-surtax";

// ============================================================
// H-MP: handleMultiParcelBranch — 다필지 분리 계산 (소령 §166)
// rawInput.parcels가 있으면 필지별 분리 계산 후 조기 반환.
// 없으면 null 반환 → 오케스트레이터가 단일 자산 경로로 계속 진행.
// ============================================================

export interface MultiParcelBranchContext {
  rawInput: TransferTaxInput;
  effectiveInput: TransferTaxInput;
  input: TransferTaxInput;
  parsedRates: ParsedRates;
  multiHouseSurchargeResult: MultiHouseSurchargeResult | undefined;
  pre1990LandResult: Pre1990LandValuationResult | undefined;
  carryoverDetail: CarryoverTaxationDetail | undefined;
  /** 다필지 필지별 취득가액 override (options.acquisitionOverridesByAssetId). 없으면 기존 동작. */
  options?: TransferTaxAcquisitionOptions;
}

export function handleMultiParcelBranch(
  ctx: MultiParcelBranchContext,
  steps: CalculationStep[],
): TransferTaxResult | null {
  // A20(2026-09-02): `pre1990LandResult`·`carryoverDetail`은 컨텍스트 타입에 선언돼 있고
  // 호출부(`transfer-tax.ts`)가 실제로 넘기는데 **구조분해에 없어 쓰이지 않았다**.
  // TypeScript는 이를 잡지 못한다(구조분해에서 빼면 unused 경고조차 없다).
  const {
    rawInput,
    effectiveInput,
    input,
    parsedRates,
    multiHouseSurchargeResult,
    pre1990LandResult,
    carryoverDetail,
    options,
  } = ctx;

  if (!rawInput.parcels || rawInput.parcels.length === 0) return null;

  // acquisitionOverridesByAssetId: 필지 ID별 취득가액 override 적용 (없는 필지는 기존값 유지)
  const overrides = options?.acquisitionOverridesByAssetId;
  const parcelsWithOverride = overrides
    ? rawInput.parcels.map((p) =>
        p.id !== undefined && Object.prototype.hasOwnProperty.call(overrides, p.id)
          ? { ...p, acquisitionMethod: "actual" as const, acquisitionPrice: overrides[p.id] }
          : p,
      )
    : rawInput.parcels;

  const mpResult = calculateMultiParcelTransfer({
    totalTransferPrice: effectiveInput.transferPrice,
    transferDate: effectiveInput.transferDate,
    // 공익수용 §164⑨ 1호 특례 게이트 — 필지별 판정에 필요(자산-수준 값).
    transferCause: effectiveInput.transferCause,
    propertyType: effectiveInput.propertyType,
    /**
     * A02(2026-09-02): 자산-수준 `isUnregistered`를 필지에 전파한다.
     *
     * 서브엔진은 미등기를 **이미 정확히 구현했다** — `calcLandLongTermRate`가
     * `if (isUnregistered) return 0`(§95② 본문 괄호: 미등기양도자산은 장특공제 대상에서 제외),
     * 개산공제는 `parcel.isUnregistered ? 0.003 : 0.03`(「소득세법 시행령」 §163⑥1호 괄호).
     * 그런데 `ParcelInput.isUnregistered`를 채우는 경로가 ①⑤⑫⑬ 어디에도 없어 항상 undefined였다.
     *
     * 같은 분기가 미등기를 **이미 알고 있다**는 점에서 내부 모순이었다 — 세율 70%와
     * 기본공제 0은 `effectiveInput.isUnregistered`로 이미 적용하면서 장특공제·개산공제만
     * 빠졌다(실측 129,360,000원 과소 + 개산공제 5,400,000원 필요경비 과대).
     *
     * ⚠️ `??` 필수 — `TransferTaxInput.isUnregistered`가 required boolean이라 그냥 덮으면
     *    자산 플래그가 false일 때 **필지별 축**(`ParcelInput.isUnregistered`)을 조용히 죽인다.
     */
    parcels: parcelsWithOverride.map((p) => ({
      ...p,
      isUnregistered: p.isUnregistered ?? effectiveInput.isUnregistered,
    })),
    ownershipRatio: effectiveInput.ownershipRatio,
  });
  for (let pi = 0; pi < mpResult.parcelResults.length; pi++) {
    const pr = mpResult.parcelResults[pi];
    const parcelLabel = `필지 ${pi + 1}`;
    const expenseDesc = pr.estimatedDeduction > 0
      ? `개산공제 ${pr.estimatedDeduction.toLocaleString()}`
      : pr.swapApplied
        ? `자본적지출+양도비 ${pr.expenses.toLocaleString()} (§97②단서)`
        : pr.expenses.toLocaleString();
    steps.push({ label: `[${parcelLabel}] 양도차익`, formula: `안분가 ${pr.allocatedTransferPrice.toLocaleString()} - 취득가 ${pr.acquisitionPrice.toLocaleString()} - 경비 ${expenseDesc}`, amount: pr.transferGain });
    steps.push({ label: `[${parcelLabel}] 장특공제`, formula: `${(pr.longTermHoldingRate * 100).toFixed(0)}%`, amount: pr.longTermHoldingDeduction, sub: true });
  }
  const mpTaxableGain = mpResult.totalTransferGain;
  const mpLtd = mpResult.totalLongTermHoldingDeduction;
  const mpTransferIncome = mpResult.totalTransferIncome;
  steps.push({ label: "양도차익 합계", formula: "필지별 합산", amount: mpTaxableGain, legalBasis: TRANSFER.TRANSFER_GAIN });
  steps.push({ label: "장기보유특별공제 합계", formula: "필지별 합산", amount: mpLtd, legalBasis: TRANSFER.LONG_TERM_DEDUCTION, sub: true });
  steps.push({ label: "양도소득금액 합계", formula: `${mpTaxableGain.toLocaleString()} - ${mpLtd.toLocaleString()}`, amount: mpTransferIncome });

  const mpBasicDeduction = input.skipBasicDeduction
    ? 0
    : calcBasicDeduction(mpTaxableGain, mpLtd, input.annualBasicDeductionUsed ?? 0, input.isUnregistered, parsedRates.basicDeductionRules);
  const mpTaxBase = Math.max(0, mpTransferIncome - mpBasicDeduction);
  steps.push({ label: "기본공제", formula: `${mpBasicDeduction.toLocaleString()}`, amount: mpBasicDeduction, legalBasis: TRANSFER.BASIC_DEDUCTION });
  steps.push({ label: "과세표준", formula: `${mpTransferIncome.toLocaleString()} - ${mpBasicDeduction.toLocaleString()}`, amount: mpTaxBase, legalBasis: TRANSFER.TAX_BASE_CALC });

  const mpTaxResult = calcTax(mpTaxBase, parsedRates, effectiveInput, multiHouseSurchargeResult);
  steps.push({ label: "산출세액", formula: `${mpTaxBase.toLocaleString()} × ${Math.round(mpTaxResult.appliedRate * 100)}%${mpTaxResult.progressiveDeduction ? ` - 누진공제 ${mpTaxResult.progressiveDeduction.toLocaleString()}` : ""}`, amount: mpTaxResult.calculatedTax, legalBasis: TRANSFER.TAX_RATE });

  const {
    reductionAmount: mpReduction,
    reductionType: mpReductionType,
    reductionTypeApplied: mpReductionTypeApplied,
    reducibleIncome: mpReducibleIncome,
    aggregateReductionRate: mpAggregateReductionRate,
    rentalReductionDetail: mpRentalDetail,
    newHousingReductionDetail: mpNewHousingDetail,
    publicExpropriationDetail: mpExproDetail,
    selfFarmingReductionDetail: mpSelfFarmingDetail,
    // CB-07 — 종전에는 이 넷을 꺼내지 않아 결과에 근거가 남지 않았다.
    //   §77의2(대토보상)·§77의3(개발제한구역)·§97 시리즈·하이브리드를 다필지로 신청하면
    //   세액은 반영되는데 상세 카드·조문 근거가 통째로 사라졌다.
    gbDesignatedLandDetail: mpGbDetail,
    replacementLandDetail: mpReplacementDetail,
    rental97TaxDetail: mpRental97TaxDetail,
    hybridTaxDetail: mpHybridTaxDetail,
  } = calcReductions(
    mpTaxResult.calculatedTax,
    input.reductions,
    parsedRates.selfFarmingRules,
    input.rentalReductionDetails,
    parsedRates.longTermRentalRules,
    input.newHousingDetails,
    parsedRates.newHousingMatrix,
    input.transferDate,
    mpTransferIncome,
    mpBasicDeduction,
    mpTaxBase,
    input.acquisitionDate,
    input.standardPriceAtAcquisition,
    input.standardPriceAtTransfer,
    // F-6: §97의2·§97의5 시한·하이브리드 contractDate fallback — 메인 경로(finalize)와 동일 인자.
    // (마지막 positional 인자 — 순서 어긋남 없음. 다필지=토지라 numeric 영향은 사실상 없으나 일관성 확보)
    input.assetContractDate,
  );
  /**
   * §133 5년 누적 한도 — 형제 4경로(finalize·redevelopment·rental-housing-step·mixed-use)와
   * **같은 단일 소스**를 부른다 (CB-04).
   *
   * evaluator 내부 캡은 **연간 한도뿐**이므로(§77 2억 · §69 1억), 이 호출이 없으면
   * 사용자가 입력한 `priorReductionUsage`가 이 경로에서 **구별력 0**이 된다 — 같은 입력을
   * 단필지로 넣으면 5년 한도가 깎는데 다필지면 안 깎이는 dual-truth였다.
   */
  const mpCap = applyReductionStatutoryCap({
    reductionAmount: mpReduction,
    reductionTypeApplied: mpReductionTypeApplied,
    transferYear: input.transferDate.getFullYear(),
    priorUsage: input.priorReductionUsage ?? [],
  });
  const mpCappedReduction = mpCap.cappedAmount;
  if (mpCap.step) steps.push(mpCap.step);

  const mpDeterminedTax = truncateToWon(Math.max(0, mpTaxResult.calculatedTax - mpCappedReduction));

  /**
   * 농어촌특별세 (감면세액 × 20%) — 「농어촌특별세법」 §5①1호 (D10-02).
   *
   * 종전에는 이 분기가 감면을 결정세액에서 차감하면서도 농특세를 **아예 계산하지 않았다**.
   * 판정은 `transfer-tax-rural-surtax.ts` 단일 소스 — 비과세는 열거주의이고(농특세령 §4①1호)
   * §69는 무조건 비과세, §77은 「직접 경작한 토지」 조건부, 그 밖(§77의2·§77의3·§97 시리즈)은 과세다.
   * 하이브리드는 자체 경로가 계산하므로 여기서 제외한다(이중 부과 방지 — finalize와 동일 규약).
   */
  let mpRuralSurtax = 0;
  /** CB-07 — 하이브리드 상세 echo (자체 농특세 포함). 결과 카드가 근거를 잃지 않게 한다. */
  const mpHybridEcho: Partial<TransferTaxResult> = {};
  if (
    mpReductionTypeApplied !== undefined &&
    HYBRID_ARTICLE[mpReductionTypeApplied] !== undefined &&
    mpCappedReduction > 0
  ) {
    // 농특세 비과세(농특세령 §4⑦1호): §98의3·§98의5 — evaluator의 exempt 플래그 단일 진실.
    const isExemptTax = mpHybridTaxDetail?.ruralSurtaxExempt === true;
    mpRuralSurtax = isExemptTax ? 0 : applyRate(mpCappedReduction, 0.2);
    if (mpRuralSurtax > 0) {
      steps.push({
        label: `${HYBRID_ARTICLE[mpReductionTypeApplied]} 농어촌특별세 (감면세액 × 20%)`,
        formula: `감면세액 ${mpCappedReduction.toLocaleString()} × 20% = ${mpRuralSurtax.toLocaleString()}`,
        amount: mpRuralSurtax,
        legalBasis: TRANSFER.RURAL_SURTAX_993,
      });
    }
    if (mpHybridTaxDetail && mpHybridTaxDetail.id === mpReductionTypeApplied) {
      const merged = {
        ...mpHybridTaxDetail,
        reductionAmount: mpCappedReduction,
        taxReductionForRuralSurtax: isExemptTax ? 0 : mpCappedReduction,
        ruralSurtax: mpRuralSurtax,
      };
      if (merged.id === "unsold_98_7") mpHybridEcho.unsold987Detail = merged;
      else if (merged.id === "unsold_99_2") mpHybridEcho.unsold992Detail = merged;
      else if (merged.id === "unsold_98_3") mpHybridEcho.unsold983Detail = merged;
      else if (merged.id === "unsold_98_5") mpHybridEcho.unsold985Detail = merged;
      else if (merged.id === "unsold_98_4") mpHybridEcho.unsold984Detail = merged;
      else mpHybridEcho.unsold986Detail = merged;
    }
  }
  if (
    mpReductionTypeApplied !== undefined &&
    HYBRID_ARTICLE[mpReductionTypeApplied] === undefined &&
    mpCappedReduction > 0
  ) {
    const verdict = resolveTaxCreditRuralSurtax({
      reductionTypeApplied: mpReductionTypeApplied,
      reductionAmount: mpCappedReduction,
      isSelfCultivatedExpropriatedLand: input.isSelfCultivatedExpropriatedLand,
    });
    mpRuralSurtax = verdict.surtax;
    if (verdict.surtax > 0) {
      steps.push({
        label: "농어촌특별세 (감면세액 × 20%)",
        formula: `감면세액 ${mpCappedReduction.toLocaleString()} × 20% = ${verdict.surtax.toLocaleString()} — ${verdict.reason}`,
        amount: verdict.surtax,
        legalBasis: verdict.legalBasis,
      });
    } else if (verdict.verdict === "unknown") {
      steps.push({
        label: "농어촌특별세 — 미판정",
        formula: verdict.reason,
        amount: 0,
        legalBasis: verdict.legalBasis,
      });
    }
  }
  const mpPenaltyBase = effectiveInput.acquisitionMethod === "appraisal"
    ? (effectiveInput.appraisalValue ?? 0)
    : 0;
  const mpPenaltyResult = calculateBuildingPenalty(effectiveInput, mpPenaltyBase);
  const mpPenaltyTax = mpPenaltyResult?.penalty ?? 0;
  const mpDeterminedTaxWithPenalty = mpDeterminedTax + mpPenaltyTax;
  const mpLocalIncomeTax = applyRate(mpDeterminedTaxWithPenalty, 0.1);

  let mpFilingDelayedPenalty = 0;
  let mpPenaltyDetail: TransferTaxPenaltyResult | undefined;
  if (input.filingPenaltyDetails || input.delayedPaymentDetails) {
    mpPenaltyDetail = calculateTransferTaxPenalty({
      filing: input.filingPenaltyDetails,
      delayedPayment: input.delayedPaymentDetails,
    });
    mpFilingDelayedPenalty = mpPenaltyDetail?.totalPenalty ?? 0;
  }

  return {
    isExempt: false,
    transferGain: mpTaxableGain,
    taxableGain: mpTaxableGain,
    usedEstimatedAcquisition: false,
    penaltyBase: 0, // 다필지 분기: 가산세는 §114조의2 건물 한정으로 토지 다필지 경로에 미적용
    longTermHoldingDeduction: mpLtd,
    longTermHoldingRate: mpTaxableGain > 0 ? mpLtd / mpTaxableGain : 0,
    lthdStartDate: rawInput.acquisitionDate, // 다필지: 용도변경 분기 적용 안 됨, 당초 취득일
    basicDeduction: mpBasicDeduction,
    taxBase: mpTaxBase,
    appliedRate: mpTaxResult.appliedRate,
    progressiveDeduction: mpTaxResult.progressiveDeduction,
    calculatedTax: mpTaxResult.calculatedTax,
    surchargeType: mpTaxResult.surchargeType,
    surchargeRate: mpTaxResult.surchargeRate,
    isSurchargeSuspended: mpTaxResult.surchargeSuspended,
    reductionAmount: mpCappedReduction,
    reductionType: mpReductionType,
    reductionTypeApplied: mpReductionTypeApplied,
    reducibleIncome: mpReducibleIncome,
    aggregateReductionRate: mpAggregateReductionRate,
    determinedTax: mpDeterminedTax,
    penaltyTax: mpPenaltyTax,
    localIncomeTax: mpLocalIncomeTax,
    ruralSurtax: mpRuralSurtax,
    totalTax: mpDeterminedTaxWithPenalty + mpLocalIncomeTax + mpFilingDelayedPenalty + mpRuralSurtax,
    steps,
    rentalReductionDetail: mpRentalDetail,
    newHousingReductionDetail: mpNewHousingDetail,
    publicExpropriationDetail: mpExproDetail,
    selfFarmingReductionDetail: mpSelfFarmingDetail,
    gbDesignatedLandDetail: mpGbDetail,
    replacementLandDetail: mpReplacementDetail,
    rental97TaxDetail: mpRental97TaxDetail,
    ...mpHybridEcho,
    penaltyDetail: mpPenaltyDetail,
    parcelDetails: mpResult.parcelResults,
    /**
     * A20(2026-09-02): 다필지 조기반환이 정상경로의 결과 조립을 건너뛰면서 상류 STEP의
     * 산출물을 하나도 싣지 않았다. 세율에는 STEP 0.6 재판정이 `effectiveInput`을 통해
     * 반영되는데 **판정 근거 카드는 화면에 뜨지 않는** 상태였다(세액은 움직였는데 근거가 없다).
     * 세액 불변 · 표시 전용.
     */
    ...(pre1990LandResult ? { pre1990LandValuationDetail: pre1990LandResult } : {}),
    ...(carryoverDetail ? { carryoverTaxationDetail: carryoverDetail } : {}),
    ...(multiHouseSurchargeResult
      ? { multiHouseSurchargeDetail: multiHouseSurchargeResult }
      : {}),
    ...(mpTaxResult.nblSurchargeExcluded ? { nblSurchargeExcluded: true } : {}),
  };
}
