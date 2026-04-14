/**
 * 다주택 중과세 전담 순수 엔진 (Layer 2)
 *
 * DB 직접 호출 없음. 모든 규칙 데이터는 매개변수로 주입.
 *
 * 법적 근거:
 *   소득세법 §104 (세율), §152 (1세대 범위), §167-3 (주택 수 산정),
 *   §167-10 (중과 배제), §155 ⑨ (상속주택), 소령 §167-11 (분양권 포함)
 */

import { addYears, differenceInYears } from "date-fns";
import { isSurchargeSuspended } from "./tax-utils";
import type { SurchargeSpecialRulesData } from "./schemas/rate-table.schema";

// ============================================================
// 타입 정의
// ============================================================

/** 세대 구성원이 보유한 주택 1채 정보 */
export interface HouseInfo {
  /** 내부 식별자 */
  id: string;
  /** 취득일 */
  acquisitionDate: Date;
  /** 공시가격 (원) */
  officialPrice: number;
  /** 수도권/비수도권 구분 */
  region: "capital" | "non_capital";
  /** 시군구 코드 — 조정대상지역 시점 조회용 (없으면 isRegulatedArea 플래그 사용) */
  regionCode?: string;
  /** 상속주택 여부 */
  isInherited: boolean;
  /** 상속개시일 (isInherited === true 시 필수) */
  inheritedDate?: Date;
  /** 장기임대사업자 등록주택 여부 */
  isLongTermRental: boolean;
  /** 임대사업자 등록일 */
  rentalRegistrationDate?: Date;
  /** 임대사업자 말소일 (말소 시 중과 산정에 포함됨) */
  rentalCancelledDate?: Date;
  /** 아파트 여부 */
  isApartment: boolean;
  /** 주거용 오피스텔 여부 (2022.1.1 이후 취득분 산정 포함) */
  isOfficetel: boolean;
  /** 미분양주택 여부 (조특법 §99-3) */
  isUnsoldHousing: boolean;
}

/** 분양권/입주권 정보 (2021.1.1 이후 취득분 → 주택 수 산정 포함) */
export interface PresaleRight {
  id: string;
  type: "presale_right" | "redevelopment_right";
  acquisitionDate: Date;
  region: "capital" | "non_capital";
}

/** 다주택 중과세 판정 입력 */
export interface MultiHouseSurchargeInput {
  /** 세대 보유 전체 주택 목록 */
  houses: HouseInfo[];
  /** 양도 대상 주택 ID */
  sellingHouseId: string;
  /** 양도일 */
  transferDate: Date;
  /** 1세대 여부 */
  isOneHousehold: boolean;
  /** 일시적 2주택 정보 (종전주택 → 신규주택) */
  temporaryTwoHouse?: {
    previousHouseId: string; // 종전주택 (양도하는 주택)
    newHouseId: string;      // 신규주택
  };
  /** 혼인합가 정보 */
  marriageMerge?: {
    marriageDate: Date;
  };
  /** 동거봉양 합가 정보 */
  parentalCareMerge?: {
    mergeDate: Date;
  };
  /** 세대 보유 분양권/입주권 목록 */
  presaleRights: PresaleRight[];
}

/** 산정에서 제외된 주택과 사유 */
export interface ExcludedHouse {
  houseId: string;
  reason: "inherited_5years" | "long_term_rental" | "low_price_non_capital" | "unsold_housing" | "officetel_pre2022";
  detail: string;
}

/** 중과세 배제 사유 */
export interface ExclusionReason {
  type: "temporary_two_house" | "marriage_merge" | "parental_care_merge";
  detail: string;
}

