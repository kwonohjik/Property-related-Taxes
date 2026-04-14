/**
 * 다주택 중과세 전담 엔진 단위 테스트
 *
 * MH-01 ~ MH-12: 주택 수 산정·조정대상지역 판단·배제·유예 시나리오
 * DB 없이 Mock 규칙 데이터로 순수 엔진 검증
 */

import { describe, it, expect } from "vitest";
import {
  countEffectiveHouses,
  isRegulatedAreaAtDate,
  determineMultiHouseSurcharge,
  isLongTermRentalHousingExempt,
  isSmallNewHouseSpecial,
  isTaxIncentiveRentalHousingExempt,
  classifyRegionCriteriaByCode,
  classifyPopulationDeclineArea,
  buildMultiHouseTaxSimulation,
  type HouseInfo,
  type PresaleRight,
  type MultiHouseSurchargeInput,
  type HouseCountExclusionRules,
  type RegulatedAreaHistory,
} from "@/lib/tax-engine/multi-house-surcharge";
import type { SurchargeSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";

// ============================================================
// Mock 규칙 데이터
// ============================================================

const defaultRules: HouseCountExclusionRules = {
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
const mockRegulatedHistory: RegulatedAreaHistory = {
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
const suspensionActive: SurchargeSpecialRulesData = {
  surcharge_suspended: true,
  suspended_types: ["multi_house_2", "multi_house_3plus"],
  suspended_until: "2026-05-09",
};

/** 유예 없음 */
const suspensionNone: SurchargeSpecialRulesData = {
  surcharge_suspended: false,
};

// ============================================================
// 헬퍼: 기본 주택 팩토리
// ============================================================

function makeHouse(id: string, overrides?: Partial<HouseInfo>): HouseInfo {
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

function makeInput(
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

// ============================================================
// MH-01: 3주택 중 1채 비수도권 1억 이하 → 유효 주택 수 2
// ============================================================

describe("MH-01: 비수도권 1억 이하 주택 산정 제외", () => {
  it("3주택 중 비수도권 공시가 1억 이하 1채 → effectiveHouseCount=2", () => {
    const h1 = makeHouse("h1", { region: "capital", officialPrice: 500_000_000 });
    const h2 = makeHouse("h2", { region: "capital", officialPrice: 400_000_000 });
    const h3 = makeHouse("h3", {
      region: "non_capital",
      officialPrice: 90_000_000, // 1억 미만
    });

    const { count, excluded } = countEffectiveHouses(
      [h1, h2, h3],
      new Date("2024-06-01"),
      [],
      defaultRules,
    );

    expect(count).toBe(2);
    expect(excluded).toHaveLength(1);
    expect(excluded[0].houseId).toBe("h3");
    expect(excluded[0].reason).toBe("low_price_non_capital");
  });

  it("비수도권 공시가 정확히 1억 이하 경계값 → 제외", () => {
    const h1 = makeHouse("h1", { region: "non_capital", officialPrice: 100_000_000 });
    const { count } = countEffectiveHouses([h1], new Date("2024-06-01"), [], defaultRules);
    expect(count).toBe(0); // 제외됨
  });

  it("비수도권 공시가 1억 + 1원 초과 → 포함", () => {
    const h1 = makeHouse("h1", { region: "non_capital", officialPrice: 100_000_001 });
    const { count } = countEffectiveHouses([h1], new Date("2024-06-01"), [], defaultRules);
    expect(count).toBe(1); // 포함
  });
});

// ============================================================
// MH-02: 상속주택 5년 이내 → 산정 제외
// ============================================================

describe("MH-02: 상속주택 5년 이내 산정 제외", () => {
  it("상속개시 4년 경과 → 제외", () => {
    const h1 = makeHouse("h1"); // 일반 주택
    const h2 = makeHouse("h2", {
      isInherited: true,
      inheritedDate: new Date("2020-01-01"), // 4년 전 상속
    });

    const { count, excluded } = countEffectiveHouses(
      [h1, h2],
      new Date("2024-01-01"),
      [],
      defaultRules,
    );

    expect(count).toBe(1);
    expect(excluded[0].reason).toBe("inherited_5years");
  });

  it("상속개시 5년 초과 → 포함 (배제 해제)", () => {
    const h1 = makeHouse("h1");
    const h2 = makeHouse("h2", {
      isInherited: true,
      inheritedDate: new Date("2019-01-01"), // 5년 이상 경과
    });

    const { count } = countEffectiveHouses(
      [h1, h2],
      new Date("2024-06-01"),
      [],
      defaultRules,
    );

    expect(count).toBe(2); // 두 채 모두 포함
  });
});

// ============================================================
// MH-03: 장기임대 등록주택 산정 제외 / 말소 시 포함
// ============================================================

describe("MH-03: 장기임대 등록주택 산정 제외 (말소 시 포함)", () => {
  it("임대 등록 유효 중 → 산정 제외", () => {
    const h1 = makeHouse("h1");
    const h2 = makeHouse("h2", {
      isLongTermRental: true,
      rentalRegistrationDate: new Date("2020-01-01"),
      rentalCancelledDate: undefined, // 말소 없음
    });

    const { count, excluded } = countEffectiveHouses(
      [h1, h2],
      new Date("2024-06-01"),
      [],
      defaultRules,
    );

    expect(count).toBe(1);
    expect(excluded[0].reason).toBe("long_term_rental");
  });

  it("임대 등록 말소 후 → 포함", () => {
    const h1 = makeHouse("h1");
    const h2 = makeHouse("h2", {
      isLongTermRental: true,
      rentalRegistrationDate: new Date("2020-01-01"),
      rentalCancelledDate: new Date("2023-01-01"), // 양도일 이전 말소
    });

    const { count } = countEffectiveHouses(
      [h1, h2],
      new Date("2024-06-01"),
      [],
      defaultRules,
    );

    expect(count).toBe(2); // 말소 후 재산입
  });
});

// ============================================================
// MH-04: 분양권 산정 시작일 경계값 (2021.1.1)
// ============================================================

describe("MH-04: 분양권 산정시작일 경계값", () => {
  it("2020.12.31 취득 분양권 → 주택 수 미포함", () => {
    const h1 = makeHouse("h1");
    const right: PresaleRight = {
      id: "r1",
      type: "presale_right",
      acquisitionDate: new Date("2020-12-31"),
      region: "capital",
    };

    const { count } = countEffectiveHouses([h1], new Date("2024-06-01"), [right], defaultRules);
    expect(count).toBe(1); // 분양권 미포함
  });

  it("2021.1.1 취득 분양권 → 주택 수 포함", () => {
    const h1 = makeHouse("h1");
    const right: PresaleRight = {
      id: "r1",
      type: "presale_right",
      acquisitionDate: new Date("2021-01-01"),
      region: "capital",
    };

    const { count } = countEffectiveHouses([h1], new Date("2024-06-01"), [right], defaultRules);
    expect(count).toBe(2); // 분양권 포함
  });
});

// ============================================================
// MH-05: 일시적 2주택 (조정→조정, 2022.5.9 이전 취득) → 1년 처분기한
// ============================================================

describe("MH-05: 일시적 2주택 (구 기준 1년 처분기한)", () => {
  it("신규주택 2022.5.9 취득 + 조정 + 1년 내 양도 → 배제", () => {
    // 강남구(11680, 해제일 없음)를 사용해야 양도일 기준 조정지역 유지
    const h1 = makeHouse("h1", { regionCode: "11680" }); // 종전주택 (강남구, 해제 없음)
    const h2 = makeHouse("h2", {
      acquisitionDate: new Date("2022-05-09"), // 2022.5.10 이전
      regionCode: "11680",
    });

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2023-05-08"), // 신규 취득일 + 1년 이내
      temporaryTwoHouse: { previousHouseId: "h1", newHouseId: "h2" },
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.exclusionReasons[0].type).toBe("temporary_two_house");
    expect(result.exclusionReasons[0].detail).toContain("1년");
  });

  it("신규주택 2022.5.9 취득 + 조정 + 1년 초과 양도 → 유예 중이면 suspended", () => {
    // 강남구(11680, 해제일 없음) — 양도일 기준으로도 조정대상지역 유지
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2", {
      acquisitionDate: new Date("2022-05-09"),
      regionCode: "11680",
    });

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2023-05-10"), // 1년 초과
      temporaryTwoHouse: { previousHouseId: "h1", newHouseId: "h2" },
    });

    // 유예 활성 → 중과 미적용, isSurchargeSuspended=true
    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.isSurchargeSuspended).toBe(true);
    expect(result.exclusionReasons).toHaveLength(0); // 배제 사유 아님, 유예
  });
});

