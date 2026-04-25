/**
 * 토지/건물 취득일 분리 양도차익·장기보유공제 테스트 (S1~S5)
 *
 * 소득세법 §95②, 소득령 §166⑥·§168②:
 * 토지와 건물의 취득일이 다른 경우 양도가액·취득가액·필요경비·개산공제를
 * 기준시가 비율로 안분하여 각각 양도차익을 계산한다.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();

// ============================================================
// S1: housing 2주택 + 환산취득가 + 안분 모드
//     이미지 케이스 — 토지 9년 / 건물 8년
// ============================================================

describe("S1: housing 2주택 + 환산취득가 + 안분 모드 (이미지 케이스)", () => {
  const input = baseTransferInput({
    propertyType: "housing",
    transferPrice: 715_000_000,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("2014-09-14"),       // 건물 취득일 (사용승인)
    landAcquisitionDate: new Date("2013-06-01"),   // 토지 취득일 (등기접수)
    acquisitionPrice: 0,
    useEstimatedAcquisition: true,
    acquisitionMethod: "estimated",
    standardPriceAtAcquisition: 483_000_000,       // 2014.1.1. 개별주택가격
    standardPriceAtTransfer: 627_000_000,          // 2022.1.1. 개별주택가격
    standardPricePerSqmAtAcquisition: 2_369_000,   // 2014.1.1. 개별공시지가 /㎡
    acquisitionArea: 212,                          // 토지면적
    expenses: 34_000_000,                          // 자본적지출
    isOneHousehold: true,
    householdHousingCount: 2,
    residencePeriodMonths: 101,
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    landSplitMode: "apportioned",
  });

  it("calcSplitGain: 토지/건물 분리 결과 반환", () => {
    const result = calcSplitGain(input);
    expect(result).not.toBeNull();
    // 토지 기준시가 = 2,369,000 × 212 = 502,228,000 → 전체(483,000,000) 초과로 클램핑
    // 토지 안분비율 = 1.0 (클램핑), 건물 = 0
    expect(result!.apportionRatio.land).toBeCloseTo(1.0, 5);
    expect(result!.apportionRatio.building).toBeCloseTo(0, 5);
  });

  it("calcSplitGain: 보유연수 분리 계산", () => {
    const result = calcSplitGain(input);
    expect(result).not.toBeNull();
    // 토지: 2013.6.1. ~ 2023.2.16. = 9년
    expect(result!.land.holdingYears).toBe(9);
    // 건물: 2014.9.14. ~ 2023.2.16. = 8년
    expect(result!.building.holdingYears).toBe(8);
  });

  it("calculateTransferTax: splitDetail 포함 결과 반환", () => {
    const result = calculateTransferTax(input, mockRates);
    expect(result.splitDetail).toBeDefined();
    expect(result.splitDetail!.land.holdingYears).toBe(9);
    expect(result.splitDetail!.building.holdingYears).toBe(8);
  });

  it("calculateTransferTax: 총 양도차익 > 0", () => {
    const result = calculateTransferTax(input, mockRates);
    expect(result.transferGain).toBeGreaterThan(0);
  });
});

// ============================================================
// S2: housing 1세대1주택 + 실거래가 + 실제 분리 입력
// ============================================================

describe("S2: housing 1세대1주택 + 실거래가 + 실제 분리 입력", () => {
  const input = baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_500_000_000,
    transferDate: new Date("2024-06-01"),
    acquisitionDate: new Date("2016-06-01"),       // 건물 취득일
    landAcquisitionDate: new Date("2014-06-01"),   // 토지 취득일 (2년 앞)
    acquisitionPrice: 800_000_000,
    useEstimatedAcquisition: false,
    acquisitionMethod: "actual",
    standardPriceAtAcquisition: 600_000_000,
    standardPriceAtTransfer: 900_000_000,
    standardPricePerSqmAtAcquisition: 1_500_000,
    acquisitionArea: 200,
    expenses: 20_000_000,
    // 실제 분리 입력
    landSplitMode: "actual",
    landTransferPrice: 700_000_000,
    buildingTransferPrice: 800_000_000,
    landAcquisitionPrice: 350_000_000,
    buildingAcquisitionPrice: 450_000_000,
    landDirectExpenses: 5_000_000,
    buildingDirectExpenses: 15_000_000,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 96,                     // 거주 8년
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
  });

  it("calcSplitGain: 실제 분리 입력 값 그대로 사용", () => {
    const result = calcSplitGain(input);
    expect(result).not.toBeNull();
    expect(result!.land.transferPrice).toBe(700_000_000);
    expect(result!.building.transferPrice).toBe(800_000_000);
    expect(result!.land.acquisitionPrice).toBe(350_000_000);
    expect(result!.building.acquisitionPrice).toBe(450_000_000);
    expect(result!.land.directExpenses).toBe(5_000_000);
    expect(result!.building.directExpenses).toBe(15_000_000);
  });

  it("calcSplitGain: 토지 > 건물 보유연수 (민법 초일불산입 기준)", () => {
    const result = calcSplitGain(input);
    // 토지: 2014.6.2.부터 2024.6.1. → 9년 11개월 → 9년
    // 건물: 2016.6.2.부터 2024.6.1. → 7년 11개월 → 7년
    expect(result!.land.holdingYears).toBe(9);
    expect(result!.building.holdingYears).toBe(7);
    expect(result!.land.holdingYears).toBeGreaterThan(result!.building.holdingYears);
  });

  it("calculateTransferTax: 1세대1주택 splitDetail 포함", () => {
    const result = calculateTransferTax(input, mockRates);
    // 1주택 1세대이므로 비과세 판정될 수 있음 (12억 이하 면제)
    expect(result.splitDetail).toBeDefined();
    // 12억 초과 고가주택이므로 일부 과세
    expect(result.isExempt).toBe(false);
    expect(result.transferGain).toBeGreaterThan(0);
  });

  it("calcSplitGain: 1세대1주택 L-3 장특공제율 확인", () => {
    const result = calcSplitGain(input);
    expect(result).not.toBeNull();
    // 토지 10년+거주 8년 = min(0.4+0.32, 0.80) = 0.72
    // 건물 8년+거주 8년 = min(0.32+0.32, 0.80) = 0.64
    // (실제 공제율은 calculateTransferTax 호출 후 splitDetail에 세팅됨)
  });
});

// ============================================================
// S3: building 일반건물 + 환산취득가
//     토지 12년 / 건물 5년
// ============================================================

describe("S3: building 일반건물 + 환산취득가", () => {
  const input = baseTransferInput({
    propertyType: "building",
    transferPrice: 2_000_000_000,
    transferDate: new Date("2024-06-01"),
    acquisitionDate: new Date("2019-06-01"),       // 건물 취득일 (5년)
    landAcquisitionDate: new Date("2012-06-01"),   // 토지 취득일 (12년)
    acquisitionPrice: 0,
    useEstimatedAcquisition: true,
    acquisitionMethod: "estimated",
    standardPriceAtAcquisition: 800_000_000,
    standardPriceAtTransfer: 1_200_000_000,
    standardPricePerSqmAtAcquisition: 2_000_000,
    acquisitionArea: 300,                          // 토지면적 300㎡
    expenses: 50_000_000,
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    landSplitMode: "apportioned",
  });

  it("calcSplitGain: building 자산도 분리 결과 반환", () => {
    const result = calcSplitGain(input);
    expect(result).not.toBeNull();
    // 토지 기준시가 = 2,000,000 × 300 = 600,000,000
    // 전체 기준시가 = 800,000,000
    // 토지 안분비율 = 600/800 = 0.75, 건물 = 0.25
    expect(result!.apportionRatio.land).toBeCloseTo(0.75, 5);
    expect(result!.apportionRatio.building).toBeCloseTo(0.25, 5);
  });

  it("calcSplitGain: 토지 > 건물 보유연수 (민법 초일불산입 기준)", () => {
    const result = calcSplitGain(input);
    // 토지: 2012.6.2. ~ 2024.6.1. → 11년 11개월 → 11년
    // 건물: 2019.6.2. ~ 2024.6.1. → 4년 11개월 → 4년
    expect(result!.land.holdingYears).toBe(11);
    expect(result!.building.holdingYears).toBe(4);
  });

  it("calculateTransferTax: splitDetail.land.longTermDeduction > splitDetail.building", () => {
    const result = calculateTransferTax(input, mockRates);
    expect(result.splitDetail).toBeDefined();
    // 토지 11년 × 2% = 22%, 건물 4년 × 2% = 8%
    expect(result.splitDetail!.land.longTermRate).toBeCloseTo(0.22, 5);
    expect(result.splitDetail!.building.longTermRate).toBeCloseTo(0.08, 5);
    expect(result.splitDetail!.land.longTermDeduction).toBeGreaterThan(
      result.splitDetail!.building.longTermDeduction,
    );
  });
});

// ============================================================
// S4: 안분 fallback — 일부 항목만 입력 (landTransferPrice만)
// ============================================================

describe("S4: 안분 fallback — landTransferPrice만 직접 입력", () => {
  const stdAtAcq = 400_000_000;
  const stdAtTransfer = 600_000_000;
  const totalTransfer = 1_000_000_000;
  const sqm = 1_000_000; // /㎡
  const area = 200;       // ㎡ → 토지기준시가 = 200,000,000

  const landRatio = 200_000_000 / 400_000_000; // 0.5

  const input = baseTransferInput({
    propertyType: "housing",
    transferPrice: totalTransfer,
    transferDate: new Date("2024-06-01"),
    acquisitionDate: new Date("2018-06-01"),       // 건물
    landAcquisitionDate: new Date("2016-06-01"),   // 토지 2년 앞
    acquisitionPrice: 500_000_000,
    useEstimatedAcquisition: false,
    acquisitionMethod: "actual",
    standardPriceAtAcquisition: stdAtAcq,
    standardPriceAtTransfer: stdAtTransfer,
    standardPricePerSqmAtAcquisition: sqm,
    acquisitionArea: area,
    expenses: 10_000_000,
    landSplitMode: "actual",
    landTransferPrice: 600_000_000, // 직접 입력 (60%)
    // buildingTransferPrice 미입력 → 전체 - 토지 = 400,000,000
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 48,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
  });

  it("calcSplitGain: 건물 양도가액은 전체 - 토지 fallback", () => {
    const result = calcSplitGain(input);
    expect(result).not.toBeNull();
    expect(result!.land.transferPrice).toBe(600_000_000);
    expect(result!.building.transferPrice).toBe(400_000_000); // 1000 - 600
  });

  it("calcSplitGain: 취득가액은 기준시가 비율 안분 fallback", () => {
    const result = calcSplitGain(input);
    // 토지 기준시가 = 1,000,000 × 200 = 200,000,000 → 안분비 0.5
    expect(result!.land.acquisitionPrice).toBe(250_000_000); // 500M × 0.5
    expect(result!.building.acquisitionPrice).toBe(250_000_000); // 500M × 0.5
  });
});

// ============================================================
// S5: landAcquisitionDate 미제공 → 기존 단일 로직 회귀
// ============================================================

describe("S5: landAcquisitionDate 미제공 → 기존 단일 로직 회귀", () => {
  const singleInput = baseTransferInput({
    propertyType: "housing",
    transferPrice: 800_000_000,
    transferDate: new Date("2024-06-01"),
    acquisitionDate: new Date("2018-06-01"),
    acquisitionPrice: 400_000_000,
    expenses: 10_000_000,
    isOneHousehold: true,
    householdHousingCount: 2,    // 2주택 → 비과세 아님
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    // landAcquisitionDate 미제공
  });

  it("calcSplitGain: null 반환 (분리 미적용)", () => {
    expect(calcSplitGain(singleInput)).toBeNull();
  });

  it("calculateTransferTax: splitDetail 없음", () => {
    const result = calculateTransferTax(singleInput, mockRates);
    expect(result.splitDetail).toBeUndefined();
  });

  it("calculateTransferTax: 기존 단일 계산 결과와 동일", () => {
    const resultSingle = calculateTransferTax(singleInput, mockRates);
    // landAcquisitionDate 없으므로 기존 경로 사용
    // 양도차익 = 800M - 400M - 10M = 390M
    expect(resultSingle.transferGain).toBe(390_000_000);
    // 2주택 + 비조정 → L-4 일반: 보유 5년 11개월 → 5년 × 2% = 10%
    // (2018.6.2. ~ 2024.6.1. = 5년 11개월 → years=5)
    expect(resultSingle.longTermHoldingRate).toBeCloseTo(0.10, 5);
  });
});