/** 다주택 중과세 판정 결과 */
export interface MultiHouseSurchargeResult {
  /** 산정 후 유효 주택 수 (분양권 포함, 배제 주택 제외) */
  effectiveHouseCount: number;
  /** 단순 합계 주택 수 (배제 전) */
  rawHouseCount: number;
  /** 산정에서 제외된 주택 목록 */
  excludedHouses: ExcludedHouse[];
  /** 양도일 기준 조정대상지역 여부 */
  isRegulatedAtTransfer: boolean;
  /** 중과세 실제 적용 여부 (유예·배제 시 false) */
  surchargeApplicable: boolean;
  /**
   * 이론적 중과 유형 (surchargeApplicable === false여도 표시용으로 설정될 수 있음)
   * - "none": 중과 대상 아님 (1주택 or 비조정 or 배제사유)
   */
  surchargeType: "multi_house_2" | "multi_house_3plus" | "none";
  /** 중과세 한시 유예 중 여부 */
  isSurchargeSuspended: boolean;
  /** 중과 배제 사유 목록 */
  exclusionReasons: ExclusionReason[];
  /** 경고 메시지 */
  warnings: string[];
}

// ============================================================
// DB 파싱용 규칙 데이터 타입 (HouseCountExclusionRules)
// ============================================================

/** DB transfer:special:house_count_exclusion 에서 파싱된 주택 수 산정 규칙 */
export interface HouseCountExclusionRules {
  type: "house_count_exclusion";
  /** 상속주택 배제 기간 (년, 기본값 5) */
  inheritedHouseYears: number;
  /** 장기임대 등록주택 배제 여부 */
  rentalHousingExempt: boolean;
  /** 저가주택 공시가격 한도 */
  lowPriceThreshold: {
    capital: number | null; // null = 수도권은 저가 배제 없음
    non_capital: number;    // 100_000_000
  };
  /** 분양권 주택 수 산정 시작일 */
  presaleRightStartDate: string; // "2021-01-01"
  /** 주거용 오피스텔 산정 시작일 */
  officetelStartDate: string;    // "2022-01-01"
}

/** 조정대상지역 지정 이력 항목 */
export interface RegulatedAreaDesignation {
  /** 지정일 (YYYY-MM-DD) */
  designatedDate: string;
  /** 해제일 (YYYY-MM-DD), null = 현재 유효 */
  releasedDate: string | null;
}

/** 하나의 시군구 조정대상지역 이력 */
export interface RegulatedAreaInfo {
  code: string;
  name: string;
  designations: RegulatedAreaDesignation[];
}

/** DB transfer:special:regulated_areas 에서 파싱된 전체 이력 */
export interface RegulatedAreaHistory {
  type: "regulated_area_history";
  regions: RegulatedAreaInfo[];
}

// ============================================================
// Step 1: 조정대상지역 시점 판단
// ============================================================

/**
 * 해당 시군구(regionCode)가 referenceDate에 조정대상지역이었는지 판단.
 * 각 지정 구간: designatedDate <= referenceDate <= releasedDate (releasedDate 없으면 무기한)
 */
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

// ============================================================
// Step 2: 주택 수 산정 (소령 §167-3)
// ============================================================

