/**
 * NBL-STATE-HISTORY-E3-③ A (UI-A-1) — 술어(단일 소스) · ④ 전송 · ③ 복원 anchor.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-3-house-appurtenant.ui.plan.md §5 · §6 ④·③ · §9 X1~X10 · §11.1 · §11.3 mutation ①⑥⑧⑨⑪⑬
 *
 * 핵심 불변:
 *   (a) ④⑤⑧은 같은 지목 축 술어 `nblStateHistoryApplies`(= 기타토지 ∨ 주택)를 읽는다. 기타토지 술어는 소비표가 주택으로 넓어져도 주택을 뺀다.
 *   (b) 주택 술어는 기타토지 전용 칸(연접 다필지 · 「건축물 있음」 토글)과 의제 사유를 읽지 않는다(§1.3 D5 · 의제 교차).
 *   (c) 철거 행에만 `houseFootprintBefore`를 싣고 그 행의 `propertyTaxTypeBefore`는 싣지 않는다 — 숨은 stale 미전송.
 */
import { describe, it, expect } from "vitest";
import {
  housePriorFootprintIssueOf,
  nblHousingStateHistoryApplies,
  nblOtherStateHistoryApplies,
  nblStateHistoryApplies,
  stateEventWireRow,
  stateHistoryWireFields,
} from "@/lib/calc/nbl-other-state-history-scope";
import { buildNonBusinessLandRaw } from "@/lib/calc/non-business-land-request";
import { migrateNblB1Fields } from "@/lib/stores/calc-wizard-asset-migrate-nbl";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { NblOtherStateEventInput } from "@/lib/stores/calc-wizard-asset-nbl-other";

type Ev = NblOtherStateEventInput;
const built = (date: string, extra: Partial<Ev> = {}): Ev => ({ kind: "building_built", date, propertyTaxTypeBefore: "", ...extra });
const removed = (date: string, footprint?: string, extra: Partial<Ev> = {}): Ev => ({
  kind: "building_removed",
  date,
  propertyTaxTypeBefore: "",
  ...(footprint === undefined ? {} : { houseFootprintBefore: footprint }),
  ...extra,
});

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionArea: "500",
    acquisitionDate: "2014-01-01",
    nblUseDetailedJudgment: true,
    nblLandType: "housing_site",
    nblZoneType: "general_residential",
    nblIsMetropolitanArea: "no",
    nblHousingFootprint: "100",
    ...over,
  }) as AssetForm;

const wire = (a: AssetForm) => buildNonBusinessLandRaw(a, "2024-01-01") as Record<string, unknown>;

