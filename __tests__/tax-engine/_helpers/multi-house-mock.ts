/**
 * 다주택 중과세 테스트 공용 Mock 데이터·헬퍼
 *
 * multi-house-surcharge 전담 엔진 테스트 시나리오 파일들이 공유하는
 * Mock 규칙 데이터와 HouseInfo/MultiHouseSurchargeInput 팩토리 함수.
 */

import type {
  HouseInfo,
  MultiHouseSurchargeInput,
  HouseCountExclusionRules,
  RegulatedAreaHistory,
} from "@/lib/tax-engine/multi-house-surcharge";
import type { SurchargeSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";

// ============================================================
// Mock 규칙 데이터
// ============================================================

export const defaultRules: HouseCountExclusionRules = {
  type: "house_count_exclusion",
  inheritedHouseYears: 5,
  rentalHousingExempt: true,
  lowPriceThreshold: {
    capital: null,         // 수도권은 저가 배제 없음
    non_capital: 100_000_000,
  },
  presaleRightStartDate: "2021-01-01",
  officetelStartDate: "2022-01-01",
};

/** 서울 종로구(11110), 강남구(11680) — 지정 2017.8.3, 해제 2023.1.5 */
export const mockRegulatedHistory: RegulatedAreaHistory = {
  type: "regulated_area_history",
  regions: [
    {
      code: "11110",
      name: "서울 종로구",
      designations: [
        { designatedDate: "2017-08-03", releasedDate: "2023-01-05" },
      ],
    },
    {
      code: "11680",
      name: "서울 강남구",
      designations: [
        { designatedDate: "2017-08-03", releasedDate: null }, // 현재도 지정
      ],
    },
  ],
};

/** 유예 활성 (2022.5.10 ~ 2026.5.9) */
export const suspensionActive: SurchargeSpecialRulesData = {
  surcharge_suspended: true,
  suspended_types: ["multi_house_2", "multi_house_3plus"],
  suspended_until: "2026-05-09",
};

/** 유예 없음 */
export const suspensionNone: SurchargeSpecialRulesData = {
  surcharge_suspended: false,
};

// ============================================================
// 헬퍼: 기본 주택 팩토리
// ============================================================

export function makeHouse(id: string, overrides?: Partial<HouseInfo>): HouseInfo {
  return {
    id,
    acquisitionDate: new Date("2020-01-01"),
    officialPrice: 300_000_000,
    region: "capital",
    isInherited: false,
    isLongTermRental: false,
    isApartment: true,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...overrides,
  };
}

export function makeInput(
  houses: HouseInfo[],
  overrides?: Partial<MultiHouseSurchargeInput>,
): MultiHouseSurchargeInput {
  return {
    houses,
    sellingHouseId: houses[0].id,
    transferDate: new Date("2024-06-01"),
    isOneHousehold: true,
    presaleRights: [],
    ...overrides,
  };
}
