/**
 * NBL-STATE-HISTORY-E3-⑤ E3f-2 — 나대지 구간 근거 «철거ㆍ멸실»(`demolished`)의 **한시 창** 엔진 anchor.
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-5-demolition-temp-status.engine.plan.md v4 §4 · §5.1~§5.8 · §7.1(K-1~K-10c · K-24~K-27) · §7.5(끝 경계 정정) · §7.4(mutation)
 * 표: `_helpers/nbl-state-history-e3-5-table.ts`(오라클 `biz` — 아래 «창 재도출»로 정정한 값) + 이 파일의 보조 시료.
 *
 * ## 창 재도출 (#3641 «끝» 경계 정정 → E3f-2)
 * 「지방세기본법」 §23 → 「민법」 §157(초일불산입 — 기산일 = 철거일 다음날) · §160②③(만료일). 철거일 r, 한시 기간 W개월: 기간은 r 다음날부터 `periodEndFromMonths(r, W)` **당일까지**다.
 *   · 게이트(Q-4): 과세기준일 s(6.1.) 중 `r ≤ s < 구간 끝`이고 s가 W(s) 기간 안(만료일 당일까지)인 것이 하나라도 있어야 한다 — 계획서 v4의 `s < r + W`(만료일 당일 «지남»)는 하루 불리했다.
 *   · 창 = `[r, 만료일 + 1일)` — 철거일 **당일부터** 만료일 당일까지(길이 = W개월 + 1일). 철거일 당일은 이력 구간 관례(`[사건일, 다음 사건일)`)로 나대지 구간의 첫날인데 그날은 철거 전 건축물 부속토지이거나
 *     철거된 날 기준 한시 안이라 어느 쪽이든 별도합산 기간이다 → 창이 r + 1일에서 시작하면 건축물 구간(`[…, r)`)과 창 사이에 하루가 빈다. r에서 시작하면 겹치지도 비지도 않는다(아래 «하루 중복·누락 없음» anchor).
 *   바뀐 오라클 행(전 → 후): K-1 774 → 775 · K-2a(철거 2022-12-01) 게이트 실패 578 비사업용 → **통과 761 사업용** · K-2b 761 → 762 · K-5 3195 → 3196 · K-7/K-7a 1462 → 1463 · (신규 K-2c 철거 2022-11-30 = 게이트 실패 경계 577 비사업용)
 *   K-8(943) · K-3(425)은 같다.
 *
 * 구성
 *   A  leaf `demolishedRequiredFacts` — 사실 칸 요구 술어(후보 과세기준일 시행본 · 주택/비주택 · 읽음 게이트)
 *   B  leaf `demolishedStatusWindow` — 게이트·창 경계(민법 만료일) · 시행본별 요건 · 접힘 우선순위 · 구간 자르기
 *   C  엔진 raw → ⑭ → 판정·세액 — §7.1 오라클 행(K-1~K-10c · K-24~K-27) · echo · 고지 · 세액 효과 · 하루 중복·누락 없음
 *   D  형제 안전망 — 철거 행 앞·없는 구간의 `demolished`는 계속 접힘(V-7) · `eventBasisOptions` 종전 선택지 · 철거 행 술어
 */
