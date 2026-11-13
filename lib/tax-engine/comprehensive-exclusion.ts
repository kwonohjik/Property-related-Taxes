/**
 * 종합부동산세 합산배제 판정 모듈 (T-05)
 * 종합부동산세법 §8②, 시행령 §3(임대주택)·§4(기타)
 */

import { addYears } from "./utc-date";
import { excludedUnder8hoNa } from "./comprehensive-exclusion-8ho-na";
import { unsoldPurchase6hoIssues } from "./comprehensive-exclusion-6ho";
import { builtRentalBaseCap } from "./comprehensive-exclusion-price-era";
import { vacantConstruction4hoIssues } from "./comprehensive-exclusion-4ho";
import { reitPurchase5hoIssues } from "./comprehensive-exclusion-5ho";
import { conversionPending9hoIssues } from "./comprehensive-exclusion-9ho";
import { conversion9hoBaseType } from "./comprehensive-exclusion-9ho";
import {
  COMPREHENSIVE_EXCL,
  COMPREHENSIVE_EXCL_CONST,
} from "./legal-codes";
import type {
  AggregationExclusionResult,
  ExclusionResult,
  ExclusionValidationResult,
  PropertyForExclusion,
  RentalExclusionInput,
  OtherExclusionInput,
  ExclusionType,
} from "./types/comprehensive.types";

// ============================================================
// 임대주택 합산배제 요건 판정 (시행령 §3)
// ============================================================

/**
 * 임대유형별 의무임대기간 (시행령 §3① 각 호 나목, 2026.2.27 시행본 실측)
 *
 * - 장기일반·공공지원민간임대(§3①7·8호): 10년
 * - 건설·매입·2005 이전 구법(§3①1·2·3호): 5년
 * - 공공건설/공공매입: §3①1·2호 5년 (단 §3⑦8호 임대의무기간 종료일까지 계속임대 간주 — 별도 사후관리)
 *
 * - 단기민간임대주택(§2⑥의2, 6년·§3①10·11호): 6년 (건설 10호·매입 11호)
 */
const MANDATORY_PERIOD_BY_TYPE: Record<
  RentalExclusionInput["registrationType"],
  number
> = {
  private_construction:        COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_SHORT,      // 5 — §3①1호
  private_purchase_short:      COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_SHORT,      // 5 — §3①2호 (구법)
  private_purchase_long:       COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_LONG,       // 10 — §3①8호
  public_support_construction: COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_LONG,       // 10 — §3①7호
  public_support_purchase:     COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_LONG,       // 10 — §3①8호 (공공지원)
  public_construction:         COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_SHORT,      // 5 — §3①1호
  public_purchase:             COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_SHORT,      // 5 — §3①2호
  existing_rental:             COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_SHORT,      // 5 — §3①3호 (2005년 이전)
  private_short_term_6y_construction: COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_SHORT_TERM_6Y, // 6 — §3①10호
  private_short_term_6y_purchase:     COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_SHORT_TERM_6Y, // 6 — §3①11호
  unsold_purchase:             COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_SHORT,      // 5 — §3①6호 나목
  vacant_construction:         0,                                                    // §3①4호 — 「소유」 · 임대기간 요건 없음
  reit_purchase:               COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_LONG,       // 10 — §3①5호 나목
  public_conversion_pending:   0,                                                    // §3①9호 — 「소유」 · 임대 계속 요건 없음
};

/**
 * §3①7호 나목·8호 가목2) — 2020.8.18. 이후 「민간임대주택에 관한 특별법」 §5① 등록 신청(추가 변경신고 포함)분은 10년,
 * 그 전 신청분은 종전 규정 8년(대통령령 제31085호 부칙 §3·§4). 납세의무자 본인의 신청일 기준 — 포괄승계도 승계인 신청일
 * (서면-2025-부동산-2158). 신청일을 모르면 등록일이 8.18. 전일 때만 8년(신청일 ≤ 등록일), 아니면 10년 + 확인 필요 안내.
 * 경고 문구에만 쓴다 — 합산배제 성립·세액과 무관.
 */
const LONG_PERIOD_TYPES: ReadonlySet<RentalExclusionInput["registrationType"]> = new Set([
  "private_purchase_long",
  "public_support_purchase",
  "public_support_construction",
]);
const AUG_18_2020 = Date.UTC(2020, 7, 18);

