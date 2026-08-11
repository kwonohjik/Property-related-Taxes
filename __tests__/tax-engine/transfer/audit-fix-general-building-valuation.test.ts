/**
 * 감사 결함 회귀 테스트 — general-building-valuation.ts:623
 *
 * 결함 ref: general-building-valuation.ts:623 (confirmed / low / edge-case)
 *   무허가(전체 비사업용) 토지에서 NBL 분할이 전액 0원짜리 '토지-사업용(1001)'
 *   유령 카드를 추가로 생성한다.
 *
 * 법령 근거: 소득세법 §104의3①4호나목 + 지방세법 시행령 §101①단서 —
 *   무허가건축물 부속토지는 전체 비사업용(사업용분 없음).
 *
 * 기대 동작(수정 후): isUnregistered=true(인정면적 0) 시 사업용 카드를 만들지 않고
 *   비사업용 카드 1장만 전액 흡수. 세액(양도차익 합계)은 불변(유령 카드는 차익 0 기여).
 *
 * 기대값은 §166⑥(양도가 안분)·§176의2②(환산취득가)·§163⑥(개산공제 3%) 산식에서
 *   독립적으로 손계산해 하드코딩한다(엔진 출력 복사 금지).
 */

import { describe, it, expect } from "vitest";
import { buildGeneralBuildingAssetCards } from "@/lib/tax-engine/general-building-valuation";
import type { GeneralBuildingInput } from "@/lib/tax-engine/general-building-valuation";

// ============================================================
// 손계산 (독립 도출)
// ============================================================
//
// 공통 가격 파라미터:
//   transferLandPricePerSqm = 1,000,000 원/㎡, landArea = 200㎡
//     → landStdTotal(양도시 토지 기준시가) = 200,000,000
//   transferBuildingStdPrice = 50,000,000
//     → totalStd = 250,000,000
//   totalTransferPrice = 500,000,000
//
// §166⑥ 양도가 안분:
//   allocation.land     = floor(500,000,000 × 200,000,000 / 250,000,000) = 400,000,000
//   allocation.building = 500,000,000 − 400,000,000 = 100,000,000
//
// §176의2② 환산취득가:
//   acquisitionLandPricePerSqm = 400,000 → acqLandStdTotal = 400,000 × 200 = 80,000,000
//   acquisition.land     = floor(400,000,000 × 80,000,000 / 200,000,000) = 160,000,000
//   acquisitionBuildingStdPrice = 20,000,000
//   acquisition.building = floor(100,000,000 × 20,000,000 / 50,000,000) = 40,000,000
//
// §163⑥ 개산공제 (등기 3%):
//   estimatedDeduction.land     = floor(80,000,000 × 0.03) = 2,400,000
//   estimatedDeduction.building = floor(20,000,000 × 0.03) =   600,000
//
// 양도차익(자산별):
//   토지 = 400,000,000 − 160,000,000 − 2,400,000 = 237,600,000
//   건물 = 100,000,000 −  40,000,000 −   600,000 =  59,400,000
//   합계 = 297,000,000
// ============================================================

const BASE_PRICE_PARAMS = {
  totalTransferPrice: 500_000_000,
  transferDate: new Date("2023-05-01"),
  acquisitionDate: new Date("1999-05-01"),
  landArea: 200,
  buildingArea: 100,
  transferLandPricePerSqm: 1_000_000,
  transferBuildingStdPrice: 50_000_000,
  acquisitionLandPricePerSqm: 400_000,
  acquisitionBuildingStdPrice: 20_000_000,
  buildingAcquisitionCause: "purchase" as const,
  zoneType: "commercial",
  isMetropolitan: true,
};

// ============================================================
// A. 무허가(전체 비사업용) — 유령 사업용 카드 미생성
// ============================================================

describe("결함 수정: 무허가(전체 비사업용) 시 0원 사업용 유령 카드 미생성", () => {
  const input: GeneralBuildingInput = {
    ...BASE_PRICE_PARAMS,
    buildingFootprintArea: 100, // isUnregistered 경로에서는 무시됨
    unapprovedBuilding: true,
  };
  const out = buildGeneralBuildingAssetCards(input);

  it("land_business(토지-사업용) 카드가 생성되지 않는다", () => {
    const business = out.assetCards.find((c) => c.propertyId === "land_business");
    expect(business).toBeUndefined();
  });

  it("토지 카드는 정확히 1장이며 전체 비사업용(isNonBusinessLand=true)", () => {
    const landCards = out.assetCards.filter((c) => c.propertyType === "land");
    expect(landCards).toHaveLength(1);
    expect(landCards[0].isNonBusinessLand).toBe(true);
    expect(landCards[0].propertyId).toBe("land_nbl");
  });

  it("비사업용 토지 카드가 안분 전액을 흡수한다 (§166⑥·§176의2②·§163⑥ 손계산)", () => {
    const nbl = out.assetCards.find((c) => c.propertyId === "land_nbl");
    expect(nbl?.transferPrice).toBe(400_000_000);
    expect(nbl?.acquisitionPrice).toBe(160_000_000);
    expect(nbl?.expenses).toBe(2_400_000);
  });

  it("자산 카드는 토지(비사업용)·건물 2장 (유령 카드 없음)", () => {
    expect(out.assetCards).toHaveLength(2);
  });

  it("세액 중립: 자산별 양도차익 합계 = 297,000,000 (유령 카드 유무 무관)", () => {
    const totalGain = out.assetCards.reduce(
      (sum, c) => sum + (c.transferPrice - c.acquisitionPrice - c.expenses),
      0,
    );
    expect(totalGain).toBe(297_000_000);
  });
});

// ============================================================
// B. 부분 초과(비-무허가) 정상 분할은 그대로 유지 (surgical 회귀 가드)
// ============================================================
//
// buildingFootprintArea = 20㎡, 수도권 상업지역 배율 3배 → 인정한도 60㎡.
// landArea 200㎡ > 60㎡ → 초과분 존재, allowedLandArea = 60 > 0.
//   landBusinessTransfer = floor(400,000,000 × 60/200) = 120,000,000
//   land_nbl transfer     = 400,000,000 − 120,000,000 = 280,000,000
// ============================================================

describe("회귀 가드: 부분 초과(인정면적>0) 시 사업용·비사업용 2장 분할 유지", () => {
  const input: GeneralBuildingInput = {
    ...BASE_PRICE_PARAMS,
    buildingFootprintArea: 20, // 인정한도 20×3 = 60㎡ < 200㎡ → 부분 초과
  };
  const out = buildGeneralBuildingAssetCards(input);

  it("사업용·비사업용 토지 카드 2장이 모두 존재", () => {
    const business = out.assetCards.find((c) => c.propertyId === "land_business");
    const nbl = out.assetCards.find((c) => c.propertyId === "land_nbl");
    expect(business).toBeDefined();
    expect(nbl).toBeDefined();
  });

  it("자산 카드는 토지 2장 + 건물 1장 = 3장", () => {
    expect(out.assetCards).toHaveLength(3);
  });

  it("면적 안분 + 잔여 흡수 (사업용 120,000,000 / 비사업용 280,000,000, 합계 = 안분 전액)", () => {
    const business = out.assetCards.find((c) => c.propertyId === "land_business");
    const nbl = out.assetCards.find((c) => c.propertyId === "land_nbl");
    expect(business?.transferPrice).toBe(120_000_000);
    expect(nbl?.transferPrice).toBe(280_000_000);
    expect((business?.transferPrice ?? 0) + (nbl?.transferPrice ?? 0)).toBe(400_000_000);
  });
});