import { describe, it, expect } from "vitest";
import { E35_B, E35_N, e35BareDecl, e35Base } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-5-table";
import { evalDayRow } from "@/__tests__/tax-engine/_helpers/nbl-state-history-day-table";
import { baseTransferInput, makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { periodEndFromMonths } from "@/lib/tax-engine/civil-period";
import { demolishedRequiredFacts, demolishedStatusWindow } from "@/lib/tax-engine/non-business-land/demolished-temp-status";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import {
  BARE_DEMOLISHED_FOLD_NOTICE,
} from "@/lib/tax-engine/non-business-land/state-history-echo";
import {
  NBL_STATE_HISTORY_BARE_ACCEPTED_NOTICE,
  NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE,
  NBL_STATE_HISTORY_BARE_DEMOLISHED_ACCEPTED_NOTICE,
  NBL_STATE_HISTORY_BARE_DEMOLISHED_HOUSE_AREA_NOTICE,
  NBL_STATE_HISTORY_BARE_DEMOLISHED_VACANT_HOUSE_UNCONFIRMED_NOTICE,
} from "@/lib/tax-engine/nbl-confirm-notices";
import {
  bareIntervalTaxTypeText,
  demolishedRemovedKindOf,
  eventBasisOptions,
  eventOffersDemolished,
  removalDateFor,
  removalRowIndexFor,
  resolveBareDeclaration,
} from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { addDays, parseISO } from "@/lib/tax-engine/utc-date";

const d = (s: string) => parseISO(s);
const iso = (x: Date) => x.toISOString().slice(0, 10);
const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const fromRaw = (raw: Record<string, unknown>) => buildNblEngineInput(raw as never)!;
const judge = (raw: Record<string, unknown>) => judgeNonBusinessLand(fromRaw(raw), R);
function taxOf(input: NonBusinessLandInput): number {
  return calculateTransferTax(
    baseTransferInput({ propertyType: "land", transferPrice: 1_000_000_000, acquisitionPrice: 300_000_000, acquisitionDate: input.acquisitionDate, transferDate: input.transferDate, isOneHousehold: false, nonBusinessLandDetails: input }),
    makeMockRates(),
  ).calculatedTax;
}
const oracle = (r: { acq?: string; transfer?: string; biz: ReadonlyArray<readonly [string, string]>; grace?: ReadonlyArray<readonly [string, string]> }) =>
  evalDayRow({ acq: r.acq ?? "2014-01-01", transfer: r.transfer ?? "2024-01-01", biz: r.biz, grace: r.grace });

// ── 시료 ─────────────────────────────────────────────────────────────────────

/** 닫는 행(마지막 사건)의 사실 칸을 정한다 — `e35BareDecl`(건물 2021-06-02~철거 `removedOn` · 신축 `builtOn`)의 `facts` 인자(기본 `FACTS`를 대체한다). */
const FACTS = { demolishedPermitBefore: "yes", demolishedOtherUseBefore: "no", demolishedFloorAreaBefore: "250" } as const;
const decl = (removedOn: string, facts: Record<string, unknown> = FACTS, over: Record<string, unknown> = {}, bldStart = "2021-06-02", builtOn = "2023-12-01"): Record<string, unknown> =>
  e35BareDecl(removedOn, over, bldStart, builtOn, facts);

/** 주택 철거 행(정착면적 400㎡ — 토지 1,000㎡의 3배 이상 허용이라 배율 이내) 뒤 구분 변경 행이 나대지를 닫는 시료(K-7 · K-25). */
function houseDecl(over: { removedOn: string; closeOn: string; transfer: string; acq?: string; bldStart?: string }, facts: Record<string, unknown>, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return e35Base({
    acquisitionDate: over.acq ?? "2018-06-01",
    transferDate: over.transfer,
    nblOtherPropertyTaxType: "comprehensive",
    nblOtherHasBuilding: false,
    nblIsMetropolitanArea: "no",
    nblOtherStateHistoryMode: "changed",
    nblOtherStateEvents: [
      { kind: "building_built", date: over.bldStart ?? "2020-06-01" },
      { kind: "building_removed", date: over.removedOn, propertyTaxTypeBefore: "separate", buildingKindBefore: "house", houseFootprintBefore: "400" },
      { kind: "tax_type_changed", date: over.closeOn, propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", ...facts },
    ],
    ...extra,
  });
}
const HOUSE_OK = { demolishedPermitBefore: "yes", demolishedOtherUseBefore: "no" } as const;
const NINE = (anchorDate: string) => ({ nblGracePeriods: [{ reasonCode: "demolition", anchorDate }] });

const intervals = (raw: Record<string, unknown>) => judge(raw).periodEvaluation?.stateHistory?.intervals ?? [];
const bare = (raw: Record<string, unknown>) => intervals(raw).find((x) => !x.hasBuilding && x.basis === "demolished")!;
const days = (a: string, b: string) => Math.round((d(b).getTime() - d(a).getTime()) / 86_400_000);

// ── A. leaf `demolishedRequiredFacts` ─────────────────────────────────────────

describe("E3f-2 A — `demolishedRequiredFacts`: 어떤 사실 칸이 필요한가 (노출 ≡ 필수 — 후보 과세기준일 시행본 · 종류 · 읽음 게이트)", () => {
  const need = (removedOn: string, end: string, kind: "house" | "building", historyRead = true) =>
    demolishedRequiredFacts({ removedOn: d(removedOn), end: d(end), kind, historyRead });
  const set = (o: ReturnType<typeof need>) => [o.permit && "permit", o.otherUse && "otherUse", o.vacantHouse && "vacantHouse", o.floorArea && "floorArea"].filter(Boolean);

  it.each([
    // K-5: 후보 과세기준일 2018-06-01만(2016.6.1.~2019.5.31. 시행본) → 허가·건축 외 용도·바닥면적 모두 묻지 않는다
    ["K-5 2018 시행본만", "2018-03-01", "2019-12-01", "building", []],
    ["2019.6.1. 시행본(허가 요건)", "2019-05-01", "2020-01-01", "building", ["permit"]],
    ["K-1 2023-06-01만 — 허가만(건축 외 용도·면적 문언은 2024.6.1.~)", "2022-12-15", "2023-12-01", "building", ["permit"]],
    ["2024.6.1. 시행본 비주택 건축물 — 허가·건축 외 용도·바닥면적(빈집 아님)", "2024-01-15", "2024-09-01", "building", ["permit", "otherUse", "floorArea"]],
    ["2024.6.1. 시행본 주택 — 허가·건축 외 용도·빈집정비(바닥면적 칸 없음)", "2024-01-15", "2024-09-01", "house", ["permit", "otherUse", "vacantHouse"]],
    ["K-3 6개월 안에 과세기준일 없음 → 후보 없음 = 칸 없음(never)", "2022-07-01", "2023-12-01", "building", []],
    ["K-7 철거 2021-06-02 주택 — 빈집 3년만 2024-06-01에 닿는다(일반 W로는 후보 없음) → 사실 3칸", "2021-06-02", "2024-08-01", "house", ["permit", "otherUse", "vacantHouse"]],
    ["같은 철거 비주택 건축물 — 6개월로는 후보 없음(빈집은 주택만)", "2021-06-02", "2024-08-01", "building", []],
  ] as const)("%s", (_s, r, end, kind, expected) => {
    expect(set(need(r, end, kind))).toEqual(expected);
  });

  it("읽음 게이트(UQ-8 (가)): 엔진이 이력을 읽지 않으면 4칸 모두 요구하지 않는다 — 바닥면적만 게이트하고 3지선다만 강요하는 비일관 금지", () => {
    expect(set(need("2024-01-15", "2024-09-01", "building", false))).toEqual([]);
    expect(set(need("2024-01-15", "2024-09-01", "house", false))).toEqual([]);
  });

  it("날짜를 읽을 수 없으면(행 결함이 먼저 막는다) 빈 집합 · 구간 끝이 철거일 이하여도 후보 없음", () => {
    expect(set(demolishedRequiredFacts({ removedOn: undefined, end: d("2024-09-01"), kind: "building", historyRead: true }))).toEqual([]);
    expect(set(demolishedRequiredFacts({ removedOn: d("2024-01-15"), end: new Date(Number.NaN), kind: "building", historyRead: true }))).toEqual([]);
    expect(set(need("2024-01-15", "2024-01-15", "building"))).toEqual([]);
  });

  it("후보 경계: 과세기준일 = 철거일 당일은 후보(r ≤ s) · 구간 끝 당일은 후보 아님(s < end)", () => {
    expect(set(need("2024-06-01", "2024-09-01", "building"))).toEqual(["permit", "otherUse", "floorArea"]);
    expect(set(need("2024-01-15", "2024-06-01", "building"))).toEqual([]);
    expect(set(need("2024-01-15", "2024-06-02", "building"))).toEqual(["permit", "otherUse", "floorArea"]);
  });
});

// ── B. leaf `demolishedStatusWindow` ──────────────────────────────────────────

describe("E3f-2 B — `demolishedStatusWindow`: 게이트·창 경계(민법 §157·§160) · 시행본별 요건 · 접힘 우선순위 · 구간 자르기", () => {
  const OK = { permit: "yes", otherUse: "no", floorArea: 250 } as const;
  const win = (removedOn: string, end: string, o: Partial<Parameters<typeof demolishedStatusWindow>[0]> = {}) =>
    demolishedStatusWindow({ removedOn: d(removedOn), intervalStart: d(o.intervalStart ? iso(o.intervalStart) : removedOn), end: d(end), kind: "building", facts: OK, landArea: 1000, zoneType: "general_residential", ...o, ...(o.intervalStart ? { intervalStart: o.intervalStart } : {}) });

  it("창 = [철거일, 만료일 + 1일) — K-1: 철거 2022-12-15 → 만료일 2023-06-15 → 창 [2022-12-15, 2023-06-16) 183일(철거일 당일 포함 · 만료일 당일 포함)", () => {
    const w = win("2022-12-15", "2023-12-01");
    expect(w).toMatchObject({ kind: "holds", months: 6, vacantHouseExtensionUnconfirmed: false });
    if (w.kind !== "holds") throw new Error("holds");
    expect([iso(w.window.start), iso(w.window.end), days(iso(w.window.start), iso(w.window.end))]).toEqual(["2022-12-15", "2023-06-16", 183]);
    expect(iso(periodEndFromMonths(d("2022-12-15"), 6))).toBe("2023-06-15"); // 만료일 당일까지 안
  });

  it.each([
    // [철거일, 구간 끝, 결과]  — 민법 만료일 경계 쌍(§7.5)
    ["6개월 안 — 철거 2022-12-01: 기산일 12-02 → 만료일 2023-06-01 = 과세기준일 → 게이트 통과(K-2a)", "2022-12-01", "2023-12-01", "holds"],
    ["6개월 밖 — 철거 2022-11-30: 만료일 2023-05-31 < 과세기준일 → 불성립(K-2c)", "2022-11-30", "2023-12-01", "demolished_never_period"],
    ["철거 2022-12-02: 만료일 2023-06-02 ≥ 과세기준일 → 통과(K-2b)", "2022-12-02", "2023-12-01", "holds"],
    ["K-3: 6개월 안에 과세기준일 없음(2022-07-01 → 만료일 2023-01-01)", "2022-07-01", "2023-12-01", "demolished_never_period"],
    ["구간 끝 = 과세기준일 당일이면 그날은 구간 밖(s < end) — 철거 2023-04-01, 신축 2023-06-01", "2023-04-01", "2023-06-01", "demolished_never_period"],
    ["구간 끝 = 과세기준일 다음날이면 s가 구간 안", "2023-04-01", "2023-06-02", "holds"],
    ["과세기준일 = 철거일 당일(r ≤ s) — 철거 2023-06-01은 그날 «6개월이 지나지 아니한»", "2023-06-01", "2023-12-01", "holds"],
  ] as const)("게이트 경계: %s", (_s, r, end, expected) => {
    const w = win(r, end);
    expect(w.kind === "holds" ? "holds" : w.reason).toBe(expected);
  });

  it("월 말일 철거일은 `addMonths`가 아니라 만료 월의 말일이 만료일이다 — 철거 2023-04-30 + 6개월 → 만료일 2023-10-31 → 창 끝 2023-11-01(`addMonths` 2023-10-30이면 하루 불리)", () => {
    const w = win("2023-04-30", "2023-12-01");
    if (w.kind !== "holds") throw new Error("holds");
    expect([iso(w.window.start), iso(w.window.end)]).toEqual(["2023-04-30", "2023-11-01"]);
    // 윤년 말일: 철거 2023-08-31 + 6개월 → 만료일 2024-02-29(윤달 말일) → 창 끝 2024-03-01
    const leap = win("2023-08-31", "2024-12-01", { facts: { permit: "yes", otherUse: "no", floorArea: 250 } });
    // 2023-08-31의 6개월 안에는 과세기준일이 없다(2024-06-01 > 2024-02-29) → 접힘
    expect(leap).toMatchObject({ kind: "fold", reason: "demolished_never_period" });
  });

  it("3년 시행본(주택 + 빈집정비 «예» · 2024.6.1.~): 철거 2021-06-01은 만료일 2024-06-01 = 과세기준일 → 3년 성립(W* 36 · 창 끝 2024-06-02) · 2021-05-31은 만료일 2024-05-31 → 3년 불성립(2021-06-01 과세기준일의 6개월만 — W* 6) (§7.5 경계 쌍)", () => {
    const house = (r: string) => win(r, "2024-08-01", { kind: "house", facts: { permit: "yes", otherUse: "no", vacantHouse: "yes" } });
    const ok = house("2021-06-01");
    expect(ok).toMatchObject({ kind: "holds", months: 36, vacantHouseExtensionUnconfirmed: false });
    if (ok.kind !== "holds") throw new Error("holds");
    expect([iso(ok.window.start), iso(ok.window.end)]).toEqual(["2021-06-01", "2024-06-02"]);
    const out = house("2021-05-31");
    expect(out).toMatchObject({ kind: "holds", months: 6 });
    if (out.kind !== "holds") throw new Error("holds");
    expect(iso(out.window.end)).toBe("2021-12-01"); // 철거 2021-05-31 + 6개월 → 만료일 2021-11-30
    // 철거 2021-06-02부터는 3년만 2024-06-01에 닿는다 — 빈집정비 «예»가 이 셀의 효과 조건(K-7)
    expect(house("2021-06-02")).toMatchObject({ kind: "holds", months: 36 });
  });

  it("빈집정비 «아니오»·«모름»·미선택(Q-8 (나)): 접히지 않고 일반 W만 적용 + 고지 플래그 — 일반 W로 과세기준일이 안 닿으면 never_period", () => {
    for (const vacantHouse of ["no", "unknown", "", undefined] as const) {
      const w = win("2023-12-15", "2024-12-01", { kind: "house", facts: { permit: "yes", otherUse: "no", vacantHouse } });
      expect(w, String(vacantHouse)).toMatchObject({ kind: "holds", months: 6, vacantHouseExtensionUnconfirmed: true }); // 2024-06-01 ≤ 철거 + 6개월(2024-06-15)
    }
    expect(win("2023-12-15", "2024-12-01", { kind: "house", facts: { permit: "yes", otherUse: "no", vacantHouse: "yes" } })).toMatchObject({ kind: "holds", months: 36, vacantHouseExtensionUnconfirmed: false });
    expect(win("2021-06-02", "2024-08-01", { kind: "house", facts: { permit: "yes", otherUse: "no", vacantHouse: "no" } })).toMatchObject({ kind: "fold", reason: "demolished_never_period" });
  });

  it("2026.6.1.~ 일반 W = 12개월(제1호 6개월 → 1년): 철거 2026-03-15 — 만료일 2027-03-15 · 창 끝 2027-03-16", () => {
    const w = win("2026-03-15", "2028-01-01");
    if (w.kind !== "holds") throw new Error("holds");
    expect([w.months, iso(w.window.start), iso(w.window.end)]).toEqual([12, "2026-03-15", "2027-03-16"]);
  });

  it("시행본 요건은 과세기준일 s별: 2024.6.1. 전 s는 건축 외 용도·면적 문언 없음 — 철거 2022-12-15의 2023-06-01은 건축 외 용도 «예»·바닥면적 없음이어도 성립(허가만)", () => {
    expect(win("2022-12-15", "2023-12-01", { facts: { permit: "yes", otherUse: "yes", floorArea: undefined } })).toMatchObject({ kind: "holds" });
    expect(win("2022-12-15", "2023-12-01", { facts: { permit: "unknown", otherUse: "no", floorArea: 250 } })).toMatchObject({ kind: "fold", reason: "demolished_permit" });
    // 2019.6.1. 전 s(2018-06-01만)는 허가 문언도 없다 — K-5
    expect(win("2018-03-01", "2019-12-01", { facts: { permit: "", otherUse: "", floorArea: undefined } })).toMatchObject({ kind: "holds", months: 6 });
  });

  it("접힘 사유 우선순위: 기간(never) → 허가 → 건축 외 용도 → 면적 (한 구간에 하나)", () => {
    const base = { permit: "yes", otherUse: "no", floorArea: 250 } as const;
    const w = (facts: Parameters<typeof demolishedStatusWindow>[0]["facts"]) => win("2024-01-15", "2024-09-01", { facts });
    expect(w(base)).toMatchObject({ kind: "holds" });
    for (const permit of ["no", "unknown", ""] as const) expect(w({ ...base, permit }), permit).toMatchObject({ kind: "fold", reason: "demolished_permit" });
    for (const otherUse of ["yes", "unknown", ""] as const) expect(w({ ...base, otherUse }), otherUse).toMatchObject({ kind: "fold", reason: "demolished_other_use" });
    expect(w({ ...base, permit: "no", otherUse: "yes", floorArea: 100 })).toMatchObject({ reason: "demolished_permit" });
    expect(w({ ...base, otherUse: "yes", floorArea: 100 })).toMatchObject({ reason: "demolished_other_use" });
    expect(w({ ...base, floorArea: 200 })).toMatchObject({ kind: "fold", reason: "demolished_area_exceeded" }); // 200 × 4 = 800 < 1,000
    expect(w({ ...base, floorArea: 250 })).toMatchObject({ kind: "holds" }); // 250 × 4 = 1,000 = 토지 면적 → 이내
    for (const floorArea of [undefined, 0, -1, Number.NaN]) expect(w({ ...base, floorArea }), String(floorArea)).toMatchObject({ kind: "fold", reason: "demolished_area_missing" });
  });

  it("주택 철거 행은 바닥면적을 읽지 않는다(면적 한도 없음 — V-23·V-24): 바닥면적 없음·초과여도 성립", () => {
    for (const floorArea of [undefined, 10]) {
      expect(win("2024-01-15", "2024-09-01", { kind: "house", facts: { permit: "yes", otherUse: "no", vacantHouse: "no", floorArea } })).toMatchObject({ kind: "holds" });
    }
  });

  it("구간 자르기: 창은 [구간 시작, 구간 끝) 안으로 자른다 — 둘째 나대지 구간(철거 → 구분 변경 → 구분 변경)은 같은 철거일 창과의 교집합(K-10c)", () => {
    const w = win("2022-12-15", "2023-09-01", { intervalStart: d("2023-02-01") });
    if (w.kind !== "holds") throw new Error("holds");
    expect([iso(w.window.start), iso(w.window.end)]).toEqual(["2023-02-01", "2023-06-16"]);
    const cut = win("2022-12-15", "2023-06-10"); // 구간 끝이 만료일 전 → 끝에서 자름(과세기준일 2023-06-01 < 끝이라 게이트는 통과)
    if (cut.kind !== "holds") throw new Error("holds");
    expect(iso(cut.window.end)).toBe("2023-06-10");
  });

  it("구간이 한시 만료일 뒤에 시작하면(구간 안 과세기준일이 만료일 뒤) 불성립 `demolished_never_period` — 자른 창이 빈 구간은 만들어지지 않는다", () => {
    expect(win("2022-12-15", "2023-12-01", { intervalStart: d("2023-07-01") })).toMatchObject({ kind: "fold", reason: "demolished_never_period" });
  });

  it("창 시작 = max(철거일, 구간 시작) — 구간 시작이 철거일보다 늦으면(소유 시작 클립 · 둘째 나대지 조각) 구간 시작에서 시작한다", () => {
    const w = win("2018-01-15", "2018-12-01", { intervalStart: d("2018-02-01") });
    expect(w.kind).toBe("holds");
    if (w.kind !== "holds") return;
    expect([iso(w.window.start), iso(w.window.end)]).toEqual(["2018-02-01", "2018-07-16"]);
  });

  it("게이트는 구간 **안의** 과세기준일이다 — 구간 시작 뒤 과세기준일이 없으면(둘째 조각 [2023-02-01, 2023-05-01)) 철거일 뒤 과세기준일이 따로 있어도 `demolished_never_period`", () => {
    expect(win("2022-12-15", "2023-05-01", { intervalStart: d("2023-02-01") })).toMatchObject({ kind: "fold", reason: "demolished_never_period" });
    expect(win("2022-12-15", "2023-07-01", { intervalStart: d("2023-02-01") })).toMatchObject({ kind: "holds" });
    // 과세기준일 2023-06-01이 철거일 뒤·구간 시작 앞이면(구간 시작 2023-06-10) 이 구간에는 과세기준일이 없다 — 만료일(2023-06-15) 전에 시작해도 불성립
    expect(win("2022-12-15", "2023-12-01", { intervalStart: d("2023-06-10") })).toMatchObject({ kind: "fold", reason: "demolished_never_period" });
    expect(win("2022-12-15", "2023-12-01", { intervalStart: d("2023-06-01") })).toMatchObject({ kind: "holds" }); // 구간 시작 당일 = 과세기준일은 구간 안
    expect(demolishedRequiredFacts({ removedOn: d("2022-12-15"), intervalStart: d("2023-06-10"), end: d("2023-12-01"), kind: "building", historyRead: true })).toEqual({ permit: false, otherUse: false, vacantHouse: false, floorArea: false });
  });
});

// ── C. 엔진 raw → ⑭ → 판정·세액 ───────────────────────────────────────────────

describe("E3f-2 C — §7.1 오라클 행: raw → ⑭ → 판정·세액 (오라클 = `meetsPeriodCriteria`에 창 구간 직접)", () => {
  it("K-1: 철거 2022-12-15 · 신축 2023-12-01 — 창 [2022-12-15, 2023-06-16) → 사업용 775/3,651 · B(198,210,000) — 창 없음 비사업용 592 · N(253,960,000)", () => {
    const raw = decl("2022-12-15");
    const o = oracle({ biz: [["2021-06-02", "2022-12-15"], ["2022-12-15", "2023-06-16"], ["2023-12-01", "2024-01-01"]] });
    expect([o.meets, o.effectiveBusinessDays]).toEqual([true, 775]);
    const j = judge(raw);
    expect([j.isNonBusinessLand, j.effectiveBusinessDays, j.totalOwnershipDays]).toEqual([false, 775, 3651]);
    expect(taxOf(fromRaw(raw))).toBe(E35_B);
    const noWindow = judge(decl("2022-12-15", { ...FACTS, demolishedPermitBefore: "unknown" }));
    expect([noWindow.isNonBusinessLand, noWindow.effectiveBusinessDays]).toEqual([true, 592]);
    expect(taxOf(fromRaw(decl("2022-12-15", { ...FACTS, demolishedPermitBefore: "unknown" })))).toBe(E35_N);
  });

  it("K-1 echo: 구간 행 — 한시 창(구간 안으로 자름) · 기간 6개월 · 철거된 건축물 종류 · 사업용 183일 · 구분 «별도합산»(accepted) — 구간 전체가 사업용이 아니다", () => {
    const iv = bare(decl("2022-12-15"));
    expect(iv).toMatchObject({ hasBuilding: false, propertyTaxType: "separate", basisOutcome: "accepted", basis: "demolished", declaredPropertyTaxType: "separate", temporaryStatusMonths: 6, temporaryStatusRemovedKind: "building", businessDays: 183, days: 351, business: false });
    expect([iso(iv.temporaryStatusWindow!.start), iso(iv.temporaryStatusWindow!.end)]).toEqual(["2022-12-15", "2023-06-16"]);
    expect("foldReason" in iv).toBe(false);
    expect("vacantHouseExtensionUnconfirmed" in iv).toBe(false);
    expect(bareIntervalTaxTypeText(iv)).toBe("별도합산(나대지 — 철거·멸실 근거 · 한시 기간만)");
    expect(bareIntervalTaxTypeText(bare(decl("2022-11-30")))).toContain("철거 후 한시 기간 안에 과세기준일 없음");
  });

  it("K-2: 철거 2022-12-01은 게이트 통과(만료일 당일 = 과세기준일) → 사업용 761 · B / 2022-12-02 → 762 / 2022-11-30 → 불성립 577 · N (K-2c 경계 쌍)", () => {
    const a = judge(decl("2022-12-01"));
    expect([a.isNonBusinessLand, a.effectiveBusinessDays]).toEqual([false, 761]);
    expect(taxOf(fromRaw(decl("2022-12-01")))).toBe(E35_B);
    const b = judge(decl("2022-12-02"));
    expect([b.isNonBusinessLand, b.effectiveBusinessDays]).toEqual([false, 762]);
    const c = judge(decl("2022-11-30"));
    expect([c.isNonBusinessLand, c.effectiveBusinessDays]).toEqual([true, 577]);
    expect(taxOf(fromRaw(decl("2022-11-30")))).toBe(E35_N);
    expect(bare(decl("2022-11-30"))).toMatchObject({ basisOutcome: "unconfirmed", foldReason: "demolished_never_period", propertyTaxType: "comprehensive" });
    // 오라클 대조(창은 민법 만료일 당일까지)
    expect(oracle({ biz: [["2021-06-02", "2022-12-01"], ["2022-12-01", "2023-06-02"], ["2023-12-01", "2024-01-01"]] }).effectiveBusinessDays).toBe(761);
    expect(oracle({ biz: [["2021-06-02", "2022-12-02"], ["2022-12-02", "2023-06-03"], ["2023-12-01", "2024-01-01"]] }).effectiveBusinessDays).toBe(762);
  });

  it("K-3: 6개월 안에 과세기준일 없음(2022-07-01) → 접음 `demolished_never_period` · 425 비사업용 · 칸을 요구하지 않는 시료 — 사실 칸이 비어도 같은 결과", () => {
    for (const facts of [FACTS, {}]) {
      const raw = decl("2022-07-01", facts);
      const j = judge(raw);
      expect([j.isNonBusinessLand, j.effectiveBusinessDays]).toEqual([true, 425]);
      expect(bare(raw)).toMatchObject({ foldReason: "demolished_never_period", basisOutcome: "unconfirmed" });
    }
  });

  it("K-4: 허가·사용승인 «아니오»·«모름»·미선택(엔진 안전망) → `demolished_permit` 접음 · 592 비사업용 · N", () => {
    for (const permit of ["no", "unknown", ""]) {
      const raw = decl("2022-12-15", { ...FACTS, demolishedPermitBefore: permit });
      expect([judge(raw).isNonBusinessLand, judge(raw).effectiveBusinessDays], permit).toEqual([true, 592]);
      expect(bare(raw)).toMatchObject({ foldReason: "demolished_permit" });
      expect(taxOf(fromRaw(raw))).toBe(E35_N);
    }
  });

  it("K-5: 철거 2018-03-01 · 신축 2019-12-01 — 후보 과세기준일 2018-06-01만(허가·건축 외 용도·바닥면적 칸 요구 없음 — 사실 칸이 비어도 성립) · 창 [2018-03-01, 2018-09-02) 185일 · 사업용 3,196", () => {
    const raw = e35Base({
      nblOtherPropertyTaxType: "separate", nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "250", nblOtherStateHistoryMode: "changed",
      nblOtherStateEvents: [
        { kind: "building_removed", date: "2018-03-01", propertyTaxTypeBefore: "separate" },
        { kind: "building_built", date: "2019-12-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished" },
      ],
    });
    const j = judge(raw);
    expect([j.isNonBusinessLand, j.effectiveBusinessDays, j.totalOwnershipDays]).toEqual([false, 3196, 3651]);
    expect(oracle({ biz: [["2014-01-02", "2018-03-01"], ["2018-03-01", "2018-09-02"], ["2019-12-01", "2024-01-01"]] }).effectiveBusinessDays).toBe(3196);
    expect(taxOf(fromRaw(raw))).toBe(E35_B);
    const iv = bare(raw);
    expect([iso(iv.temporaryStatusWindow!.start), iso(iv.temporaryStatusWindow!.end), iv.businessDays]).toEqual(["2018-03-01", "2018-09-02", 185]);
  });

  it("K-6: 후보 과세기준일 ≥ 2024.6.1. + 건축 외 용도 «예»·«모름»·미선택 → `demolished_other_use` 접음", () => {
    for (const otherUse of ["yes", "unknown", ""]) {
      const raw = decl("2024-01-15", { ...FACTS, demolishedOtherUseBefore: otherUse }, { transferDate: "2024-12-01" }, "2021-06-02", "2024-09-01");
      expect(bare(raw), otherUse).toMatchObject({ foldReason: "demolished_other_use", basisOutcome: "unconfirmed" });
    }
    // 같은 시료 정상 응답은 성립(허가 예 · 건축 외 용도 아니오 · 바닥면적 250 × 4 = 1,000 이내) — 창 [2024-01-15, 2024-07-16)
    const ok = decl("2024-01-15", FACTS, { transferDate: "2024-12-01" }, "2021-06-02", "2024-09-01");
    const iv = bare(ok);
    expect([iso(iv.temporaryStatusWindow!.start), iso(iv.temporaryStatusWindow!.end)]).toEqual(["2024-01-15", "2024-07-16"]);
  });

  it("K-9: 바닥면적 × 배율 < 토지 면적(2024.6.1.~ 시행본): 200㎡(× 4 = 800 < 1,000) → `demolished_area_exceeded` 구간 전체 접음(안분 없음) · 250 → 성립 · 빈칸 → `demolished_area_missing`", () => {
    const at = (floor: string) => decl("2024-01-15", { ...FACTS, demolishedFloorAreaBefore: floor }, { transferDate: "2024-12-01" }, "2021-06-02", "2024-09-01");
    expect(bare(at("200"))).toMatchObject({ foldReason: "demolished_area_exceeded", businessDays: 0, propertyTaxType: "comprehensive" });
    expect(bare(at("250"))).toMatchObject({ basisOutcome: "accepted", businessDays: 183 });
    expect(bare(at(""))).toMatchObject({ foldReason: "demolished_area_missing" });
    expect(judge(at("200")).warnings).toContain(BARE_DEMOLISHED_FOLD_NOTICE.demolished_area_exceeded);
    expect(judge(at("200")).warnings).not.toContain(NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE);
  });

  it("[연혁 정정 — 계획서 K-9와 다른 점] 2024.6.1. 전 시행본만 닿는 구간(철거 2022-12-15 → 과세기준일 2023-06-01)은 면적 범위 문언이 없어 바닥면적 200㎡여도 성립 — #3641 `demolishedAreaClauseApplies`와 같은 연혁", () => {
    const raw = decl("2022-12-15", { demolishedPermitBefore: "yes", demolishedOtherUseBefore: "no", demolishedFloorAreaBefore: "200" });
    expect(bare(raw)).toMatchObject({ basisOutcome: "accepted", businessDays: 183 });
  });

  it("K-7 빈집 셀: 주택 철거 2021-06-02(정착면적 400 · 배율 이내) · 닫는 행 2024-08-01(빈집정비 «예») → 창 [2021-06-02, 2024-06-03) 1,097일 · 사업용 1,463/2,283 · 9호 단독은 비사업용 1,096", () => {
    const raw = houseDecl({ removedOn: "2021-06-02", closeOn: "2024-08-01", transfer: "2024-09-01" }, { ...HOUSE_OK, demolishedVacantHouseBefore: "yes" });
    const j = judge(raw);
    expect([j.isNonBusinessLand, j.effectiveBusinessDays, j.totalOwnershipDays]).toEqual([false, 1463, 2283]);
    expect(oracle({ acq: "2018-06-01", transfer: "2024-09-01", biz: [["2020-06-01", "2021-06-02"], ["2021-06-02", "2024-06-03"]] })).toMatchObject({ meets: true, effectiveBusinessDays: 1463 });
    const iv = bare(raw);
    expect([iso(iv.temporaryStatusWindow!.start), iso(iv.temporaryStatusWindow!.end), iv.temporaryStatusMonths, iv.temporaryStatusRemovedKind]).toEqual(["2021-06-02", "2024-06-03", 36, "house"]);
    expect(j.warnings).toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_HOUSE_AREA_NOTICE);
    // 9호 단독(한시 근거 없음)은 비사업용 — 이 셀이 판정이 뒤집히는 유일한 셀이다(계획서 §3.3)
    const nineOnly = judge(houseDecl({ removedOn: "2021-06-02", closeOn: "2024-08-01", transfer: "2024-09-01" }, {}, NINE("2021-06-02")));
    expect([nineOnly.isNonBusinessLand, nineOnly.effectiveBusinessDays]).toEqual([true, 1096 + 0]);
  });

  it("K-7a/K-7b/K-7c: 9호와 합집합(1,463 — 9호 단독 1,096보다 넓다) · 빈집정비 «아니오»·«모름»은 일반 W로 과세기준일이 안 닿아 접음(비사업용 366) · 양도 2025-03-21(9호 5년)은 창과 9호의 합집합", () => {
    const yes = { ...HOUSE_OK, demolishedVacantHouseBefore: "yes" };
    const withNine = judge(houseDecl({ removedOn: "2021-06-02", closeOn: "2024-08-01", transfer: "2024-09-01" }, yes, NINE("2021-06-02")));
    expect([withNine.isNonBusinessLand, withNine.effectiveBusinessDays]).toEqual([false, 1463]);
    for (const v of ["no", "unknown", ""]) {
      const raw = houseDecl({ removedOn: "2021-06-02", closeOn: "2024-08-01", transfer: "2024-09-01" }, { ...HOUSE_OK, demolishedVacantHouseBefore: v });
      expect([judge(raw).isNonBusinessLand, judge(raw).effectiveBusinessDays], v).toEqual([true, 366]);
      expect(bare(raw), v).toMatchObject({ foldReason: "demolished_never_period" });
    }
    const c = judge(houseDecl({ removedOn: "2021-06-02", closeOn: "2024-08-01", transfer: "2025-03-21" }, yes));
    expect([c.isNonBusinessLand, c.effectiveBusinessDays, c.totalOwnershipDays]).toEqual([false, 1463, 2484]);
  });

  it("K-8: K-1 + 9호 2년 — 창 ∪ 9호 = 9호 단독과 같다(943 · 이중 계산 없음)", () => {
    const raw = decl("2022-12-15", FACTS, NINE("2022-12-15"));
    expect([judge(raw).isNonBusinessLand, judge(raw).effectiveBusinessDays]).toEqual([false, 943]);
    expect(oracle({ biz: [["2021-06-02", "2022-12-15"], ["2022-12-15", "2023-06-16"], ["2023-12-01", "2024-01-01"]], grace: [["2022-12-15", "2024-12-15"]] }).effectiveBusinessDays).toBe(943);
  });

  it("K-10c: 철거 → 구분 변경 → 구분 변경(둘째 나대지 구간에도 근거 «철거ㆍ멸실»): 같은 철거일 창과 **각 구간 안의 과세기준일**로 판정 — 과세기준일이 없는 첫 조각은 접고 둘째 조각만 창 ∩ 구간", () => {
    const events = [
      { kind: "building_built", date: "2021-06-02" },
      { kind: "building_removed", date: "2022-12-15", propertyTaxTypeBefore: "separate" },
      { kind: "tax_type_changed", date: "2023-03-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", ...FACTS },
      { kind: "tax_type_changed", date: "2023-12-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", ...FACTS },
    ];
    const mk = (evs: unknown[]) => e35Base({ nblOtherPropertyTaxType: "separate", nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "250", nblOtherStateHistoryMode: "changed", nblOtherStateEvents: evs });
    const ivs = intervals(mk(events)).filter((x) => x.basis === "demolished");
    expect(ivs).toHaveLength(2);
    // 첫 조각 [2022-12-15, 2023-03-01): 과세기준일(6.1.) 없음 → 불성립 · 둘째 조각 [2023-03-01, 2023-12-01): 2023-06-01 → 창 [2023-03-01, 2023-06-16)
    expect(ivs[0]).toMatchObject({ foldReason: "demolished_never_period", basisOutcome: "unconfirmed", businessDays: 0 });
    expect([iso(ivs[1].temporaryStatusWindow!.start), iso(ivs[1].temporaryStatusWindow!.end), ivs[1].businessDays]).toEqual(["2023-03-01", "2023-06-16", 107]);
    // 조각을 나누지 않으면 183일 — 조각 분할이 인정 일수를 **늘리지 않는다**(보수)
    const single = intervals(mk([events[0], events[1], { ...events[3], date: "2023-12-01" }])).filter((x) => x.basis === "demolished");
    expect(single.reduce((sum, x) => sum + x.businessDays, 0)).toBe(183);
    expect(ivs.reduce((sum, x) => sum + x.businessDays, 0)).toBeLessThanOrEqual(183);
    // 둘째 조각만 근거를 선언하면 첫 조각은 근거 없음(종합합산) — 둘째 조각의 창은 같다
    const only2 = intervals(mk([events[0], events[1], { ...events[2], propertyTaxBasisBefore: "" }, events[3]])).slice(2, 4);
    expect(only2.map((x) => x.businessDays)).toEqual([0, 107]);
  });

  it("K-24 일반 주택: 주택 철거 2022-12-15 · 신축 2023-12-01 · 빈집정비 «아니오» · 바닥면적 칸 없음 → K-1과 같은 일수·판정(775 · 일반 W 6개월) · 주택 면적 고지 · 빈집정비 3년 연장 미반영 고지는 «과세기준일 2024.6.1.이 구간 밖»이라 없음", () => {
    const raw = e35Base({
      nblOtherPropertyTaxType: "separate", nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "250", nblIsMetropolitanArea: "no", nblOtherStateHistoryMode: "changed",
      nblOtherStateEvents: [
        { kind: "building_built", date: "2021-06-02" },
        { kind: "building_removed", date: "2022-12-15", propertyTaxTypeBefore: "separate", buildingKindBefore: "house", houseFootprintBefore: "400" },
        { kind: "building_built", date: "2023-12-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", ...HOUSE_OK, demolishedVacantHouseBefore: "no" },
      ],
    });
    const j = judge(raw);
    expect([j.isNonBusinessLand, j.effectiveBusinessDays]).toEqual([false, 775]);
    expect(j.warnings).toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_HOUSE_AREA_NOTICE);
    expect(j.warnings).not.toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_VACANT_HOUSE_UNCONFIRMED_NOTICE);
    expect(bare(raw)).toMatchObject({ temporaryStatusMonths: 6, temporaryStatusRemovedKind: "house" });
  });

  it("K-25: 일반 주택 철거 2023-12-15 · 구분 변경 행 2024-08-01 · 양도 2024-09-01 — 빈집정비 «예» 창 [2023-12-15, 2024-08-01) ⊃ «모름» 일반 W 창 [2023-12-15, 2024-06-16) + 3년 연장 미반영 고지(접힘 아님)", () => {
    const mk = (v: string) => houseDecl({ removedOn: "2023-12-15", closeOn: "2024-08-01", transfer: "2024-09-01", acq: "2018-06-01", bldStart: "2020-06-01" }, { ...HOUSE_OK, demolishedVacantHouseBefore: v });
    const yes = bare(mk("yes"));
    const unknown = bare(mk("unknown"));
    expect([iso(yes.temporaryStatusWindow!.end), yes.temporaryStatusMonths]).toEqual(["2024-08-01", 36]);
    expect([iso(unknown.temporaryStatusWindow!.start), iso(unknown.temporaryStatusWindow!.end), unknown.temporaryStatusMonths]).toEqual(["2023-12-15", "2024-06-16", 6]);
    expect(unknown.businessDays).toBeLessThan(yes.businessDays);
    expect(judge(mk("unknown")).warnings).toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_VACANT_HOUSE_UNCONFIRMED_NOTICE);
    expect(judge(mk("yes")).warnings).not.toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_VACANT_HOUSE_UNCONFIRMED_NOTICE);
    expect("vacantHouseExtensionUnconfirmed" in unknown && unknown.vacantHouseExtensionUnconfirmed).toBe(true);
  });

  it("K-26/K-10b: 철거 행 종류 «주택»인데 바닥면적 칸을 보냄 → 읽지 않는다(stray) — 바이트 동일 / 비주택 행에 stray 빈집정비 «예»도 읽지 않는다(3년이 아니라 일반 W)", () => {
    const base = houseDecl({ removedOn: "2023-12-15", closeOn: "2024-08-01", transfer: "2024-09-01", acq: "2018-06-01" }, { ...HOUSE_OK, demolishedVacantHouseBefore: "no" });
    const stray = houseDecl({ removedOn: "2023-12-15", closeOn: "2024-08-01", transfer: "2024-09-01", acq: "2018-06-01" }, { ...HOUSE_OK, demolishedVacantHouseBefore: "no", demolishedFloorAreaBefore: "5" });
    expect(JSON.stringify(judge(stray))).toBe(JSON.stringify(judge(base)));
    const nonHouse = e35Base({
      nblOtherPropertyTaxType: "separate", nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "250", nblOtherStateHistoryMode: "changed", transferDate: "2024-12-01",
      nblOtherStateEvents: [
        { kind: "building_built", date: "2021-06-02" },
        { kind: "building_removed", date: "2023-12-15", propertyTaxTypeBefore: "separate" },
        { kind: "building_built", date: "2024-09-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", ...FACTS, demolishedVacantHouseBefore: "yes" },
      ],
    });
    expect(bare(nonHouse)).toMatchObject({ temporaryStatusMonths: 6, temporaryStatusRemovedKind: "building" });
  });

  it("K-27 주택부수토지 카드(Q-12 (가)): 주택 철거 2022-12-15 → 신축 2023-12-01 사이 나대지 구간 — 같은 leaf·창 합집합(바닥면적 칸 없음)", () => {
    const raw = {
      nblUseDetailedJudgment: true, nblLandType: "housing_site", nblZoneType: "general_residential", acquisitionArea: "1000", acquisitionDate: "2014-01-01", transferDate: "2024-01-01",
      nblHousingFootprint: "250", nblIsMetropolitanArea: "no", nblOtherStateHistoryMode: "changed",
      nblOtherStateEvents: [
        { kind: "building_removed", date: "2022-12-15", houseFootprintBefore: "250" },
        { kind: "building_built", date: "2023-12-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", ...HOUSE_OK, demolishedVacantHouseBefore: "no" },
      ],
    } as Record<string, unknown>;
    const j = judge(raw);
    const iv = (j.periodEvaluation?.stateHistory?.intervals ?? []).find((x) => x.basis === "demolished")!;
    expect(iv).toMatchObject({ basisOutcome: "accepted", temporaryStatusMonths: 6, temporaryStatusRemovedKind: "house", businessDays: 183 });
    expect(j.warnings).toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_ACCEPTED_NOTICE);
    // 근거 없는(미선택) 같은 시료는 창 없음 — 비교로 효과를 고정
    const without = judge({ ...raw, nblOtherStateEvents: [(raw.nblOtherStateEvents as unknown[])[0], { kind: "building_built", date: "2023-12-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "" }] });
    expect(j.effectiveBusinessDays - without.effectiveBusinessDays).toBe(183);
  });

  it("고지: 받아들임 = DEMOLISHED_ACCEPTED 1건(일반 BARE_ACCEPTED 아님) · 접힘 = 사유별 고지(근거 확인 못함 고지 아님) · 근거 없음/다른 근거 시료는 새 고지 없음(바이트 동일)", () => {
    const ok = judge(decl("2022-12-15")).warnings;
    expect(ok.filter((w) => w === NBL_STATE_HISTORY_BARE_DEMOLISHED_ACCEPTED_NOTICE)).toHaveLength(1);
    expect(ok).not.toContain(NBL_STATE_HISTORY_BARE_ACCEPTED_NOTICE);
    for (const [reason, raw] of [
      ["demolished_never_period", decl("2022-07-01")],
      ["demolished_permit", decl("2022-12-15", { ...FACTS, demolishedPermitBefore: "no" })],
    ] as const) {
      const w = judge(raw).warnings;
      expect(w, reason).toContain(BARE_DEMOLISHED_FOLD_NOTICE[reason]);
      expect(w, reason).not.toContain(NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE);
      expect(w, reason).not.toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_ACCEPTED_NOTICE);
    }
  });

  it("하루 중복·누락 없음: 건축물 구간의 끝 = 창의 시작 = 철거일(겹치지도 비지도 않는다) · 창 일수 = 만료일 − 철거일 + 1 — 월 말일·윤년·경계 철거일 격자", () => {
    for (const r of ["2022-12-15", "2022-12-01", "2022-12-02", "2023-02-28", "2023-03-31", "2023-04-30", "2023-05-31", "2023-05-01", "2023-06-01"]) {
      const raw = decl(r, FACTS, {}, "2021-06-02", "2023-12-15");
      const ivs = intervals(raw);
      const building = ivs.find((x) => x.hasBuilding && x.end.getTime() === d(r).getTime())!;
      const iv = ivs.find((x) => x.basis === "demolished")!;
      expect(iso(building.end), r).toBe(r);
      expect(iso(iv.start), r).toBe(r);
      expect(iso(iv.temporaryStatusWindow!.start), r).toBe(r);
      const lastDay = periodEndFromMonths(d(r), 6);
      expect(iso(iv.temporaryStatusWindow!.end), r).toBe(iso(addDays(lastDay, 1)));
      expect(iv.businessDays, r).toBe(days(r, iso(addDays(lastDay, 1))));
      // 사업용 일수 합 = 건축물 구간 + 창 + 꼬리(건물) — 구간 사이 일수가 새지 않는다
      expect(ivs.reduce((s, x) => s + x.businessDays, 0), r).toBe(judge(raw).effectiveBusinessDays);
      expect(ivs.reduce((s, x) => s + x.days, 0), r).toBe(judge(raw).totalOwnershipDays);
    }
  });

  it("직접 API 안전망: 사실 칸 키가 아예 없는 `demolished` 선언(철거 행 뒤)은 «모름»처럼 접는다(허가 모름 → demolished_permit) — 던지지 않는다", () => {
    const raw = decl("2022-12-15", {});
    expect(() => judge(raw)).not.toThrow();
    expect(bare(raw)).toMatchObject({ foldReason: "demolished_permit", basisOutcome: "unconfirmed" });
  });
});

