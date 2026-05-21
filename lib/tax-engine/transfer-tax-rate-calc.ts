/**
 * 양도소득세 세액 결정 헬퍼 (순수 함수)
 *
 * transfer-tax-helpers.ts 에서 분리한 세율·세액·감면 계산 로직.
 *   H-6.5: calculateBuildingPenalty — §114조의2 가산세
 *   H-7:   calcTax                  — 세액 결정 (T-1 ~ T-4, + T-1.5 부수토지 일체과세)
 *   H-8:   calcReductions           — 감면 계산 (R-1 ~ R-5, 조특법 §127 ② 중복배제)
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
  safeMultiplyThenDivide,
  truncateToWon,
} from "./tax-utils";
import type { MultiHouseSurchargeResult } from "./multi-house-surcharge";
import type { ParsedRates } from "./transfer-tax-helpers";
import { calcBasicDeduction } from "./transfer-tax-helpers";
import { resolveCompanionLandRate } from "./appurtenant-land-rate";
import { getEffectiveAcquisitionDate } from "./transfer-tax-finalize";
// re-export — 기존 import 경로 하위 호환 유지
export {
  resolveCompanionLandRate,
  type CompanionLandRateInput,
  type PrimaryContextForCompanionRate,
  type CompanionLandRateResolution,
} from "./appurtenant-land-rate";
import {
  type RentalReductionInput,
  type RentalReductionResult,
  calculateRentalReduction,
} from "./rental-housing-reduction";
import {
  type NewHousingReductionInput,
  type NewHousingReductionResult,
  determineNewHousingReduction,
} from "./new-housing-reduction";
import {
  type PublicExpropriationReductionResult,
  calculatePublicExpropriationReduction,
} from "./public-expropriation-reduction";
import {
  type SelfFarmingReductionResult,
  calculateSelfFarmingReduction,
} from "./self-farming-reduction";
import type { LongTermRentalRuleSet, NewHousingMatrixData } from "./schemas/rate-table.schema";
import type { TransferTaxInput, TransferReduction, CalculationStep, TransferTaxResult } from "./types/transfer.types";
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
        const progressiveTax = calculateProgressiveTax(taxBase, brackets);
        const bracket = brackets.find((b) => taxBase <= (b.max ?? Infinity));
        const baseRate = bracket?.rate ?? brackets[brackets.length - 1].rate;
        return {
          calculatedTax: progressiveTax,
          appliedRate: baseRate,
          progressiveDeduction: bracket?.deduction ?? 0,
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

  // T-2: 비사업용 토지 누진 + 10%p
  if (input.isNonBusinessLand && surchargeRates.non_business_land) {
    const additionalRate = surchargeRates.non_business_land.additionalRate;
    const progressiveTax = calculateProgressiveTax(taxBase, brackets);
    const bracket = brackets.find((b) => taxBase <= (b.max ?? Infinity));
    const baseRate = bracket?.rate ?? brackets[brackets.length - 1].rate;
    const surchargeAmount = applyRate(taxBase, additionalRate);
    return {
      calculatedTax: progressiveTax + surchargeAmount,
      surchargeType: "non_business_land",
      surchargeRate: roundRate(additionalRate),
      appliedRate: roundRate(baseRate + additionalRate),
      progressiveDeduction: bracket?.deduction ?? 0,
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
  const isHousingLikeProp =
    input.propertyType === "housing" ||
    input.propertyType === "right_to_move_in" ||
    input.propertyType === "presale_right" ||
    input.propertyType === "redevelopment_apt"; // 신축APT는 주택 — §104①2/3호 60%/70%
  const shortTermFlatRate =
    holdingMonthsTotal < 12 ? (isHousingLikeProp ? 0.70 : 0.50) :
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
      if (surchargeInfoST) {
        const additionalRateST = surchargeInfoST.additionalRate;
        const progressiveTaxST = calculateProgressiveTax(taxBase, brackets);
        const bracketST = brackets.find((b) => taxBase <= (b.max ?? Infinity));
        const baseRateST = bracketST?.rate ?? brackets[brackets.length - 1].rate;
        const surchargeTaxST = progressiveTaxST + applyRate(taxBase, additionalRateST);
        if (surchargeTaxST > shortTermTax) {
          return {
            calculatedTax: surchargeTaxST,
            surchargeType: effectiveSurchargeType,
            surchargeRate: roundRate(additionalRateST),
            appliedRate: roundRate(baseRateST + additionalRateST),
            progressiveDeduction: bracketST?.deduction ?? 0,
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

    if (surchargeInfo) {
      const additionalRate = surchargeInfo.additionalRate;
      const progressiveTax = calculateProgressiveTax(taxBase, brackets);
      const bracket = brackets.find((b) => taxBase <= (b.max ?? Infinity));
      const baseRate = bracket?.rate ?? brackets[brackets.length - 1].rate;
      const surchargeAmount = applyRate(taxBase, additionalRate);
      return {
        calculatedTax: progressiveTax + surchargeAmount,
        surchargeType: effectiveSurchargeType,
        surchargeRate: roundRate(additionalRate),
        appliedRate: roundRate(baseRate + additionalRate),
        progressiveDeduction: bracket?.deduction ?? 0,
        surchargeSuspended: false,
      };
    }
  }

  // T-4: 일반 누진세율
  const progressiveTax = calculateProgressiveTax(taxBase, brackets);
  const bracket = brackets.find((b) => taxBase <= (b.max ?? Infinity));
  const baseRate = bracket?.rate ?? brackets[brackets.length - 1].rate;

  return {
    calculatedTax: progressiveTax,
    appliedRate: baseRate,
    progressiveDeduction: bracket?.deduction ?? 0,
    surchargeSuspended: suspended,
  };
}

// ============================================================
// H-8: calcReductions — 감면 계산 (R-1 ~ R-5)
// ============================================================

interface ReductionsResult {
  reductionAmount: number;
  reductionType?: string;
  /** 적용된 감면의 내부 식별자 (합산 재계산·§133 한도 그룹핑용) */
  reductionTypeApplied?: string;
  /**
   * 감면대상 양도소득금액 (합산 재계산의 분자).
   * 편입일 부분감면 시 편입일 비율로 안분된 소득, 편입 없으면 전체 소득.
   */
  reducibleIncome?: number;
}