// ============================================================
// MH-06: 일시적 2주택 (2022.5.10 이후 취득) → 3년 처분기한
// ============================================================

describe("MH-06: 일시적 2주택 (완화 기준 3년 처분기한)", () => {
  it("신규주택 2022.5.10 취득 + 3년 내 양도 → 배제", () => {
    // 강남구(11680, 해제일 없음) — 양도일 2025.5.9에도 조정대상지역
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2", {
      acquisitionDate: new Date("2022-05-10"), // 완화 기준일
    });

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2025-05-09"), // 3년 이내
      temporaryTwoHouse: { previousHouseId: "h1", newHouseId: "h2" },
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone, // 유예 없음으로 테스트
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.exclusionReasons[0].type).toBe("temporary_two_house");
    expect(result.exclusionReasons[0].detail).toContain("3년");
  });
});

// ============================================================
// MH-07: 혼인합가 5년 이내 → 중과 배제
// ============================================================

describe("MH-07: 혼인합가 5년 이내 중과 배제", () => {
  it("혼인 3년 후 양도 → 배제", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2");

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2024-06-01"),
      marriageMerge: { marriageDate: new Date("2021-06-01") }, // 3년 전 혼인
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.exclusionReasons[0].type).toBe("marriage_merge");
  });

  it("혼인 5년 초과 → 배제 안 됨 (중과 적용)", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2");

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2024-06-01"),
      marriageMerge: { marriageDate: new Date("2019-01-01") }, // 5년 이상 전 혼인
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.exclusionReasons).toHaveLength(0);
    expect(result.surchargeApplicable).toBe(true);
    expect(result.surchargeType).toBe("multi_house_2");
  });
});

// ============================================================
// MH-08: 양도일 기준 조정대상지역 해제 → 중과 미적용
// ============================================================

describe("MH-08: 조정대상지역 해제 후 양도 → 중과 미적용", () => {
  it("종로구 2023.1.5 해제 후 2024년 양도 → 비조정, 중과 없음", () => {
    const h1 = makeHouse("h1", { regionCode: "11110" }); // 종로구 (2023.1.5 해제)
    const h2 = makeHouse("h2");

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2024-01-01"), // 해제 후
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      false,
    );

    expect(result.isRegulatedAtTransfer).toBe(false);
    expect(result.surchargeApplicable).toBe(false);
    expect(result.surchargeType).toBe("none");
  });

  it("isRegulatedAreaAtDate: 종로구 2022년 12월 → true (지정 중)", () => {
    const isRegulated = isRegulatedAreaAtDate("11110", new Date("2022-12-31"), mockRegulatedHistory);
    expect(isRegulated).toBe(true);
  });

  it("isRegulatedAreaAtDate: 종로구 2023년 1월 5일 이후 → false (해제)", () => {
    const isRegulated = isRegulatedAreaAtDate("11110", new Date("2023-01-06"), mockRegulatedHistory);
    expect(isRegulated).toBe(false);
  });

  it("isRegulatedAreaAtDate: 강남구 2025년 → true (해제일 null)", () => {
    const isRegulated = isRegulatedAreaAtDate("11680", new Date("2025-01-01"), mockRegulatedHistory);
    expect(isRegulated).toBe(true);
  });

  it("isRegulatedAreaAtDate: 존재하지 않는 코드 → false", () => {
    const isRegulated = isRegulatedAreaAtDate("99999", new Date("2024-01-01"), mockRegulatedHistory);
    expect(isRegulated).toBe(false);
  });
});

// ============================================================
// MH-09: 중과 유예기간 → isSurchargeSuspended=true
// ============================================================

describe("MH-09: 중과 한시 유예 (2022.5.10~2026.5.9)", () => {
  it("양도일 2024.6.1 → 유예 적용, surchargeApplicable=false, isSurchargeSuspended=true", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2");

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2024-06-01"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.isSurchargeSuspended).toBe(true);
    expect(result.surchargeType).toBe("multi_house_2");
  });

  it("양도일 2026.5.9 (마지막 유예일) → 유예 적용", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2");

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-09"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );

    expect(result.isSurchargeSuspended).toBe(true);
  });

  it("양도일 2026.5.10 (유예 종료 다음날) → 유예 해제, 중과 적용", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2");

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );

    expect(result.isSurchargeSuspended).toBe(false);
    expect(result.surchargeApplicable).toBe(true);
  });
});

// ============================================================
// MH-10: 3주택+ 조정 + 유예 종료 → surchargeType="multi_house_3plus"
// ============================================================

describe("MH-10: 3주택+ 조정 + 유예 종료 → +30%p 중과", () => {
  it("3주택 + 조정 + 유예 없음 → surchargeType=multi_house_3plus, surchargeApplicable=true", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2");
    const h3 = makeHouse("h3");

    const input = makeInput([h1, h2, h3], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"), // 유예 종료 후
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );

    expect(result.effectiveHouseCount).toBe(3);
    expect(result.surchargeType).toBe("multi_house_3plus");
    expect(result.surchargeApplicable).toBe(true);
    expect(result.isSurchargeSuspended).toBe(false);
  });
});

// ============================================================
// MH-11: 미분양주택 → 산정 제외
// ============================================================

describe("MH-11: 미분양주택 산정 제외", () => {
  it("미분양주택 1채 포함 3주택 → effectiveHouseCount=2", () => {
    const h1 = makeHouse("h1");
    const h2 = makeHouse("h2");
    const h3 = makeHouse("h3", {
      isUnsoldHousing: true,
    });

    const { count, excluded } = countEffectiveHouses(
      [h1, h2, h3],
      new Date("2024-06-01"),
      [],
      defaultRules,
    );

    expect(count).toBe(2);
    expect(excluded[0].reason).toBe("unsold_housing");
  });
});

// ============================================================
// MH-12: 주거용 오피스텔 취득일 기준 포함/제외
// ============================================================

