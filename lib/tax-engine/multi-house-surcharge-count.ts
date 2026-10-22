/**
 * 다주택 중과세 — 주택 수 산정군 (Layer 2 내부 모듈)
 *
 * multi-house-surcharge-helpers.ts 800줄 정책 분할(-count, 2026-06):
 *   - 지역기준/가액기준 자동 분류 (classifyRegionCriteriaByCode)
 *   - 장기임대주택 유형 A~I 세부 판정
 *   - 소형 신축·미분양·조특법 임대 배제 판정
 *   - 주택 수 산정 (countEffectiveHouses)
 *
 * 의존: 단방향(-exclusion → -count). 본 파일은 -exclusion을 import하지 않음(순환 0).
 */

import { rentalCancellationStatus } from "./rental-cancellation-deeming";
import { differenceInYears } from "date-fns";
import { MULTI_HOUSE } from "./legal-codes";
import { isWithinDeadline } from "./civil-period";
import { isSmallNewHouseSpecial, resolvePopulationDeclineSecondHome } from "./multi-house-surcharge-12ho";
import { isCapitalAreaHouse } from "./multi-house-surcharge-12ho";
import { checkRentalArticle, type NormalizedRentalUnit } from "./rental-article/check";
import {
  RA_CUT,
  APT_TRANSFER_DEADLINE_FLOOR,
  judgeAptTransferDeadline,
  type AptDeadlinePendingReason,
} from "./rental-article/rules";
import { passesHouseholdGate } from "./transfer-inheritance-exclusion";
import { passesRankingGate } from "./transfer-inheritance-exclusion";
import { isHeirInheritedHouse } from "./transfer-inheritance-exclusion";
import { presaleRightDefinitionAcquisitionDate } from "./presale-right-definition-date";
import type { SharedRentalArticle } from "./rental-article/types";
import type {
  RentalHousingType,
  HouseInfo,
  PresaleRight,
  ExcludedHouse,
  HouseCountExclusionRules,
} from "./types/multi-house-surcharge.types";

// §167의3①12호 가~라목 판정은 ./multi-house-surcharge-12ho.ts(2026-10-20 분리) — 기존 import 경로 유지용 재수출.
export { isSmallNewHouseSpecial, resolvePopulationDeclineSecondHome };

// ============================================================
// 지역기준/가액기준 자동 분류 (소령 §167-3 Stage 2)
// ============================================================

/**
 * 시군구코드(5자리)로 지역기준/가액기준을 자동 분류한다.
 *
 * - REGION: 수도권(서울·인천·경기 주요지역)·광역시(군 제외)·세종 → 가액 불문 주택 수 산입
 * - VALUE:  지방 및 수도권 내 군 지역 → 양도 공시가 3억 초과만 산입
 */
/**
 * 전남광주통합특별시의 **자치구** 5개 (종전 광주광역시 자치구).
 * 시·군(목포·여수·순천·나주·광양 + 군 17)은 종전 전라남도와 같이 가액기준(VALUE)이다.
 */
const INTEGRATED_GWANGJU_DISTRICT_CODES = new Set([
  "12210", // 동구
  "12240", // 서구
  "12270", // 남구
  "12300", // 북구
  "12330", // 광산구
]);

/**
 * 법정동코드 10자리가 **읍·면**(또는 그 아래 리)인가. 10자리 미만은 판정할 수 없다(null).
 *
 * 읍·면·동 3자리(6~8번째)가 250 이상이면 읍·면이다 — 행안부 「법정동코드 전체자료」(공공데이터포털 15063424,
 * 2026-10-22 내려받음) 읍·면·동 5,067건 전수 대조에서 예외 0건(동 3,656 < 250 · 읍 237·면 1,174 ≥ 250).
 * 면에서 승격한 읍은 면 코드(3xx)를 그대로 쓴다. 리가 있는 코드도 전부 읍·면 아래다.
 */
export function isEupMyeonByRegionCode(regionCode: string | undefined): boolean | null {
  if (!regionCode || regionCode.length < 10) return null;
  return Number(regionCode.slice(5, 8)) >= 250;
}

/**
 * 영 §167의3①1호 지역기준(REGION)·가액기준(VALUE)의 **이유** — 다주택 중과 판정 메뉴 표 ①·설명문(계획서 §4.4).
 * `classifyRegionCriteriaByCode`는 이 함수의 `criteria`다(분기 하나 — 이유와 결론이 갈라지지 않게).
 */
export type RegionCriteriaReason =
  | "no_code" // 코드 없음 — 가액기준으로 본다(호출부가 수동 지역 구분·「주소 미입력」을 따로 다룬다)
  | "eup_myeon" // 「지방자치법」 §3③④·세종시법 §6③의 읍·면
  | "seoul"
  | "capital_city" // 경기 시(동)
  | "capital_county" // 경기 군(연천·가평·양평)
  | "metro_district" // 광역시·통합특별시 자치구(인천 포함)
  | "metro_county" // 광역시에 소속된 군
  | "sejong" // 세종 동
  | "integrated_si_gun" // 전남광주통합특별시의 시·군
  | "province"; // 그 밖의 도

export interface RegionCriteriaDetail {
  criteria: "REGION" | "VALUE";
  reason: RegionCriteriaReason;
}

export function classifyRegionCriteriaByCode(regionCode: string): "REGION" | "VALUE" {
  return classifyRegionCriteriaDetail(regionCode).criteria;
}

