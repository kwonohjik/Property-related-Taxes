/**
 * 양도소득세 순수 계산 엔진
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음.
 * 모든 세율 데이터는 TaxRatesMap으로 주입받아 순수 함수로 계산.
 *
 * P0-2 원칙: 세율 × 금액 곱셈은 반드시 applyRate() 사용.
 */

import {
  applyRate,
  calculateEstimatedAcquisitionPrice,
  calculateHoldingPeriod,
  calculateProgressiveTax,
  calculateProration,
  isSurchargeSuspended,
  truncateToThousand,
  truncateToWon,
} from "./tax-utils";
import { TaxRateNotFoundError } from "./tax-errors";
import {
  parseDeductionRules,
  parseProgressiveRate,
  parseSurchargeRate,
  type DeductionRulesData,
  type OneHouseSpecialRulesData,
  type SurchargeRateData,
  type SurchargeSpecialRulesData,
} from "./schemas/rate-table.schema";
import { getRate } from "@/lib/db/tax-rates";
import type { TaxBracket } from "./types";
import type { TaxRatesMap } from "@/lib/db/tax-rates";

// ============================================================
// 1-A. 타입 정의
// ============================================================

export interface TransferTaxInput {
  /** 물건 종류 */
  propertyType: "housing" | "land" | "building";
  /** 양도가액 (원, 정수) */
  transferPrice: number;
  /** 양도일 */
  transferDate: Date;
  /** 취득가액 (0이면 환산취득가 사용) */
  acquisitionPrice: number;
  /** 취득일 */
  acquisitionDate: Date;
  /** 필요경비 */
  expenses: number;
  /** 환산취득가 사용 여부 */
  useEstimatedAcquisition: boolean;
  /** 취득시 기준시가 (환산취득가 사용 시 필수) */
  standardPriceAtAcquisition?: number;
  /** 양도시 기준시가 (환산취득가 사용 시 필수) */
  standardPriceAtTransfer?: number;
  /** 세대 보유 주택 수 */
  householdHousingCount: number;
  /** 거주기간 (월) */
  residencePeriodMonths: number;
  /** 양도일 기준 조정대상지역 여부 */
  isRegulatedArea: boolean;
  /** 취득일 기준 조정대상지역 여부 */
  wasRegulatedAtAcquisition: boolean;
  /** 미등기 여부 */
  isUnregistered: boolean;
  /** 비사업용 토지 여부 */
  isNonBusinessLand: boolean;
  /** 1세대 여부 */
  isOneHousehold: boolean;
  /** 일시적 2주택 정보 */
  temporaryTwoHouse?: {
    previousAcquisitionDate: Date;
    newAcquisitionDate: Date;
  };
  /** 조세특례 감면 목록 */
  reductions: TransferReduction[];
  /** 당해 연도 기사용 기본공제 (원) */
  annualBasicDeductionUsed: number;
}

export type TransferReduction =
  | { type: "self_farming"; farmingYears: number }
  | { type: "long_term_rental"; rentalYears: number; rentIncreaseRate: number }
  | { type: "new_housing"; region: "metropolitan" | "non_metropolitan" }
  | { type: "unsold_housing"; region: "metropolitan" | "non_metropolitan" };

export interface CalculationStep {
  /** 단계명 (예: '양도차익 계산') */
  label: string;
  /** 산식 설명 */
  formula: string;
  /** 결과 금액 */
  amount: number;
}

