/**
 * 다주택 중과세 엔진 — 장기임대 유형·특수 배제·인구감소지역 특례 (MH-16~MH-22) 테스트
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
    expect(excluded[0].detail).toContain("§167의3 ① 2호의2");
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
