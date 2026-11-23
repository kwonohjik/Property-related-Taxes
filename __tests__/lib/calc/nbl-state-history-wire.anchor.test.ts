/**
 * NBL-STATE-HISTORY-U1 — ④ 전송 anchor: 술어가 거짓이면 이력 칸을 비워 보내고(⑫ 400 방지), 참이고 `unchanged`·`unknown`이면 모드는 유지·사건만 비우며,
 * `changed`이면 사건 행을 싣고 파생 `nblOtherHasBuilding`으로 저장된 stale 토글값을 덮어쓴다(스프레드 뒤 순서).
 * 계획서: docs/01-plan/features/nbl-other-land-state-history.ui.plan.md §2.2 · §6 ④ · §11.1
 */
import { describe, it, expect } from "vitest";
import { buildNonBusinessLandRaw } from "@/lib/calc/non-business-land-request";
import { stateHistoryWireFields } from "@/lib/calc/nbl-other-state-history-scope";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const asset = (over: Partial<AssetForm>): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionArea: "1000",
    acquisitionDate: "2014-01-01",
    nblUseDetailedJudgment: true,
    nblLandType: "other_land",
    nblZoneType: "general_residential",
    nblOtherPropertyTaxType: "separate",
    ...over,
  }) as AssetForm;

const built = (date: string) => ({ kind: "building_built" as const, date, propertyTaxTypeBefore: "" as const });
const removed = (date: string, before: "" | "separate" | "comprehensive" = "") => ({ kind: "building_removed" as const, date, propertyTaxTypeBefore: before });

describe("④ 전송 4분기 — stateHistoryWireFields · buildNonBusinessLandRaw", () => {
  const events = [removed("2021-01-01", "separate")];
  const wire = (a: AssetForm) => buildNonBusinessLandRaw(a, "2024-01-01") as Record<string, unknown>;

  it("술어 거짓(연접 다필지) + stale changed 행 → 모드 \"\" · 사건 [] 로 비워 보낸다 (⑫ 400 방지)", () => {
    const w = wire(asset({ nblOtherUseParcels: true, nblOtherStateHistoryMode: "changed", nblOtherStateEvents: events }));
    expect(w.nblOtherStateHistoryMode).toBe("");
    expect(w.nblOtherStateEvents).toEqual([]);
  });
  it("술어 거짓(지목 농지) → 비워 보낸다", () => {
    const w = wire(asset({ nblLandType: "farmland", nblZoneType: "agricultural", nblOtherStateHistoryMode: "changed", nblOtherStateEvents: events }));
    expect([w.nblOtherStateHistoryMode, w.nblOtherStateEvents]).toEqual(["", []]);
  });
  it.each(["unchanged", "unknown"] as const)("술어 참 + %s → 모드는 유지 · 사건만 비운다 (엔진이 고지를 모드로 가른다)", (mode) => {
    const w = wire(asset({ nblOtherStateHistoryMode: mode, nblOtherStateEvents: events }));
    expect(w.nblOtherStateHistoryMode).toBe(mode);
    expect(w.nblOtherStateEvents).toEqual([]);
  });
  it("술어 참 + 미선택(\"\") → 모드 \"\" 그대로 · 사건 []", () => {
    const w = wire(asset({ nblOtherStateHistoryMode: "", nblOtherStateEvents: events }));
    expect([w.nblOtherStateHistoryMode, w.nblOtherStateEvents]).toEqual(["", []]);
  });
  it("술어 참 + changed → 사건 행 그대로 (철거 행의 철거 직전 재산세 구분 포함)", () => {
    const w = wire(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [built("2016-01-01"), removed("2021-01-01", "separate")] }));
    expect(w.nblOtherStateHistoryMode).toBe("changed");
    expect(w.nblOtherStateEvents).toEqual([
      { kind: "building_built", date: "2016-01-01", propertyTaxTypeBefore: "" },
      { kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate" },
    ]);
  });
  it("신축 행의 직전 구분은 와이어에 실린다(E3-1b 의도된 반전 — 신축 앞 나대지 선언)", () => {
    const b = { kind: "building_built" as const, date: "2016-01-01", propertyTaxTypeBefore: "separate" as const };
    expect(stateHistoryWireFields(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [b] })).nblOtherStateEvents[0].propertyTaxTypeBefore).toBe("separate");
  });
  it("파생 nblOtherHasBuilding 덮어쓰기 — 저장된 stale 토글값을 이긴다 (스프레드 뒤 순서)", () => {
    expect(wire(asset({ nblOtherHasBuilding: true, nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2021-01-01")] })).nblOtherHasBuilding).toBe(false);
    expect(wire(asset({ nblOtherHasBuilding: false, nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [built("2021-01-01")] })).nblOtherHasBuilding).toBe(true);
  });
  it("changed가 아니면 저장 토글값을 그대로 싣는다", () => {
    expect(wire(asset({ nblOtherHasBuilding: true, nblOtherStateHistoryMode: "unchanged" })).nblOtherHasBuilding).toBe(true);
  });
});
