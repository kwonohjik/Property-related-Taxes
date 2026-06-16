/**
 * P2 특수 배제 사유 — 3주택+ 전용(양도주택)·2주택 전용(다른주택)·인구감소 anchor.
 *
 * 입력 위젯(SellingHouseExclusionSection·HouseEntrySpecialExclusionSection)이 엔진까지 도달함을 검증.
 * 엔진 determineSurchargeExclusion(helpers:672-779)·countEffectiveHouses(478-489) 평가.
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

const SELLING = "11680"; // 강남(조정)
const TD = new Date("2024-06-01");

describe("P2 3주택+ 전용 배제 (양도 주택 자체)", () => {
  it("양도주택이 사원용 주택(10년 무상제공) → employee_housing_10years 배제", () => {
    const selling = makeHouse("h1", { regionCode: SELLING, isEmployeeHousing: true, freeProvisionYears: 10 });
    const input = makeInput([selling, makeHouse("h2"), makeHouse("h3")], { sellingHouseId: "h1", transferDate: TD });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.effectiveHouseCount).toBe(3);
    expect(r.exclusionReasons.some((e) => e.type === "employee_housing_10years")).toBe(true);
    expect(r.surchargeApplicable).toBe(false);
  });

  it("양도주택이 문화재 주택 → cultural_heritage 배제", () => {
    const selling = makeHouse("h1", { regionCode: SELLING, isCulturalHeritage: true });
    const input = makeInput([selling, makeHouse("h2"), makeHouse("h3")], { sellingHouseId: "h1", transferDate: TD });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.exclusionReasons.some((e) => e.type === "cultural_heritage")).toBe(true);
  });

  it("사원주택이나 무상제공 5년(<10년) → 미배제", () => {
    const selling = makeHouse("h1", { regionCode: SELLING, isEmployeeHousing: true, freeProvisionYears: 5 });
    const input = makeInput([selling, makeHouse("h2"), makeHouse("h3")], { sellingHouseId: "h1", transferDate: TD });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.exclusionReasons.some((e) => e.type === "employee_housing_10years")).toBe(false);
  });
});

describe("P2 2주택 전용 배제 (다른 보유 주택)", () => {
  it("부득이한 사유 주택(3억↓·거주 2년) → unavoidable_reason_two_house 배제", () => {
    const other = makeHouse("h2", {
      officialPrice: 250_000_000,
      isUnavoidableReason: true,
      unavoidableResidenceYears: 2,
    });
    const input = makeInput([makeHouse("h1", { regionCode: SELLING }), other], { sellingHouseId: "h1", transferDate: TD });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.exclusionReasons.some((e) => e.type === "unavoidable_reason_two_house")).toBe(true);
    expect(r.surchargeApplicable).toBe(false);
  });

  it("소송 취득 주택(2년 전) → litigation_housing_two_house 배제", () => {
    const other = makeHouse("h2", {
      isLitigationHousing: true,
      litigationAcquisitionDate: new Date("2022-06-01"), // 2년 전 (<3년)
    });
    const input = makeInput([makeHouse("h1", { regionCode: SELLING }), other], { sellingHouseId: "h1", transferDate: TD });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.exclusionReasons.some((e) => e.type === "litigation_housing_two_house")).toBe(true);
  });

  it("기준시가 1억↓ 소형 주택(정비구역 아님) → low_price_two_house 배제", () => {
    const other = makeHouse("h2", { officialPrice: 90_000_000, isRedevelopmentZone: false });
    const input = makeInput([makeHouse("h1", { regionCode: SELLING }), other], { sellingHouseId: "h1", transferDate: TD });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.exclusionReasons.some((e) => e.type === "low_price_two_house")).toBe(true);
  });

  it("기준시가 1억↓ 이나 정비구역 → 배제 안 됨(산입)", () => {
    const other = makeHouse("h2", { officialPrice: 90_000_000, isRedevelopmentZone: true });
    const input = makeInput([makeHouse("h1", { regionCode: SELLING }), other], { sellingHouseId: "h1", transferDate: TD });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.exclusionReasons.some((e) => e.type === "low_price_two_house")).toBe(false);
  });
});

describe("P2 인구감소지역 세컨드홈 (주택 수 산정 제외)", () => {
  it("인구감소지역 + 세컨드홈 등록 → 주택 수 제외 (effectiveHouseCount 1)", () => {
    const other = makeHouse("h2", { isPopulationDeclineArea: true, isSecondHomeRegistered: true });
    const input = makeInput([makeHouse("h1", { regionCode: SELLING }), other], { sellingHouseId: "h1", transferDate: TD });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.excludedHouses.find((e) => e.houseId === "h2")?.reason).toBe("population_decline_second_home");
    expect(r.effectiveHouseCount).toBe(1);
  });

  it("인구감소지역이나 세컨드홈 미등록 → 산입 (effectiveHouseCount 2)", () => {
    const other = makeHouse("h2", { isPopulationDeclineArea: true, isSecondHomeRegistered: false });
    const input = makeInput([makeHouse("h1", { regionCode: SELLING }), other], { sellingHouseId: "h1", transferDate: TD });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.effectiveHouseCount).toBe(2);
  });
});
