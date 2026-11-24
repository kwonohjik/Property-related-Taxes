/**
 * NBL-STATE-HISTORY-E3-③ B (E3d-2) — 엔진 계획서 §6.2 B 행(주택 철거 후 나대지 양도 — 기타토지 카드 · 철거 행 `buildingKindBefore = "house"` + `houseFootprintBefore`)을 **raw 입력(= 와이어 칸)** 으로 옮긴 표.
 * 엔진 단위(`mapAssetToNblInput` → `judgeNonBusinessLand`)와 route 관통(`POST /api/calc/transfer`)이 같은 표를 쓴다.
 *
 * 공통(§6.2): 기타토지(잡종지) **1,000㎡**(`acquisitionArea`) · 일반주거 · **수도권 밖**(`nblIsMetropolitanArea = no` → 5배) · 양도가 10억 · 취득가 3억 · `makeMockRates` · 기본 취득 2014-01-01 → 양도 2024-01-01(소유 3,651일).
 * 꼬리: 마지막 사건이 신축이면 «건축물 있음 + 별도합산(바닥면적 250㎡ × 4배 = 1,000㎡ 이내)», 철거이면 «나대지 + 종합합산». 철거 행의 정착면적은 별도 표기가 없으면 **200㎡**(허용 1,000㎡ → 이내).
 *
 * 기대값(오라클) 출처 — **«위장 실측»**: 같은 구간 구조를 현행 엔진에 `propertyTaxTypeBefore = separate`(주택 구간을 별도합산으로 위장)로 넣어 얻은 값이 E2 표(`E2_ROWS`)의 같은 id 행이다.
 * 배율 이내 판정된 주택 구간은 사업용 구간 구조가 같아 **같은 eff·판정·세액**을 내야 한다(Anchor 8). `e2` 열이 그 짝이다. 초과·모름 행은 «모름»(`propertyTaxTypeBefore = ""`) 짝 — E2 R3(eff 0).
 * 배율 경계 수치(허용 면적·초과 면적)는 `getHousingMultiplier → areaTimes → judgeAreaLimit` 직접 호출 실측이다(E3d-0 `E3D_HOUSE_LIMIT_ROWS`).
 */
import { E2_ROWS } from "./nbl-state-history-e2-table";
import type { GraceSpec } from "./nbl-state-history-e2-table";

export type { GraceSpec };

export interface BEv {
  kind: "building_built" | "building_removed";
  date: string;
  /** 철거 행 — 철거된 건축물 종류 = 주택(기본 true). `false` = 주택 아닌 건축물(종류 칸 없음 — 종전 `propertyTaxTypeBefore` 사슬). */
  house?: boolean;
  /** 철거 행 정착면적(㎡ 문자열). 기본 "200". `undefined`가 아니라 `""`이면 빈칸. */
  fp?: string;
  /** 주택 아닌 철거 행의 철거 직전 재산세 구분(기본 `separate`). */
  taxBefore?: "" | "separate" | "special_sum" | "exempt" | "comprehensive";
}

export type BOutcome = "within" | "exceeded" | "unconfirmed";

export interface E3dBRow {
  id: string;
  scenario: string;
  acq?: string;
  transfer?: string;
  zone?: "general_residential" | "green" | "management" | "undesignated";
  area?: string;
  /** 수도권 여부 — 기본 "no". `undefined` 키를 보내지 않으려면 `metroOmit`. */
  metro?: "yes" | "no" | "unknown" | "";
  metroOmit?: boolean;
  events: readonly BEv[];
  grace?: readonly GraceSpec[];
  /** 주택 구간별 판정(철거 행 순서). */
  outcomes: readonly BOutcome[];
  expect: { nonBusiness: boolean; eff: number; total: number; graceDays?: number; tax?: number };
  /** 같은 구조의 E2 위장 행 id(Anchor 8 — 같은 eff·판정·세액) — 이내 행만. */
  e2?: string;
}

const B = 198_210_000;
const N = 253_960_000;

const rm = (date: string, fp = "200", extra: Partial<BEv> = {}): BEv => ({ kind: "building_removed", date, house: true, fp, ...extra });
const built = (date: string): BEv => ({ kind: "building_built", date });

