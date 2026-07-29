/**
 * anchor: 2008 위기대응 취득기간 중과배제 — 부칙 §9270호 §14①
 *
 * 근거: 부칙 §9270호 §14①(2009.3.16~2012.12.31 취득 자산 → §104①1호 기본세율) +
 *   기재부 재산세제과-1422(2023.12.26., §104⑦ 세율 배제) + 서울행정법원 2024구단72950(국승, §95² 장특 배제 존속).
 *
 * A 다주택: 세율 기본(중과 배제) + **장특 배제 유지**(세율만 배제, surchargeType 유지 → §95² 장특 배제 보존).
 * B 비사업용 토지: +10%p 배제 → 기본누진 + 장특 표1 적용.
 */
import { describe, it, expect } from "vitest";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  defaultRules,
  mockRegulatedHistory,
  suspensionNone,
  makeHouse,
  makeInput,
} from "../_helpers/multi-house-mock";
import { baseTransferInput, makeHouseInfo, makeMockRatesWithHouseEngine, makeMockRates } from "../_helpers/mock-rates";

const SELLING = "11680"; // 강남구 = 조정대상지역
const CRISIS = new Date("2010-06-01"); // 2009.3.16~2012.12.31 내
const OUTSIDE = new Date("2026-06-01"); // 한시 유예 window(2026-05-09) 밖

describe("A 다주택 — surchargeApplicable만 배제, surchargeType·장특배제 신호 유지 (엔진 direct)", () => {
  it("A-1: 조정 3주택 + 양도주택 2010-06-01 취득 → surchargeApplicable=false·surchargeType 유지·rateSurchargeStatutoryExcluded=true", () => {
    const selling = makeHouse("h1", { regionCode: SELLING, acquisitionDate: CRISIS });
    const input = makeInput([selling, makeHouse("h2"), makeHouse("h3")], {
      sellingHouseId: "h1",
      transferDate: OUTSIDE,
    });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.surchargeApplicable).toBe(false); // 세율 중과 배제
    expect(r.surchargeType).toBe("multi_house_3plus"); // 유지("none" 아님) → isSurchargeCase=true → 장특 배제 보존
    expect(r.rateSurchargeStatutoryExcluded).toBe(true);
  });

  it("A-경계: 양도주택 2013-06-01 취득(window 밖) → 중과 적용·부칙 플래그 없음", () => {
    const selling = makeHouse("h1", { regionCode: SELLING, acquisitionDate: new Date("2013-06-01") });
    const input = makeInput([selling, makeHouse("h2"), makeHouse("h3")], {
      sellingHouseId: "h1",
      transferDate: OUTSIDE,
    });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.surchargeApplicable).toBe(true);
    expect(r.rateSurchargeStatutoryExcluded).toBeUndefined();
  });

  it("A-경계 취득일: 2009-03-15(전일)=중과 / 2009-03-16(당일)=배제", () => {
    const before = makeInput([makeHouse("h1", { regionCode: SELLING, acquisitionDate: new Date("2009-03-15") }), makeHouse("h2"), makeHouse("h3")], { sellingHouseId: "h1", transferDate: OUTSIDE });
    const on = makeInput([makeHouse("h1", { regionCode: SELLING, acquisitionDate: new Date("2009-03-16") }), makeHouse("h2"), makeHouse("h3")], { sellingHouseId: "h1", transferDate: OUTSIDE });
    expect(determineMultiHouseSurcharge(before, defaultRules, mockRegulatedHistory, suspensionNone, true).surchargeApplicable).toBe(true);
    expect(determineMultiHouseSurcharge(on, defaultRules, mockRegulatedHistory, suspensionNone, true).rateSurchargeStatutoryExcluded).toBe(true);
  });
});

describe("A 다주택 — full engine: 세율 O(기본) · 장특 X(배제 유지) [Critical]", () => {
  it("A-full: 조정 3주택 + 양도주택 2010-06-01 취득 → rateSurchargeStatutoryExcluded=true && 장특 deduction=0(배제 유지)", () => {
    const input = baseTransferInput({
      isOneHousehold: false,
      acquisitionDate: CRISIS,
      transferDate: OUTSIDE,
      sellingHouseId: "h1",
      houses: [
        makeHouseInfo("h1", { regionCode: SELLING, acquisitionDate: CRISIS }),
        makeHouseInfo("h2", {}),
        makeHouseInfo("h3", {}),
      ],
    });
    const r = calculateTransferTax(input, makeMockRatesWithHouseEngine());
    expect(r.rateSurchargeStatutoryExcluded).toBe(true); // 세율 중과 배제
    expect(r.longTermHoldingDeduction).toBe(0); // 장특 배제 유지 (세율만 배제)
    expect(r.lthdExclusionReason).toBe("multi_house_surcharge");
  });
});

describe("B 비사업용 토지 — +10%p 배제(기본누진), 장특 표1 적용", () => {
  it("B-1: 비사업용 토지 2010-06-01 취득·3년 이상 → nblSurchargeExcluded=true, surchargeType 미설정", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "land",
        isNonBusinessLand: true,
        acquisitionDate: CRISIS,
        transferDate: new Date("2024-06-01"),
      }),
      makeMockRates(),
    );
    expect(r.nblSurchargeExcluded).toBe(true);
    expect(r.surchargeType).not.toBe("non_business_land");
  });

  it("B-경계: 비사업용 토지 2013-06-01 취득(window 밖) → 중과 적용(non_business_land)", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "land",
        isNonBusinessLand: true,
        acquisitionDate: new Date("2013-06-01"),
        transferDate: new Date("2024-06-01"),
      }),
      makeMockRates(),
    );
    expect(r.nblSurchargeExcluded).toBeFalsy();
    expect(r.surchargeType).toBe("non_business_land");
  });
});
