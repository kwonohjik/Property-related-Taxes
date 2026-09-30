/**
 * G3 — 일반건물 분리 OFF 상속·증여에 남은 추계 플래그 (2026-09-30)
 *
 * §163⑨ 상속·증여 파트는 추계가 불가하다(⑧ `validate-gb.ts` `blockEstimation`). 분리 OFF의
 * 상속·증여 카드에는 산정 방식 라디오가 없어, 매매에서 고른 환산(또는 분리 ON 파트 라디오)이 남으면
 * 끌 칸 없는 영구 차단이었다. ⑧을 좁히면 ④가 같은 플래그로 환산 계산을 하므로 **입력 쪽에서 비운다**.
 *
 * 경로 3개가 같은 patch(`gbUnifiedSec1639ClearPatch`)를 쓴다: 원인 전환 · 분리 OFF 전환(화면, E2E가 고정)
 * · 복원 마이그레이션(여기서 고정). E2E 짝: `e2e/transfer-dead-end-defects.spec.ts` G3.
 */
import { describe, it, expect } from "vitest";
import { gbUnifiedSec1639ClearPatch } from "@/lib/calc/transfer-tax-split-acq-mode";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";

describe("gbUnifiedSec1639ClearPatch", () => {
  it.each(["inheritance", "gift"])("%s — 추계 플래그 5종을 비운다", (cause) => {
    expect(gbUnifiedSec1639ClearPatch(cause)).toEqual({
      useEstimatedAcquisition: false,
      isAppraisalAcquisition: false,
      isSalesCaseAcquisition: false,
      landAcqMode: "",
      buildingAcqMode: "",
    });
  });

  it.each(["purchase", "carryover_gift", "newConstruction", undefined])(
    "%s — 건드리지 않는다 (추계가 허용되거나 다른 축)",
    (cause) => {
      expect(gbUnifiedSec1639ClearPatch(cause)).toEqual({});
    },
  );
});

const gbRaw = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1),
  assetKind: "general_building",
  acquisitionCause: "inheritance",
  gbBuildingAcquisitionCause: "inheritance",
  hasSeperateLandAcquisitionDate: false,
  acquisitionDate: "2015-03-01",
  useEstimatedAcquisition: true,
  landAcqMode: "estimated",
  ...over,
});

describe("복원 마이그레이션 — migrateAsset", () => {
  it("분리 OFF 상속 — 남은 추계 플래그를 비운다", () => {
    const a = migrateAsset(gbRaw());
    expect(a.useEstimatedAcquisition).toBe(false);
    expect(a.landAcqMode).toBe("");
  });

  it("분리 OFF 증여도 같다", () => {
    const a = migrateAsset(gbRaw({ acquisitionCause: "gift", gbBuildingAcquisitionCause: "gift" }));
    expect(a.useEstimatedAcquisition).toBe(false);
  });

  it("legacy `gbUseEstimatedAcquisition` 흡수보다 뒤에 돈다 — 다시 켜지지 않는다", () => {
    const a = migrateAsset(gbRaw({ useEstimatedAcquisition: false, gbUseEstimatedAcquisition: true }));
    expect(a.useEstimatedAcquisition).toBe(false);
  });

  it("분리 ON은 건드리지 않는다 — 파트 라디오가 화면에 있어 입력칸 이동으로 고칠 수 있다", () => {
    const a = migrateAsset(gbRaw({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2012-03-01" }));
    expect(a.landAcqMode).toBe("estimated");
  });

  it("매매는 건드리지 않는다 — 환산이 유효한 선택이다", () => {
    const a = migrateAsset(gbRaw({ acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase" }));
    expect(a.useEstimatedAcquisition).toBe(true);
  });

  it("일반건물이 아니면 건드리지 않는다", () => {
    const a = migrateAsset(gbRaw({ assetKind: "land" }));
    expect(a.useEstimatedAcquisition).toBe(true);
  });
});

describe("⑧ 차단 자체는 그대로다 — 비우지 않은 입력은 여전히 막는다 (과소 차단 방지)", () => {
  it("분리 OFF 상속 + 환산 플래그 → §163⑨ 차단", () => {
    const a = {
      ...gbRaw(),
      gbTransferLandPricePerSqm: "5000000",
      gbLandArea: "200",
      gbTransferBuildingValue: "300000000",
      gbBuildingFootprintArea: "100",
      gbZoneType: "general_residential",
    };
    expect(validateGeneralBuildingAsset(a as never, "자산")).toMatch(/「실거래가」를 선택하세요/);
  });
});
