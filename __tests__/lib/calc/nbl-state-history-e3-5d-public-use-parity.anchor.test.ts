/**
 * NBL-STATE-HISTORY-E3-⑤ E3f-3 — 영 §103의2 2호 단서 **하위 4칸**(공용 사용 / 유료 / 개시일 / 종료일)의 ⑧↔⑫′ 거울 anchor (계획서 §3.2 · §3.5 · §6.2 E · R-3~R-6).
 *
 * 새 필수 칸이 **다른 칸의 답에 의존**한다(건축 외 용도 «예» ∧ 빈집정비 «예» → 공용 사용 «예» → 유료 «예» → 날짜) — 노출 ≡ 필수 — 화면에 없는 칸 400 금지.
 *   A  ⑧↔⑫′ parity 격자 — 실제 ⑧(`validateNblStateHistory`) · 실제 ⑫′(`refineNonBusinessLandRaw`, ④가 만든 raw) · 독립 진리표(사슬)
 *       (a) ⑫′가 400이면 ⑧도 차단 · 같은 칸·같은 문구 (b) ⑧이 가리키는 칸은 ⑤가 그리는 칸(`demolishedPublicUseAsked`) (c) 읽지 않는 입력은 요구 0 (d) 근거가 `demolished`가 아니면 요구 0
 *   B  날짜 결함 — 개시일 빈칸 · 종료일 빈칸(구간 끝으로 읽지 않는다 — Q-4 (가)) · 해석 불가 · 개시 > 종료의 점프 필드·문구
 *   C  ④ 와이어 — 열린 칸만 싣는다(stale 비전송 · 되돌리면 복원) · 날짜는 문자열 그대로
 *   D  ③ 복원 — 허용값만 보존 · 키 없는 행은 키를 만들지 않는다(R-8 byte-identical)
 *   E  leaf `firstBlankDemolishedFact` — 칸 순서
 */
import { describe, it, expect } from "vitest";
import type { z } from "zod";
import { refineNonBusinessLandRaw, type NblRawRefineInput } from "@/lib/api/transfer-tax-schema-nbl-refines";
import { stateHistoryWireFields } from "@/lib/calc/nbl-other-state-history-scope";
import { buildNonBusinessLandRaw } from "@/lib/calc/non-business-land-request";
import { validateNblStateHistory } from "@/lib/calc/transfer-tax-validate-nbl-state-history";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { demolishedPublicUseAsked, demolishedRequiredFacts } from "@/lib/tax-engine/non-business-land/demolished-temp-status";
import { demolishedRowFactIssue, firstBlankDemolishedFact } from "@/lib/tax-engine/non-business-land/demolished-row-facts";
import { demolishedRemovedKindOf, removalDateFor } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { parseISO } from "@/lib/tax-engine/utc-date";

type Loose = Record<string, unknown>;
const PU_FIELDS = ["demolishedPublicUseBefore", "demolishedPublicUsePaidBefore", "demolishedPublicUseFromBefore", "demolishedPublicUseToBefore"] as const;
type PuField = (typeof PU_FIELDS)[number];
const ALL_FACT_FIELDS = ["demolishedPermitBefore", "demolishedOtherUseBefore", "demolishedVacantHouseBefore", ...PU_FIELDS, "demolishedFloorAreaBefore"] as const;
const BASE = makeDefaultAsset(1);

/** 시료 시대 — 2024.6.1.~ 시행본(철거 2024-01-15 · 닫는 행 2024-09-01 · 양도 2024-12-01 — 후보 과세기준일 2024-06-01). */
const E = { removedOn: "2024-01-15", closeOn: "2024-09-01", transfer: "2024-12-01" } as const;
type Card = "otherHouse" | "housing" | "otherBuilding";
type Read = "read" | "notRead";
const VALUES = ["", "yes", "no", "unknown"] as const;
type V = (typeof VALUES)[number];
type DateCase = "valid" | "blankFrom" | "blankTo" | "invalidFrom" | "invalidTo" | "reversed";
const DATES: Record<DateCase, { from: string; to: string }> = {
  valid: { from: "2024-04-01", to: "2024-12-01" },
  blankFrom: { from: "", to: "2024-12-01" },
  blankTo: { from: "2024-04-01", to: "" },
  invalidFrom: { from: "2024-13-45", to: "2024-12-01" },
  invalidTo: { from: "2024-04-01", to: "내일" },
  reversed: { from: "2024-12-01", to: "2024-04-01" },
};