describe("MH-12: 주거용 오피스텔 산정시작일 경계값 (2022.1.1)", () => {
  it("2021.12.31 취득 오피스텔 → 산정 제외 (경과규정)", () => {
    const h1 = makeHouse("h1");
    const h2 = makeHouse("h2", {
      isOfficetel: true,
      isApartment: false,
      acquisitionDate: new Date("2021-12-31"),
    });

    const { count, excluded } = countEffectiveHouses(
      [h1, h2],
      new Date("2024-06-01"),
      [],
      defaultRules,
    );

    expect(count).toBe(1);
    expect(excluded[0].reason).toBe("officetel_pre2022");
  });

  it("2022.1.1 취득 오피스텔 → 산정 포함", () => {
    const h1 = makeHouse("h1");
    const h2 = makeHouse("h2", {
      isOfficetel: true,
      isApartment: false,
      acquisitionDate: new Date("2022-01-01"),
    });

    const { count } = countEffectiveHouses(
      [h1, h2],
      new Date("2024-06-01"),
      [],
      defaultRules,
    );

    expect(count).toBe(2);
  });

  it("2022.1.1 이후 취득 비오피스텔도 정상 포함", () => {
    const h1 = makeHouse("h1");
    const h2 = makeHouse("h2", {
      isOfficetel: false,
      acquisitionDate: new Date("2022-01-01"),
    });

    const { count } = countEffectiveHouses(
      [h1, h2],
      new Date("2024-06-01"),
      [],
      defaultRules,
    );

    expect(count).toBe(2);
  });
});

// ============================================================
// MH-13: 지역기준/가액기준 이분법 (REGION vs VALUE)
// ============================================================

describe("MH-13: 지역기준(REGION) 광역시 주택 → 가액 불문 무조건 산입", () => {
  it("VALUE 지역 3억 이하 → 산정 제외 (low_price_local_300)", () => {
    const rulesWithLocal: HouseCountExclusionRules = {
      ...defaultRules,
      lowPriceThreshold: { capital: null, non_capital: 100_000_000, local: 300_000_000 },
    };

    const h1 = makeHouse("h1", { region: "capital" });
    const h2 = makeHouse("h2", {
      region: "non_capital",
      regionCriteria: "VALUE",
      officialPrice: 400_000_000,
      transferOfficialPrice: 250_000_000, // 양도 시 3억 이하
    });

    const { count, excluded } = countEffectiveHouses(
      [h1, h2],
      new Date("2024-06-01"),
      [],
      rulesWithLocal,
    );

    expect(count).toBe(1);
    expect(excluded[0].reason).toBe("low_price_local_300");
  });

  it("REGION 지역(광역시) 주택 1억 이하도 무조건 산입", () => {
    const rulesWithLocal: HouseCountExclusionRules = {
      ...defaultRules,
      lowPriceThreshold: { capital: null, non_capital: 100_000_000, local: 300_000_000 },
    };

    const h1 = makeHouse("h1", { region: "capital" });
    const h2 = makeHouse("h2", {
      region: "non_capital",
      regionCriteria: "REGION", // 광역시: REGION 기준, 가액 불문
      officialPrice: 80_000_000, // 1억 미만이지만 REGION이므로 산입
    });

    const { count, excluded } = countEffectiveHouses(
      [h1, h2],
      new Date("2024-06-01"),
      [],
      rulesWithLocal,
    );

    expect(count).toBe(2); // REGION 지역 → 무조건 산입
    expect(excluded).toHaveLength(0);
  });

  it("VALUE 지역 양도공시가 3억 초과 → 포함", () => {
    const rulesWithLocal: HouseCountExclusionRules = {
      ...defaultRules,
      lowPriceThreshold: { capital: null, non_capital: 100_000_000, local: 300_000_000 },
    };

    const h1 = makeHouse("h1");
    const h2 = makeHouse("h2", {
      region: "non_capital",
      regionCriteria: "VALUE",
      officialPrice: 200_000_000,
      transferOfficialPrice: 350_000_000, // 3억 초과 → 산입
    });

    const { count } = countEffectiveHouses(
      [h1, h2],
      new Date("2024-06-01"),
      [],
      rulesWithLocal,
    );

    expect(count).toBe(2);
  });
});

// ============================================================
// MH-14: ⑪ 조정대상지역 공고일 이전 매매계약 → 중과 배제
// ============================================================

describe("MH-14: 공고일 이전 매매계약 + 계약금 증빙 → 중과 배제", () => {
  it("강남구 지정일(2017.8.3) 이전 계약 + 증빙 → pre_designation_contract 배제", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      contractDate: new Date("2017-07-01"), // 지정일 2017.8.3 이전
      hasContractDepositProof: true,
    });
    const h2 = makeHouse("h2");

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2024-06-01"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.exclusionReasons[0].type).toBe("pre_designation_contract");
    expect(result.exclusionReasons[0].detail).toContain("2017-08-03");
  });

  it("공고일 이후 계약 → 배제 안 됨", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      contractDate: new Date("2017-09-01"), // 지정일 이후
      hasContractDepositProof: true,
    });
    const h2 = makeHouse("h2");

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.exclusionReasons).toHaveLength(0);
    expect(result.surchargeApplicable).toBe(true);
  });

  it("공고일 이전 계약이지만 계약금 증빙 없음 → 배제 안 됨", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      contractDate: new Date("2017-07-01"),
      hasContractDepositProof: false, // 증빙 없음
    });
    const h2 = makeHouse("h2");

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.exclusionReasons).toHaveLength(0);
    expect(result.surchargeApplicable).toBe(true);
  });
});

// ============================================================
// MH-15: ⑩ 배제 후 유일한 1주택 (3주택+)
// ============================================================

describe("MH-15: 배제 후 유일한 1주택 → 중과 배제 (소령 §167-3 ①)", () => {
  // ⑩번은 주택 수 산정(countEffectiveHouses) 후 3채 이상인 주택들 중에서 판정.
  // 장기임대·상속주택은 countEffectiveHouses에서 이미 산정 제외되므로
  // ⑩번 판정에는 산정 단계에서 제외되지 않는 주택(사원용·문화재·조특법 등)을 사용.

  it("3주택 모두 산정 후, 타 2채가 사원용·문화재 → 양도 주택이 유일한 일반주택 → 배제", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" }); // 양도 주택
    const h2 = makeHouse("h2", {
      isEmployeeHousing: true,
      freeProvisionYears: 15, // ④ 사원용 10년 이상
    });
    const h3 = makeHouse("h3", {
      isCulturalHeritage: true, // ⑥ 문화재
    });

    const input = makeInput([h1, h2, h3], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"), // 유예 종료 후
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.effectiveHouseCount).toBe(3); // 모두 산정 포함
    expect(result.surchargeApplicable).toBe(false);
    expect(result.exclusionReasons[0].type).toBe("only_one_remaining");
    expect(result.onlyOneRemainingDetail).toBeDefined();
    expect(result.onlyOneRemainingDetail?.otherHousesExcluded).toHaveLength(2);
  });

  it("3주택 중 1채만 배제 가능(사원용) → 일반주택 1채 잔류 → 배제 안 됨 (중과 적용)", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" }); // 양도 주택
    const h2 = makeHouse("h2", {
      isEmployeeHousing: true,
      freeProvisionYears: 15, // ④ 배제 가능
    });
    const h3 = makeHouse("h3"); // 일반주택 → 잔류

    const input = makeInput([h1, h2, h3], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.effectiveHouseCount).toBe(3);
    expect(result.surchargeApplicable).toBe(true);
    expect(result.surchargeType).toBe("multi_house_3plus");
    expect(result.exclusionReasons).toHaveLength(0);
  });

  it("3주택 중 타 주택 모두 조특법 특례·어린이집 → ⑩ 배제", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" }); // 양도 주택
    const h2 = makeHouse("h2", {
      isTaxSpecialExemption: true, // ⑤ 조특법 특례
    });
    const h3 = makeHouse("h3", {
      isDayCareCenter: true,
      dayCareOperationYears: 7, // ⑨ 5년 이상
    });

    const input = makeInput([h1, h2, h3], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.exclusionReasons[0].type).toBe("only_one_remaining");
  });
});

