/**
 * A-7 — 축 B(`buildingFloorArea`) ③ normalize + **축 A 불가침** 회귀
 *
 * 계획: docs/01-plan/features/basic-info-building-area-phase-f.plan.md §3.4 · §12(U-12)
 *
 * ## 종전 β-2 마이그레이션은 철회됐다 (2026-07-30 U-12)
 *
 * PR #912(Phase A)는 `building`("건물(토지 제외)")의 `acquisitionArea`를 "건물 연면적"으로
 * 오라벨링했고, β-2가 그 전제로 값을 `buildingFloorArea`로 옮기고 축 A를 비웠다.
 * **전제가 틀렸다** — 그 필드는 처음부터 **토지 면적**이다:
 *
 *   · `StandardPriceInput.tsx:69~70` — `toPropertyType(building_non_residential)` → **"land"**
 *     → 조회 대상이 **개별공시지가**이고 곱셈 인자는 토지 면적이다.
 *   · `LandBuildingSplitSection.tsx:163` — 같은 필드를 "**토지 면적**"으로 입력받는다.
 *
 * 「소득세법」 제99조 제1항 제1호는 **나목**(건물)에 "딸린 토지" 문구를 두지 않고 **다목**
 * (오피스텔·상업용건물)에만 "이에 딸린 토지를 포함한다"를 둔다(같은 조 제3항 제4호에서 확인)
 * → **나목 건물의 부수토지는 가목으로 별도 평가**되므로 `building`에도 축 A가 실재한다.
 *
 * 실측된 손상(철회 전): `acquisitionArea "200"` → `""`, 토지분 취득 기준시가
 * 100,000,000 → **null**. `assetKind` 미상 → `building` fallback 자산까지 휩쓸렸다.
 *
 * 이 파일은 신규 필드의 손실 없는 채움(memory
 * `feedback_new_asset_field_stale_sessionstorage_guard`) **과** 축 A 불가침을 함께 고정한다.
 */
import { describe, it, expect } from "vitest";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";

describe("A-7 — 축 A(`acquisitionArea`)는 전 자산유형에서 불가침이다", () => {
  it("🔴 building 자산의 acquisitionArea를 축 B로 옮기거나 비우지 않는다", () => {
    const a = migrateAsset({
      assetKind: "building",
      acquisitionArea: "84.5",
      transferArea: "84.5",
    });
    // 토지 면적이다 — 「소득세법」 제99조 제1항 제1호 가목의 곱셈 인자
    expect(a.acquisitionArea).toBe("84.5");
    expect(a.transferArea).toBe("84.5");
    // 축 B는 별도 필드이고, 마이그레이션이 추측으로 채우지 않는다
    expect(a.buildingFloorArea).toBe("");
  });

  it("🔴 assetKind 불명 → building fallback 자산도 축 A를 보존한다", () => {
    // 정규화(`migrateAsset`)가 알 수 없는 assetKind를 "building"으로 만들므로,
    // building을 대상으로 삼은 이전 블록은 이 자산까지 휩쓸었다.
    const a = migrateAsset({ assetKind: "unknown_kind", acquisitionArea: "50" });
    expect(a.assetKind).toBe("building");
    expect(a.acquisitionArea).toBe("50");
    expect(a.buildingFloorArea).toBe("");
  });

  it("전 자산유형에서 acquisitionArea를 보존한다", () => {
    for (const kind of [
      "building",
      "housing",
      "land",
      "general_building",
      "commercial_building",
    ] as const) {
      const a = migrateAsset({ assetKind: kind, acquisitionArea: "206.6" });
      expect(a.acquisitionArea).toBe("206.6");
      expect(a.buildingFloorArea).toBe("");
    }
  });

  it("멱등 — 두 번 돌려도 결과가 같다", () => {
    const once = migrateAsset({ assetKind: "building", acquisitionArea: "84.5" });
    const twice = migrateAsset({ ...once });
    expect(twice.acquisitionArea).toBe("84.5");
    expect(twice.buildingFloorArea).toBe("");
  });

  it("기존 buildingFloorArea 값은 보존된다 (덮어쓰기 금지)", () => {
    const a = migrateAsset({
      assetKind: "building",
      acquisitionArea: "100",
      buildingFloorArea: "84.5",
    });
    expect(a.buildingFloorArea).toBe("84.5");
    expect(a.acquisitionArea).toBe("100");
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
    // 시나리오만 정규화한다 — 면적 값은 건드리지 않는다(U-12: 축 A 불가침).
    // `same`에서는 취득면적 칸 하나만 렌더되므로 stale `transferArea`는 무해하다.
    expect(a.acquisitionArea).toBe("200");
    expect(a.buildingFloorArea).toBe("");
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

describe("B4-2b — 안분 계산기 필드 ③ normalize", () => {
  it("구 세션 자산에 5필드가 빈 문자열로 채워진다", () => {
    const a = migrateAsset({ assetKind: "land" });
    expect(a.partialAcqDistinct).toBe("");
    expect(a.partialApportionBasis).toBe("");
    expect(a.partialTotalAcqPrice).toBe("");
    expect(a.partialSoldValue).toBe("");
    expect(a.partialRemainValue).toBe("");
  });

  it("기존 값은 보존된다 (덮어쓰기 금지)", () => {
    const a = migrateAsset({
      assetKind: "land",
      partialAcqDistinct: "no",
      partialApportionBasis: "appraisal",
      partialTotalAcqPrice: "300000000",
    });
    expect(a.partialAcqDistinct).toBe("no");
    expect(a.partialApportionBasis).toBe("appraisal");
    expect(a.partialTotalAcqPrice).toBe("300000000");
  });
});
