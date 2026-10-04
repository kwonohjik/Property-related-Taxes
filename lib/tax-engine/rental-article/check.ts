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
 *
 * Q-1(2026-09-30 대통령령 제36737호, 2026.10.1. 시행): 가목2)·나목2)·라목8)·마목4) 아파트 양도기한
 * (§167조의3⑪, 바닥 2027.12.31) 게이트 추가. 사목 base 검사(skipAptDeadline)·§155㉓ 경로
 * (skipAptTransferDeadlineGate)는 각자의 양도기한이 대체하므로 이 게이트에서 빠진다.
 *
 * Q-1 후속: 바닥 초과인데 ⑪ 연장 사실(세 호 날짜·「연장 사유 없음」 확인)이 전무하면 "모름" — 기한을 바닥
 * (2027.12.31.)으로 보고 실패 코드를 넣으면서 `ArticleCheckResult.aptDeadlinePending`을 세운다(호출부가 확인 필요
 * 고지 · 사용자 결정 2026-10-04 「모름은 불리 적용」 — 종전 #1910은 실패 코드 없이 종전 기준 유지였다).
 * 입력은 2호 명부 행·양도 주택·§155⑳ 임대주택 카드.
 */

import {
  rentalStdPriceCap,
  rentalRequiredYears,
  RA_CUT,
  judgeAptTransferDeadline,
  type AptDeadlinePendingReason,
  type AptTransferDeadlineExtension,
} from "./rules";
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
  | "SAMOK_BASE_REQUIRED"
  | "REQUIREMENTS_NOT_CONFIRMED"
  | "APT_TRANSFER_DEADLINE_EXCEEDED";

/** 사목 base 목 (§167조의3①2호 "가목 및 다목부터 마목까지") */
export type SaMokBaseArticle = "가" | "다" | "라" | "마";

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
  /**
   * 5%를 넘게 올린 임대차계약의 체결·갱신일(여럿이면 가장 늦은 날) — `rentIncreaseUnder5Pct`가 false일 때만 본다.
   * 가·다·마·바목 5%는 2019-02-12 이후 체결·갱신 계약분부터다(`isRentCapContractSubject`).
   */
  rentIncreaseContractDate?: Date;
  /** 양도일 — 2019-02-12 전 양도분에는 가·다·마·바목 5% 문언이 없었다. 미제공이면 이 게이트를 보지 않는다. */
  transferDate?: Date;
  /** 918 조정취득 배제 (마목 hard·아목 carve-out — 양 feature 공용, C4서 §155⑳도 이 필드로 통일) */
  isExcluded918Rule?: boolean;
  /** 아목 918 carve-out — 계약금 지급 증빙 */
  hasContractDepositProof?: boolean;
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
  /** 사목 base 목(가·다·라·마) — "해당 목의 다른 요건" 검증 대상 */
  saMokBaseArticle?: SaMokBaseArticle;
  /** 마·라목 2020.7.11 이후 등록 아파트 배제(다주택 자기선언 flag) */
  isExcludedAfter20200711Apt?: boolean;
  /** 마·바목 단기→장기 변경신고 배제 */
  isExcludedShortToLongChange?: boolean;
  /**
   * 가목2)·나목2)·라목8)·마목4) 양도기한(§167조의3⑪) 판정용 — 이 주택 자신의 양도일.
   * 다주택 중과는 양도 당사자 주택의 `transferDate`와 같은 값, §155⑳은 거주주택 양도일(ctx.transferDate)을
   * 쓴다. 미제공이면 이 게이트를 보지 않는다(날짜를 모르면 기한 위반으로 단정하지 않는다).
   */
  aptTransferDate?: Date;
  /** ⑪ 각 호 연장 사실(또는 「연장 사유 없음」 확인) — 전부 미제공(모름)이면 기한 = 바닥 + 확인 필요 고지. */
  aptDeadlineExtension?: AptTransferDeadlineExtension;
  /**
   * §155㉓(말소 후 5년 내 거주주택 양도 특례) 경로 전용 — 그 호의 가목2)·라목8)·마목4) 요건은
   * 적용하지 않는다(소령 §155㉓ 괄호, 대통령령 제36737호). 사목 경로는 opts.skipAptDeadline로
   * 별도 처리(사목 자체 양도기한이 적용되므로 이 플래그가 필요 없다).
   */
  skipAptTransferDeadlineGate?: boolean;
};

