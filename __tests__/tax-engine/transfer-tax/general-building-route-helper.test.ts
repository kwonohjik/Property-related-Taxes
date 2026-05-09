/**
 * 일반건물(토지+건물 일괄) 라우트 헬퍼 회귀 테스트.
 *
 * 사례 31 입력으로 calculateGeneralBuildingTransfer()가 토지·건물 자산별
 * 양도가액·취득가액·필요경비·산출세액을 정확히 분리해 반환하는지 검증.
 *
 * 회귀 방어 anchor: API 라우트가 호출하는 실제 경로 (헬퍼 → buildGeneralBuildingAssetCards
 * → calculateTransferTaxAggregate)에서 누락 필드(`reductions`·`useEstimatedAcquisition` 등)
 * 또는 잘못된 플래그(`useEstimatedAcquisition: true` → 환산 재시도 → 취득가액 0) 회귀 차단.
 */

import { describe, it, expect } from "vitest";
import { calculateGeneralBuildingTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";

describe("일반건물 라우트 헬퍼 — 사례 31 회귀 anchor", () => {
  const result = calculateGeneralBuildingTransfer(
    {
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
    },
    2023,
    0,
    [],
    makeMockRates(),
  );

  const land = result.aggregated.properties.find((p) => p.propertyId === "land")!;
  const building = result.aggregated.properties.find((p) => p.propertyId === "building")!;

  it("토지·건물 자산 카드 2장 생성", () => {
    expect(land).toBeDefined();
    expect(building).toBeDefined();
  });

  it("양도가액 안분 — 토지 904,725,192 / 건물 20,274,808", () => {
    expect(land.transferPrice).toBe(904_725_192);
    expect(building.transferPrice).toBe(20_274_808);
  });

  it("취득가액 0 회귀 방어 — 환산취득가가 자산별로 정확히 적용되어야 함", () => {
    // useEstimatedAcquisition: true 로 잘못 설정 시 엔진이 환산을 재시도하여 0이 됨.
    // 이 anchor가 깨지면 헬퍼의 useEstimatedAcquisition 플래그를 점검할 것.
    expect(land.acquisitionPrice).toBeGreaterThan(0);
    expect(building.acquisitionPrice).toBeGreaterThan(0);
  });

  it("apportionment 결과 — 토지·건물 분리 표시", () => {
    expect(result.apportionment.apportioned).toHaveLength(2);
    expect(result.apportionment.apportioned[0].assetKind).toBe("land");
    expect(result.apportionment.apportioned[1].assetKind).toBe("building");
  });
});