function mandatoryPeriod(input: RentalExclusionInput): { years: number; applicationUnknown: boolean } {
  if (!LONG_PERIOD_TYPES.has(input.registrationType)) {
    return { years: MANDATORY_PERIOD_BY_TYPE[input.registrationType], applicationUnknown: false };
  }
  const app = input.rentalApplicationDate;
  const appMs = app && !Number.isNaN(app.getTime()) ? app.getTime() : null;
  const before =
    appMs !== null ? appMs < AUG_18_2020 : input.rentalRegistrationDate.getTime() < AUG_18_2020;
  return {
    years: before ? COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_LONG_PRE_0818 : COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_LONG,
    applicationUnknown: appMs === null && !before,
  };
}

/**
 * §3①1호 단서(민간건설임대)·2호 단서(민간매입임대) 「2018년 3월 31일 이전에 … 임대사업자 등록과 사업자등록을 한 주택으로 한정」.
 * - 대통령령 제28645호(2018.2.13. 시행) 부칙 제2조 — 시행 이후 납세의무 성립분(2018 과세기준일)부터.
 * - 3.31.이 토요일이라 국세기본법 §5로 4.2.까지(서면-2021-법규재산-3280 — 같은 문언의 소령 §167의3①2호 가목 회신 유추 ·
 *   종부령 직접 해석 없음). 지자체 날짜는 등록일(같은 회신).
 * - 공공건설·공공매입(같은 호)은 단서 밖. 세무서 사업자등록일을 모르면 확인 불가 → 불성립(「모름」은 혜택 불성립).
 */
const REG_CAP_2018_TYPES: ReadonlySet<RentalExclusionInput["registrationType"]> = new Set([
  "private_construction",
  "private_purchase_short",
]);
const REG_CAP_2018_ERA_START = Date.UTC(2018, 1, 13);
const REG_CAP_2018_LAST_DAY = Date.UTC(2018, 3, 2);

function regCap2018Issue(input: RentalExclusionInput): string | null {
  if (!REG_CAP_2018_TYPES.has(input.registrationType)) return null;
  if (input.assessmentDate.getTime() < REG_CAP_2018_ERA_START) return null;
  const biz = input.businessRegistrationDate;
  if (!biz || Number.isNaN(biz.getTime())) return COMPREHENSIVE_EXCL.BUSINESS_REGISTRATION_DATE_UNKNOWN;
  if (input.rentalRegistrationDate.getTime() > REG_CAP_2018_LAST_DAY || biz.getTime() > REG_CAP_2018_LAST_DAY) {
    return COMPREHENSIVE_EXCL.REGISTERED_AFTER_2018_03_31;
  }
  return null;
}

/**
 * §3①10호·11호(단기민간임대주택 6년) 시행 시점 — 부칙<대통령령 제35352호, 2025.2.28.>.
 * - 제1조 단서: 2025.6.4. 시행 · 제2조②: 그 뒤 납세의무 성립분(2026 과세기준일)부터.
 * - 제3조: 2025 과세기준일은 아파트(도시형 생활주택 아닌 것) 아닌 주택을 보유현황 신고기간 종료일(종부법 §8③ — 9.30.)까지
 *   단기로 등록하면 적용(「등록하는」=지자체 등록일 · 신고기간 연장 여부는 확인 필요 — 계획서 V-3).
 */
const SHORT_TERM_6Y_TYPES: ReadonlySet<RentalExclusionInput["registrationType"]> = new Set([
  "private_short_term_6y_construction",
  "private_short_term_6y_purchase",
]);
const SHORT_TERM_6Y_FIRST_ASSESSMENT = Date.UTC(2025, 5, 1);
const SHORT_TERM_6Y_FULL_ASSESSMENT = Date.UTC(2026, 5, 1);
const SHORT_TERM_6Y_2025_REG_DEADLINE = Date.UTC(2025, 8, 30);

function shortTerm6yEraIssues(input: RentalExclusionInput): string[] {
  if (!SHORT_TERM_6Y_TYPES.has(input.registrationType)) return [];
  const asmt = input.assessmentDate.getTime();
  if (asmt >= SHORT_TERM_6Y_FULL_ASSESSMENT) return [];
  if (asmt < SHORT_TERM_6Y_FIRST_ASSESSMENT) return [COMPREHENSIVE_EXCL.SHORT_TERM_6Y_NOT_IN_FORCE];
  const issues: string[] = [];
  if (input.rentalRegistrationDate.getTime() > SHORT_TERM_6Y_2025_REG_DEADLINE) {
    issues.push(COMPREHENSIVE_EXCL.SHORT_TERM_6Y_2025_REGISTERED_LATE);
  }
  if (input.isApartment === true) issues.push(COMPREHENSIVE_EXCL.SHORT_TERM_6Y_2025_APARTMENT);
  else if (input.isApartment == null) issues.push(COMPREHENSIVE_EXCL.SHORT_TERM_6Y_2025_APARTMENT_UNKNOWN);
  return issues;
}

