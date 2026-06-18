/**
 * 양도소득세 세액 결정 헬퍼 (순수 함수)
 *
 * transfer-tax-helpers.ts 에서 분리한 세율·세액·감면 계산 로직.
 *   H-6.5: calculateBuildingPenalty — §114조의2 가산세
 *   H-7:   calcTax                  — 세액 결정 (T-1 ~ T-4, + T-1.5 부수토지 일체과세)
 *   H-8:   calcReductions           — 감면 계산 (R-1 ~ R-5, 조특법 §127⑦ 중복배제)
 *   H-MP:  handleMultiParcelBranch  — 다필지 분리 계산 (소령 §166)
 *
 * 부수토지 일체과세 세율 결정 (H-9)은 appurtenant-land-rate.ts 로 분리됨.
 */

import { addYears } from "date-fns";
import {
  applyRate,
  calculateProgressiveTax,
  calculateHoldingPeriod,
  isSurchargeSuspended,
  truncateToWon,
} from "./tax-utils";
import type { MultiHouseSurchargeResult } from "./multi-house-surcharge";
import type { ParsedRates } from "./transfer-tax-helpers";
import { calcBasicDeduction } from "./transfer-tax-helpers";
import { resolveCompanionLandRate } from "./appurtenant-land-rate";
import { getEffectiveAcquisitionDate } from "./transfer-tax-lthd-start";
import { resolveSurchargeAddonRate } from "./data/multi-house-surcharge-rate-history";
// re-export — 기존 import 경로 하위 호환 유지
export {
  resolveCompanionLandRate,
  type CompanionLandRateInput,
  type PrimaryContextForCompanionRate,
  type CompanionLandRateResolution,
} from "./appurtenant-land-rate";
import type { TransferTaxInput, CalculationStep, TransferTaxResult } from "./types/transfer.types";
import { TRANSFER } from "./legal-codes";
import {
  calculateMultiParcelTransfer,
} from "./multi-parcel-transfer";
import {
  type TransferTaxPenaltyResult,
  calculateTransferTaxPenalty,
} from "./transfer-tax-penalty";
import type { Pre1990LandValuationResult } from "./pre-1990-land-valuation";
import type { CarryoverTaxationDetail } from "./types/transfer-carryover.types";
import type { TransferTaxAcquisitionOptions } from "./transfer-tax-acquisition-override";

// ============================================================
// H-6.5: calculateBuildingPenalty — 소득세법 §114조의2 가산세
// ============================================================

export function calculateBuildingPenalty(
  input: TransferTaxInput,
  acquisitionPriceForPenalty: number,
): { penalty: number; note: string } | null {
  if (!input.isSelfBuilt) return null;

  const method = input.acquisitionMethod;
  const transferDate = input.transferDate;

  if (transferDate < new Date("2018-01-01")) return null;

  const isPenaltyMethod =
    method === "estimated" ||
    (method === "appraisal" && transferDate >= new Date("2020-01-01"));
  if (!isPenaltyMethod) return null;

  if (input.buildingType === "extension") {
    if (transferDate < new Date("2020-01-01")) return null;
    if ((input.extensionFloorArea ?? 0) <= 85) return null;
  }

  if (!input.constructionDate) return null;
  // §114조의2 ① "취득일부터 5년 이내" — "이내"는 당일 포함 해석.
  // 정확한 날짜 비교(addYears 5)로 윤년·30일/31일 월말 경계 안전 처리.
  // 예: 취득 2018-03-31 → 5년 시점 2023-03-31. 양도일이 ≤ 2023-03-31이면 발동, > 이면 미적용.
  // 기존 365.25 분모 방식은 윤년에서 부정확(예: 2020-02-29 + 5년 = 2025-02-28인데 1826일 / 365.25 = 4.9986).
  const fifthAnniversary = addYears(input.constructionDate, 5);
  if (transferDate.getTime() > fifthAnniversary.getTime()) return null;

  const penalty = applyRate(acquisitionPriceForPenalty, 0.05);
  const typeLabel = input.buildingType === "extension" ? "증축" : "신축";
  const methodLabel = method === "appraisal" ? "감정가액" : "환산취득가액";
  return {
    penalty,
    note: `${typeLabel} 5년 이내 양도 + ${methodLabel} 적용`,
  };
}