export function classifyRegionCriteriaDetail(regionCode: string): RegionCriteriaDetail {
  if (!regionCode || regionCode.length < 2) return { criteria: "VALUE", reason: "no_code" };

  // §167의3①1호 괄호 — 「지방자치법」 제3조제3항·제4항의 읍·면(군·도농복합시)과 세종시법 제6조제3항의 읍·면은
  //   지역기준에서 빠진다. 아래 시도·군 분기는 5자리만 보므로 경기 시의 읍·면·세종 읍·면을 놓쳤다(2026-10-22 정정 —
  //   docs/00-pm/multi-house-surcharge-eupmyeon-region.plan.md). 광역시 자치구에는 읍·면이 없다(같은 전체자료 실측).
  if (isEupMyeonByRegionCode(regionCode)) return { criteria: "VALUE", reason: "eup_myeon" };

  const sidoCode = regionCode.substring(0, 2);
  const sggCode = regionCode.substring(0, 5);

  if (sidoCode === "11") return { criteria: "REGION", reason: "seoul" }; // 서울

  // 인천: 강화군(28710)·옹진군(28720) VALUE, 나머지 REGION
  if (sidoCode === "28") {
    if (sggCode === "28710" || sggCode === "28720") return { criteria: "VALUE", reason: "metro_county" };
    return { criteria: "REGION", reason: "metro_district" };
  }

  // 경기: 연천군(41800)·가평군(41820)·양평군(41830) VALUE, 나머지 REGION
  //
  // 2026-08-01 정정(계획서 D-6 — **세액 변경**): 연천군 코드가 `41810`으로 적혀 있었다.
  //   `41810`은 **연천군이 아니라 폐지된 「경기도 포천군」**이다(행안부 법정동코드 전체자료
  //   실측 — Y-5. 포천은 1인시 승격으로 현재 `41650` 포천시). 연천군은 `41800`이다.
  //   같은 저장소의 `data/population-decline-areas.ts:32`는 `41800`으로
  //   **맞게** 적혀 있었으니, 한 저장소 안에서 두 파일이 다른 코드를 쓰고 있었던 셈이다.
  //   그 결과 경기 3군 중 연천군만 아래 기본값이 아니라 이 분기의 `return "REGION"`으로
  //   떨어져 **3억 이하 주택도 가액 불문 주택 수에 산입**됐다(납세자 불리).
  //   기존 회귀 테스트도 `classifyRegionCriteriaByCode("41810")`으로 **오류를 고정**하고
  //   있어 안전망에 걸리지 않았다 — 코드 리터럴 전수 대조 anchor를 함께 도입한 이유다
  //   (`__tests__/tax-engine/transfer/sigungu-code-literal-audit.anchor.test.ts`).
  if (sidoCode === "41") {
    if (sggCode === "41800" || sggCode === "41820" || sggCode === "41830") return { criteria: "VALUE", reason: "capital_county" };
    return { criteria: "REGION", reason: "capital_city" };
  }

  // 부산: 기장군(26710) VALUE
  if (sidoCode === "26") {
    if (sggCode === "26710") return { criteria: "VALUE", reason: "metro_county" };
    return { criteria: "REGION", reason: "metro_district" };
  }

  // 대구: 달성군(27710)·군위군(27720) VALUE
  //
  // 2026-07-29 정정(#591 감사 R7 — **세액 변경**): 군위군(27720) 누락.
  //   군위군은 2023.7.1. 경상북도 → **대구광역시**로 편입되며 코드가 47720 → 27720으로 바뀌었다.
  //   그전에는 sido 47(경북)이라 아래 기본값 VALUE로 떨어졌는데, 편입 후 대구 분기에 걸리면서
  //   **REGION으로 뒤집혔다** — 행정구역 개편이 세법상 취급을 바꿔버린 셈이다.
  //   §167의3①은 지역기준에서 **'광역시에 소속된 군'을 제외**한다(이 함수 상단 주석도
  //   "광역시(**군 제외**)"로 이미 그렇게 적고 있다). 형제 광역시 군이 전부 VALUE인 것과도 일치한다:
  //   부산 기장 26710 · 대구 달성 27710 · 울산 울주 31710 · 인천 강화 28710 · 옹진 28720.
  //   REGION이면 가액 불문 주택 수에 산입돼 1주택↔2주택이 뒤바뀌고 중과(+20%p) on/off가
  //   갈린다(납세자 불리 방향).
  //   편입 전(47720)·후(27720) 코드 모두 VALUE로 수렴하므로 시점 게이팅은 불필요하다.
  if (sidoCode === "27") {
    if (sggCode === "27710" || sggCode === "27720") return { criteria: "VALUE", reason: "metro_county" };
    return { criteria: "REGION", reason: "metro_district" };
  }

  if (sidoCode === "29") return { criteria: "REGION", reason: "metro_district" }; // 구 광주광역시 (통합 전 코드 — 저장된 이력·수동 입력)
  if (sidoCode === "30") return { criteria: "REGION", reason: "metro_district" }; // 대전

  // 전남광주통합특별시(12): **자치구만** REGION, 시·군은 VALUE.
  //
  //   「전남광주통합특별시 설치를 위한 특별법」(시행 2026-07-01) §7①이 전라남도와
  //   광주광역시를 **폐지**하고 통합특별시를 설치하면서 두 지역의 코드가 `12`로 합쳐졌다.
  //   그 결과 종전에 REGION이던 광주 자치구와 VALUE이던 전남 시·군이 한 시도코드에 섞였다.
  //
  //   §167의3①1호는 「수도권 및 광역시·특별자치시(**광역시에 소속된 군** … 제외) 외의 지역」을
  //   가액기준으로 정한다 — **구는 지역기준, 군은 가액기준**이라는 구조다.
  //   2026-08-01 세무 판단: 통합 전 실질 취급을 그대로 옮겨 **자치구 5개만** REGION으로 본다.
  //
  //   ⚠️ 이 분기가 없으면 `12xxx`가 아래 기본값 VALUE로 **조용히** 떨어져 광주 자치구
  //   3억 이하 주택이 주택 수에서 빠졌다(계획서 D-4 — 실측 세액 차 388,410,000).
  //   같은 파일의 군위군(47720→27720) 주석이 지적한 「행정구역 개편이 세법상 취급을
  //   바꿔버리는」 함정이 재발한 것이다.
  if (sidoCode === "12") {
    return INTEGRATED_GWANGJU_DISTRICT_CODES.has(sggCode)
      ? { criteria: "REGION", reason: "metro_district" }
      : { criteria: "VALUE", reason: "integrated_si_gun" };
  }

  // 울산: 울주군(31710) VALUE
  if (sidoCode === "31") {
    if (sggCode === "31710") return { criteria: "VALUE", reason: "metro_county" };
    return { criteria: "REGION", reason: "metro_district" };
  }

  if (sidoCode === "36") return { criteria: "REGION", reason: "sejong" }; // 세종

  // 기타 도 지역: VALUE
  return { criteria: "VALUE", reason: "province" };
}

