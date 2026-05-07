/**
 * 양도소득세 기초 계산 헬퍼 (순수 함수)
 *
 * calculateTransferTax() 오케스트레이터가 조립하는 9개 헬퍼 중 기초 계산 담당.
 *   H-1: parseRatesFromMap       — DB 세율 Map 파싱
 *   H-2: checkExemption          — 비과세 판단 (E-1 ~ E-4)
 *   H-3: calcTransferGain        — 양도차익 계산
 *   H-4: calcOneHouseProration   — 12억 초과분 안분
 *   H-5: calcLongTermHoldingDeduction — 장기보유특별공제
 *   H-6: calcBasicDeduction      — 기본공제
 *
 * 세액·감면 계산 (H-6.5 ~ H-8)은 ./transfer-tax-rate-calc.ts 로 분리.
 */

import { addYears } from "date-fns";
import {
  applyRate,
  calculateEstimatedAcquisitionPrice,
  calculateHoldingPeriod,
  calculateProration,
} from "./tax-utils";
import { TaxRateNotFoundError } from "./tax-errors";
import { TRANSFER } from "./legal-codes";
import {
  parseDeductionRules,
  parseProgressiveRate,
  parseSurchargeRate,
  parseHouseCountExclusion,
  parseRegulatedAreaHistory,
  parseNonBusinessLandJudgment,
  parseLongTermRentalRuleSet,
  parseNewHousingMatrix,
  type DeductionRulesData,
  type OneHouseSpecialRulesData,
  type SurchargeRateData,
  type SurchargeSpecialRulesData,
  type HouseCountExclusionData,
  type RegulatedAreaHistoryData,
  type NonBusinessLandJudgmentSchemaData,
  type LongTermRentalRuleSet,
  type NewHousingMatrixData,
} from "./schemas/rate-table.schema";
import { getLongTermDeductionOverride } from "./rental-housing-reduction";
import { getRate } from "@/lib/db/tax-rates";
import type { TaxBracket } from "./types";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type {
  TransferTaxInput,
  SplitGainResult,
  TransferTaxResult,
  CalculationStep,
} from "./types/transfer.types";
import type {
  MultiHouseSurchargeResult,
} from "./multi-house-surcharge";
import { calcSplitGain } from "./transfer-tax-split-gain";
import {
  calculateCommercialBuildingValuation,
  type CommercialBuildingValuationResult,
} from "./commercial-building-valuation";
import {
  calculateTransferTaxPenalty,
  type TransferTaxPenaltyResult,
} from "./transfer-tax-penalty";

// ============================================================
// 내부 파싱 결과 타입 — transfer-tax-rate-calc.ts 에서도 import
// ============================================================

export interface ParsedRates {
  brackets: TaxBracket[];
  longTermHoldingRules: Extract<DeductionRulesData, { type: "long_term_holding" }>;
  basicDeductionRules: Extract<DeductionRulesData, { type: "basic_deduction" }>;
  surchargeRates: SurchargeRateData;
  surchargeSpecialRules: SurchargeSpecialRulesData;
  oneHouseSpecialRules: OneHouseSpecialRulesData;
  selfFarmingRules?: Extract<DeductionRulesData, { type: "self_farming" }>;
  houseCountExclusionRules?: HouseCountExclusionData;
  regulatedAreaHistory?: RegulatedAreaHistoryData;
  nonBusinessLandJudgmentRules?: NonBusinessLandJudgmentSchemaData;
  longTermRentalRules?: LongTermRentalRuleSet;
  newHousingMatrix?: NewHousingMatrixData;
}

// ============================================================
// H-1: parseRatesFromMap — DB 세율 Map 파싱
// ============================================================