export interface TransferTaxResult {
  /** 전액 비과세 여부 */
  isExempt: boolean;
  /** 비과세 사유 */
  exemptReason?: string;
  /** 양도차익 */
  transferGain: number;
  /** 과세 양도차익 (12억 초과분 안분 후) */
  taxableGain: number;
  /** 환산취득가 사용 여부 */
  usedEstimatedAcquisition: boolean;
  /** 장기보유특별공제액 */
  longTermHoldingDeduction: number;
  /** 장기보유특별공제율 */
  longTermHoldingRate: number;
  /** 기본공제 */
  basicDeduction: number;
  /** 과세표준 (천원 미만 절사) */
  taxBase: number;
  /** 적용 세율 */
  appliedRate: number;
  /** 누진공제액 */
  progressiveDeduction: number;
  /** 산출세액 */
  calculatedTax: number;
  /** 중과세 유형 */
  surchargeType?: string;
  /** 추가 세율 */
  surchargeRate?: number;
  /** 중과세 유예 여부 */
  isSurchargeSuspended: boolean;
  /** 총 감면세액 */
  reductionAmount: number;
  /** 감면 유형 */
  reductionType?: string;
  /** 결정세액 (원 미만 절사) */
  determinedTax: number;
  /** 지방소득세 (결정세액 × 10%) */
  localIncomeTax: number;
  /** 총 납부세액 */
  totalTax: number;
  /** 계산 과정 steps */
  steps: CalculationStep[];
}

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
}

// ============================================================
// H-1: parseRatesFromMap — DB 세율 Map 파싱
// ============================================================

function parseRatesFromMap(rates: TaxRatesMap): ParsedRates {
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

  return {
    brackets: normalizedBrackets,
    longTermHoldingRules: lthdRules,
    basicDeductionRules: basicRules,
    surchargeRates,
    surchargeSpecialRules,
    oneHouseSpecialRules,
    selfFarmingRules,
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

function checkExemption(
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
    const { newAcquisitionDate } = input.temporaryTwoHouse;
    // 처분 기한 계산
    let deadlineYears = twoHouseRule.disposalDeadlineYears; // 비조정: 3년
    if (input.isRegulatedArea) {
      // 완화 기준일(2022-05-10) 이후 취득이면 3년, 이전이면 1년
      const relaxDate = twoHouseRule.regulatedAreaRelaxDate
        ? new Date(twoHouseRule.regulatedAreaRelaxDate)
        : null;
      if (relaxDate && newAcquisitionDate >= relaxDate) {
        deadlineYears = twoHouseRule.regulatedAreaRelaxDeadlineYears ?? twoHouseRule.regulatedAreaDeadlineYears;
      } else {
        deadlineYears = twoHouseRule.regulatedAreaDeadlineYears;
      }
    }
    const deadline = new Date(newAcquisitionDate);
    deadline.setFullYear(deadline.getFullYear() + deadlineYears);
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
  const residenceYears = Math.floor(input.residencePeriodMonths / 12);
  const meetsResidence =
    !input.isRegulatedArea ||
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

function calcTransferGain(input: TransferTaxInput): TransferGainResult {
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
  return {
    gain: Math.max(0, gain),
    usedEstimated,
    estimatedBase,
    estimatedDeduction,
    expenses: input.expenses,
  };
}

// ============================================================
// H-4: calcOneHouseProration — 12억 초과분 안분
// ============================================================

function calcOneHouseProration(gain: number, transferPrice: number): number {
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

function calcLongTermHoldingDeduction(
  taxableGain: number,
  input: TransferTaxInput,
  rules: ParsedRates["longTermHoldingRules"],
  isSurcharge: boolean,
  isSuspended: boolean,
): LongTermHoldingResult {
  // L-1: 중과세 적용 중(유예 해제)이면 공제 배제
  if (isSurcharge && !isSuspended) {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 } };
  }

  // L-2: 미등기 공제 배제
  if (input.isUnregistered) {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 } };
  }

  const holding = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);
  const holdingPeriod = { years: holding.years, months: holding.months };
  const residenceYears = Math.floor(input.residencePeriodMonths / 12);

  // L-3: 1세대1주택 특례
  //   조건: 1세대 1주택 + 거주기간 2년 이상
  //   공제율: 보유기간 × 4% + 거주기간 × 4% (80% 한도)
  const ONE_HOUSE_HOLDING_RATE = 0.04;   // 보유 연 4%
  const ONE_HOUSE_RESIDENCE_RATE = 0.04; // 거주 연 4%
  const ONE_HOUSE_MAX_RATE = 0.80;       // 최대 80%
  const ONE_HOUSE_MIN_RESIDENCE_YEARS = 2;

  if (
    input.isOneHousehold &&
    input.householdHousingCount === 1 &&
    residenceYears >= ONE_HOUSE_MIN_RESIDENCE_YEARS
  ) {
    const holdingRate = holding.years * ONE_HOUSE_HOLDING_RATE;
    const residenceRate = residenceYears * ONE_HOUSE_RESIDENCE_RATE;
    const rate = Math.min(holdingRate + residenceRate, ONE_HOUSE_MAX_RATE);
    const deduction = applyRate(taxableGain, rate);
    return { deduction, rate, holdingPeriod };
  }

  // L-4: 일반 (보유기간 2년 이상, 미등기 제외)
  //   공제율: 보유기간 × 2% (30% 한도)
  const GENERAL_HOLDING_RATE = 0.02;  // 보유 연 2%
  const GENERAL_MAX_RATE = 0.30;      // 최대 30%
  const GENERAL_MIN_HOLDING_YEARS = 2;

  if (holding.years >= GENERAL_MIN_HOLDING_YEARS) {
    const rate = Math.min(holding.years * GENERAL_HOLDING_RATE, GENERAL_MAX_RATE);
    const deduction = applyRate(taxableGain, rate);
    return { deduction, rate, holdingPeriod };
  }

  // 보유기간 2년 미만
  return { deduction: 0, rate: 0, holdingPeriod };
}