// ============================================================
// 장기임대주택 유형별 판정 (가목~자목, A~I)
// 소령 §167-3 ① 2호
// ============================================================

export function calcRentalPeriodYears(house: HouseInfo): number {
  if (house.rentalPeriodYears != null) return house.rentalPeriodYears;
  if (house.rentalStartDate && house.rentalEndDate) {
    // 임대기간은 §167의3③ → 조특령 §97 준용이라 E-11(초일 규칙) 범위 밖이다 — 계획서 Q-2(근거 확인 전 유지).
    return differenceInYears(house.rentalEndDate, house.rentalStartDate);
  }
  return 0;
}

/**
 * 「사업자등록등 완비」 원시 술어 — **UI(⑤)와 엔진이 공유한다**.
 *
 * 🔴 UI의 9유형(가~자목) 매트릭스는 「임대사업자 정식 등록」 토글 **밖**에 놓여 있어,
 *    등록이 비어 있어도 유형을 다 채울 수 있다. 그런데 아래 `isLongTermRentalHousingExempt`가
 *    이 술어에서 `false`를 내면 중과배제가 **침묵 미적용**된다(R20). 화면이 그 사실을
 *    말하려면 같은 술어를 봐야 한다 — 날짜 타입이 달라(엔진 Date / 폼 string) 원시값을 받는다.
 */
export function hasRentalBasicRegistration(
  isRegisteredRental: unknown,
  rentalRegistrationDate: unknown,
  businessRegistrationDate: unknown,
): boolean {
  return !!(isRegisteredRental && rentalRegistrationDate && businessRegistrationDate);
}

function hasBasicRegistration(house: HouseInfo): boolean {
  return hasRentalBasicRegistration(
    house.isRegisteredRental,
    house.rentalRegistrationDate,
    house.businessRegistrationDate,
  );
}

/** 다주택 유형 A~I ↔ §167조의3①2호 가~자목 (실측 getRentalTypeLabel 정합). ⑤·④ 게이트도 이 표를 쓴다. */
export const ARTICLE_BY_RENTAL_TYPE: Record<RentalHousingType, SharedRentalArticle> = {
  A: "가", B: "나", C: "다", D: "라", E: "마", F: "바", G: "사", H: "아", I: "자",
};

/** HouseInfo → 공용 정규화 입력 (Phase 2 C3 — checkRentalArticle 위임). */
function toNormalizedFromHouse(house: HouseInfo, transferDate: Date): NormalizedRentalUnit {
  return {
    businessRegistrationDate: house.businessRegistrationDate ?? null,
    rentalRegistrationDate: house.rentalRegistrationDate ?? null,
    isCapitalArea: isCapitalAreaHouse(house),
    isApartment: house.isApartment,
    rentalStartOfficialPrice: house.rentalStartOfficialPrice ?? house.officialPrice,
    acquisitionOfficialPrice: house.acquisitionOfficialPrice ?? house.officialPrice,
    rentalYears: calcRentalPeriodYears(house),
    landAreaM2: house.landArea,
    totalFloorAreaM2: house.totalFloorArea,
    hasMinimum2Units: house.hasMinimum2Units ?? false,
    hasMinimum5UnitsInCity: house.hasMinimum5UnitsInCity,
    isNationalSizeHousing: house.isNationalSizeHousing,
    rentIncreaseUnder5Pct: house.rentIncreaseUnder5Pct ?? false,
    rentIncreaseContractDate: house.rentIncreaseContractDate, // 부칙<제29523호> 제6조
    transferDate,
    isExcluded918Rule: house.isExcluded918Rule,
    hasContractDepositProof: house.hasContractDepositProof,
    firstSaleContractDate: house.firstSaleContractDate,
    isConvertedToSale: house.isConvertedToSale,
    rentalCancellationDate: house.rentalCancellationDate,
    hasHalfDutyPeriodMet: house.hasHalfDutyPeriodMet,
    isSoldWithin1YearOfCancellation: house.isSoldWithin1YearOfCancellation,
    isExcludedAfter20200711Apt: house.isExcludedAfter20200711Apt,
    isExcludedShortToLongChange: house.isExcludedShortToLongChange,
    saMokBaseArticle: house.saMokBaseArticle, // 사목 base 목 "해당 목의 다른 요건"
    // 아목 918 게이트는 양 feature 공용 isExcluded918Rule + hasContractDepositProof(carve-out)로 통일(C4).
    // Q-1 — 가목2)·나목2)·라목8)·마목4) 아파트 양도기한(§167조의3⑪). 이 house 자신의 양도일로 판정
    // (사목 base 검사는 check.ts opts.skipAptDeadline으로 자동 면제 — 별도 플래그 불필요).
    aptTransferDate: transferDate,
    // ⑪ 연장 사실 — 2호 칸(`rentalAptDeadlineExtension`). 3호 칸(`taxIncentiveRentalAptDeadlineExtension`)과 별개.
    aptDeadlineExtension: house.rentalAptDeadlineExtension,
  };
}

/**
 * 유형(가~자목) 미선택 입력의 의무임대기간 — 최단 목(가·나·다·라목)의 5년.
 *
 * 유형을 고르지 않은 입력에 목을 추정해 붙일 수는 없으므로, **가장 관대한 목**의 기간을 쓴다.
 * (마·바목 10년 · 아·자목 6년보다 짧으니 어느 목이든 이 문턱은 넘어야 한다.)
 */
const LEGACY_RENTAL_YEARS = 5;

/**
 * ② 장기임대주택 중과배제 여부 (가~자목 유형별 검증 — 공용 checkRentalArticle 위임, Phase 2 C3).
 * rentalType 미제공 시 legacy 판정(등록 완비 + 5년)으로 폴백.
 */
