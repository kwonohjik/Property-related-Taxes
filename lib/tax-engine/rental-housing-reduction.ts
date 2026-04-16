/**
 * 장기임대주택 양도소득세 감면 순수 판정 엔진
 *
 * 조세특례제한법:
 *   §97   공공건설임대주택
 *   §97의3 장기일반민간임대주택
 *   §97의4 공공지원민간임대주택
 *   §97의5 공공매입임대주택
 *
 * P0-2 원칙: 모든 세율×금액 곱셈은 applyRate() 사용
 * DB 직접 호출 금지 — 감면 규칙 데이터를 매개변수로 받아 순수 판단/계산만 수행
 */

import { addDays, addMonths, differenceInDays, differenceInYears } from "date-fns";
import { applyRate, truncateToWon } from "./tax-utils";
import { TRANSFER } from "./legal-codes";
import type { LongTermRentalRuleSet } from "./schemas/rate-table.schema";

// ============================================================
// 타입 정의
// ============================================================

export type RentalHousingType =
  | "public_construction"    // 공공건설임대 §97
  | "long_term_private"      // 장기일반민간임대 §97의3
  | "public_support_private" // 공공지원민간임대 §97의4
  | "public_purchase";       // 공공매입임대 §97의5

/** 경과규정 적용 버전 */
export type ReductionLawVersion =
  | "pre_2018_09_14"   // 구법 (2018.9.14 이전 등록)
  | "post_2018_09_14"  // 1차 개정 (2018.9.14 ~ 2020.7.10)
  | "post_2020_07_11"  // 2차 개정 (2020.7.11 ~ 2020.8.17)
  | "post_2020_08_18"; // 3차 개정 (2020.8.18 이후)

export interface VacancyPeriod {
  startDate: Date;
  endDate: Date;
}

export interface RentHistory {
  contractDate: Date;
  monthlyRent: number;      // 월세 (원)
  deposit: number;          // 보증금 (원)
  contractType: "jeonse" | "monthly" | "semi_jeonse";
}

export interface RentalReductionInput {
  /** 지자체 임대사업자 등록 여부 */
  isRegisteredLandlord: boolean;
  /** 세무서 사업자 등록 여부 */
  isTaxRegistered: boolean;
  /** 임대사업자 등록일 */
  registrationDate: Date;

  /** 임대주택 유형 */
  rentalHousingType: RentalHousingType;
  /** 주택 유형 (아파트 여부) */
  propertyType: "apartment" | "non_apartment";
  /** 수도권/비수도권 */
  region: "capital" | "non_capital";
  /** 임대개시일 당시 기준시가 (원) */
  officialPriceAtStart: number;

  /** 임대개시일 */
  rentalStartDate: Date;
  /** 양도일 */
  transferDate: Date;
  /** 공실 기간 목록 */
  vacancyPeriods: VacancyPeriod[];

  /** 임대료 이력 (시간순 — 증액 제한 검증용) */
  rentHistory: RentHistory[];

  /** 산출세액 (transfer-tax 엔진에서 전달) */
  calculatedTax: number;
}

export interface IneligibleReason {
  code: string;
  message: string;
  field: string;
}

export interface RentViolation {
  contractIndex: number;
  contractDate: Date;
  increaseRate: number;
  maxAllowed: number;
}

export interface RentalReductionResult {
  isEligible: boolean;
  ineligibleReasons: IneligibleReason[];

  reductionType: RentalHousingType;
  applicableLawVersion: ReductionLawVersion;
  mandatoryPeriodYears: number;
  effectiveRentalYears: number;

  reductionRate: number;
  reductionAmount: number;

  /** 장기보유특별공제 특례율 (0 = 특례 없음) */
  specialLongTermDeductionRate: number;

  annualLimit: number;
  isLimitApplied: boolean;

  rentIncreaseValidation: {
    isAllValid: boolean;
    violations: RentViolation[];
  };

  warnings: string[];
}

// ============================================================
// 경계 날짜 (경과규정)
// ============================================================

const DATE_2018_09_14 = new Date("2018-09-14");
const DATE_2020_07_11 = new Date("2020-07-11");
const DATE_2020_08_18 = new Date("2020-08-18");

/** 조특법 §133 연간 기본 감면 한도 (1억원) */
const ANNUAL_BASE_LIMIT = 100_000_000;
/** 조특법 §133 초과분 감면율 */
const EXCESS_RATE = 0.5;

/** 6개월을 일수로 환산 (180일) — 공실 차감 기준 */
const SIX_MONTHS_DAYS = 180;

// ============================================================
// 경과규정 분기
// ============================================================

/**
 * 임대사업자 등록일로부터 적용 법률 버전 결정
 */