/** E2 철거 행 중 «별도합산 위장» 행을 B 주택 행으로 옮긴다 — 정착면적 200(이내). */
function fromE2(id: string, over: Partial<E3dBRow> = {}): E3dBRow {
  const e = E2_ROWS.find((r) => r.id === id)!;
  return {
    id: `B-${id}`,
    scenario: `E2 ${id}의 B 짝 — ${e.scenario}`,
    acq: e.acq,
    transfer: e.transfer,
    events: e.events.map(([kind, date]) => (kind === "building_removed" ? rm(date) : built(date))),
    grace: e.grace,
    outcomes: e.events.filter(([k]) => k === "building_removed").map(() => "within" as const),
    expect: { nonBusiness: e.expect.nonBusiness, eff: e.expect.eff, total: e.expect.total, ...(e.expect.graceDays !== undefined ? { graceDays: e.expect.graceDays } : {}), ...(e.expect.tax !== undefined ? { tax: e.expect.tax } : {}) },
    e2: id,
    ...over,
  };
}

/** 이내(within) 행 — E2 위장 행과 같은 값이어야 한다(Anchor 8). */
export const E3D_B_WITHIN_E2_IDS = [
  "M1", "M2", "M3", "M4", "M4b", "M5", "G2", "M17b", "Z-1462", "Z-1461", "Z-1460", "R1a", "R1b", "GA-730", "GA-731", "R2", "S1", "P2",
  "M14-1", "M14-2", "M14-3", "M16c-bare", "M16",
] as const;

/** 계획서 §6.2 — B0~B19 중 수치가 있는 행. B8·B9·B10·B11·B12·B15·B16·B17·B18·B19는 구조·게이트 행이라 테스트 본문이 직접 단언한다. */
export const E3D_B_ROWS: readonly E3dBRow[] = [
  ...E3D_B_WITHIN_E2_IDS.map((id) => fromE2(id)),
  // ── 배율 경계(§6.2 «배율 판정 경계» · 토지 1,000㎡) — 0.05㎡ 차이가 −55,750,000 ↔ 0을 가른다(절벽 — Q-5 (나)) ──
  { id: "B1b", scenario: "B1에서 정착면적 199.99(허용 999.95 → 초과 0.05㎡) — Q-5 (나): 그 구간 비사업용 접기(R3 «모름»과 같은 수)", events: [rm("2021-01-01", "199.99")], outcomes: ["exceeded"], expect: { nonBusiness: true, eff: 0, total: 3651, tax: N } },
  { id: "B1-200.00", scenario: "B1 경계: 정착면적 200.00(허용 1,000.00 이내 — 같음 포함)", events: [rm("2021-01-01", "200.00")], outcomes: ["within"], expect: { nonBusiness: false, eff: 2556, total: 3651, tax: B } },
  { id: "B1c-333.34", scenario: "수도권 3배: 정착면적 333.34(허용 1,000.02 이내) → B1과 같은 수", metro: "yes", events: [rm("2021-01-01", "333.34")], outcomes: ["within"], expect: { nonBusiness: false, eff: 2556, total: 3651, tax: B } },
  { id: "B1c-333.33", scenario: "수도권 3배: 정착면적 333.33(허용 999.99 → 초과 0.01㎡) → 접힘", metro: "yes", events: [rm("2021-01-01", "333.33")], outcomes: ["exceeded"], expect: { nonBusiness: true, eff: 0, total: 3651, tax: N } },
  // ── B6·B7·B7g — 모름·초과는 같은 접힘(E2 R3과 같은 수) ──
  { id: "B6", scenario: "정착면적 빈칸(UI는 ⑧ 차단 — 직접 API만) — 그 구간 접힘(E2 R3: eff 0)", events: [rm("2021-01-01", "")], outcomes: ["unconfirmed"], expect: { nonBusiness: true, eff: 0, total: 3651, tax: N } },
  { id: "B7", scenario: "정착면적 100(허용 500 < 토지 1,000 → 초과 500㎡) — B6(모름)과 같은 수: «초과»가 «모름»보다 유리하지 않다", events: [rm("2021-01-01", "100")], outcomes: ["exceeded"], expect: { nonBusiness: true, eff: 0, total: 3651, tax: N } },
  { id: "B7g", scenario: "B7 + 9호 유예(철거일 앵커) — Q-8 (가): 유예는 그대로 합집합(730일) + EXCEEDED_GRACE 고지 · 직전 3년 비사업 365(나목 미충족)라 사업용(E2 M2와 같은 구조 — 접힌 주택 구간 자체는 사업일수에 안 든다)", events: [rm("2021-01-01", "100")], grace: [{ reasonCode: "demolition", anchorDate: "2021-01-01" }], outcomes: ["exceeded"], expect: { nonBusiness: false, eff: 730, total: 3651, graceDays: 730, tax: B } },
  // ── B15 — 직접 API: 비양수·비수치·정착 > 토지는 400 없이 접힘(Y-31 — «이내»로 읽지 않는다) ──
  { id: "B15-0", scenario: "정착면적 0", events: [rm("2021-01-01", "0")], outcomes: ["unconfirmed"], expect: { nonBusiness: true, eff: 0, total: 3651, tax: N } },
  { id: "B15-neg", scenario: "정착면적 −5", events: [rm("2021-01-01", "-5")], outcomes: ["unconfirmed"], expect: { nonBusiness: true, eff: 0, total: 3651, tax: N } },
  { id: "B15-abc", scenario: "정착면적 «abc»(비수치)", events: [rm("2021-01-01", "abc")], outcomes: ["unconfirmed"], expect: { nonBusiness: true, eff: 0, total: 3651, tax: N } },
  { id: "B15-1200", scenario: "정착면적 1,200 > 토지 1,000 — «이내»가 아니라 접힘(허용 면적 ≥ 토지 면적이라 자동 이내가 되는 오입력)", events: [rm("2021-01-01", "1200")], outcomes: ["unconfirmed"], expect: { nonBusiness: true, eff: 0, total: 3651, tax: N } },
  // ── B14 — 주택 → 철거 → 건물(비주택·별도합산) 신축 → 양도(꼬리 건축물) + 나대지 갭 ──
  { id: "B14", scenario: "주택 2014-01-02~철거 2019-01-01(이내) → 나대지 갭 → 건물(별도합산) 신축 2021-01-01 → 양도(꼬리 건축물)", events: [rm("2019-01-01"), built("2021-01-01")], outcomes: ["within"], expect: { nonBusiness: false, eff: 2920, total: 3651 } },
];

