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
  const { rawInput, effectiveInput, input, parsedRates, multiHouseSurchargeResult, options } = ctx;

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
    parcels: parcelsWithOverride,
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
    rentalReductionDetail: mpRentalDetail,
    newHousingReductionDetail: mpNewHousingDetail,
    publicExpropriationDetail: mpExproDetail,
    selfFarmingReductionDetail: mpSelfFarmingDetail,
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
  const mpDeterminedTax = truncateToWon(Math.max(0, mpTaxResult.calculatedTax - mpReduction));
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
    reductionAmount: mpReduction,
    reductionType: mpReductionType,
    reductionTypeApplied: mpReductionTypeApplied,
    reducibleIncome: mpReducibleIncome,
    determinedTax: mpDeterminedTax,
    penaltyTax: mpPenaltyTax,
    localIncomeTax: mpLocalIncomeTax,
    totalTax: mpDeterminedTaxWithPenalty + mpLocalIncomeTax + mpFilingDelayedPenalty,
    steps,
    rentalReductionDetail: mpRentalDetail,
    newHousingReductionDetail: mpNewHousingDetail,
    publicExpropriationDetail: mpExproDetail,
    selfFarmingReductionDetail: mpSelfFarmingDetail,
    penaltyDetail: mpPenaltyDetail,
    parcelDetails: mpResult.parcelResults,
  };
}