/**
 * §3①1·3·7·10호 「다음 각 목의 요건을 모두 갖춘 주택이 2호 이상인 경우 그 주택」 — 2·6·8·11호에는 이 문언이 없다(6호는 5호 이상 · 6호 모듈).
 * 호수는 사용자가 센다(1·7·10호 같은 시·도 §3⑤ · 3호 전국 · 1호는 민간·공공건설 합산). 직접 해석 0건 — 계획서
 * comprehensive-rental-excl-two-plus-units.plan.md V-1~V-3. 「모름」은 불성립 + 확인 필요.
 */
const TWO_PLUS_TYPES: ReadonlySet<RentalExclusionInput["registrationType"]> = new Set([
  "private_construction",
  "public_construction",
  "existing_rental",
  "public_support_construction",
  "private_short_term_6y_construction",
]);

function twoPlusUnitsIssue(input: RentalExclusionInput): string | null {
  if (!TWO_PLUS_TYPES.has(input.registrationType)) return null;
  const u = input.qualifyingUnitCount;
  if (typeof u !== "number" || !Number.isFinite(u)) return COMPREHENSIVE_EXCL.TWO_PLUS_UNITS_UNKNOWN;
  return u >= 2 ? null : COMPREHENSIVE_EXCL.TWO_PLUS_UNITS_UNDER_2;
}

const NO_RENT_LIMIT_TYPES: ReadonlySet<RentalExclusionInput["registrationType"]> = new Set([
  "existing_rental",
  "unsold_purchase",
  "vacant_construction", // 4호 — 미임대(임대료 없음)
  "reit_purchase",       // 5호 — 임대료 문언 없음(§3⑧에도 없음)
]);

/** §3① 각 호 외의 부분 「소유(제4호 또는 제9호의 주택을 소유한 경우)」 — 임대 개시·임대 계속을 보지 않는다 */
const OWNED_TYPES: ReadonlySet<RentalExclusionInput["registrationType"]> = new Set([
  "vacant_construction",
  "public_conversion_pending",
]);

