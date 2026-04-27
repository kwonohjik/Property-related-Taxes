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
import type { TransferTaxInput, SplitGainResult } from "./types/transfer.types";
import { calcSplitGain } from "./transfer-tax-split-gain";

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
  if (input.transferPrice <= rule.maxExemptPrice) {
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
    };
  }

  let acquisitionCost: number;
  let estimatedBase = 0;
  let estimatedDeduction = 0;
  let usedEstimated = false;

  if (input.useEstimatedAcquisition) {
    const estimated = calculateEstimatedAcquisitionPrice(
      input.transferPrice,
      input.standardPriceAtAcquisition ?? 0,
      input.standardPriceAtTransfer ?? 0,
    );
    const deduction = applyRate(input.standardPriceAtAcquisition ?? 0, 0.03);
    acquisitionCost = estimated + deduction;
    estimatedBase = estimated;
    estimatedDeduction = deduction;
    usedEstimated = true;
  } else if (input.acquisitionMethod === "appraisal") {
    // 감정가액 모드: 소득세법 시행령 §163⑥에 따라 환산취득가와 동일하게 개산공제 자동 적용.
    // base = appraisalValue (없으면 acquisitionPrice fallback), 개산공제 = 취득당시 기준시가 × 3%.
    const appraisal = input.appraisalValue ?? input.acquisitionPrice;
    const deduction = applyRate(input.standardPriceAtAcquisition ?? 0, 0.03);
    acquisitionCost = appraisal + deduction;
    estimatedBase = appraisal;
    estimatedDeduction = deduction;
    usedEstimated = true;
  } else {
    acquisitionCost = input.acquisitionPrice;
  }

  const gain = input.transferPrice - acquisitionCost - input.expenses;
  const flooredGain = input.skipLossFloor ? gain : Math.max(0, gain);
  return {
    gain: flooredGain,
    usedEstimated,
    estimatedBase,
    estimatedDeduction,
    expenses: input.expenses,
  };
}

// ============================================================
// H-4: calcOneHouseProration — 12억 초과분 안분
// ============================================================

export function calcOneHouseProration(gain: number, transferPrice: number): number {
  const threshold = 1_200_000_000;
  if (transferPrice <= threshold) return gain;
  return calculateProration(gain, transferPrice - threshold, transferPrice);
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
      // L-3: 1세대1주택 (보유 × 4% + 거주 × 4%, 최대 80%)
      return Math.min(years * 0.04 + residenceYears * 0.04, 0.80);
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
