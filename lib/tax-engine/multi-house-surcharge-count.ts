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

function hasBasicRegistration(house: HouseInfo): boolean {
  return !!(
    house.isRegisteredRental &&
    house.rentalRegistrationDate &&
    house.businessRegistrationDate
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
 * ② 장기임대주택 중과배제 여부 (가~자목 유형별 검증 — 공용 checkRentalArticle 위임, Phase 2 C3).
 * rentalType 미제공 시 legacy boolean 판정으로 폴백.
 */
export function isLongTermRentalHousingExempt(house: HouseInfo, transferDate: Date): boolean {
  if (!house.isLongTermRental) return false;

  if (house.rentalCancelledDate && house.rentalCancelledDate <= transferDate) return false;

  if (!house.rentalType) {
    return !!(
      house.isRegisteredRental &&
      house.rentalRegistrationDate &&
      house.businessRegistrationDate &&
      calcRentalPeriodYears(house) >= 5
    );
  }

  // 사업자등록등 완비 — isRegisteredRental flag 포함(공용 predicate가 검사하지 않는 다주택 전용 요건).
  if (!hasBasicRegistration(house)) return false;

  const article = ARTICLE_BY_RENTAL_TYPE[house.rentalType];

  // 가·다목 등록상한 2018.4.2 — 다주택 전용 잔여 게이트.
  // (§155⑳ derive는 2020.7.11 경계로 가/다목을 도출하므로 공용 predicate에 넣으면 §155⑳ 회귀.)
  // 사목(base 가/다)도 "해당 목의 다른 요건"에 이 등록상한이 포함되므로 동일 검사(F-S1).
  const regBoundArticle = article === "사" ? house.saMokBaseArticle : article;
  if (regBoundArticle === "가" || regBoundArticle === "다") {
    const bizTs = house.businessRegistrationDate!.getTime();
    const rentTs = house.rentalRegistrationDate!.getTime();
    if (bizTs > RA_CUT.Y2018_04_02 || rentTs > RA_CUT.Y2018_04_02) return false;
  }

  return checkRentalArticle(article, toNormalizedFromHouse(house)).passed;
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
export function isSmallNewHouseSpecial(house: HouseInfo): boolean {
  if (!house.acquisitionDate || !house.acquisitionPrice) return false;

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

  // 비수도권 준공 후 미분양 (소령 §167의3①12나목: 2024.1.10 ~ 2026.12.31, 전용 85㎡ 이하, 취득가 7억 이하)
  if (
    acqDate >= new Date("2024-01-10") &&
    acqDate <= new Date("2026-12-31") &&
    !isCapital &&
    (house.exclusiveArea ?? 0) <= 85 &&
    house.acquisitionPrice <= 700_000_000 &&
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
 * 현행 동작: **취득일 < `presaleRightStartDate`(2021-01-01)이면 산입하지 않는다** + VALUE지역(지방)
 * 가액 3억 이하 미산입. `right.type`은 보지 않는다. (#2b 혼인 차감 Step 1.5와 산입 판정 단일화)
 *
 * ## 🟠 미결 (C1-02) — 취득일 게이트는 **조합원입주권에는 근거가 없다**
 *
 * 종전 주석은 2021-01-01 기산일의 근거로 「소령 §167의4②1호·§167의11②1호」를 들었으나,
 * **두 조문에는 취득시기 요건이 없다**. 「소득세법 시행령」 §167의11②1호 본문(현행) 실독:
 * 산입 제외 사유는 「수도권·광역시·특별자치시 … 외의 지역에 소재하는 주택, 조합원입주권 또는
 * 분양권으로서 … 3억원을 초과하지 않는」 것뿐이고, **조합원입주권과 분양권을 나란히 열거**한다.
 *
 * 게다가 「소득세법」 §104⑦2호·4호는 **2021-01-01 이전부터 조합원입주권을 담고 있었다**.
 * 2020-08-28 시행본(제16568호 · MST 210323) 실독:
 *
 * > 2호 「조정대상지역에 있는 주택으로서 1세대가 주택과 **조합원입주권을 각각 1개씩** 보유한 경우의 해당 주택」
 * > 4호 「… 1세대가 주택과 **조합원입주권**을 보유한 경우로서 그 수의 합이 3 이상인 경우 해당 주택」
 *
 * 현행 2호·4호의 「**또는 분양권**」은 §88 10호 「분양권」 정의 신설(2021-01-01 시행)과 함께 들어왔다.
 * ⇒ 2021-01-01은 **분양권 신설의 적용례**이지 조합원입주권에 대한 기산일이 아니다.
 *   `type === "redevelopment_right"`에 이 게이트를 걸면 §104⑦4호(+30%p) 사안이 2호(+20%p)로
 *   계산된다(리뷰 실측 Δ 109,725,000원 · **과소과세**).
 *
 * ### 그럼에도 지금 고치지 않는 이유
 *
 * 정정은 **납세자에게 불리한 방향**이고, 옳은 대체 게이트가 둘로 갈린다:
 *   (a) 조합원입주권에는 취득일 게이트 **없음** — 위 본문 독해의 귀결.
 *   (b) §104⑦ 신설 개정(법률 제15225호 · 시행 2018-04-01)의 **부칙 적용례**가 취득시기를 정했다면 그 날.
 *
 * (b)를 배제하려면 제15225호 부칙 본문을 읽어야 하는데, 법제처 DRF 부칙 조회에는
 * `KOREAN_LAW_OC` 키가 필요하고 이 저장소 `.env.local`에는 없다(MCP `applicable_law`의 부칙
 * 발췌는 **최근 6건**만 반환해 2018년까지 닿지 않는다). 근거를 읽지 못한 채 불리 방향으로
 * 바꾸지 않는다 — memory `feedback_unverified_authority_blocks_tax_change` ·
 * `feedback_no_unfavorable_application_without_legal_basis`.
 *
 * ⇒ 착수 조건: **제15225호 부칙 적용례 본문 실독**. 그때까지 현행 동작을 유지하고
 *   `__tests__/tax-engine/transfer-tax/presale-right-type-date-gate.characterization.test.ts`가
 *   조용한 변경을 막는다.
 */
export function isPresaleRightCounted(right: PresaleRight, presaleStartDate: Date): boolean {
  if (right.acquisitionDate < presaleStartDate) return false;
  const rc = right.regionCriteria ?? (right.region === "capital" ? "REGION" : "VALUE");
  if (rc === "VALUE" && (right.rightValue ?? Infinity) <= MULTI_HOUSE.PRESALE_LOW_VALUE_CAP) return false;
  return true;
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
  const officetelStartDate = new Date(rules.officetelStartDate);

  for (const house of houses) {
    // 배제 1: 상속주택 N년 이내
    if (house.isInherited && house.inheritedDate) {
      const yearsFromInheritance = differenceInYears(transferDate, house.inheritedDate);
      if (yearsFromInheritance < rules.inheritedHouseYears) {
        excluded.push({
          houseId: house.id,
          reason: "inherited_5years",
          detail: `상속개시일(${house.inheritedDate.toISOString().slice(0, 10)})로부터 ${yearsFromInheritance}년 (${rules.inheritedHouseYears}년 미경과)`,
        });
        continue;
      }
    }

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

    // 배제 2: 장기임대 등록주택 (말소 전)
    if (house.isLongTermRental && rules.rentalHousingExempt) {
      const isActive = !house.rentalCancelledDate || house.rentalCancelledDate > transferDate;
      if (isActive) {
        const qualifiesForExclusion = house.rentalType
          ? isLongTermRentalHousingExempt(house, transferDate)
          : true;
        if (qualifiesForExclusion) {
          const typeLabel = getRentalTypeLabel(house.rentalType);
          excluded.push({
            houseId: house.id,
            reason: "long_term_rental",
            detail: house.rentalType
              ? `장기임대사업자 등록주택 — ${typeLabel}`
              : "장기임대사업자 등록주택 (말소 전)",
          });
          continue;
        }
      }
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

    // 배제 4: 미분양주택 (조특법 §99-3)
    if (house.isUnsoldHousing) {
      excluded.push({
        houseId: house.id,
        reason: "unsold_housing",
        detail: `미분양주택 (${MULTI_HOUSE.UNSOLD_HOUSING_EXEMPTION})`,
      });
      continue;
    }

    // 배제 5: 주거용 오피스텔 경과규정 이전 취득분
    if (house.isOfficetel && house.acquisitionDate < officetelStartDate) {
      excluded.push({
        houseId: house.id,
        reason: "officetel_pre2022",
        detail: `주거용 오피스텔 ${officetelStartDate.toISOString().slice(0, 10)} 이전 취득 — 경과규정 적용`,
      });
      continue;
    }

    // 배제 6: ⑬ 소형 신축/미분양 특례
    if (isSmallNewHouseSpecial(house)) {
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
    if (isPopDecline && house.isSecondHomeRegistered) {
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