export function parseRatesFromMap(rates: TaxRatesMap): ParsedRates {
  const progressiveRecord = getRate(rates, "transfer", "progressive_rate");
  if (!progressiveRecord) {
    throw new TaxRateNotFoundError("양도소득세 누진세율(progressive_rate:_default)이 없습니다");
  }
  const { brackets } = parseProgressiveRate(progressiveRecord.rateTable);
  const normalizedBrackets: TaxBracket[] = brackets.map((b) => ({
    min: b.min,
    max: b.max ?? null,
    rate: b.rate,
    deduction: b.deduction,
  }));

  const lthdRecord = getRate(rates, "transfer", "deduction", "long_term_holding");
  if (!lthdRecord) throw new TaxRateNotFoundError("장기보유특별공제 규칙(deduction:long_term_holding)이 없습니다");
  const lthdRules = parseDeductionRules(lthdRecord.deductionRules);
  if (lthdRules.type !== "long_term_holding") throw new TaxRateNotFoundError("장기보유특별공제 규칙 타입 오류");

  const basicRecord = getRate(rates, "transfer", "deduction", "basic");
  if (!basicRecord) throw new TaxRateNotFoundError("기본공제 규칙(deduction:basic)이 없습니다");
  const basicRules = parseDeductionRules(basicRecord.deductionRules);
  if (basicRules.type !== "basic_deduction") throw new TaxRateNotFoundError("기본공제 규칙 타입 오류");

  const surchargeRecord = getRate(rates, "transfer", "surcharge");
  if (!surchargeRecord) throw new TaxRateNotFoundError("중과세율(surcharge:_default)이 없습니다");
  const surchargeRates = parseSurchargeRate(surchargeRecord.rateTable);
  const surchargeSpecialRules = surchargeRecord.specialRules as SurchargeSpecialRulesData;

  const oneHouseRecord = getRate(rates, "transfer", "special", "one_house_exemption");
  if (!oneHouseRecord) throw new TaxRateNotFoundError("1세대1주택 특례(special:one_house_exemption)가 없습니다");
  const oneHouseSpecialRules = oneHouseRecord.specialRules as OneHouseSpecialRulesData;

  const selfFarmingRecord = getRate(rates, "transfer", "deduction", "self_farming");
  let selfFarmingRules: ParsedRates["selfFarmingRules"] | undefined;
  if (selfFarmingRecord) {
    const parsed = parseDeductionRules(selfFarmingRecord.deductionRules);
    if (parsed.type === "self_farming") selfFarmingRules = parsed;
  }

  const houseCountRecord = getRate(rates, "transfer", "special", "house_count_exclusion");
  let houseCountExclusionRules: HouseCountExclusionData | undefined;
  if (houseCountRecord?.specialRules) {
    houseCountExclusionRules = parseHouseCountExclusion(houseCountRecord.specialRules);
  }

  const regulatedAreaRecord = getRate(rates, "transfer", "special", "regulated_areas");
  let regulatedAreaHistory: RegulatedAreaHistoryData | undefined;
  if (regulatedAreaRecord?.specialRules) {
    regulatedAreaHistory = parseRegulatedAreaHistory(regulatedAreaRecord.specialRules);
  }

  const nonBizLandRecord = getRate(rates, "transfer", "special", "non_business_land_judgment");
  let nonBusinessLandJudgmentRules: NonBusinessLandJudgmentSchemaData | undefined;
  if (nonBizLandRecord?.specialRules) {
    nonBusinessLandJudgmentRules = parseNonBusinessLandJudgment(nonBizLandRecord.specialRules);
  }

  const longTermRentalRecord = getRate(rates, "transfer", "deduction", "long_term_rental_v2");
  let longTermRentalRules: LongTermRentalRuleSet | undefined;
  if (longTermRentalRecord?.deductionRules) {
    longTermRentalRules = parseLongTermRentalRuleSet(longTermRentalRecord.deductionRules);
  }

  const newHousingRecord = getRate(rates, "transfer", "deduction", "new_housing_matrix");
  let newHousingMatrix: NewHousingMatrixData | undefined;
  if (newHousingRecord?.deductionRules) {
    newHousingMatrix = parseNewHousingMatrix(newHousingRecord.deductionRules);
  }

  return {
    brackets: normalizedBrackets,
    longTermHoldingRules: lthdRules,
    basicDeductionRules: basicRules,
    surchargeRates,
    surchargeSpecialRules,
    oneHouseSpecialRules,
    selfFarmingRules,
    houseCountExclusionRules,
    regulatedAreaHistory,
    nonBusinessLandJudgmentRules,
    longTermRentalRules,
    newHousingMatrix,
  };
}

// ============================================================
// H-2: checkExemption — 비과세 판단 (E-1 ~ E-4)
// ============================================================

interface ExemptionResult {
  isExempt: boolean;
  isPartialExempt: boolean;
  exemptReason?: string;
}