export type ArticleCheckResult = {
  passed: boolean;
  failCodes: ArticleFailCode[];
  requiredYears: number;
  stdPriceCap: number;
  /**
   * Q-1 후속 — 아파트·바닥(2027.12.31) 초과인데 ⑪ 연장 사실(세 호 전부)도 「연장 사유 없음」 확인도 없다(모름).
   * `failCodes`에 APT_TRANSFER_DEADLINE_EXCEEDED를 넣고(기한 = 바닥 · 불리 적용) 이 플래그로 호출부가
   * 확인 필요 고지(`aptDeadlineConfirmNotice("NO_FACT")`)를 낸다.
   */
  aptDeadlinePending: boolean;
  /**
   * ⑪3호 판정 보류 — 인가·지정일 · 이전고시일 · 단서(협의·수용재결·매도청구소송) 중 결론을 가른 미확인 사실
   * (`judgeAptTransferDeadline`의 NO_FACT 외 사유). 결론은 그 함수가 정한 대로 두고 호출부가 확인 필요 고지를 낸다.
   */
  aptDeadlineConfirmReasons: AptDeadlinePendingReason[];
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
  aptDeadlineGate?: boolean; // 가·나·라·마 (§167조의3⑪, 대통령령 제36737호)
};

const GATES: Record<SharedRentalArticle, ArticleGate> = {
  가: { priceAt: "rentalStart", fivePct: true, aptDeadlineGate: true },
  나: {
    priceAt: "acquisition",
    fivePct: false,
    bizRegDateMax: RA_CUT.Y2003_10_29,
    national: true,
    min2: true,
    aptDeadlineGate: true,
  },
  다: { priceAt: "rentalStart", fivePct: true, size: true, min2: true },
  라: {
    priceAt: "acquisition",
    fivePct: false,
    size: true,
    min5City: true,
    saleWindow: [RA_CUT.Y2008_06_11, RA_CUT.Y2009_06_30],
    nonCapitalOnly: true,
    aptDeadlineGate: true,
  },
  마: { priceAt: "rentalStart", fivePct: true, hard918: true, shortToLong: true, aptDeadlineGate: true },
  바: { priceAt: "rentalStart", fivePct: true, size: true, min2: true, shortToLong: true },
  사: { priceAt: "rentalStart", fivePct: false, cancellationOnly: true },
  아: { priceAt: "rentalStart", fivePct: true, regDateMin: RA_CUT.Y2025_06_04, apartmentBlanket: true, carveout918: true },
  자: { priceAt: "rentalStart", fivePct: true, regDateMin: RA_CUT.Y2025_06_04, apartmentBlanket: true, size: true, min2: true },
  구법: { priceAt: "rentalStart", fivePct: true },
};

/**
 * 대통령령 제29523호(2019.2.12.) 부칙 제6조 — 「제154조제1항제4호, 제155조제20항제2호 및 제167조의3제1항제2호
 * (제167조의10제1항제2호가 적용되는 경우를 포함한다)의 개정규정은 이 영 시행 이후 주택 임대차계약을 체결하거나
 * 기존 계약을 갱신하는 분부터 적용한다.」(MST 207800 부칙단위 실독 2026-09-29)
 *
 * 5% 문언(「임대보증금 또는 임대료의 연 증가율이 100분의 5를 초과하지 않는」)은 이 개정에서 **가·다·마·바목**에
 * 들어왔다(직전 시행본 MST 204914에는 없다). 아·자목(2025.6.4. 신설)의 5%는 그 개정의 부칙을 따르므로 대상이 아니다.
 * 사목은 base 목(가·다·마)의 5%를 그대로 본다.
 *
 * ⚠️ 이 날 이후 계약 중 **처음** 체결·갱신한 표준임대차계약은 비교 기준이다(서면-2021-법규재산-3399 ·
 *    서면-2020-부동산-3300 · 조심 2022서7263) — 그 계약의 증액은 사용자가 5% 선언에서 뺀다(화면 안내). 엔진은
 *    계약일만 본다.
 */
