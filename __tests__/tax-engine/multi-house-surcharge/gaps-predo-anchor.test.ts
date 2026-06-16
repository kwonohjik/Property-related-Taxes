/**
 * Pre-Do Anchor — 다주택 중과 미구현 #1 나목(준공후미분양) 상수 정정 실증
 *
 * 설계: docs/02-design/features/multi-house-surcharge-gaps.engine.design.md §4 #1
 * 법령: 소득세법 시행령 §167의3①12나목 (MST 286211) — 2024.1.10~**2026.12.31** 취득·취득가 **7억**↓·전용 85㎡↓·수도권 밖
 * 현행 버그: helpers.ts:341 (acqDate <= 2025-12-31) · :344 (acquisitionPrice <= 600_000_000)
 *
 * 이 anchor는 **수정 전 FAIL**(갭 실증), **수정 후 PASS** 해야 한다.
 * 엔진 레벨 검증(기존 HouseInfo 필드 acquisitionPrice·exclusiveArea·isUnsoldNewHouse 직접 주입) —
 * UI/API 입력경로(14지점)는 별도 E2E.
 */

import { describe, it, expect } from "vitest";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import {
  defaultRules,
  mockRegulatedHistory,
  suspensionNone,
  makeHouse,
  makeInput,
} from "../_helpers/multi-house-mock";

const SELLING = "11680"; // 강남구 조정대상지역(미해제)

describe("Pre-Do #1-나: 준공후미분양 7억·2026.12.31 (§167의3①12나목)", () => {
  it("비수도권 미분양·2026-06 취득·전용 80㎡·취득가 7억 → small_new_house 배제 (현행 FAIL: 6억·2025 컷)", () => {
    const selling = makeHouse("h1", { regionCode: SELLING });
    const unsoldNew = makeHouse("h2", {
      region: "non_capital",
      isApartment: false,
      acquisitionDate: new Date("2026-06-01"),
      acquisitionPrice: 700_000_000, // 나목 한도 7억 경계
      exclusiveArea: 80, // ≤ 85㎡
      isUnsoldNewHouse: true,
      // officialPrice 기본 300M (> non_capital 100M) → 저가배제 통과, small_new_house 도달
    });
    const input = makeInput([selling, unsoldNew], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-07-01"),
    });

    const r = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(r.excludedHouses.find((e) => e.reason === "small_new_house")?.houseId).toBe("h2");
    expect(r.effectiveHouseCount).toBe(1);
  });

  it("취득가 700,000,001 (7억 초과) → 미배제·산입 (경계 가드)", () => {
    const selling = makeHouse("h1", { regionCode: SELLING });
    const over = makeHouse("h2", {
      region: "non_capital",
      isApartment: false,
      acquisitionDate: new Date("2026-06-01"),
      acquisitionPrice: 700_000_001, // 7억 초과
      exclusiveArea: 80,
      isUnsoldNewHouse: true,
    });
    const input = makeInput([selling, over], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-07-01"),
    });

    const r = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(r.excludedHouses.find((e) => e.reason === "small_new_house")).toBeUndefined();
    expect(r.effectiveHouseCount).toBe(2);
  });
});

describe("Pre-Do #1-가: 소형신축 준공일 검증 (§167의3①12가목 3호)", () => {
  it("가목 요건 + 준공일 2023-12 (윈도우 밖) → 미배제·산입 (현행 FAIL: 준공일 미검증)", () => {
    const selling = makeHouse("h1", { regionCode: SELLING });
    const smallNew = makeHouse("h2", {
      region: "non_capital",
      isApartment: false,
      acquisitionDate: new Date("2025-03-01"), // 취득 윈도우 내
      acquisitionPrice: 250_000_000, // 비수도권 3억 이하
      exclusiveArea: 55, // ≤ 60㎡
      completionDate: new Date("2023-12-01"), // 준공 윈도우 밖 (< 2024-01-10)
    });
    const input = makeInput([selling, smallNew], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-01-01"),
    });

    const r = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(r.excludedHouses.find((e) => e.reason === "small_new_house")).toBeUndefined();
    expect(r.effectiveHouseCount).toBe(2);
  });

  it("가목 요건 + 준공일 2025-02 (윈도우 내) → small_new_house 배제 (가드)", () => {
    const selling = makeHouse("h1", { regionCode: SELLING });
    const smallNew = makeHouse("h2", {
      region: "non_capital",
      isApartment: false,
      acquisitionDate: new Date("2025-03-01"),
      acquisitionPrice: 250_000_000,
      exclusiveArea: 55,
      completionDate: new Date("2025-02-01"), // 준공 윈도우 내
    });
    const input = makeInput([selling, smallNew], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-01-01"),
    });

    const r = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(r.excludedHouses.find((e) => e.reason === "small_new_house")?.houseId).toBe("h2");
    expect(r.effectiveHouseCount).toBe(1);
  });
});