// ============================================================
// MH-추가: determineMultiHouseSurcharge 통합 시나리오
// ============================================================

describe("통합: regionCode 미제공 → isRegulatedFallback 사용", () => {
  it("regionCode 없음 + isRegulatedFallback=true → 조정 판정, 경고 발생", () => {
    const h1 = makeHouse("h1"); // regionCode 미제공
    const h2 = makeHouse("h2");

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true, // fallback=true
    );

    expect(result.isRegulatedAtTransfer).toBe(true);
    expect(result.warnings).toContain(
      "양도 주택의 regionCode 미제공 — isRegulatedArea 플래그 사용",
    );
  });
});

// ============================================================
// MH-16: 장기임대 유형별 판정 (A~I 세분화)
// ============================================================

describe("MH-16: 장기임대 마목(E형) 요건 충족 → 산정 제외", () => {
  const rulesWithLocal: HouseCountExclusionRules = {
    ...defaultRules,
    lowPriceThreshold: { capital: null, non_capital: 100_000_000, local: 300_000_000 },
  };

  it("마목(E) 요건 충족 주택 → 산정 제외 (long_term_rental)", () => {
    const h1 = makeHouse("h1");
    const h2 = makeHouse("h2", {
      isLongTermRental: true,
      rentalType: "E",
      isRegisteredRental: true,
      rentalRegistrationDate: new Date("2021-01-01"), // 2021 등록 → 10년 요건
      businessRegistrationDate: new Date("2021-01-01"),
      rentalPeriodYears: 10,
      rentalStartOfficialPrice: 500_000_000, // 6억 이하 (수도권)
      isCapitalArea: true,
      rentIncreaseUnder5Pct: true,
      isExcluded918Rule: false,
      isExcludedAfter20200711Apt: false,
      isExcludedShortToLongChange: false,
    });

    const { count, excluded } = countEffectiveHouses(
      [h1, h2],
      new Date("2024-06-01"),
      [],
      rulesWithLocal,
    );

    expect(count).toBe(1);
    expect(excluded[0].reason).toBe("long_term_rental");
    expect(excluded[0].detail).toContain("마. 장기일반 매입임대");
  });

  it("마목(E) 임대기간 미달 (8년 미만) → 산정 포함", () => {
    const h1 = makeHouse("h1");
    const h2 = makeHouse("h2", {
      isLongTermRental: true,
      rentalType: "E",
      isRegisteredRental: true,
      rentalRegistrationDate: new Date("2020-01-01"), // 2020.8.18 이전 → 8년 요건
      businessRegistrationDate: new Date("2020-01-01"),
      rentalPeriodYears: 7, // 8년 미달
      rentalStartOfficialPrice: 500_000_000,
      isCapitalArea: true,
      rentIncreaseUnder5Pct: true,
    });

    const { count } = countEffectiveHouses(
      [h1, h2],
      new Date("2024-06-01"),
      [],
      rulesWithLocal,
    );

    expect(count).toBe(2); // 요건 미달 → 포함
  });

  it("isLongTermRentalHousingExempt: 아목(H) 2025.6.4 이후 등록, 6년, 4억 이하 → true", () => {
    const house = makeHouse("h1", {
      isLongTermRental: true,
      rentalType: "H",
      isRegisteredRental: true,
      rentalRegistrationDate: new Date("2025-06-05"),
      businessRegistrationDate: new Date("2025-06-05"),
      rentalPeriodYears: 6,
      rentalStartOfficialPrice: 350_000_000, // 4억 이하 (수도권)
      isCapitalArea: true,
      isApartment: false,
      rentIncreaseUnder5Pct: true,
      isExcluded918Rule: false,
    });

    expect(isLongTermRentalHousingExempt(house, new Date("2026-01-01"))).toBe(true);
  });

  it("isLongTermRentalHousingExempt: 말소 완료 주택 → false (중과배제 불가)", () => {
    const house = makeHouse("h1", {
      isLongTermRental: true,
      rentalCancelledDate: new Date("2023-01-01"), // 양도일 이전 말소
    });

    expect(isLongTermRentalHousingExempt(house, new Date("2024-06-01"))).toBe(false);
  });
});

// ============================================================
// MH-17: ③ 조특법 감면 임대주택 → 3주택+ 중과배제
// ============================================================

describe("MH-17: ③ 조특법 감면 임대주택 → 3주택+ 중과배제", () => {
  it("양도 주택이 조특법 감면 임대주택 (국민주택 5년+) → 중과 배제", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      isTaxIncentiveRental: true,
      rentalPeriodYears: 6, // 5년 이상
      isNationalSizeHousing: true,
    });
    const h2 = makeHouse("h2");
    const h3 = makeHouse("h3");

    const input = makeInput([h1, h2, h3], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.exclusionReasons[0].type).toBe("tax_incentive_rental");
  });

  it("조특법 감면 임대주택이지만 임대기간 4년 → 요건 미달, 중과 적용", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      isTaxIncentiveRental: true,
      rentalPeriodYears: 4, // 5년 미달
      isNationalSizeHousing: true,
    });
    const h2 = makeHouse("h2");
    const h3 = makeHouse("h3");

    const input = makeInput([h1, h2, h3], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(true);
  });

  it("isTaxIncentiveRentalHousingExempt: 국민주택 5년 충족 → true", () => {
    const house = makeHouse("h1", {
      isTaxIncentiveRental: true,
      rentalPeriodYears: 5,
      isNationalSizeHousing: true,
    });
    expect(isTaxIncentiveRentalHousingExempt(house)).toBe(true);
  });
});

// ============================================================
// MH-18: ⑬ 소형 신축/미분양 특례 → 산정 배제
// ============================================================

