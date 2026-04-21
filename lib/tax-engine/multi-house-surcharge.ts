/**
 * 다주택 중과세 전담 순수 엔진 (Layer 2)
 *
 * DB 직접 호출 없음. 모든 규칙 데이터는 매개변수로 주입.
 *
 * 법적 근거:
 *   소득세법 §104 (세율), §152 (1세대 범위),
 *   소령 §167-3 (주택 수 산정), §167-3 ① 2호 (3주택+ 중과 배제 14가지),
 *   소령 §167-10 (2주택 중과 배제 10가지),
 *   §155 ⑤ (혼인합가), §155 ⑦ (동거봉양), §167-11 (분양권 포함)
 */

import { addYears, differenceInYears } from "date-fns";
import { isSurchargeSuspended } from "./tax-utils";
import { MULTI_HOUSE } from "./legal-codes";
import type { SurchargeSpecialRulesData } from "./schemas/rate-table.schema";

// ============================================================
// 타입 정의 — 공개 타입은 ./types/multi-house-surcharge.types 로 분리
// ============================================================

import type {
  RentalHousingType,
  HouseInfo,
  PresaleRight,
  MultiHouseSurchargeInput,
  ExcludedHouse,
  ExclusionReason,
  MultiHouseSurchargeResult,
  HouseCountExclusionRules,
  RegulatedAreaDesignation,
  RegulatedAreaInfo,
  RegulatedAreaHistory,
  TaxSimulationInput,
  TaxScenario,
  MultiHouseTaxSimulation,
} from "./types/multi-house-surcharge.types";

// 하위 호환: "./multi-house-surcharge"에서 직접 타입을 import하던 기존 소비자들을 위해 재수출
export type {
  RentalHousingType,
  HouseInfo,
  PresaleRight,
  MultiHouseSurchargeInput,
  ExcludedHouse,
  ExclusionReason,
  MultiHouseSurchargeResult,
  HouseCountExclusionRules,
  RegulatedAreaDesignation,
  RegulatedAreaInfo,
  RegulatedAreaHistory,
  TaxSimulationInput,
  TaxScenario,
  MultiHouseTaxSimulation,
};

// ============================================================
// 지역기준/가액기준 자동 분류 (소령 §167-3 Stage 2)
// 시군구코드(5자리) 기반
// ============================================================

/**
 * 시군구코드(5자리)로 지역기준/가액기준을 자동 분류한다.
 *
 * - REGION: 수도권(서울·인천·경기 주요지역)·광역시(군 제외)·세종 → 가액 불문 주택 수 산입
 * - VALUE:  지방 및 수도권 내 군 지역 → 양도 공시가 3억 초과만 산입
 *
 * regionCriteria 필드가 명시되지 않고 regionCode가 제공된 경우에 사용.
 * 5자리 시군구코드 체계상 경기도 내 읍·면 단위 세분화는 불가(주요 군 지역만 처리).
 */
export function classifyRegionCriteriaByCode(regionCode: string): "REGION" | "VALUE" {
  if (!regionCode || regionCode.length < 2) return "VALUE";

  const sidoCode = regionCode.substring(0, 2);
  const sggCode = regionCode.substring(0, 5);

  // 서울특별시(11): 전역 REGION
  if (sidoCode === "11") return "REGION";

  // 인천광역시(28): 강화군(28710)·옹진군(28720) VALUE, 나머지 REGION
  if (sidoCode === "28") {
    if (sggCode === "28710" || sggCode === "28720") return "VALUE";
    return "REGION";
  }

  // 경기도(41): 가평군(41820)·연천군(41810)·양평군(41830) VALUE, 나머지 REGION
  if (sidoCode === "41") {
    if (sggCode === "41810" || sggCode === "41820" || sggCode === "41830") return "VALUE";
    return "REGION";
  }

  // 부산광역시(26): 기장군(26710) VALUE
  if (sidoCode === "26") {
    if (sggCode === "26710") return "VALUE";
    return "REGION";
  }

  // 대구광역시(27): 달성군(27710) VALUE
  if (sidoCode === "27") {
    if (sggCode === "27710") return "VALUE";
    return "REGION";
  }

  // 광주광역시(29): 군 지역 없음 → 전역 REGION
  if (sidoCode === "29") return "REGION";

  // 대전광역시(30): 군 지역 없음 → 전역 REGION
  if (sidoCode === "30") return "REGION";

  // 울산광역시(31): 울주군(31710) VALUE
  if (sidoCode === "31") {
    if (sggCode === "31710") return "VALUE";
    return "REGION";
  }

  // 세종특별자치시(36): REGION
  // (읍·면 세분화는 10자리 bjdCode 필요, 5자리 시군구 체계상 전체 REGION 처리)
  if (sidoCode === "36") return "REGION";

  // 기타 도 지역(강원42, 충북43, 충남44, 전북45, 전남46, 경북47, 경남48, 제주50): VALUE
  return "VALUE";
}

// ============================================================
// 인구감소지역 자동 판정
// 행안부 고시 기준 인구감소지역 시군구코드 목록
// ============================================================

/**
 * 인구감소지역 시군구코드 집합 (행안부 고시 제2021-72호 및 이후 개정).
 * 해당 지역 소재 주택 중 세컨드홈 특례 등록 시 주택 수 산정 배제 (소령 §167-3 ① 2호의2).
 * 기준시가 9억 이하 조건은 UI 입력(officialPrice)으로 별도 검증.
 */
export const POPULATION_DECLINE_AREA_CODES = new Set<string>([
  // 강원특별자치도
  "42150", // 삼척시
  "42180", // 태백시
  "42710", // 홍천군
  "42720", // 횡성군
  "42730", // 영월군
  "42740", // 평창군
  "42750", // 정선군
  "42760", // 철원군
  "42770", // 화천군
  "42780", // 양구군
  "42790", // 인제군
  "42800", // 고성군(강원)
  "42810", // 양양군
  // 충청북도
  "43720", // 보은군
  "43730", // 옥천군
  "43740", // 영동군
  "43750", // 괴산군
  "43760", // 단양군
  "43745", // 증평군
  "43800", // 제천시 (일부 포함)
  // 충청남도
  "44180", // 공주시
  "44210", // 보령시
  "44230", // 논산시
  "44250", // 계룡시
  "44710", // 금산군
  "44760", // 부여군
  "44770", // 서천군
  "44790", // 청양군
  "44800", // 홍성군
  "44810", // 예산군
  "44825", // 태안군
  // 전라북도 (전북특별자치도)
  "45190", // 남원시
  "45710", // 진안군
  "45720", // 무주군
  "45730", // 장수군
  "45740", // 임실군
  "45750", // 순창군
  "45790", // 고창군
  "45800", // 부안군
  // 전라남도
  "46720", // 담양군
  "46730", // 곡성군
  "46740", // 구례군
  "46800", // 고흥군
  "46810", // 보성군
  "46820", // 화순군
  "46830", // 장흥군
  "46840", // 강진군
  "46850", // 해남군
  "46860", // 영암군
  "46870", // 무안군 (일부)
  "46880", // 함평군
  "46890", // 영광군
  "46900", // 장성군
  "46910", // 완도군
  "46920", // 진도군
  "46930", // 신안군
  // 경상북도
  "47140", // 상주시
  "47150", // 문경시
  "47720", // 의성군
  "47730", // 청송군
  "47740", // 영양군
  "47750", // 영덕군
  "47760", // 청도군
  "47770", // 고령군
  "47780", // 성주군
  "47820", // 봉화군
  "47830", // 울진군
  "47840", // 울릉군
  // 경상남도
  "48250", // 의령군
  "48310", // 함안군
  "48320", // 창녕군
  "48820", // 고성군(경남)
  "48840", // 남해군
  "48850", // 하동군
  "48860", // 산청군
  "48870", // 함양군
  "48880", // 거창군
  "48890", // 합천군
]);