interface Cell { card: Card; read: Read; otherUse: V; vacant: V; publicUse: V; paid: V; date: DateCase }

function cellAsset(c: Cell): AssetForm {
  const closing: Loose = {
    kind: c.card === "otherHouse" ? "tax_type_changed" : "building_built",
    date: E.closeOn,
    propertyTaxTypeBefore: "separate",
    propertyTaxBasisBefore: "demolished",
    demolishedPermitBefore: "yes",
    ...(c.otherUse ? { demolishedOtherUseBefore: c.otherUse } : {}),
    ...(c.vacant ? { demolishedVacantHouseBefore: c.vacant } : {}),
    ...(c.publicUse ? { demolishedPublicUseBefore: c.publicUse } : {}),
    ...(c.paid ? { demolishedPublicUsePaidBefore: c.paid } : {}),
    demolishedPublicUseFromBefore: DATES[c.date].from,
    demolishedPublicUseToBefore: DATES[c.date].to,
    ...(c.card === "otherBuilding" ? { demolishedFloorAreaBefore: "250" } : {}),
  };
  const common = {
    ...BASE, assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2014-01-01", acquisitionArea: "1000",
    isNonBusinessLand: true, nblUseDetailedJudgment: true, nblZoneType: "general_residential", nblIsMetropolitanArea: "no", nblOtherStateHistoryMode: "changed",
  };
  if (c.card === "housing") {
    return {
      ...common, nblLandType: "housing_site",
      nblHousingFootprint: c.read === "read" ? "250" : "100", // 100 × 5 = 500 < 1,000 → 배율 초과 → 이력을 읽지 않는다
      nblOtherStateEvents: [{ kind: "building_removed", date: E.removedOn, propertyTaxTypeBefore: "", houseFootprintBefore: "250" }, closing],
    } as unknown as AssetForm;
  }
  return {
    ...common, nblLandType: "other_land", nblOtherPropertyTaxType: "separate", nblOtherHasBuilding: true,
    nblOtherBuildingFloorArea: c.read === "read" ? "250" : "100",
    ...(c.read === "notRead" && c.card === "otherHouse" ? { nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2024-10-01" } : {}),
    nblOtherStateEvents: [
      { kind: "building_built", date: "2012-06-01", propertyTaxTypeBefore: "" },
      { kind: "building_removed", date: E.removedOn, propertyTaxTypeBefore: "separate", ...(c.card === "otherHouse" ? { buildingKindBefore: "house", houseFootprintBefore: "400" } : {}) },
      closing,
    ],
  } as unknown as AssetForm;
}

function refine(raw: Record<string, unknown>): { path: (string | number)[]; message: string }[] {
  const out: { path: (string | number)[]; message: string }[] = [];
  refineNonBusinessLandRaw(raw as unknown as NblRawRefineInput, { addIssue: (i: { path: (string | number)[]; message: string }) => out.push({ path: i.path, message: i.message }) } as unknown as z.RefinementCtx);
  return out;
}
const isFactPath = (p: (string | number)[]) => p[0] === "nblOtherStateEvents" && typeof p[2] === "string" && (ALL_FACT_FIELDS as readonly string[]).includes(p[2]);

/** 독립 진리표 — 허가는 «예»로 고정(이 격자의 관심사가 아님). 주택 철거 행이고 읽을 때만. 사슬을 한 줄씩 풀어 쓴다(`demolishedPublicUseAsked`를 부르지 않는다). */
function truthFirstBlank(c: Cell): string | null {
  if (c.read !== "read" || c.card === "otherBuilding") {
    // 비주택(바닥면적 250 입력 — 이 시료는 과세기준일 2024-06-01 시행본이라 칸은 모두 채워져 있다) · 읽지 않음 → 하위 칸 요구 0
    if (c.card === "otherBuilding" && c.read === "read") return c.otherUse === "" ? "demolishedOtherUseBefore" : null;
    return null;
  }
  if (c.otherUse === "") return "demolishedOtherUseBefore";
  if (c.vacant === "") return "demolishedVacantHouseBefore";
  if (c.otherUse !== "yes" || c.vacant !== "yes") return null;
  if (c.publicUse === "") return "demolishedPublicUseBefore";
  if (c.publicUse !== "yes") return null;
  if (c.paid === "") return "demolishedPublicUsePaidBefore";
  if (c.paid !== "yes") return null;
  if (c.date === "blankFrom" || c.date === "invalidFrom") return "demolishedPublicUseFromBefore";
  if (c.date === "blankTo" || c.date === "invalidTo" || c.date === "reversed") return "demolishedPublicUseToBefore";
  return null;
}

const GRID: Cell[] = [];
for (const card of ["otherHouse", "housing", "otherBuilding"] as const) for (const read of ["read", "notRead"] as const)
  for (const otherUse of VALUES) for (const vacant of VALUES) for (const publicUse of VALUES) for (const paid of VALUES) {
    const reachesDates = otherUse === "yes" && vacant === "yes" && publicUse === "yes" && paid === "yes";
    for (const date of (reachesDates ? (Object.keys(DATES) as DateCase[]) : (["valid"] as DateCase[]))) GRID.push({ card, read, otherUse, vacant, publicUse, paid, date });
  }

describe("E3f-3 A — ⑧↔⑫′ 하위 4칸 parity 격자(실제 ⑧ · 실제 ⑫′ · ④ 와이어 · 독립 진리표)", () => {
  it("격자 규모(공허 방지): 3카드 × 읽음 2 × 답 사슬 256(날짜 결함 6종은 사슬 끝에서만) — 차단되는 셀·접힘 셀이 모두 있다", () => {
    expect(GRID.length).toBe(3 * 2 * (255 + 6));
    expect(GRID.filter((c) => truthFirstBlank(c)?.startsWith("demolishedPublicUse")).length).toBeGreaterThanOrEqual(20);
    expect(GRID.filter((c) => c.card === "otherHouse" && c.read === "read" && c.otherUse === "yes" && c.vacant === "yes" && c.publicUse === "no").length).toBeGreaterThan(0);
  });

  it("(a)~(d) + 진리표: ⑫′ 400 ≡ ⑧ 차단 · 같은 칸·같은 문구 · 진리표 일치 · 읽지 않으면 요구 0 · 비주택 행은 하위 칸 요구 0", () => {
    const bad: string[] = [];
    const seen = { blocked: 0, byField: { demolishedPublicUseBefore: 0, demolishedPublicUsePaidBefore: 0, demolishedPublicUseFromBefore: 0, demolishedPublicUseToBefore: 0 } as Record<PuField, number>, notReadSkipped: 0, buildingSkipped: 0 };
    for (const c of GRID) {
      const a = cellAsset(c);
      const raw = buildNonBusinessLandRaw(a, E.transfer);
      if (!raw) { bad.push(`④ raw 없음 ${JSON.stringify(c)}`); continue; }
      const twelve = refine(raw).filter((i) => isFactPath(i.path));
      const { result: eight, fieldOf } = collectWithFields(() => validateNblStateHistory(a, "자산", { transferDate: E.transfer }));
      const eightField = eight !== null ? ((ALL_FACT_FIELDS.find((f) => fieldOf(eight)?.endsWith(`.${f}`)) ?? null) as string | null) : null;
      const twelveField = twelve.length > 0 ? (twelve[0].path[2] as string) : null;
      const truth = truthFirstBlank(c);
      if (eightField !== truth) bad.push(`⑧ 진리표 불일치 ${JSON.stringify(c)} ⑧=${eightField} truth=${truth}`);
      if (twelveField !== truth) bad.push(`⑫′ 진리표 불일치 ${JSON.stringify(c)} ⑫=${twelveField} truth=${truth}`);
      if (twelve.length > 1) bad.push(`⑫′ 칸 하나만 ${JSON.stringify(c)}`);
      if (eight !== null && twelve.length === 1) {
        if (!eight.endsWith(twelve[0].message)) bad.push(`(a) 문구 불일치 ${JSON.stringify(c)}`);
        const idx = twelve[0].path[1] as number;
        if (idx !== Number(fieldOf(eight)!.split(".")[1])) bad.push(`(a) 행 불일치 ${JSON.stringify(c)}`);
        // (b) ⑧이 가리키는 하위 칸은 ⑤가 그리는 칸 — `demolishedPublicUseAsked`가 연 칸
        if ((PU_FIELDS as readonly string[]).includes(eightField!)) {
          const wire = stateHistoryWireFields(a).nblOtherStateEvents;
          const kind = demolishedRemovedKindOf(wire, idx, c.card === "housing" ? "house" : undefined)!;
          const need = demolishedRequiredFacts({ removedOn: parseISO(String(removalDateFor(wire, idx))), intervalStart: parseISO(String(wire[idx - 1].date)), end: parseISO(String(wire[idx].date)), kind, historyRead: true });
          const asked = demolishedPublicUseAsked(need, wire[idx]);
          const open = { demolishedPublicUseBefore: asked.publicUse, demolishedPublicUsePaidBefore: asked.paid, demolishedPublicUseFromBefore: asked.dates, demolishedPublicUseToBefore: asked.dates }[eightField as PuField];
          if (!open) bad.push(`(b) 화면에 없는 칸 요구 ${JSON.stringify(c)}`);
          seen.blocked++;
          seen.byField[eightField as PuField]++;
        }
      } else if ((eight !== null) !== (twelve.length === 1)) {
        bad.push(`(a) ⑧↔⑫′ 한쪽만 ${JSON.stringify(c)} ⑧=${eight ? "차단" : "통과"} ⑫=${twelve.length}`);
      }
      // (c) 읽지 않는 입력 — 하위 칸 요구 0(이미 진리표가 null이지만 다른 칸이 막히지 않는 것도 확인)
      if (c.read === "notRead") {
        seen.notReadSkipped++;
        if (eight !== null || twelve.length > 0) bad.push(`(c) 읽지 않는데 요구 ${JSON.stringify(c)}`);
      }
      // (d) 비주택 건축물 행은 빈집정비 칸이 없다 — 하위 칸 요구·노출 0
      if (c.card === "otherBuilding") {
        seen.buildingSkipped++;
        if (twelveField && (PU_FIELDS as readonly string[]).includes(twelveField)) bad.push(`(d) 비주택인데 하위 칸 요구 ${JSON.stringify(c)}`);
      }
    }
    expect(bad.slice(0, 8)).toEqual([]);
    for (const f of PU_FIELDS) expect(seen.byField[f], f).toBeGreaterThanOrEqual(2);
    expect(seen.notReadSkipped).toBeGreaterThan(300);
    expect(seen.buildingSkipped).toBeGreaterThan(300);
  }, 300_000);

  it("R-3 명시 «모름»·«아니오»(① ②)는 차단하지 않는다 — 접힘 + 확인 필요(미선택만 차단) · 상위 답이 «아니오»·«모름»이면 하위 칸 요구 0", () => {
    const at = (over: Partial<Cell>) => cellAsset({ card: "otherHouse", read: "read", otherUse: "yes", vacant: "yes", publicUse: "yes", paid: "yes", date: "valid", ...over });
    for (const over of [{ publicUse: "no" }, { publicUse: "unknown" }, { paid: "no" }, { paid: "unknown" }, { otherUse: "no" }, { otherUse: "unknown" }, { vacant: "no" }, { vacant: "unknown" }] as Partial<Cell>[]) {
      const a = at(over);
      expect(validateNblStateHistory(a, "자산", { transferDate: E.transfer }), JSON.stringify(over)).toBeNull();
      expect(refine(buildNonBusinessLandRaw(a, E.transfer)!).filter((i) => isFactPath(i.path)), JSON.stringify(over)).toEqual([]);
    }
    expect(validateNblStateHistory(at({}), "자산", { transferDate: E.transfer })).toBeNull();
  });

  it("R-5 읽지 않는 입력(양도일 의제): 새 4칸도 요구도 노출도 없다 — 사유를 해소하면 같은 입력이 차단된다(공용 사용 미선택)", () => {
    const base = cellAsset({ card: "otherHouse", read: "read", otherUse: "yes", vacant: "yes", publicUse: "", paid: "", date: "valid" });
    const deemed = { ...base, nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2024-10-01" } as AssetForm;
    expect(validateNblStateHistory(deemed, "자산", { transferDate: E.transfer })).toBeNull();
    expect(refine(buildNonBusinessLandRaw(deemed, E.transfer)!).filter((i) => isFactPath(i.path))).toEqual([]);
    const { result, fieldOf } = collectWithFields(() => validateNblStateHistory(base, "자산", { transferDate: E.transfer }));
    expect(fieldOf(result!)).toBe("nblOtherStateEvents.2.demolishedPublicUseBefore");
  });
});

describe("E3f-3 B — 날짜 결함: 점프 필드 · 문구(⑧ ≡ ⑫′) · 종료일 빈칸은 구간 끝이 아니다(Q-4 (가))", () => {
  const at = (date: DateCase) => cellAsset({ card: "otherHouse", read: "read", otherUse: "yes", vacant: "yes", publicUse: "yes", paid: "yes", date });
  const eightOf = (a: AssetForm) => collectWithFields(() => validateNblStateHistory(a, "자산", { transferDate: E.transfer }));

  it.each([
    ["valid", null, null],
    ["blankFrom", "nblOtherStateEvents.2.demolishedPublicUseFromBefore", /개시일을 입력하세요/],
    ["blankTo", "nblOtherStateEvents.2.demolishedPublicUseToBefore", /종료일을 입력하세요.*빈칸을 구간 끝까지로 보지 않습니다/],
    ["invalidFrom", "nblOtherStateEvents.2.demolishedPublicUseFromBefore", /개시일\(2024-13-45\)을 날짜로 읽을 수 없습니다/],
    ["invalidTo", "nblOtherStateEvents.2.demolishedPublicUseToBefore", /종료일\(내일\)을 날짜로 읽을 수 없습니다/],
    ["reversed", "nblOtherStateEvents.2.demolishedPublicUseToBefore", /종료일\(2024-04-01\)이 개시일\(2024-12-01\)보다 앞입니다/],
  ] as const)("%s → 점프 필드 · 문구 · ⑫′ 같은 경로·같은 문구", (date, field, message) => {
    const a = at(date);
    const { result, fieldOf } = eightOf(a);
    const twelve = refine(buildNonBusinessLandRaw(a, E.transfer)!).filter((i) => isFactPath(i.path));
    if (!field) {
      expect(result).toBeNull();
      expect(twelve).toEqual([]);
      return;
    }
    expect(fieldOf(result!)).toBe(field);
    expect(result).toMatch(message!);
    expect(twelve).toHaveLength(1);
    expect(twelve[0].path.join(".")).toBe(field);
    expect(result!.endsWith(twelve[0].message)).toBe(true);
  });

  it("종료일 빈칸은 «구간 끝까지»로 통과하지 않는다 — 개시일만 입력한 입력은 ⑧ 차단 · ⑫ 400 · 엔진 직접 호출은 단서 불성립(접힘)", () => {
    expect(eightOf(at("blankTo")).result).not.toBeNull();
    expect(refine(buildNonBusinessLandRaw(at("blankTo"), E.transfer)!).filter((i) => isFactPath(i.path))).toHaveLength(1);
  });

  it("공백만 있는 날짜는 빈칸과 같다(트림)", () => {
    const a = at("valid");
    (a.nblOtherStateEvents as unknown as Loose[])[2].demolishedPublicUseToBefore = "   ";
    expect(fieldOfBlank(a)).toBe("nblOtherStateEvents.2.demolishedPublicUseToBefore");
    function fieldOfBlank(x: AssetForm) {
      const { result, fieldOf } = eightOf(x);
      return result ? fieldOf(result) : null;
    }
  });
});

describe("E3f-3 C — ④ 와이어: 열린 칸만 싣는다(숨은 stale 비전송 — 되돌리면 복원) · 날짜는 문자열 그대로", () => {
  const closingWire = (a: AssetForm) => stateHistoryWireFields(a).nblOtherStateEvents.at(-1) as unknown as Loose;
  const asset = (over: Partial<Cell>) => cellAsset({ card: "otherHouse", read: "read", otherUse: "yes", vacant: "yes", publicUse: "yes", paid: "yes", date: "valid", ...over });

  it("전부 열림: 4칸 모두 싣는다 · 날짜 문자열 그대로(`Date` 변환은 ⑭)", () => {
    const w = closingWire(asset({}));
    expect(w).toMatchObject({ demolishedPublicUseBefore: "yes", demolishedPublicUsePaidBefore: "yes", demolishedPublicUseFromBefore: "2024-04-01", demolishedPublicUseToBefore: "2024-12-01" });
    expect(typeof w.demolishedPublicUseFromBefore).toBe("string");
  });

  it.each([
    ["건축 외 용도 «아니오»", { otherUse: "no" as V }, []],
    ["빈집정비 «아니오»", { vacant: "no" as V }, []],
    ["공용 사용 «아니오»", { publicUse: "no" as V }, ["demolishedPublicUseBefore"]],
    ["공용 사용 «모름»", { publicUse: "unknown" as V }, ["demolishedPublicUseBefore"]],
    ["유료 «아니오»", { paid: "no" as V }, ["demolishedPublicUseBefore", "demolishedPublicUsePaidBefore"]],
    ["유료 미선택", { paid: "" as V }, ["demolishedPublicUseBefore"]],
  ])("%s → 싣는 하위 칸 = %j (stale 날짜·유료 값은 싣지 않는다)", (_s, over, expected) => {
    const w = closingWire(asset(over));
    expect(PU_FIELDS.filter((f) => f in w)).toEqual(expected);
  });

  it("R-6 되돌리면 복원: 건축 외 용도를 «아니오» → «예»로 되돌려도 저장값이 그대로라 와이어가 다시 4칸을 싣는다(저장값은 한 번도 지워지지 않는다)", () => {
    const a = asset({});
    const events = a.nblOtherStateEvents as unknown as Loose[];
    events[2].demolishedOtherUseBefore = "no";
    expect(PU_FIELDS.filter((f) => f in closingWire(a))).toEqual([]);
    expect(events[2].demolishedPublicUseFromBefore).toBe("2024-04-01"); // 저장값 보존
    events[2].demolishedOtherUseBefore = "yes";
    expect(PU_FIELDS.filter((f) => f in closingWire(a))).toEqual([...PU_FIELDS]);
  });

  it("날짜 공백은 트림해 싣고 빈 문자열은 키를 만들지 않는다(빈 필수 칸 = 키 없음 → ⑧·⑫′가 빈칸으로 읽는다)", () => {
    const w = closingWire(asset({ date: "blankTo" }));
    expect("demolishedPublicUseToBefore" in w).toBe(false);
    expect(w.demolishedPublicUseFromBefore).toBe("2024-04-01");
  });

  it("비주택 건축물 철거 행·주택부수토지 카드: 비주택은 하위 칸을 싣지 않고 주택부수토지 카드는 같은 술어로 싣는다(V-15 — 모든 철거 행이 주택)", () => {
    expect(PU_FIELDS.filter((f) => f in closingWire(asset({ card: "otherBuilding" })))).toEqual([]);
    expect(PU_FIELDS.filter((f) => f in closingWire(asset({ card: "housing" })))).toEqual([...PU_FIELDS]);
  });
});

describe("E3f-3 D — ③ 복원 정규화(`migrateAsset`): 허용값·문자열만 보존 · 키 없는 행은 키를 만들지 않는다(R-8 · M-P15)", () => {
  const migrate = (events: unknown[]) => (migrateAsset({ ...BASE, nblOtherStateHistoryMode: "changed", nblOtherStateEvents: events } as unknown as Record<string, unknown>) as unknown as AssetForm).nblOtherStateEvents as unknown as Loose[];

  it("나대지를 닫을 수 있는 행의 허용값 3지선다 · 날짜 문자열은 보존, 허용값·타입 밖은 버린다", () => {
    const out = migrate([
      { kind: "building_built", date: "2020-01-01", propertyTaxTypeBefore: "separate", demolishedPublicUseBefore: "yes", demolishedPublicUsePaidBefore: "unknown", demolishedPublicUseFromBefore: "2024-04-01", demolishedPublicUseToBefore: "2024-12-01" },
      { kind: "tax_type_changed", date: "2021-01-01", propertyTaxTypeBefore: "separate", demolishedPublicUseBefore: "maybe", demolishedPublicUsePaidBefore: 3, demolishedPublicUseFromBefore: 20240401, demolishedPublicUseToBefore: null },
    ]);
    expect(out[0]).toMatchObject({ demolishedPublicUseBefore: "yes", demolishedPublicUsePaidBefore: "unknown", demolishedPublicUseFromBefore: "2024-04-01", demolishedPublicUseToBefore: "2024-12-01" });
    for (const f of PU_FIELDS) expect(f in out[1], f).toBe(false);
  });

  it("철거 행은 나대지를 닫지 않아 남기지 않는다 · 키가 없던 행은 키를 만들지 않는다(구 스냅샷 byte-identical)", () => {
    const out = migrate([
      { kind: "building_removed", date: "2020-01-01", propertyTaxTypeBefore: "separate", demolishedPublicUseBefore: "yes", demolishedPublicUseFromBefore: "2024-04-01" },
      { kind: "building_built", date: "2021-01-01", propertyTaxTypeBefore: "separate", demolishedPermitBefore: "yes", demolishedOtherUseBefore: "yes" },
    ]);
    for (const f of PU_FIELDS) expect(f in out[0], `removed/${f}`).toBe(false);
    for (const f of PU_FIELDS) expect(f in out[1], `built/${f}`).toBe(false);
    expect(JSON.stringify(out[1])).toBe(JSON.stringify({ kind: "building_built", date: "2021-01-01", propertyTaxTypeBefore: "separate", demolishedPermitBefore: "yes", demolishedOtherUseBefore: "yes" }));
  });
});

describe("E3f-3 E — leaf `firstBlankDemolishedFact`·`demolishedRowFactIssue`: 칸 순서(허가 → 건축 외 용도 → 빈집정비 → 공용 사용 → 유료 → 개시일 → 종료일 → 바닥면적)", () => {
  const need = { permit: true, otherUse: true, vacantHouse: true, floorArea: false };
  const ok = { demolishedPermitBefore: "yes", demolishedOtherUseBefore: "yes", demolishedVacantHouseBefore: "yes", demolishedPublicUseBefore: "yes", demolishedPublicUsePaidBefore: "yes", demolishedPublicUseFromBefore: "2024-04-01", demolishedPublicUseToBefore: "2024-12-01" };

  it("앞 칸이 비면 뒤 칸을 가리지 않고 앞 칸이 먼저", () => {
    expect(firstBlankDemolishedFact({ ...ok, demolishedPublicUseFromBefore: "", demolishedPublicUseToBefore: "" }, need)).toBe("demolishedPublicUseFromBefore");
    expect(firstBlankDemolishedFact({ ...ok, demolishedPublicUsePaidBefore: "", demolishedPublicUseFromBefore: "" }, need)).toBe("demolishedPublicUsePaidBefore");
    expect(firstBlankDemolishedFact({ ...ok, demolishedPublicUseBefore: "", demolishedPublicUsePaidBefore: "" }, need)).toBe("demolishedPublicUseBefore");
    expect(firstBlankDemolishedFact({ ...ok, demolishedVacantHouseBefore: "", demolishedPublicUseBefore: "" }, need)).toBe("demolishedVacantHouseBefore");
    expect(firstBlankDemolishedFact(ok, need)).toBeNull();
  });

  it("행 단위 leaf: 철거 행 뒤 나대지 구간에서 하위 칸 결함을 사건 번호·필드·문구로 돌려준다 · 읽지 않으면 null", () => {
    const events = [
      { kind: "building_built", date: "2012-06-01", propertyTaxTypeBefore: "" },
      { kind: "building_removed", date: E.removedOn, propertyTaxTypeBefore: "separate", buildingKindBefore: "house" },
      { kind: "tax_type_changed", date: E.closeOn, propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", ...ok, demolishedPublicUseToBefore: "" },
    ];
    const i = (historyRead: boolean) => demolishedRowFactIssue({ events, fallbackHasBuilding: true, tailKind: undefined, historyRead: () => historyRead, zoneType: "general_residential" });
    expect(i(true)).toMatchObject({ index: 2, field: "demolishedPublicUseToBefore" });
    expect(i(true)!.message).toContain("3번째 사건 행");
    expect(i(false)).toBeNull();
  });
});