export function checkExemption(
  input: TransferTaxInput,
  oneHouseRules: OneHouseSpecialRulesData,
): ExemptionResult {
  const { one_house_exemption: rule, temporary_two_house: twoHouseRule } = oneHouseRules;

  if (!input.isOneHousehold || input.propertyType !== "housing") {
    return { isExempt: false, isPartialExempt: false };
  }

  const holding = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);

  // E-3: 일시적 2주택
  if (input.householdHousingCount === 2 && input.temporaryTwoHouse && twoHouseRule) {
    const { previousAcquisitionDate, newAcquisitionDate } = input.temporaryTwoHouse;

    const prevHolding = calculateHoldingPeriod(previousAcquisitionDate, input.transferDate);
    if (prevHolding.years < rule.minHoldingYears) {
      return { isExempt: false, isPartialExempt: false };
    }

    let deadlineYears = twoHouseRule.disposalDeadlineYears;
    if (input.isRegulatedArea) {
      // 부칙: 양도일이 완화 시행일(2022-05-10) 이후이면 완화 기한 적용
      const relaxDate = twoHouseRule.regulatedAreaRelaxDate
        ? new Date(twoHouseRule.regulatedAreaRelaxDate)
        : null;
      if (relaxDate && input.transferDate >= relaxDate) {
        deadlineYears = twoHouseRule.regulatedAreaRelaxDeadlineYears ?? twoHouseRule.regulatedAreaDeadlineYears;
      } else {
        deadlineYears = twoHouseRule.regulatedAreaDeadlineYears;
      }
    }
    const deadline = addYears(newAcquisitionDate, deadlineYears);
    if (input.transferDate <= deadline) {
      return { isExempt: true, isPartialExempt: false, exemptReason: "일시적 2주택 비과세" };
    }
  }

  if (input.householdHousingCount !== 1) {
    return { isExempt: false, isPartialExempt: false };
  }

  // E-4: 2017.8.3 이전 취득 경과규정
  const prePolicyDate = new Date(rule.prePolicyDate);
  const isPrePolicy = input.acquisitionDate < prePolicyDate;
  const isRegulatedAtAcquisition = input.wasRegulatedAtAcquisition;

  const residenceYears = Math.floor(input.residencePeriodMonths / 12);
  const meetsResidence =
    !input.wasRegulatedAtAcquisition ||
    (isPrePolicy && !isRegulatedAtAcquisition) ||
    residenceYears >= rule.regulatedAreaMinResidenceYears;

  const meetsHolding = holding.years >= rule.minHoldingYears;

  if (!meetsHolding || !meetsResidence) {
    return { isExempt: false, isPartialExempt: false };
  }

  // E-1: 전액 비과세 (양도가 12억 이하)
  // 지분 모드: totalPropertyTransferPrice(총 물건가)로 12억 판정 — 지분 양도가액으로 판정 시 잘못된 전액비과세 발생.
  const exemptionPriceCheck = input.totalPropertyTransferPrice ?? input.transferPrice;
  if (exemptionPriceCheck <= rule.maxExemptPrice) {
    return { isExempt: true, isPartialExempt: false, exemptReason: "1세대1주택 비과세" };
  }

  // E-2: 부분과세 (양도가 12억 초과)
  return { isExempt: false, isPartialExempt: true, exemptReason: "1세대1주택 고가주택" };
}

// ============================================================
// H-3: calcTransferGain — 양도차익 계산
// ============================================================

interface TransferGainResult {
  gain: number;
  usedEstimated: boolean;
  estimatedBase: number;
  estimatedDeduction: number;
  expenses: number;
  splitDetail?: SplitGainResult;
  /** 필요경비 산정 모드 */
  necessaryExpenseMode?: "actual" | "estimated_with_deduction" | "swap_to_direct";
  /** §97② 단서 swap 발동 여부 */
  swapApplied?: boolean;
  /** swap 비교 정보 (환산/감정가액 모드에서만) */
  swapComparison?: {
    /** 환산취득가(or 감정가액) + 개산공제 */
    estimatedSide: number;
    /** 자본적지출 + 양도비 */
    directSide: number;
    chosen: "estimated" | "direct";
  };
}

/**
 * 소득세법 §97② 2호 본문/단서 적용 — 필요경비 결정.
 * - 실가 모드: capExp + trExp 직접 차감 (legacy `expenses` fallback)
 * - 환산/감정가액 모드 (본문): 개산공제만 인정
 * - 환산/감정가액 모드 (단서): 환산+개산 < 자본+양도비 → 자본+양도비를 필요경비로 swap
 *
 * swap 발동 조건: `capitalExpenditure` 또는 `transferExpense` 중 하나라도 명시 입력 + directSide > estimatedSide.
 * 동률(==)은 본문 적용 (단서는 "적은 경우" 명시).
 */
