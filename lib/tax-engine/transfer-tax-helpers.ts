/**
 * 양도소득세 내부 계산 헬퍼 (순수 함수)
 *
 * transfer-tax.ts 에서 분리된 9개 헬퍼 + 내부 파싱 타입.
 * calculateTransferTax() 오케스트레이터가 이들을 조립하여 결과를 산출한다.
 *
 * 법적 근거 및 단계명은 각 함수 주석 참조.
 *
 * TODO: 이 파일은 800줄 정책 초과 (846줄). 추후 타입·파싱·세부 헬퍼로 추가 분할 필요.
 */

import { addYears } from "date-fns";
import {
  applyRate,
  calculateEstimatedAcquisitionPrice,
  calculateHoldingPeriod,
  calculateProgressiveTax,
  calculateProration,
  isSurchargeSuspended,
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
import type { MultiHouseSurchargeResult } from "./multi-house-surcharge";
import {
  type RentalReductionInput,
  type RentalReductionResult,
  calculateRentalReduction,
  getLongTermDeductionOverride,
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
import { getRate } from "@/lib/db/tax-rates";
import type { TaxBracket } from "./types";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type {
  TransferTaxInput,
  TransferReduction,
} from "./types/transfer.types";

// ============================================================
// 내부 파싱 결과 타입
// ============================================================

interface ParsedRates {
  brackets: TaxBracket[];
  longTermHoldingRules: Extract<DeductionRulesData, { type: "long_term_holding" }>;
  basicDeductionRules: Extract<DeductionRulesData, { type: "basic_deduction" }>;
  surchargeRates: SurchargeRateData;
  surchargeSpecialRules: SurchargeSpecialRulesData;
  oneHouseSpecialRules: OneHouseSpecialRulesData;
  selfFarmingRules?: Extract<DeductionRulesData, { type: "self_farming" }>;
  /** 주택 수 산정 배제 규칙 (optional — 없으면 householdHousingCount 사용) */
  houseCountExclusionRules?: HouseCountExclusionData;
  /** 조정대상지역 이력 (optional — 없으면 isRegulatedArea 플래그 사용) */
  regulatedAreaHistory?: RegulatedAreaHistoryData;
  /** 비사업용 토지 판정 기준 (optional — 없으면 DEFAULT_NON_BUSINESS_LAND_RULES 사용) */
  nonBusinessLandJudgmentRules?: NonBusinessLandJudgmentSchemaData;
  /** 장기임대주택 감면 규칙 V2 (optional) */
  longTermRentalRules?: LongTermRentalRuleSet;
  /** 신축주택·미분양주택 감면 매트릭스 (optional) */
  newHousingMatrix?: NewHousingMatrixData;
}

// ============================================================
// H-1: parseRatesFromMap — DB 세율 Map 파싱
// ============================================================

export function parseRatesFromMap(rates: TaxRatesMap): ParsedRates {
  // 누진세율
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

  // 장기보유특별공제
  const lthdRecord = getRate(rates, "transfer", "deduction", "long_term_holding");
  if (!lthdRecord) {
    throw new TaxRateNotFoundError("장기보유특별공제 규칙(deduction:long_term_holding)이 없습니다");
  }
  const lthdRules = parseDeductionRules(lthdRecord.deductionRules);
  if (lthdRules.type !== "long_term_holding") {
    throw new TaxRateNotFoundError("장기보유특별공제 규칙 타입 오류");
  }

  // 기본공제
  const basicRecord = getRate(rates, "transfer", "deduction", "basic");
  if (!basicRecord) {
    throw new TaxRateNotFoundError("기본공제 규칙(deduction:basic)이 없습니다");
  }
  const basicRules = parseDeductionRules(basicRecord.deductionRules);
  if (basicRules.type !== "basic_deduction") {
    throw new TaxRateNotFoundError("기본공제 규칙 타입 오류");
  }

  // 중과세율
  const surchargeRecord = getRate(rates, "transfer", "surcharge");
  if (!surchargeRecord) {
    throw new TaxRateNotFoundError("중과세율(surcharge:_default)이 없습니다");
  }
  const surchargeRates = parseSurchargeRate(surchargeRecord.rateTable);
  const surchargeSpecialRules = surchargeRecord.specialRules as SurchargeSpecialRulesData;

  // 1세대1주택 특례
  const oneHouseRecord = getRate(rates, "transfer", "special", "one_house_exemption");
  if (!oneHouseRecord) {
    throw new TaxRateNotFoundError("1세대1주택 특례(special:one_house_exemption)가 없습니다");
  }
  const oneHouseSpecialRules = oneHouseRecord.specialRules as OneHouseSpecialRulesData;

  // 자경농지 감면 (선택적)
  const selfFarmingRecord = getRate(rates, "transfer", "deduction", "self_farming");
  let selfFarmingRules: ParsedRates["selfFarmingRules"] | undefined;
  if (selfFarmingRecord) {
    const parsed = parseDeductionRules(selfFarmingRecord.deductionRules);
    if (parsed.type === "self_farming") {
      selfFarmingRules = parsed;
    }
  }

  // 주택 수 산정 배제 규칙 (선택적 — 없으면 householdHousingCount 사용)
  const houseCountRecord = getRate(rates, "transfer", "special", "house_count_exclusion");
  let houseCountExclusionRules: HouseCountExclusionData | undefined;
  if (houseCountRecord?.specialRules) {
    houseCountExclusionRules = parseHouseCountExclusion(houseCountRecord.specialRules);
  }

  // 조정대상지역 이력 (선택적 — 없으면 isRegulatedArea 플래그 사용)
  const regulatedAreaRecord = getRate(rates, "transfer", "special", "regulated_areas");
  let regulatedAreaHistory: RegulatedAreaHistoryData | undefined;
  if (regulatedAreaRecord?.specialRules) {
    regulatedAreaHistory = parseRegulatedAreaHistory(regulatedAreaRecord.specialRules);
  }

  // 비사업용 토지 판정 기준 (선택적 — 없으면 DEFAULT_NON_BUSINESS_LAND_RULES 사용)
  const nonBizLandRecord = getRate(rates, "transfer", "special", "non_business_land_judgment");
  let nonBusinessLandJudgmentRules: NonBusinessLandJudgmentSchemaData | undefined;
  if (nonBizLandRecord?.specialRules) {
    nonBusinessLandJudgmentRules = parseNonBusinessLandJudgment(nonBizLandRecord.specialRules);
  }

  // 장기임대주택 감면 규칙 V2 (선택적)
  const longTermRentalRecord = getRate(rates, "transfer", "deduction", "long_term_rental_v2");
  let longTermRentalRules: LongTermRentalRuleSet | undefined;
  if (longTermRentalRecord?.deductionRules) {
    longTermRentalRules = parseLongTermRentalRuleSet(longTermRentalRecord.deductionRules);
  }

  // 신축주택·미분양주택 감면 매트릭스 (선택적)
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

  // 전제 조건: 1세대 + 주택
  if (!input.isOneHousehold || input.propertyType !== "housing") {
    return { isExempt: false, isPartialExempt: false };
  }

  const holding = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);

  // E-3: 일시적 2주택
  if (input.householdHousingCount === 2 && input.temporaryTwoHouse && twoHouseRule) {
    const { previousAcquisitionDate, newAcquisitionDate } = input.temporaryTwoHouse;

    // 종전 주택의 보유요건 검증 (시행령 §155① — 종전 주택이 §154① 요건 충족 전제)
    // 종전 주택 보유기간 = previousAcquisitionDate ~ transferDate
    const prevHolding = calculateHoldingPeriod(previousAcquisitionDate, input.transferDate);
    if (prevHolding.years < rule.minHoldingYears) {
      return { isExempt: false, isPartialExempt: false };
    }

    // 처분 기한 계산
    let deadlineYears = twoHouseRule.disposalDeadlineYears; // 비조정: 3년
    if (input.isRegulatedArea) {
      // [C1 수정] 부칙 적용 기준: 양도일(transferDate)이 완화 시행일 이후이면 완화 기한 적용
      // 소득세법 시행령 §155 ① 개정 부칙: "시행일(2022-05-10) 이후 종전 주택을 양도하는 경우"
      const relaxDate = twoHouseRule.regulatedAreaRelaxDate
        ? new Date(twoHouseRule.regulatedAreaRelaxDate)
        : null;
      if (relaxDate && input.transferDate >= relaxDate) {
        deadlineYears = twoHouseRule.regulatedAreaRelaxDeadlineYears ?? twoHouseRule.regulatedAreaDeadlineYears;
      } else {
        deadlineYears = twoHouseRule.regulatedAreaDeadlineYears;
      }
    }
    // addYears 사용: setFullYear은 2월 29일(윤년) 취득 시 처분기한이 1일 연장되는 버그 있음
    const deadline = addYears(newAcquisitionDate, deadlineYears);
    if (input.transferDate <= deadline) {
      return { isExempt: true, isPartialExempt: false, exemptReason: "일시적 2주택 비과세" };
    }
  }

  // 1세대1주택: 1채 조건
  if (input.householdHousingCount !== 1) {
    return { isExempt: false, isPartialExempt: false };
  }

  // E-4: 2017.8.3 이전 취득 경과규정 (취득 당시 비조정이면 2년 보유만으로 비과세)
  const prePolicyDate = new Date(rule.prePolicyDate);
  const isPrePolicy = input.acquisitionDate < prePolicyDate;
  const isRegulatedAtAcquisition = input.wasRegulatedAtAcquisition;

  // 거주 요건 판단
  // 비과세 거주요건은 취득일 기준 조정대상지역 여부로 판단 (시행령 §154①)
  // isRegulatedArea(양도일 기준)가 아닌 wasRegulatedAtAcquisition(취득일 기준) 사용
  const residenceYears = Math.floor(input.residencePeriodMonths / 12);
  const meetsResidence =
    !input.wasRegulatedAtAcquisition ||
    (isPrePolicy && !isRegulatedAtAcquisition) ||
    residenceYears >= rule.regulatedAreaMinResidenceYears;

  // 보유 요건
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
  /** 환산취득가액 본체 (개산공제 미포함) 또는 실거래 취득가액 */
  estimatedBase: number;
  /** 개산공제액 (취득 당시 기준시가 × 3%) — 일반 취득가 방식이면 0 */
  estimatedDeduction: number;
  /** 실거래가 방식 필요경비 */
  expenses: number;
}

export function calcTransferGain(input: TransferTaxInput): TransferGainResult {
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
    // 개산공제 = 취득 당시 기준시가 × 3% (소득세법 §97①②)
    const deduction = applyRate(input.standardPriceAtAcquisition ?? 0, 0.03);
    acquisitionCost = estimated + deduction;
    estimatedBase = estimated;
    estimatedDeduction = deduction;
    usedEstimated = true;
  } else {
    acquisitionCost = input.acquisitionPrice;
  }

  const gain = input.transferPrice - acquisitionCost - input.expenses;
  // §102② 차손 통산용: skipLossFloor=true이면 음수 허용
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
  // 과세 양도차익 = 양도차익 × (양도가 - 12억) / 양도가
  return calculateProration(gain, transferPrice - threshold, transferPrice);
}

