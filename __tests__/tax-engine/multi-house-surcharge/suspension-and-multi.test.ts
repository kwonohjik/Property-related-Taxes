/**
 * 다주택 중과세 엔진 — 한시 유예 + 3주택+ 중과 + 공고일 이전 계약 (MH-09~MH-15) 테스트
 *
 * Mock 규칙·헬퍼는 ../_helpers/multi-house-mock 에서 import.
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
import {
  defaultRules,
  mockRegulatedHistory,
  suspensionActive,
  suspensionNone,
  makeHouse,
  makeInput,
} from "../_helpers/multi-house-mock";


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