// ============================================================
// H-6: calcBasicDeduction — 기본공제
// ============================================================

function calcBasicDeduction(
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
// H-7: calcTax — 세액 결정 (T-1 ~ T-4)
// ============================================================

interface CalcTaxResult {
  calculatedTax: number;
  surchargeType?: string;
  surchargeRate?: number;
  appliedRate: number;
  progressiveDeduction: number;
  surchargeSuspended: boolean;
}

function calcTax(
  taxBase: number,
  parsedRates: ParsedRates,
  input: TransferTaxInput,
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
  const isSurchargeCase =
    input.propertyType === "housing" &&
    input.isRegulatedArea &&
    input.householdHousingCount >= 2;

  const suspended = isSurchargeCase
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

  // T-3: 다주택 중과세 (유예 해제 시)
  if (isSurchargeCase && !suspended) {
    const isThreePlus = input.householdHousingCount >= 3;
    const surchargeKey = isThreePlus ? "multi_house_3plus" : "multi_house_2";
    const surchargeInfo = isThreePlus ? surchargeRates.multi_house_3plus : surchargeRates.multi_house_2;

    if (surchargeInfo) {
      const additionalRate = surchargeInfo.additionalRate;
      const progressiveTax = calculateProgressiveTax(taxBase, brackets);
      const bracket = brackets.find((b) => taxBase <= (b.max ?? Infinity));
      const baseRate = bracket?.rate ?? brackets[brackets.length - 1].rate;
      const surchargeAmount = applyRate(taxBase, additionalRate);
      return {
        calculatedTax: progressiveTax + surchargeAmount,
        surchargeType: surchargeKey,
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
// H-8: calcReductions — 감면 계산 (R-1 ~ R-4)
// ============================================================

interface ReductionsResult {
  reductionAmount: number;
  reductionType?: string;
}

function calcReductions(
  calculatedTax: number,
  reductions: TransferReduction[],
  selfFarmingRules: ParsedRates["selfFarmingRules"] | undefined,
): ReductionsResult {
  if (reductions.length === 0) {
    return { reductionAmount: 0 };
  }

  let totalReduction = 0;
  let firstType: string | undefined;

  // 유형별 중복 방지: type별 첫 번째만 처리
  const processed = new Set<string>();

  for (const reduction of reductions) {
    if (processed.has(reduction.type)) continue;
    processed.add(reduction.type);

    let amount = 0;

    if (reduction.type === "self_farming" && selfFarmingRules) {
      // R-1: 자경농지 — 8년 이상 시 전액 감면, 한도 1억
      if (reduction.farmingYears >= selfFarmingRules.conditions.minFarmingYears) {
        amount = Math.min(applyRate(calculatedTax, selfFarmingRules.maxRate), selfFarmingRules.maxAmount);
      }
    } else if (reduction.type === "long_term_rental") {
      // R-2: 장기임대 50% — 임대 8년+, 임대료 인상률 5% 이하
      if (reduction.rentalYears >= 8 && reduction.rentIncreaseRate <= 0.05) {
        amount = applyRate(calculatedTax, 0.5);
      }
    } else if (reduction.type === "new_housing") {
      // R-3: 신축주택 — 수도권 50%, 비수도권 100%
      const rate = reduction.region === "metropolitan" ? 0.5 : 1.0;
      amount = applyRate(calculatedTax, rate);
    } else if (reduction.type === "unsold_housing") {
      // R-4: 미분양주택 100%
      amount = calculatedTax;
    }

    if (amount > 0) {
      if (!firstType) firstType = reduction.type;
      totalReduction += amount;
    }
  }

  // 감면 합계 상한: 결정세액 음수 방지
  const reductionAmount = Math.min(totalReduction, calculatedTax);

  const reductionTypeLabel: Record<string, string> = {
    self_farming: "자경농지",
    long_term_rental: "장기임대주택",
    new_housing: "신축주택",
    unsold_housing: "미분양주택",
  };
  const reductionTypeDisplay = firstType ? (reductionTypeLabel[firstType] ?? firstType) : undefined;

  return { reductionAmount, reductionType: reductionTypeDisplay };
}

// ============================================================
// 메인 함수: calculateTransferTax (1-G)
// ============================================================

export function calculateTransferTax(
  input: TransferTaxInput,
  rates: TaxRatesMap,
): TransferTaxResult {
  const steps: CalculationStep[] = [];

  // STEP 0: 세율 파싱
  const parsedRates = parseRatesFromMap(rates);

  // STEP 1: 비과세 판단
  const exemptionResult = checkExemption(input, parsedRates.oneHouseSpecialRules);

  // STEP 1a: 전액 비과세 시 조기 반환
  if (exemptionResult.isExempt) {
    steps.push({
      label: "1세대1주택 비과세",
      formula: exemptionResult.exemptReason ?? "비과세",
      amount: 0,
    });
    return {
      isExempt: true,
      exemptReason: exemptionResult.exemptReason,
      transferGain: 0,
      taxableGain: 0,
      usedEstimatedAcquisition: input.useEstimatedAcquisition,
      longTermHoldingDeduction: 0,
      longTermHoldingRate: 0,
      basicDeduction: 0,
      taxBase: 0,
      appliedRate: 0,
      progressiveDeduction: 0,
      calculatedTax: 0,
      isSurchargeSuspended: false,
      reductionAmount: 0,
      determinedTax: 0,
      localIncomeTax: 0,
      totalTax: 0,
      steps,
    };
  }

  // STEP 2: 양도차익 계산
  const { gain: rawGain, usedEstimated, estimatedBase, estimatedDeduction, expenses: appliedExpenses } = calcTransferGain(input);
  // STEP 2a: 손실 → 0
  const transferGain = Math.max(0, rawGain);

  // 환산취득가 방식: 취득가와 필요경비(개산공제)를 분리 표시
  // 일반 방식: 취득가와 필요경비를 분리 표시
  let gainFormula: string;
  if (input.useEstimatedAcquisition) {
    gainFormula = [
      `양도가(${input.transferPrice.toLocaleString()}원)`,
      `취득가(환산 ${estimatedBase.toLocaleString()}원)`,
      `경비(개산공제 ${estimatedDeduction.toLocaleString()}원)`,
    ].join(" - ");
  } else {
    gainFormula = [
      `양도가(${input.transferPrice.toLocaleString()}원)`,
      `취득가(${input.acquisitionPrice.toLocaleString()}원)`,
      `경비(${appliedExpenses.toLocaleString()}원)`,
    ].join(" - ");
  }
  steps.push({
    label: "양도차익 계산",
    formula: gainFormula,
    amount: transferGain,
  });

  // 양도 손실: 바로 0 반환
  if (transferGain === 0) {
    return {
      isExempt: false,
      exemptReason: exemptionResult.exemptReason,
      transferGain: 0,
      taxableGain: 0,
      usedEstimatedAcquisition: usedEstimated,
      longTermHoldingDeduction: 0,
      longTermHoldingRate: 0,
      basicDeduction: 0,
      taxBase: 0,
      appliedRate: 0,
      progressiveDeduction: 0,
      calculatedTax: 0,
      isSurchargeSuspended: false,
      reductionAmount: 0,
      determinedTax: 0,
      localIncomeTax: 0,
      totalTax: 0,
      steps,
    };
  }

  // STEP 3: 과세 양도차익 (12억 초과분 안분 — 부분과세인 경우)
  let taxableGain: number;
  if (exemptionResult.isPartialExempt) {
    taxableGain = calcOneHouseProration(transferGain, input.transferPrice);
    steps.push({
      label: "과세 양도차익 (12억 초과분)",
      formula: `${transferGain.toLocaleString()}원 × (양도가 ${input.transferPrice.toLocaleString()}원 - 12억) / 양도가`,
      amount: taxableGain,
    });
  } else {
    taxableGain = transferGain;
  }

  // 중과세 여부 판단 (장기보유공제·세액 결정에 공통 사용)
  const isSurchargeCase =
    input.propertyType === "housing" &&
    input.isRegulatedArea &&
    input.householdHousingCount >= 2;

  const surchargeTypeKey = input.householdHousingCount >= 3 ? "multi_house_3plus" : "multi_house_2";
  const suspendedResult = isSurchargeCase
    ? isSurchargeSuspended(parsedRates.surchargeSpecialRules, input.transferDate, surchargeTypeKey)
    : false;

  // STEP 4: 장기보유특별공제
  const { deduction: longTermHoldingDeduction, rate: longTermHoldingRate, holdingPeriod } =
    calcLongTermHoldingDeduction(taxableGain, input, parsedRates.longTermHoldingRules, isSurchargeCase, suspendedResult);
  const holdingPeriodStr = holdingPeriod.years > 0 || holdingPeriod.months > 0
    ? `보유기간 ${holdingPeriod.years}년 ${holdingPeriod.months}개월`
    : "";
  // 1세대1주택 특례 여부에 따라 계산식 분리 표시
  const residenceYearsForStep = Math.floor(input.residencePeriodMonths / 12);
  const isOneHouseSpecial =
    input.isOneHousehold &&
    input.householdHousingCount === 1 &&
    residenceYearsForStep >= 2 &&
    longTermHoldingDeduction > 0;
  const lthdFormulaRate = isOneHouseSpecial
    ? `보유 ${holdingPeriod.years}년×4% + 거주 ${residenceYearsForStep}년×4% = ${Math.round(longTermHoldingRate * 100)}% (80% 한도)`
    : `보유 ${holdingPeriod.years}년×2% = ${Math.round(longTermHoldingRate * 100)}% (30% 한도)`;
  steps.push({
    label: "장기보유특별공제",
    formula: [
      `${taxableGain.toLocaleString()}원 × ${Math.round(longTermHoldingRate * 100)}%`,
      lthdFormulaRate,
      holdingPeriodStr,
    ].filter(Boolean).join(" | "),
    amount: longTermHoldingDeduction,
  });

  // STEP 5: 기본공제
  const basicDeduction = calcBasicDeduction(
    taxableGain,
    longTermHoldingDeduction,
    input.annualBasicDeductionUsed,
    input.isUnregistered,
    parsedRates.basicDeductionRules,
  );
  steps.push({
    label: "기본공제",
    formula: `연 한도 ${parsedRates.basicDeductionRules.annualLimit.toLocaleString()}원 - 기사용 ${input.annualBasicDeductionUsed.toLocaleString()}원`,
    amount: basicDeduction,
  });

  // STEP 6: 과세표준 (천원 미만 절사)
  const rawTaxBase = taxableGain - longTermHoldingDeduction - basicDeduction;
  const taxBase = Math.max(0, truncateToThousand(rawTaxBase));
  steps.push({
    label: "과세표준",
    formula: `${taxableGain.toLocaleString()}원 - ${longTermHoldingDeduction.toLocaleString()}원 - ${basicDeduction.toLocaleString()}원 (천원 미만 절사)`,
    amount: taxBase,
  });

  // STEP 7: 산출세액
  const taxResult = calcTax(taxBase, parsedRates, input);
  const fmtPct = (r: number) => `${Math.round(r * 100)}%`;
  steps.push({
    label: "산출세액",
    formula: `과세표준 ${taxBase.toLocaleString()}원 × 세율 ${fmtPct(taxResult.appliedRate)}${taxResult.surchargeRate ? ` (+중과 ${fmtPct(taxResult.surchargeRate)})` : ""}`,
    amount: taxResult.calculatedTax,
  });

  // STEP 8: 감면세액
  const { reductionAmount, reductionType } = calcReductions(
    taxResult.calculatedTax,
    input.reductions,
    parsedRates.selfFarmingRules,
  );
  steps.push({
    label: "감면세액",
    formula: reductionType ? `${reductionType} 감면 ${reductionAmount.toLocaleString()}원` : "감면 없음",
    amount: reductionAmount,
  });

  // STEP 9: 결정세액 (원 미만 절사)
  const determinedTax = truncateToWon(Math.max(0, taxResult.calculatedTax - reductionAmount));
  steps.push({
    label: "결정세액",
    formula: `산출세액 ${taxResult.calculatedTax.toLocaleString()}원 - 감면 ${reductionAmount.toLocaleString()}원 (원 미만 절사)`,
    amount: determinedTax,
  });

  // STEP 10: 지방소득세 (결정세액 × 10%)
  const localIncomeTax = applyRate(determinedTax, 0.1);
  steps.push({
    label: "지방소득세",
    formula: `${determinedTax.toLocaleString()}원 × 10%`,
    amount: localIncomeTax,
  });

  // STEP 11: 총 납부세액
  const totalTax = determinedTax + localIncomeTax;
  steps.push({
    label: "총 납부세액",
    formula: `결정세액 ${determinedTax.toLocaleString()}원 + 지방소득세 ${localIncomeTax.toLocaleString()}원`,
    amount: totalTax,
  });

  return {
    isExempt: false,
    exemptReason: exemptionResult.exemptReason,
    transferGain,
    taxableGain,
    usedEstimatedAcquisition: usedEstimated,
    longTermHoldingDeduction,
    longTermHoldingRate,
    basicDeduction,
    taxBase,
    appliedRate: taxResult.appliedRate,
    progressiveDeduction: taxResult.progressiveDeduction,
    calculatedTax: taxResult.calculatedTax,
    surchargeType: taxResult.surchargeType,
    surchargeRate: taxResult.surchargeRate,
    isSurchargeSuspended: taxResult.surchargeSuspended,
    reductionAmount,
    reductionType,
    determinedTax,
    localIncomeTax,
    totalTax,
    steps,
  };
}