describe("MH-18: ⑬ 소형 신축/미분양 특례", () => {
  it("소형 신축주택(60㎡, 비아파트, 3억 이하 비수도권) → 산정 배제", () => {
    const h1 = makeHouse("h1");
    const h2 = makeHouse("h2", {
      acquisitionDate: new Date("2025-03-01"), // 2024.1.10~2027.12.31
      isApartment: false,
      exclusiveArea: 55,           // 60㎡ 이하
      acquisitionPrice: 250_000_000, // 비수도권 3억 이하
      isCapitalArea: false,
      region: "non_capital",
    });

    const { count, excluded } = countEffectiveHouses(
      [h1, h2],
      new Date("2026-01-01"),
      [],
      defaultRules,
    );

    expect(count).toBe(1);
    expect(excluded[0].reason).toBe("small_new_house");
  });

  it("아파트 소형신축 → 특례 제외 (아파트는 해당 안 됨)", () => {
    const h1 = makeHouse("h1");
    const h2 = makeHouse("h2", {
      acquisitionDate: new Date("2025-03-01"),
      isApartment: true, // 아파트 → 특례 불가
      exclusiveArea: 55,
      acquisitionPrice: 250_000_000,
      isCapitalArea: false,
      region: "non_capital",
    });

    const { count } = countEffectiveHouses(
      [h1, h2],
      new Date("2026-01-01"),
      [],
      defaultRules,
    );

    expect(count).toBe(2); // 산정 포함
  });

  it("isSmallNewHouseSpecial: 비수도권 준공 후 미분양 (85㎡, 6억 이하) → true", () => {
    const house = makeHouse("h1", {
      acquisitionDate: new Date("2024-06-01"), // 2024.1.10~2025.12.31
      isApartment: false,
      exclusiveArea: 80,
      acquisitionPrice: 550_000_000, // 6억 이하
      isCapitalArea: false,
      region: "non_capital",
      isUnsoldNewHouse: true,
    });

    expect(isSmallNewHouseSpecial(house)).toBe(true);
  });

  it("isSmallNewHouseSpecial: acquisitionPrice 미제공 → false", () => {
    const house = makeHouse("h1", {
      acquisitionDate: new Date("2025-03-01"),
      isApartment: false,
      exclusiveArea: 55,
      // acquisitionPrice 없음
    });

    expect(isSmallNewHouseSpecial(house)).toBe(false);
  });
});

// ============================================================
// MH-19: ⑧ 저당권 실행 취득 3년 이내 → 3주택+ 중과배제
// ============================================================

describe("MH-19: ⑧ 저당권 실행 취득 3년 이내 → 3주택+ 중과배제", () => {
  it("양도 주택이 저당권 실행 취득 2년 경과 → 중과 배제", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      isMortgageExecution: true,
      acquisitionDate: new Date("2022-06-01"), // 취득 2년 경과
    });
    const h2 = makeHouse("h2");
    const h3 = makeHouse("h3");

    const input = makeInput([h1, h2, h3], {
      sellingHouseId: "h1",
      transferDate: new Date("2024-07-01"), // 취득 2년 경과
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.exclusionReasons[0].type).toBe("mortgage_execution_3years");
  });

  it("저당권 실행 취득 3년 초과 → 배제 안 됨 (중과 적용)", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      isMortgageExecution: true,
      acquisitionDate: new Date("2021-01-01"), // 3년 초과
    });
    const h2 = makeHouse("h2");
    const h3 = makeHouse("h3");

    const input = makeInput([h1, h2, h3], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(true);
  });

  it("저당권 실행이지만 2주택 → 3주택+ 전용 배제 미적용, 유예 없으면 중과", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      isMortgageExecution: true,
      acquisitionDate: new Date("2023-01-01"), // 취득 1년 경과
    });
    const h2 = makeHouse("h2");

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    // 2주택 → ⑧ 배제 미적용 (3주택+ 전용)
    expect(result.surchargeApplicable).toBe(true);
    expect(result.surchargeType).toBe("multi_house_2");
  });
});

// ============================================================
// MH-20: ④⑤⑥⑨ 특수 용도 주택 → 3주택+ 중과배제
// ============================================================

describe("MH-20: ④⑤⑥⑨ 특수용도 주택 → 3주택+ 중과배제", () => {
  it("④ 사원용 주택 10년 이상 → 중과 배제", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      isEmployeeHousing: true,
      freeProvisionYears: 12,
    });
    const h2 = makeHouse("h2");
    const h3 = makeHouse("h3");

    const input = makeInput([h1, h2, h3], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.exclusionReasons[0].type).toBe("employee_housing_10years");
  });

  it("⑤ 조특법 특례 주택 → 중과 배제", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      isTaxSpecialExemption: true,
    });
    const h2 = makeHouse("h2");
    const h3 = makeHouse("h3");

    const input = makeInput([h1, h2, h3], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.exclusionReasons[0].type).toBe("tax_special_exemption");
  });

  it("⑥ 문화재 주택 → 중과 배제", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      isCulturalHeritage: true,
    });
    const h2 = makeHouse("h2");
    const h3 = makeHouse("h3");

    const input = makeInput([h1, h2, h3], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.exclusionReasons[0].type).toBe("cultural_heritage");
  });

  it("⑨ 어린이집 5년 이상 → 중과 배제", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      isDayCareCenter: true,
      dayCareOperationYears: 7,
    });
    const h2 = makeHouse("h2");
    const h3 = makeHouse("h3");

    const input = makeInput([h1, h2, h3], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.exclusionReasons[0].type).toBe("daycare_center_5years");
  });

  it("④⑤⑥⑨ 모두 2주택에서는 미적용 → 중과 적용", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      isEmployeeHousing: true,
      freeProvisionYears: 12,
      isTaxSpecialExemption: true,
      isCulturalHeritage: true,
      isDayCareCenter: true,
      dayCareOperationYears: 10,
    });
    const h2 = makeHouse("h2");

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    // 2주택 → 3주택+ 전용 배제 미적용
    expect(result.surchargeApplicable).toBe(true);
    expect(result.surchargeType).toBe("multi_house_2");
  });
});

// ============================================================
// MH-21: 유예 조건 세분화 — 계약일·잔금일·토지허가 기준
// ============================================================

