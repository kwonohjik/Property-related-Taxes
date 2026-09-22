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

import { differenceInYears } from "date-fns";
import { MULTI_HOUSE } from "./legal-codes";
import { classifyPopulationDeclineArea, toSigunguCode } from "./data/population-decline-areas";
import { checkRentalArticle, type NormalizedRentalUnit } from "./rental-article/check";
import { RA_CUT } from "./rental-article/rules";
import { passesHouseholdGate } from "./transfer-inheritance-exclusion";
import { passesRankingGate } from "./transfer-inheritance-exclusion";
import type { SharedRentalArticle } from "./rental-article/types";
import type {
  RentalHousingType,
  HouseInfo,
  PresaleRight,
  ExcludedHouse,
  HouseCountExclusionRules,
} from "./types/multi-house-surcharge.types";

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

export function classifyRegionCriteriaByCode(regionCode: string): "REGION" | "VALUE" {
  if (!regionCode || regionCode.length < 2) return "VALUE";

  const sidoCode = regionCode.substring(0, 2);
  const sggCode = regionCode.substring(0, 5);

  if (sidoCode === "11") return "REGION"; // 서울

  // 인천: 강화군(28710)·옹진군(28720) VALUE, 나머지 REGION
  if (sidoCode === "28") {
    if (sggCode === "28710" || sggCode === "28720") return "VALUE";
    return "REGION";
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
    if (sggCode === "41800" || sggCode === "41820" || sggCode === "41830") return "VALUE";
    return "REGION";
  }

  // 부산: 기장군(26710) VALUE
  if (sidoCode === "26") {
    if (sggCode === "26710") return "VALUE";
    return "REGION";
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
    if (sggCode === "27710" || sggCode === "27720") return "VALUE";
    return "REGION";
  }

  if (sidoCode === "29") return "REGION"; // 구 광주광역시 (통합 전 코드 — 저장된 이력·수동 입력)
  if (sidoCode === "30") return "REGION"; // 대전

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
    return INTEGRATED_GWANGJU_DISTRICT_CODES.has(sggCode) ? "REGION" : "VALUE";
  }

  // 울산: 울주군(31710) VALUE
  if (sidoCode === "31") {
    if (sggCode === "31710") return "VALUE";
    return "REGION";
  }

  if (sidoCode === "36") return "REGION"; // 세종

  // 기타 도 지역: VALUE
  return "VALUE";
}

// ============================================================
// 장기임대주택 유형별 판정 (가목~자목, A~I)
// 소령 §167-3 ① 2호
// ============================================================

