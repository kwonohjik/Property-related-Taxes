/**
 * 개별주택가격 미공시 취득 + 토지/건물 분리 양도차익 테스트 (TDD — anchor 30)
 *
 * Excel 근거: "주택분(환산취득, 토지 건물 취득 시기 상이).xlsx"
 * 모든 toBe() 값은 Python 역산으로 검증된 원단위 확정값.
 *
 * 소득세법 시행령 §164 ⑤ · §166 ⑥ · §163 ⑥
 */

import { describe, it, expect } from "vitest";
import { calcPreHousingDisclosureGain } from "@/lib/tax-engine/transfer-tax-pre-housing-disclosure";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import {
  PHD_INPUT,
  PHD_TRANSFER_PRICE,
  PHD_LAND_AREA,
  PHD_SUM_A,
  PHD_SUM_F,
  PHD_SUM_T,
  PHD_LAND_STD_AT_ACQ,
  PHD_LAND_STD_AT_TRANSFER,
  PHD_P_A_EST,
  PHD_LAND_HOUSING_AT_ACQ,
  PHD_BLDG_HOUSING_AT_ACQ,
  PHD_LAND_HOUSING_AT_TRANSFER,
  PHD_BLDG_HOUSING_AT_TRANSFER,
  PHD_LAND_TRANSFER_PRICE,
  PHD_BLDG_TRANSFER_PRICE,
  PHD_TOTAL_EST_ACQ,
  PHD_LAND_ACQ_PRICE,
  PHD_BLDG_ACQ_PRICE,
  PHD_LAND_LUMP_DED,
  PHD_BLDG_LUMP_DED,
  PHD_LAND_GAIN,
  PHD_BLDG_GAIN,
  PHD_TOTAL_GAIN,
  PHD_LAND_HOLDING_YEARS,
  PHD_BLDG_HOLDING_YEARS,
  PHD_LAND_LTHD_RATE,
  PHD_BLDG_LTHD_RATE,
  PHD_LAND_LTHD,
  PHD_BLDG_LTHD,
  PHD_TOTAL_LTHD,
  PHD_INCOME,
  PHD_BASIC_DED,
  PHD_TAX_BASE,
  PHD_CALCULATED_TAX,
} from "./_helpers/pre-housing-disclosure-fixture";

const mockRates = makeMockRates();

// ──────────────────────────────────────────────────────────────
// D-1: 기준시가 합계 계산 (Sum_A · Sum_F · Sum_T)
// ──────────────────────────────────────────────────────────────

describe("D-1: 기준시가 합계 산출 (§164⑤)", () => {
  it("D-1-1 Sum_A = landPricePerSqm × area + buildingStd (취득시)", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(result.sumAtAcquisition).toBe(PHD_SUM_A); // 721,210,540
  });

  it("D-1-2 Sum_F = landPricePerSqm × area + buildingStd (최초공시일)", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(result.sumAtFirstDisclosure).toBe(PHD_SUM_F); // 722,953,560
  });

  it("D-1-3 Sum_T = landPricePerSqm × area + buildingStd (양도시)", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(result.sumAtTransfer).toBe(PHD_SUM_T); // 991,903,000
  });

  it("D-1-4 취득시 토지 기준시가 = landPricePerSqm × area", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(result.landStdAtAcquisition).toBe(PHD_LAND_STD_AT_ACQ); // 500,320,000
  });

  it("D-1-5 양도시 토지 기준시가 = landPricePerSqm × area", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(result.landStdAtTransfer).toBe(PHD_LAND_STD_AT_TRANSFER); // 739,032,000
  });
});

// ──────────────────────────────────────────────────────────────
// D-2: P_A_est 추정 (§164⑤ 핵심 공식)
// ──────────────────────────────────────────────────────────────

describe("D-2: 추정 취득시 개별주택가격 P_A_est (§164⑤)", () => {
  it("D-2-1 P_A_est = floor(P_F × Sum_A / Sum_F)", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(result.estimatedHousingPriceAtAcquisition).toBe(PHD_P_A_EST); // 484,828,268
  });

  it("D-2-2 P_A_est < P_F (비율 Sum_A < Sum_F 이므로)", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    // Sum_A=721,210,540 < Sum_F=722,953,560 → P_A_est < P_F=486,000,000
    expect(result.estimatedHousingPriceAtAcquisition).toBeLessThan(PHD_INPUT.firstDisclosureHousingPrice);
  });
});

