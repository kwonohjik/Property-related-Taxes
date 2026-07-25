/**
 * §167조의3①2호 목별 판정 canonical predicate — §155⑳·다주택 중과 공용 (Phase 2 C2·C3).
 *
 * checkRentalArticle: 정규화 입력(NormalizedRentalUnit) → 목별 요건 검사 →
 *   { passed, failCodes, requiredYears, stdPriceCap }.
 * §155⑳는 failCodes를 한국어 메시지로 매핑(eligibility.ts), 다주택은 passed만 사용(isLongTermRentalHousingExempt).
 *
 * C3: 다주택 checkRentalType_A~I(가~자 전 목)를 본 predicate로 흡수. 나·라·사목 게이트 추가.
 *   - 가·다목 등록상한(2018.4.2)은 §155⑳ derive(2020.7.11 경계)와 충돌 → 공용 predicate 미적용,
 *     다주택 isLongTermRentalHousingExempt-side 잔여 게이트로 유지.
 *   - 마목 아파트 = date-derived(§155⑳) OR isExcludedAfter20200711Apt(다주택) 결합.
 *   - 아목 918 = (isExcluded918Rule && !hasContractDepositProof)(다주택·C4 §155⑳) OR isRegulatedAreaNewAcq(§155⑳ C3).
 *
 * 판정 상수는 rules.ts 단일 소스. 아파트 제한은 isApartmentRestrictedForArticle 공용.
 */

import { rentalStdPriceCap, rentalRequiredYears, RA_CUT } from "./rules";
import type { SharedRentalArticle } from "./types";

/** 목별 요건 미충족 코드 (C3: 전 목·게이트 집합). */
export type ArticleFailCode =
  | "BOTH_REG_REQUIRED"
  | "REG_DATE_GATE"
  | "RENTAL_PERIOD_SHORT"
  | "STANDARD_PRICE_EXCEEDED"
  | "APARTMENT_RESTRICTED"
  | "SHORT_TERM_REGULATED"
  | "SHORT_TO_LONG_CHANGE"
  | "SIZE_REQUIRED"
  | "SIZE_EXCEEDED"
  | "MIN_UNITS_NOT_MET"
  | "NATIONAL_SIZE_REQUIRED"
  | "REGION_RESTRICTED"
  | "RENTAL_TERMINATION_RESTRICTED"
  | "REQUIREMENTS_NOT_CONFIRMED";

/** 두 feature 어댑터가 채우는 정규화 입력 (필드명 차이 흡수). */
export type NormalizedRentalUnit = {
  /** 세무서 §168 사업자등록일 (나목 게이트 ≤2003.10.29·등록완비 판정) */
  businessRegistrationDate: Date | null;
  /** 지자체 민특법§5 임대사업자등록신청일 */
  rentalRegistrationDate: Date | null;
  /** 수도권 여부 (다주택 region==="capital" / §155⑳ region==="seoul-metro" 정규화) */
  isCapitalArea: boolean;
  isApartment: boolean;
  /** 임대개시일 기준시가 (원) */
  rentalStartOfficialPrice: number;
  /** 취득당시 기준시가 (원) — 나·라목 cap 측정시점 */
  acquisitionOfficialPrice: number;
  /** 실제 임대연수 (분수 허용 — §155⑳ rentalMonths/12) */
  rentalYears: number;
  landAreaM2?: number;
  totalFloorAreaM2?: number;
  hasMinimum2Units: boolean;
  /** 같은 시·군 5호+ (라목) */
  hasMinimum5UnitsInCity?: boolean;
  /** 국민주택규모 (나목) */
  isNationalSizeHousing?: boolean;
  /** 5%룰 (§155⑳는 requirementsConfirmed 묶음에서 매핑) */
  rentIncreaseUnder5Pct: boolean;
  /** 918 조정취득 배제 (마목 hard·아목 carve-out) */
  isExcluded918Rule?: boolean;
  /** 아목 918 carve-out — 계약금 지급 증빙 */
  hasContractDepositProof?: boolean;
  /** §155⑳ 아목 게이트(C3 유지·C4서 isExcluded918Rule로 rename) */
  isRegulatedAreaNewAcq?: boolean;
  /** 라목 최초 분양계약일 */
  firstSaleContractDate?: Date;
  /** 다·바목 분양전환 (의무기간 bypass) */
  isConvertedToSale?: boolean;
  /** 사목 자진·자동 말소일 */
  rentalCancellationDate?: Date;
  /** 사목 의무기간 1/2+ 충족 */
  hasHalfDutyPeriodMet?: boolean;
  /** 사목 말소 후 1년 내 양도 */
  isSoldWithin1YearOfCancellation?: boolean;
  /** 마·라목 2020.7.11 이후 등록 아파트 배제(다주택 자기선언 flag) */
  isExcludedAfter20200711Apt?: boolean;
  /** 마·바목 단기→장기 변경신고 배제 */
  isExcludedShortToLongChange?: boolean;
};