export function determineApplicableLaw(
  registrationDate: Date,
): ReductionLawVersion {
  if (registrationDate < DATE_2018_09_14) return "pre_2018_09_14";
  if (registrationDate < DATE_2020_07_11) return "post_2018_09_14";
  if (registrationDate < DATE_2020_08_18) return "post_2020_07_11";
  return "post_2020_08_18";
}

// ============================================================
// 의무임대기간 산정
// ============================================================

/**
 * 유효 임대기간(년) 계산
 * - 공실 6개월(180일) 이상인 구간은 실제 일수만큼 차감
 * - date-fns differenceInDays 사용 (초일불산입)
 */
export function calculateEffectiveRentalPeriod(
  rentalStartDate: Date,
  transferDate: Date,
  vacancyPeriods: VacancyPeriod[],
): number {
  const totalDays = differenceInDays(transferDate, rentalStartDate);
  if (totalDays <= 0) return 0;

  // 6개월 이상 공실만 차감
  let deductDays = 0;
  for (const vp of vacancyPeriods) {
    const vpDays = differenceInDays(vp.endDate, vp.startDate);
    if (vpDays >= SIX_MONTHS_DAYS) {
      deductDays += vpDays;
    }
  }

  const effectiveDays = Math.max(0, totalDays - deductDays);
  // 달력 기반 연수 계산: 공실 차감된 일수를 rentalStartDate에 더해 종료일 추산
  // Math.floor(days/365) 대신 differenceInYears 사용 → 윤년 경계 오판 방지
  const effectiveEndDate = addDays(rentalStartDate, effectiveDays);
  return differenceInYears(effectiveEndDate, rentalStartDate);
}

// ============================================================
// 임대료 증액 제한 검증
// ============================================================

/**
 * 환산보증금 = 보증금 + (월세 × 12 / 전월세전환율)
 * 원 미만 절사
 */
export function convertToStandardDeposit(
  rent: RentHistory,
  conversionRate: number,
): number {
  if (rent.contractType === "jeonse") {
    return rent.deposit;
  }
  // semi_jeonse / monthly: 환산 보증금
  return rent.deposit + Math.floor((rent.monthlyRent * 12) / conversionRate);
}

/**
 * 직전 계약 대비 임대료 증액률 검증
 * 기준: 전·월세 환산보증금 5% 이내
 * 위반 시 감면 전액 배제
 */
export function validateRentIncrease(
  history: RentHistory[],
  conversionRate: number,
  limit: number = 0.05,
): { isAllValid: boolean; violations: RentViolation[] } {
  if (history.length < 2) return { isAllValid: true, violations: [] };

  const violations: RentViolation[] = [];

  for (let i = 1; i < history.length; i++) {
    const prev = convertToStandardDeposit(history[i - 1], conversionRate);
    const curr = convertToStandardDeposit(history[i], conversionRate);

    if (prev === 0) continue; // 직전 환산보증금이 0이면 비교 불가

    const increaseRate = (curr - prev) / prev;
    if (increaseRate > limit + 1e-9) {
      violations.push({
        contractIndex: i,
        contractDate: history[i].contractDate,
        increaseRate,
        maxAllowed: limit,
      });
    }
  }

  return { isAllValid: violations.length === 0, violations };
}

// ============================================================
// 기준시가 요건 확인
// ============================================================

/**
 * 임대개시 당시 기준시가 요건 확인
 * - 수도권: 6억원 이하 (공공건설 3억원)
 * - 비수도권: 3억원 이하
 * - 공공매입(§97의5): 요건 없음
 */
function checkOfficialPriceRequirement(
  housingType: RentalHousingType,
  region: "capital" | "non_capital",
  officialPriceAtStart: number,
  rules: LongTermRentalRuleSet,
): boolean {
  const subType = rules.subTypes.find((s) => s.code === housingType);
  if (!subType || !subType.maxOfficialPrice) return true; // 요건 없음

  const maxPrice =
    region === "capital"
      ? subType.maxOfficialPrice.capital
      : subType.maxOfficialPrice.non_capital;

  if (maxPrice === null) return true; // 해당 지역 한도 없음
  return officialPriceAtStart <= maxPrice;
}

// ============================================================
// 의무임대기간 + 감면율 결정
// ============================================================

interface ReductionTier {
  mandatoryYears: number;
  reductionRate: number;
  longTermDeductionRate: number;
}

/**
 * 유형별 의무임대기간 + 감면율 결정
 */