// ──────────────────────────────────────────────────────────────
// D-3: 주택 공시가액 안분 — 취득시 성분 (§166⑥)
// ──────────────────────────────────────────────────────────────

describe("D-3: 주택 공시가액 안분 — 취득시 (§166⑥)", () => {
  it("D-3-1 취득시 토지 성분 = floor(P_A_est × landStdAtAcq / Sum_A)", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(result.landHousingAtAcquisition).toBe(PHD_LAND_HOUSING_AT_ACQ); // 336,336,292
  });

  it("D-3-2 취득시 건물 성분 = P_A_est - 취득시 토지 성분", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(result.buildingHousingAtAcquisition).toBe(PHD_BLDG_HOUSING_AT_ACQ); // 148,491,976
  });

  it("D-3-3 취득시 토지 + 건물 성분 = P_A_est", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(result.landHousingAtAcquisition + result.buildingHousingAtAcquisition)
      .toBe(PHD_P_A_EST);
  });
});

// ──────────────────────────────────────────────────────────────
// D-4: 주택 공시가액 안분 — 양도시 성분 (§166⑥)
// ──────────────────────────────────────────────────────────────

describe("D-4: 주택 공시가액 안분 — 양도시 (§166⑥)", () => {
  it("D-4-1 양도시 토지 성분 = floor(P_T × landStdAtTransfer / Sum_T)", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(result.landHousingAtTransfer).toBe(PHD_LAND_HOUSING_AT_TRANSFER); // 467,155,623
  });

  it("D-4-2 양도시 건물 성분 = P_T - 양도시 토지 성분", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(result.buildingHousingAtTransfer).toBe(PHD_BLDG_HOUSING_AT_TRANSFER); // 159,844,377
  });
});

// ──────────────────────────────────────────────────────────────
// D-5: 양도가액 분리 (양도시 기준시가 비율)
// ──────────────────────────────────────────────────────────────

describe("D-5: 양도가액 분리 (양도시 비율)", () => {
  it("D-5-1 토지 양도가액 = floor(totalTransfer × 토지성분_양도시 / P_T)", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(result.landTransferPrice).toBe(PHD_LAND_TRANSFER_PRICE); // 532,721,324
  });

  it("D-5-2 건물 양도가액 = totalTransfer - 토지 양도가액", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(result.buildingTransferPrice).toBe(PHD_BLDG_TRANSFER_PRICE); // 182,278,676
  });

  it("D-5-3 토지 + 건물 양도가액 = 총 양도가액", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(result.landTransferPrice + result.buildingTransferPrice).toBe(PHD_TRANSFER_PRICE);
  });
});

// ──────────────────────────────────────────────────────────────
// D-6: 취득가액 분리 (취득시 기준시가 비율)
// ──────────────────────────────────────────────────────────────

describe("D-6: 취득가액 분리 (취득시 비율)", () => {
  it("D-6-1 총 환산취득가 = floor(totalTransfer × P_A_est / P_T)", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(result.totalEstimatedAcquisitionPrice).toBe(PHD_TOTAL_EST_ACQ); // 552,874,340
  });

  it("D-6-2 토지 환산취득가 = floor(totalEstAcq × 토지성분_취득시 / P_A_est)", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(result.landAcquisitionPrice).toBe(PHD_LAND_ACQ_PRICE); // 383,541,385
  });

  it("D-6-3 건물 환산취득가 = totalEstAcq - 토지 환산취득가", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(result.buildingAcquisitionPrice).toBe(PHD_BLDG_ACQ_PRICE); // 169,332,955
  });

  it("D-6-4 토지 + 건물 환산취득가 = 총 환산취득가", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(result.landAcquisitionPrice + result.buildingAcquisitionPrice)
      .toBe(PHD_TOTAL_EST_ACQ);
  });
});

// ──────────────────────────────────────────────────────────────
// D-7: 개산공제 (§163⑥)
// ──────────────────────────────────────────────────────────────