// ============================================================
// H-5: calcLongTermHoldingDeduction — 장기보유특별공제
// ============================================================

interface LongTermHoldingResult {
  deduction: number;
  rate: number;
  /** 보유기간 (표시용) — 예: { years: 7, months: 4 } */
  holdingPeriod: { years: number; months: number };
}

export function calcLongTermHoldingDeduction(
  taxableGain: number,
  input: TransferTaxInput,
  rules: ParsedRates["longTermHoldingRules"],
  isSurcharge: boolean,
  isSuspended: boolean,
  longTermRentalRules?: LongTermRentalRuleSet,
): LongTermHoldingResult {
  // L-0: 미등기 — 장기보유특별공제 배제 (소득세법 §95② 단서)
  if (input.isUnregistered) {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 } };
  }

  // L-0a: propertyType 가드 (소득세법 §95② 단서)
  //   - 분양권(presale_right): 장기보유특별공제 대상 아님
  //   - 조합원입주권(right_to_move_in) + 승계조합원: 원조합원에 한해 적용되므로 배제
  if (input.propertyType === "presale_right") {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 } };
  }
  if (input.propertyType === "right_to_move_in" && input.isSuccessorRightToMoveIn === true) {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 } };
  }

  // L-1: 중과세 적용 중(유예 해제)이면 공제 배제
  if (isSurcharge && !isSuspended) {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 } };
  }

  // L-1b: 비사업용 토지 — 장기보유특별공제 배제 (소득세법 §95 ② 단서)
  if (input.isNonBusinessLand) {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 } };
  }

  // L-1c: 장기임대주택 특례율 — 일반 공제 대신 특례율(50%/70%) 우선 적용
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

  // (L-0에서 미등기를 이미 처리함 — dead code 제거, I2 수정)

  const holding = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);
  const holdingPeriod = { years: holding.years, months: holding.months };
  const residenceYears = Math.floor(input.residencePeriodMonths / 12);

  // L-3: 1세대1주택 특례
  //   조건: 1세대 1주택 + 보유기간 3년 이상 + 거주기간 2년 이상 (소득세법 §95②)
  //   공제율: 보유기간 × 4% + 거주기간 × 4% (80% 한도)
  const ONE_HOUSE_HOLDING_RATE = 0.04;   // 보유 연 4%
  const ONE_HOUSE_RESIDENCE_RATE = 0.04; // 거주 연 4%
  const ONE_HOUSE_MAX_RATE = 0.80;       // 최대 80%
  const ONE_HOUSE_MIN_HOLDING_YEARS = 3; // 보유 3년 이상 (소득세법 §95②)
  const ONE_HOUSE_MIN_RESIDENCE_YEARS = 2;

  if (
    input.isOneHousehold &&
    input.householdHousingCount === 1 &&
    holding.years >= ONE_HOUSE_MIN_HOLDING_YEARS &&
    residenceYears >= ONE_HOUSE_MIN_RESIDENCE_YEARS
  ) {
    const holdingRate = holding.years * ONE_HOUSE_HOLDING_RATE;
    const residenceRate = residenceYears * ONE_HOUSE_RESIDENCE_RATE;
    const rate = Math.min(holdingRate + residenceRate, ONE_HOUSE_MAX_RATE);
    const deduction = applyRate(taxableGain, rate);
    return { deduction, rate, holdingPeriod };
  }

  // L-4: 일반 (보유기간 3년 이상, 미등기 제외) — 소득세법 §95②
  //   공제율: 보유기간 × 2% (30% 한도)
  const GENERAL_HOLDING_RATE = 0.02;  // 보유 연 2%
  const GENERAL_MAX_RATE = 0.30;      // 최대 30%
  const GENERAL_MIN_HOLDING_YEARS = 3;

  if (holding.years >= GENERAL_MIN_HOLDING_YEARS) {
    const rate = Math.min(holding.years * GENERAL_HOLDING_RATE, GENERAL_MAX_RATE);
    const deduction = applyRate(taxableGain, rate);
    return { deduction, rate, holdingPeriod };
  }

  // 보유기간 3년 미만
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
  // 미등기 시 기본공제 0
  if (isUnregistered && rules.excludeUnregistered) {
    return 0;
  }

  const remaining = rules.annualLimit - annualUsed;
  if (remaining <= 0) return 0;

  // 과세 양도차익 - 장기보유공제 = 공제 적용 가능 금액
  const afterLTH = taxableGain - longTermDed;
  if (afterLTH <= 0) return 0;

  return Math.min(remaining, afterLTH);
}

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

  // 2018.1.1 이후 양도분부터 적용
  if (transferDate < new Date("2018-01-01")) return null;

  const isPenaltyMethod =
    method === "estimated" ||
    (method === "appraisal" && transferDate >= new Date("2020-01-01"));
  if (!isPenaltyMethod) return null;

  if (input.buildingType === "extension") {
    // 증축: 2020.1.1 이후 양도 + 바닥면적 85㎡ 초과
    if (transferDate < new Date("2020-01-01")) return null;
    if ((input.extensionFloorArea ?? 0) <= 85) return null;
  }

  if (!input.constructionDate) return null;
  const constructionMs = input.constructionDate.getTime();
  const transferMs = transferDate.getTime();
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const yearsHeld = (transferMs - constructionMs) / msPerYear;
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
  /** 단기보유 특례세율 적용 시 표시 문구 (예: "보유기간 2년 미만 특례세율 적용") */
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

  // 다주택 중과세 유예 판단
  // houses[] 제공 시: determineMultiHouseSurcharge 결과 사용
  // 미제공 시: householdHousingCount + isRegulatedArea 플래그 사용 (하위 호환)
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

  // 부동소수점 오차 제거: 세율은 소수점 4자리(0.01% 단위)로 정규화
  const roundRate = (r: number) => Math.round(r * 10000) / 10000;

  // T-2: 비사업용 토지 누진 + 10%p
  if (input.isNonBusinessLand && surchargeRates.non_business_land) {
    const additionalRate = surchargeRates.non_business_land.additionalRate;
    const progressiveTax = calculateProgressiveTax(taxBase, brackets);
    // 적용 구간 세율 추출 (표시용)
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

  // T-3: 다주택 중과세 (유예 해제 + 배제 없음 시)
  // houses[] 제공 시: surchargeApplicable (유예·배제 모두 반영한 최종 값) 사용
  // 미제공 시: isSurchargeCase && !suspended 기존 로직
  const surchargeApplicable = multiHouseSurchargeResult
    ? multiHouseSurchargeResult.surchargeApplicable
    : isSurchargeCase && !suspended;

  const effectiveSurchargeType = multiHouseSurchargeResult?.surchargeType
    ?? (input.householdHousingCount >= 3 ? "multi_house_3plus" : "multi_house_2");

  // T-2.5: 단기보유 특례세율 (소득세법 §104①2~3호, 7~8호)
  // 주택·입주권·분양권: 1년 미만 70%, 1~2년 미만 60%
  // 일반 건물·토지: 1년 미만 50%, 1~2년 미만 40%
  //
  // 보유기간 통산 (소득세법 §95④):
  //   - 상속: 피상속인 취득일부터 양도일까지로 통산
  //   - 증여: 증여자 취득일부터 양도일까지로 통산 (이월과세 패턴 단순화 적용)
  //   - LTHD(장기보유특별공제) 보유기간에는 적용 금지 — 그쪽은 acquisitionDate 그대로 유지
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

  // T-4: 일반 누진세율 (또는 유예/배제로 일반세율 적용)
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
// H-8: calcReductions — 감면 계산 (R-1 ~ R-4)
// ============================================================

interface ReductionsResult {
  reductionAmount: number;
  reductionType?: string;
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
  /** 양도소득금액 (양도차익 − 장특공제) — §77 정확 산식용 */
  transferIncome?: number,
  /** 실제 적용된 기본공제 — §77 기본공제 배정용 */
  basicDeduction?: number,
  /** 과세표준 (taxableGain − longTermDed − basicDeduction) — §77 분모 */
  taxBase?: number,
): ReductionsResult & {
  rentalReductionDetail?: RentalReductionResult;
  newHousingReductionDetail?: NewHousingReductionResult;
  publicExpropriationDetail?: PublicExpropriationReductionResult;
} {
  if (reductions.length === 0 && !rentalReductionDetails && !newHousingDetails) {
    return { reductionAmount: 0 };
  }

  // [I3 수정] 조특법 §127 ② 감면 중복 배제: 동일 자산에 복수 감면이 해당될 때 납세자에게 유리한 1건만 적용
  // 각 감면 후보를 개별 계산 후 최대값 1건 선택
  interface ReductionCandidate { amount: number; type: string; }
  const candidates: ReductionCandidate[] = [];
  let rentalReductionDetail: RentalReductionResult | undefined;
  let newHousingReductionDetail: NewHousingReductionResult | undefined;
  let publicExpropriationDetail: PublicExpropriationReductionResult | undefined;

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
    if (!transferDate) continue;
    if (
      transferIncome === undefined ||
      basicDeduction === undefined ||
      taxBase === undefined
    ) {
      continue;
    }
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

  // R-1~R-4: 하위 호환 단순 감면 (V2 정밀 엔진과 중복 유형은 이미 V2로 처리됨)
  const v2Types = new Set(candidates.map((c) => c.type));
  for (const reduction of reductions) {
    // V2 정밀 엔진으로 이미 처리된 유형은 중복 계산 방지
    if (v2Types.has(reduction.type)) continue;
    if (reduction.type === "unsold_housing" && v2Types.has("new_housing")) continue;

    let amount = 0;
    if (reduction.type === "self_farming" && selfFarmingRules) {
      if (reduction.farmingYears >= selfFarmingRules.conditions.minFarmingYears) {
        amount = Math.min(applyRate(calculatedTax, selfFarmingRules.maxRate), selfFarmingRules.maxAmount);
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
    if (amount > 0) candidates.push({ amount, type: reduction.type });
  }

  // 가장 유리한 감면 1건 선택 (조특법 §127 ②)
  const best = candidates.reduce<ReductionCandidate>(
    (a, b) => (a.amount >= b.amount ? a : b),
    { amount: 0, type: "" },
  );
  const firstType = best.type || undefined;
  const reductionAmount = Math.min(best.amount, calculatedTax);

  const reductionTypeLabel: Record<string, string> = {
    self_farming: "자경농지",
    long_term_rental: "장기임대주택",
    new_housing: "신축주택",
    unsold_housing: "미분양주택",
    public_expropriation: "공익사업용 토지 수용(§77)",
  };
  const reductionTypeDisplay = firstType ? (reductionTypeLabel[firstType] ?? firstType) : undefined;

  return {
    reductionAmount,
    reductionType: reductionTypeDisplay,
    rentalReductionDetail,
    newHousingReductionDetail,
    publicExpropriationDetail,
  };
}