/**
 * 인구감소지역 관심지역 코드 (기준시가 4억 이하 조건).
 * 인구감소지역(9억)보다 완화된 세컨드홈 특례 적용 지역.
 */
export const POPULATION_INTEREST_AREA_CODES = new Set<string>([
  "42150", // 삼척시 (관심+감소 중복)
  "45750", // 순창군 (관심)
  "46720", // 담양군 (관심)
  "47140", // 상주시 (관심)
]);

/**
 * 시군구코드로 인구감소지역 여부를 자동 판정한다.
 * @returns `{ isDeclineArea: boolean; priceLimit: number }` — 기준시가 한도 포함
 */
export function classifyPopulationDeclineArea(regionCode: string): {
  isDeclineArea: boolean;
  priceLimit: number;
} {
  if (!regionCode) return { isDeclineArea: false, priceLimit: 0 };
  const sggCode = regionCode.substring(0, 5);
  if (POPULATION_DECLINE_AREA_CODES.has(sggCode)) {
    return { isDeclineArea: true, priceLimit: 900_000_000 };
  }
  return { isDeclineArea: false, priceLimit: 0 };
}

// ============================================================
// Step 1: 조정대상지역 시점 판단
// ============================================================

export function isRegulatedAreaAtDate(
  regionCode: string,
  referenceDate: Date,
  history: RegulatedAreaHistory,
): boolean {
  const region = history.regions.find((r) => r.code === regionCode);
  if (!region) return false;

  for (const designation of region.designations) {
    const designated = new Date(designation.designatedDate);
    const released = designation.releasedDate ? new Date(designation.releasedDate) : null;

    if (referenceDate >= designated && (!released || referenceDate <= released)) {
      return true;
    }
  }
  return false;
}

/** 특정 지역의 최초 조정대상지역 지정일 반환 (⑪ 공고일 이전 계약 배제용) */
function getFirstDesignatedDate(
  regionCode: string,
  history: RegulatedAreaHistory,
): Date | null {
  const region = history.regions.find((r) => r.code === regionCode);
  if (!region || region.designations.length === 0) return null;

  const dates = region.designations.map((d) => new Date(d.designatedDate));
  return dates.sort((a, b) => a.getTime() - b.getTime())[0];
}

// ============================================================
// 장기임대주택 유형별 판정 (가목~자목, A~I)
// 소령 §167-3 ① 2호
// ============================================================

/** 임대기간(년) 계산 */
function calcRentalPeriodYears(house: HouseInfo): number {
  if (house.rentalPeriodYears != null) return house.rentalPeriodYears;
  if (house.rentalStartDate && house.rentalEndDate) {
    return differenceInYears(house.rentalEndDate, house.rentalStartDate);
  }
  return 0;
}

/** 기본 임대사업자 등록 요건 충족 여부 */
function hasBasicRegistration(house: HouseInfo): boolean {
  return !!(
    house.isRegisteredRental &&
    house.rentalRegistrationDate &&
    house.businessRegistrationDate
  );
}

/** 가목 — 민간매입임대 5년 (2018.4.2 이전 등록, 5년 이상, 5%룰) */
function checkRentalType_A(house: HouseInfo): boolean {
  if (!hasBasicRegistration(house)) return false;
  const bizDate = house.businessRegistrationDate!;
  const rentDate = house.rentalRegistrationDate!;
  if (bizDate > new Date("2018-04-02") || rentDate > new Date("2018-04-02")) return false;
  if (calcRentalPeriodYears(house) < 5) return false;
  const price = house.rentalStartOfficialPrice ?? house.officialPrice;
  const isCapital = house.isCapitalArea ?? house.region === "capital";
  if (price > (isCapital ? 600_000_000 : 300_000_000)) return false;
  if (!house.rentIncreaseUnder5Pct) return false;
  return true;
}

/** 나목 — 기존사업자 민간매입임대 (2003.10.29 이전 등록, 국민주택 2호+, 3억 이하) */
function checkRentalType_B(house: HouseInfo): boolean {
  if (!hasBasicRegistration(house)) return false;
  if (house.businessRegistrationDate! > new Date("2003-10-29")) return false;
  if (calcRentalPeriodYears(house) < 5) return false;
  if (!house.isNationalSizeHousing) return false;
  if (!house.hasMinimum2Units) return false;
  const price = house.acquisitionOfficialPrice ?? house.officialPrice;
  if (price > 300_000_000) return false;
  return true;
}

/** 다목 — 민간건설임대 5년 (2018.4.2 이전, 298㎡·149㎡, 6억, 2호+) */
function checkRentalType_C(house: HouseInfo): boolean {
  if (!hasBasicRegistration(house)) return false;
  const bizDate = house.businessRegistrationDate!;
  const rentDate = house.rentalRegistrationDate!;
  if (bizDate > new Date("2018-04-02") || rentDate > new Date("2018-04-02")) return false;
  if (calcRentalPeriodYears(house) < 5 && !house.isConvertedToSale) return false;
  if (!house.hasMinimum2Units) return false;
  if ((house.landArea ?? 0) > 298) return false;
  if ((house.totalFloorArea ?? 0) > 149) return false;
  const price = house.rentalStartOfficialPrice ?? house.officialPrice;
  if (price > 600_000_000) return false;
  if (!house.rentIncreaseUnder5Pct) return false;
  return true;
}

/** 라목 — 미분양 매입임대 (2008.6.11~2009.6.30, 비수도권, 3억, 5호+) */
function checkRentalType_D(house: HouseInfo): boolean {
  if (!hasBasicRegistration(house)) return false;
  if (calcRentalPeriodYears(house) < 5) return false;
  if (!house.firstSaleContractDate) return false;
  const contractDate = house.firstSaleContractDate;
  if (contractDate < new Date("2008-06-11") || contractDate > new Date("2009-06-30")) return false;
  if ((house.landArea ?? 0) > 298) return false;
  if ((house.totalFloorArea ?? 0) > 149) return false;
  const price = house.acquisitionOfficialPrice ?? house.officialPrice;
  if (price > 300_000_000) return false;
  if (house.isCapitalArea) return false; // 비수도권만
  if (!house.hasMinimum5UnitsInCity) return false;
  if (house.isExcludedAfter20200711Apt) return false;
  return true;
}

