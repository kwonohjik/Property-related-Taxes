/**
 * NBL 정밀판정 케이스 anchor — 지목별 sub-object 엔진 도달 + ⑧ validation
 *
 * Plan: docs/00-pm/nbl-detailed-input-restoration.plan.md §5 케이스 매트릭스(C1·C6·E2·E1)
 * buildNblEngineInput(raw)로 sub-object/Date 도달 + validateAssetAcquisition 차단 검증.
 */
import { describe, it, expect } from "vitest";

import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

describe("[NBL-CASES] buildNblEngineInput — 지목별 sub-object 엔진 도달", () => {
  it("C1 farmland — farmingSelf·farmlandDeeming·gracePeriods(Date) 도달", () => {
    const input = buildNblEngineInput({
      nblUseDetailedJudgment: true,
      nblLandType: "farmland",
      nblZoneType: "agriculture_forest",
      acquisitionArea: "1,000",
      acquisitionDate: "2018-01-01",
      transferDate: "2026-06-01",
      nblFarmingSelf: true,
      nblFarmlandIsWeekendFarm: true,
      nblGracePeriods: [{ reasonCode: "other_justifiable", anchorDate: "2020-01-01", endDate: "2021-01-01" }],
    } as never);
    expect(input).toBeDefined();
    expect(input!.landArea).toBe(1000); // 콤마 제거 파서
    expect(input!.farmingSelf).toBe(true);
    expect(input!.farmlandDeeming?.isWeekendFarm).toBe(true);
    expect(input!.gracePeriods.length).toBe(1);
    expect(input!.gracePeriods[0]?.startDate).toBeInstanceOf(Date);
  });

  it("[②] farmland — nblFarmlandIsFarmDevZone 단독 → farmlandDeeming.isFarmDevZone 도달", () => {
    // fix 전: buildFarmlandDeeming has 게이트에 isFarmDevZone 부재 → has=false → undefined 반환 → 도달 실패
    const input = buildNblEngineInput({
      nblUseDetailedJudgment: true,
      nblLandType: "farmland",
      nblZoneType: "agriculture_forest",
      acquisitionArea: "1,200",
      acquisitionDate: "2018-01-01",
      transferDate: "2026-06-01",
      nblFarmlandIsFarmDevZone: true,
    } as never);
    expect(input).toBeDefined();
    expect(input!.farmlandDeeming?.isFarmDevZone).toBe(true);
  });

  it("C6 other_land — otherLand 재산세유형 도달", () => {
    const input = buildNblEngineInput({
      nblUseDetailedJudgment: true,
      nblLandType: "other_land",
      nblZoneType: "residential",
      acquisitionArea: "500",
      acquisitionDate: "2018-01-01",
      transferDate: "2026-06-01",
      nblOtherPropertyTaxType: "comprehensive",
      nblOtherIsRelatedToResidence: false,
    } as never);
    expect(input!.otherLand?.propertyTaxType).toBe("comprehensive");
  });

  it("[A·N1] other_land — nblOtherBuildingFloorArea → otherLand.buildingFloorArea 도달 (매퍼 결선)", () => {
    // fix 전: buildOtherLand가 buildingFloorArea 미설정 → undefined
    const input = buildNblEngineInput({
      nblUseDetailedJudgment: true,
      nblLandType: "other_land",
      nblZoneType: "general_residential",
      acquisitionArea: "1000",
      acquisitionDate: "2018-01-01",
      transferDate: "2026-06-01",
      nblOtherHasBuilding: true,
      nblOtherPropertyTaxType: "comprehensive",
      nblOtherBuildingValue: "5000000",
      nblOtherLandValue: "1000000000",
      nblOtherBuildingFloorArea: "200",
    } as never);
    expect(input).toBeDefined();
    expect(input!.otherLand?.buildingFloorArea).toBe(200);
    expect(input!.otherLand?.resortBuildingFloorArea).toBeUndefined(); // resort와 분리
  });

  it("[④] other_land — nblOtherHasBuilding → otherLand.hasBuilding 도달 (매퍼 결선)", () => {
    // fix 전: buildOtherLand가 hasBuilding:false 하드코딩 → 항상 false
    const input = buildNblEngineInput({
      nblUseDetailedJudgment: true,
      nblLandType: "other_land",
      nblZoneType: "general_residential",
      acquisitionArea: "500",
      acquisitionDate: "2018-01-01",
      transferDate: "2026-06-01",
      nblOtherPropertyTaxType: "separate",
      nblOtherHasBuilding: true,
      nblOtherBuildingValue: "100000000",
      nblOtherLandValue: "200000000",
    } as never);
    expect(input!.otherLand?.hasBuilding).toBe(true);
  });

  it("[④] 건물有 + 별도합산 → 사업용(§104의3①4호나목, isNonBusinessLand=false)", () => {
    const input = buildNblEngineInput({
      nblUseDetailedJudgment: true,
      nblLandType: "other_land",
      nblZoneType: "general_residential",
      acquisitionArea: "500",
      acquisitionDate: "2010-01-01",
      transferDate: "2024-01-01",
      nblOtherPropertyTaxType: "separate",
      nblOtherHasBuilding: true,
      nblOtherBuildingValue: "100000000",
      nblOtherLandValue: "200000000",
    } as never);
    const judgment = judgeNonBusinessLand(input!, DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(judgment.isNonBusinessLand).toBe(false);
  });

  it("[④] 나대지(건물無) + 별도합산 선택 → 종합합산 override → 비사업용(override 정당)", () => {
    // 동일 입력에서 hasBuilding만 false → 결과가 갈림(단일 필드 영향 증명)
    const input = buildNblEngineInput({
      nblUseDetailedJudgment: true,
      nblLandType: "other_land",
      nblZoneType: "general_residential",
      acquisitionArea: "500",
      acquisitionDate: "2010-01-01",
      transferDate: "2024-01-01",
      nblOtherPropertyTaxType: "separate",
      nblOtherHasBuilding: false,
    } as never);
    const judgment = judgeNonBusinessLand(input!, DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(judgment.isNonBusinessLand).toBe(true);
  });

  it("E2 ownershipRatio<1 — ownerProfile.ownershipRatio 도달 (매퍼 결선)", () => {
    const input = buildNblEngineInput({
      nblUseDetailedJudgment: true,
      nblLandType: "forest",
      nblZoneType: "agriculture_forest",
      acquisitionArea: "1000",
      acquisitionDate: "2018-01-01",
      transferDate: "2026-06-01",
      nblOwnershipRatio: "0.5",
    } as never);
    expect(input!.ownerProfile?.ownershipRatio).toBe(0.5);
  });
});

describe("[NBL-VALIDATE] ⑧ 정밀판정 필수필드 차단 (E1)", () => {
  const baseLand = () =>
    ({
      ...createDefaultTransferFormData().assets[0],
      assetKind: "land",
      acquisitionDate: "2018-01-01",
      nblUseDetailedJudgment: true,
    }) as AssetForm;

  it("지목 미선택 → 차단", () => {
    const asset = { ...baseLand(), nblLandType: "", nblZoneType: "agriculture_forest", acquisitionArea: "1000" } as AssetForm;
    expect(validateAssetAcquisition(asset, "자산1", "2026-06-01")).toMatch(/지목을 선택/);
  });

  it("용도지역 미선택 → 차단", () => {
    const asset = { ...baseLand(), nblLandType: "forest", nblZoneType: "", acquisitionArea: "1000" } as AssetForm;
    expect(validateAssetAcquisition(asset, "자산1", "2026-06-01")).toMatch(/용도지역을 선택/);
  });

  it("면적 미입력 → 차단", () => {
    const asset = { ...baseLand(), nblLandType: "forest", nblZoneType: "agriculture_forest", acquisitionArea: "" } as AssetForm;
    expect(validateAssetAcquisition(asset, "자산1", "2026-06-01")).toMatch(/토지 면적/);
  });

  it("C0 간편 모드(nblUseDetailedJudgment=false) — NBL 차단 없이 통과", () => {
    const asset = {
      ...baseLand(),
      nblUseDetailedJudgment: false,
      nblLandType: "",
      acquisitionCause: "purchase",
      fixedAcquisitionPrice: "200,000,000",
    } as AssetForm;
    expect(validateAssetAcquisition(asset, "자산1", "2026-06-01")).toBeNull();
  });
});
