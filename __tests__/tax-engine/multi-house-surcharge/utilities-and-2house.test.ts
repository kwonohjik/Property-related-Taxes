/**
 * 다주택 중과세 엔진 — 2주택 전용 배제 + 지역분류 유틸 + 시뮬레이션 (MH-23, NEW-01~05) 테스트
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