export type ArticleCheckResult = {
  passed: boolean;
  failCodes: ArticleFailCode[];
  requiredYears: number;
  stdPriceCap: number;
};

/** 목별 게이트 메타 (판정 순서 제어). 숫자 상한(cap·기간)은 rules.ts 위임. */
type ArticleGate = {
  priceAt: "rentalStart" | "acquisition";
  fivePct: boolean;
  size?: boolean;
  min2?: boolean;
  min5City?: boolean;
  national?: boolean;
  apartmentBlanket?: boolean; // 아·자
  regDateMin?: number; // 아·자
  bizRegDateMax?: number; // 나 (biz기준)
  saleWindow?: readonly [number, number]; // 라
  nonCapitalOnly?: boolean; // 라
  hard918?: boolean; // 마
  carveout918?: boolean; // 아
  shortToLong?: boolean; // 마·바
  cancellationOnly?: boolean; // 사 — period/price/size 등 skip
};

const GATES: Record<SharedRentalArticle, ArticleGate> = {
  가: { priceAt: "rentalStart", fivePct: true },
  나: { priceAt: "acquisition", fivePct: false, bizRegDateMax: RA_CUT.Y2003_10_29, national: true, min2: true },
  다: { priceAt: "rentalStart", fivePct: true, size: true, min2: true },
  라: {
    priceAt: "acquisition",
    fivePct: false,
    size: true,
    min5City: true,
    saleWindow: [RA_CUT.Y2008_06_11, RA_CUT.Y2009_06_30],
    nonCapitalOnly: true,
  },
  마: { priceAt: "rentalStart", fivePct: true, hard918: true, shortToLong: true },
  바: { priceAt: "rentalStart", fivePct: true, size: true, min2: true, shortToLong: true },
  사: { priceAt: "rentalStart", fivePct: false, cancellationOnly: true },
  아: { priceAt: "rentalStart", fivePct: true, regDateMin: RA_CUT.Y2025_06_04, apartmentBlanket: true, carveout918: true },
  자: { priceAt: "rentalStart", fivePct: true, regDateMin: RA_CUT.Y2025_06_04, apartmentBlanket: true, size: true, min2: true },
  구법: { priceAt: "rentalStart", fivePct: true },
};

/** 건설임대(다·바·자) — perUnitVerdict.sizeRequired 표시용(§155⑳ 도출 목 한정). */
export function isConstructionArticle(article: SharedRentalArticle): boolean {
  return article === "다" || article === "바" || article === "자";
}

/** 등록기준일 = max(세무서, 지자체). 하나라도 null/Invalid이면 null(사업자등록등 미완비). */
function deriveEffectiveRegDate(biz: Date | null, rent: Date | null): Date | null {
  const b = biz?.getTime?.();
  const r = rent?.getTime?.();
  if (b == null || r == null || Number.isNaN(b) || Number.isNaN(r)) return null;
  return new Date(Math.max(b, r));
}

/**
 * 아파트 등록 제한 (§167조의3①2호 목별 — 다주택 checkRentalType_* 정합).
 * - 단기(아/자): blanket 제외.
 * - 매입 장기(가/마): 등록기준일 ≥ 2020.7.11 & 아파트 → 제한.
 * - 건설 장기(다/바)·구법·나: 일반 아파트 허용(다주택 checkRentalType_C/F에 isApartment 검사 없음).
 *   ※ 마·라 단기→장기/2020.7.11 이후 등록 아파트 배제는 isExcludedAfter20200711Apt 별도 flag(checkRentalArticle에서 결합).
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
 * 사목(cancellationOnly)은 말소 게이트만; 그 외는 등록·기간·기준시가·규모·아파트·특수배제·5%룰.
 */