describe("D-7: 개산공제 (§163⑥)", () => {
  it("D-7-1 토지 개산공제 = floor(취득시 토지 성분 × 3%)", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(result.landLumpDeduction).toBe(PHD_LAND_LUMP_DED); // 10,090,088
  });

  it("D-7-2 건물 개산공제 = floor(취득시 건물 성분 × 3%)", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(result.buildingLumpDeduction).toBe(PHD_BLDG_LUMP_DED); // 4,454,759
  });
});

// ──────────────────────────────────────────────────────────────
// D-8: 양도차익 (필요경비 제외 — 개산공제만)
// ──────────────────────────────────────────────────────────────

describe("D-8: 양도차익 (개산공제만)", () => {
  it("D-8-1 토지 양도차익 = 토지 양도가액 - 토지 환산취득가 - 토지 개산공제", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    const gain = result.landTransferPrice - result.landAcquisitionPrice - result.landLumpDeduction;
    expect(gain).toBe(PHD_LAND_GAIN); // 139,089,851
  });

  it("D-8-2 건물 양도차익 = 건물 양도가액 - 건물 환산취득가 - 건물 개산공제", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    const gain = result.buildingTransferPrice - result.buildingAcquisitionPrice - result.buildingLumpDeduction;
    expect(gain).toBe(PHD_BLDG_GAIN); // 8,490,962
  });
});

// ──────────────────────────────────────────────────────────────
// D-9: 장기보유특별공제 분리 (일반 2%/년, Excel 검증)
// ──────────────────────────────────────────────────────────────

describe("D-9: 장기보유특별공제 분리 (일반)", () => {
  it("D-9-1 토지 보유연수 = 9년 (2013-06-01 ~ 2023-02-16)", () => {
    const result = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(PHD_LAND_HOLDING_YEARS).toBe(9);
    void result; // 엔진 결과는 D-9 연계 테스트에서 확인
  });

  it("D-9-2 건물 보유연수 = 8년 (2014-09-14 ~ 2023-02-16)", () => {
    expect(PHD_BLDG_HOLDING_YEARS).toBe(8);
  });

  it("D-9-3 토지 장특공제 = floor(139,089,851 × 18%) = 25,036,173", () => {
    const derived = Math.floor(PHD_LAND_GAIN * PHD_LAND_LTHD_RATE);
    expect(derived).toBe(PHD_LAND_LTHD); // 25,036,173
  });

  it("D-9-4 건물 장특공제 = floor(8,490,962 × 16%) = 1,358,553", () => {
    const derived = Math.floor(PHD_BLDG_GAIN * PHD_BLDG_LTHD_RATE);
    expect(derived).toBe(PHD_BLDG_LTHD); // 1,358,553
  });

  it("D-9-5 합계 장특공제 = 26,394,726", () => {
    expect(PHD_LAND_LTHD + PHD_BLDG_LTHD).toBe(PHD_TOTAL_LTHD);
  });
});

// ──────────────────────────────────────────────────────────────
// D-10: 통합 — calculateTransferTax + preHousingDisclosure
// ──────────────────────────────────────────────────────────────

