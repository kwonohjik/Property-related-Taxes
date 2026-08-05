/**
 * Pre-Do anchor — M-1a `acquisitionDate` 규약 통일 + stale 마이그레이션 (P1)
 *
 * 계획서: `docs/02-design/features/general-building-part-major-acquisition.plan.md` §3.2
 *
 * 일반건물의 폼 규약이 split(주택·건물)과 **반대**였다(§1.4):
 *   일반건물 — `acquisitionDate` = 토지 / `gbBuildingAcquisitionDate` = 건물
 *   split    — `acquisitionDate` = 건물 / `landAcquisitionDate` = 토지
 * 이를 split 규약으로 통일한다. 이 파일은 구현 전에 작성돼 현행에서 실패한다.
 *
 * ## 고정 계약
 *   A-8  분리 OFF면 `landAcquisitionDate === acquisitionDate` (불변식 — 회귀 0의 안전핀)
 *   A-9  legacy 자산은 1회 스왑 후 키가 사라지고, **두 번 돌려도 결과가 같다**(멱등)
 *
 * ⚠️ A-9의 멱등성은 `gbBuildingAcquisitionDate` **키 삭제**가 유일한 근거다. 삭제를 빠뜨리면
 *    재실행 때 토지↔건물이 다시 스왑돼 날짜가 뒤바뀐다(계획서 §3.2(3)).
 */
import { describe, it, expect } from "vitest";
import { migrateGeneralBuildingFields } from "@/lib/stores/calc-wizard-asset-migrate-phase3";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";

const LAND_ACQ = "1999-05-24";
const BUILDING_ACQ = "2020-03-01";

/** M-1a 전환 **전** 규약으로 저장된 sessionStorage 자산 */
function legacyGbRaw(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    assetId: "asset-legacy-1",
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: LAND_ACQ, // 옛 규약 = 토지
    gbBuildingAcquisitionDate: BUILDING_ACQ, // 옛 규약 = 건물
    ...over,
  };
}

describe("A-8 — 분리 OFF 불변식", () => {
  it("취득일만 입력된 일반건물은 landAcquisitionDate가 같은 값으로 채워진다", () => {
    const asset = migrateAsset({
      assetId: "asset-1",
      assetKind: "general_building",
      acquisitionDate: LAND_ACQ,
      hasSeperateLandAcquisitionDate: false,
    });
    expect(asset.landAcquisitionDate).toBe(asset.acquisitionDate);
    expect(asset.landAcquisitionDate).toBe(LAND_ACQ);
  });

  it("분리 OFF인데 두 날짜가 어긋난 stale 자산은 동기화된다", () => {
    const asset = migrateAsset({
      assetId: "asset-2",
      assetKind: "general_building",
      acquisitionDate: BUILDING_ACQ,
      landAcquisitionDate: LAND_ACQ, // 분리 OFF인데 남아 있는 stale 값
      hasSeperateLandAcquisitionDate: false,
    });
    expect(asset.landAcquisitionDate).toBe(asset.acquisitionDate);
  });
});

describe("A-9 — legacy 스왑 마이그레이션 (멱등)", () => {
  it("옛 규약을 새 규약으로 바꾸고 legacy 키를 삭제한다", () => {
    const a = legacyGbRaw();
    migrateGeneralBuildingFields(a);

    expect(a.landAcquisitionDate).toBe(LAND_ACQ); // 옛 acquisitionDate
    expect(a.acquisitionDate).toBe(BUILDING_ACQ); // 옛 gbBuildingAcquisitionDate
    expect("gbBuildingAcquisitionDate" in a).toBe(false); // 키 소멸 = 멱등의 근거
  });

  it("두 날짜가 다르면 분리 ON으로 승격한다", () => {
    const a = legacyGbRaw();
    migrateGeneralBuildingFields(a);
    expect(a.hasSeperateLandAcquisitionDate).toBe(true);
  });

  it("건물 취득일이 비어 있으면 두 날짜가 같아지고 분리 OFF다", () => {
    const a = legacyGbRaw({ gbBuildingAcquisitionDate: "" });
    migrateGeneralBuildingFields(a);
    expect(a.landAcquisitionDate).toBe(LAND_ACQ);
    expect(a.acquisitionDate).toBe(LAND_ACQ);
    expect(a.hasSeperateLandAcquisitionDate).toBe(false);
  });

  it("🔴 두 번 실행해도 결과가 같다 — 재스왑 금지", () => {
    const once = legacyGbRaw();
    migrateGeneralBuildingFields(once);
    const twice = legacyGbRaw();
    migrateGeneralBuildingFields(twice);
    migrateGeneralBuildingFields(twice);

    expect(twice.landAcquisitionDate).toBe(once.landAcquisitionDate);
    expect(twice.acquisitionDate).toBe(once.acquisitionDate);
    expect(twice.acquisitionDate).toBe(BUILDING_ACQ); // 되돌아가지 않았다
  });

  it("이미 전환된 자산은 건드리지 않는다", () => {
    const a = {
      assetId: "asset-new",
      assetKind: "general_building",
      acquisitionDate: BUILDING_ACQ,
      landAcquisitionDate: LAND_ACQ,
      hasSeperateLandAcquisitionDate: true,
    } as Record<string, unknown>;
    migrateGeneralBuildingFields(a);
    expect(a.acquisitionDate).toBe(BUILDING_ACQ);
    expect(a.landAcquisitionDate).toBe(LAND_ACQ);
  });
});