function calcNecessaryExpense(
  input: TransferTaxInput,
  estimatedBase: number,
  estimatedDeduction: number,
  isEstimatedMode: boolean,
): {
  expensesApplied: number;
  mode: "actual" | "estimated_with_deduction" | "swap_to_direct";
  swap?: TransferGainResult["swapComparison"];
} {
  const capExp = input.capitalExpenditure ?? 0;
  const trExp = input.transferExpense ?? 0;
  const directSide = capExp + trExp;
  const swapEligible =
    input.capitalExpenditure !== undefined || input.transferExpense !== undefined;

  if (!isEstimatedMode) {
    // 실가 모드 — 자본+양도비 직접 차감. 분리 입력 없으면 legacy expenses 사용.
    return {
      expensesApplied: swapEligible ? directSide : input.expenses,
      mode: "actual",
    };
  }

  const estimatedSide = estimatedBase + estimatedDeduction;

  if (swapEligible && directSide > estimatedSide) {
    // §97② 2호 단서 — 환산+개산 < 자본+양도비 → 자본+양도비 적용
    // acquisitionCost는 estimatedBase 유지, expenses를 directSide로 교체
    return {
      expensesApplied: directSide,
      mode: "swap_to_direct",
      swap: { estimatedSide, directSide, chosen: "direct" },
    };
  }

  // 본문 — 환산 + 개산공제만 (legacy expenses 차감 안 함)
  return {
    expensesApplied: estimatedDeduction,
    mode: "estimated_with_deduction",
    swap: swapEligible
      ? { estimatedSide, directSide, chosen: "estimated" }
      : undefined,
  };
}

export function calcTransferGain(input: TransferTaxInput): TransferGainResult {
  // 토지/건물 취득일 분리 케이스 — 각각 양도차익 계산 후 합산
  const splitResult = calcSplitGain(input);
  if (splitResult) {
    const totalGain = splitResult.land.gain + splitResult.building.gain;
    const flooredGain = input.skipLossFloor ? totalGain : Math.max(0, totalGain);
    const totalDeduction = splitResult.land.appraisalDeduction + splitResult.building.appraisalDeduction;
    const totalExpenses = splitResult.land.directExpenses + splitResult.building.directExpenses;
    const usedEstimated = input.useEstimatedAcquisition || input.acquisitionMethod === "appraisal";
    return {
      gain: flooredGain,
      usedEstimated,
      estimatedBase: usedEstimated
        ? splitResult.land.acquisitionPrice + splitResult.building.acquisitionPrice
        : 0,
      estimatedDeduction: totalDeduction,
      expenses: totalExpenses,
      splitDetail: splitResult,
      necessaryExpenseMode: usedEstimated ? "estimated_with_deduction" : "actual",
      // 토지/건물 split swap은 자산 단위 적용 — calcSplitGain 내부 처리는 별도 PR
    };
  }

  let estimatedBase = 0;
  let estimatedDeduction = 0;
  let acquisitionCostBase: number;
  let usedEstimated = false;

  if (input.useEstimatedAcquisition) {
    const estimated = calculateEstimatedAcquisitionPrice(
      input.transferPrice,
      input.standardPriceAtAcquisition ?? 0,
      input.standardPriceAtTransfer ?? 0,
    );
    const deduction = applyRate(input.standardPriceAtAcquisition ?? 0, 0.03);
    acquisitionCostBase = estimated;
    estimatedBase = estimated;
    estimatedDeduction = deduction;
    usedEstimated = true;
  } else if (input.acquisitionMethod === "appraisal") {
    // 감정가액 모드: 소득세법 시행령 §163⑥에 따라 환산취득가와 동일하게 개산공제 자동 적용.
    const appraisal = input.appraisalValue ?? input.acquisitionPrice;
    const deduction = applyRate(input.standardPriceAtAcquisition ?? 0, 0.03);
    acquisitionCostBase = appraisal;
    estimatedBase = appraisal;
    estimatedDeduction = deduction;
    usedEstimated = true;
  } else {
    acquisitionCostBase = input.acquisitionPrice;
  }

  const necessary = calcNecessaryExpense(input, estimatedBase, estimatedDeduction, usedEstimated);
  const gain = input.transferPrice - acquisitionCostBase - necessary.expensesApplied;
  const flooredGain = input.skipLossFloor ? gain : Math.max(0, gain);
  return {
    gain: flooredGain,
    usedEstimated,
    estimatedBase,
    estimatedDeduction,
    expenses: necessary.expensesApplied,
    necessaryExpenseMode: necessary.mode,
    swapApplied: necessary.mode === "swap_to_direct",
    swapComparison: necessary.swap,
  };
}