function determineMandatoryPeriod(
  housingType: RentalHousingType,
  lawVersion: ReductionLawVersion,
  rules: LongTermRentalRuleSet,
): ReductionTier | null {
  switch (housingType) {
    case "public_construction":
      return { mandatoryYears: 5, reductionRate: 1.0, longTermDeductionRate: 0 };
    case "public_purchase":
      return { mandatoryYears: 0, reductionRate: 1.0, longTermDeductionRate: 0 };
    case "long_term_private":
    case "public_support_private": {
      // 2020.7.11 이후 등록분 → 10년 필요
      if (lawVersion === "post_2020_07_11" || lawVersion === "post_2020_08_18") {
        return { mandatoryYears: 10, reductionRate: 0.7, longTermDeductionRate: 0.7 };
      }
      // 2018.9.14 ~ 2020.7.10 등록분 → 8년
      if (lawVersion === "post_2018_09_14") {
        return { mandatoryYears: 8, reductionRate: 0.5, longTermDeductionRate: 0.5 };
      }
      // 2018.9.14 이전 구법 — 장기(8년) 기준 유지
      return { mandatoryYears: 8, reductionRate: 0.5, longTermDeductionRate: 0.5 };
    }
  }
}

// ============================================================
// 감면 한도 적용 (조특법 §133)
// ============================================================

/**
 * 조특법 §133 종합한도 적용
 * 감면액이 한도 초과 시: 1억 + (초과분 × 50%)
 */
function applyAnnualLimit(reductionAmount: number): {
  amount: number;
  isLimitApplied: boolean;
} {
  if (reductionAmount <= ANNUAL_BASE_LIMIT) {
    return { amount: reductionAmount, isLimitApplied: false };
  }
  const excess = reductionAmount - ANNUAL_BASE_LIMIT;
  const limited = truncateToWon(ANNUAL_BASE_LIMIT + applyRate(excess, EXCESS_RATE));
  return { amount: limited, isLimitApplied: true };
}

// ============================================================
// 1단계 연동 함수: 장기보유공제 특례율 조회
// ============================================================

/**
 * transfer-tax 엔진이 장기보유공제 계산 전에 호출
 * 장기임대 특례율(50%/70%)이 있으면 일반 공제 대신 적용
 */
export function getLongTermDeductionOverride(
  input: RentalReductionInput,
  rules: LongTermRentalRuleSet | undefined,
): { hasOverride: boolean; overrideRate: number } {
  if (!rules) return { hasOverride: false, overrideRate: 0 };
  if (!input.isRegisteredLandlord || !input.isTaxRegistered) {
    return { hasOverride: false, overrideRate: 0 };
  }
  if (
    input.rentalHousingType !== "long_term_private" &&
    input.rentalHousingType !== "public_support_private"
  ) {
    return { hasOverride: false, overrideRate: 0 };
  }

  const lawVersion = determineApplicableLaw(input.registrationDate);

  // 2020.8.18 이후 아파트 장기일반민간 등록 불가 → 특례 없음
  if (
    lawVersion === "post_2020_08_18" &&
    input.propertyType === "apartment" &&
    input.rentalHousingType === "long_term_private"
  ) {
    return { hasOverride: false, overrideRate: 0 };
  }

  const tier = determineMandatoryPeriod(input.rentalHousingType, lawVersion, rules);
  if (!tier || tier.longTermDeductionRate === 0) {
    return { hasOverride: false, overrideRate: 0 };
  }

  const effectiveYears = calculateEffectiveRentalPeriod(
    input.rentalStartDate,
    input.transferDate,
    input.vacancyPeriods,
  );

  if (effectiveYears < tier.mandatoryYears) {
    return { hasOverride: false, overrideRate: 0 };
  }

  // 임대료 증액 위반 시 특례 없음
  const CONVERSION_RATE = rules.jeonseConversionRate ?? 0.04; // 전월세전환율 (DB 미설정 시 4%)
  const rentValidation = validateRentIncrease(input.rentHistory, CONVERSION_RATE);
  if (!rentValidation.isAllValid) {
    return { hasOverride: false, overrideRate: 0 };
  }

  return { hasOverride: true, overrideRate: tier.longTermDeductionRate };
}

// ============================================================
// 메인 함수: calculateRentalReduction
// ============================================================

/**
 * 장기임대주택 감면 자격 판단 + 감면액 계산
 *
 * @param input  임대주택 감면 입력 데이터
 * @param rules  DB에서 로드한 장기임대 감면 규칙
 */
