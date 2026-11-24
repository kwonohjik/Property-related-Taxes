/**
 * NBL-STATE-HISTORY-E3-⑤ E3f-2 — 나대지 구간 근거 «철거ㆍ멸실» **사실 칸 4개**(허가·사용승인 / 건축 외 용도 / 빈집정비 / 종전 바닥면적)의 ⑧↔⑫ 거울 anchor (계획서 §5.4 · §6.1 · §6.2 D-2 · K-10 · K-10d · K-10f · K-10g · K-26 · K-27).
 *
 *   A  ⑧↔⑫′ parity 격자 — **실제 ⑧**(`validateNblStateHistory`)과 **실제 ⑫′**(`refineNonBusinessLandRaw`, ④가 만든 raw)을 같은 입력에 돌린다. 독립 진리표(시행본별 요구 칸 표)와도 대조한다.
 *       (a) ⑫′가 400이면 ⑧도 차단 (b) ⑧이 막으면 ⑫′도 같은 칸·같은 문구 (c) ⑧이 가리키는 칸은 ⑤가 그리는 칸(= `demolishedRequiredFacts` ∧ 읽음) (d) 읽지 않는 입력(의제·부분 면적·주택 배율 초과)은 4칸 모두 요구하지 않는다
 *   B  ④ 와이어 — 근거 `demolished`는 철거 행 뒤 나대지 구간에서만 선택지 · 요구 칸만 싣는다(stale 비전송) · 읽지 않는 입력에도 구조 술어 그대로
 *   C  ③ 복원 — 허용값 안 · 나대지를 닫을 수 있는 행만 보존, 키가 없던 행은 키를 만들지 않는다(byte-identical)
 *   D  `nblStateHistoryIsRead` — 의제 · 부분 면적 · 주택 카드 배율 초과 분기 · 엔진 입력을 못 만들면 «읽는다»
 */
import { describe, it, expect } from "vitest";
import type { z } from "zod";
import { refineNonBusinessLandRaw, type NblRawRefineInput } from "@/lib/api/transfer-tax-schema-nbl-refines";
import { nblStateHistoryIsRead } from "@/lib/calc/nbl-other-state-history-read";
import { stateHistoryWireFields, stateEventWireRow } from "@/lib/calc/nbl-other-state-history-scope";
import { buildNonBusinessLandRaw } from "@/lib/calc/non-business-land-request";
import { validateNblStateHistory } from "@/lib/calc/transfer-tax-validate-nbl-state-history";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { demolishedRequiredFacts } from "@/lib/tax-engine/non-business-land/demolished-temp-status";
import { demolishedRowFactIssue } from "@/lib/tax-engine/non-business-land/demolished-row-facts";
import { demolishedRemovedKindOf, eventOffersDemolished, removalDateFor } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { parseISO } from "@/lib/tax-engine/utc-date";

type Loose = Record<string, unknown>;
const FACT_FIELDS = ["demolishedPermitBefore", "demolishedOtherUseBefore", "demolishedVacantHouseBefore", "demolishedFloorAreaBefore"] as const;
type Field = (typeof FACT_FIELDS)[number];
const BASE = makeDefaultAsset(1);

// ── 격자 정의 ────────────────────────────────────────────────────────────────

/** 구간 시대 — 철거일 · 닫는 행 날짜 · 양도일. 독립 진리표 = 시행본별 요구 칸(계획서 §5.4 표를 그대로 옮긴 것 — leaf를 부르지 않는다). */
const ERAS = {
  none2018: { removedOn: "2018-03-01", closeOn: "2019-12-01", transfer: "2024-01-01", need: { building: [], house: [] } },
  permitOnly: { removedOn: "2022-12-15", closeOn: "2023-12-01", transfer: "2024-01-01", need: { building: ["permit"], house: ["permit"] } },
  full2024: { removedOn: "2024-01-15", closeOn: "2024-09-01", transfer: "2024-12-01", need: { building: ["permit", "otherUse", "floorArea"], house: ["permit", "otherUse", "vacantHouse"] } },
  never: { removedOn: "2022-07-01", closeOn: "2023-12-01", transfer: "2024-01-01", need: { building: [], house: [] } },
} as const;
type EraKey = keyof typeof ERAS;
type Card = "otherBuilding" | "otherHouse" | "housing";
type Closer = "built" | "taxChanged";
type Basis = "demolished" | "vacant_state" | "";
type Read = "read" | "notRead";