// ============================================================
// H-4: calcOneHouseProration — 12억 초과분 안분
// ============================================================

/**
 * 1세대1주택 12억 초과분 과세 양도차익 안분.
 *
 * @param gain 전체 양도차익 (지분 모드 시 이 자산 지분에 해당하는 양도차익)
 * @param transferPrice 양도가액 (지분 모드 시 이 자산 지분에 해당하는 양도가액)
 * @param totalPropertyTransferPrice 총 물건 양도가액 (지분 모드 전용 — 12억 안분 분모로 사용).
 *   미설정 시 transferPrice를 분모로 사용 (단독 소유 호환).
 *
 * 산식: 과세 양도차익 = floor(gain × (분모 - 12억) / 분모)
 *   - 단독: 분모 = transferPrice
 *   - 지분: 분모 = totalPropertyTransferPrice (총 물건가)
 */
export function calcOneHouseProration(
  gain: number,
  transferPrice: number,
  totalPropertyTransferPrice?: number,
): number {
  const threshold = 1_200_000_000;
  const denominator = totalPropertyTransferPrice ?? transferPrice;
  if (denominator <= threshold) return gain;
  return calculateProration(gain, denominator - threshold, denominator);
}

// ============================================================
// H-5: calcLongTermHoldingDeduction — 장기보유특별공제
// ============================================================

interface LongTermHoldingResult {
  deduction: number;
  rate: number;
  holdingPeriod: { years: number; months: number };
}