export function calcRentalPeriodYears(house: HouseInfo): number {
  if (house.rentalPeriodYears != null) return house.rentalPeriodYears;
  if (house.rentalStartDate && house.rentalEndDate) {
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

/** 다주택 유형 A~I ↔ §167조의3①2호 가~자목 (실측 getRentalTypeLabel 정합). */
const ARTICLE_BY_RENTAL_TYPE: Record<RentalHousingType, SharedRentalArticle> = {
  A: "가", B: "나", C: "다", D: "라", E: "마", F: "바", G: "사", H: "아", I: "자",
};

/** HouseInfo → 공용 정규화 입력 (Phase 2 C3 — checkRentalArticle 위임). */
function toNormalizedFromHouse(house: HouseInfo): NormalizedRentalUnit {
  return {
    businessRegistrationDate: house.businessRegistrationDate ?? null,
    rentalRegistrationDate: house.rentalRegistrationDate ?? null,
    isCapitalArea: house.isCapitalArea ?? house.region === "capital",
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

  if (house.rentalCancelledDate && house.rentalCancelledDate <= transferDate) return false;

  if (!house.rentalType) {
    return hasBasicRegistration(house) && calcRentalPeriodYears(house) >= LEGACY_RENTAL_YEARS;
  }

  // 사업자등록등 완비 — isRegisteredRental flag 포함(공용 predicate가 검사하지 않는 다주택 전용 요건).
  if (!hasBasicRegistration(house)) return false;

  const article = ARTICLE_BY_RENTAL_TYPE[house.rentalType];
  if (!passesRegistrationCap(house, article)) return false;

  return checkRentalArticle(article, toNormalizedFromHouse(house)).passed;
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
  const r = checkRentalArticle(article, toNormalizedFromHouse(house));
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
// 소형 신축/미분양 주택 판정 (⑬)
// ============================================================

/**
 * ⑬ 소형 신축주택 또는 비수도권 준공 후 미분양 특례 해당 여부.
 * 해당 시 주택 수 산정 배제 AND 중과세 배제 동시 적용.
 */
/**
 * §167의3①12호 가·나목의 **양도일** 경계 — 2024.2.29 개정(대통령령 제34265호) 부칙 §11①
 * 「제167조의3제1항 각 호 외의 부분 및 같은 항 제12호의 개정규정은 이 영 시행 이후 주택을 양도하는
 * 경우부터 적용한다」. 그 전 시행본의 12호는 「삭제<2023.2.28>」이고 괄호도 「제1호」뿐이다(F-11).
 */
const SMALL_NEW_HOUSE_TRANSFER_FROM = new Date("2024-02-29");
/** §167의3①12호 다·라목(인구감소지역·관심지역 세컨드홈) — 2026.2.27 시행본 신설 · 2026.1.1 이후 취득분 */
const SECOND_HOME_TRANSFER_FROM = new Date("2026-02-27");
const SECOND_HOME_ACQ_FROM = new Date("2026-01-01");
/**
 * §167의3①12호 나목2) 취득가액 6억 → 7억 — 2026.2.27 개정 부칙 §11 「이 영 시행 이후 준공 후
 * 미분양주택을 **취득**하는 경우부터 적용」. 그 전 취득분은 6억이다(F-11).
 */
const UNSOLD_NEW_HOUSE_7EOK_ACQ_FROM = new Date("2026-02-27");

export function isSmallNewHouseSpecial(house: HouseInfo, transferDate: Date): boolean {
  if (!house.acquisitionDate || !house.acquisitionPrice) return false;
  if (transferDate < SMALL_NEW_HOUSE_TRANSFER_FROM) return false;

  const acqDate = house.acquisitionDate;
  const isCapital = house.isCapitalArea ?? house.region === "capital";

  // 소형 신축주택 (소령 §167의3①12가목: 취득·준공 모두 2024.1.10~2027.12.31, 전용 60㎡ 이하, 아파트 제외, 취득가 수도권 6억/비수도권 3억 이하)
  // 가목 3호 준공일 검증 — completionDate 미제공 시 미발동(보수적)
  if (
    acqDate >= new Date("2024-01-10") &&
    acqDate <= new Date("2027-12-31") &&
    !!house.completionDate &&
    house.completionDate >= new Date("2024-01-10") &&
    house.completionDate <= new Date("2027-12-31") &&
    (house.exclusiveArea ?? 0) <= 60 &&
    !house.isApartment &&
    house.acquisitionPrice <= (isCapital ? 600_000_000 : 300_000_000)
  ) {
    return true;
  }

  // 비수도권 준공 후 미분양 (소령 §167의3①12나목: 2024.1.10 ~ 2026.12.31, 전용 85㎡ 이하,
  // 취득가 6억 이하 — 2026.2.27 이후 취득분은 7억 이하)
  const unsoldNewPriceCap = acqDate >= UNSOLD_NEW_HOUSE_7EOK_ACQ_FROM ? 700_000_000 : 600_000_000;
  if (
    acqDate >= new Date("2024-01-10") &&
    acqDate <= new Date("2026-12-31") &&
    !isCapital &&
    (house.exclusiveArea ?? 0) <= 85 &&
    house.acquisitionPrice <= unsoldNewPriceCap &&
    house.isUnsoldNewHouse
  ) {
    return true;
  }

  return false;
}

// ============================================================
// ③ 조특법 감면 임대주택 판정
// ============================================================

export function isTaxIncentiveRentalHousingExempt(house: HouseInfo): boolean {
  return !!(
    house.isTaxIncentiveRental &&
    calcRentalPeriodYears(house) >= 5 &&
    house.isNationalSizeHousing
  );
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
  // 분양권 전용 — §88 10호 정의 신설 적용례. 조합원입주권은 그 이전부터 산입 요소였다(위 주석).
  if (right.type === "presale_right" && right.acquisitionDate < presaleStartDate) return false;
  const rc = right.regionCriteria ?? (right.region === "capital" ? "REGION" : "VALUE");
  if (rc === "VALUE" && (right.rightValue ?? Infinity) <= MULTI_HOUSE.PRESALE_LOW_VALUE_CAP) return false;
  return true;
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
 */
export function isSurchargeExemptInherited(house: HouseInfo, transferDate: Date): boolean {
  if (!house.isInherited || !house.inheritedDate) return false;
  if (differenceInYears(transferDate, house.inheritedDate) >= INHERITED_HOUSE_SURCHARGE_YEARS) return false;
  return passesHouseholdGate(house) && passesRankingGate(house);
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
    if (house.isInherited && house.isCoInherited && house.isLargestCoInheritedShareholder !== true) {
      excluded.push({
        houseId: house.id,
        reason: "co_inherited_minor_share",
        detail: `공동상속주택 소수지분 — 최대지분 상속인의 소유로 계산 (${MULTI_HOUSE.CO_INHERITED_COUNT_BASIS})`,
      });
      continue;
    }

    // 배제 3: 지역기준/가액기준 이분법 (소령 §167-3)
    const criteria: "REGION" | "VALUE" =
      house.regionCriteria ??
      (house.regionCode
        ? classifyRegionCriteriaByCode(house.regionCode)
        : house.region === "capital"
          ? "REGION"
          : "VALUE");

    if (criteria === "VALUE") {
      // §167의3①1호: 수도권·광역시·특별자치시(소속 군·읍·면 제외) 외 지방 주택으로서
      // 기준시가(양도 당시) 3억 이하 → 주택 수 제외. regionCode/regionCriteria 유무와 무관하게
      // 단일 3억 기준 적용(local 우선, 미제공 시 non_capital). 종전 local 미배선(dead code)로
      // regionCode 주택 미배제 + non_capital 1억 오적용(법령 3억) 정정.
      const threshold = rules.lowPriceThreshold.local ?? rules.lowPriceThreshold.non_capital;
      const priceToCheck = house.transferOfficialPrice ?? house.officialPrice;
      if (priceToCheck <= threshold) {
        excluded.push({
          houseId: house.id,
          reason: house.regionCriteria || house.regionCode ? "low_price_local_300" : "low_price_non_capital",
          detail: `지방(VALUE) 기준시가 ${priceToCheck.toLocaleString()} (${threshold.toLocaleString()} 이하)`,
        });
        continue;
      }
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
    const autoKind = house.regionCode
      ? classifyPopulationDeclineArea(house.regionCode).kind
      : null;
    const isPopDecline = house.isPopulationDeclineArea ?? (autoKind !== null);
    // 12호 다·라목은 2026.2.27 시행본에서 신설됐고, 호 본문이 「2026년 1월 1일 이후 취득하는 주택」이다(F-11).
    const secondHomeInForce =
      transferDate >= SECOND_HOME_TRANSFER_FROM && house.acquisitionDate >= SECOND_HOME_ACQ_FROM;
    if (isPopDecline && house.isSecondHomeRegistered && secondHomeInForce) {
      // 가액 한도: 다목(수도권 밖 인구감소지역) 9억 / 라목(관심지역)·수도권 접경·그 외 4억.
      // populationAreaType 미입력 시 regionCode 자동판정(autoKind)으로 다·라목 구분 도출 (N-6).
      const effectiveAreaType = house.populationAreaType ?? autoKind ?? undefined;
      const popCap =
        house.region === "non_capital" && effectiveAreaType === "decline"
          ? MULTI_HOUSE.POP_DECLINE_PRICE_CAP_NONCAPITAL
          : MULTI_HOUSE.POP_DECLINE_PRICE_CAP_DEFAULT;
      if (house.officialPrice <= popCap) {
        // 다목 2호·라목 2호: 해당 주택 취득 전에 보유한 주택과 동일한 시·군·구에
        // 소재하는 주택이 아닐 것. 동일 시·군·구 보유주택이 있으면 특례 미적용(산입).
        // regionCode 미제공(boolean override 경로)이면 비교 불가 → 제한 미적용(특례 유지).
        const candidateSgg = toSigunguCode(house.regionCode);
        let hasSameSigunguPriorHouse = false;
        if (candidateSgg) {
          for (const other of houses) {
            if (other.id === house.id) continue;
            // "취득 전에 보유한 주택" — 후보 취득일 이전(또는 동일)에 취득한 주택만 비교
            if (other.acquisitionDate > house.acquisitionDate) continue;
            const otherSgg = toSigunguCode(other.regionCode);
            if (otherSgg && otherSgg === candidateSgg) {
              hasSameSigunguPriorHouse = true;
              break;
            }
          }
          // 다·라목 2호 괄호: 취득 전에 보유한 입주권/분양권을 통해 공급하는 주택도 비교 대상.
          // 권리 소재지(공급주택 시·군·구)를 후보와 비교. 주택 수 산입 여부와 무관(보유 사실 기준).
          if (!hasSameSigunguPriorHouse) {
            for (const right of presaleRights) {
              if (right.acquisitionDate > house.acquisitionDate) continue;
              const rightSgg = toSigunguCode(right.regionCode);
              if (rightSgg && rightSgg === candidateSgg) {
                hasSameSigunguPriorHouse = true;
                break;
              }
            }
          }
        } else {
          // regionCode 미제공(boolean override 경로) → 동일 시·군·구 요건 검증 불가.
          // 제한규정 미적용(특례 유지)하되 미검증 사실을 경고로 노출.
          warnings.push(
            `주택 ${house.id}: 인구감소지역 세컨드홈 특례 — 주소(시·군·구) 미입력으로 '취득 전 보유주택과 동일 시·군·구' 요건(소령 §167의3①12 다·라목 2호)을 검증하지 못했습니다.`,
          );
        }
        if (!hasSameSigunguPriorHouse) {
          excluded.push({
            houseId: house.id,
            reason: "population_decline_second_home",
            detail: `인구감소지역 세컨드홈 특례 (${MULTI_HOUSE.SECOND_HOME_DEPOPULATION}) — 기준시가 ${house.officialPrice.toLocaleString()} ≤ ${popCap.toLocaleString()}, 주택 수 산정 배제`,
          });
          continue;
        }
        // 동일 시·군·구 보유주택 존재 → 다목·라목 2호 미충족 → 특례 미적용, 일반 산입
        warnings.push(
          `주택 ${house.id}: 취득 전 보유한 동일 시·군·구 주택이 있어 인구감소지역 세컨드홈 특례를 적용하지 않습니다(소령 §167의3①12 다·라목 2호).`,
        );
      }
      // 한도 초과 → 배제 미적용, 일반 산입 (fall through)
    }

    count++;
  }

  // 분양권/입주권: 산정시작일(2021.1.1) 이후 + VALUE 3억↓ 배제 (isPresaleRightCounted 단일화)
  for (const right of presaleRights) {
    if (isPresaleRightCounted(right, presaleStartDate)) count++;
  }

  return { count, excluded, warnings };
}