interface Cell {
  card: Card;
  closer: Closer;
  basis: Basis;
  era: EraKey;
  read: Read;
  permit: "" | "unknown";
  otherUse: "" | "yes";
  vacant: "" | "no";
  floor: "" | "250";
}

const FIELD_OF = { permit: "demolishedPermitBefore", otherUse: "demolishedOtherUseBefore", vacantHouse: "demolishedVacantHouseBefore", floorArea: "demolishedFloorAreaBefore" } as const;

function cellAsset(c: Cell): AssetForm {
  const e = ERAS[c.era];
  const closing = {
    kind: c.closer === "built" ? "building_built" : "tax_type_changed",
    date: e.closeOn,
    propertyTaxTypeBefore: "separate",
    propertyTaxBasisBefore: c.basis,
    ...(c.permit ? { demolishedPermitBefore: c.permit } : {}),
    ...(c.otherUse ? { demolishedOtherUseBefore: c.otherUse } : {}),
    ...(c.vacant ? { demolishedVacantHouseBefore: c.vacant } : {}),
    ...(c.floor ? { demolishedFloorAreaBefore: c.floor } : {}),
  };
  const common = {
    ...BASE,
    assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2014-01-01", acquisitionArea: "1000",
    isNonBusinessLand: true, nblUseDetailedJudgment: true, nblZoneType: "general_residential", nblIsMetropolitanArea: "no",
    nblOtherStateHistoryMode: "changed",
  };
  if (c.card === "housing") {
    return {
      ...common,
      nblLandType: "housing_site",
      // 정착면적 250 × 5배(수도권 밖) = 1,250 ≥ 1,000 → 배율 이내(읽는다) · 100 × 5 = 500 < 1,000 → 초과(이력을 읽지 않는다 — Q-3a (나))
      nblHousingFootprint: c.read === "read" ? "250" : "100",
      nblOtherStateEvents: [{ kind: "building_removed", date: e.removedOn, propertyTaxTypeBefore: "", houseFootprintBefore: "250" }, { ...closing, kind: "building_built" }],
    } as unknown as AssetForm;
  }
  return {
    ...common,
    nblLandType: "other_land",
    nblOtherPropertyTaxType: "separate",
    nblOtherHasBuilding: true,
    // 꼬리 건물(마지막 사건 = 신축일 때) 바닥면적 250 × 4 = 1,000 이내(읽는다) · 100 × 4 = 400 < 1,000 → core 부분 면적(이력을 읽지 않는다)
    nblOtherBuildingFloorArea: c.read === "read" ? "250" : "100",
    ...(c.read === "notRead" && c.closer === "taxChanged" ? { nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2023-10-01" } : {}),
    nblOtherStateEvents: [
      { kind: "building_built", date: "2012-06-01", propertyTaxTypeBefore: "" },
      { kind: "building_removed", date: e.removedOn, propertyTaxTypeBefore: "separate", ...(c.card === "otherHouse" ? { buildingKindBefore: "house", houseFootprintBefore: "400" } : {}) },
      closing,
    ],
  } as unknown as AssetForm;
}

const CARDS: Card[] = ["otherBuilding", "otherHouse", "housing"];
const GRID: Cell[] = [];
for (const card of CARDS) for (const closer of ["built", "taxChanged"] as const) for (const basis of ["demolished", "vacant_state", ""] as const)
  for (const era of Object.keys(ERAS) as EraKey[]) for (const read of ["read", "notRead"] as const)
    for (const permit of ["", "unknown"] as const) for (const otherUse of ["", "yes"] as const) for (const vacant of ["", "no"] as const) for (const floor of ["", "250"] as const) {
      if (card === "housing" && closer === "taxChanged") continue; // 주택 카드는 구분 변경 행을 받지 않는다(D-2)
      GRID.push({ card, closer, basis, era, read, permit, otherUse, vacant, floor });
    }

function refine(raw: Record<string, unknown>): { path: (string | number)[]; message: string }[] {
  const out: { path: (string | number)[]; message: string }[] = [];
  refineNonBusinessLandRaw(raw as unknown as NblRawRefineInput, { addIssue: (i: { path: (string | number)[]; message: string }) => out.push({ path: i.path, message: i.message }) } as unknown as z.RefinementCtx);
  return out;
}
const isFactPath = (p: (string | number)[]) => p[0] === "nblOtherStateEvents" && typeof p[2] === "string" && (FACT_FIELDS as readonly string[]).includes(p[2]);

/** 독립 진리표 — 이 셀에서 «요구되는 칸» 중 가장 먼저 비어 있는 칸(순서: 허가 → 건축 외 용도 → 빈집정비 → 바닥면적). 없으면 null. */
function truthFirstBlank(c: Cell): Field | null {
  if (c.basis !== "demolished" || c.read !== "read") return null;
  const needs: readonly string[] = ERAS[c.era].need[c.card === "otherBuilding" ? "building" : "house"];
  const blank: Record<string, boolean> = { permit: c.permit === "", otherUse: c.otherUse === "", vacantHouse: c.vacant === "", floorArea: c.floor === "" };
  for (const f of ["permit", "otherUse", "vacantHouse", "floorArea"] as const) if (needs.includes(f) && blank[f]) return FIELD_OF[f];
  return null;
}

describe("E3f-2 A — ⑧↔⑫′ 사실 칸 parity 격자(실제 ⑧ · 실제 ⑫′ · ④ 와이어 · 독립 진리표)", () => {
  it("격자 규모(공허 방지) · 요구되는 칸·불요한 칸·읽지 않는 입력이 모두 포함된다", () => {
    expect(GRID.length).toBe((2 * 2 + 1) * 3 * 4 * 2 * 16);
    expect(GRID.filter((c) => truthFirstBlank(c) !== null).length).toBeGreaterThan(100);
    expect(GRID.filter((c) => c.basis === "demolished" && c.read === "notRead" && ERAS[c.era].need.building.length > 0).length).toBeGreaterThan(50);
  });

  it("(a)~(d) + 진리표: ⑫′ 400 ⊆ ⑧ 차단 · 같은 칸·같은 문구 · 진리표와 일치 · 읽지 않으면 요구 0 · stale(근거가 `demolished`가 아님) 요구 0", () => {
    const bad: string[] = [];
    const seen = { blocked: 0, byField: { demolishedPermitBefore: 0, demolishedOtherUseBefore: 0, demolishedVacantHouseBefore: 0, demolishedFloorAreaBefore: 0 } as Record<Field, number>, notReadSkipped: 0, staleSkipped: 0 };
    for (const c of GRID) {
      const a = cellAsset(c);
      const transfer = ERAS[c.era].transfer;
      const raw = buildNonBusinessLandRaw(a, transfer);
      if (!raw) { bad.push(`④ raw 없음 ${JSON.stringify(c)}`); continue; }
      const twelve = refine(raw).filter((i) => isFactPath(i.path));
      const { result: eight, fieldOf } = collectWithFields(() => validateNblStateHistory(a, "자산", { transferDate: transfer }));
      const eightFact = eight !== null && FACT_FIELDS.some((f) => fieldOf(eight)?.endsWith(`.${f}`)) ? eight : null;
      const truth = truthFirstBlank(c);

      // 진리표 대조 — ⑧·⑫′ 모두 «첫 빈 칸 하나»
      const eightField = eightFact ? (FACT_FIELDS.find((f) => fieldOf(eightFact)?.endsWith(`.${f}`)) ?? null) : null;
      if (eightField !== truth) bad.push(`⑧ 진리표 불일치 ${JSON.stringify(c)} ⑧=${eightField} truth=${truth}`);
      const twelveField = twelve.length > 0 ? ((twelve[0].path[2] as Field) ?? null) : null;
      if (twelveField !== truth) bad.push(`⑫′ 진리표 불일치 ${JSON.stringify(c)} ⑫=${twelveField} truth=${truth}`);
      if (twelve.length > 1) bad.push(`⑫′ 칸 하나만 ${JSON.stringify(c)}`);

      if (eightFact && twelve.length === 1) {
        // (b) 같은 칸 · 같은 문구(⑧은 접두 «자산: 기타토지 — » 뒤에 같은 메시지)
        if (!eightFact.endsWith(twelve[0].message)) bad.push(`(b) 문구 불일치 ${JSON.stringify(c)}`);
        if (twelve[0].path[1] !== Number(fieldOf(eightFact)!.split(".")[1])) bad.push(`(b) 행 불일치 ${JSON.stringify(c)}`);
        seen.blocked++;
        seen.byField[eightField!]++;
        // (c) ⑧이 가리키는 칸은 ⑤가 그리는 칸 — 엔진 술어(요구 집합 + 읽음)
        const wire = stateHistoryWireFields(a).nblOtherStateEvents;
        const idx = twelve[0].path[1] as number;
        const kind = demolishedRemovedKindOf(wire, idx, c.card === "housing" ? "house" : undefined)!;
        const need = demolishedRequiredFacts({ removedOn: parseISO(String(removalDateFor(wire, idx))), intervalStart: parseISO(String(wire[idx - 1].date)), end: parseISO(String(wire[idx].date)), kind, historyRead: nblStateHistoryIsRead(raw) });
        const key = Object.entries(FIELD_OF).find(([, v]) => v === eightField)![0] as keyof typeof need;
        if (!need[key]) bad.push(`(c) 화면에 없는 칸 요구 ${JSON.stringify(c)}`);
      } else if (!!eightFact !== (twelve.length === 1)) {
        bad.push(`(a) ⑧↔⑫′ 한쪽만 ${JSON.stringify(c)} ⑧=${eightFact ? "차단" : "통과"} ⑫=${twelve.length}`);
      }

      // (d) 읽지 않는 입력 · stale 근거는 요구 0
      if (c.read === "notRead" && c.basis === "demolished" && ERAS[c.era].need[c.card === "otherBuilding" ? "building" : "house"].length > 0) {
        seen.notReadSkipped++;
        if (eightFact || twelve.length > 0) bad.push(`(d) 읽지 않는데 요구 ${JSON.stringify(c)}`);
      }
      if (c.basis !== "demolished") {
        seen.staleSkipped++;
        if (eightFact || twelve.length > 0) bad.push(`(d) 근거가 철거ㆍ멸실이 아닌데 요구 ${JSON.stringify(c)}`);
      }
    }
    expect(bad.slice(0, 8)).toEqual([]);
    for (const f of FACT_FIELDS) expect(seen.byField[f], f).toBeGreaterThanOrEqual(2);
    expect(seen.blocked).toBeGreaterThan(80);
    expect(seen.notReadSkipped).toBeGreaterThan(50);
    expect(seen.staleSkipped).toBeGreaterThan(500);
  }, 240_000);

  it("K-10d 명시 «모름»(허가 unknown)·«예(건축 외 용도)»·«아니오(빈집정비)»는 차단하지 않는다 — 접힘 + 확인 필요(미선택만 차단)", () => {
    const a = cellAsset({ card: "otherBuilding", closer: "built", basis: "demolished", era: "full2024", read: "read", permit: "unknown", otherUse: "yes", vacant: "no", floor: "250" });
    expect(validateNblStateHistory(a, "자산", { transferDate: ERAS.full2024.transfer })).toBeNull();
    const raw = buildNonBusinessLandRaw(a, ERAS.full2024.transfer)!;
    expect(refine(raw).filter((i) => isFactPath(i.path))).toEqual([]);
  });

  it("K-10 바닥면적: 비주택 철거 행에서만 요구(빈칸·0·음수·비수치 모두 차단) · 주택 행에는 칸이 없어 stray 바닥면적을 읽지 않는다(K-26)", () => {
    const at = (card: Card, floor: string) => {
      const a = cellAsset({ card, closer: "built", basis: "demolished", era: "full2024", read: "read", permit: "unknown", otherUse: "yes", vacant: "no", floor: "250" });
      (a.nblOtherStateEvents as unknown as Loose[])[2].demolishedFloorAreaBefore = floor;
      return a;
    };
    for (const bad of ["", " ", "0", "-5", "abc"]) {
      const { result, fieldOf } = collectWithFields(() => validateNblStateHistory(at("otherBuilding", bad), "자산", { transferDate: ERAS.full2024.transfer }));
      expect(fieldOf(result!), bad).toBe("nblOtherStateEvents.2.demolishedFloorAreaBefore");
    }
    expect(validateNblStateHistory(at("otherBuilding", "250"), "자산", { transferDate: ERAS.full2024.transfer })).toBeNull();
    for (const stray of ["", "abc", "-1"]) expect(validateNblStateHistory(at("otherHouse", stray), "자산", { transferDate: ERAS.full2024.transfer }), stray).toBeNull();
  });

  it("K-10e 배율표 밖 용도지역(비주택 · 바닥면적 입력됨) → ⑧·⑫′ 같은 문구로 차단(`demolishedZoneUnmappedMessage`)", () => {
    const a = cellAsset({ card: "otherBuilding", closer: "built", basis: "demolished", era: "full2024", read: "read", permit: "unknown", otherUse: "yes", vacant: "no", floor: "250" });
    (a as unknown as Loose).nblZoneType = "residential"; // 세분되지 않은 용도지역
    const { result } = collectWithFields(() => validateNblStateHistory(a, "자산", { transferDate: ERAS.full2024.transfer }));
    expect(result).toContain("용도지역");
    const twelve = refine(buildNonBusinessLandRaw(a, ERAS.full2024.transfer)!).filter((i) => isFactPath(i.path));
    expect(twelve).toHaveLength(1);
    expect(result!.endsWith(twelve[0].message)).toBe(true);
    expect(twelve[0].path).toEqual(["nblOtherStateEvents", 2, "demolishedFloorAreaBefore"]);
  });

  it("K-10f/K-10g: 읽지 않는 상태(의제 사유)에서는 4칸이 빈칸이어도 ⑧ 통과 · ⑫ 200 — 사유를 해소하면 요구가 다시 나타난다(같은 `nblStateHistoryIsRead`)", () => {
    const mk = (deemed: boolean) => {
      const a = cellAsset({ card: "otherBuilding", closer: "built", basis: "demolished", era: "full2024", read: "read", permit: "", otherUse: "", vacant: "", floor: "" });
      return deemed ? ({ ...a, nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2024-10-01" } as AssetForm) : a;
    };
    const t = ERAS.full2024.transfer;
    for (const deemed of [true, false]) {
      const a = mk(deemed);
      const eight = validateNblStateHistory(a, "자산", { transferDate: t });
      const twelve = refine(buildNonBusinessLandRaw(a, t)!).filter((i) => isFactPath(i.path));
      expect(!!eight, `deemed=${deemed}`).toBe(!deemed);
      expect(twelve.length > 0, `deemed=${deemed}`).toBe(!deemed);
    }
  });
});

// ── B. ④ 와이어 ─────────────────────────────────────────────────────────────

describe("E3f-2 B — ④ 와이어: 근거 `demolished`는 철거 행 뒤 나대지 구간에서만 · 요구 칸만 싣는다", () => {
  const FULL: Loose = { demolishedPermitBefore: "yes", demolishedOtherUseBefore: "no", demolishedVacantHouseBefore: "no", demolishedFloorAreaBefore: " 250 " };
  const asset = (era: EraKey, card: Card, extra: Loose = FULL, basis: Basis = "demolished"): AssetForm => {
    const a = cellAsset({ card, closer: "built", basis, era, read: "read", permit: "", otherUse: "", vacant: "", floor: "" });
    (a.nblOtherStateEvents as unknown as Loose[])[a.nblOtherStateEvents!.length - 1] = { ...(a.nblOtherStateEvents as unknown as Loose[])[a.nblOtherStateEvents!.length - 1], ...extra };
    return a;
  };
  const lastWire = (a: AssetForm) => stateHistoryWireFields(a).nblOtherStateEvents.at(-1) as unknown as Loose;

  it.each([
    ["2018 시행본 — 칸 요구 없음", "none2018", "otherBuilding", []],
    ["2023 — 허가만", "permitOnly", "otherBuilding", ["demolishedPermitBefore"]],
    ["2024~ 비주택 — 허가 · 건축 외 용도 · 바닥면적(공백 제거)", "full2024", "otherBuilding", ["demolishedPermitBefore", "demolishedOtherUseBefore", "demolishedFloorAreaBefore"]],
    ["2024~ 주택 — 허가 · 건축 외 용도 · 빈집정비(바닥면적 칸 없음)", "full2024", "otherHouse", ["demolishedPermitBefore", "demolishedOtherUseBefore", "demolishedVacantHouseBefore"]],
    ["주택부수토지 카드 — 같은 leaf(주택 3칸)", "full2024", "housing", ["demolishedPermitBefore", "demolishedOtherUseBefore", "demolishedVacantHouseBefore"]],
    ["한시 불성립(6개월 안에 과세기준일 없음) — 칸 요구 없음", "never", "otherBuilding", []],
  ] as const)("%s", (_s, era, card, expected) => {
    const w = lastWire(asset(era, card));
    expect(w.propertyTaxBasisBefore).toBe("demolished");
    expect(FACT_FIELDS.filter((f) => f in w)).toEqual(expected);
    if ("demolishedFloorAreaBefore" in w) expect(w.demolishedFloorAreaBefore).toBe("250");
  });

  it("철거 행 앞·없는 구간(신축 앞 나대지)에는 선택지가 없다 — 저장된 stale `demolished`는 «미선택»으로 보이고 와이어에 근거도 사실 칸도 없다", () => {
    const a = {
      ...asset("permitOnly", "otherBuilding"),
      nblOtherStateEvents: [{ kind: "building_built", date: "2021-06-02", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", ...FULL }],
    } as unknown as AssetForm;
    const w = stateHistoryWireFields(a).nblOtherStateEvents[0] as unknown as Loose;
    expect("propertyTaxBasisBefore" in w).toBe(false);
    for (const f of FACT_FIELDS) expect(f in w, f).toBe(false);
  });

  it("근거를 `vacant_state`·미선택으로 바꾸면 사실 칸은 와이어에서 사라진다(저장값은 그대로 — 되돌리면 복원)", () => {
    for (const basis of ["vacant_state", ""] as const) {
      const a = asset("full2024", "otherBuilding", FULL, basis);
      const w = lastWire(a);
      for (const f of FACT_FIELDS) expect(f in w, `${basis}/${f}`).toBe(false);
      expect((a.nblOtherStateEvents as unknown as Loose[]).at(-1)!.demolishedPermitBefore).toBe("yes"); // 저장값 보존
    }
  });

  it("구분 변경 행 + 건축물 위 구분 변경: 철거 행 뒤 나대지를 닫는 구분 변경 행만 근거 `demolished`를 받는다 — 철거 행이 아닌 건축물 구간 위 구분 변경은 받지 않는다", () => {
    const rows = [
      { kind: "building_built", date: "2012-06-01", propertyTaxTypeBefore: "" },
      { kind: "tax_type_changed", date: "2015-01-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", ...FULL },
      { kind: "building_removed", date: "2022-12-15", propertyTaxTypeBefore: "separate" },
      { kind: "tax_type_changed", date: "2023-09-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", ...FULL },
    ] as never;
    const wire = (i: number) => stateEventWireRow(rows, i, false) as unknown as Loose;
    expect(eventOffersDemolished(rows, 1, false)).toBe(false);
    expect("propertyTaxBasisBefore" in wire(1)).toBe(false);
    expect(eventOffersDemolished(rows, 3, false)).toBe(true);
    expect(wire(3).propertyTaxBasisBefore).toBe("demolished");
    expect(wire(3).demolishedPermitBefore).toBe("yes");
  });
});

// ── C. ③ 복원 ───────────────────────────────────────────────────────────────

describe("E3f-2 C — ③ 복원 정규화(`migrateAsset`): 허용값 안 · 나대지를 닫을 수 있는 행만 보존 · 키 없는 행은 키를 만들지 않는다", () => {
  const migrate = (events: unknown[]) => (migrateAsset({ ...BASE, nblOtherStateHistoryMode: "changed", nblOtherStateEvents: events } as unknown as Record<string, unknown>) as unknown as AssetForm).nblOtherStateEvents as unknown as Loose[];

  it("신축·구분 변경 행(나대지를 닫을 수 있는 행)의 허용값 3지선다·바닥면적 문자열은 보존, 허용값 밖은 버린다", () => {
    const out = migrate([
      { kind: "building_built", date: "2020-01-01", propertyTaxTypeBefore: "separate", demolishedPermitBefore: "yes", demolishedOtherUseBefore: "no", demolishedVacantHouseBefore: "unknown", demolishedFloorAreaBefore: "250" },
      { kind: "tax_type_changed", date: "2021-01-01", propertyTaxTypeBefore: "separate", demolishedPermitBefore: "maybe", demolishedOtherUseBefore: 3, demolishedVacantHouseBefore: "", demolishedFloorAreaBefore: 250 },
    ]);
    expect(out[0]).toMatchObject({ demolishedPermitBefore: "yes", demolishedOtherUseBefore: "no", demolishedVacantHouseBefore: "unknown", demolishedFloorAreaBefore: "250" });
    for (const f of FACT_FIELDS) expect(f in out[1], f).toBe(false);
  });

  it("철거 행은 나대지를 닫지 않으므로 사실 칸을 남기지 않는다 · 키가 없던 행은 키를 만들지 않는다(구 스냅샷 byte-identical)", () => {
    const out = migrate([
      { kind: "building_removed", date: "2020-01-01", propertyTaxTypeBefore: "separate", demolishedPermitBefore: "yes", demolishedFloorAreaBefore: "250" },
      { kind: "building_built", date: "2021-01-01", propertyTaxTypeBefore: "separate" },
    ]);
    for (const row of out) for (const f of FACT_FIELDS) expect(f in row, `${row.kind}/${f}`).toBe(false);
    expect(JSON.stringify(out[1])).toBe(JSON.stringify({ kind: "building_built", date: "2021-01-01", propertyTaxTypeBefore: "separate" }));
  });
});

// ── D. `nblStateHistoryIsRead` ───────────────────────────────────────────────

describe("E3f-2 D — `nblStateHistoryIsRead(raw)`: ⑧·⑫′가 같이 부르는 «엔진이 이력을 읽는가»", () => {
  const rawOf = (c: Partial<Cell> & { card: Card }, transfer?: string) => {
    const cell: Cell = { closer: "built", basis: "demolished", era: "full2024", read: "read", permit: "", otherUse: "", vacant: "", floor: "", ...c };
    return buildNonBusinessLandRaw(cellAsset(cell), transfer ?? ERAS[cell.era].transfer)!;
  };

  it("기타토지: 정상 = 읽음 · core 부분 면적(꼬리 건물 바닥면적 부족) = 안 읽음 · 양도일 의제 사유 = 안 읽음", () => {
    expect(nblStateHistoryIsRead(rawOf({ card: "otherBuilding" }))).toBe(true);
    expect(nblStateHistoryIsRead(rawOf({ card: "otherBuilding", read: "notRead" }))).toBe(false); // closer built → 꼬리 건물 100 × 4 = 400 < 1,000
    const deemed = { ...rawOf({ card: "otherBuilding" }), nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2024-10-01" };
    expect(nblStateHistoryIsRead(deemed)).toBe(false);
  });

  it("주택부수토지 카드(V-26): 양도일 현재 배율 이내 = 읽음 · 배율 초과 = 안 읽음(Q-3a (나)) · 의제 사유는 주택 지목에 적용되지 않는다", () => {
    expect(nblStateHistoryIsRead(rawOf({ card: "housing" }))).toBe(true);
    expect(nblStateHistoryIsRead(rawOf({ card: "housing", read: "notRead" }))).toBe(false);
  });

  it("모드가 `changed`가 아니거나 사건이 0건이면 읽지 않는다 · 엔진 입력을 못 만들면(raw 비어 있음) «읽는다» — 다른 ⑧ 규칙이 먼저 막는다", () => {
    expect(nblStateHistoryIsRead({ ...rawOf({ card: "otherBuilding" }), nblOtherStateHistoryMode: "unchanged" })).toBe(false);
    expect(nblStateHistoryIsRead({ ...rawOf({ card: "otherBuilding" }), nblOtherStateEvents: [] })).toBe(false);
    expect(nblStateHistoryIsRead({})).toBe(true);
  });
});

// ── leaf 직접 ───────────────────────────────────────────────────────────────

describe("E3f-2 — `demolishedRowFactIssue` leaf: 읽음 게이트는 지연 평가(요구 칸이 없으면 엔진을 돌리지 않는다)", () => {
  it("요구 칸이 구조적으로 없는 시료는 `historyRead`를 부르지 않는다 · 요구 칸이 있으면 한 번만 부른다", () => {
    let calls = 0;
    const read = () => { calls++; return true; };
    const none = [{ kind: "building_removed", date: "2022-07-01", propertyTaxTypeBefore: "separate" }, { kind: "building_built", date: "2023-12-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished" }];
    expect(demolishedRowFactIssue({ events: none, fallbackHasBuilding: true, tailKind: undefined, historyRead: read, zoneType: "general_residential" })).toBeNull();
    expect(calls).toBe(0);
    const need = [{ kind: "building_removed", date: "2022-12-15", propertyTaxTypeBefore: "separate" }, { kind: "building_built", date: "2023-12-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished" }];
    expect(demolishedRowFactIssue({ events: need, fallbackHasBuilding: true, tailKind: undefined, historyRead: read, zoneType: "general_residential" })).toMatchObject({ index: 1, field: "demolishedPermitBefore" });
    expect(calls).toBe(1);
  });
});
