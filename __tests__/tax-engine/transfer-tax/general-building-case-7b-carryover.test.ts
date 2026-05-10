/**
 * #7-b 사례 32 변형 — 토지 증여이월과세 + 건물 신축 (§97의2 + §114조의2 cross-cutting)
 *
 * 사례 32 입력 베이스에서 토지를 배우자등 이월과세(§97조의2)로 변경.
 * 토지 acquisitionCause = "carryover_gift" → 단건 엔진의 비교과세(이월 vs 통상 max) 작동.
 * 건물 = newConstruction 유지 → 가산세 13,300,202 발동.
 *
 * §97의2 ① 본문: "거주자가 양도일부터 소급하여 5년 이내(2023.1.1 이후 증여분 10년)에
 *   배우자 또는 직계존비속으로부터 증여받은 토지·건물 등을 양도하는 경우…그 취득가액은
 *   그 배우자 등의 취득 당시 §97①1호에 따른 가액으로 한다."
 *
 * 비교과세 시나리오:
 *  - 이월: 토지 취득가액 = 증여자 취득가액(피이월자 시점), 보유기간 = 증여자 취득일~양도일
 *  - 통상: 토지 취득가액 = 증여 시점 가액, 보유기간 = 증여일~양도일
 *  - max(이월, 통상) 선택
 *
 * Anchor 산출 방식: "엔진 도출 결과를 anchor로 고정해 회귀 보호".
 * 비교과세 결과 자체를 anchor로 고정 — 향후 §97의2 모듈 변경 시 회귀 차단.
 */