export function isLongTermRentalHousingExempt(house: HouseInfo, transferDate: Date): boolean {
  if (!house.isLongTermRental) return false;

  // 양도일 전 말소 — 자동말소(가·다~마목)만 §167의3①2호 단서로 임대기간요건을 갖춘 것으로 본다.
  const cancellation = rentalCancellationStatus(house, transferDate);
  if (cancellation === "not_deemed") return false;

  if (!house.rentalType) {
    return hasBasicRegistration(house) && calcRentalPeriodYears(house) >= LEGACY_RENTAL_YEARS;
  }

  // 사업자등록등 완비 — isRegisteredRental flag 포함(공용 predicate가 검사하지 않는 다주택 전용 요건).
  if (!hasBasicRegistration(house)) return false;

  const article = ARTICLE_BY_RENTAL_TYPE[house.rentalType];
  if (!passesRegistrationCap(house, article)) return false;

  const r = checkRentalArticle(article, toNormalizedFromHouse(house, transferDate));
  if (cancellation === "auto_deemed") return r.failCodes.every((c) => c === "RENTAL_PERIOD_SHORT");
  return r.passed;
}

/**
 * Q-1 후속 — 이 house의 §167조의3⑪ 아파트 양도기한(가목2)·나목2)·라목8)·마목4))을 연장 사실 「모름」(세 호
 * 날짜도 「연장 사유 없음」 확인도 없음) 때문에 바닥(2027.12.31.) 경과로 판정했는가. 결론은
 * `isLongTermRentalHousingExempt`가 정한 대로(불리 적용 · 사용자 결정 2026-10-04) 두고 호출부가 확인 필요 고지를 낸다.
 * 다른 요건 불충족으로 어차피 불인정인 주택도 참일 수 있다 — 고지는 그 사실을 알려 줄 뿐 결론을 바꾸지 않는다.
 */
export function isAptTransferDeadlinePending(house: HouseInfo, transferDate: Date): boolean {
  if (!house.rentalType) return false;
  const article = ARTICLE_BY_RENTAL_TYPE[house.rentalType];
  return checkRentalArticle(article, toNormalizedFromHouse(house, transferDate)).aptDeadlinePending;
}

/**
 * ⑪3호 판정 보류(인가·지정일 · 이전고시일 · 단서 모름) — 2호 가·나·라·마목 아파트. 결론은
 * `isLongTermRentalHousingExempt`가 정한 대로 두고 호출부가 확인 필요 고지를 낸다(`isAptTransferDeadlinePending`의 짝).
 */
export function aptTransferDeadlineConfirmReasons(house: HouseInfo, transferDate: Date): AptDeadlinePendingReason[] {
  if (!house.rentalType) return [];
  const article = ARTICLE_BY_RENTAL_TYPE[house.rentalType];
  return checkRentalArticle(article, toNormalizedFromHouse(house, transferDate)).aptDeadlineConfirmReasons;
}

/**
 * 가·다목 등록상한 2018.4.2 — 다주택 전용 잔여 게이트.
 * (§155⑳ derive는 2020.7.11 경계로 가/다목을 도출하므로 공용 predicate에 넣으면 §155⑳ 회귀.)
 * 사목(base 가/다)도 "해당 목의 다른 요건"에 이 등록상한이 포함되므로 동일 검사(F-S1).
 */
function passesRegistrationCap(house: HouseInfo, article: SharedRentalArticle): boolean {
  const regBoundArticle = article === "사" ? house.saMokBaseArticle : article;
  if (regBoundArticle === "가" || regBoundArticle === "다") {
    const bizTs = house.businessRegistrationDate!.getTime();
    const rentTs = house.rentalRegistrationDate!.getTime();
    if (bizTs > RA_CUT.Y2018_04_02 || rentTs > RA_CUT.Y2018_04_02) return false;
  }
  return true;
}

/**
 * §167의3④ — 장기임대주택(①2호)이 **의무임대기간만** 채우지 못했는가.
 *
 * 「의무임대기간등의 요건을 충족하기 전에 일반주택을 양도하는 경우에도 해당 임대주택등을 …
 *  장기임대주택등으로 보아 제1항제10호를 적용한다」 — 면제되는 것은 **기간 요건뿐**이다.
 * 등록·등록상한·기준시가·임대료 5% 등 다른 요건은 그대로 갖춰야 한다 ⇒ 판정기의 실패 코드가
 * `RENTAL_PERIOD_SHORT` **하나뿐**일 때만 참이다. 사목(말소 후 양도)은 기간이 아니라 말소 게이트라 대상이 아니다.
 *
 * ⚠️ 10호 판정(일반주택 양도) 전용이다 — 양도 주택 **자신**의 2호 판정에 쓰면 안 된다.
 */
export function isLongTermRentalDutyPeriodPending(house: HouseInfo, transferDate: Date): boolean {
  if (!house.isLongTermRental) return false;
  if (house.rentalCancelledDate && house.rentalCancelledDate <= transferDate) return false;
  if (!hasBasicRegistration(house)) return false;
  /**
   * 유형 미선택 — 「임대기간요건 외에 해당 목의 다른 요건」이 **등록 완비뿐**이므로,
   * 등록을 갖추고 기간만 모자라면 ④ 대상이다.
   *
   * 🔑 이 분기가 없으면 `isSurchargeExemptRental` 관용도 제거(2026-09-22)가 **법이 주는 혜택을
   *   함께 없앤다** — 종전에는 그 관용도가 ④를 우연히 대신하고 있었다. 조이기는 2호에만,
   *   ④는 그대로 살린다.
   */
  if (!house.rentalType) return calcRentalPeriodYears(house) < LEGACY_RENTAL_YEARS;
  const article = ARTICLE_BY_RENTAL_TYPE[house.rentalType];
  if (article === "사") return false;
  if (!passesRegistrationCap(house, article)) return false;
  const r = checkRentalArticle(article, toNormalizedFromHouse(house, transferDate));
  return !r.passed && r.failCodes.every((c) => c === "RENTAL_PERIOD_SHORT");
}