export const RENT_CAP_29523_ARTICLES: readonly SharedRentalArticle[] = ["가", "다", "마", "바"];

/** 그 체결·갱신일의 임대차계약에 가·다·마·바목 5% 요건이 걸리는가 (부칙<제29523호> 제6조) — 단일 술어. */
export function isRentCapContractSubject(contractDate: Date): boolean {
  return contractDate.getTime() >= RA_CUT.Y2019_02_12;
}

/**
 * 5% 미충족 선언이 실제로 요건 위반인가. 가·다·마·바목에서만 두 경계를 본다:
 * - 양도일이 2019-02-12 전 — 5% 문언이 없던 시행본(부칙 제2조② 「이 영 시행 이후 양도하는 분부터」).
 * - 초과 증액 계약(가장 늦은 것)이 2019-02-12 전 — 부칙 제6조.
 */
function isRentCapBreached(article: SharedRentalArticle, u: NormalizedRentalUnit): boolean {
  if (u.rentIncreaseUnder5Pct) return false;
  if (!RENT_CAP_29523_ARTICLES.includes(article)) return true;
  if (u.transferDate && !isRentCapContractSubject(u.transferDate)) return false;
  if (u.rentIncreaseContractDate && !isRentCapContractSubject(u.rentIncreaseContractDate)) return false;
  return true;
}

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

/** 사목 base 목 (가·다·라·마) — "해당 목의 다른 요건" 검증 대상. */
const SA_MOK_BASE: readonly SharedRentalArticle[] = ["가", "다", "라", "마"];

/**
 * 목별 요건 게이트 (사목 제외 — 등록기준일 경계·기간·기준시가·규모·호수·국민주택·아파트·918·단→장·5%룰).
 * opts.skipPeriod: 사목의 base 목 검사에서 임대기간요건만 면제(법령 "임대기간요건 외에 해당 목의 다른 요건").
 */