describe("MH-21: 유예 조건 세분화 (A/B/C 조건 판정)", () => {
  // 기본 셋업: 2주택, 조정대상지역, 유예 활성
  function make2HouseInput(
    transferDate: Date,
    gracePeriod?: MultiHouseSurchargeInput["gracePeriod"],
  ): MultiHouseSurchargeInput {
    const h1 = makeHouse("h1", { regionCode: "11680" }); // 강남구 (조정지역)
    const h2 = makeHouse("h2");
    return makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate,
      gracePeriod,
    });
  }

  it("gracePeriod 미제공 + 유예 활성(날짜 기준) → 유예 적용", () => {
    // 기존 동작: suspended_until 이전이면 유예
    const result = determineMultiHouseSurcharge(
      make2HouseInput(new Date("2025-12-01")), // 2026.5.9 이전
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );
    expect(result.isSurchargeSuspended).toBe(true);
    expect(result.surchargeApplicable).toBe(false);
  });

  it("gracePeriod 미제공 + 유예 종료 이후 양도 → 중과 적용", () => {
    const result = determineMultiHouseSurcharge(
      make2HouseInput(new Date("2026-05-10")), // 2026.5.9 초과
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );
    expect(result.isSurchargeSuspended).toBe(false);
    expect(result.surchargeApplicable).toBe(true);
  });

  it("gracePeriod 제공: 계약일 2026.4.1, 양도일 2026.7.20 (3.6개월) → 4개월 이내 → 유예", () => {
    const result = determineMultiHouseSurcharge(
      make2HouseInput(new Date("2026-07-20"), {
        contractDate: new Date("2026-04-01"),
        isLandPermitArea: false,
        hasTenantInResidence: false,
      }),
      defaultRules,
      mockRegulatedHistory,
      suspensionActive, // surcharge_suspended: true
      true,
    );
    // 조건A: 계약일 2026-04-01 ≤ 2026-05-09 ✓
    // 조건B: 2026-04-01 + 4개월 = 2026-08-01 ≥ 2026-07-20 ✓
    expect(result.isSurchargeSuspended).toBe(true);
    expect(result.surchargeApplicable).toBe(false);
  });

  it("gracePeriod 제공: 계약일 2026.4.1, 양도일 2026.9.10 (5.3개월) → 4개월 초과 → 유예 해제", () => {
    const result = determineMultiHouseSurcharge(
      make2HouseInput(new Date("2026-09-10"), {
        contractDate: new Date("2026-04-01"),
        isLandPermitArea: false,
        hasTenantInResidence: false,
      }),
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );
    // 조건A: ✓, 조건B: 4개월 초과 ✗, 조건C: false ✗ → 유예 해제
    expect(result.isSurchargeSuspended).toBe(false);
    expect(result.surchargeApplicable).toBe(true);
  });

  it("gracePeriod: 계약일이 유예 종료일(2026.5.9) 이후 → 조건A 실패 → 유예 해제", () => {
    const result = determineMultiHouseSurcharge(
      make2HouseInput(new Date("2026-07-01"), {
        contractDate: new Date("2026-05-15"), // 2026.5.9 이후 계약
        isLandPermitArea: false,
        hasTenantInResidence: false,
      }),
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );
    expect(result.isSurchargeSuspended).toBe(false);
    expect(result.surchargeApplicable).toBe(true);
  });

  it("gracePeriod: 조건C (토지거래허가+임차인) → 양도일 무관 유예 (무기한)", () => {
    const result = determineMultiHouseSurcharge(
      make2HouseInput(new Date("2028-01-01"), { // 아주 늦은 양도일
        contractDate: new Date("2026-03-01"),
        isLandPermitArea: true,
        hasTenantInResidence: true, // 조건C
      }),
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );
    // 조건A: ✓, 조건B: 4개월 초과 ✗, 조건C: ✓ → 유예 적용
    expect(result.isSurchargeSuspended).toBe(true);
    expect(result.surchargeApplicable).toBe(false);
  });

  it("gracePeriod: 신규 지정지역(2025.10.16 이후) → 6개월 기한 적용", () => {
    const result = determineMultiHouseSurcharge(
      make2HouseInput(new Date("2026-09-15"), { // 5.5개월 후 잔금
        contractDate: new Date("2026-04-01"),
        isLandPermitArea: false,
        hasTenantInResidence: false,
        areaDesignatedDate: new Date("2025-10-16"), // 신규 지정 → 6개월 기한
      }),
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );
    // 조건A: ✓, 6개월 기한: 2026-04-01 + 6개월 = 2026-10-01 ≥ 2026-09-15 → 조건B: ✓
    expect(result.isSurchargeSuspended).toBe(true);
    expect(result.surchargeApplicable).toBe(false);
  });
});

// ============================================================
// MH-22: ⑭ 인구감소지역 세컨드홈 특례 → 주택 수 산정 배제
// ============================================================

describe("MH-22: ⑭ 인구감소지역 세컨드홈 → 주택 수 산정 배제", () => {
  it("인구감소지역 + 세컨드홈 등록 → 산정 배제 (effectiveCount -1)", () => {
    const h1 = makeHouse("h1", { region: "capital" }); // 일반 주택
    const h2 = makeHouse("h2", {
      region: "non_capital",
      isPopulationDeclineArea: true,
      isSecondHomeRegistered: true,
    });

    const { count, excluded } = countEffectiveHouses(
      [h1, h2],
      new Date("2025-06-01"),
      [],
      defaultRules,
    );

    expect(count).toBe(1);
    expect(excluded).toHaveLength(1);
    expect(excluded[0].reason).toBe("population_decline_second_home");
    expect(excluded[0].detail).toContain("§167-3 ① 2호의2");
  });

  it("인구감소지역이지만 세컨드홈 미등록 → 산정 포함", () => {
    const h1 = makeHouse("h1");
    const h2 = makeHouse("h2", {
      isPopulationDeclineArea: true,
      isSecondHomeRegistered: false, // 미등록
    });

    const { count } = countEffectiveHouses(
      [h1, h2],
      new Date("2025-06-01"),
      [],
      defaultRules,
    );

    expect(count).toBe(2); // 포함됨
  });

  it("세컨드홈 등록이지만 인구감소지역 아님 → 산정 포함", () => {
    const h1 = makeHouse("h1");
    const h2 = makeHouse("h2", {
      isPopulationDeclineArea: false, // 인구감소지역 아님
      isSecondHomeRegistered: true,
    });

    const { count } = countEffectiveHouses(
      [h1, h2],
      new Date("2025-06-01"),
      [],
      defaultRules,
    );

    expect(count).toBe(2); // 포함됨
  });
});

// ============================================================
// MH-23: 2주택 배제 — ③ 부득이한 사유 + ⑩ 소형 저가주택
// ============================================================

describe("MH-23: 2주택 전용 배제 — ③ 부득이한 사유 + ⑩ 소형 저가주택", () => {
  // 2주택, 강남구 조정지역, 유예 없음

  it("③ 다른 주택이 부득이한 사유(1년+ 거주) → 2주택 중과배제", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" }); // 양도 주택
    const h2 = makeHouse("h2", {
      isUnavoidableReason: true,   // 취학·근무 등
      unavoidableResidenceYears: 2, // 1년 이상 거주
    });

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.exclusionReasons[0].type).toBe("unavoidable_reason_two_house");
    expect(result.exclusionReasons[0].detail).toContain("부득이한 사유");
  });

  it("③ 부득이한 사유이지만 거주기간 미달(0년) → 배제 안 됨", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2", {
      isUnavoidableReason: true,
      unavoidableResidenceYears: 0, // 1년 미만
    });

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(true);
    expect(result.surchargeType).toBe("multi_house_2");
  });

  it("⑩ 다른 주택 기준시가 1억 이하 (정비구역 아님) → 2주택 중과배제", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" }); // 양도 주택
    const h2 = makeHouse("h2", {
      officialPrice: 80_000_000, // 1억 이하
      isRedevelopmentZone: false,
    });

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.exclusionReasons[0].type).toBe("low_price_two_house");
    expect(result.exclusionReasons[0].detail).toContain("1억 이하");
  });

  it("⑩ 다른 주택 기준시가 1억 이하이지만 정비구역 → 배제 안 됨", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2", {
      officialPrice: 80_000_000,  // 1억 이하
      isRedevelopmentZone: true,  // 정비구역 → 제외
    });

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(true);
  });

  it("⑩ 다른 주택 기준시가 1억 초과 → 배제 안 됨", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2", {
      officialPrice: 100_000_001, // 1억 초과
    });

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(true);
  });

  it("③ 부득이한 사유·⑩ 소형 저가 모두 3주택에서는 미적용", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" }); // 양도 주택
    const h2 = makeHouse("h2", {
      isUnavoidableReason: true,
      unavoidableResidenceYears: 2,
    });
    const h3 = makeHouse("h3", {
      officialPrice: 50_000_000,
      isRedevelopmentZone: false,
    });

    const input = makeInput([h1, h2, h3], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    // 3주택 → 2주택 전용 배제 미적용 (effectiveHouseCount !== 2)
    expect(result.effectiveHouseCount).toBe(3);
    expect(result.surchargeType).toBe("multi_house_3plus");
    // 배제 사유 없으므로 중과 적용
    expect(result.surchargeApplicable).toBe(true);
  });
});

// ============================================================
// MH-NEW-01: 지역기준/가액기준 자동 분류 (classifyRegionCriteriaByCode)
// ============================================================