/**
 * 마목 — 장기일반 매입임대 10년
 * 2020.8.18 이전 등록: 8년, 이후: 10년
 * 수도권 6억/비수도권 3억, 5%룰
 * 2018.9.14 이후 취득 조정지역 1주택+ 제외, 2020.7.11 이후 등록 아파트 제외
 */
function checkRentalType_E(house: HouseInfo): boolean {
  if (!hasBasicRegistration(house)) return false;
  const regDate = house.rentalRegistrationDate!;
  const requiredYears = regDate < new Date("2020-08-18") ? 8 : 10;
  if (calcRentalPeriodYears(house) < requiredYears) return false;
  const price = house.rentalStartOfficialPrice ?? house.officialPrice;
  const isCapital = house.isCapitalArea ?? house.region === "capital";
  if (price > (isCapital ? 600_000_000 : 300_000_000)) return false;
  if (!house.rentIncreaseUnder5Pct) return false;
  if (house.isExcluded918Rule) return false;
  if (house.isExcludedAfter20200711Apt) return false;
  if (house.isExcludedShortToLongChange) return false;
  return true;
}

/**
 * 바목 — 장기일반 건설임대 10년
 * 2호+, 298㎡·149㎡, 6억(2025.2.28 이후 9억), 5%룰
 */
function checkRentalType_F(house: HouseInfo): boolean {
  if (!hasBasicRegistration(house)) return false;
  if (calcRentalPeriodYears(house) < 10 && !house.isConvertedToSale) return false;
  if (!house.hasMinimum2Units) return false;
  if ((house.landArea ?? 0) > 298) return false;
  if ((house.totalFloorArea ?? 0) > 149) return false;
  const price = house.rentalStartOfficialPrice ?? house.officialPrice;
  const bizDate = house.businessRegistrationDate;
  const rentDate = house.rentalRegistrationDate;
  const latestRegDate = bizDate && rentDate
    ? new Date(Math.max(bizDate.getTime(), rentDate.getTime()))
    : (rentDate ?? bizDate);
  const priceLimit = latestRegDate && latestRegDate >= new Date("2025-02-28")
    ? 900_000_000
    : 600_000_000;
  if (price > priceLimit) return false;
  if (!house.rentIncreaseUnder5Pct) return false;
  if (house.isExcludedShortToLongChange) return false;
  return true;
}

/** 사목 — 자진·자동 말소 후 양도 (2020.8.18 이후 말소, 의무기간 1/2+, 1년 내 양도) */
function checkRentalType_G(house: HouseInfo): boolean {
  if (!hasBasicRegistration(house)) return false;
  if (!house.rentalCancellationDate) return false;
  if (house.rentalCancellationDate < new Date("2020-08-18")) return false;
  if (!house.hasHalfDutyPeriodMet) return false;
  if (!house.isSoldWithin1YearOfCancellation) return false;
  return true;
}

/**
 * 아목 — 단기 매입임대 6년 (2025.6.4 이후 신설)
 * 아파트 제외, 6년+, 수도권 4억/비수도권 2억, 5%룰
 */
function checkRentalType_H(house: HouseInfo): boolean {
  if (!hasBasicRegistration(house)) return false;
  const bizDate = house.businessRegistrationDate;
  const rentDate = house.rentalRegistrationDate;
  const latestRegDate = bizDate && rentDate
    ? new Date(Math.max(bizDate.getTime(), rentDate.getTime()))
    : (rentDate ?? bizDate);
  if (!latestRegDate || latestRegDate < new Date("2025-06-04")) return false;
  if (house.isApartment) return false;
  if (calcRentalPeriodYears(house) < 6) return false;
  const price = house.rentalStartOfficialPrice ?? house.officialPrice;
  const isCapital = house.isCapitalArea ?? house.region === "capital";
  if (price > (isCapital ? 400_000_000 : 200_000_000)) return false;
  if (!house.rentIncreaseUnder5Pct) return false;
  if (house.isExcluded918Rule && !house.hasContractDepositProof) return false;
  return true;
}

/**
 * 자목 — 단기 건설임대 6년 (2025.6.4 이후 신설)
 * 2호+, 아파트 제외, 298㎡·149㎡, 6년+, 6억, 5%룰
 */
function checkRentalType_I(house: HouseInfo): boolean {
  if (!hasBasicRegistration(house)) return false;
  const bizDate = house.businessRegistrationDate;
  const rentDate = house.rentalRegistrationDate;
  const latestRegDate = bizDate && rentDate
    ? new Date(Math.max(bizDate.getTime(), rentDate.getTime()))
    : (rentDate ?? bizDate);
  if (!latestRegDate || latestRegDate < new Date("2025-06-04")) return false;
  if (house.isApartment) return false;
  if (!house.hasMinimum2Units) return false;
  if (calcRentalPeriodYears(house) < 6) return false;
  if ((house.landArea ?? 0) > 298) return false;
  if ((house.totalFloorArea ?? 0) > 149) return false;
  const price = house.rentalStartOfficialPrice ?? house.officialPrice;
  if (price > 600_000_000) return false;
  if (!house.rentIncreaseUnder5Pct) return false;
  return true;
}

/**
 * ② 장기임대주택 중과배제 여부 (가~자목 유형별 검증)
 * rentalType 미제공 시 legacy boolean 판정으로 폴백.
 */
export function isLongTermRentalHousingExempt(house: HouseInfo, transferDate: Date): boolean {
  if (!house.isLongTermRental) return false;

  // 말소 완료 주택은 배제 불가 (countEffectiveHouses와 별개로 중과배제에서도 판단)
  if (house.rentalCancelledDate && house.rentalCancelledDate <= transferDate) return false;

  if (!house.rentalType) {
    // legacy fallback: 등록일 + 기간 5년 이상
    return !!(
      house.isRegisteredRental &&
      house.rentalRegistrationDate &&
      house.businessRegistrationDate &&
      calcRentalPeriodYears(house) >= 5
    );
  }

  switch (house.rentalType) {
    case "A": return checkRentalType_A(house);
    case "B": return checkRentalType_B(house);
    case "C": return checkRentalType_C(house);
    case "D": return checkRentalType_D(house);
    case "E": return checkRentalType_E(house);
    case "F": return checkRentalType_F(house);
    case "G": return checkRentalType_G(house);
    case "H": return checkRentalType_H(house);
    case "I": return checkRentalType_I(house);
    default: return false;
  }
}

/** 장기임대 유형 라벨 */
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
// 조세특례제한법 §99조의2 등
// ============================================================

/**
 * ⑬ 소형 신축주택 또는 비수도권 준공 후 미분양 특례 해당 여부.
 * 해당 시 주택 수 산정 배제 AND 중과세 배제 동시 적용.
 *
 * 소형 신축주택:
 *   - 취득일: 2024.1.10 ~ 2027.12.31
 *   - 전용면적 60㎡ 이하, 아파트 제외
 *   - 취득가액: 수도권 6억/비수도권 3억 이하
 *
 * 비수도권 준공 후 미분양:
 *   - 취득일: 2024.1.10 ~ 2025.12.31
 *   - 전용면적 85㎡ 이하, 취득가액 6억 이하
 *   - 비수도권 소재, isUnsoldNewHouse === true
 */
