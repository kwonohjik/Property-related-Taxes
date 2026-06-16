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
import { classifyPopulationDeclineArea } from "./data/population-decline-areas";
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

  // 경기: 가평군(41820)·연천군(41810)·양평군(41830) VALUE, 나머지 REGION
  if (sidoCode === "41") {
    if (sggCode === "41810" || sggCode === "41820" || sggCode === "41830") return "VALUE";
    return "REGION";
  }

  // 부산: 기장군(26710) VALUE
  if (sidoCode === "26") {
    if (sggCode === "26710") return "VALUE";
    return "REGION";
  }

  // 대구: 달성군(27710) VALUE
  if (sidoCode === "27") {
    if (sggCode === "27710") return "VALUE";
    return "REGION";
  }

  if (sidoCode === "29") return "REGION"; // 광주
  if (sidoCode === "30") return "REGION"; // 대전

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
  if (house.isCapitalArea) return false;
  if (!house.hasMinimum5UnitsInCity) return false;
  if (house.isExcludedAfter20200711Apt) return false;
  return true;
}

/**
 * 마목 — 장기일반 매입임대 10년
 * 2020.8.18 이전 등록: 8년, 이후: 10년
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
 * ② 장기임대주택 중과배제 여부 (가~자목 유형별 검증).
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
      if (rules.lowPriceThreshold.local !== undefined) {
        const priceToCheck = house.transferOfficialPrice ?? house.officialPrice;
        if (priceToCheck <= rules.lowPriceThreshold.local) {
          excluded.push({
            houseId: house.id,
            reason: "low_price_local_300",
            detail: `지방(VALUE) 양도 공시가격 ${priceToCheck.toLocaleString()} (${rules.lowPriceThreshold.local.toLocaleString()} 이하)`,
          });
          continue;
        }
      } else if (!house.regionCriteria && !house.regionCode) {
        if (house.officialPrice <= rules.lowPriceThreshold.non_capital) {
          excluded.push({
            houseId: house.id,
            reason: "low_price_non_capital",
            detail: `비수도권 공시가격 ${house.officialPrice.toLocaleString()} (${rules.lowPriceThreshold.non_capital.toLocaleString()} 이하)`,
          });
          continue;
        }
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

    // 배제 7: ⑭ 인구감소지역 세컨드홈 특례 (소령 §167-3 ① 2호의2)
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