export function validateRentalExclusion(
  input: RentalExclusionInput,
): ExclusionValidationResult {
  const failReasons: string[] = [];

  if (!input.rentalRegistrationDate) {
    failReasons.push(COMPREHENSIVE_EXCL.NO_RENTAL_REGISTRATION);
  } else {
    const capIssue = regCap2018Issue(input);
    if (capIssue) failReasons.push(capIssue);
    failReasons.push(...shortTerm6yEraIssues(input));
    failReasons.push(...excludedUnder8hoNa(input));
    failReasons.push(...unsoldPurchase6hoIssues(input));
    const unitsIssue = twoPlusUnitsIssue(input);
    if (unitsIssue) failReasons.push(unitsIssue);
    failReasons.push(...vacantConstruction4hoIssues(input));
    failReasons.push(...reitPurchase5hoIssues(input));
    failReasons.push(...conversionPending9hoIssues(input));
  }

  // 9호는 「제1호에 해당하는 공공건설임대주택」·「제2호에 해당하는 공공매입임대주택」 — 면적·가격은 그 바탕 유형으로 본다(Q-4 a)
  const base9 = conversion9hoBaseType(input);
  const limitInput: RentalExclusionInput = base9 ? { ...input, registrationType: base9 } : input;

  const areaLimit = getAreaLimit(limitInput);
  if (input.area > areaLimit) {
    failReasons.push(
      areaLimit === COMPREHENSIVE_EXCL_CONST.SHORT_TERM_6Y_AREA_CONSTRUCTION
        ? COMPREHENSIVE_EXCL.AREA_EXCEEDED_149
        : COMPREHENSIVE_EXCL.AREA_EXCEEDED,
    );
  }

  const priceLimit = getPriceLimit(limitInput);
  if (input.assessedValue > priceLimit) {
    failReasons.push(COMPREHENSIVE_EXCL.PRICE_EXCEEDED);
    // 30호 이상을 골랐지만 그 구간이 아직 없던 과세연도 — 왜 30호 미만 금액으로 봤는지 알린다
    if (input.isThirtyPlusUnits === true && !thirtyPlusTierApplies(input)) {
      failReasons.push(COMPREHENSIVE_EXCL.THIRTY_PLUS_TIER_NOT_IN_FORCE);
    }
    // 건설임대 6억 기준을 쓴 까닭(2021.2.17. 전 사용승인 · 사용승인일 모름)
    const builtReason = thirtyPlusTierApplies(input) ? null : builtRentalBaseCap(limitInput)?.reason;
    if (builtReason) failReasons.push(builtReason);
  }

  // 임대료 증가율 요건은 1·2·7·8·10·11호에만 있다 — 3호(2005.1.5. 이전 임대)·6호(미분양매입)는 없다(§3① 각 호 · §3⑧)
  if (!NO_RENT_LIMIT_TYPES.has(input.registrationType) && !input.isInitialContract && input.previousRent !== undefined) {
    const increaseRate = (input.currentRent - input.previousRent) / input.previousRent;
    if (increaseRate > COMPREHENSIVE_EXCL_CONST.RENT_INCREASE_RATE_LIMIT) {
      failReasons.push(COMPREHENSIVE_EXCL.RENT_INCREASE_EXCEEDED);
    }
  }

  // 4·9호는 「소유」 — 임대 개시를 보지 않는다
  if (!OWNED_TYPES.has(input.registrationType) && input.rentalStartDate && input.assessmentDate < input.rentalStartDate) {
    failReasons.push(COMPREHENSIVE_EXCL.RENTAL_NOT_STARTED);
  }

  // 의무임대기간 — 등록 말소 확인 시 즉시 차단 (시행령 §3① 계속임대 위반 확정)
  // ※ "현재까지 N년 미달"은 거부 사유 아님 — 장래 의무이므로 경고만(아래 warnings)
  // 9호는 「소유」만 요구(공공주택사업자 — 민특법 등록 말소 개념 없음) · 4호는 임대사업자 요건이라 말소 시 불성립(계획서 4-7·9-7)
  if (
    input.registrationType !== "public_conversion_pending" &&
    input.registrationRevokedDate &&
    input.registrationRevokedDate <= input.assessmentDate
  ) {
    failReasons.push(COMPREHENSIVE_EXCL.MANDATORY_PERIOD_NOT_MET);
  }

  if (failReasons.length > 0) {
    return { isExcluded: false, reason: failReasons[0], failReasons };
  }

  // 배제 성립 — 경과 연수가 의무기간 미달이면 사후 추징 위험 경고 (배제는 유지)
  const warnings: string[] = [];
  if (input.actualRentalYears !== undefined) {
    const { years: requiredYears, applicationUnknown } = mandatoryPeriod(input);
    if (requiredYears > 0 && input.actualRentalYears < requiredYears) {
      const basis = LONG_PERIOD_TYPES.has(input.registrationType)
        ? COMPREHENSIVE_EXCL.MANDATORY_PERIOD_LONG_BASIS
        : "종합부동산세법 시행령 §3①";
      warnings.push(
        `의무임대기간(${requiredYears}년) 미충족 — 현재 ${input.actualRentalYears}년 경과. ` +
          `의무기간 충족 전 등록 말소 시 합산배제 세액이 소급 추징됩니다 (${basis}).` +
          (applicationUnknown ? " 지자체 등록 신청일이 2020.8.17. 이전이면 의무임대기간은 8년입니다(확인 필요)." : ""),
      );
    }
  }

  return {
    isExcluded: true,
    reason: getRentalExclusionLegalCode(input.registrationType),
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * 전용면적 상한 (㎡)
 *
 * 종부세 시행령 §3① 각 호 기준:
 * - 건설임대 (1·7·10호): 149㎡ 이하
 * - 매입임대 (2·8·11호): 면적제한 없음 (Infinity)
 * - 기존임대 (3호, 2005 이전): 읍면 100㎡ / 그외 85㎡
 */
function getAreaLimit(input: RentalExclusionInput): number {
  switch (input.registrationType) {
    // 건설임대 — 149㎡ (§3①1·7·10호)
    case "private_construction":
    case "public_construction":
    case "public_support_construction":
    case "private_short_term_6y_construction":
    // 미분양매입임대 — 149㎡ (§3①6호 가목)
    case "unsold_purchase":
    // 미임대 민간건설 — 149㎡ (§3①4호 가목) · 부동산투자회사 2008 매입 — 149㎡ (§3①5호 가목)
    case "vacant_construction":
    case "reit_purchase":
      return COMPREHENSIVE_EXCL_CONST.SHORT_TERM_6Y_AREA_CONSTRUCTION; // 149

    // 9호 — 바탕 유형을 모르면 면적을 보지 않는다(구분 모름 사유가 따로 불성립시킨다)
    case "public_conversion_pending":
      return Infinity;

    // 매입임대 — 면적제한 없음 (§3①2·8·11호)
    case "private_purchase_long":
    case "private_purchase_short":
    case "public_purchase":
    case "public_support_purchase":
    case "private_short_term_6y_purchase":
      return Infinity;

    // 기존임대 (§3①3호, 2005년 이전) — 읍면 100㎡ / 그외 85㎡
    case "existing_rental":
      return input.isEupMyeonArea
        ? COMPREHENSIVE_EXCL_CONST.AREA_LIMIT_RURAL          // 100
        : COMPREHENSIVE_EXCL_CONST.AREA_LIMIT_NATIONAL_HOUSING; // 85
  }
}

/**
 * §3①1·2·7·8호 가목 「30호 이상」 상향 구간은 대통령령 제35352호(2025.2.28. 시행)에서 신설 —
 * 같은 영 부칙 제2조①로 그 뒤 납세의무 성립분(2025 과세기준일)부터. 2024 이하 과세연도에는 토글이 켜져 있어도 30호 미만 금액.
 * (2023.9.5.·2024.11.12. 시행본에 30호 구간 없음 — 계획서 comprehensive-rental-excl-price-cap-eras.plan.md §1)
 */
const THIRTY_PLUS_TIER_IN_FORCE = Date.UTC(2025, 1, 28);

function thirtyPlusTierApplies(input: RentalExclusionInput): boolean {
  return input.isThirtyPlusUnits === true && input.assessmentDate.getTime() >= THIRTY_PLUS_TIER_IN_FORCE;
}

function getPriceLimit(input: RentalExclusionInput): number {
  const metro = input.location === "metro";
  const over30 = thirtyPlusTierApplies(input); // 30호 이상 tier (§3①1·2·7·8호 · 2025 과세연도부터)
  switch (input.registrationType) {
    // 단기건설 (§3①10호) — 6억, 수도권·호수 무관
    case "private_short_term_6y_construction":
      return COMPREHENSIVE_EXCL_CONST.SHORT_TERM_6Y_PRICE_CONSTRUCTION; // 6억
    // 단기매입 (§3①11호) — 4억/2억, 호수 무관
    case "private_short_term_6y_purchase":
      return metro
        ? COMPREHENSIVE_EXCL_CONST.SHORT_TERM_6Y_PRICE_PURCHASE_METRO // 4억
        : COMPREHENSIVE_EXCL_CONST.SHORT_TERM_6Y_PRICE_PURCHASE_NON_METRO; // 2억
    // 기존임대 (§3①3호) — 3억, 수도권·호수 무관
    case "existing_rental":
      return COMPREHENSIVE_EXCL_CONST.EXISTING_RENTAL_PRICE; // 3억
    // 미분양매입임대 (§3①6호 가목) — 3억 (수도권 안은 다목으로 따로 불성립)
    case "unsold_purchase":
      return COMPREHENSIVE_EXCL_CONST.UNSOLD_PURCHASE_RENTAL_PRICE; // 3억
    // 미임대 민간건설 (§3①4호 나목) — 9억/6억(부칙<제31447호> §2 · 2025 이후에도 사용승인일)
    case "vacant_construction":
      return builtRentalBaseCap(input)?.cap ?? COMPREHENSIVE_EXCL_CONST.BUILT_RENTAL_PRICE_PRE_20210217;
    // 5호 — 2008년도 과세기준일 공시가격(사실 칸)으로 본다 · 9호 바탕 유형 모름 — 가격을 보지 않는다
    case "reit_purchase":
    case "public_conversion_pending":
      return Infinity;
    // 장기 건설임대 (§3①1·7호) — 30호미만 9억 / 30호이상 12억, 수도권 무관
    case "private_construction":
    case "public_construction":
    case "public_support_construction":
      // 30호 미만 9억은 2021.2.17. 이후 사용승인(2021년분 민간건설은 등록)분만 — 그 밖 6억(부칙<제31447호> §2)
      return over30
        ? COMPREHENSIVE_EXCL_CONST.BUILT_RENTAL_PRICE_OVER30 // 12억
        : (builtRentalBaseCap(input)?.cap ?? COMPREHENSIVE_EXCL_CONST.BUILT_RENTAL_PRICE_UNDER30); // 9억/6억
    // 매입임대 (§3①2·8호) — 30호미만 6억/3억 / 30호이상 9억/6억
    case "private_purchase_long":
    case "private_purchase_short":
    case "public_purchase":
    case "public_support_purchase":
      if (over30)
        return metro
          ? COMPREHENSIVE_EXCL_CONST.PURCHASE_PRICE_OVER30_METRO // 9억
          : COMPREHENSIVE_EXCL_CONST.PURCHASE_PRICE_OVER30_NON_METRO; // 6억
      return metro
        ? COMPREHENSIVE_EXCL_CONST.RENTAL_PRICE_METRO // 6억
        : COMPREHENSIVE_EXCL_CONST.RENTAL_PRICE_NON_METRO; // 3억
  }
}

function getRentalExclusionLegalCode(
  registrationType: RentalExclusionInput["registrationType"],
): string {
  switch (registrationType) {
    case "private_construction":        return COMPREHENSIVE_EXCL.PRIVATE_CONSTRUCTION_RENTAL;
    case "private_purchase_long":       return COMPREHENSIVE_EXCL.PRIVATE_PURCHASE_RENTAL_LONG;
    case "private_purchase_short":      return COMPREHENSIVE_EXCL.PRIVATE_PURCHASE_RENTAL_SHORT;
    case "public_support_construction": return COMPREHENSIVE_EXCL.PUBLIC_SUPPORT_CONSTRUCTION_RENTAL;
    case "public_support_purchase":     return COMPREHENSIVE_EXCL.PUBLIC_SUPPORT_PURCHASE_RENTAL;
    case "public_construction":         return COMPREHENSIVE_EXCL.PUBLIC_CONSTRUCTION_RENTAL;
    case "public_purchase":             return COMPREHENSIVE_EXCL.PUBLIC_PURCHASE_RENTAL;
    case "existing_rental":             return COMPREHENSIVE_EXCL.EXISTING_RENTAL;
    case "private_short_term_6y_construction": return COMPREHENSIVE_EXCL.PRIVATE_SHORT_TERM_RENTAL_6Y_CONSTRUCTION;
    case "private_short_term_6y_purchase":     return COMPREHENSIVE_EXCL.PRIVATE_SHORT_TERM_RENTAL_6Y_PURCHASE;
    case "unsold_purchase":                    return COMPREHENSIVE_EXCL.UNSOLD_PURCHASE_RENTAL;
    case "vacant_construction":                return COMPREHENSIVE_EXCL.VACANT_CONSTRUCTION_RENTAL;
    case "reit_purchase":                      return COMPREHENSIVE_EXCL.REIT_PURCHASE_RENTAL;
    case "public_conversion_pending":          return COMPREHENSIVE_EXCL.PUBLIC_CONVERSION_PENDING_RENTAL;
  }
}

// ============================================================
// 기타 합산배제 주택 요건 판정 (시행령 §4)
// ============================================================

export function validateOtherExclusion(
  prop: PropertyForExclusion,
  type: ExclusionType,
  info: OtherExclusionInput,
  assessmentDate: Date,
): ExclusionValidationResult {
  switch (type) {
    case "unsold_housing": {
      if (!info.isFirstSale) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.UNSOLD_NOT_FIRST_SALE };
      }
      if (!info.recruitmentNoticeDate || !info.acquisitionDate) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.UNSOLD_BEFORE_NOTICE };
      }
      const acquisitionDate = new Date(info.acquisitionDate);
      const noticeDate = new Date(info.recruitmentNoticeDate);
      if (acquisitionDate < noticeDate) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.UNSOLD_BEFORE_NOTICE };
      }
      const exclusionEndDate = addYears(
        acquisitionDate,
        COMPREHENSIVE_EXCL_CONST.UNSOLD_EXCLUSION_YEARS,
      );
      if (assessmentDate > exclusionEndDate) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.UNSOLD_PERIOD_EXPIRED };
      }
      return { isExcluded: true, reason: COMPREHENSIVE_EXCL.UNSOLD_HOUSING };
    }

    case "daycare_housing": {
      if (!info.hasDaycarePermit || !info.isActuallyUsedAsDaycare) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.NOT_APPLIED };
      }
      return { isExcluded: true, reason: COMPREHENSIVE_EXCL.DAYCARE_HOUSING };
    }

    case "employee_housing": {
      if (!info.isProvidedToEmployee) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.NOT_APPLIED };
      }
      if (
        info.rentalFeeRate !== undefined &&
        info.rentalFeeRate > COMPREHENSIVE_EXCL_CONST.EMPLOYEE_HOUSING_RENT_RATE_LIMIT
      ) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.NOT_APPLIED };
      }
      if (prop.area !== undefined && prop.area > COMPREHENSIVE_EXCL_CONST.AREA_LIMIT_NATIONAL_HOUSING) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.AREA_EXCEEDED };
      }
      return { isExcluded: true, reason: COMPREHENSIVE_EXCL.EMPLOYEE_HOUSING };
    }

    case "developer_unsold":
      return { isExcluded: true, reason: COMPREHENSIVE_EXCL.DEVELOPER_UNSOLD };

    case "cultural_heritage":
      return { isExcluded: true, reason: COMPREHENSIVE_EXCL.CULTURAL_HERITAGE };

    case "religious":
      return { isExcluded: true, reason: COMPREHENSIVE_EXCL.RELIGIOUS_HOUSING };

    case "senior_welfare":
      return { isExcluded: true, reason: COMPREHENSIVE_EXCL.SENIOR_WELFARE_HOUSING };

    default:
      return { isExcluded: false, reason: COMPREHENSIVE_EXCL.NOT_APPLIED };
  }
}