export function calcReductions(
  calculatedTax: number,
  reductions: TransferReduction[],
  selfFarmingRules: ParsedRates["selfFarmingRules"] | undefined,
  rentalReductionDetails?: RentalReductionInput,
  longTermRentalRules?: LongTermRentalRuleSet,
  newHousingDetails?: NewHousingReductionInput,
  newHousingMatrix?: NewHousingMatrixData,
  transferDate?: Date,
  transferIncome?: number,
  basicDeduction?: number,
  taxBase?: number,
  // NEW: 자경농지 편입일 부분감면을 위한 주 자산 취득일·기준시가 3점값 전파
  acquisitionDate?: Date,
  standardPriceAtAcquisition?: number,
  standardPriceAtTransfer?: number,
): ReductionsResult & {
  rentalReductionDetail?: RentalReductionResult;
  newHousingReductionDetail?: NewHousingReductionResult;
  publicExpropriationDetail?: PublicExpropriationReductionResult;
  selfFarmingReductionDetail?: SelfFarmingReductionResult;
} {
  if (reductions.length === 0 && !rentalReductionDetails && !newHousingDetails) {
    return { reductionAmount: 0 };
  }

  // 조특법 §127 ② 감면 중복 배제: 납세자에게 유리한 1건만 적용
  interface ReductionCandidate {
    amount: number;
    type: string;
    /** 감면대상 양도소득금액 (합산 재계산용 분자, 편입 부분감면 시 비율 적용 후) */
    reducibleIncome?: number;
  }
  const candidates: ReductionCandidate[] = [];
  let rentalReductionDetail: RentalReductionResult | undefined;
  let newHousingReductionDetail: NewHousingReductionResult | undefined;
  let publicExpropriationDetail: PublicExpropriationReductionResult | undefined;
  let selfFarmingReductionDetail: SelfFarmingReductionResult | undefined;

  // R-2-V2: 장기임대 정밀 엔진
  if (rentalReductionDetails) {
    const detailsWithTax: RentalReductionInput = { ...rentalReductionDetails, calculatedTax };
    const rentalResult = calculateRentalReduction(detailsWithTax, longTermRentalRules);
    rentalReductionDetail = rentalResult;
    if (rentalResult.isEligible && rentalResult.reductionAmount > 0) {
      candidates.push({ amount: rentalResult.reductionAmount, type: "long_term_rental" });
    }
  }

  // R-3-V2: 신축/미분양 정밀 엔진
  if (newHousingDetails) {
    const detailsWithTax: NewHousingReductionInput = { ...newHousingDetails, calculatedTax };
    const newHousingResult = determineNewHousingReduction(detailsWithTax, newHousingMatrix);
    newHousingReductionDetail = newHousingResult;
    if (newHousingResult.isEligible && newHousingResult.reductionAmount > 0) {
      candidates.push({ amount: newHousingResult.reductionAmount, type: "new_housing" });
    }
  }

  // R-5: 공익사업용 토지 수용 감면 (조특법 §77)
  for (const reduction of reductions) {
    if (reduction.type !== "public_expropriation") continue;
    if (!transferDate || transferIncome === undefined || basicDeduction === undefined || taxBase === undefined) continue;
    const result = calculatePublicExpropriationReduction({
      cashCompensation: reduction.cashCompensation,
      bondCompensation: reduction.bondCompensation,
      bondHoldingYears: reduction.bondHoldingYears ?? null,
      businessApprovalDate: reduction.businessApprovalDate,
      transferDate,
      calculatedTax,
      transferIncome,
      basicDeduction,
      taxBase,
    });
    publicExpropriationDetail = result;
    if (result.isEligible && result.reductionAmount > 0) {
      candidates.push({ amount: result.reductionAmount, type: "public_expropriation" });
    }
  }

  // R-1~R-4: 하위 호환 단순 감면
  const v2Types = new Set(candidates.map((c) => c.type));
  for (const reduction of reductions) {
    if (v2Types.has(reduction.type)) continue;
    if (reduction.type === "unsold_housing" && v2Types.has("new_housing")) continue;

    let amount = 0;
    let candidateType: string = reduction.type;
    let candidateReducibleIncome: number | undefined;

    if (reduction.type === "self_farming" && selfFarmingRules) {
      // 조특법 §69 자경농지 감면 + 조특령 §66 ⑪ 1호 피상속인 경작기간 합산
      // + 조특령 §66 ⑤⑥ 주거·상업·공업지역 편입 시 부분감면
      const minYears = selfFarmingRules.conditions.minFarmingYears;
      const own = reduction.farmingYears;
      const needsDecedent = own < minYears;
      const decedent = reduction.decedentFarmingYears ?? 0;

      // 편입일·기준시가·과세표준 등 재계산에 필요한 입력이 모두 있으면 신규 엔진 경로 사용.
      // (일반 STEP 8 및 STEP 1.5 다필지 경로는 모두 해당 입력을 제공하도록 transfer-tax.ts 에서 보장한다.)
      const canUseNewEngine =
        transferDate !== undefined &&
        transferIncome !== undefined &&
        taxBase !== undefined &&
        acquisitionDate !== undefined;

      if (canUseNewEngine) {
        const sfResult = calculateSelfFarmingReduction({
          transferIncome: transferIncome!,
          farmingYears: own,
          decedentFarmingYears: decedent > 0 ? decedent : undefined,
          minFarmingYears: minYears,
          acquisitionDate: acquisitionDate!,
          transferDate: transferDate!,
          incorporationDate: reduction.incorporationDate,
          incorporationZoneType: reduction.incorporationZoneType,
          standardPriceAtAcquisition,
          standardPriceAtIncorporation: reduction.standardPriceAtIncorporation,
          standardPriceAtTransfer,
        });
        selfFarmingReductionDetail = sfResult;

        if (sfResult.qualifies && sfResult.reducibleIncome > 0 && taxBase! > 0) {
          // 감면세액 = 산출세액 × (감면대상소득 / 과세표준), 조특법 §133 한도 1억원.
          const rawAmount = safeMultiplyThenDivide(
            calculatedTax,
            sfResult.reducibleIncome,
            taxBase!,
          );
          amount = Math.min(rawAmount, selfFarmingRules.maxAmount);
          candidateReducibleIncome = sfResult.reducibleIncome;

          if (sfResult.partialReductionApplied) {
            candidateType = "self_farming_incorp";
          } else if (needsDecedent && decedent > 0) {
            candidateType = "self_farming_inherited";
          }
        }
      } else {
        // 레거시 경로 — 파라미터 부족 시 기존 단순 계산 유지 (하위 호환)
        const effective = needsDecedent ? own + decedent : own;
        if (effective >= minYears) {
          amount = Math.min(
            applyRate(calculatedTax, selfFarmingRules.maxRate),
            selfFarmingRules.maxAmount,
          );
          if (needsDecedent && decedent > 0) {
            candidateType = "self_farming_inherited";
          }
        }
      }
    } else if (reduction.type === "long_term_rental") {
      if (reduction.rentalYears >= 8 && reduction.rentIncreaseRate <= 0.05) {
        amount = applyRate(calculatedTax, 0.5);
      }
    } else if (reduction.type === "new_housing") {
      const rate = reduction.region === "metropolitan" ? 0.5 : 1.0;
      amount = applyRate(calculatedTax, rate);
    } else if (reduction.type === "unsold_housing") {
      amount = calculatedTax;
    }
    if (amount > 0) {
      candidates.push({
        amount,
        type: candidateType,
        reducibleIncome: candidateReducibleIncome,
      });
    }
  }

  const best = candidates.reduce<ReductionCandidate>(
    (a, b) => (a.amount >= b.amount ? a : b),
    { amount: 0, type: "" },
  );
  const reductionAmount = Math.min(best.amount, calculatedTax);
  const reductionTypeLabel: Record<string, string> = {
    // legacy 5개 (Round 8 자동변환 마이그레이션 + 1개월 alias)
    self_farming: "자경농지",
    self_farming_inherited: "자경농지(§69·상속인 경작기간 합산 §66⑪)",
    self_farming_incorp: "자경농지(§69·편입일 부분감면 §66⑤⑥)",
    long_term_rental: "장기임대주택",
    new_housing: "신축주택",
    unsold_housing: "미분양주택",
    public_expropriation: "공익사업용 토지 수용(§77)",
    // Round 8 (2026-05-06): 신규 23개 ID 한국어 라벨 (방어 코드)
    // Phase 2 본격 구현 시 calcReductions candidates 진입 케이스 대응
    rental_97_main: "장기임대주택 (§97 ① 본문)",
    rental_97_proviso: "장기임대주택 (§97 ① 단서)",
    rental_97_2: "신축임대주택 (§97의2)",
    rental_97_3: "장기일반민간임대 (§97의3)",
    rental_97_4: "장기보유 임대주택 (§97의4)",
    rental_97_5: "장기일반민간임대 100% (§97의5)",
    new_99: "신축주택 (§99 IMF 1차)",
    new_99_3: "신축주택 과세특례 (§99의3 IMF 2차)",
    new_99_4_rural: "농어촌주택 (§99의4)",
    new_99_4_hometown: "고향주택 (§99의4)",
    unsold_98: "미분양 분리과세 (§98)",
    unsold_98_2: "지방 미분양 (§98의2)",
    unsold_98_3: "서울 외 미분양 (§98의3)",
    unsold_98_4: "비거주자 일반주택 (§98의4)",
    unsold_98_5: "수도권 외 미분양 (§98의5)",
    unsold_98_6: "준공후미분양 (§98의6)",
    unsold_98_7: "9억 이하 미분양 (§98의7)",
    unsold_98_8: "준공후미분양 6억·135㎡ (§98의8)",
    unsold_98_9: "수도권 밖 준공후미분양 (§98의9)",
    unsold_99_2: "신축·미분양·1세대1주택 (§99의2)",
  };
  const reductionTypeDisplay = best.type ? (reductionTypeLabel[best.type] ?? best.type) : undefined;

  return {
    reductionAmount,
    reductionType: reductionTypeDisplay,
    reductionTypeApplied: best.type || undefined,
    reducibleIncome: best.amount > 0 ? best.reducibleIncome : undefined,
    rentalReductionDetail,
    newHousingReductionDetail,
    publicExpropriationDetail,
    selfFarmingReductionDetail,
  };
}

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
  const { rawInput, effectiveInput, input, parsedRates, multiHouseSurchargeResult, carryoverDetail, options } = ctx;

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

