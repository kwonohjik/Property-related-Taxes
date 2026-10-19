/**
 * 구주택 멸실·신축 통산(해석 (5)) ①②③ — 초기값 · 구 세션 복원(fillMissingFromFactory) · 구 입력 값 불변.
 */
import { describe, it, expect } from "vitest";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import { rebuildAsset } from "../calc/_helpers/land-rebuild-form";

const KEYS = ["landRebuildEnabled", "landRebuildStartMode", "landRebuildPriorHouseStartDate", "landRebuildDemolitionDate", "landRebuildFootprintUnchanged"] as const;

describe("② initial — 미선택 = 통산 없음 · 정착면적 미확인(모름 = 혜택 불성립)", () => {
  it("신규 자산의 5필드 기본값", () => {
    const a = makeDefaultAsset(1);
    expect(a.landRebuildEnabled).toBe(false);
    expect(a.landRebuildStartMode).toBe("");
    expect(a.landRebuildPriorHouseStartDate).toBe("");
    expect(a.landRebuildDemolitionDate).toBe("");
    expect(a.landRebuildFootprintUnchanged).toBe(false);
  });
});

describe("③ normalize — 구 세션·이력 복원", () => {
  it("5필드가 없는 구 자산은 기본값으로 보강된다(undefined 잔존 금지)", () => {
    const old = { assetKind: "housing", acquisitionCause: "newConstruction", landAcquisitionCause: "inheritance", landAcquisitionDate: "2022-01-01" };
    const a = migrateAsset(old) as unknown as Record<string, unknown>;
    for (const k of KEYS) expect(a[k], k).not.toBeUndefined();
    expect(a.landRebuildEnabled).toBe(false);
    expect(a.landRebuildStartMode).toBe("");
  });

  it("구 입력 값 불변 — 이미 값이 있으면 덮어쓰지 않는다", () => {
    const a = migrateAsset({
      assetKind: "housing",
      landRebuildEnabled: true,
      landRebuildStartMode: "later",
      landRebuildPriorHouseStartDate: "2018-03-01",
      landRebuildDemolitionDate: "2023-05-31",
      landRebuildFootprintUnchanged: true,
    }) as unknown as Record<string, unknown>;
    expect(a).toMatchObject({
      landRebuildEnabled: true,
      landRebuildStartMode: "later",
      landRebuildPriorHouseStartDate: "2018-03-01",
      landRebuildDemolitionDate: "2023-05-31",
      landRebuildFootprintUnchanged: true,
    });
  });

  it("신규 5필드만 보강하고 다른 필드는 건드리지 않는다 — 신축 + 토지 상속 구 자산의 기존 값이 그대로다", () => {
    const full = rebuildAsset() as unknown as Record<string, unknown>;
    const old = { ...full };
    for (const k of KEYS) delete old[k];
    const a = migrateAsset(old) as unknown as Record<string, unknown>;
    const changed = Object.keys(old).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(old[k]));
    expect(changed).toEqual([]);
    expect(a.landRebuildEnabled).toBe(false);
  });
});