describe("(a)(b) 술어 진리표 — 지목 6종 × 정밀판정 × stale 칸", () => {
  const TYPES = ["farmland", "forest", "pasture", "housing_site", "villa_land", "other_land"] as const;

  it.each(TYPES)("%s · 정밀판정 ON — 질문이 적용되는 지목은 기타토지·주택부수토지뿐이다", (t) => {
    const a = asset({ nblLandType: t });
    expect(nblStateHistoryApplies(a), t).toBe(t === "other_land" || t === "housing_site");
    expect(nblHousingStateHistoryApplies(a), t).toBe(t === "housing_site");
    expect(nblOtherStateHistoryApplies(a), `${t} 기타토지 술어는 주택을 뺀다(소비표 확장과 무관)`).toBe(t === "other_land");
  });

  it("정밀판정 OFF면 둘 다 거짓", () => {
    const a = asset({ nblUseDetailedJudgment: false });
    expect([nblHousingStateHistoryApplies(a), nblStateHistoryApplies(a)]).toEqual([false, false]);
  });

  it("X6 — stale 연접 다필지(기타토지 칸)를 주택 술어는 읽지 않는다(§1.3 D5): 질문은 그대로 적용", () => {
    const a = asset({ nblOtherUseParcels: true });
    expect(nblHousingStateHistoryApplies(a)).toBe(true);
    expect(nblStateHistoryApplies(a)).toBe(true);
    // 기타토지는 연접 다필지와 배타 — 같은 칸이 기타토지에서는 질문을 지운다(종전 동작 그대로)
    expect(nblStateHistoryApplies(asset({ nblLandType: "other_land", nblOtherUseParcels: true }))).toBe(false);
  });

  it("X10 — stale 양도일 의제 사유(주택은 의제 비적용)가 술어를 바꾸지 않는다", () => {
    const a = asset({ nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2023-01-01" } as Partial<AssetForm>);
    expect(nblStateHistoryApplies(a)).toBe(true);
  });
});

describe("④ 전송 — 주택 카드", () => {
  const rows = [removed("2016-01-01", "100"), built("2023-01-01")];

  it("X1 술어 거짓(정밀판정 OFF · 지목 농지) → 모드 \"\" · 사건 []", () => {
    for (const over of [{ nblUseDetailedJudgment: false }, { nblLandType: "farmland" as const, nblZoneType: "agricultural" as const }]) {
      const w = stateHistoryWireFields(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: rows, ...over }));
      expect([w.nblOtherStateHistoryMode, w.nblOtherStateEvents]).toEqual(["", []]);
    }
  });

  it.each(["", "unchanged", "unknown"] as const)("X2·X3 모드 %s → 모드 유지 · 사건 [] (stale 행을 보내지 않는다)", (mode) => {
    const w = stateHistoryWireFields(asset({ nblOtherStateHistoryMode: mode, nblOtherStateEvents: rows }));
    expect([w.nblOtherStateHistoryMode, w.nblOtherStateEvents]).toEqual([mode, []]);
  });

  it("X4 changed → 사건 행 + 철거 행의 정착면적. 신축 행에는 정착면적 키가 없다", () => {
    const w = stateHistoryWireFields(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: rows }));
    expect(w.nblOtherStateHistoryMode).toBe("changed");
    expect(w.nblOtherStateEvents).toEqual([
      { kind: "building_removed", date: "2016-01-01", propertyTaxTypeBefore: "", houseFootprintBefore: "100" },
      { kind: "building_built", date: "2023-01-01", propertyTaxTypeBefore: "" },
    ]);
  });

  it("mutation ⑬ 가드 — 신축 행·구분 변경 행에 stale `houseFootprintBefore`가 있어도 보내지 않는다", () => {
    const stale = [built("2016-01-01", { houseFootprintBefore: "999" }), removed("2018-01-01", "100"), built("2020-01-01", { houseFootprintBefore: "888" })];
    const w = stateHistoryWireFields(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: stale }));
    expect(w.nblOtherStateEvents.map((e) => e.houseFootprintBefore)).toEqual([undefined, "100", undefined]);
  });

  it("mutation ⑨ 가드 — 주택 구간을 닫는 철거 행의 stale `propertyTaxTypeBefore`(별도합산)를 보내지 않는다(X9 · Y-16) · 정착면적은 trim", () => {
    const w = stateHistoryWireFields(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2016-01-01", " 100 ", { propertyTaxTypeBefore: "separate" }), built("2023-01-01")] }));
    expect(w.nblOtherStateEvents[0]).toEqual({ kind: "building_removed", date: "2016-01-01", propertyTaxTypeBefore: "", houseFootprintBefore: "100" });
  });

  it("정착면적 빈칸·공백은 키를 싣지 않는다(⑧이 막는다 — 가정값 없음)", () => {
    for (const fp of [undefined, "", "  "]) {
      const w = stateHistoryWireFields(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2016-01-01", fp), built("2023-01-01")] }));
      expect("houseFootprintBefore" in w.nblOtherStateEvents[0], String(fp)).toBe(false);
    }
  });

  it("신축 행은 나대지 선언(E3-1b)을 그대로 싣는다 — 주택 카드에서도(UQ-6 (가))", () => {
    const b = built("2023-01-01", { propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within" });
    const w = stateHistoryWireFields(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [b] }));
    expect(w.nblOtherStateEvents[0]).toMatchObject({ propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within" });
  });

  it("mutation ⑥ 가드 — 주택 카드 `nblOtherHasBuilding`은 저장 토글(stale false)과 무관하게 true로 덮어 싣는다(A-12) · changed가 아니어도", () => {
    for (const mode of ["", "unchanged", "changed"] as const) {
      expect(wire(asset({ nblOtherHasBuilding: false, nblOtherStateHistoryMode: mode, nblOtherStateEvents: rows })).nblOtherHasBuilding, mode).toBe(true);
    }
  });

  it("기타토지 byte-identical — 기타토지 카드의 와이어는 변하지 않는다(철거 행에 정착면적 stale이 있어도 싣지 않는다 · 토글 파생 그대로)", () => {
    const other = (over: Partial<AssetForm>) => asset({ nblLandType: "other_land", nblOtherPropertyTaxType: "separate", ...over });
    const w = wire(other({ nblOtherHasBuilding: true, nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2021-01-01", "100", { propertyTaxTypeBefore: "separate" })] }));
    expect(w.nblOtherHasBuilding).toBe(false);
    expect(w.nblOtherStateEvents).toEqual([{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate" }]);
  });

  it("B6 지목 왕복 — 지목을 바꿔도 저장값은 그대로이고 숨은 쪽 값은 보내지 않는다", () => {
    const stored = { nblOtherStateHistoryMode: "changed" as const, nblOtherStateEvents: rows };
    const asHouse = wire(asset(stored));
    const asFarm = wire(asset({ ...stored, nblLandType: "farmland", nblZoneType: "agricultural" }));
    expect(asHouse.nblOtherStateEvents).toHaveLength(2);
    expect([asFarm.nblOtherStateHistoryMode, asFarm.nblOtherStateEvents]).toEqual(["", []]);
    const back = asset(stored);
    expect(back.nblOtherStateEvents).toEqual(rows); // 저장값 불변
  });

  it("stateEventWireRow — 지목 구분 인자 없이(기타토지 호출) 철거 행의 구분을 종전대로 싣는다", () => {
    const e = removed("2021-01-01", "100", { propertyTaxTypeBefore: "separate" });
    expect(stateEventWireRow([e], 0, true)).toEqual({ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate" });
  });
});

describe("정착면적 결함 단일 함수(⑧·⑤) — housePriorFootprintIssueOf", () => {
  const a = (fp: string | undefined, over: Partial<AssetForm> = {}) => asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2016-01-01", fp), built("2023-01-01")], ...over });

  it.each([
    ["빈칸", "", "blank"],
    ["미입력", undefined, "blank"],
    ["0", "0", "not_positive"],
    ["-5", "-5", "not_positive"],
    ["abc", "abc", "not_number"],
    ["정착 600 > 토지 500", "600", "exceeds_land"],
  ] as const)("%s → %s", (_n, fp, kind) => {
    expect(housePriorFootprintIssueOf(a(fp), 0)?.kind).toBe(kind);
  });

  it("정착 500 = 토지 500 은 통과(경계 — 초과가 아니다) · 100 통과", () => {
    expect(housePriorFootprintIssueOf(a("500"), 0)).toBeNull();
    expect(housePriorFootprintIssueOf(a("100"), 0)).toBeNull();
  });

  it("신축 행·기타토지 카드·술어 거짓은 null (숨은 행을 막지 않는다)", () => {
    expect(housePriorFootprintIssueOf(a(""), 1)).toBeNull();
    expect(housePriorFootprintIssueOf(a("", { nblLandType: "other_land" }), 0)).toBeNull();
    expect(housePriorFootprintIssueOf(a("", { nblUseDetailedJudgment: false }), 0)).toBeNull();
  });
});

describe("③ 복원 정규화 — houseFootprintBefore", () => {
  const migrate = (events: unknown) => {
    const raw: Record<string, unknown> = { ...makeDefaultAsset(1), nblOtherStateHistoryMode: "changed", nblOtherStateEvents: events };
    migrateNblB1Fields(raw);
    return raw.nblOtherStateEvents as Ev[];
  };

  it("문자열이면 철거 행에서만 보존 · 키가 없던 행에는 만들지 않는다(구 스냅샷 byte-identical)", () => {
    const out = migrate([
      { kind: "building_removed", date: "2016-01-01", propertyTaxTypeBefore: "separate", houseFootprintBefore: "100" },
      { kind: "building_removed", date: "2017-01-01", propertyTaxTypeBefore: "" },
      { kind: "building_built", date: "2018-01-01", propertyTaxTypeBefore: "", houseFootprintBefore: "55" },
      { kind: "building_removed", date: "2019-01-01", propertyTaxTypeBefore: "", houseFootprintBefore: 100 },
    ]);
    expect(out[0].houseFootprintBefore).toBe("100");
    expect("houseFootprintBefore" in out[1]).toBe(false);
    expect("houseFootprintBefore" in out[2], "신축 행 stale").toBe(false);
    expect("houseFootprintBefore" in out[3], "문자열이 아닌 값").toBe(false);
  });
});
