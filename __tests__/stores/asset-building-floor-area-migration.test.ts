/**
 * A-7 — Phase F1 β-2 마이그레이션 회귀
 *
 * 계획: docs/01-plan/features/basic-info-building-area-phase-f.plan.md §3.4
 *
 * PR #912(Phase A)는 축 B 전용 필드가 없어 `building`(건물, 토지 제외) 자산의 연면적을
 * `acquisitionArea`(축 A 슬롯)에 실었다. β-2가 이를 `buildingFloorArea`로 이전한다.
 *
 * 이 파일은 **기존 sessionStorage 데이터가 손실 없이 이전되는지**를 고정한다
 * (memory `feedback_new_asset_field_stale_sessionstorage_guard`).
 */
import { describe, it, expect } from "vitest";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";

describe("A-7 — building 자산 축 B 이전 (acquisitionArea → buildingFloorArea)", () => {
  it("legacy building 자산의 연면적이 buildingFloorArea로 이전된다", () => {
    const a = migrateAsset({
      assetKind: "building",
      acquisitionArea: "84.5",
      transferArea: "84.5",
    });
    expect(a.buildingFloorArea).toBe("84.5"); // 값 보존
    expect(a.acquisitionArea).toBe(""); // 축 A(토지) 전용으로 비워진다
    expect(a.transferArea).toBe("");
  });

  it("이미 buildingFloorArea가 있으면 덮어쓰지 않는다 (재실행 안전)", () => {
    const a = migrateAsset({
      assetKind: "building",
      acquisitionArea: "100",
      buildingFloorArea: "84.5",
    });
    expect(a.buildingFloorArea).toBe("84.5");
    // 이미 이전된 자산에 acquisitionArea가 남아 있으면 그것은 축 A 값이므로 건드리지 않는다
    expect(a.acquisitionArea).toBe("100");
  });

  it("멱등 — 두 번 돌려도 결과가 같다", () => {
    const once = migrateAsset({ assetKind: "building", acquisitionArea: "84.5" });
    const twice = migrateAsset({ ...once });
    expect(twice.buildingFloorArea).toBe("84.5");
    expect(twice.acquisitionArea).toBe("");
  });

  it("building이 아닌 자산은 acquisitionArea를 보존한다", () => {
    for (const kind of ["housing", "land", "general_building", "commercial_building"] as const) {
      const a = migrateAsset({ assetKind: kind, acquisitionArea: "206.6" });
      expect(a.acquisitionArea).toBe("206.6");
      expect(a.buildingFloorArea).toBe("");
    }
  });

  it("assetKind 불명 → building fallback 자산도 이전된다 (정규화 뒤에 배치했으므로)", () => {
    // migrateAsset:429~430이 알 수 없는 assetKind를 "building"으로 정규화한다.
    // 이전 블록이 그보다 앞에 있으면 이 케이스를 놓친다.
    const a = migrateAsset({ assetKind: "unknown_kind", acquisitionArea: "50" });
    expect(a.assetKind).toBe("building");
    expect(a.buildingFloorArea).toBe("50");
    expect(a.acquisitionArea).toBe("");
  });

  it("신규 필드는 기존 자산에서 빈 문자열로 채워진다 (③ normalize)", () => {
    const a = migrateAsset({ assetKind: "housing" });
    expect(a.buildingFloorArea).toBe("");
  });
});

describe("A-7b — building의 stale areaScenario 정규화", () => {
  it("building + partial → same (시나리오가 ['same']으로 축소됨)", () => {
    const a = migrateAsset({
      assetKind: "building",
      areaScenario: "partial",
      acquisitionArea: "200",
      transferArea: "100",
    });
    expect(a.areaScenario).toBe("same");
    // 이전도 함께 일어난다 — 취득면적이 축 B로, 양도면적은 비워진다
    expect(a.buildingFloorArea).toBe("200");
    expect(a.transferArea).toBe("");
  });

  it("building + 환지 시나리오도 same으로 정규화된다", () => {
    for (const sc of ["reduction", "increase"] as const) {
      const a = migrateAsset({ assetKind: "building", areaScenario: sc });
      expect(a.areaScenario).toBe("same");
    }
  });

  it("land·housing의 partial은 보존된다", () => {
    for (const kind of ["land", "housing"] as const) {
      const a = migrateAsset({ assetKind: kind, areaScenario: "partial" });
      expect(a.areaScenario).toBe("partial");
    }
  });
});
