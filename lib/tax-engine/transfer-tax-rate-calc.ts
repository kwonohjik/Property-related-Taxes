/**
 * 양도소득세 세액 결정 헬퍼 (순수 함수)
 *
 * transfer-tax-helpers.ts 에서 분리한 세율·세액·감면 계산 로직.
 *   H-6.5: calculateBuildingPenalty — §114조의2 가산세
 *   H-7:   calcTax                  — 세액 결정 (T-1 ~ T-4)
 *   H-8:   calcReductions           — 감면 계산 (R-1 ~ R-5, 조특법 §127 ② 중복배제)
 */

import {
  applyRate,
  calculateProgressiveTax,
  calculateHoldingPeriod,
  isSurchargeSuspended,
  safeMultiplyThenDivide,
} from "./tax-utils";
import type { MultiHouseSurchargeResult } from "./multi-house-surcharge";
import type { ParsedRates } from "./transfer-tax-helpers";
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
import type { TransferTaxInput, TransferReduction } from "./types/transfer.types";

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
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const yearsHeld = (transferDate.getTime() - input.constructionDate.getTime()) / msPerYear;
  if (yearsHeld >= 5) return null;

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
  const rateBasisAcquisitionDate =
    input.acquisitionCause === "inheritance" && input.decedentAcquisitionDate
      ? input.decedentAcquisitionDate
      : input.acquisitionCause === "gift" && input.donorAcquisitionDate
        ? input.donorAcquisitionDate
        : input.acquisitionDate;
  const holdingForRate = calculateHoldingPeriod(rateBasisAcquisitionDate, input.transferDate);
  const holdingMonthsTotal = holdingForRate.years * 12 + holdingForRate.months;
  const isHousingLikeProp =
    input.propertyType === "housing" ||
    input.propertyType === "right_to_move_in" ||
    input.propertyType === "presale_right";
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
    self_farming: "자경농지",
    self_farming_inherited: "자경농지(§69·상속인 경작기간 합산 §66⑪)",
    self_farming_incorp: "자경농지(§69·편입일 부분감면 §66⑤⑥)",
    long_term_rental: "장기임대주택",
    new_housing: "신축주택",
    unsold_housing: "미분양주택",
    public_expropriation: "공익사업용 토지 수용(§77)",
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