export function calcLongTermHoldingDeduction(
  taxableGain: number,
  input: TransferTaxInput,
  rules: ParsedRates["longTermHoldingRules"],
  isSurcharge: boolean,
  isSuspended: boolean,
  longTermRentalRules?: LongTermRentalRuleSet,
  splitDetail?: SplitGainResult,
): LongTermHoldingResult {
  // L-0: 미등기 — 배제
  if (input.isUnregistered) {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 } };
  }

  // L-0a: 분양권·승계입주권 — 배제
  if (input.propertyType === "presale_right") {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 } };
  }
  if (input.propertyType === "right_to_move_in" && input.isSuccessorRightToMoveIn === true) {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 } };
  }

  // L-1: 중과세 적용 중(유예 해제)이면 배제
  if (isSurcharge && !isSuspended) {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 } };
  }

  // L-1b: 부수토지 일체과세 (landNature === "appurtenant_to_housing")
  // — 포괄적 일체과세 원칙: primary 주택의 보유기간·거주기간 기준 표 1/2 적용
  // — 단기보유(1년 미만 → 70%, 1~2년 → 60%) 시에는 LTHD 배제 (세율에서 이미 처리됨)
  // — 2년 이상 보유 시 주택 기준 LTHD 적용 (primaryContextForCompanionRate에서 holdingMonths 사용)
  if (
    input.propertyType === "land" &&
    input.landNature === "appurtenant_to_housing" &&
    input.primaryContextForCompanionRate
  ) {
    const ctx = input.primaryContextForCompanionRate;
    // primary 주택 보유기간 기준
    const primaryHoldingYears = Math.floor(ctx.holdingMonths / 12);
    // 2년 미만이면 단기세율 적용 → LTHD 배제
    if (ctx.holdingMonths < 24) {
      const holding = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);
      return { deduction: 0, rate: 0, holdingPeriod: { years: holding.years, months: holding.months } };
    }
    // 2년 이상: primary 주택 기준 LTHD 계산
    // 부수토지는 1세대1주택 여부·거주기간을 주택과 공유
    const isOneHouseSingleForCompanion =
      input.isOneHousehold && input.householdHousingCount === 1;
    const residenceYears = Math.floor(input.residencePeriodMonths / 12);
    let companionRate: number;
    if (isOneHouseSingleForCompanion && residenceYears >= 2) {
      // 표 2 (1세대1주택, §95② 별표): 보유분 4% + 거주분 4%, 각 40% 캡
      const holdingPart = Math.min(primaryHoldingYears * 0.04, 0.40);
      const residencePart = Math.min(residenceYears * 0.04, 0.40);
      companionRate = holdingPart + residencePart;
    } else {
      // 표 1 (일반): 보유 × 2%, 최대 30%
      companionRate = Math.min(primaryHoldingYears * 0.02, 0.30);
    }
    const deduction = companionRate > 0 ? applyRate(taxableGain, companionRate) : 0;
    const holding = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);
    return {
      deduction,
      rate: companionRate,
      holdingPeriod: { years: holding.years, months: holding.months },
    };
  }

  // L-1c: 장기임대주택 특례율 우선 적용
  if (input.rentalReductionDetails && longTermRentalRules) {
    const override = getLongTermDeductionOverride(
      input.rentalReductionDetails,
      longTermRentalRules,
    );
    if (override.hasOverride) {
      const holding = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);
      const deduction = applyRate(taxableGain, override.overrideRate);
      return {
        deduction,
        rate: override.overrideRate,
        holdingPeriod: { years: holding.years, months: holding.months },
      };
    }
  }

  const isOneHouseSingle =
    input.isOneHousehold && input.householdHousingCount === 1;
  const residenceYears = Math.floor(input.residencePeriodMonths / 12);

  // 공제율 산식 (L-3/L-4 통합 헬퍼)
  const rateForYears = (years: number): number => {
    if (years < 3) return 0;
    if (isOneHouseSingle && residenceYears >= 2) {
      // L-3: 1세대1주택 — 보유기간분·거주기간분 각각 40% 캡 후 합산 (소득세법 §95② 별표)
      const holdingPart = Math.min(years * 0.04, 0.40);
      const residencePart = Math.min(residenceYears * 0.04, 0.40);
      return holdingPart + residencePart;
    }
    // L-4: 일반 (보유 × 2%, 최대 30%)
    return Math.min(years * 0.02, 0.30);
  };

  // 토지/건물 분리 케이스 — 각각 보유연수 적용 후 합산
  if (splitDetail) {
    const selfOwns = splitDetail.selfOwns ?? "both";
    const ownsLand = selfOwns !== "building_only";
    const ownsBuilding = selfOwns !== "land_only";

    // 1세대1주택 12억 초과 안분: 본인 소유 파트 양도가액 기준
    const THRESHOLD = 1_200_000_000;
    const selfTransferPrice = selfOwns === "building_only"
      ? splitDetail.building.transferPrice
      : selfOwns === "land_only"
        ? splitDetail.land.transferPrice
        : input.transferPrice;
    const isProratedSplit = isOneHouseSingle && selfTransferPrice > THRESHOLD;
    const proratePartGain = (g: number): number => {
      if (!isProratedSplit || g <= 0) return g;
      return Math.floor(g * (selfTransferPrice - THRESHOLD) / selfTransferPrice);
    };

    const landTaxableGain = ownsLand ? proratePartGain(splitDetail.land.gain) : 0;
    const buildingTaxableGain = ownsBuilding ? proratePartGain(splitDetail.building.gain) : 0;

    const landRate = ownsLand ? rateForYears(splitDetail.land.holdingYears) : 0;
    const buildingRate = ownsBuilding ? rateForYears(splitDetail.building.holdingYears) : 0;
    const landDed = ownsLand ? applyRate(Math.max(landTaxableGain, 0), landRate) : 0;
    const buildingDed = ownsBuilding ? applyRate(Math.max(buildingTaxableGain, 0), buildingRate) : 0;

    // SplitPartResult 에 공제율·공제액 채우기 (참조 수정)
    splitDetail.land.longTermRate = landRate;
    splitDetail.land.longTermDeduction = landDed;
    splitDetail.building.longTermRate = buildingRate;
    splitDetail.building.longTermDeduction = buildingDed;

    const anchorDate = selfOwns === "land_only" && input.landAcquisitionDate
      ? input.landAcquisitionDate
      : input.acquisitionDate;
    const anchorHolding = calculateHoldingPeriod(anchorDate, input.transferDate);
    return {
      deduction: landDed + buildingDed,
      rate: 0, // 단일 공제율 없음 (혼합) — splitDetail.land/building.longTermRate 참조
      holdingPeriod: { years: anchorHolding.years, months: anchorHolding.months },
    };
  }

  // 단일 취득일 케이스 — 기존 로직
  const holding = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);
  const holdingPeriod = { years: holding.years, months: holding.months };

  const rate = rateForYears(holding.years);
  if (rate > 0) {
    const deduction = applyRate(taxableGain, rate);
    return { deduction, rate, holdingPeriod };
  }

  return { deduction: 0, rate: 0, holdingPeriod };
}

