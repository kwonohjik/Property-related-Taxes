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

import { applyRate } from "./tax-utils";
import {
  calculateEffectiveRentalPeriod,
  convertToStandardDeposit,
  validateRentIncrease,
  RENTAL_VACANCY_GRACE_MONTHS_97,
  RENTAL_VACANCY_GRACE_MONTHS_97_5,
} from "./transfer-reductions/rental-97-shared-helpers";

/**
 * D1-08 — 종전에는 아래 세 함수와 180일 상수가 이 파일에 **통째로 복제**돼 있었고,
 * 같은 §97 조문을 두 사본이 나란히 판정했다(`transfer-tax-reductions-calc.ts`가
 * 레거시 분기와 신규 §97 분기를 둘 다 평가해 같은 §127⑦ max 후보 배열에 넣는다).
 * 단일 소스로 통합하고, 기존 import 경로를 위해 여기서 재export한다.
 */
export {
  calculateEffectiveRentalPeriod,
  convertToStandardDeposit,
  validateRentIncrease,
  RENTAL_VACANCY_GRACE_MONTHS_97,
  RENTAL_VACANCY_GRACE_MONTHS_97_5,
};
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

/** 조특법 §97① 본문 — 「2000년 12월 31일 이전에 임대를 개시하여」 */
const RENTAL_97_START_DEADLINE = new Date("2000-12-31");

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
  /**
   * 신축 연도 — **§97(`public_construction`) 전용** (D1-04).
   *
   * 조특법 §97① 각 호:
   *   1호 **1986년 1월 1일부터 2000년 12월 31일까지의 기간 중 신축된 주택**
   *   2호 **1985년 12월 31일 이전에 신축된 공동주택**으로서 1986년 1월 1일 현재 입주된
   *       사실이 없는 주택
   *
   * ⚠️ 미입력을 **충족으로 읽지 않는다** — 종전에는 이 요건을 아예 보지 않아
   *    2015년 신축·2015년 임대개시 주택도 100% 면제를 받았다.
   */
  constructionYear?: number;
  /**
   * §97①2호 — 1986.1.1 현재 입주된 사실이 없는 공동주택 자기확인 (D1-04).
   * 1985.12.31 이전 신축분은 이 확인이 있어야 2호에 해당한다.
   */
  isUnoccupiedAt1986?: boolean;
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
 * 임대주택 유형 → 공실 유예 개월 (D1-03·D2-08).
 *
 * §97·§97의3·§97의4 = 조특칙 §44 「3월」 / §97의5 = 조특령 §97의5①1호 「6개월」.
 * 상세 근거는 `transfer-reductions/rental-97-shared-helpers.ts` 상수 주석 참조.
 */