describe("MH-NEW-01: classifyRegionCriteriaByCode — 시군구코드 자동 분류", () => {
  it("서울(11xxx) → REGION", () => {
    expect(classifyRegionCriteriaByCode("11680")).toBe("REGION"); // 강남구
    expect(classifyRegionCriteriaByCode("11110")).toBe("REGION"); // 종로구
  });

  it("인천 본구(28xxx) → REGION, 강화군(28710)/옹진군(28720) → VALUE", () => {
    expect(classifyRegionCriteriaByCode("28185")).toBe("REGION"); // 연수구
    expect(classifyRegionCriteriaByCode("28710")).toBe("VALUE");  // 강화군
    expect(classifyRegionCriteriaByCode("28720")).toBe("VALUE");  // 옹진군
  });

  it("경기 주요시(41xxx) → REGION, 가평/연천/양평군 → VALUE", () => {
    expect(classifyRegionCriteriaByCode("41135")).toBe("REGION"); // 성남시 분당구
    expect(classifyRegionCriteriaByCode("41610")).toBe("REGION"); // 광주시
    expect(classifyRegionCriteriaByCode("41810")).toBe("VALUE");  // 연천군
    expect(classifyRegionCriteriaByCode("41820")).toBe("VALUE");  // 가평군
    expect(classifyRegionCriteriaByCode("41830")).toBe("VALUE");  // 양평군
  });

  it("부산 기장군(26710) → VALUE, 나머지 구 → REGION", () => {
    expect(classifyRegionCriteriaByCode("26710")).toBe("VALUE");  // 기장군
    expect(classifyRegionCriteriaByCode("26305")).toBe("REGION"); // 해운대구
  });

  it("대구 달성군(27710) → VALUE, 나머지 구 → REGION", () => {
    expect(classifyRegionCriteriaByCode("27710")).toBe("VALUE");
    expect(classifyRegionCriteriaByCode("27200")).toBe("REGION"); // 동구
  });

  it("울산 울주군(31710) → VALUE, 나머지 구 → REGION", () => {
    expect(classifyRegionCriteriaByCode("31710")).toBe("VALUE");
    expect(classifyRegionCriteriaByCode("31110")).toBe("REGION"); // 중구
  });

  it("광주·대전(군 없음) → REGION", () => {
    expect(classifyRegionCriteriaByCode("29110")).toBe("REGION"); // 광주 동구
    expect(classifyRegionCriteriaByCode("30110")).toBe("REGION"); // 대전 동구
  });

  it("세종(36xxx) → REGION", () => {
    expect(classifyRegionCriteriaByCode("36110")).toBe("REGION");
  });

  it("기타 도 지역 → VALUE", () => {
    expect(classifyRegionCriteriaByCode("42150")).toBe("VALUE"); // 강원 삼척시
    expect(classifyRegionCriteriaByCode("47720")).toBe("VALUE"); // 경북 의성군
    expect(classifyRegionCriteriaByCode("48820")).toBe("VALUE"); // 경남 고성군
  });

  it("regionCode 기반 자동분류: 경기 가평군 주택 → VALUE 처리 → 3억 이하 제외", () => {
    // 기존: region="capital"이면 REGION → 산입 (오류)
    // 개선: regionCode="41820"(가평군) → VALUE → 3억 이하면 제외
    const rulesWithLocal: HouseCountExclusionRules = {
      ...defaultRules,
      lowPriceThreshold: { capital: null, non_capital: 100_000_000, local: 300_000_000 },
    };
    const gapyeong = makeHouse("gap", {
      region: "capital",       // 수도권이지만
      regionCode: "41820",      // 가평군 → VALUE
      regionCriteria: undefined,
      transferOfficialPrice: 200_000_000, // 2억 → 3억 이하
    });
    const { count, excluded } = countEffectiveHouses(
      [gapyeong], new Date("2024-06-01"), [], rulesWithLocal,
    );
    expect(count).toBe(0); // 가평군 VALUE 기준 3억 이하 → 제외
    expect(excluded[0].reason).toBe("low_price_local_300");
  });
});

// ============================================================
// MH-NEW-02: 인구감소지역 자동 판정
// ============================================================

describe("MH-NEW-02: classifyPopulationDeclineArea — 시군구코드 자동 판정", () => {
  it("인구감소지역 코드 → isDeclineArea=true, priceLimit=9억", () => {
    expect(classifyPopulationDeclineArea("42800")).toEqual({ isDeclineArea: true, priceLimit: 900_000_000 }); // 강원 고성군
    expect(classifyPopulationDeclineArea("46930")).toEqual({ isDeclineArea: true, priceLimit: 900_000_000 }); // 전남 신안군
    expect(classifyPopulationDeclineArea("48820")).toEqual({ isDeclineArea: true, priceLimit: 900_000_000 }); // 경남 고성군
  });

  it("수도권·광역시 코드 → isDeclineArea=false", () => {
    expect(classifyPopulationDeclineArea("11680")).toEqual({ isDeclineArea: false, priceLimit: 0 }); // 강남구
    expect(classifyPopulationDeclineArea("41135")).toEqual({ isDeclineArea: false, priceLimit: 0 }); // 분당구
  });

  it("regionCode로 자동 판정: isPopulationDeclineArea 미제공 시 코드로 배제 결정", () => {
    const hGosong = makeHouse("gosong", {
      region: "non_capital",
      regionCode: "42800",           // 강원 고성군 (인구감소지역)
      isPopulationDeclineArea: undefined, // 명시 안 함
      isSecondHomeRegistered: true,
    });

    const { count, excluded } = countEffectiveHouses(
      [hGosong], new Date("2024-06-01"), [], defaultRules,
    );
    expect(count).toBe(0); // 세컨드홈 특례 + 인구감소 자동 판정 → 배제
    expect(excluded[0].reason).toBe("population_decline_second_home");
  });

  it("인구감소지역이지만 세컨드홈 미등록 → 배제 안 됨", () => {
    const h = makeHouse("h", {
      region: "non_capital",
      regionCode: "42800",
      isPopulationDeclineArea: undefined,
      isSecondHomeRegistered: false, // 미등록
    });
    const { count } = countEffectiveHouses([h], new Date("2024-06-01"), [], defaultRules);
    expect(count).toBe(1); // 배제 안 됨
  });
});

// ============================================================
// MH-NEW-03: 부득이한 사유 ③ — 3억 이하·3년 이내 조건 강화
// ============================================================