export function calculateRentalReduction(
  input: RentalReductionInput,
  rules: LongTermRentalRuleSet | undefined,
): RentalReductionResult {
  const ineligibleReasons: IneligibleReason[] = [];
  const warnings: string[] = [];

  // ── 기본 구조 초기화 ──
  const CONVERSION_RATE = rules?.jeonseConversionRate ?? 0.04; // 전월세전환율 (DB 미설정 시 4%)
  const rentIncreaseValidation = validateRentIncrease(
    input.rentHistory,
    CONVERSION_RATE,
  );

  const lawVersion = determineApplicableLaw(input.registrationDate);

  // ── Step 1: 임대사업자 등록 확인 ──
  if (!input.isRegisteredLandlord) {
    ineligibleReasons.push({
      code: "NOT_REGISTERED_LANDLORD",
      message: "지자체 임대사업자 미등록 — 감면 적용 불가",
      field: "isRegisteredLandlord",
    });
  }
  if (!input.isTaxRegistered) {
    ineligibleReasons.push({
      code: "NOT_TAX_REGISTERED",
      message: "세무서 사업자 미등록 — 감면 적용 불가",
      field: "isTaxRegistered",
    });
  }

  // ── Step 2: 아파트 장기일반 등록 제한 (2020.8.18 이후) ──
  if (
    lawVersion === "post_2020_08_18" &&
    input.propertyType === "apartment" &&
    input.rentalHousingType === "long_term_private"
  ) {
    ineligibleReasons.push({
      code: "APARTMENT_RESTRICTED_POST_2020_08_18",
      message: "2020.8.18 이후 아파트 장기일반민간임대 등록 불가 (민간임대주택법 개정)",
      field: "propertyType",
    });
  }

  // ── Step 3: 기준시가 요건 ──
  if (rules && !checkOfficialPriceRequirement(
    input.rentalHousingType,
    input.region,
    input.officialPriceAtStart,
    rules,
  )) {
    const limit =
      input.region === "capital"
        ? input.rentalHousingType === "public_construction" ? "3억원" : "6억원"
        : "3억원";
    ineligibleReasons.push({
      code: "OFFICIAL_PRICE_EXCEEDED",
      message: `임대개시 당시 기준시가 ${limit} 초과 (입력값: ${input.officialPriceAtStart.toLocaleString()}원)`,
      field: "officialPriceAtStart",
    });
  }

  // ── Step 4: 의무임대기간 ──
  const tier = determineMandatoryPeriod(
    input.rentalHousingType,
    lawVersion,
    rules ?? { type: "long_term_rental_v2", subTypes: [] },
  );

  const mandatoryPeriodYears = tier?.mandatoryYears ?? 0;
  const effectiveRentalYears = calculateEffectiveRentalPeriod(
    input.rentalStartDate,
    input.transferDate,
    input.vacancyPeriods,
  );

  if (mandatoryPeriodYears > 0 && effectiveRentalYears < mandatoryPeriodYears) {
    ineligibleReasons.push({
      code: "RENTAL_PERIOD_SHORT",
      message: `의무임대기간 ${mandatoryPeriodYears}년 미충족 (현재: ${effectiveRentalYears}년)`,
      field: "rentalStartDate",
    });
  }

  // ── Step 5: 임대료 증액 제한 위반 ──
  if (!rentIncreaseValidation.isAllValid) {
    ineligibleReasons.push({
      code: "RENT_INCREASE_VIOLATION",
      message: `임대료 증액 제한(연 5%) 위반 — 감면 전액 배제 (위반 건수: ${rentIncreaseValidation.violations.length})`,
      field: "rentHistory",
    });
  }

  // ── 감면 계산 ──
  const isEligible = ineligibleReasons.length === 0;

  const reductionRate = tier?.reductionRate ?? 0;
  const specialLongTermDeductionRate = tier?.longTermDeductionRate ?? 0;

  let reductionAmount = 0;
  let annualLimit = 0;
  let isLimitApplied = false;

  if (isEligible && reductionRate > 0) {
    const rawAmount = applyRate(input.calculatedTax, reductionRate);
    const limited = applyAnnualLimit(rawAmount);
    reductionAmount = limited.amount;
    annualLimit = ANNUAL_BASE_LIMIT;
    isLimitApplied = limited.isLimitApplied;
  }

  // 공공매입임대: 공공기관 매각 조건부 — 경고
  if (input.rentalHousingType === "public_purchase") {
    warnings.push(`공공매입임대(${TRANSFER.REDUCTION_LONG_RENTAL_PUBLIC}): 공공기관에 매각하는 조건이 충족된 경우에만 100% 감면 적용`);
  }

  // 구법 적용: 경고
  if (lawVersion === "pre_2018_09_14") {
    warnings.push("2018.9.14 이전 등록 — 구 조세특례제한법 규정 적용. 세무전문가 확인 권장");
  }

  return {
    isEligible,
    ineligibleReasons,
    reductionType: input.rentalHousingType,
    applicableLawVersion: lawVersion,
    mandatoryPeriodYears,
    effectiveRentalYears,
    reductionRate,
    reductionAmount,
    specialLongTermDeductionRate,
    annualLimit,
    isLimitApplied,
    rentIncreaseValidation,
    warnings,
  };
}