export function getRentalTypeLabel(rentalType?: RentalHousingType): string {
  const labels: Record<RentalHousingType, string> = {
    A: "가. 민간매입임대(5년)",
    B: "나. 기존사업자 매입임대",
    C: "다. 민간건설임대(5년)",
    D: "라. 미분양 매입임대",
    E: "마. 장기일반 매입임대(10년)",
    F: "바. 장기일반 건설임대(10년)",
    G: "사. 자진·자동 말소 후 양도",
    H: "아. 단기매입임대(6년, 2025~)",
    I: "자. 단기건설임대(6년, 2025~)",
  };
  return rentalType ? (labels[rentalType] ?? "장기임대주택") : "장기임대주택";
}

// ============================================================
// ③ 조특법 감면 임대주택 판정
// ============================================================

function isTaxIncentiveRentalBaseEligible(house: HouseInfo): boolean {
  return !!(
    house.isTaxIncentiveRental &&
    calcRentalPeriodYears(house) >= 5 &&
    house.isNationalSizeHousing
  );
}

/**
 * §167조의3①3호 후단(대통령령 제36737호) 게이트 대상 여부 — 「매입 + (장기일반|단기) 민간임대주택 중
 * 아파트(도시형 생활주택인 아파트 제외)」인지를 세 사실로 판정한다.
 *
 * true(게이트 대상) / false(대상 아님: 건설임대·다른 등록유형·도시형 생활주택) /
 * undefined("모른다" — 세 사실 중 판정에 필요한 어느 하나라도 미제공). 호출부는 "모른다"를 **게이트 대상**으로
 * 본다 — 후단은 3호를 「한정」(좁히기만)하므로 대상으로 보는 쪽이 불리 방향이다(사용자 결정 2026-10-04 —
 * 모르는 채 유리하게 적용하면 가산세 부담). 그 때문에 3호가 불인정되면 확인 필요 고지.
 */
export function isTaxIncentiveRentalAptGateApplicable(house: HouseInfo): boolean | undefined {
  if (house.isTaxIncentiveRentalPurchase === undefined) return undefined;
  if (!house.isTaxIncentiveRentalPurchase) return false; // 건설임대 → 후단 미적용
  if (house.taxIncentiveRentalRegistrationType === undefined) return undefined;
  if (house.taxIncentiveRentalRegistrationType === "other") return false; // 장기일반·단기 외 유형
  if (house.isUrbanLifeHousingApartment === undefined) return undefined;
  if (house.isUrbanLifeHousingApartment) return false; // 도시형 생활주택인 아파트는 제외
  return true;
}

/**
 * ③ 감면대상장기임대주택의 §167조의3①3호 후단 아파트 양도기한 — 바닥(2027.12.31) 이내면 영향이 없고,
 * 넘겼으면 게이트 대상(대상 여부 모름 포함)에 ⑪ 기한을 적용한다(연장 사실 모름 = 기한 2027.12.31. —
 * 불리 적용 · 사용자 결정 2026-10-04). 「모름」이 결론을 가르면 `isTaxIncentiveRentalAptDeadlinePending`(대상 여부)·
 * `taxIncentiveRentalAptDeadlineConfirmReasons`(연장 사실)가 확인 필요 고지를 담당한다.
 */
export function isTaxIncentiveRentalHousingExempt(house: HouseInfo, transferDate: Date): boolean {
  if (!isTaxIncentiveRentalBaseEligible(house)) return false;
  if (!house.isApartment) return true; // 후단은 아파트에만 걸린다
  if (transferDate.getTime() <= APT_TRANSFER_DEADLINE_FLOOR) return true;

  // false(대상 아님)만 기한 없이 3호. undefined(모름)는 대상으로 본다(불리 적용).
  if (isTaxIncentiveRentalAptGateApplicable(house) === false) return true;

  // 연장 사실 전무(NO_FACT)면 기한 = 2027.12.31.(경과). 3호 인가 시점·단서도 같은 함수가 본다.
  return judgeAptTransferDeadline(transferDate, house.taxIncentiveRentalAptDeadlineExtension).within;
}

/**
 * 3호 후단 **대상 여부를 몰라** 대상으로 보고 기한 경과로 3호를 불인정했는가 — 대상이 아니었다면 3호였다(결론을
 * 가름) → 호출부가 확인 필요 고지. 대상 여부를 알면 false(연장 사실 고지는 `taxIncentiveRentalAptDeadlineConfirmReasons`).
 * 성공·실패 경로 모두에서 보이도록 호출부가 결과 분기 전에 싣는다(feedback_success_only_breakdown_hides_failures).
 */
export function isTaxIncentiveRentalAptDeadlinePending(house: HouseInfo, transferDate: Date): boolean {
  if (!isTaxIncentiveRentalBaseEligible(house)) return false;
  if (!house.isApartment) return false;
  if (transferDate.getTime() <= APT_TRANSFER_DEADLINE_FLOOR) return false;
  if (isTaxIncentiveRentalAptGateApplicable(house) !== undefined) return false;
  return !judgeAptTransferDeadline(transferDate, house.taxIncentiveRentalAptDeadlineExtension).within;
}

/**
 * ⑪ 확인 필요 사유(연장 사실 전무 · 3호 인가·지정일 · 단서 모름) — 3호 후단 게이트 대상(대상 여부 모름 포함)인
 * 감면대상장기임대주택. 결론을 가른 사유만 `judgeAptTransferDeadline`이 돌려준다.
 */
export function taxIncentiveRentalAptDeadlineConfirmReasons(
  house: HouseInfo,
  transferDate: Date,
): AptDeadlinePendingReason[] {
  if (!isTaxIncentiveRentalBaseEligible(house) || !house.isApartment) return [];
  if (transferDate.getTime() <= APT_TRANSFER_DEADLINE_FLOOR) return [];
  if (isTaxIncentiveRentalAptGateApplicable(house) === false) return [];
  return judgeAptTransferDeadline(transferDate, house.taxIncentiveRentalAptDeadlineExtension).pending;
}