describe("MH-NEW-03: 부득이한 사유 ③ 강화 — 3억 이하·사유해소 3년 이내", () => {
  it("3억 이하 + 1년 거주 → 배제 적용", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" }); // 양도 주택 (강남, 조정)
    const h2 = makeHouse("h2", {
      isUnavoidableReason: true,
      unavoidableResidenceYears: 2,
      officialPrice: 250_000_000, // 2.5억 → 3억 이하
    });

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });
    const result = determineMultiHouseSurcharge(
      input, defaultRules, mockRegulatedHistory, suspensionNone, true,
    );
    expect(result.exclusionReasons[0].type).toBe("unavoidable_reason_two_house");
    expect(result.surchargeApplicable).toBe(false);
  });

  it("3억 초과 → 배제 미적용 (기존과 다른 결과)", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2", {
      isUnavoidableReason: true,
      unavoidableResidenceYears: 2,
      officialPrice: 350_000_000, // 3.5억 → 3억 초과 → 배제 안 됨
    });

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });
    const result = determineMultiHouseSurcharge(
      input, defaultRules, mockRegulatedHistory, suspensionNone, true,
    );
    // 3억 초과이므로 부득이한 사유 배제 미적용 → 유예/다른 배제 없으면 중과 적용
    const hasUnavoidableReason = result.exclusionReasons.some(
      (r) => r.type === "unavoidable_reason_two_house",
    );
    expect(hasUnavoidableReason).toBe(false);
  });

  it("사유해소 후 3년 초과 → 배제 미적용", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2", {
      isUnavoidableReason: true,
      unavoidableResidenceYears: 2,
      officialPrice: 250_000_000,
      unavoidableReasonResolvedDate: new Date("2022-01-01"), // 사유 해소 (3년 이상 전)
    });

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"), // 해소 후 4년 이상
    });
    const result = determineMultiHouseSurcharge(
      input, defaultRules, mockRegulatedHistory, suspensionNone, true,
    );
    const hasUnavoidableReason = result.exclusionReasons.some(
      (r) => r.type === "unavoidable_reason_two_house",
    );
    expect(hasUnavoidableReason).toBe(false);
  });

  it("사유해소 후 3년 이내 → 배제 적용", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2", {
      isUnavoidableReason: true,
      unavoidableResidenceYears: 2,
      officialPrice: 250_000_000,
      unavoidableReasonResolvedDate: new Date("2025-01-01"), // 1년 전 해소
    });

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });
    const result = determineMultiHouseSurcharge(
      input, defaultRules, mockRegulatedHistory, suspensionNone, true,
    );
    expect(result.exclusionReasons[0].type).toBe("unavoidable_reason_two_house");
  });
});

// ============================================================
// MH-NEW-04: 소송 취득 주택 배제 (소령 §167-10 ① 8호)
// ============================================================

describe("MH-NEW-04: 소송 취득 주택 ⑧ — 2주택 중과배제", () => {
  it("소송 진행 중인 다른 주택 → 2주택 배제", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" }); // 양도
    const h2 = makeHouse("h2", {
      isLitigationHousing: true,
      // litigationAcquisitionDate 미제공 → 소송 진행 중
    });

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });
    const result = determineMultiHouseSurcharge(
      input, defaultRules, mockRegulatedHistory, suspensionNone, true,
    );
    expect(result.exclusionReasons[0].type).toBe("litigation_housing_two_house");
    expect(result.surchargeApplicable).toBe(false);
  });

  it("법원 결정 취득 후 3년 이내 → 2주택 배제", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2", {
      isLitigationHousing: true,
      litigationAcquisitionDate: new Date("2025-01-01"), // 1년 전 취득
    });

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });
    const result = determineMultiHouseSurcharge(
      input, defaultRules, mockRegulatedHistory, suspensionNone, true,
    );
    expect(result.exclusionReasons[0].type).toBe("litigation_housing_two_house");
    expect(result.surchargeApplicable).toBe(false);
  });

  it("법원 결정 취득 후 3년 초과 → 배제 미적용", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2", {
      isLitigationHousing: true,
      litigationAcquisitionDate: new Date("2022-01-01"), // 4년 전 취득
    });

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });
    const result = determineMultiHouseSurcharge(
      input, defaultRules, mockRegulatedHistory, suspensionNone, true,
    );
    const hasLitigation = result.exclusionReasons.some(
      (r) => r.type === "litigation_housing_two_house",
    );
    expect(hasLitigation).toBe(false);
  });

  it("3주택 상황에서 소송 취득 주택 → 2주택 전용 배제 미적용", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2", { isLitigationHousing: true });
    const h3 = makeHouse("h3");

    const input = makeInput([h1, h2, h3], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });
    const result = determineMultiHouseSurcharge(
      input, defaultRules, mockRegulatedHistory, suspensionNone, true,
    );
    // 3주택 → 소송 배제는 2주택 전용
    const hasLitigation = result.exclusionReasons.some(
      (r) => r.type === "litigation_housing_two_house",
    );
    expect(hasLitigation).toBe(false);
    expect(result.effectiveHouseCount).toBe(3);
  });
});

// ============================================================
// MH-NEW-05: 세금 시뮬레이션 — 기본세율 vs 중과세율 비교
// ============================================================

describe("MH-NEW-05: buildMultiHouseTaxSimulation — 기본세율 vs 중과세율", () => {
  it("2주택 중과 시뮬레이션: 5억 양도차익 기준", () => {
    const sim = buildMultiHouseTaxSimulation({
      salePrice: 700_000_000,
      acquisitionPrice: 150_000_000,
      expenses: 50_000_000,
      holdingYears: 5,
      surchargeType: "multi_house_2",
    });

    // 양도차익 = 700M - 150M - 50M = 500M
    expect(sim.capitalGain).toBe(500_000_000);

    // 기본세율: LTSC 5년 × 2% = 10%
    expect(sim.basicScenario.ltscAmount).toBe(50_000_000);
    expect(sim.basicScenario.taxableIncome).toBe(450_000_000);
    // 과세표준 4.5억 → 40% - 2594만 = 1.8억 - 2594만 = 154,060,000
    expect(sim.basicScenario.tax).toBeGreaterThan(0);

    // 중과세율: LTSC 0%, +20%p
    expect(sim.heavyScenario.ltscAmount).toBe(0);
    expect(sim.heavyScenario.taxableIncome).toBe(500_000_000);
    // 중과 > 기본
    expect(sim.heavyScenario.tax).toBeGreaterThan(sim.basicScenario.tax);

    // 추가 세부담 양수
    expect(sim.additionalTax).toBeGreaterThan(0);
    expect(sim.additionalTaxFormatted).toMatch(/만원$/);
  });

  it("3주택+ 중과 시뮬레이션: 가산세율 30%p 적용", () => {
    const sim2 = buildMultiHouseTaxSimulation({
      salePrice: 700_000_000,
      acquisitionPrice: 150_000_000,
      expenses: 50_000_000,
      holdingYears: 5,
      surchargeType: "multi_house_2",
    });
    const sim3 = buildMultiHouseTaxSimulation({
      salePrice: 700_000_000,
      acquisitionPrice: 150_000_000,
      expenses: 50_000_000,
      holdingYears: 5,
      surchargeType: "multi_house_3plus",
    });
    // 3주택+ 세액이 2주택보다 많아야 함
    expect(sim3.heavyScenario.tax).toBeGreaterThan(sim2.heavyScenario.tax);
    expect(sim3.additionalTax).toBeGreaterThan(sim2.additionalTax);
  });

  it("양도차익 0 이하 → 세액 0", () => {
    const sim = buildMultiHouseTaxSimulation({
      salePrice: 100_000_000,
      acquisitionPrice: 200_000_000,
      expenses: 0,
      holdingYears: 3,
      surchargeType: "multi_house_2",
    });
    expect(sim.capitalGain).toBe(0);
    expect(sim.basicScenario.tax).toBe(0);
    expect(sim.heavyScenario.tax).toBe(0);
    expect(sim.additionalTax).toBe(0);
  });

  it("3년 미만 보유 → LTSC 0%", () => {
    const sim = buildMultiHouseTaxSimulation({
      salePrice: 500_000_000,
      acquisitionPrice: 100_000_000,
      expenses: 0,
      holdingYears: 2,
      surchargeType: "multi_house_2",
    });
    expect(sim.basicScenario.ltscAmount).toBe(0);
    // LTSC 0이므로 기본 과세표준 = 양도차익
    expect(sim.basicScenario.taxableIncome).toBe(400_000_000);
  });
});