export function isSmallNewHouseSpecial(house: HouseInfo): boolean {
  if (!house.acquisitionDate || !house.acquisitionPrice) return false;

  const acqDate = house.acquisitionDate;
  const isCapital = house.isCapitalArea ?? house.region === "capital";

  // 소형 신축주택
  const smallNewHouseStart = new Date("2024-01-10");
  const smallNewHouseEnd = new Date("2027-12-31");
  if (
    acqDate >= smallNewHouseStart &&
    acqDate <= smallNewHouseEnd &&
    (house.exclusiveArea ?? 0) <= 60 &&
    !house.isApartment &&
    house.acquisitionPrice <= (isCapital ? 600_000_000 : 300_000_000)
  ) {
    return true;
  }

  // 비수도권 준공 후 미분양
  const unsoldStart = new Date("2024-01-10");
  const unsoldEnd = new Date("2025-12-31");
  if (
    acqDate >= unsoldStart &&
    acqDate <= unsoldEnd &&
    !isCapital &&
    (house.exclusiveArea ?? 0) <= 85 &&
    house.acquisitionPrice <= 600_000_000 &&
    house.isUnsoldNewHouse
  ) {
    return true;
  }

  return false;
}

// ============================================================
// ③ 조특법 감면 임대주택 판정
// ============================================================

/**
 * ③ 조특법 감면 대상 장기임대주택 여부.
 * 조세특례제한법 §97 등 — 국민주택규모 + 5년 이상 임대.
 */
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
 * 세대 보유 주택 수 산정.
 * 배제 규정 적용 후 유효 주택 수와 제외 내역 반환.
 *
 * 배제 주택:
 *   1. 상속주택 — 상속개시일로부터 N년(기본 5년) 이내
 *   2. 장기임대 등록주택 — 말소 전, 유형별 요건 충족 시
 *   3. 지역기준/가액기준 이분법 (§167-3)
 *      - REGION(수도권·광역시·세종): 가액 불문 무조건 산입
 *      - VALUE(지방): 양도 시 공시가 3억 이하 배제
 *      - regionCriteria 미제공: non_capital 1억 기준 (하위호환)
 *   4. 미분양주택 (조특법 §99-3)
 *   5. 주거용 오피스텔 — 오피스텔 산정시작일 이전 취득분 (경과규정)
 *   6. ⑬ 소형 신축/미분양 주택 특례
 *
 * 포함:
 *   - 분양권/입주권 — 분양권 산정시작일(2021.1.1) 이후 취득분
 */