describe("D-10: 통합 calculateTransferTax + preHousingDisclosure", () => {
  const baseInput = baseTransferInput({
    propertyType: "housing",
    transferPrice: PHD_TRANSFER_PRICE,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("2014-09-14"),      // 건물 취득일
    landAcquisitionDate: new Date("2013-06-01"),  // 토지 취득일
    acquisitionPrice: 0,
    useEstimatedAcquisition: true,
    acquisitionMethod: "estimated",
    expenses: 0,                                  // fixture는 개산공제만 (자본적지출 없음)
    isOneHousehold: true,
    householdHousingCount: 2,                     // 2주택 → 일반세율
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    landSplitMode: "apportioned",
    preHousingDisclosure: PHD_INPUT,
  });

  it("D-10-1 splitDetail 포함 결과 반환", () => {
    const result = calculateTransferTax(baseInput, mockRates);
    expect(result.splitDetail).toBeDefined();
  });

  it("D-10-2 preHousingDisclosureDetail 포함 결과 반환", () => {
    const result = calculateTransferTax(baseInput, mockRates);
    expect(result.preHousingDisclosureDetail).toBeDefined();
  });

  it("D-10-3 총 양도차익 = 147,580,813 (Excel anchor)", () => {
    const result = calculateTransferTax(baseInput, mockRates);
    expect(result.transferGain).toBe(PHD_TOTAL_GAIN); // 147,580,813
  });

  it("D-10-4 토지 양도차익 = 139,089,851 (Excel anchor)", () => {
    const result = calculateTransferTax(baseInput, mockRates);
    expect(result.splitDetail!.land.gain).toBe(PHD_LAND_GAIN); // 139,089,851
  });

  it("D-10-5 건물 양도차익 = 8,490,962 (Excel anchor)", () => {
    const result = calculateTransferTax(baseInput, mockRates);
    expect(result.splitDetail!.building.gain).toBe(PHD_BLDG_GAIN); // 8,490,962
  });

  it("D-10-6 토지 장특공제 = 25,036,173 (Excel anchor)", () => {
    const result = calculateTransferTax(baseInput, mockRates);
    expect(result.splitDetail!.land.longTermDeduction).toBe(PHD_LAND_LTHD); // 25,036,173
  });

  it("D-10-7 건물 장특공제 = 1,358,553 (Excel anchor)", () => {
    const result = calculateTransferTax(baseInput, mockRates);
    expect(result.splitDetail!.building.longTermDeduction).toBe(PHD_BLDG_LTHD); // 1,358,553
  });

  it("D-10-8 총 장특공제 = 26,394,726 (Excel anchor)", () => {
    const result = calculateTransferTax(baseInput, mockRates);
    expect(result.longTermHoldingDeduction).toBe(PHD_TOTAL_LTHD); // 26,394,726
  });

  it("D-10-9 양도소득금액 = 121,186,087 (Excel anchor)", () => {
    const result = calculateTransferTax(baseInput, mockRates);
    const income = result.taxableGain - result.longTermHoldingDeduction;
    expect(income).toBe(PHD_INCOME); // 121,186,087
  });

  it("D-10-10 과세표준 = 118,686,087 (Excel anchor)", () => {
    const result = calculateTransferTax(baseInput, mockRates);
    expect(result.taxBase).toBe(PHD_TAX_BASE); // 118,686,087
  });

  it("D-10-11 산출세액 = 26,100,130 (Excel anchor)", () => {
    const result = calculateTransferTax(baseInput, mockRates);
    expect(result.calculatedTax).toBe(PHD_CALCULATED_TAX); // 26,100,130
  });

  it("D-10-12 preHousingDisclosureDetail.estimatedHousingPriceAtAcquisition = 484,828,268", () => {
    const result = calculateTransferTax(baseInput, mockRates);
    expect(result.preHousingDisclosureDetail!.estimatedHousingPriceAtAcquisition)
      .toBe(PHD_P_A_EST); // 484,828,268
  });
});

// ──────────────────────────────────────────────────────────────
// D-11: 엣지케이스 — preHousingDisclosure 미제공 시 기존 경로
// ──────────────────────────────────────────────────────────────

describe("D-11: preHousingDisclosure 미제공 시 기존 경로 회귀", () => {
  it("D-11-1 preHousingDisclosure 없으면 preHousingDisclosureDetail = undefined", () => {
    const input = baseTransferInput({
      propertyType: "housing",
      transferPrice: PHD_TRANSFER_PRICE,
      transferDate: new Date("2023-02-16"),
      acquisitionDate: new Date("2014-09-14"),
      landAcquisitionDate: new Date("2013-06-01"),
      acquisitionPrice: 0,
      useEstimatedAcquisition: true,
      acquisitionMethod: "estimated",
      standardPriceAtAcquisition: 484_828_268,
      standardPriceAtTransfer: 627_000_000,
      standardPricePerSqmAtAcquisition: 2_360_000,
      acquisitionArea: PHD_LAND_AREA,
      expenses: 0,
      isOneHousehold: true,
      householdHousingCount: 2,
      residencePeriodMonths: 0,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      isNonBusinessLand: false,
      landSplitMode: "apportioned",
      // preHousingDisclosure 미제공
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.preHousingDisclosureDetail).toBeUndefined();
  });
});