// ============================================================
// Step 2: 주택 수 산정 (소령 §167-3)
// ============================================================

/**
 * 분양권/입주권이 §104⑦ 주택 수에 산입되는지.
 *
 * 동작: **분양권**은 취득일 < `presaleRightStartDate`(2021-01-01)이면 산입하지 않는다.
 * **조합원입주권은 취득일 게이트가 없다.** 둘 다 VALUE지역(지방) 가액 3억 이하는 미산입.
 * (#2b 혼인 차감 Step 1.5와 산입 판정 단일화)
 *
 * ## 🔴 2026-08-26 정정 (C1-02) — 취득일 게이트는 **분양권 전용**이다
 *
 * 종전에는 `right.type`을 보지 않고 **전 항목**에 2021-01-01 게이트를 걸었다. 그 날짜는
 * §88 10호 「**분양권**」 정의 신설의 적용례이지 조합원입주권의 기산일이 아니다.
 *
 * 근거 셋을 모두 본문으로 확인했다:
 *
 * 1. **시행령 §167의4②1호·§167의11②1호** — 산입 제외 사유는 「수도권·광역시·특별자치시 …
 *    외의 지역에 소재하는 주택, 조합원입주권 또는 분양권으로서 … 3억원을 초과하지 않는」 것뿐이고
 *    **취득시기 요건이 없다**. 조합원입주권과 분양권을 **나란히 열거**한다.
 * 2. **「소득세법」 §104⑦2호·4호 2020-08-28 시행본**(제16568호 · MST 210323) — 「1세대가 주택과
 *    **조합원입주권을 각각 1개씩** 보유한 경우」/「주택과 **조합원입주권**을 보유한 경우로서 그
 *    수의 합이 3 이상」. 즉 조합원입주권은 2021-01-01 **이전부터** 산입 요소였다.
 * 3. **법률 제15225호(2017-12-19) 부칙** — §104⑦ 신설 개정의 적용례가 취득시기를 정했는지가
 *    마지막 미확인 항목이었다. 본문:
 *
 *    > **제1조(시행일)** … 1. … **같은 조 제7항·제8항** … 의 개정규정: **2018년 4월 1일**
 *    > **제2조(일반적 적용례)** ② 이 법 중 양도소득에 관한 개정규정은 이 법 시행 이후
 *    > **양도하는 자산**으로부터 발생하는 소득분부터 적용한다.
 *
 *    제3조~제14조의 개별 적용례에 **§104⑦은 없다**. ⇒ 일반적 적용례만 적용되고 기준은
 *    **양도일**이다. **취득시기 요건은 부칙에도 없다.**
 *
 * ⇒ 조합원입주권에 취득일 게이트를 걸면 §104⑦4호(+30%p) 사안이 2호(+20%p)로 계산된다
 *   (리뷰 실측 Δ 109,725,000원 · 종전이 **과소과세**).
 *
 * ## 🔑 §104⑦ 자체의 시행일(2018-04-01) 게이트는 여기에 넣지 않는다
 *
 * 2018-04-01 이전 양도에는 §104⑦이 아예 적용되지 않지만, 그 판정은 세율 층
 * (`MULTI_HOUSE_SURCHARGE_START_DATE` · `resolveSurchargeAddonRate`)이 이미 담당한다.
 * 여기에 양도일 조건을 또 넣으면 진실이 둘이 된다.
 */
export function isPresaleRightCounted(right: PresaleRight, presaleStartDate: Date): boolean {
  return presaleRightCountReason(right, presaleStartDate) === "counted";
}

/**
 * `isPresaleRightCounted`의 **사유** — 다주택 중과 판정 메뉴 표 ③(계획서 §4.4). 술어는 이 함수 하나다.
 * - `presale_before_start` — 2021.1.1. 전 취득 분양권(§88 10호 정의 신설 적용례)
 * - `low_value_local` — 가액기준 지역 3억 이하(영 §167의4②1호·§167의11②1호)
 */
export function presaleRightCountReason(
  right: PresaleRight,
  presaleStartDate: Date,
): "counted" | "presale_before_start" | "low_value_local" {
  // 분양권 전용 — §88 10호 정의 신설 적용례. 조합원입주권은 그 이전부터 산입 요소였다(위 주석).
  // 상속 분양권은 동일세대면 피상속인 취득일 — §89②와 같은 leaf(`presale-right-definition-date.ts`).
  if (right.type === "presale_right" && presaleRightDefinitionAcquisitionDate(right) < presaleStartDate)
    return "presale_before_start";
  // 소재지 법정동코드(10자리)가 있으면 그것으로 분류한다 — 선택값(수도권/광역시·세종/그 외 지방)으로는 읍·면을 고를 수 없다.
  const rc =
    right.regionCode && right.regionCode.length >= 10
      ? classifyRegionCriteriaByCode(right.regionCode)
      : (right.regionCriteria ?? (right.region === "capital" ? "REGION" : "VALUE"));
  if (rc === "VALUE" && (right.rightValue ?? Infinity) <= MULTI_HOUSE.PRESALE_LOW_VALUE_CAP) return "low_value_local";
  return "counted";
}