// ============================================================
// H-7: calcTax — 세액 결정 (T-1 ~ T-4)
// ============================================================

interface CalcTaxResult {
  calculatedTax: number;
  surchargeType?: string;
  surchargeRate?: number;
  appliedRate: number;
  progressiveDeduction: number;
  surchargeSuspended: boolean;
  shortTermNote?: string;
}

/**
 * 누진세율 산출세액 + 적용구간(표시용 baseRate·deduction)을 일괄 계산.
 *
 * brackets는 max 오름차순 정렬 전제 (progressiveRateSchema transform이 보장).
 * calcTax의 T-1.5·T-2·T-2.5·T-3·T-4 5개 분기가 공유 — 중복 제거 + 정렬 가정 단일화.
 */
function computeBracketBreakdown(
  taxBase: number,
  brackets: ParsedRates["brackets"],
): { progressiveTax: number; baseRate: number; deduction: number } {
  const progressiveTax = calculateProgressiveTax(taxBase, brackets);
  const bracket = brackets.find((b) => taxBase <= (b.max ?? Infinity));
  return {
    progressiveTax,
    baseRate: bracket?.rate ?? brackets[brackets.length - 1].rate,
    deduction: bracket?.deduction ?? 0,
  };
}

export function calcTax(
  taxBase: number,
  parsedRates: ParsedRates,
  input: TransferTaxInput,
  multiHouseSurchargeResult?: MultiHouseSurchargeResult,
): CalcTaxResult {
  const { brackets, surchargeRates, surchargeSpecialRules } = parsedRates;

  // T-1: 미등기 70% 단일세율
  if (input.isUnregistered && surchargeRates.unregistered) {
    const flatRate = surchargeRates.unregistered.flatRate;
    return {
      calculatedTax: applyRate(taxBase, flatRate),
      appliedRate: flatRate,
      progressiveDeduction: 0,
      surchargeSuspended: false,
    };
  }

  // T-1.5: 부수토지 일체과세 세율 분기 (영 §154⑦, landNature 명시 입력 기반)
  // companion 토지 자산에 manualHoldingPeriodOverride 또는 landNature/primaryContext가 있으면
  // resolveCompanionLandRate로 세율을 결정하고 조기 반환.
  // [법령 근거] §89①3호·영§154⑦ — 주택과 일체과세. §104①후단 — 큰 산출세액 세율.
  //            기재부 재산-53(2015.1.15) / 재산-1354(2022.10.27)
  if (
    input.propertyType === "land" &&
    (input.manualHoldingPeriodOverride !== undefined ||
      input.landNature === "appurtenant_to_housing" ||
      input.primaryContextForCompanionRate !== undefined)
  ) {
    const ctx = input.primaryContextForCompanionRate;
    const companionArea =
      // companion의 면적 정보는 acquisitionArea 또는 nonBusinessLandDetails?.landArea에서 추출
      input.acquisitionArea ??
      input.nonBusinessLandDetails?.landArea;

    const resolution = resolveCompanionLandRate(
      {
        assetKind: "land",
        area: companionArea,
        manualHoldingPeriodOverride: input.manualHoldingPeriodOverride,
        landNature: input.landNature,
      },
      ctx
        ? {
            propertyType: ctx.propertyType,
            holdingMonths: ctx.holdingMonths,
            buildingFootprintArea: ctx.buildingFootprintArea,
            isUrbanArea: ctx.isUrbanArea,
            appurtenantLandZone: ctx.appurtenantLandZone,
            bundledSaleMode: ctx.bundledSaleMode,
          }
        : {
            // manualHoldingPeriodOverride만 있고 primaryContext 없는 경우:
            // 조건 판정 없이 수동 오버라이드만 적용 (자동 분기 조건 충족 의미 없음)
            propertyType: "land",
            holdingMonths: 999, // landNature 체크 전에 applied=false → 수동 오버라이드만 동작
          },
    );

    if (resolution.applied) {
      if (resolution.manualProgressive) {
        // 누진세율 강제 (수동 또는 주택 2년 이상 보유 포괄적 일체과세)
        const { progressiveTax, baseRate, deduction } = computeBracketBreakdown(taxBase, brackets);
        return {
          calculatedTax: progressiveTax,
          appliedRate: baseRate,
          progressiveDeduction: deduction,
          surchargeSuspended: false,
          shortTermNote: resolution.appliedReason
            ? `부수토지 일체과세(§89①3호·영§154⑦): 누진세율`
            : "수동 지정: 누진세율",
        };
      }
      if (resolution.manualRate !== undefined) {
        // 단일세율 강제 (수동 또는 주택 단기보유 70%/60%)
        const isManualOverride = input.manualHoldingPeriodOverride !== undefined;
        return {
          calculatedTax: applyRate(taxBase, resolution.manualRate),
          appliedRate: resolution.manualRate,
          progressiveDeduction: 0,
          surchargeSuspended: false,
          shortTermNote: isManualOverride
            ? `수동 지정: ${Math.round(resolution.manualRate * 100)}%`
            : `부수토지 일체과세(§89①3호·영§154⑦): ${Math.round(resolution.manualRate * 100)}%`,
        };
      }
      if (resolution.unifiedRate !== undefined) {
        // 자동 분기: 부수토지 일체과세 (70% 또는 60%)
        // 한도 초과분(excessArea > 0)이 있어도 단건 엔진에서는 전체 taxBase에 단일세율 적용.
        // 초과분 분리는 aggregate/route 레이어에서 companion을 별도 자산으로 분리하여 처리.
        return {
          calculatedTax: applyRate(taxBase, resolution.unifiedRate),
          appliedRate: resolution.unifiedRate,
          progressiveDeduction: 0,
          surchargeSuspended: false,
          shortTermNote: `부수토지 일체과세(§89①3호·영§154⑦): ${Math.round(resolution.unifiedRate * 100)}%`,
        };
      }
    }
    // applied=false → 기존 경로(본래 보유기간 기준) 계속 진행
  }

  const isSurchargeCase = multiHouseSurchargeResult
    ? multiHouseSurchargeResult.surchargeType !== "none"
    : (input.propertyType === "housing" || input.propertyType === "right_to_move_in" || input.propertyType === "presale_right") &&
      input.isRegulatedArea &&
      input.householdHousingCount >= 2;

  const suspended = multiHouseSurchargeResult
    ? multiHouseSurchargeResult.isSurchargeSuspended
    : isSurchargeCase
      ? isSurchargeSuspended(
          surchargeSpecialRules,
          input.transferDate,
          input.householdHousingCount >= 3 ? "multi_house_3plus" : "multi_house_2",
        )
      : false;

  const roundRate = (r: number) => Math.round(r * 10000) / 10000;

  // P5 특례 (조특법 §98①1호): 세율 20% 단일 — §104①에도 불구하고 누진·단기·중과세율 전체 대체.
  // STEP 7에서 eligible 시 forceFlatRate20 주입 (엔진 내부 플래그).
  if (input.forceFlatRate20) {
    return {
      calculatedTax: applyRate(taxBase, 0.2),
      appliedRate: 0.2,
      progressiveDeduction: 0,
      surchargeSuspended: false,
      shortTermNote: "조특법 §98①1호 — 양도소득세 세율 20% (§104① 불구)",
    };
  }

  // 보유기간 기산 (§104② — 상속은 피상속인·증여이월은 증여자 취득일, 사례 48 승계조합원은 준공일).
  // T-2 비사업용 토지 §104①후단 비교와 T-2.5 단기 특례세율이 공유.
  const successorRateBasis = getEffectiveAcquisitionDate(input);
  const isSuccessorRedev =
    input.propertyType === "redevelopment_apt" &&
    input.redevelopment?.isSuccessorMember === true &&
    input.redevelopment?.completionDate !== undefined;
  const rateBasisAcquisitionDate = isSuccessorRedev
    ? successorRateBasis
    : input.acquisitionCause === "inheritance" && input.decedentAcquisitionDate
      ? input.decedentAcquisitionDate
      : input.acquisitionCause === "gift" && input.donorAcquisitionDate
        ? input.donorAcquisitionDate
        : input.acquisitionDate;
  const holdingForRate = calculateHoldingPeriod(rateBasisAcquisitionDate, input.transferDate);
  const holdingMonthsTotal = holdingForRate.years * 12 + holdingForRate.months;

  // T-2: 비사업용 토지 누진 + 10%p (§104①8호)
  if (input.isNonBusinessLand && surchargeRates.non_business_land) {
    const additionalRate = surchargeRates.non_business_land.additionalRate;
    // §168의11⑤⑥ 부분 면적안분 — 중과분(+10%p)만 비사업용 면적비율로 안분(누진 기본세액은 전체 taxBase)
    const ratio = input.nonBusinessLandAreaRatio ?? 1;
    const { progressiveTax, baseRate, deduction } = computeBracketBreakdown(taxBase, brackets);
    const surchargedBase = applyRate(taxBase, ratio); // ratio=1이면 surchargedBase=taxBase (회귀)
    const surchargeAmount = applyRate(surchargedBase, additionalRate);
    const nblTax = progressiveTax + surchargeAmount;

    // §104① 후단 — 하나의 자산이 둘 이상의 호에 해당하면 큰 산출세액을 적용.
    // 비사업용 토지(§104①8호)를 단기보유하면 토지 단기세율(1년 미만 50%·1~2년 40%, §104①3·2호)과
    // 비교하여 큰 세액. 토지이므로 주택 단기세율(70%/60%)이 아닌 50%/40% 사용.
    const nblShortTermRate =
      holdingMonthsTotal < 12 ? 0.50 :
      holdingMonthsTotal < 24 ? 0.40 :
      null;
    if (nblShortTermRate !== null) {
      const nblShortTermTax = applyRate(taxBase, nblShortTermRate);
      if (nblShortTermTax > nblTax) {
        return {
          calculatedTax: nblShortTermTax,
          appliedRate: nblShortTermRate,
          progressiveDeduction: 0,
          surchargeSuspended: false,
          shortTermNote: `보유기간 ${holdingMonthsTotal < 12 ? "1년" : "2년"} 미만 단기세율 적용 (§104①후단: 비사업용 누진세액과 비교한 큰 세액)`,
        };
      }
    }
    return {
      calculatedTax: nblTax,
      surchargeType: "non_business_land",
      surchargeRate: roundRate(additionalRate),
      appliedRate: roundRate(baseRate + additionalRate * ratio), // 실효 가산율(면적비율 반영)
      progressiveDeduction: deduction,
      surchargeSuspended: false,
    };
  }

  const surchargeApplicable = multiHouseSurchargeResult
    ? multiHouseSurchargeResult.surchargeApplicable
    : isSurchargeCase && !suspended;

  const effectiveSurchargeType = multiHouseSurchargeResult?.surchargeType
    ?? (input.householdHousingCount >= 3 ? "multi_house_3plus" : "multi_house_2");

  // T-2.5: 단기보유 특례세율 (소득세법 §104①2~3호, 7~8호)
  // 사례 48 — 승계조합원 신축APT 양도 시 기산일 = 준공일 (사전-2019-법령해석재산-0649).
  // 보유기간 기산(rateBasisAcquisitionDate·holdingMonthsTotal)은 T-2 앞에서 계산됨 (§104② 공유).
  const isHousingLikeProp =
    input.propertyType === "housing" ||
    input.propertyType === "right_to_move_in" ||
    input.propertyType === "presale_right" ||
    input.propertyType === "redevelopment_apt"; // 신축APT는 주택 — §104①2/3호 60%/70%
  // P3 특칙 (§98의3④·§98의5③·§98의6③): 세율 = §104①1호 강제 — 단기세율(§104①2·3호) 배제.
  // "§104①3호 불구" 법문이나 "세율은 1호" 강제이므로 2호(1년 미만)도 배제됨 (설계 검토 #4).
  const shortTermFlatRate = input.suppressShortTermRate
    ? null
    : holdingMonthsTotal < 12 ? (isHousingLikeProp ? 0.70 : 0.50) :
      holdingMonthsTotal < 24 ? (isHousingLikeProp ? 0.60 : 0.40) :
      null;
  const shortTermNote =
    holdingMonthsTotal < 12 ? "보유기간 1년 미만 특례세율 적용" :
    holdingMonthsTotal < 24 ? "보유기간 2년 미만 특례세율 적용" :
    undefined;

  if (shortTermFlatRate !== null) {
    const shortTermTax = applyRate(taxBase, shortTermFlatRate);
    // §104③: 다주택 중과세율과 비교하여 더 높은 세율 적용
    if (surchargeApplicable && effectiveSurchargeType !== "none") {
      const surchargeInfoST = effectiveSurchargeType === "multi_house_3plus"
        ? surchargeRates.multi_house_3plus
        : surchargeRates.multi_house_2;
      // 양도일 기준 중과 가산율 (§104⑦ 시행일별). null = 2018.4.1 이전 → 중과 미적용.
      const historicalRateST = resolveSurchargeAddonRate(input.transferDate, effectiveSurchargeType);
      if (surchargeInfoST && historicalRateST !== null) {
        const additionalRateST = historicalRateST;
        const { progressiveTax: progressiveTaxST, baseRate: baseRateST, deduction: deductionST } = computeBracketBreakdown(taxBase, brackets);
        const surchargeTaxST = progressiveTaxST + applyRate(taxBase, additionalRateST);
        if (surchargeTaxST > shortTermTax) {
          return {
            calculatedTax: surchargeTaxST,
            surchargeType: effectiveSurchargeType,
            surchargeRate: roundRate(additionalRateST),
            appliedRate: roundRate(baseRateST + additionalRateST),
            progressiveDeduction: deductionST,
            surchargeSuspended: false,
            shortTermNote,
          };
        }
      }
    }
    return {
      calculatedTax: shortTermTax,
      appliedRate: shortTermFlatRate,
      progressiveDeduction: 0,
      surchargeSuspended: false,
      shortTermNote,
    };
  }

  // T-3: 다주택 중과세
  if (surchargeApplicable && effectiveSurchargeType !== "none") {
    const surchargeInfo = effectiveSurchargeType === "multi_house_3plus"
      ? surchargeRates.multi_house_3plus
      : surchargeRates.multi_house_2;

    // 양도일 기준 중과 가산율 (§104⑦ 시행일별: 2018.4.1~ +10/+20, 2021.6.1~ +20/+30).
    // null = 2018.4.1 이전 양도 → 중과 미적용(아래 일반 누진세율로 fall through).
    const historicalRate = resolveSurchargeAddonRate(input.transferDate, effectiveSurchargeType);
    if (surchargeInfo && historicalRate !== null) {
      const additionalRate = historicalRate;
      const { progressiveTax, baseRate, deduction } = computeBracketBreakdown(taxBase, brackets);
      const surchargeAmount = applyRate(taxBase, additionalRate);
      return {
        calculatedTax: progressiveTax + surchargeAmount,
        surchargeType: effectiveSurchargeType,
        surchargeRate: roundRate(additionalRate),
        appliedRate: roundRate(baseRate + additionalRate),
        progressiveDeduction: deduction,
        surchargeSuspended: false,
      };
    }
  }

  // T-4: 일반 누진세율
  const { progressiveTax, baseRate, deduction } = computeBracketBreakdown(taxBase, brackets);

  return {
    calculatedTax: progressiveTax,
    appliedRate: baseRate,
    progressiveDeduction: deduction,
    surchargeSuspended: suspended,
  };
}

// ============================================================
// H-8: calcReductions — transfer-tax-reductions-calc.ts로 분리 (800줄 정책, 2026-06-11)
// 외부 import 호환 re-export.
// ============================================================

export { calcReductions, type ReductionsResult } from "./transfer-tax-reductions-calc";
import { calcReductions } from "./transfer-tax-reductions-calc";

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
    parcels: parcelsWithOverride,
  });
  for (let pi = 0; pi < mpResult.parcelResults.length; pi++) {
    const pr = mpResult.parcelResults[pi];
    const parcelLabel = `필지 ${pi + 1}`;
    const expenseDesc = pr.estimatedDeduction > 0
      ? `개산공제 ${pr.estimatedDeduction.toLocaleString()}`
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
  steps.push({ label: "산출세액", formula: `${mpTaxBase.toLocaleString()} × ${Math.round(mpTaxResult.appliedRate * 100)}%`, amount: mpTaxResult.calculatedTax, legalBasis: TRANSFER.TAX_RATE });

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