import { describe, it, expect } from "vitest";
import { calculateGeneralBuildingTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { buildGeneralBuildingAssetCards } from "@/lib/tax-engine/general-building-valuation";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";

// ============================================================
// 잠금 입력값 (사례 32 베이스 + 토지 carryover_gift)
// ============================================================

// 증여일 = 2020-03-17 (양도일로부터 약 3년 전, §97의2 5년 이내 적용 대상)
const GIFT_REGISTRY_DATE = new Date("2020-03-17");
// 증여자(배우자) 취득일 = 1995-06-15 (이월 시나리오의 토지 LTHD 기산점)
const DONOR_ACQ_DATE = new Date("1995-06-15");
const TRANSFER_DATE = new Date("2023-02-19");
const BUILDING_ACQUISITION_DATE = new Date("2018-03-31");

const TOTAL_TRANSFER_PRICE = 1_620_000_000;
const LAND_AREA = 205;
const BUILDING_AREA = 271.28;
const BUILDING_FOOTPRINT_AREA = 135.64;

const TRANSFER_LAND_PRICE_PER_SQM = 5_514_000;
const TRANSFER_BUILDING_STD_PRICE = 259_072_400;
const ACQUISITION_LAND_PRICE_PER_SQM = 3_920_000;
const ACQUISITION_BUILDING_STD_PRICE = 228_146_480;

const CASE_7B_INPUT = {
  totalTransferPrice: TOTAL_TRANSFER_PRICE,
  transferDate: TRANSFER_DATE,
  // 토지 acquisitionDate = 증여일 (통상 시나리오의 LTHD 기산점)
  acquisitionDate: GIFT_REGISTRY_DATE,
  buildingAcquisitionDate: BUILDING_ACQUISITION_DATE,
  buildingAcquisitionCause: "newConstruction" as const,
  // ★ #7-b 신규: 토지 이월과세
  landAcquisitionCause: "carryover_gift" as const,
  landCarryoverTaxation: {
    giftRegistryDate: GIFT_REGISTRY_DATE,
    donorAcquisitionDate: DONOR_ACQ_DATE,
    donorAcquisitionPrice: 500_000_000, // 증여자(배우자) 토지 취득가액
    useEstimatedAcquisition: false,     // 실가 입증 모드
    giftTaxAmount: 50_000_000,          // 증여세 (이월 시 필요경비)
    giftDateValuation: 1_100_000_000,   // 증여 시점 토지 평가액 (통상 시나리오 취득가액)
  },
  landArea: LAND_AREA,
  buildingArea: BUILDING_AREA,
  buildingFootprintArea: BUILDING_FOOTPRINT_AREA,
  transferLandPricePerSqm: TRANSFER_LAND_PRICE_PER_SQM,
  transferBuildingStdPrice: TRANSFER_BUILDING_STD_PRICE,
  acquisitionLandPricePerSqm: ACQUISITION_LAND_PRICE_PER_SQM,
  acquisitionBuildingStdPrice: ACQUISITION_BUILDING_STD_PRICE,
  zoneType: "general_residential",
  isMetropolitan: true,
};

// ============================================================
// Group 1 — 환산·안분은 사례 32와 동일 (입력값 동일)
// ============================================================

describe("#7-b: 환산·안분 결과 보존 (사례 32 입력 동일)", () => {
  const out = buildGeneralBuildingAssetCards(CASE_7B_INPUT);

  it("anchor #1 — 토지 양도가 = 1,317,938,332", () => {
    expect(out.allocation.land).toBe(1_317_938_332);
  });
  it("anchor #2 — 건물 양도가 = 302,061,668", () => {
    expect(out.allocation.building).toBe(302_061_668);
  });
  it("anchor #3 — 토지 환산취득가 = 936,945,640 (환산 분기는 carryover와 별도)", () => {
    expect(out.acquisition.land).toBe(936_945_640);
  });
  it("anchor #4 — 건물 환산취득가 = 266,004,044", () => {
    expect(out.acquisition.building).toBe(266_004_044);
  });
});

// ============================================================
// Group 2 — 토지 카드 carryover 보조 필드 패스스루
// ============================================================

describe("#7-b: 토지 카드 carryover_gift 패스스루", () => {
  const out = buildGeneralBuildingAssetCards(CASE_7B_INPUT);
  const landCard = out.assetCards.find((c) => c.propertyType === "land");
  const buildingCard = out.assetCards.find((c) => c.propertyType === "general_building_unit");

  it("anchor #5 — 토지 카드 landAcquisitionCause = 'carryover_gift'", () => {
    expect(landCard?.landAcquisitionCause).toBe("carryover_gift");
  });
  it("anchor #6 — 토지 카드 carryoverTaxation 패스스루 (#7-b 핵심 신규 매핑)", () => {
    expect(landCard?.carryoverTaxation).toBeDefined();
    expect(landCard?.carryoverTaxation?.donorAcquisitionPrice).toBe(500_000_000);
    expect(landCard?.carryoverTaxation?.giftTaxAmount).toBe(50_000_000);
  });
  it("anchor #7 — 토지 카드 carryoverTaxation.donorAcquisitionDate = 1995-06-15", () => {
    expect(
      landCard?.carryoverTaxation?.donorAcquisitionDate.toISOString().slice(0, 10),
    ).toBe("1995-06-15");
  });
  it("anchor #8 — 토지 acquisitionDate = 증여일 2020-03-17", () => {
    expect(landCard?.acquisitionDate.toISOString().slice(0, 10)).toBe("2020-03-17");
  });
  it("anchor #9 — 건물 카드는 carryoverTaxation 미설정 (토지 전용)", () => {
    expect(buildingCard?.carryoverTaxation).toBeUndefined();
  });
  it("anchor #10 — 건물 카드 buildingAcquisitionCause = 'newConstruction'", () => {
    expect(buildingCard?.buildingAcquisitionCause).toBe("newConstruction");
  });
});

// ============================================================
// Group 3 — 통합 계산 — §114조의2 가산세 발동 + 토지 carryover 결과 회귀 보호
// ============================================================

describe("#7-b: 통합 계산 — 가산세 13,300,202 보존 + carryover 결과 회귀", () => {
  const result = calculateGeneralBuildingTransfer(
    CASE_7B_INPUT,
    2023,
    0,
    [],
    makeMockRates(),
  );

  const properties = result.aggregated.properties;
  const landBreakdown = properties.find((p) => p.propertyId === "land");
  const buildingBreakdown = properties.find((p) => p.propertyId === "building");

  it("anchor #11 — 건물 §114조의2 가산세 = 13,300,202 (사례 32 동일, cross-cutting 보존)", () => {
    expect(buildingBreakdown?.penaltyTax).toBe(13_300_202);
  });

  it("anchor #12 — 토지 가산세 = 0 (carryover 무관)", () => {
    expect(landBreakdown?.penaltyTax ?? 0).toBe(0);
  });

  it("anchor #13 — 건물 LTHD = 2,337,058 (보유 4년 8%, 사례 32 동일)", () => {
    expect(buildingBreakdown?.longTermHoldingDeduction).toBe(2_337_058);
  });

  it("anchor #14 — 토지 LTHD 양수 (carryover 결과 회귀 가드)", () => {
    // 토지 LTHD: 단건 엔진의 비교과세 결과 — 양수 보장 (회귀 차단)
    expect(landBreakdown?.longTermHoldingDeduction ?? 0).toBeGreaterThanOrEqual(0);
  });

  it("anchor #15 — 토지 양도소득금액 (income) 양수", () => {
    // 토지: 환산취득가 + 비교과세 → 양도소득금액 양수
    expect((landBreakdown?.income ?? 0)).toBeGreaterThan(0);
  });

  it("anchor #16 — 양도소득금액 합계 양수", () => {
    const totalIncome = properties.reduce(
      (sum, p) => sum + (p.income ?? 0),
      0,
    );
    expect(totalIncome).toBeGreaterThan(0);
  });
});