// ── D. 형제 안전망 ───────────────────────────────────────────────────────────

describe("E3f-2 D — 형제 안전망: 철거 행 앞·없는 구간의 `demolished`는 계속 접힌다(V-7) · 선택지는 철거 행 뒤 구간에서만 열린다", () => {
  it("`eventBasisOptions`: 인자 없음 = 종전(`demolished` 제외 — E3-1b 단언 보존) · `offersDemolished` = 별도합산에서만 `demolished` 포함", () => {
    expect(eventBasisOptions("separate")).toEqual(["vacant_state", "unknown"]);
    expect(eventBasisOptions("separate", false)).toEqual(["vacant_state", "unknown"]);
    expect(eventBasisOptions("separate", true)).toEqual(["vacant_state", "demolished", "unknown"]);
    expect(eventBasisOptions("exempt", true)).toEqual(["statutory_exempt", "unknown"]);
    expect(eventBasisOptions("special_sum", true)).toEqual(["separate_taxation", "unknown"]);
    expect(eventBasisOptions("comprehensive", true)).toEqual([]);
  });

  const ev = (kind: string, extra: Record<string, unknown> = {}) => ({ kind, date: "" as unknown, ...extra });
  it("`eventOffersDemolished`: 철거 행 뒤 나대지 구간(신축 행 · 구분 변경 행)만 참 — 취득 전 철거(철거 행이 없는 첫 구간) · 철거 행 사이에 신축이 낀 구간 · 철거 행 자체 · 건축물 구간 위 구분 변경은 거짓", () => {
    const events = [ev("building_built"), ev("building_removed"), ev("tax_type_changed"), ev("tax_type_changed"), ev("building_built"), ev("tax_type_changed")];
    expect(events.map((_, i) => eventOffersDemolished(events, i, false))).toEqual([false, false, true, true, true, false]);
    // 취득 전 철거(첫 사건 = 신축 → 초기 나대지 구간) — 철거일 출처가 없다(V-15)
    expect(eventOffersDemolished([ev("building_built")], 0, false)).toBe(false);
    // 건축물 사건이 없는 이력의 구분 변경은 철거 행이 없다
    expect(eventOffersDemolished([ev("tax_type_changed")], 0, false)).toBe(false);
  });

  it("`removalRowIndexFor` · `removalDateFor` · `demolishedRemovedKindOf`: 같은 replay — 주택 카드(`tailKind house`)는 모든 철거 행이 주택 · 기타토지 카드는 «철거된 건축물 = 주택» 행만", () => {
    const events = [ev("building_built", { date: "a" }), ev("building_removed", { date: "b", buildingKindBefore: "house" }), ev("tax_type_changed", { date: "c" }), ev("building_built", { date: "d" })];
    expect([2, 3].map((i) => removalRowIndexFor(events, i))).toEqual([1, 1]);
    expect(removalDateFor(events, 3)).toBe("b");
    expect(removalDateFor(events, 1)).toBeUndefined();
    expect(demolishedRemovedKindOf(events, 3, undefined)).toBe("house");
    expect(demolishedRemovedKindOf([ev("building_built"), ev("building_removed"), ev("building_built")], 2, undefined)).toBe("building");
    expect(demolishedRemovedKindOf([ev("building_built"), ev("building_removed"), ev("building_built")], 2, "house")).toBe("house");
    expect(demolishedRemovedKindOf([ev("building_built")], 0, undefined)).toBeUndefined();
  });

  const NO_FACTS = { demolishedPermitBefore: "yes", demolishedOtherUseBefore: "no", demolishedFloorAreaBefore: 250 } as const;
  const dec = (kind: "building_built" | "tax_type_changed") => ({ kind, propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", ...NO_FACTS }) as const;

  it("`resolveBareDeclaration` 맥락 없음(철거 행 앞·없는 구간 — 직접 API): 계속 `demolished_unsupported`로 접힌다 · 선언 구분이 별도합산이 아니면 `incompatible`", () => {
    expect(resolveBareDeclaration(dec("building_built"))).toMatchObject({ propertyTaxType: "comprehensive", basisOutcome: "unconfirmed", foldReason: "demolished_unsupported", basis: "demolished" });
    expect(resolveBareDeclaration({ kind: "tax_type_changed", propertyTaxTypeBefore: "exempt", propertyTaxBasisBefore: "demolished" })).toMatchObject({ foldReason: "demolished_unsupported" });
    const ctx = { removedOn: d("2022-12-15"), removedKind: "building" as const, intervalStart: d("2022-12-15"), intervalEnd: d("2023-12-01"), landArea: 1000, zoneType: "general_residential" };
    expect(resolveBareDeclaration(dec("building_built"), ctx)).toMatchObject({ basisOutcome: "accepted", temporaryStatusMonths: 6 });
    expect(resolveBareDeclaration({ kind: "tax_type_changed", propertyTaxTypeBefore: "exempt", propertyTaxBasisBefore: "demolished" }, ctx)).toMatchObject({ foldReason: "incompatible", basisOutcome: "unconfirmed" });
  });

  it("철거 행이 없는 이력(신축 앞 나대지 · 취득 전 철거)에 직접 `demolished`를 보내면 접힘 `demolished_unsupported` + 기존 «근거 확인 못함» 고지(바이트 동일) — 새 접힘 사유로 바뀌지 않는다", () => {
    const raw = e35Base({
      nblOtherPropertyTaxType: "separate", nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "250", nblOtherStateHistoryMode: "changed",
      nblOtherStateEvents: [{ kind: "building_built", date: "2021-06-02", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", ...FACTS }],
    });
    const iv = intervals(raw)[0];
    expect(iv).toMatchObject({ basisOutcome: "unconfirmed", foldReason: "demolished_unsupported", basis: "demolished", businessDays: 0 });
    expect("temporaryStatusWindow" in iv).toBe(false);
    expect(judge(raw).warnings).toContain(NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE);
  });

  it("근거 «공지상태»(vacant_state) 나대지 선언은 종전과 같다 — 철거 행 뒤여도 창을 만들지 않는다(E3-1b 경로 불변)", () => {
    const raw = decl("2022-12-15", { propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within" });
    const iv = intervals(raw).find((x) => x.basis === "vacant_state")!;
    expect(iv).toMatchObject({ basisOutcome: "accepted", propertyTaxType: "separate", business: true });
    expect("temporaryStatusWindow" in iv).toBe(false);
  });
});
