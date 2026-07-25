/**
 * §167조의3①2호 목별 판정 canonical predicate — §155⑳·다주택 중과 공용 (Phase 2 C2).
 *
 * checkRentalArticle: 정규화 입력(NormalizedRentalUnit) → 목별 요건 검사 →
 *   { passed, failCodes, requiredYears, stdPriceCap }.
 * §155⑳는 failCodes를 한국어 메시지로 매핑(eligibility.ts), 다주택은 passed만 사용(C3 예정).
 *
 * 판정 상수는 rules.ts 단일 소스. 아파트 제한은 isApartmentRestrictedForArticle 공용.
 */

import { rentalStdPriceCap, rentalRequiredYears, RA_CUT } from "./rules";
import type { SharedRentalArticle } from "./types";

/** 목별 요건 미충족 코드 (C2: §155⑳ 현행 코드 집합. 나·U1/U2 코드는 C4 확장). */
export type ArticleFailCode =
  | "BOTH_REG_REQUIRED"
  | "RENTAL_PERIOD_SHORT"
  | "STANDARD_PRICE_EXCEEDED"
  | "APARTMENT_RESTRICTED"
  | "SHORT_TERM_REGULATED"
  | "SIZE_REQUIRED"
  | "SIZE_EXCEEDED"
  | "MIN_UNITS_NOT_MET"
  | "REQUIREMENTS_NOT_CONFIRMED";

/** 두 feature 어댑터가 채우는 정규화 입력 (필드명 차이 흡수). */
export type NormalizedRentalUnit = {
  /** max(세무서, 지자체) 등록기준일. null = 사업자등록등 미완비. */
  effectiveRegDate: Date | null;
  /** 수도권 여부 (다주택 region==="capital" / §155⑳ region==="seoul-metro" 정규화) */
  isCapitalArea: boolean;
  isApartment: boolean;
  /** 임대개시일 기준시가 (원) */
  rentalStartOfficialPrice: number;
  /** 실제 임대연수 (분수 허용 — §155⑳ rentalMonths/12) */
  rentalYears: number;
  landAreaM2?: number;
  totalFloorAreaM2?: number;
  hasMinimum2Units: boolean;
  /** 아목 게이트: 조정대상지역 신규취득 (§155⑳ isRegulatedAreaNewAcq) */
  isRegulatedAreaNewAcq: boolean;
  /** 5%룰 (§155⑳는 requirementsConfirmed 묶음에서 매핑) */
  rentIncreaseUnder5Pct: boolean;
};

export type ArticleCheckResult = {
  passed: boolean;
  failCodes: ArticleFailCode[];
  requiredYears: number;
  stdPriceCap: number;
};

/** 건설임대(다·바·자) — 규모·호수 요건 대상. */
export function isConstructionArticle(article: SharedRentalArticle): boolean {
  return article === "다" || article === "바" || article === "자";
}

/**
 * 아파트 등록 제한 (§167조의3①2호 목별 — 다주택 checkRentalType_* 정합).
 * - 단기(아/자): blanket 제외.
 * - 매입 장기(가/마): 등록기준일 ≥ 2020.7.11 & 아파트 → 제한.
 * - 건설 장기(다/바)·구법: 일반 아파트 허용(F6 — 다주택 checkRentalType_C/F에 isApartment 검사 없음).
 *   ※ 바목 단기→장기 변경 아파트 제외는 isExcludedShortToLongChange 별도 입력 — C4.
 */
export function isApartmentRestrictedForArticle(
  article: SharedRentalArticle,
  effectiveRegDate: Date | null,
  isApartment: boolean,
): boolean {
  if (!isApartment) return false;
  if (article === "아" || article === "자") return true;
  if (article === "가" || article === "마") {
    return (effectiveRegDate?.getTime() ?? 0) >= RA_CUT.Y2020_07_11;
  }
  return false;
}

/**
 * 목별 요건 검사. 미충족 사유를 모두 failCodes로 수집(§155⑳ 다중 사유 표시 보존).
 * 순서: 등록완비 → 기간 → 기준시가 → 아파트 → 아목조정 → 규모·호수 → 5%룰.
 */
export function checkRentalArticle(
  article: SharedRentalArticle,
  u: NormalizedRentalUnit,
): ArticleCheckResult {
  const effTs = u.effectiveRegDate?.getTime() ?? 0;
  const requiredYears = rentalRequiredYears(article, effTs);
  const stdPriceCap = rentalStdPriceCap(article, u.isCapitalArea, effTs);
  const fails: ArticleFailCode[] = [];

  if (u.effectiveRegDate === null) fails.push("BOTH_REG_REQUIRED");
  if (u.rentalYears < requiredYears) fails.push("RENTAL_PERIOD_SHORT");
  if (u.rentalStartOfficialPrice > stdPriceCap) fails.push("STANDARD_PRICE_EXCEEDED");
  if (isApartmentRestrictedForArticle(article, u.effectiveRegDate, u.isApartment)) {
    fails.push("APARTMENT_RESTRICTED");
  }
  if (article === "아" && u.isRegulatedAreaNewAcq) fails.push("SHORT_TERM_REGULATED");
  if (isConstructionArticle(article)) {
    if (u.landAreaM2 == null || u.totalFloorAreaM2 == null) fails.push("SIZE_REQUIRED");
    else if (u.landAreaM2 > 298 || u.totalFloorAreaM2 > 149) fails.push("SIZE_EXCEEDED");
    if (!u.hasMinimum2Units) fails.push("MIN_UNITS_NOT_MET");
  }
  if (!u.rentIncreaseUnder5Pct) fails.push("REQUIREMENTS_NOT_CONFIRMED");

  return { passed: fails.length === 0, failCodes: fails, requiredYears, stdPriceCap };
}
