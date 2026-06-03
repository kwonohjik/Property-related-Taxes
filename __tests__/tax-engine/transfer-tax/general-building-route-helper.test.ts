/**
 * 일반건물(토지+건물 일괄) 라우트 헬퍼 회귀 + NBL 안분 중과 테스트.
 *
 * 회귀 방어:
 *  - API 라우트가 호출하는 경로에서 누락 필드·잘못된 플래그 회귀 차단
 *  - zoneType 미입력 시 예외 발생 (fallback 3배 금지)
 *  - 초과분 토지 2분할 + 비사업용 카드에만 +10%p 중과
 */

import { describe, it, expect } from "vitest";
import { calculateGeneralBuildingTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { buildGeneralBuildingAssetCards } from "@/lib/tax-engine/general-building-valuation";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";

// ── 사례 31 기본 입력 ──────────────────────────────────────────────────
const BASE_INPUT = {
  totalTransferPrice: 925_000_000,
  transferDate: new Date("2023-02-19"),
  acquisitionDate: new Date("1999-05-24"),
  landArea: 85,
  buildingArea: 180.96,
  buildingFootprintArea: 90.48,
  transferLandPricePerSqm: 10_830_000,
  transferBuildingStdPrice: 20_629_440,
  acquisitionLandPricePerSqm: 2_800_000,
  acquisitionBuildingStdPrice: 28_144_700,
  zoneType: "commercial",
  isMetropolitan: true,
  // 사례 31 마이그레이션: 토지·건물 동시 매매
  buildingAcquisitionCause: "purchase" as const,
  buildingAcquisitionDate: new Date("1999-05-24"),
};

// ============================================================
// 사례 31 — 전체 사업용 (허용 내) 회귀 anchor
// ============================================================
describe("일반건물 라우트 헬퍼 — 사례 31 회귀 anchor", () => {
  const result = calculateGeneralBuildingTransfer(
    BASE_INPUT,
    2023, 0, [], makeMockRates(),
  );

  const land = result.aggregated.properties.find((p) => p.propertyId === "land")!;
  const building = result.aggregated.properties.find((p) => p.propertyId === "building")!;

  it("토지·건물 자산 카드 2장 생성 (전체 사업용 → land + building)", () => {
    expect(land).toBeDefined();
    expect(building).toBeDefined();
    // 초과 없으므로 land_business/land_nbl 분할 없음
    const nbl = result.aggregated.properties.find((p) => p.propertyId === "land_nbl");
    expect(nbl).toBeUndefined();
  });

  it("양도가액 안분 — 토지 904,725,192 / 건물 20,274,808", () => {
    expect(land.transferPrice).toBe(904_725_192);
    expect(building.transferPrice).toBe(20_274_808);
  });

  it("취득가액 0 회귀 방어 — 환산취득가 정상 적용", () => {
    expect(land.acquisitionPrice).toBeGreaterThan(0);
    expect(building.acquisitionPrice).toBeGreaterThan(0);
  });

  it("apportionment 결과 — 2장 분리 표시", () => {
    expect(result.apportionment.apportioned).toHaveLength(2);
    expect(result.apportionment.apportioned[0].assetKind).toBe("land");
    expect(result.apportionment.apportioned[1].assetKind).toBe("building");
  });
});

// ============================================================
// 시나리오 D — zoneType 미입력 시 예외 (fallback 금지)
// ============================================================
describe("시나리오 D — 용도지역 미입력 예외", () => {
  it("zoneType 없이 buildGeneralBuildingAssetCards() 호출 시 예외", () => {
    const { zoneType: _z, ...withoutZone } = BASE_INPUT;
    expect(() => buildGeneralBuildingAssetCards(withoutZone)).toThrow(/zoneType/);
  });
});

// ============================================================
// 시나리오 E — 초과분 안분 중과 (§104의3 정확 구현)
// 토지 400㎡, 수평투영 90㎡, 수도권 상업 → 허용 270㎡, 초과 130㎡(32.5%)
// ============================================================
describe("시나리오 E — 초과분 안분 비사업용 토지 분할", () => {
  const nblOut = buildGeneralBuildingAssetCards({
    ...BASE_INPUT,
    landArea: 400,            // 85 → 400 (허용 270㎡ 초과)
    buildingFootprintArea: 90, // 허용 = 90 × 3 = 270㎡
  });

  it("배율 = 수도권 상업 3배 → 인정 한도 270㎡", () => {
    expect(nblOut.appliedMultiplier).toBe(3);
    expect(nblOut.allowedLandArea).toBeCloseTo(270, 1);
  });

  it("초과 면적 130㎡ / 비율 32.5%", () => {
    expect(nblOut.nonBusinessArea).toBeCloseTo(130, 0);
    expect(nblOut.nonBusinessRatio).toBeCloseTo(0.325, 3);
  });

  it("토지 카드가 사업용(land_business) + 비사업용(land_nbl) 2장으로 분할", () => {
    const landBiz = nblOut.assetCards.find((c) => c.propertyId === "land_business");
    const landNbl = nblOut.assetCards.find((c) => c.propertyId === "land_nbl");
    expect(landBiz).toBeDefined();
    expect(landNbl).toBeDefined();
    expect(landBiz!.isNonBusinessLand).toBe(false);
    expect(landNbl!.isNonBusinessLand).toBe(true);
  });

  it("사업용 + 비사업용 토지 양도가 합계 = 전체 토지 양도가", () => {
    const landBiz = nblOut.assetCards.find((c) => c.propertyId === "land_business")!;
    const landNbl = nblOut.assetCards.find((c) => c.propertyId === "land_nbl")!;
    const totalLand = nblOut.allocation.land;
    expect(landBiz.transferPrice + landNbl.transferPrice).toBe(totalLand);
  });
});

// ============================================================
// 시나리오 E-2 — 무한소수 비율 면적 직접 안분 (round 의존 제거 회귀 방어)
// 토지 350㎡, 수평투영 90㎡, 수도권 상업 → 허용 270㎡, 초과 80㎡ (80/350 무한소수).
// round 4자리 방식이면 사업용 양도가가 26,286원 어긋남 → 면적 직접 안분으로 차단.
// ============================================================
describe("시나리오 E-2 — 무한소수 비율 면적 직접 안분 (§104의3)", () => {
  const out = buildGeneralBuildingAssetCards({
    ...BASE_INPUT,
    landArea: 350,
    buildingFootprintArea: 90, // 허용 = 90 × 3 = 270㎡, 초과 80㎡
  });
  const biz = out.assetCards.find((c) => c.propertyId === "land_business")!;
  const nbl = out.assetCards.find((c) => c.propertyId === "land_nbl")!;

  it("nonBusinessRatio = 80/350 정밀 (round 4자리 미사용)", () => {
    expect(out.nonBusinessRatio).toBeCloseTo(80 / 350, 10);
  });

  it("land_business 양도가 = 709,708,904 (면적 직접; round 방식 709,682,618 대비 +26,286)", () => {
    expect(biz.transferPrice).toBe(709_708_904);
  });

  it("land_business 환산취득가 = 183,488,912 / 개산공제 = 22,680,000", () => {
    expect(biz.acquisitionPrice).toBe(183_488_912);
    expect(biz.expenses).toBe(22_680_000);
  });

  it("사업용 + 비사업용 = 전체 토지 (잔액 흡수로 합계 보존)", () => {
    expect(biz.transferPrice + nbl.transferPrice).toBe(out.allocation.land);
    expect(biz.acquisitionPrice + nbl.acquisitionPrice).toBe(out.acquisition.land);
    expect(biz.expenses + nbl.expenses).toBe(out.estimatedDeduction.land);
  });
});

// ============================================================
// 시나리오 F — 무허가건축물 → 전체 비사업용
// ============================================================
describe("시나리오 F — 무허가건축물 전체 비사업용", () => {
  const unregistered = buildGeneralBuildingAssetCards({
    ...BASE_INPUT,
    isUnregistered: true,
  });

  it("배율 0, 허용 한도 0, 전체 비사업용", () => {
    expect(unregistered.appliedMultiplier).toBe(0);
    expect(unregistered.allowedLandArea).toBe(0);
    expect(unregistered.isWithinNblRatio).toBe(false);
    expect(unregistered.nonBusinessRatio).toBe(1);
  });

  it("토지 카드가 land_nbl로 전체 비사업용 마킹", () => {
    const nbl = unregistered.assetCards.find((c) => c.propertyId === "land_nbl");
    expect(nbl).toBeDefined();
    expect(nbl!.isNonBusinessLand).toBe(true);
  });
});