/** 행 → raw 와이어 칸(`nonBusinessLandRaw`). `disguise`: `separate` = 같은 철거 행을 «별도합산 위장»으로(Anchor 8) · `unknown` = «철거 직전 재산세 구분 모름»(R3 짝). */
export function e3dBRowRaw(row: E3dBRow, opts: { disguise?: "separate" | "unknown"; history?: boolean } = {}): Record<string, unknown> {
  const last = row.events[row.events.length - 1];
  const builtTail = last.kind === "building_built";
  const wire = (ev: BEv): Record<string, unknown> => {
    if (ev.kind === "building_built") return { kind: ev.kind, date: ev.date };
    if (opts.disguise) return { kind: ev.kind, date: ev.date, propertyTaxTypeBefore: opts.disguise === "separate" ? "separate" : "" };
    if (ev.house === false) return { kind: ev.kind, date: ev.date, propertyTaxTypeBefore: ev.taxBefore ?? "separate" };
    return { kind: ev.kind, date: ev.date, buildingKindBefore: "house", houseFootprintBefore: ev.fp ?? "200" };
  };
  return {
    nblUseDetailedJudgment: true,
    nblLandType: "other_land",
    nblZoneType: row.zone ?? "general_residential",
    acquisitionArea: row.area ?? "1000",
    acquisitionDate: row.acq ?? "2014-01-01",
    transferDate: row.transfer ?? "2024-01-01",
    ...(row.metroOmit ? {} : { nblIsMetropolitanArea: row.metro ?? "no" }),
    nblOtherPropertyTaxType: builtTail ? "separate" : "comprehensive",
    nblOtherHasBuilding: builtTail,
    nblOtherBuildingFloorArea: builtTail ? "250" : "",
    ...((opts.history ?? true) ? { nblOtherStateHistoryMode: "changed", nblOtherStateEvents: row.events.map(wire) } : {}),
    nblGracePeriods: (row.grace ?? []).map((g) => ({ ...g })),
  };
}