export function countEffectiveHouses(
  houses: HouseInfo[],
  transferDate: Date,
  presaleRights: PresaleRight[],
  rules: HouseCountExclusionRules,
): { count: number; excluded: ExcludedHouse[] } {
  const excluded: ExcludedHouse[] = [];
  let count = 0;

  const presaleStartDate = new Date(rules.presaleRightStartDate);
  const officetelStartDate = new Date(rules.officetelStartDate);

  for (const house of houses) {
    // 배제 규칙 1: 상속주택 N년 이내
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

    // 배제 규칙 2: 장기임대 등록주택 (말소 전)
    // rentalType이 명시된 경우 가~자목 세부 요건 검증, 미제공 시 legacy boolean 판정
    if (house.isLongTermRental && rules.rentalHousingExempt) {
      const isActive = !house.rentalCancelledDate || house.rentalCancelledDate > transferDate;
      if (isActive) {
        const qualifiesForExclusion = house.rentalType
          ? isLongTermRentalHousingExempt(house, transferDate)
          : true; // legacy: isLongTermRental boolean만으로 판단
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

    // 배제 규칙 3: 지역기준/가액기준 이분법 (소령 §167-3)
    // 우선순위: regionCriteria(명시) > regionCode(자동) > region(legacy)
    const criteria: "REGION" | "VALUE" =
      house.regionCriteria ??
      (house.regionCode
        ? classifyRegionCriteriaByCode(house.regionCode)
        : house.region === "capital"
          ? "REGION"
          : "VALUE");

    if (criteria === "VALUE") {
      if (rules.lowPriceThreshold.local !== undefined) {
        // VALUE 지역 + local 기준 (3억) — regionCriteria 명시 또는 regionCode 자동분류 포함
        const priceToCheck = house.transferOfficialPrice ?? house.officialPrice;
        if (priceToCheck <= rules.lowPriceThreshold.local) {
          excluded.push({
            houseId: house.id,
            reason: "low_price_local_300",
            detail: `지방(VALUE) 양도 공시가격 ${priceToCheck.toLocaleString()}원 (${rules.lowPriceThreshold.local.toLocaleString()}원 이하)`,
          });
          continue;
        }
      } else if (!house.regionCriteria && !house.regionCode) {
        // legacy: regionCriteria·regionCode 모두 미제공 → non_capital 기준 (하위호환)
        if (house.officialPrice <= rules.lowPriceThreshold.non_capital) {
          excluded.push({
            houseId: house.id,
            reason: "low_price_non_capital",
            detail: `비수도권 공시가격 ${house.officialPrice.toLocaleString()}원 (${rules.lowPriceThreshold.non_capital.toLocaleString()}원 이하)`,
          });
          continue;
        }
      }
    }

    // 배제 규칙 4: 미분양주택 (조특법 §99-3)
    if (house.isUnsoldHousing) {
      excluded.push({
        houseId: house.id,
        reason: "unsold_housing",
        detail: `미분양주택 (${MULTI_HOUSE.UNSOLD_HOUSING_EXEMPTION})`,
      });
      continue;
    }

    // 배제 규칙 5: 주거용 오피스텔 — 경과규정 이전 취득분
    if (house.isOfficetel && house.acquisitionDate < officetelStartDate) {
      excluded.push({
        houseId: house.id,
        reason: "officetel_pre2022",
        detail: `주거용 오피스텔 ${officetelStartDate.toISOString().slice(0, 10)} 이전 취득 — 경과규정 적용`,
      });
      continue;
    }

    // 배제 규칙 6: ⑬ 소형 신축/미분양 특례
    if (isSmallNewHouseSpecial(house)) {
      excluded.push({
        houseId: house.id,
        reason: "small_new_house",
        detail: `소형 신축/미분양 특례 (전용 ${house.exclusiveArea ?? "?"}㎡, 취득가 ${(house.acquisitionPrice ?? 0).toLocaleString()}원)`,
      });
      continue;
    }

    // 배제 규칙 7: ⑭ 인구감소지역 세컨드홈 특례 (소령 §167-3 ① 2호의2)
    // isPopulationDeclineArea 미제공 시 regionCode로 자동 판정
    const isPopDecline =
      house.isPopulationDeclineArea ??
      (house.regionCode ? classifyPopulationDeclineArea(house.regionCode).isDeclineArea : false);
    if (isPopDecline && house.isSecondHomeRegistered) {
      excluded.push({
        houseId: house.id,
        reason: "population_decline_second_home",
        detail: `인구감소지역 세컨드홈 특례 (${MULTI_HOUSE.SECOND_HOME_DEPOPULATION}) — 주택 수 산정 배제`,
      });
      continue;
    }

    count++;
  }

  // 분양권/입주권: 산정시작일(2021.1.1) 이후 취득분 포함
  for (const right of presaleRights) {
    if (right.acquisitionDate >= presaleStartDate) {
      count++;
    }
  }

  return { count, excluded };
}

// ============================================================
// 내부 헬퍼: 3주택+ ①~⑨ 그룹 배제 판정 (⑩번 "유일한 1주택" 판정용)
// ============================================================

/**
 * 3주택+ 중과배제 ①~⑨ 항목 중 하나라도 해당하면 true 반환.
 * ⑩번 "배제 후 유일한 1주택" 판정을 위해 양도 주택 외 다른 주택에 적용.
 */
function isGroupExcludable(house: HouseInfo, transferDate: Date): boolean {
  // ① 지방 저가주택 (VALUE + 양도 공시가 3억 이하)
  if (house.regionCriteria === "VALUE") {
    const price = house.transferOfficialPrice ?? house.officialPrice;
    if (price <= 300_000_000) return true;
  }

  // ② 장기임대 등록주택 (A~I 유형 또는 legacy)
  if (isLongTermRentalHousingExempt(house, transferDate)) return true;

  // ③ 조특법 감면 임대주택
  if (isTaxIncentiveRentalHousingExempt(house)) return true;

  // ④ 사원용 주택 10년 이상
  if (house.isEmployeeHousing && (house.freeProvisionYears ?? 0) >= 10) return true;

  // ⑤ 조특법 특례
  if (house.isTaxSpecialExemption) return true;

  // ⑥ 문화재
  if (house.isCulturalHeritage) return true;

  // ⑦ 상속주택 5년 이내
  if (house.isInherited && house.inheritedDate) {
    if (differenceInYears(transferDate, house.inheritedDate) < 5) return true;
  }

  // ⑧ 저당권 실행 3년 이내
  if (house.isMortgageExecution) {
    if (differenceInYears(transferDate, house.acquisitionDate) < 3) return true;
  }

  // ⑨ 어린이집 5년 이상
  if (house.isDayCareCenter && (house.dayCareOperationYears ?? 0) >= 5) return true;

  return false;
}

function getGroupExcludeReason(house: HouseInfo, transferDate: Date): string {
  if (house.regionCriteria === "VALUE") {
    const price = house.transferOfficialPrice ?? house.officialPrice;
    if (price <= 300_000_000) return "① 지방 저가주택 (3억 이하)";
  }
  if (isLongTermRentalHousingExempt(house, transferDate)) {
    return `② 장기임대주택 (${getRentalTypeLabel(house.rentalType)})`;
  }
  if (isTaxIncentiveRentalHousingExempt(house)) return "③ 조특법 감면 임대주택";
  if (house.isEmployeeHousing && (house.freeProvisionYears ?? 0) >= 10) return "④ 사원용 주택 (10년 이상)";
  if (house.isTaxSpecialExemption) return "⑤ 조특법 특례";
  if (house.isCulturalHeritage) return "⑥ 문화재";
  if (house.isInherited && house.inheritedDate) {
    if (differenceInYears(transferDate, house.inheritedDate) < 5) return "⑦ 상속주택 (5년 이내)";
  }
  if (house.isMortgageExecution) {
    if (differenceInYears(transferDate, house.acquisitionDate) < 3) return "⑧ 저당권 실행 (3년 이내)";
  }
  if (house.isDayCareCenter && (house.dayCareOperationYears ?? 0) >= 5) return "⑨ 어린이집 (5년 이상)";
  return "일반주택 (배제 불가)";
}

// ============================================================
// 한시 유예 조건부 판정 (2022.5.10 ~ 2026.5.9)
// 소령 §167-3, §167-10 — 계약일·잔금일·토지허가구역 조건
// ============================================================

/** 유예 기간 최종 종료일 */
const GRACE_PERIOD_END = new Date("2026-05-09");

/** 신규 조정대상지역 지정 기준일 (이후 지정된 지역은 잔금 기한 6개월) */
const GRACE_NEW_DESIGNATION_DATE = new Date("2025-10-16");

/**
 * 한시 유예 기간 내 계약일 기준 중과세 배제 판정.
 *
 * 조건A: 매매계약 체결일 ≤ 2026.5.9
 * 조건B: 계약일 → 양도일 ≤ 4개월 (신규 지정지역은 6개월)
 * 조건C: 토지거래허가구역 + 임차인 거주 → 무기한 연장
 *
 * 최종 판정: A AND (B OR C) → 유예 적용
 *
 * @param transferDate 양도일(잔금청산일)
 * @param gracePeriod  계약일·토지허가 등 유예 조건 데이터
 */
function checkGracePeriodExemption(
  transferDate: Date,
  gracePeriod: NonNullable<MultiHouseSurchargeInput["gracePeriod"]>,
): boolean {
  const { contractDate, isLandPermitArea, hasTenantInResidence, areaDesignatedDate } = gracePeriod;

  // 조건A: 계약일이 유예 종료일 이하
  if (contractDate > GRACE_PERIOD_END) return false;

  // 잔금 허용 기한 결정 (신규 지정지역 2025.10.16 이후: 6개월, 기존: 4개월)
  const isNewlyDesignated = areaDesignatedDate && areaDesignatedDate >= GRACE_NEW_DESIGNATION_DATE;
  const maxMonths = isNewlyDesignated ? 6 : 4;

  // 조건B: 계약일로부터 maxMonths 이내 잔금 청산
  const deadlineDate = new Date(contractDate);
  deadlineDate.setMonth(deadlineDate.getMonth() + maxMonths);
  const conditionB = transferDate <= deadlineDate;

  // 조건C: 토지거래허가구역 + 임차인 거주 → 무기한 연장
  const conditionC = isLandPermitArea && hasTenantInResidence;

  // 최종: A AND (B OR C)
  return conditionB || conditionC;
}

// ============================================================
// Step 3: 중과세 배제 사유 판단 (소령 §167-10, §167-3 ①)
// ============================================================

/**
 * 주택 수 산정 후에도 중과세를 배제해야 하는 사유 판단.
 *
 * 공통 배제 (2주택·3주택+ 모두):
 *   1. 일시적 2주택 (effectiveHouseCount === 2)
 *   2. 혼인합가 5년 이내 (§155 ⑤)
 *   3. 동거봉양 합가 10년 이내 (§155 ⑦)
 *   4. ⑪ 공고일 이전 매매계약 + 계약금 증빙
 *
 * 3주택+ 전용 배제 (§167-3 ① 2호, 양도 주택 자체 해당):
 *   5. ⑧ 저당권 실행 3년 이내
 *   6. ④ 사원용 주택 10년 이상
 *   7. ⑤ 조특법 특례
 *   8. ⑥ 문화재
 *   9. ⑨ 어린이집 5년 이상
 *  10. ③ 조특법 감면 임대주택
 *  11. ⑬ 소형 신축/미분양 (산정 배제 통과 후에도 중과배제 적용)
 *
 * 유예:
 *   - 한시 유예 (2022.5.10~2026.5.9)
 *
 * ※ ⑩번 "배제 후 유일한 1주택"은 determineMultiHouseSurcharge()에서 별도 처리
 */
function determineSurchargeExclusion(
  input: MultiHouseSurchargeInput,
  effectiveHouseCount: number,
  isRegulated: boolean,
  suspensionRules: SurchargeSpecialRulesData | null,
  regulatedAreaHistory: RegulatedAreaHistory | null,
  excludedHouseIds: Set<string>,
): {
  isExcluded: boolean;
  exclusionReasons: ExclusionReason[];
  isSuspended: boolean;
} {
  const exclusionReasons: ExclusionReason[] = [];
  const sellingHouse = input.houses.find((h) => h.id === input.sellingHouseId);

  // ── 공통 배제 ──

  // 배제 1: 일시적 2주택
  if (effectiveHouseCount === 2 && input.temporaryTwoHouse) {
    const { previousHouseId, newHouseId } = input.temporaryTwoHouse;
    if (input.sellingHouseId === previousHouseId) {
      const newHouse = input.houses.find((h) => h.id === newHouseId);
      if (newHouse) {
        const relaxDate = new Date("2022-05-10");
        const deadlineYears = isRegulated && newHouse.acquisitionDate < relaxDate ? 1 : 3;
        const deadline = addYears(newHouse.acquisitionDate, deadlineYears);
        if (input.transferDate <= deadline) {
          exclusionReasons.push({
            type: "temporary_two_house",
            detail: `신규주택 취득일(${newHouse.acquisitionDate.toISOString().slice(0, 10)}) + ${deadlineYears}년 처분기한 이내`,
          });
          return { isExcluded: true, exclusionReasons, isSuspended: false };
        }
      }
    }
  }

  // 배제 2: 혼인합가 5년 이내 (§155 ⑤)
  if (input.marriageMerge) {
    const yearsFromMarriage = differenceInYears(input.transferDate, input.marriageMerge.marriageDate);
    if (yearsFromMarriage < 5) {
      exclusionReasons.push({
        type: "marriage_merge",
        detail: `혼인합가 후 ${yearsFromMarriage}년 (5년 이내)`,
      });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }
  }

  // 배제 3: 동거봉양 합가 10년 이내 (§155 ⑦)
  if (input.parentalCareMerge) {
    const yearsFromMerge = differenceInYears(input.transferDate, input.parentalCareMerge.mergeDate);
    if (yearsFromMerge < 10) {
      exclusionReasons.push({
        type: "parental_care_merge",
        detail: `동거봉양 합가 후 ${yearsFromMerge}년 (10년 이내)`,
      });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }
  }

  // 배제 4: ⑪ 공고일 이전 매매계약 + 계약금 지급 증빙
  if (
    sellingHouse?.contractDate &&
    sellingHouse.hasContractDepositProof &&
    sellingHouse.regionCode &&
    regulatedAreaHistory
  ) {
    const firstDesignatedDate = getFirstDesignatedDate(sellingHouse.regionCode, regulatedAreaHistory);
    if (firstDesignatedDate && sellingHouse.contractDate < firstDesignatedDate) {
      exclusionReasons.push({
        type: "pre_designation_contract",
        detail: `매매계약일(${sellingHouse.contractDate.toISOString().slice(0, 10)}) < 조정대상지역 지정일(${firstDesignatedDate.toISOString().slice(0, 10)}) + 계약금 증빙 확인`,
      });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }
  }

  // ── 3주택+ 전용 배제 (양도 주택 자체가 배제 항목 해당) ──
  if (effectiveHouseCount >= 3 && sellingHouse) {
    // 배제 5: ⑧ 저당권 실행 취득 3년 이내
    if (sellingHouse.isMortgageExecution) {
      const yearsHeld = differenceInYears(input.transferDate, sellingHouse.acquisitionDate);
      if (yearsHeld < 3) {
        exclusionReasons.push({
          type: "mortgage_execution_3years",
          detail: `저당권 실행·채권변제 취득(${sellingHouse.acquisitionDate.toISOString().slice(0, 10)})로부터 ${yearsHeld}년 (3년 미경과)`,
        });
        return { isExcluded: true, exclusionReasons, isSuspended: false };
      }
    }

    // 배제 6: ④ 사원용 주택 10년 이상
    if (sellingHouse.isEmployeeHousing && (sellingHouse.freeProvisionYears ?? 0) >= 10) {
      exclusionReasons.push({
        type: "employee_housing_10years",
        detail: `사원용 주택 ${sellingHouse.freeProvisionYears}년 무상 제공 (10년 이상)`,
      });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }

    // 배제 7: ⑤ 조특법 특례
    if (sellingHouse.isTaxSpecialExemption) {
      exclusionReasons.push({
        type: "tax_special_exemption",
        detail: "조세특례제한법 특례 적용 주택",
      });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }

    // 배제 8: ⑥ 문화재(국가유산)
    if (sellingHouse.isCulturalHeritage) {
      exclusionReasons.push({
        type: "cultural_heritage",
        detail: "국가유산(문화재) 주택",
      });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }

    // 배제 9: ⑨ 어린이집 5년 이상 운영
    if (sellingHouse.isDayCareCenter && (sellingHouse.dayCareOperationYears ?? 0) >= 5) {
      exclusionReasons.push({
        type: "daycare_center_5years",
        detail: `어린이집 ${sellingHouse.dayCareOperationYears}년 운영 (5년 이상)`,
      });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }

    // 배제 10: ③ 조특법 감면 임대주택
    if (isTaxIncentiveRentalHousingExempt(sellingHouse)) {
      exclusionReasons.push({
        type: "tax_incentive_rental",
        detail: `조특법 감면 장기임대주택 (국민주택 ${calcRentalPeriodYears(sellingHouse)}년 임대)`,
      });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }

    // 배제 11: ⑬ 소형 신축/미분양 특례 (countEffectiveHouses에서 걸러졌어야 하나 안전망)
    if (isSmallNewHouseSpecial(sellingHouse)) {
      exclusionReasons.push({
        type: "small_new_house",
        detail: `소형 신축/미분양 특례 (전용 ${sellingHouse.exclusiveArea ?? "?"}㎡)`,
      });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }
  }

  // ── 2주택 전용 배제 (소령 §167-10 ①) ──
  if (effectiveHouseCount === 2 && sellingHouse) {
    // 이 시점에서 유효 주택이 정확히 2채 → 양도 주택 외 유효한 다른 주택 1채
    const otherEffectiveHouses = input.houses.filter(
      (h) => h.id !== input.sellingHouseId && !excludedHouseIds.has(h.id),
    );

    // ③ 취학·근무상 형편·질병 등 부득이한 사유 (소령 §167-10 ① 3호)
    // 요건: 취득 당시 기준시가 3억 이하 + 1년 이상 거주 + 사유 해소 후 3년 이내
    const hasUnavoidableHouse = otherEffectiveHouses.some((h) => {
      if (!h.isUnavoidableReason) return false;
      if ((h.unavoidableResidenceYears ?? 0) < 1) return false;
      // 기준시가 3억 이하 요건 (취득 당시 officialPrice 사용)
      if (h.officialPrice > 300_000_000) return false;
      // 사유 해소 후 3년 이내 요건
      if (h.unavoidableReasonResolvedDate) {
        const yearsFromResolved = differenceInYears(input.transferDate, h.unavoidableReasonResolvedDate);
        if (yearsFromResolved >= 3) return false;
      }
      return true;
    });
    if (hasUnavoidableHouse) {
      exclusionReasons.push({
        type: "unavoidable_reason_two_house",
        detail: `취학·근무상 형편·질병 요양 등 부득이한 사유로 취득한 주택 (기준시가 3억 이하·1년 이상 거주) 보유 — 2주택 중과배제 (${MULTI_HOUSE.TWO_HOUSE_UNAVOIDABLE})`,
      });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }

    // ⑧ 소송 취득/진행 중 주택 (소령 §167-10 ① 8호) — 2주택 전용
    // 소송 진행 중: 배제, 법원 결정 취득 후 3년 이내: 배제
    const hasLitigationHouse = otherEffectiveHouses.some((h) => {
      if (!h.isLitigationHousing) return false;
      if (h.litigationAcquisitionDate) {
        // 법원 결정 취득: 3년 이내만 배제
        return differenceInYears(input.transferDate, h.litigationAcquisitionDate) < 3;
      }
      // 소송 진행 중: 기간 제한 없이 배제
      return true;
    });
    if (hasLitigationHouse) {
      const litigationHouse = otherEffectiveHouses.find((h) => h.isLitigationHousing)!;
      const detail = litigationHouse.litigationAcquisitionDate
        ? `법원 결정 취득(${litigationHouse.litigationAcquisitionDate.toISOString().slice(0, 10)})로부터 3년 이내 — 2주택 중과배제 (${MULTI_HOUSE.TWO_HOUSE_LITIGATION})`
        : `소송 진행 중인 주택 보유 — 2주택 중과배제 (${MULTI_HOUSE.TWO_HOUSE_LITIGATION})`;
      exclusionReasons.push({ type: "litigation_housing_two_house", detail });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }

    // ⑩ 기준시가 1억 이하 소형 주택 (정비구역 제외) (소령 §167-10 ① 10호)
    // 다른 주택의 기준시가가 1억 이하이고 정비구역이 아닌 경우 배제
    const hasLowPriceSmallHouse = otherEffectiveHouses.some(
      (h) => h.officialPrice <= 100_000_000 && !h.isRedevelopmentZone,
    );
    if (hasLowPriceSmallHouse) {
      exclusionReasons.push({
        type: "low_price_two_house",
        detail: `기준시가 1억 이하 소형 주택 보유로 2주택 중과배제 (${MULTI_HOUSE.TWO_HOUSE_SMALL_HOUSE})`,
      });
      return { isExcluded: true, exclusionReasons, isSuspended: false };
    }
  }

  // 유예: 한시 유예 판단 (2022.5.10 ~ 2026.5.9)
  const surchargeKey = effectiveHouseCount >= 3 ? "multi_house_3plus" : "multi_house_2";
  let suspended = false;

  if (input.gracePeriod && suspensionRules?.surcharge_suspended) {
    // gracePeriod 제공 시: 계약일 기준 A/B/C 조건 종합 판정
    // suspended_types 필터도 적용
    const typeMatches =
      !suspensionRules.suspended_types ||
      suspensionRules.suspended_types.includes(surchargeKey);
    if (typeMatches) {
      suspended = checkGracePeriodExemption(input.transferDate, input.gracePeriod);
    }
  } else if (suspensionRules) {
    // gracePeriod 미제공: suspended_until 날짜 기준으로만 판단 (기존 동작 유지)
    suspended = isSurchargeSuspended(suspensionRules, input.transferDate, surchargeKey);
  }

  return { isExcluded: false, exclusionReasons, isSuspended: suspended };
}

// ============================================================
// 메인 함수: determineMultiHouseSurcharge
// ============================================================

/**
 * 다주택 중과세 판정 메인 함수.
 *
 * @param input              세대 보유 주택 정보 + 양도 정보
 * @param houseCountRules    주택 수 산정 배제 규칙 (DB: transfer:special:house_count_exclusion)
 * @param regulatedAreaHistory  조정대상지역 이력, null 허용
 * @param suspensionRules    중과세 유예 규칙, null 허용
 * @param isRegulatedFallback   regionCode 미제공 시 사용할 조정대상지역 여부 플래그
 */
export function determineMultiHouseSurcharge(
  input: MultiHouseSurchargeInput,
  houseCountRules: HouseCountExclusionRules,
  regulatedAreaHistory: RegulatedAreaHistory | null,
  suspensionRules: SurchargeSpecialRulesData | null,
  isRegulatedFallback: boolean,
): MultiHouseSurchargeResult {
  const warnings: string[] = [];

  // Step 1: 주택 수 산정
  const { count: effectiveHouseCount, excluded: excludedHouses } = countEffectiveHouses(
    input.houses,
    input.transferDate,
    input.presaleRights,
    houseCountRules,
  );

  const rawHouseCount = input.houses.length + input.presaleRights.length;

  // Step 2: 조정대상지역 판단
  const sellingHouse = input.houses.find((h) => h.id === input.sellingHouseId);
  let isRegulatedAtTransfer = isRegulatedFallback;

  if (sellingHouse?.regionCode && regulatedAreaHistory) {
    isRegulatedAtTransfer = isRegulatedAreaAtDate(
      sellingHouse.regionCode,
      input.transferDate,
      regulatedAreaHistory,
    );
  } else if (sellingHouse && !sellingHouse.regionCode) {
    warnings.push("양도 주택의 regionCode 미제공 — isRegulatedArea 플래그 사용");
  }

  // Step 3: 1주택 이하 → 중과 없음
  if (effectiveHouseCount <= 1) {
    return {
      effectiveHouseCount,
      rawHouseCount,
      excludedHouses,
      isRegulatedAtTransfer,
      surchargeApplicable: false,
      surchargeType: "none",
      isSurchargeSuspended: false,
      exclusionReasons: [],
      warnings,
    };
  }

  // Step 4: 비조정지역 → 중과 없음
  if (!isRegulatedAtTransfer) {
    return {
      effectiveHouseCount,
      rawHouseCount,
      excludedHouses,
      isRegulatedAtTransfer,
      surchargeApplicable: false,
      surchargeType: "none",
      isSurchargeSuspended: false,
      exclusionReasons: [],
      warnings,
    };
  }

  // Step 5: 3주택+ → ⑩번 "배제 후 유일한 1주택" 판정
  if (effectiveHouseCount >= 3) {
    const excludedHouseIds = new Set(excludedHouses.map((e) => e.houseId));
    const otherEffectiveHouses = input.houses.filter(
      (h) => h.id !== input.sellingHouseId && !excludedHouseIds.has(h.id),
    );

    const perHouseExclusion = otherEffectiveHouses.map((h) => ({
      houseId: h.id,
      reason: isGroupExcludable(h, input.transferDate)
        ? getGroupExcludeReason(h, input.transferDate)
        : null,
    }));

    const remainingGeneralCount = perHouseExclusion.filter((e) => e.reason === null).length;

    if (remainingGeneralCount === 0 && otherEffectiveHouses.length > 0) {
      const exclusionReasons: ExclusionReason[] = [
        {
          type: "only_one_remaining",
          detail: `양도 주택 외 다른 주택(${otherEffectiveHouses.length}채)이 모두 ①~⑨ 배제 항목에 해당하여 유일한 일반주택 (${MULTI_HOUSE.THREE_HOUSE_EXCLUSION_SOLE})`,
        },
      ];
      return {
        effectiveHouseCount,
        rawHouseCount,
        excludedHouses,
        isRegulatedAtTransfer,
        surchargeApplicable: false,
        surchargeType: "none",
        isSurchargeSuspended: false,
        exclusionReasons,
        warnings,
        onlyOneRemainingDetail: {
          totalEffective: effectiveHouseCount,
          otherHousesExcluded: perHouseExclusion.map((e) => ({
            houseId: e.houseId,
            reason: e.reason ?? "일반주택 (배제 불가)",
          })),
        },
      };
    }
  }

  // Step 6: 중과 배제 사유 및 유예 판단
  const { isExcluded, exclusionReasons, isSuspended } = determineSurchargeExclusion(
    input,
    effectiveHouseCount,
    isRegulatedAtTransfer,
    suspensionRules,
    regulatedAreaHistory,
    new Set(excludedHouses.map((e) => e.houseId)),
  );

  if (isExcluded) {
    return {
      effectiveHouseCount,
      rawHouseCount,
      excludedHouses,
      isRegulatedAtTransfer,
      surchargeApplicable: false,
      surchargeType: "none",
      isSurchargeSuspended: false,
      exclusionReasons,
      warnings,
    };
  }

  // Step 7: 중과세 유형 결정
  const surchargeType: "multi_house_2" | "multi_house_3plus" =
    effectiveHouseCount >= 3 ? "multi_house_3plus" : "multi_house_2";

  return {
    effectiveHouseCount,
    rawHouseCount,
    excludedHouses,
    isRegulatedAtTransfer,
    surchargeApplicable: !isSuspended,
    surchargeType,
    isSurchargeSuspended: isSuspended,
    exclusionReasons,
    warnings,
  };
}

// ============================================================
// 세금 시뮬레이션 — 기본세율 vs 중과세율 비교
// ============================================================

/** 기본 누진세율 구간 (2026년 기준) */
const BASIC_TAX_BRACKETS: ReadonlyArray<{
  min: number; max: number; rate: number; deduction: number;
}> = [
  { min: 0,              max: 14_000_000,   rate: 0.06, deduction: 0 },
  { min: 14_000_000,     max: 50_000_000,   rate: 0.15, deduction: 1_260_000 },
  { min: 50_000_000,     max: 88_000_000,   rate: 0.24, deduction: 5_760_000 },
  { min: 88_000_000,     max: 150_000_000,  rate: 0.35, deduction: 15_440_000 },
  { min: 150_000_000,    max: 300_000_000,  rate: 0.38, deduction: 19_940_000 },
  { min: 300_000_000,    max: 500_000_000,  rate: 0.40, deduction: 25_940_000 },
  { min: 500_000_000,    max: 1_000_000_000, rate: 0.42, deduction: 35_940_000 },
  { min: 1_000_000_000,  max: Infinity,      rate: 0.45, deduction: 65_940_000 },
];

/** 중과 가산세율 */
const SURCHARGE_ADDON_RATES: Record<"multi_house_2" | "multi_house_3plus", number> = {
  multi_house_2: 0.20,
  multi_house_3plus: 0.30,
};

/** 일반 장기보유특별공제율 (보유 3~15년, 연 2%, 최대 30%) */
function calcLtscGeneral(holdingYears: number): number {
  if (holdingYears < 3) return 0;
  return Math.min(Math.floor(holdingYears) * 0.02, 0.30);
}

/** 단순 누진세 계산 (가산세율 포함) */
function calcTax(taxableIncome: number, addonRate: number): number {
  if (taxableIncome <= 0) return 0;
  const bracket = BASIC_TAX_BRACKETS.find(
    (b) => taxableIncome >= b.min && taxableIncome < b.max,
  ) ?? BASIC_TAX_BRACKETS[BASIC_TAX_BRACKETS.length - 1];
  return Math.max(
    0,
    Math.floor(taxableIncome * (bracket.rate + addonRate) - bracket.deduction),
  );
}

/**
 * 다주택 중과세 적용 시 기본세율 대비 추가 세부담 시뮬레이션.
 *
 * 기본세율 시나리오: 장기보유특별공제 적용 (3년 이상 보유 시 연 2%, 최대 30%)
 * 중과세율 시나리오: 장기보유특별공제 0%, 기본세율 + 20%p(2주택) / +30%p(3주택+) 가산
 */
export function buildMultiHouseTaxSimulation(
  input: TaxSimulationInput,
): MultiHouseTaxSimulation {
  const capitalGain = Math.max(0, input.salePrice - input.acquisitionPrice - input.expenses);

  // ── 기본세율 시나리오 (장기보유특별공제 O) ──
  const ltscRate = calcLtscGeneral(input.holdingYears);
  const ltscAmount = Math.floor(capitalGain * ltscRate);
  const basicTaxableIncome = Math.max(0, capitalGain - ltscAmount);
  const basicTax = calcTax(basicTaxableIncome, 0);
  const basicEffectiveRate =
    basicTaxableIncome > 0 ? ((basicTax / basicTaxableIncome) * 100).toFixed(1) + "%" : "0%";

  // ── 중과세율 시나리오 (장기보유특별공제 X, 가산세율 추가) ──
  const heavyTaxableIncome = capitalGain; // 장기보유공제 없음
  const addonRate = SURCHARGE_ADDON_RATES[input.surchargeType];
  const heavyTax = calcTax(heavyTaxableIncome, addonRate);
  const heavyEffectiveRate =
    heavyTaxableIncome > 0 ? ((heavyTax / heavyTaxableIncome) * 100).toFixed(1) + "%" : "0%";

  const additionalTax = Math.max(0, heavyTax - basicTax);
  const additionalTaxFormatted = (additionalTax / 10_000).toFixed(0) + "만원";

  return {
    capitalGain,
    holdingYears: input.holdingYears,
    basicScenario: {
      label: "기본세율 (일반 양도)",
      ltscAmount,
      taxableIncome: basicTaxableIncome,
      tax: basicTax,
      effectiveRate: basicEffectiveRate,
    },
    heavyScenario: {
      label: `중과세율 (${input.surchargeType === "multi_house_2" ? "2주택 +20%p" : "3주택+ +30%p"})`,
      ltscAmount: 0,
      taxableIncome: heavyTaxableIncome,
      tax: heavyTax,
      effectiveRate: heavyEffectiveRate,
    },
    additionalTax,
    additionalTaxFormatted,
  };
}