/**
 * §167의3①2호 장기임대주택 — 중과 **대상에서** 빠지는 주택(주택 수에는 산입 · D16).
 *
 * 판정은 `isLongTermRentalHousingExempt` **하나**에 위임한다 — 같은 질문에 술어가 둘이면
 * 조용히 갈린다([[feedback_shared_predicate_argument_parity]]).
 *
 * 🔴 **2026-09-22 정정 — 유형 미선택이면 아무 요건도 보지 않았다.**
 *    종전 마지막 줄은 `house.rentalType ? 정밀판정 : true`였다. 유형이 없으면 등록·임대기간을
 *    **전혀 확인하지 않고** 배제했다(실측: 등록 무증빙·임대 4년도 3주택 141,966,000 — 중과라면
 *    354,541,000). 이 관용도는 D16보다 오래됐다 — D16(`60225941`)이 종전 주택 수 제외 블록
 *    「배제 2: 장기임대 등록주택 (말소 전)」의 `: true`를 **문언 그대로** 옮긴 것이다(diff 실측).
 *
 *    법문(실독 2026-09-22 · MST 286211) §167의3①2호 **본문**이 요구하는 것:
 *      「법 제168조에 따른 **사업자등록**과 민간임대주택법 제5조에 따른 **임대사업자 등록**을 한
 *       거주자가 민간임대주택으로 등록하여 임대하는 **다음 각 목의 어느 하나에 해당하는 주택**」
 *    그리고 **각 목은 전부 임대기간 요건을 가진다**(가·나·다·라 5년 · 마·바 10년 · 아·자 6년 ·
 *    사목은 말소 특례). ⇒ 등록도 기간도 없는 선언이 충족하는 목은 **하나도 없다**.
 *    ⇒ 유형 미선택도 `LEGACY_RENTAL_YEARS`(최단 목 5년) + 등록 완비를 요구한다.
 *
 * 🔑 §167의3④(의무임대기간 충족 전 일반주택 양도 → 10호 의제)를 **잃지 않도록** 같이 넓혔다 —
 *    종전에는 위 관용도가 ④를 우연히 대신하고 있었다(종전 주석의 「과도 부합한다」).
 *    ④의 정본 경로는 `isLongTermRentalDutyPeriodPending`이고, 거기에 유형 미선택 분기를 넣었다.
 */
/**
 * §167의3①7호 「상속받은 날부터 **5년**이 경과하지 아니한 경우」 — 이 수치의 **정본**.
 *
 * ⛔ DB(`house_count_exclusion.inheritedHouseYears`)로 되돌리지 말 것 (2026-09-22 제거).
 *   D16 이후 그 키는 프로덕션 소비처가 0건인 **침묵 no-op 노브**였다 — DB에서 바꿔도 아무
 *   일이 없었다. 게다가 `houseCountExclusionRules`는 **optional**이라 DB 키가 없으면
 *   `undefined`가 된다: 세액을 가르는 수치를 그런 경로에 두면 키 하나 빠질 때 조용히 무너진다.
 */
const INHERITED_HOUSE_SURCHARGE_YEARS = 5;

export function isSurchargeExemptRental(house: HouseInfo, transferDate: Date): boolean {
  return isLongTermRentalHousingExempt(house, transferDate);
}

/**
 * §167의3①7호 — 「제155조제2항에 해당하는 상속받은 주택(상속받은 날부터 5년이 경과하지 아니한
 * 경우에 한정한다)」 — 중과 **대상에서** 빠지는 주택(주택 수에는 산입 · D16).
 *
 * 「제155조제2항에 해당하는」 — 동일세대 단서·순위(1~4호)를 비과세 경로와 **같은 함수**로 본다
 * (서면4팀-2898 · 서면4팀-2403 · 조심-2022-부-5548 · 서울행정법원 2025구단9898 — 동일세대 상속은 7호
 * 불해당 / 서면4팀-4227 — 선순위 1채). 다른 주택 수는 요건이 아니다(부동산거래관리과-362).
 * 일반주택 쪽 요건(상속개시 당시 보유)은 해석을 확보하지 못해 **붙이지 않는다**(세액이 오르는 방향).
 * 상속인이 아닌 사람이 유증·사인증여로 받은 주택은 §155②의 상속받은 주택이 아니다(부동산거래관리과-307 · 조심2013중2654 ·
 * 수원지방법원 2013구단4853) — `isHeirInheritedHouse`(계획서 `docs/00-pm/non-heir-bequest-followups.plan.md` §1 A).
 */
export function isSurchargeExemptInherited(house: HouseInfo, transferDate: Date): boolean {
  if (!isHeirInheritedHouse(house) || !house.inheritedDate) return false;
  // 「상속받은 날부터 5년이 경과하지 아니한」 — 초일불산입 기간의 말일(민법 §157·§160·§161)까지. 응당일 당일은 기간 안(E-11 ·
  //   `isMortgageExecutionWithin3Years`와 같은 독법 — §161 직접 선례 미확보).
  if (!isWithinDeadline(house.inheritedDate, INHERITED_HOUSE_SURCHARGE_YEARS, transferDate)) return false;
  return passesHouseholdGate(house) && passesRankingGate(house);
}

/**
 * §167의3①1호 — 수도권·광역시·특별자치시(소속 군·읍·면 제외) 외 지방 주택으로서 기준시가(양도 당시) 3억 이하.
 * regionCode/regionCriteria 유무와 무관하게 단일 3억 기준 적용(local 우선, 미제공 시 non_capital). 종전 local
 * 미배선(dead code)로 regionCode 주택 미배제 + non_capital 1억 오적용(법령 3억) 정정.
 *
 * 1호는 주택 수 불산입이면서 중과 배제 각 호의 하나다 — 주택 수 산정과 양도 주택 자체의 배제 backstop
 * (`computeMultiHouseSurcharge` Step 4.5)이 같은 술어를 쓴다. 해당하지 않으면 null.
 */
export function resolveLowPriceLocalHouse(
  house: HouseInfo,
  rules: HouseCountExclusionRules,
): { price: number; threshold: number } | null {
  const criteria: "REGION" | "VALUE" =
    house.regionCriteria ??
    (house.regionCode
      ? classifyRegionCriteriaByCode(house.regionCode)
      : house.region === "capital"
        ? "REGION"
        : "VALUE");
  if (criteria !== "VALUE") return null;
  const threshold = rules.lowPriceThreshold.local ?? rules.lowPriceThreshold.non_capital;
  const price = house.transferOfficialPrice ?? house.officialPrice;
  return price <= threshold ? { price, threshold } : null;
}