/**
 * 세대 보유 주택 수 산정.
 * 배제 규정 적용 후 유효 주택 수와 제외 내역 반환.
 *
 * 배제 주택:
 *   1. 상속주택 — 상속개시일로부터 N년(기본 5년) 이내
 *   2. 장기임대 등록주택 — 말소 전 (말소 후 재산입)
 *   3. 비수도권 공시가격 N원(기본 1억) 이하
 *   4. 미분양주택 (조특법 §99-3 해당분)
 *   5. 주거용 오피스텔 — 오피스텔 산정시작일 이전 취득분 (경과규정)
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
    if (house.isLongTermRental && rules.rentalHousingExempt) {
      const isActive = !house.rentalCancelledDate || house.rentalCancelledDate > transferDate;
      if (isActive) {
        excluded.push({
          houseId: house.id,
          reason: "long_term_rental",
          detail: "장기임대사업자 등록 주택 (말소 전)",
        });
        continue;
      }
    }

    // 배제 규칙 3: 비수도권 공시가격 1억 이하
    if (house.region === "non_capital" && rules.lowPriceThreshold.non_capital !== null) {
      if (house.officialPrice <= rules.lowPriceThreshold.non_capital) {
        excluded.push({
          houseId: house.id,
          reason: "low_price_non_capital",
          detail: `비수도권 공시가격 ${house.officialPrice.toLocaleString()}원 (${rules.lowPriceThreshold.non_capital.toLocaleString()}원 이하)`,
        });
        continue;
      }
    }

    // 배제 규칙 4: 미분양주택 (조특법 §99-3)
    if (house.isUnsoldHousing) {
      excluded.push({
        houseId: house.id,
        reason: "unsold_housing",
        detail: "미분양주택 (조특법 §99-3)",
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
// Step 3: 중과세 배제 사유 판단 (소령 §167-10)
// ============================================================

/**
 * 주택 수 산정 후에도 중과세를 배제해야 하는 사유 판단.
 * 배제 대상: 일시적 2주택, 혼인합가, 동거봉양 합가
 * 유예 대상: 한시 유예 (2022.5.10~2026.5.9)
 */
function determineSurchargeExclusion(
  input: MultiHouseSurchargeInput,
  effectiveHouseCount: number,
  isRegulated: boolean,
  suspensionRules: SurchargeSpecialRulesData | null,
): {
  isExcluded: boolean;
  exclusionReasons: ExclusionReason[];
  isSuspended: boolean;
} {
  const exclusionReasons: ExclusionReason[] = [];

  // 배제 1: 일시적 2주택 (effectiveHouseCount === 2, 양도주택 = 종전주택)
  if (effectiveHouseCount === 2 && input.temporaryTwoHouse) {
    const { previousHouseId, newHouseId } = input.temporaryTwoHouse;

    if (input.sellingHouseId === previousHouseId) {
      const newHouse = input.houses.find((h) => h.id === newHouseId);
      if (newHouse) {
        // 처분기한 결정:
        //   - 신규주택 취득일 2022.5.10 이전 + 조정지역 → 1년 (구 기준)
        //   - 그 외 → 3년 (완화 기준)
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

  // 배제 2: 혼인합가 5년 이내 (소득세법 §155 ⑤)
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

  // 배제 3: 동거봉양 합가 10년 이내 (소득세법 §155 ⑦)
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

  // 유예: 한시 유예 판단
  const surchargeKey = effectiveHouseCount >= 3 ? "multi_house_3plus" : "multi_house_2";
  const suspended = suspensionRules
    ? isSurchargeSuspended(suspensionRules, input.transferDate, surchargeKey)
    : false;

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
 * @param regulatedAreaHistory  조정대상지역 이력 (DB: transfer:special:regulated_areas), null 허용
 * @param suspensionRules    중과세 유예 규칙 (DB: transfer:surcharge:_default special_rules)
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

  // Step 4: 비조정지역 → 중과 없음 (§104 ① — 조정대상지역 한정)
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

  // Step 5: 중과 배제 사유 및 유예 판단
  const { isExcluded, exclusionReasons, isSuspended } = determineSurchargeExclusion(
    input,
    effectiveHouseCount,
    isRegulatedAtTransfer,
    suspensionRules,
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

  // Step 6: 중과세 유형 결정
  const surchargeType: "multi_house_2" | "multi_house_3plus" =
    effectiveHouseCount >= 3 ? "multi_house_3plus" : "multi_house_2";

  return {
    effectiveHouseCount,
    rawHouseCount,
    excludedHouses,
    isRegulatedAtTransfer,
    // 유예 중이면 실제 적용 안함, 유형은 표시용으로 유지
    surchargeApplicable: !isSuspended,
    surchargeType, // 유예여도 이론적 유형 표시 (surchargeApplicable=false로 실제 미적용)
    isSurchargeSuspended: isSuspended,
    exclusionReasons,
    warnings,
  };
}