describe("Pre-Do #3: 인구감소 세컨드홈 가액한도 (§167의3①12 다·라목)", () => {
  it("라목(관심지역) 기준시가 5억 (>4억) → 산입 (현행 FAIL: 한도 미검증)", () => {
    const selling = makeHouse("h1", { regionCode: SELLING });
    const second = makeHouse("h2", {
      region: "non_capital",
      isPopulationDeclineArea: true,
      isSecondHomeRegistered: true,
      populationAreaType: "interest",
      officialPrice: 500_000_000, // > 4억 한도
    });
    const input = makeInput([selling, second], { sellingHouseId: "h1" });
    const r = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );
    expect(r.excludedHouses.find((e) => e.reason === "population_decline_second_home")).toBeUndefined();
    expect(r.effectiveHouseCount).toBe(2);
  });

  it("다목(수도권밖 인구감소지역) 기준시가 8억 (≤9억) → 배제 (가드)", () => {
    const selling = makeHouse("h1", { regionCode: SELLING });
    const second = makeHouse("h2", {
      region: "non_capital",
      isPopulationDeclineArea: true,
      isSecondHomeRegistered: true,
      populationAreaType: "decline",
      officialPrice: 800_000_000, // ≤ 9억
    });
    const input = makeInput([selling, second], { sellingHouseId: "h1" });
    const r = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );
    expect(r.excludedHouses.find((e) => e.houseId === "h2")?.reason).toBe("population_decline_second_home");
    expect(r.effectiveHouseCount).toBe(1);
  });

  it("다목 기준시가 10억 (>9억) → 산입 (현행 FAIL: 한도 미검증)", () => {
    const selling = makeHouse("h1", { regionCode: SELLING });
    const second = makeHouse("h2", {
      region: "non_capital",
      isPopulationDeclineArea: true,
      isSecondHomeRegistered: true,
      populationAreaType: "decline",
      officialPrice: 1_000_000_000, // > 9억
    });
    const input = makeInput([selling, second], { sellingHouseId: "h1" });
    const r = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );
    expect(r.excludedHouses.find((e) => e.reason === "population_decline_second_home")).toBeUndefined();
    expect(r.effectiveHouseCount).toBe(2);
  });
});

describe("Pre-Do #4: 분양권/입주권 VALUE 3억 배제 (§167의4②1호·§167의11②1호)", () => {
  const presale = (over?: Partial<{ regionCriteria: "REGION" | "VALUE"; rightValue: number }>) => ({
    id: "p1",
    type: "presale_right" as const,
    acquisitionDate: new Date("2022-03-01"), // 2021.1.1 이후 산입대상
    region: "non_capital" as const,
    regionCriteria: "VALUE" as "REGION" | "VALUE",
    rightValue: 250_000_000,
    ...over,
  });

  it("VALUE지역 분양권 2.5억 (≤3억) → 미산입 (현행 FAIL: 무조건 +1)", () => {
    const selling = makeHouse("h1", { regionCode: SELLING });
    const input = makeInput([selling], { sellingHouseId: "h1", presaleRights: [presale()] });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.effectiveHouseCount).toBe(1); // 분양권 미산입 → 1주택
  });

  it("VALUE지역 분양권 3.5억 (>3억) → 산입 (가드)", () => {
    const selling = makeHouse("h1", { regionCode: SELLING });
    const input = makeInput([selling], {
      sellingHouseId: "h1",
      presaleRights: [presale({ rightValue: 350_000_000 })],
    });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.effectiveHouseCount).toBe(2);
  });

  it("광역시(REGION) 분양권 2.5억 → 산입 (REGION 가액무관, 광역시 오배제 방지)", () => {
    const selling = makeHouse("h1", { regionCode: SELLING });
    const input = makeInput([selling], {
      sellingHouseId: "h1",
      presaleRights: [presale({ regionCriteria: "REGION" })],
    });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.effectiveHouseCount).toBe(2);
  });
});