// ============================================================
// H-6: calcBasicDeduction — 기본공제
// ============================================================

export function calcBasicDeduction(
  taxableGain: number,
  longTermDed: number,
  annualUsed: number,
  isUnregistered: boolean,
  rules: ParsedRates["basicDeductionRules"],
): number {
  if (isUnregistered && rules.excludeUnregistered) return 0;

  const remaining = rules.annualLimit - annualUsed;
  if (remaining <= 0) return 0;

  const afterLTH = taxableGain - longTermDed;
  if (afterLTH <= 0) return 0;

  return Math.min(remaining, afterLTH);
}

// ============================================================
// H-0.35: 상업용건물·오피스텔 환산취득가 사전 처리
// ============================================================

export interface CommercialBuildingStepResult {
  /** 엔진 input 덮어쓰기용 업데이트된 acquisitionPrice·expenses */
  acquisitionPrice: number;
  /** 개산공제액 (§163⑥ 취득당시기준시가 × 3%) */
  lumpSumDeduction: number;
  /** 상세 결과 (결과 카드 산식 표시용) */
  detail: CommercialBuildingValuationResult;
}

/**
 * 감면 유형별 법령 조문 매핑 (감면세액 step legalBasis용).
 * transfer-tax.ts의 인라인 상수를 분리하여 800줄 정책 준수.
 */
export function getReductionLegalBasis(
  reductionType: string | undefined,
  useLegacyRates: boolean | undefined,
): string | undefined {
  if (!reductionType) return undefined;
  const map: Record<string, string> = {
    "자경농지":                TRANSFER.REDUCTION_SELF_FARMING,
    "자경농지(§69·상속인 경작기간 합산 §66⑪)": `${TRANSFER.REDUCTION_SELF_FARMING} + ${TRANSFER.REDUCTION_SELF_FARMING_INHERITED}`,
    "자경농지(§69·편입일 부분감면 §66⑤⑥)":  `${TRANSFER.REDUCTION_SELF_FARMING} + ${TRANSFER.REDUCTION_SELF_FARMING_INCORP}`,
    "장기임대주택":            TRANSFER.REDUCTION_LONG_RENTAL,
    "신축주택":                TRANSFER.REDUCTION_NEW_HOUSING,
    "미분양주택":              TRANSFER.REDUCTION_UNSOLD_HOUSING,
    "공익사업용 토지 수용(§77)": useLegacyRates
      ? `${TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION} + ${TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION_TRANSITIONAL}`
      : TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION,
  };
  return map[reductionType];
}

/**
 * 다주택 중과세 상세 판정 결과를 TransferTaxResult 형태로 변환.
 * transfer-tax.ts의 return 객체 인라인 블록을 분리하여 800줄 정책 준수.
 */
export function buildMultiHouseSurchargeDetail(
  result: MultiHouseSurchargeResult,
): NonNullable<TransferTaxResult["multiHouseSurchargeDetail"]> {
  return {
    effectiveHouseCount: result.effectiveHouseCount,
    rawHouseCount: result.rawHouseCount,
    excludedHouses: result.excludedHouses,
    exclusionReasons: result.exclusionReasons,
    isRegulatedAtTransfer: result.isRegulatedAtTransfer,
    warnings: result.warnings,
  };
}

/**
 * STEP 0.35: 상업용건물·오피스텔 환산취득가 처리 (소령 §164⑧ + §176조의2②2호)
 *
 * propertyType === "commercial_building" + useEstimatedAcquisition === true +
 * commercialBuildingValuation 제공 시 환산취득가·개산공제를 계산하여
 * 파이프라인 input에 주입할 값을 반환.
 *
 * 단방향 의존: transfer-tax.ts → 이 함수 → commercial-building-valuation.ts
 *
 * @returns CommercialBuildingStepResult | undefined (분기 해당 없음 시 undefined)
 */
