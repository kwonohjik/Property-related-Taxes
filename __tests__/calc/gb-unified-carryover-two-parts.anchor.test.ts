/**
 * anchor: 일반건물 분리 OFF × 이월과세(증여) — 건물 파트도 승계한다 (Q09).
 *
 * 종전에는 분리 OFF의 단일 취득원인에서 「이월과세(증여)」를 골라도 건물 축이
 * `purchase`로 **강등**돼(`toBuildingCause`), 토지만 증여자 취득가액·증여세 상당액을
 * 승계하고 건물은 매매로 계산됐다. 법 §97의2①은 「**토지·건물** 등」이다.
 *
 * ⭐ 파트별 「증여 당시 평가액」은 **각각** 받는다(사용자 결정 2026-09-05) — 증여세
 *    신고서에 물건별로 적히므로 그대로 옮겨 적을 수 있고, ⑧의 Σ 검증
 *    (합계 ≤ 증여세 과세가액)도 그대로 산다.
 */
import { describe, it, expect } from "vitest";
import { buildGbCarryoverPayload } from "@/lib/calc/transfer-tax-api-gb-carryover";
import { validateGbCarryover } from "@/lib/calc/transfer-tax-validate-gb-carryover";
import { migrateGeneralBuildingFields } from "@/lib/stores/calc-wizard-asset-migrate-phase3";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const LAND_CARRYOVER = {
  giftRegistryDate: "2020-05-01",
  giftTaxCalculated: "30,000,000",
  giftTaxBase: "500,000,000",
  donorAcquisitionDate: "2010-03-01",
  donorAcquisitionPrice: "200,000,000",
  giftDateValuation: "300,000,000",
  donorRelation: "spouse",
};

const BUILDING_CARRYOVER = {
  ...LAND_CARRYOVER,
  donorAcquisitionDate: "2012-09-01",
  donorAcquisitionPrice: "150,000,000",
  giftDateValuation: "200,000,000",
};

function asset(over: Record<string, unknown> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "carryover_gift",
    gbBuildingAcquisitionCause: "carryover_gift",
    hasSeperateLandAcquisitionDate: false,
    carryover: LAND_CARRYOVER,
    buildingCarryover: BUILDING_CARRYOVER,
    ...over,
  } as unknown as AssetForm;
}

describe("분리 OFF × 이월과세 — 두 파트 승계", () => {
  it("🔑 ④가 토지·건물 파트를 **각각** 싣는다", () => {
    const p = buildGbCarryoverPayload(asset()) as Record<string, Record<string, unknown>>;
    expect(p.landCarryoverPart?.giftDateAssetValue).toBe(300_000_000);
    expect(p.buildingCarryoverPart?.giftDateAssetValue).toBe(200_000_000);
    // 증여 사건은 한 벌이다 — 파트마다 두지 않는다.
    expect(p.carryoverGiftEvent?.giftTaxBase).toBe(500_000_000);
  });

  it("🔑 파트별 증여자 취득일이 서로 다르게 실린다 (§95④ 보유기간 기산일)", () => {
    const p = buildGbCarryoverPayload(asset()) as Record<string, Record<string, unknown>>;
    expect(p.landCarryoverPart?.donorAcquisitionDate).toBe("2010-03-01");
    expect(p.buildingCarryoverPart?.donorAcquisitionDate).toBe("2012-09-01");
  });

  it("🔴 건물 평가액을 비우면 ⑧이 막는다 — 채울 칸이 생겼으므로 안내가 성립한다", () => {
    const issue = validateGbCarryover(
      asset({ buildingCarryover: { ...BUILDING_CARRYOVER, giftDateValuation: "" } }),
      "일반건물",
    );
    expect(issue).toMatch(/건물: 증여 당시 평가액/);
  });

  it("⑧ Σ 검증 — 파트 합계가 증여세 과세가액을 넘으면 막는다", () => {
    const issue = validateGbCarryover(
      asset({ buildingCarryover: { ...BUILDING_CARRYOVER, giftDateValuation: "400,000,000" } }),
      "일반건물",
    );
    expect(issue).toMatch(/증여세 과세가액/);
  });

  it("두 파트가 모두 채워지면 통과한다", () => {
    expect(validateGbCarryover(asset(), "일반건물")).toBeNull();
  });

  it("🔑 ③ 마이그레이션이 carryover_gift를 purchase로 강등하지 않는다", () => {
    const a: Record<string, unknown> = {
      assetKind: "general_building",
      acquisitionCause: "carryover_gift",
      hasSeperateLandAcquisitionDate: false,
    };
    migrateGeneralBuildingFields(a);
    expect(a.gbBuildingAcquisitionCause).toBe("carryover_gift");
    // 원인이 일치하므로 분리를 억지로 켜지도 않는다(M-2b).
    expect(a.hasSeperateLandAcquisitionDate).toBe(false);
  });
});