// ============================================================
// 합산배제 일괄 판정 (T-05)
// ============================================================

export function applyAggregationExclusion(
  properties: PropertyForExclusion[],
  assessmentDate: Date,
): AggregationExclusionResult {
  const rentalTypes: ExclusionType[] = [
    "private_construction_rental",
    "private_purchase_rental_long",
    "private_purchase_rental_short",
    "public_support_construction_rental",
    "public_support_purchase_rental",
    "public_construction_rental",
    "public_purchase_rental",
    "existing_rental",
    "private_short_term_rental_6y_construction",
    "private_short_term_rental_6y_purchase",
    "unsold_purchase_rental",
    "vacant_construction_rental",
    "reit_purchase_rental",
    "public_conversion_pending_rental",
  ];

  const results: ExclusionResult[] = properties.map((prop) => {
    if (prop.exclusionType === "none") {
      return {
        propertyId: prop.propertyId,
        isExcluded: false,
        excludedValue: 0,
        exclusionType: "none" as const,
        reason: COMPREHENSIVE_EXCL.NOT_APPLIED,
      };
    }

    let validationResult: ExclusionValidationResult;

    if (rentalTypes.includes(prop.exclusionType)) {
      if (!prop.rentalInfo) {
        validationResult = {
          isExcluded: false,
          reason: COMPREHENSIVE_EXCL.NO_RENTAL_REGISTRATION,
        };
      } else {
        validationResult = validateRentalExclusion({
          ...prop.rentalInfo,
          assessmentDate,
        });
      }
    } else {
      if (!prop.otherInfo) {
        validationResult = {
          isExcluded: false,
          reason: COMPREHENSIVE_EXCL.NOT_APPLIED,
        };
      } else {
        validationResult = validateOtherExclusion(
          prop,
          prop.exclusionType,
          prop.otherInfo,
          assessmentDate,
        );
      }
    }

    return {
      propertyId: prop.propertyId,
      isExcluded: validationResult.isExcluded,
      excludedValue: validationResult.isExcluded ? prop.assessedValue : 0,
      exclusionType: prop.exclusionType,
      reason: validationResult.reason,
      failReasons: validationResult.failReasons,
      warnings: validationResult.warnings,
    };
  });

  const { totalExcludedValue, excludedCount } = results.reduce(
    (acc, r) =>
      r.isExcluded
        ? { totalExcludedValue: acc.totalExcludedValue + r.excludedValue, excludedCount: acc.excludedCount + 1 }
        : acc,
    { totalExcludedValue: 0, excludedCount: 0 },
  );

  return {
    propertyResults: results,
    totalExcludedValue,
    excludedCount,
    includedCount: results.length - excludedCount,
  };
}