function checkArticleGates(
  article: SharedRentalArticle,
  u: NormalizedRentalUnit,
  opts: { skipPeriod?: boolean; skipAptDeadline?: boolean } = {},
): { fails: ArticleFailCode[]; aptDeadlinePending: boolean; aptDeadlineConfirmReasons: AptDeadlinePendingReason[] } {
  const gate = GATES[article];
  const effRegDate = deriveEffectiveRegDate(u.businessRegistrationDate, u.rentalRegistrationDate);
  const effTs = effRegDate?.getTime() ?? 0;
  const requiredYears = rentalRequiredYears(article, effTs);
  const stdPriceCap = rentalStdPriceCap(article, u.isCapitalArea, effTs);
  const fails: ArticleFailCode[] = [];

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

  // (c) 의무임대기간 (건설임대 분양전환 시 bypass · 사목 base 검사 시 면제)
  if (!opts.skipPeriod && u.rentalYears < requiredYears && !(gate.size && u.isConvertedToSale)) {
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

  // (j) 918 조정취득 배제 — 마목 hard(무조건) / 아목 carve-out(계약금 증빙 없으면 배제)
  if (gate.hard918 && u.isExcluded918Rule) fails.push("SHORT_TERM_REGULATED");
  if (gate.carveout918 && u.isExcluded918Rule && !u.hasContractDepositProof) fails.push("SHORT_TERM_REGULATED");

  // (k) 단기→장기 변경 배제 (마·바)
  if (gate.shortToLong && u.isExcludedShortToLongChange) fails.push("SHORT_TO_LONG_CHANGE");

  // (l) 5%룰·기타 요건 (나·라·사 제외) — 가·다·마·바는 부칙<제29523호> 제6조 적용 시기
  if (gate.fivePct && isRentCapBreached(article, u)) fails.push("REQUIREMENTS_NOT_CONFIRMED");

  // (m) 가목2)·나목2)·라목8)·마목4) 양도기한(§167조의3⑪, 대통령령 제36737호) — 아파트만.
  // 사목 base 검사(skipAptDeadline)·§155㉓ 경로(skipAptTransferDeadlineGate)는 각각 사목 자체
  // 양도기한·㉓ 괄호의 명시 비적용으로 대체되므로 이 게이트를 보지 않는다.
  let aptDeadlinePending = false;
  let aptDeadlineConfirmReasons: AptDeadlinePendingReason[] = [];
  if (
    gate.aptDeadlineGate &&
    u.isApartment &&
    !opts.skipAptDeadline &&
    !u.skipAptTransferDeadlineGate
  ) {
    const t = u.aptTransferDate?.getTime();
    if (t != null && !Number.isNaN(t)) {
      /**
       * Q-1 후속 — 바닥(2027.12.31)을 넘겼는데 ⑪ 연장 세 호(등록말소일·조정대상지역 신규지정 공고일·
       * 이전고시일)도 「연장 사유 없음」 확인도 없으면 기한을 바닥으로 보고 경과로 판정한다(사용자 결정
       * 2026-10-04 — 모르는 채 유리하게 적용하면 가산세 부담) + `aptDeadlinePending`으로 확인 필요 고지.
       * 사실이 있으면 정상 판정한다(기한 말일 민법 §161 연장 · 3호 인가 시점 · 단서 포함 —
       * `judgeAptTransferDeadline`). 3호 사실 중 결론을 가른 미확인분은 `aptDeadlineConfirmReasons`로 고지.
       */
      const verdict = judgeAptTransferDeadline(new Date(t), u.aptDeadlineExtension);
      if (!verdict.within) fails.push("APT_TRANSFER_DEADLINE_EXCEEDED");
      aptDeadlinePending = verdict.pending.includes("NO_FACT");
      aptDeadlineConfirmReasons = verdict.pending.filter((r) => r !== "NO_FACT");
    }
  }

  return { fails, aptDeadlinePending, aptDeadlineConfirmReasons };
}

/**
 * 목별 요건 검사. 미충족 사유를 모두 failCodes로 수집(§155⑳ 다중 사유 표시 보존).
 * 사목: 말소 게이트 + base 목(가·다·라·마) "해당 목의 다른 요건"(임대기간요건만 면제, §167조의3①2호 사목 단서).
 * 그 외: checkArticleGates.
 */
export function checkRentalArticle(
  article: SharedRentalArticle,
  u: NormalizedRentalUnit,
): ArticleCheckResult {
  const effRegDate = deriveEffectiveRegDate(u.businessRegistrationDate, u.rentalRegistrationDate);
  const effTs = effRegDate?.getTime() ?? 0;
  const requiredYears = rentalRequiredYears(article, effTs);
  const stdPriceCap = rentalStdPriceCap(article, u.isCapitalArea, effTs);
  const fails: ArticleFailCode[] = [];

  // (a) 등록 완비
  if (effRegDate === null) fails.push("BOTH_REG_REQUIRED");

  if (GATES[article].cancellationOnly) {
    // 사목 — 말소 게이트 + base 목 다른 요건(임대기간요건 면제)
    const cancelTs = u.rentalCancellationDate?.getTime();
    if (cancelTs == null || cancelTs < RA_CUT.Y2020_08_18) fails.push("RENTAL_TERMINATION_RESTRICTED");
    if (!u.hasHalfDutyPeriodMet) fails.push("RENTAL_TERMINATION_RESTRICTED");
    if (!u.isSoldWithin1YearOfCancellation) fails.push("RENTAL_TERMINATION_RESTRICTED");
    const base = u.saMokBaseArticle;
    if (base == null || !SA_MOK_BASE.includes(base)) {
      fails.push("SAMOK_BASE_REQUIRED");
    } else {
      // 사목 base 검사는 skipAptDeadline로 이 게이트 자체를 보지 않으므로 aptDeadlinePending은 항상 false.
      fails.push(...checkArticleGates(base, u, { skipPeriod: true, skipAptDeadline: true }).fails);
    }
    return {
      passed: fails.length === 0,
      failCodes: fails,
      requiredYears,
      stdPriceCap,
      aptDeadlinePending: false,
      aptDeadlineConfirmReasons: [],
    };
  }

  const gated = checkArticleGates(article, u);
  fails.push(...gated.fails);
  return {
    passed: fails.length === 0,
    failCodes: fails,
    requiredYears,
    stdPriceCap,
    aptDeadlinePending: gated.aptDeadlinePending,
    aptDeadlineConfirmReasons: gated.aptDeadlineConfirmReasons,
  };
}