export function runCommercialBuildingStep(
  input: TransferTaxInput,
): CommercialBuildingStepResult | undefined {
  if (
    input.propertyType !== "commercial_building" ||
    !input.useEstimatedAcquisition ||
    !input.commercialBuildingValuation
  ) {
    return undefined;
  }

  const detail = calculateCommercialBuildingValuation(
    input.commercialBuildingValuation,
    input.transferPrice,
  );

  return {
    acquisitionPrice: detail.estimatedAcquisitionTotal,
    lumpSumDeduction: detail.estimatedDeductionTotal,
    detail,
  };
}

// ============================================================
// H-12: emitPenaltySteps — STEP 12 신고불성실·납부지연 가산세 + 합산 step 푸시
// ============================================================

export interface PenaltyEmissionResult {
  penaltyDetail?: TransferTaxPenaltyResult;
  filingDelayedPenalty: number;
  totalAllPenalty: number;
}

/**
 * STEP 12: 신고불성실·납부지연 가산세 계산 + 가산세 합산 step 5종 푸시.
 *
 * - 입력에 filingPenaltyDetails 또는 delayedPaymentDetails가 있으면 calculateTransferTaxPenalty 호출.
 * - 환산가액적용가산세(§114조의2 penaltyTax)와 합산하여 totalAllPenalty 반환.
 * - 가산세가 0보다 크면 steps에 4~5건의 항목 push (가산세 합계 / §114조의2 / 신고불성실 / 납부지연 / 총결정세액).
 *
 * 부수효과: steps 배열에 push (호출측 배열을 그대로 변경).
 */
export function emitPenaltySteps(
  input: TransferTaxInput,
  steps: CalculationStep[],
  determinedTax: number,
  penaltyTax: number,
  penaltyBase: number,
  penaltyNote: string | undefined,
): PenaltyEmissionResult {
  const penaltyDetail =
    input.filingPenaltyDetails || input.delayedPaymentDetails
      ? calculateTransferTaxPenalty({
          filing: input.filingPenaltyDetails,
          delayedPayment: input.delayedPaymentDetails,
        })
      : undefined;
  const filingDelayedPenalty = penaltyDetail?.totalPenalty ?? 0;
  const totalAllPenalty = penaltyTax + filingDelayedPenalty;

  if (totalAllPenalty > 0) {
    steps.push({
      label: "가산세 합계",
      formula: `환산가액적용가산세 + 신고불성실가산세 + 납부지연가산세`,
      amount: totalAllPenalty,
      legalBasis: TRANSFER.BUILDING_PENALTY,
    });
    if (penaltyTax > 0) {
      steps.push({
        label: "환산가액적용가산세 (§114조의2)",
        formula: `${penaltyBase.toLocaleString()} × 5% (${penaltyNote ?? ""})`,
        amount: penaltyTax,
        legalBasis: TRANSFER.BUILDING_PENALTY,
        sub: true,
      });
    }
    if (penaltyDetail?.filingPenalty && penaltyDetail.filingPenalty.filingPenalty > 0) {
      steps.push({
        label: `신고불성실가산세 (${(penaltyDetail.filingPenalty.penaltyRate * 100).toFixed(0)}%)`,
        formula: `납부세액 ${penaltyDetail.filingPenalty.penaltyBase.toLocaleString()} × ${(penaltyDetail.filingPenalty.penaltyRate * 100).toFixed(0)}%`,
        amount: penaltyDetail.filingPenalty.filingPenalty,
        legalBasis: penaltyDetail.filingPenalty.legalBasis,
        sub: true,
      });
    }
    if (penaltyDetail?.delayedPaymentPenalty && penaltyDetail.delayedPaymentPenalty.delayedPaymentPenalty > 0) {
      const d = penaltyDetail.delayedPaymentPenalty;
      steps.push({
        label: `납부지연가산세 (${d.elapsedDays}일 × ${(d.dailyRate * 100).toFixed(3)}%)`,
        formula: `미납세액 ${d.unpaidTax.toLocaleString()} × ${d.elapsedDays}일 × ${(d.dailyRate * 100).toFixed(3)}%`,
        amount: d.delayedPaymentPenalty,
        legalBasis: "국세기본법 §47의4",
        sub: true,
      });
    }
    steps.push({
      label: "총결정세액",
      formula: `결정세액 ${determinedTax.toLocaleString()} + 가산세 합계 ${totalAllPenalty.toLocaleString()}`,
      amount: determinedTax + totalAllPenalty,
      legalBasis: TRANSFER.FINAL_TAX,
    });
  }

  return { penaltyDetail, filingDelayedPenalty, totalAllPenalty };
}