export function countEffectiveHouses(
  houses: HouseInfo[],
  transferDate: Date,
  presaleRights: PresaleRight[],
  rules: HouseCountExclusionRules,
): { count: number; excluded: ExcludedHouse[]; warnings: string[] } {
  const excluded: ExcludedHouse[] = [];
  const warnings: string[] = [];
  let count = 0;

  const presaleStartDate = new Date(rules.presaleRightStartDate);

  for (const house of houses) {
    /**
     * 🔴 D16(2026-09-18): §167의3①7호(상속 5년)·2호(장기임대)는 **주택 수에서 빼지 않는다**.
     *
     * 본문 괄호가 주택 수 불산입으로 정한 것은 「제1호 또는 제12호」뿐이다(2022-01-01판은 제1호만).
     * 7호·2호는 「다음 각 호의 어느 하나에 해당하지 않는 주택」, 즉 **중과 대상에서만** 빠진다 —
     * 주택 수에는 산입된다. 종전에는 여기서 빼 3주택이 2주택으로(과소), 양도 주택 자체가 상속
     * 5년이면 그 주택이 빠진 채 나머지로 중과했다(과다).
     * ⇒ 판정은 `isSurchargeExemptInherited`·`isSurchargeExemptRental`로 옮겼다 —
     *   양도 주택 자체(`determineSurchargeExclusion`)·3주택 「유일한 일반주택」(`isGroupExcludable`)·
     *   2주택 §167의10①10호가 쓴다.
     */

    // 배제 1.5: 공동상속주택 소수지분 — §167의3②2호 (2주택은 §167의10②로 준용).
    //   「공동상속주택: 상속지분이 가장 큰 상속인의 소유로 하여 주택수를 계산」이므로
    //   소수지분자에게는 **기간 제한 없이** 미산입이다(배제 1의 5년과 별개 규칙).
    //   2026-07-31 신설(계획서 F-8) — 종전에는 비과세 주택 수(`transfer-inheritance-exclusion.ts`)
    //   에서만 반영되고 그 단계가 중과 판정보다 뒤라, 상속 5년이 지나면 소수지분도 산입됐다.
    //   `isLargestCoInheritedShareholder`는 자기선언 boolean — 미제공은 소수지분으로 본다
    //   (엔진은 다른 공동상속인의 지분을 알 수 없다. 타입 주석과 동일 규약).
    //   수유자(상속인 아닌 유증·사인증여) 행은 「상속인」의 공동상속주택이 아니다 — 직접 해석이 없어 확인 필요(아래 warnings).
    if (house.isInherited && house.nonHeirBequest === true && house.isCoInherited && house.isLargestCoInheritedShareholder !== true) {
      warnings.push(
        "상속인이 아닌 사람이 유증·사인증여로 받은 공동소유 주택은 공동상속주택 소수지분(" +
          MULTI_HOUSE.CO_INHERITED_COUNT_BASIS +
          ")으로 보지 않고 주택 수에 넣었습니다 — 직접 해석이 없어 확인이 필요합니다.",
      );
    }
    if (isHeirInheritedHouse(house) && house.isCoInherited && house.isLargestCoInheritedShareholder !== true) {
      excluded.push({
        houseId: house.id,
        reason: "co_inherited_minor_share",
        detail: `공동상속주택 소수지분 — 최대지분 상속인의 소유로 계산 (${MULTI_HOUSE.CO_INHERITED_COUNT_BASIS})`,
      });
      continue;
    }

    // 배제 3: 지역기준/가액기준 이분법 (소령 §167-3)
    const lowPrice = resolveLowPriceLocalHouse(house, rules);
    if (lowPrice) {
      excluded.push({
        houseId: house.id,
        reason: house.regionCriteria || house.regionCode ? "low_price_local_300" : "low_price_non_capital",
        detail: `지방(VALUE) 기준시가 ${lowPrice.price.toLocaleString()} (${lowPrice.threshold.toLocaleString()} 이하)`,
      });
      continue;
    }

    /**
     * 🔴 F-11(2026-09-19) — 두 불산입을 없앴다. 근거가 없었다:
     *   · 조특법 감면 미분양·신축주택(`isUnsoldHousing`) — 조특법 §98의2·98의3·98의5~98의8·99·99의2·99의3은
     *     「소득세법 제89조제1항제3호를 적용할 때」만 소유주택으로 보지 않는다(비과세 판정). 중과는 영
     *     §167의3①5호가 **중과 대상에서만** 뺀다 → 주택 수에는 산입(`isGroupExcludable`·양도 주택 5호).
     *   · 주거용 오피스텔 「2022.1.1 전 취득분」 — 양도세에 그런 경과규정이 없다. 사실상 주거용이면
     *     주택이다(심사-양도-2020-0038 · 조심-2023-서-10142 모두 3주택 판정에 산입).
     */

    // 배제 6: ⑬ 소형 신축/미분양 특례 — 2024.2.29 이후 양도분부터(부칙 §11①)
    if (isSmallNewHouseSpecial(house, transferDate)) {
      excluded.push({
        houseId: house.id,
        reason: "small_new_house",
        detail: `소형 신축/미분양 특례 (전용 ${house.exclusiveArea ?? "?"}㎡, 취득가 ${(house.acquisitionPrice ?? 0).toLocaleString()}`,
      });
      continue;
    }

    // 배제 7: ⑭ 인구감소지역/관심지역 세컨드홈 특례 (소령 §167의3①12 다·라목)
    const secondHome = resolvePopulationDeclineSecondHome(house, houses, presaleRights, transferDate);
    if (secondHome) {
      warnings.push(...secondHome.warnings);
      if (secondHome.qualifies) {
        excluded.push({
          houseId: house.id,
          reason: "population_decline_second_home",
          detail: `인구감소지역 세컨드홈 특례 (${MULTI_HOUSE.SECOND_HOME_DEPOPULATION}) — 기준시가 ${house.officialPrice.toLocaleString()} ≤ ${secondHome.popCap.toLocaleString()}, 주택 수 산정 배제`,
        });
        continue;
      }
    }

    count++;
  }

  // 분양권/입주권: 산정시작일(2021.1.1) 이후 + VALUE 3억↓ 배제 (isPresaleRightCounted 단일화)
  for (const right of presaleRights) {
    if (isPresaleRightCounted(right, presaleStartDate)) count++;
  }

  return { count, excluded, warnings };
}