function graceMonthsFor(type: RentalHousingType): number {
  return type === "public_purchase"
    ? RENTAL_VACANCY_GRACE_MONTHS_97_5
    : RENTAL_VACANCY_GRACE_MONTHS_97;
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
    graceMonthsFor(input.rentalHousingType),
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
      message: `임대개시 당시 기준시가 ${limit} 초과 (입력값: ${input.officialPriceAtStart.toLocaleString()}`,
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
    graceMonthsFor(input.rentalHousingType),
  );

  if (mandatoryPeriodYears > 0 && effectiveRentalYears < mandatoryPeriodYears) {
    ineligibleReasons.push({
      code: "RENTAL_PERIOD_SHORT",
      message: `의무임대기간 ${mandatoryPeriodYears}년 미충족 (현재: ${effectiveRentalYears}년)`,
      field: "rentalStartDate",
    });
  }

  // ── Step 4-1: §97 본문 시한 + 각 호 신축연도 (D1-04) ──
  //
  // 조특법 §97① — 「…국민주택…을 **2000년 12월 31일 이전에 임대를 개시하여** 5년 이상
  // 임대한 후 양도하는 경우…양도소득세의 100분의 50에 상당하는 세액을 감면한다.」
  // 단서의 면제(건설임대 5년↑ 등)는 **본문 요건과 각 호를 면제하지 않는다** —
  // 종전에는 5년 임대만으로 감면율 1.0을 부여해 시한·신축연도를 한 번도 보지 않았다.
  //
  // ⚠️ 이 게이트는 **§97(`public_construction`)에만** 건다. §97의3·§97의4·§97의5는
  //    각자 다른 시한을 갖는다(같은 스위치에 있다고 요건을 공유하지 않는다).
  //
  // 📌 같은 요건을 신세대 경로(`transfer-reductions/rental-97-main.ts`)가 이미 정확히
  //    검사한다. 두 경로가 같은 조문을 판정하는 dual truth 자체는 남아 있고,
  //    정본 해소는 이 분기의 폐지 또는 위임이다(API 표면 결정이 필요해 별건).
  if (input.rentalHousingType === "public_construction") {
    if (input.rentalStartDate.getTime() > RENTAL_97_START_DEADLINE.getTime()) {
      ineligibleReasons.push({
        code: "RENTAL_START_AFTER_DEADLINE",
        message:
          `임대개시일이 2000.12.31 이후 — 조특법 §97① 본문의 「2000년 12월 31일 이전에 ` +
          `임대를 개시하여」 요건 미충족`,
        field: "rentalStartDate",
      });
    }
    const year = input.constructionYear;
    if (year === undefined) {
      ineligibleReasons.push({
        code: "MISSING_CONSTRUCTION_YEAR",
        message:
          "신축 연도가 입력되지 않았습니다 — 조특법 §97① 각 호(1호 1986~2000 신축 / " +
          "2호 1985.12.31 이전 신축 공동주택) 판정에 필요합니다.",
        field: "constructionYear",
      });
    } else if (year >= 1986 && year <= 2000) {
      // 1호 — 충족
    } else if (year <= 1985) {
      // 2호 — 1986.1.1 현재 미입주 공동주택만 해당
      if (input.isUnoccupiedAt1986 !== true) {
        ineligibleReasons.push({
          code: "NOT_UNOCCUPIED_AT_1986",
          message:
            `신축 ${year}년 — 조특법 §97①2호는 「1985년 12월 31일 이전에 신축된 공동주택으로서 ` +
            `1986년 1월 1일 현재 입주된 사실이 없는 주택」에 한합니다. 미입주 사실이 확인되지 않았습니다.`,
          field: "constructionYear",
        });
      }
    } else {
      ineligibleReasons.push({
        code: "CONSTRUCTION_YEAR_OUT",
        message: `신축 ${year}년 — 조특법 §97① 각 호(1호 1986~2000 / 2호 1985 이전) 요건 외`,
        field: "constructionYear",
      });
    }
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
  /**
   * D1-05 — §97 시리즈는 §133 한도 대상이 아니므로 항상 0/false다.
   * 결과 shape는 소비자(`RentalReductionDetailCard`)를 위해 유지하되,
   * `isLimitApplied`가 false이므로 「§133 한도로 제한됨」 안내는 렌더되지 않는다.
   */
  const annualLimit = 0;
  const isLimitApplied = false;

  if (isEligible && reductionRate > 0) {
    /**
     * D1-05 — **§133 한도를 적용하지 않는다.**
     *
     * 조특법 §133①은 「제33조, 제43조, 제66조부터 제69조까지, 제69조의2부터 제69조의4까지,
     * 제70조, 제85조의10 또는 법률 제6538호 부칙 제29조」, ②는 「제77조, 제77조의2 또는
     * 제77조의3」을 열거한다 — **§97·§97의3·§97의4·§97의5는 어느 항에도 없다.**
     * 이 모듈이 다루는 네 조문 전부가 §133 대상이 아닌데 유형 분기 없이 한도가 걸려 있었다.
     *
     * 산식도 조문과 달랐다 — §133①1호는 「1억원을 초과하는 경우에는 그 **초과하는 부분에
     * 상당하는 금액**」을 감면하지 아니한다(하드 캡)이지 「초과분의 50%는 감면」이 아니다.
     * 저장소의 정본 한도 모듈 `aggregate-reduction-limits.ts`도 §97을 그룹에 넣지 않는다.
     */
    reductionAmount = applyRate(input.calculatedTax, reductionRate);
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
