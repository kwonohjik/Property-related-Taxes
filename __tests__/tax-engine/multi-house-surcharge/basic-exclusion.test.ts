/**
 * 다주택 중과세 엔진 — 주택 수 산정 배제 + 일시적 2주택 + 조정지역 해제 (MH-01~MH-08) 테스트
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