export function checkRentalArticle(
  article: SharedRentalArticle,
  u: NormalizedRentalUnit,
): ArticleCheckResult {
  const gate = GATES[article];
  const effRegDate = deriveEffectiveRegDate(u.businessRegistrationDate, u.rentalRegistrationDate);
  const effTs = effRegDate?.getTime() ?? 0;
  const requiredYears = rentalRequiredYears(article, effTs);
  const stdPriceCap = rentalStdPriceCap(article, u.isCapitalArea, effTs);
  const fails: ArticleFailCode[] = [];

  // (a) 등록 완비
  if (effRegDate === null) fails.push("BOTH_REG_REQUIRED");

  // 사목 — 말소 게이트만 (period/price/size/apartment/5%룰 skip)
  if (gate.cancellationOnly) {
    const cancelTs = u.rentalCancellationDate?.getTime();
    if (cancelTs == null || cancelTs < RA_CUT.Y2020_08_18) fails.push("RENTAL_TERMINATION_RESTRICTED");
    if (!u.hasHalfDutyPeriodMet) fails.push("RENTAL_TERMINATION_RESTRICTED");
    if (!u.isSoldWithin1YearOfCancellation) fails.push("RENTAL_TERMINATION_RESTRICTED");
    return { passed: fails.length === 0, failCodes: fails, requiredYears, stdPriceCap };
  }

  // (b) 등록기준일 경계 게이트
  if (gate.regDateMin != null && effTs < gate.regDateMin) fails.push("REG_DATE_GATE"); // 아·자
  if (gate.bizRegDateMax != null) {
    const bizTs = u.businessRegistrationDate?.getTime();
    if (bizTs == null || bizTs > gate.bizRegDateMax) fails.push("REG_DATE_GATE"); // 나(biz기준)
  }
  if (gate.saleWindow) {
    const scTs = u.firstSaleContractDate?.getTime();
    if (scTs == null || scTs < gate.saleWindow[0] || scTs > gate.saleWindow[1]) fails.push("REG_DATE_GATE"); // 라
  }

  // (c) 의무임대기간 (건설임대 분양전환 시 bypass)
  if (u.rentalYears < requiredYears && !(gate.size && u.isConvertedToSale)) {
    fails.push("RENTAL_PERIOD_SHORT");
  }

  // (d) 기준시가 상한 (측정시점 분기)
  const price = gate.priceAt === "acquisition" ? u.acquisitionOfficialPrice : u.rentalStartOfficialPrice;
  if (price > stdPriceCap) fails.push("STANDARD_PRICE_EXCEEDED");

  // (e) 라목 — 비수도권만
  if (gate.nonCapitalOnly && u.isCapitalArea) fails.push("REGION_RESTRICTED");

  // (f) 규모 (건설·라)
  if (gate.size) {
    if (u.landAreaM2 == null || u.totalFloorAreaM2 == null) fails.push("SIZE_REQUIRED");
    else if (u.landAreaM2 > 298 || u.totalFloorAreaM2 > 149) fails.push("SIZE_EXCEEDED");
  }

  // (g) 호수
  if (gate.min2 && !u.hasMinimum2Units) fails.push("MIN_UNITS_NOT_MET");
  if (gate.min5City && !u.hasMinimum5UnitsInCity) fails.push("MIN_UNITS_NOT_MET");

  // (h) 국민주택규모 (나)
  if (gate.national && !u.isNationalSizeHousing) fails.push("NATIONAL_SIZE_REQUIRED");

  // (i) 아파트 — 아·자 blanket / 가·마 date / 마·라 flag 결합
  const aptRestricted =
    isApartmentRestrictedForArticle(article, effRegDate, u.isApartment) ||
    (!!u.isExcludedAfter20200711Apt && (article === "마" || article === "라"));
  if (aptRestricted) fails.push("APARTMENT_RESTRICTED");

  // (j) 918 조정취득 배제 — 마목 hard / 아목 carve-out / §155⑳ 아목 isRegulatedAreaNewAcq(C3)
  if (gate.hard918 && u.isExcluded918Rule) fails.push("SHORT_TERM_REGULATED");
  if (gate.carveout918 && u.isExcluded918Rule && !u.hasContractDepositProof) fails.push("SHORT_TERM_REGULATED");
  if (article === "아" && u.isRegulatedAreaNewAcq) fails.push("SHORT_TERM_REGULATED");

  // (k) 단기→장기 변경 배제 (마·바)
  if (gate.shortToLong && u.isExcludedShortToLongChange) fails.push("SHORT_TO_LONG_CHANGE");

  // (l) 5%룰·기타 요건 (나·라·사 제외)
  if (gate.fivePct && !u.rentIncreaseUnder5Pct) fails.push("REQUIREMENTS_NOT_CONFIRMED");

  return { passed: fails.length === 0, failCodes: fails, requiredYears, stdPriceCap };
}
