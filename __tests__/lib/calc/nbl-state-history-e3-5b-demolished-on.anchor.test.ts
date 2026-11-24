/**
 * NBL-STATE-HISTORY-E3-⑤ E3f-1b — 꼬리 근거 «철거ㆍ멸실» **철거ㆍ멸실일 새 칸** ⑧↔⑫ 거울 anchor (계획서 §6.1 · §6.2 D-3·D-4 · K-16~K-16h · K-28 · K-29).
 *
 * ⑧(`validateNblOtherLand`)·⑫′(`refineNonBusinessLandRaw`)·④(와이어)·⑭(엔진 매핑)이 **같은 leaf 술어**(`demolished-input-issue.ts`)를 부른다 — 이 파일이 그 거울을 격자로 고정한다.
 * ⑧ 호출 배선(U-2)은 UI PR 몫이므로(⑤ 앵커 게이트 `transfer-validation-field-anchor-coverage`와 한 묶음) 여기서는 **⑧이 부를 조합**(`stateEventSequenceIssue` → `demolishedInputIssue` — ⑧의 순서)을 그대로 재현해 ⑫′와 대조한다.
 *
 *   A  격자 576행 = 모드(4) × 마지막 건축물 사건(3: 없음·신축·철거) × 꼬리 토글(2) × 근거(3: 철거ㆍ멸실·공지상태·미선택) × 철거 행 날짜(2: 유효·빈칸) × 새 칸(4: 빈칸·취득 전·양도일 이후·비날짜):
 *      독립 진리표(계획서 §6.1 문장) ≡ ⑫′ 이슈 ≡ ⑧ 조합 — 불일치 0 · «화면에 없는 칸 400» 0 · 출처 ①(철거 행) ②(새 칸) · ④ 와이어 `""` 덮어쓰기(D-4) · ⑭ 엔진 값.
 *   B  K-16~K-16f 명명 시나리오(문구·필드 점프 경로) · 선언 3종(종합합산·분리과세·비과세) stale 근거는 읽지 않는다.
 *   C  종전 `demolishedBasisIssue`(바닥면적·용도지역)는 철거일이 해결된 뒤에 그대로 나온다 — 순서 «철거일 → 바닥면적 → 용도지역».
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { refineNonBusinessLandRaw, type NblRawRefineInput } from "@/lib/api/transfer-tax-schema-nbl-refines";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { getZoneAreaMultiplier } from "@/lib/tax-engine/local-tax-zone-multiplier";
import {
  DEMOLISHED_ON_REQUIRED_MESSAGE,
  demolishedInputIssue,
  demolishedOnForEngine,
  demolishedOnInvalidMessage,
  demolishedOnNotBeforeTransferMessage,
  demolishedOnRequired,
  demolishedOnWireValue,
} from "@/lib/tax-engine/non-business-land/demolished-input-issue";
import { DEMOLISHED_FLOOR_AREA_REQUIRED_MESSAGE, type PropertyTaxBasis } from "@/lib/tax-engine/non-business-land/property-tax-basis";
import { removalDateFor, stateEventSequenceIssue, tailRemovalDateOf } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { parseISO } from "@/lib/tax-engine/utc-date";

const TRANSFER = "2024-01-01";
const ROW_DATE = "2022-12-01";
const FIELD_VALUES = { blank: "", before: "2013-06-01", atTransfer: TRANSFER, invalid: "abc" } as const;

type Mode = "" | "unchanged" | "unknown" | "changed";
type Last = "none" | "built" | "removed";
type Basis = "demolished" | "vacant_state" | "";
interface G {
  mode: Mode;
  last: Last;
  toggle: boolean;
  basis: Basis;
  rowDate: "valid" | "blank";
  on: keyof typeof FIELD_VALUES;
}

function eventsOf(g: G): { kind: string; date: string; propertyTaxTypeBefore?: string }[] {
  if (g.last === "none") return [];
  if (g.last === "built") return [{ kind: "building_built", date: "2020-01-01" }];
  return [{ kind: "building_built", date: "2019-01-01" }, { kind: "building_removed", date: g.rowDate === "valid" ? ROW_DATE : "", propertyTaxTypeBefore: "separate" }];
}

/** ④가 와이어에 싣는 이력 — `changed`가 아니면 사건은 `[]`(모드만 운반). 단, 이 격자는 비`changed` 모드에서도 stale 사건을 싣는 입력(직접 API)을 따로 본다. */
function rawOf(g: G, opts: { staleEvents?: boolean } = {}): NblRawRefineInput {
  const events = g.mode === "changed" || opts.staleEvents ? eventsOf(g) : [];
  return {
    nblUseDetailedJudgment: true,
    nblLandType: "other_land",
    nblZoneType: "general_residential",
    acquisitionDate: "2014-01-01",
    transferDate: TRANSFER,
    nblOtherPropertyTaxType: "separate",
    nblOtherHasBuilding: g.toggle,
    nblOtherPropertyTaxBasis: g.basis,
    nblOtherDemolishedFloorArea: "400",
    nblOtherDemolishedOn: FIELD_VALUES[g.on],
    nblOtherStateHistoryMode: g.mode,
    nblOtherStateEvents: events,
    nblGracePeriods: [],
  } as NblRawRefineInput;
}

function refine(raw: NblRawRefineInput): { path: (string | number)[]; message: string }[] {
  const out: { path: (string | number)[]; message: string }[] = [];
  refineNonBusinessLandRaw(raw, { addIssue: (i: { path: (string | number)[]; message: string }) => out.push({ path: i.path, message: i.message }) } as unknown as z.RefinementCtx);
  return out;
}

/** 독립 진리표 — 계획서 §6.1 «demolishedOnRequired» 정의 문장을 그대로 옮긴 것(leaf를 부르지 않는다). */
function truth(g: G) {
  // 이력 질문 `changed`일 때만 사건을 읽는다 · 사건 행 결함(0건·철거 행 날짜 빈칸)은 사건 행 검증이 먼저 막는다.
  const stateIssue = g.mode === "changed" && (g.last === "none" || (g.last === "removed" && g.rowDate === "blank"));
  // 양도일 현재 건축물 유무: changed이면 마지막 건축물 사건이 이긴다(신축 = 있음 · 철거 = 없음), 건축물 사건이 없으면 토글.
  const hasBuilding = g.mode === "changed" ? (g.last === "built" ? true : g.last === "removed" ? false : g.toggle) : g.toggle;
  const rowSupplies = g.mode === "changed" && g.last === "removed" && g.rowDate === "valid";
  const required = !hasBuilding && g.basis === "demolished" && !rowSupplies;
  const onIssue = required && (g.on === "blank" || g.on === "invalid" || g.on === "atTransfer");
  const source: "row" | "field" | "none" = !(!hasBuilding && g.basis === "demolished") ? "none" : rowSupplies ? "row" : "field";
  return { stateIssue, hasBuilding, required, onIssue, source };
}

const MODES: Mode[] = ["", "unchanged", "unknown", "changed"];
const LASTS: Last[] = ["none", "built", "removed"];
const BASES: Basis[] = ["demolished", "vacant_state", ""];
const ROWS: G["rowDate"][] = ["valid", "blank"];
const ONS = Object.keys(FIELD_VALUES) as G["on"][];
const GRID: G[] = MODES.flatMap((mode) => LASTS.flatMap((last) => [true, false].flatMap((toggle) => BASES.flatMap((basis) => ROWS.flatMap((rowDate) => ONS.map((on) => ({ mode, last, toggle, basis, rowDate, on })))))));

/** ⑧이 부를 조합 — 사건 이력 검증(`stateEventSequenceIssue`) → 철거 근거 검증(`demolishedInputIssue`). 첫 오류만. */
function composeEight(raw: NblRawRefineInput): { kind: "state" | "demolishedOn" | "other"; message: string } | null {
  if (raw.nblOtherStateHistoryMode === "changed") {
    const s = stateEventSequenceIssue(raw.nblOtherStateEvents ?? [], { transferDate: raw.transferDate ?? "", subject: "building" });
    if (s) return { kind: "state", message: s.message };
  }
  const i = demolishedInputIssue({
    declared: "separate",
    mode: raw.nblOtherStateHistoryMode,
    events: raw.nblOtherStateEvents ?? [],
    rawHasBuilding: !!raw.nblOtherHasBuilding,
    basis: (raw.nblOtherPropertyTaxBasis || undefined) as PropertyTaxBasis | undefined,
    demolishedOn: raw.nblOtherDemolishedOn,
    transferDate: raw.transferDate,
    floorArea: Number(raw.nblOtherDemolishedFloorArea),
    zoneType: raw.nblZoneType ?? "",
    zoneMapped: !!getZoneAreaMultiplier(raw.nblZoneType ?? ""),
  });
  return i ? { kind: i.part === "demolishedOn" ? "demolishedOn" : "other", message: i.message } : null;
}

const DATE_PATH = ["nblOtherDemolishedOn"];
const dateIssues = (raw: NblRawRefineInput) => refine(raw).filter((i) => i.path.join(".") === DATE_PATH.join("."));

describe("E3f-1b A — ⑧↔⑫ parity 격자 576행 (독립 진리표 ≡ ⑫′ ≡ ⑧ 조합)", () => {
  it("격자 규모 = 계획서 V-20의 576행", () => {
    expect(GRID).toHaveLength(576);
    expect(new Set(GRID.map((g) => JSON.stringify(g))).size).toBe(576);
  });

  it("⑫′ 철거ㆍ멸실일 이슈 유무 ≡ 진리표 — 칸이 불요한 입력(철거 행이 날짜를 댐 · 근거 아님 · 꼬리 건축물 있음)에서는 400이 없다 = «화면에 없는 칸 400» 0", () => {
    const bad: string[] = [];
    for (const g of GRID) {
      const t = truth(g);
      const got = dateIssues(rawOf(g)).length > 0;
      // 사건 행 결함이 있으면 철거ㆍ멸실일 안내는 중복하지 않는다(K-16d).
      const want = t.onIssue && !t.stateIssue;
      if (got !== want) bad.push(`${JSON.stringify(g)} got=${got} want=${want}`);
      if (!t.required && got) bad.push(`화면에 없는 칸 400: ${JSON.stringify(g)}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("⑧ 조합 ≡ ⑫′ — 차단 여부·같은 문구(⑧ 통과 ↔ ⑫ 400 모순 0): ⑫′의 막힘(사건 행 · 철거ㆍ멸실일) ⇔ ⑧ 조합의 막힘", () => {
    const bad: string[] = [];
    for (const g of GRID) {
      const raw = rawOf(g);
      const eight = composeEight(raw);
      const twelve = refine(raw).filter((i) => i.path[0] === "nblOtherStateEvents" || i.path[0] === "nblOtherDemolishedOn");
      if (!!eight !== (twelve.length > 0)) { bad.push(`막힘 불일치 ${JSON.stringify(g)} ⑧=${eight?.kind} ⑫=${twelve.length}`); continue; }
      if (!eight) continue;
      if (eight.kind === "demolishedOn") {
        const m = twelve.find((i) => i.path[0] === "nblOtherDemolishedOn");
        if (m?.message !== eight.message) bad.push(`문구 불일치 ${JSON.stringify(g)}`);
      } else if (eight.kind === "state") {
        const m = twelve.find((i) => i.path[0] === "nblOtherStateEvents");
        if (m?.message !== eight.message) bad.push(`사건 행 문구 불일치 ${JSON.stringify(g)}`);
        // 사건 행 결함이 먼저 — 같은 입력에서 철거ㆍ멸실일 안내가 중복되지 않는다.
        if (twelve.some((i) => i.path[0] === "nblOtherDemolishedOn")) bad.push(`중복 안내 ${JSON.stringify(g)}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("술어 `demolishedOnRequired` ≡ 진리표(칸이 보이는 조건 = 막는 조건 = 보내는 조건) · ④ 와이어 값 `demolishedOnWireValue`는 불요하면 `\"\"`(D-4 stale 덮어쓰기 — 값이 남아 있어도 비어 나간다)", () => {
    const bad: string[] = [];
    for (const g of GRID) {
      const raw = rawOf(g);
      const facts = { declared: "separate" as const, mode: raw.nblOtherStateHistoryMode, events: raw.nblOtherStateEvents ?? [], rawHasBuilding: !!raw.nblOtherHasBuilding, basis: (raw.nblOtherPropertyTaxBasis || undefined) as PropertyTaxBasis | undefined };
      const t = truth(g);
      if (demolishedOnRequired(facts) !== t.required) bad.push(`required ${JSON.stringify(g)}`);
      const wire = demolishedOnWireValue({ ...facts, demolishedOn: "STALE-2018-01-01" });
      if (wire !== (t.required ? "STALE-2018-01-01" : "")) bad.push(`wire ${JSON.stringify(g)} ${wire}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("⑭ 엔진 값: 출처 ①(철거 행 날짜)이 새 칸보다 우선 · 출처 ②는 새 칸 · 근거가 «철거ㆍ멸실»이 아니면 키 없음 — 격자 전수(철거 행 날짜 결함 입력은 ⑧·⑫가 막으므로 제외)", () => {
    const bad: string[] = [];
    for (const g of GRID) {
      const t = truth(g);
      if (t.stateIssue) continue;
      const input = buildNblEngineInput(rawOf(g) as never);
      const got = input?.otherLand?.demolishedOn;
      const want = t.source === "row" ? parseISO(ROW_DATE) : t.source === "field" ? (g.on === "before" ? parseISO(FIELD_VALUES.before) : g.on === "atTransfer" ? parseISO(TRANSFER) : undefined) : undefined;
      if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${JSON.stringify(g)} got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
      if (t.source === "none" && input?.otherLand && "demolishedOn" in input.otherLand) bad.push(`키가 있다 ${JSON.stringify(g)}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("비`changed` 모드의 stale 사건(직접 API가 사건을 싣는 입력)은 읽히지 않는다 — 출처 ①이 되지 않고 사건 행 검증도 걸리지 않는다", () => {
    for (const mode of ["", "unchanged", "unknown"] as const) {
      const g: G = { mode, last: "removed", toggle: false, basis: "demolished", rowDate: "valid", on: "blank" };
      const raw = rawOf(g, { staleEvents: true });
      expect(raw.nblOtherStateEvents).toHaveLength(2);
      expect(refine(raw).map((i) => i.path.join("."))).toEqual(["nblOtherDemolishedOn"]); // 새 칸이 필요(출처 ① 없음)
      expect(dateIssues(rawOf({ ...g, on: "before" }, { staleEvents: true }))).toEqual([]);
    }
  });

  it("D-3 getter: `tailRemovalDateOf`·`removalDateFor`는 마지막(직전) 건축물 사건이 철거 행일 때만 그 행 날짜 — 신축이면 · 건축물 사건이 없으면 · 꼬리에 건축물이 있으면 undefined", () => {
    const ev = [{ kind: "building_built", date: "2019-01-01" }, { kind: "tax_type_changed", date: "2019-06-01" }, { kind: "building_removed", date: "2022-12-01" }, { kind: "tax_type_changed", date: "2023-01-01" }];
    expect(tailRemovalDateOf(ev, false)).toBe("2022-12-01"); // 구분 변경 행은 건너뛴다
    expect(tailRemovalDateOf(ev, true)).toBeUndefined();
    expect(tailRemovalDateOf([...ev, { kind: "building_built", date: "2023-06-01" }], false)).toBeUndefined();
    expect(tailRemovalDateOf([{ kind: "tax_type_changed", date: "2023-01-01" }], false)).toBeUndefined();
    expect(tailRemovalDateOf([], false)).toBeUndefined();
    expect([removalDateFor(ev, 0), removalDateFor(ev, 1), removalDateFor(ev, 2), removalDateFor(ev, 3), removalDateFor(ev, 4)]).toEqual([undefined, undefined, undefined, "2022-12-01", "2022-12-01"]);
    // Date 사건도 같은 함수(⑭)
    const dated = [{ kind: "building_removed", date: parseISO("2022-12-01") }];
    expect(tailRemovalDateOf(dated, false)).toEqual(parseISO("2022-12-01"));
    expect(demolishedOnForEngine({ declared: "separate", mode: "changed", events: dated, rawHasBuilding: false, basis: "demolished" }, parseISO("2000-01-01"))).toEqual(parseISO("2022-12-01"));
  });
});

describe("E3f-1b B — K-16 계열 명명 시나리오 (문구 · 필드 점프 경로)", () => {
  const base: G = { mode: "", last: "none", toggle: false, basis: "demolished", rowDate: "valid", on: "blank" };

  it("K-16 이력 없음 · unchanged · 철거 행 없는 changed + 근거 «철거ㆍ멸실» + 철거일 빈칸 → 필드 점프 `nblOtherDemolishedOn` · 문구 = DEMOLISHED_ON_REQUIRED_MESSAGE", () => {
    for (const g of [base, { ...base, mode: "unchanged" as const }, { ...base, mode: "unknown" as const }, { ...base, mode: "changed" as const, last: "built" as const, toggle: false, on: "blank" as const }]) {
      // `changed` + 마지막 사건 = 신축은 꼬리 건축물 있음 → 불요(K-16e) — 아래에서 따로.
      const issues = dateIssues(rawOf(g));
      if (g.mode === "changed") expect(issues).toEqual([]);
      else expect(issues.map((i) => [i.path, i.message])).toEqual([[DATE_PATH, DEMOLISHED_ON_REQUIRED_MESSAGE]]);
    }
    expect(DEMOLISHED_ON_REQUIRED_MESSAGE).toContain("철거ㆍ멸실일을 입력하세요");
    expect(DEMOLISHED_ON_REQUIRED_MESSAGE).toContain("취득 전에 철거됐어도 입력합니다");
  });

  it("K-16 비날짜 → «날짜로 읽을 수 없습니다» · K-16b 철거일 ≥ 양도일(당일 포함) → «양도일보다 앞이어야» · 취득일 이전은 통과", () => {
    expect(dateIssues(rawOf({ ...base, on: "invalid" })).map((i) => i.message)).toEqual([demolishedOnInvalidMessage("abc")]);
    expect(dateIssues(rawOf({ ...base, on: "atTransfer" })).map((i) => i.message)).toEqual([demolishedOnNotBeforeTransferMessage(TRANSFER, TRANSFER)]);
    expect(dateIssues(rawOf({ ...base, on: "before" }))).toEqual([]); // 취득 2014-01-01 이전 2013-06-01
    const dayBefore = { ...rawOf({ ...base, on: "blank" }), nblOtherDemolishedOn: "2023-12-31" };
    expect(dateIssues(dayBefore)).toEqual([]);
    expect(dateIssues({ ...dayBefore, nblOtherDemolishedOn: "2024-01-02" }).map((i) => i.message)).toEqual([demolishedOnNotBeforeTransferMessage("2024-01-02", TRANSFER)]);
  });

  it("K-16c 철거 행이 날짜를 대면 새 칸은 불요 — 빈칸이어도 통과(⑧·⑫) · 새 칸에 비날짜 stray가 있어도 읽지 않는다(K-17)", () => {
    const g: G = { mode: "changed", last: "removed", toggle: false, basis: "demolished", rowDate: "valid", on: "blank" };
    expect(refine(rawOf(g))).toEqual([]);
    expect(refine(rawOf({ ...g, on: "invalid" }))).toEqual([]);
    expect(refine(rawOf({ ...g, on: "atTransfer" }))).toEqual([]);
    expect(composeEight(rawOf(g))).toBeNull();
  });

  it("K-16d 마지막 사건 = 철거 행인데 그 행 날짜가 빈칸 → 사건 행 결함이 먼저(⑧·⑫ 같음) · 철거ㆍ멸실일 안내는 중복하지 않는다", () => {
    const g: G = { mode: "changed", last: "removed", toggle: false, basis: "demolished", rowDate: "blank", on: "blank" };
    const issues = refine(rawOf(g));
    expect(issues.map((i) => i.path.join("."))).toEqual(["nblOtherStateEvents.1.date"]);
    expect(composeEight(rawOf(g))?.kind).toBe("state");
  });

  it("K-16d′ 철거 행 날짜가 «해석 불가» 문자열이어도 «날짜를 대지 않음»이다 — 새 칸 필요(⑤가 칸을 보임) · ⑫는 사건 행 결함만 말한다(중복 없음)", () => {
    const g: G = { mode: "changed", last: "removed", toggle: false, basis: "demolished", rowDate: "valid", on: "blank" };
    const bad = { ...rawOf(g), nblOtherStateEvents: [{ kind: "building_built", date: "2019-01-01" }, { kind: "building_removed", date: "abc", propertyTaxTypeBefore: "separate" }] } as NblRawRefineInput;
    expect(demolishedOnRequired({ declared: "separate", mode: "changed", events: bad.nblOtherStateEvents ?? [], rawHasBuilding: false, basis: "demolished" })).toBe(true);
    expect(refine(bad).map((i) => i.path.join("."))).toEqual(["nblOtherStateEvents.1.date"]);
  });

  it("K-16e 마지막 사건 = 신축(꼬리 건축물 있음) + stale 근거 «철거ㆍ멸실» + 철거일 빈칸 → 통과(숨은 stale — 술어 거짓)", () => {
    const g: G = { mode: "changed", last: "built", toggle: false, basis: "demolished", rowDate: "valid", on: "blank" };
    expect(refine(rawOf(g))).toEqual([]);
    expect(demolishedOnRequired({ declared: "separate", mode: "changed", events: eventsOf(g), rawHasBuilding: false, basis: "demolished" })).toBe(false);
  });

  it("K-16f 구 저장 세션(새 칸 부재 = undefined)은 빈칸과 같다 — 철거 행 없는 꼬리 근거라면 ⑫ 400(⑧ 차단 + 칸 점프는 U-2) · 철거 행이 날짜를 대는 구 세션은 영향 없음", () => {
    const g: G = { mode: "unchanged", last: "none", toggle: false, basis: "demolished", rowDate: "valid", on: "blank" };
    const legacy = { ...rawOf(g) } as Record<string, unknown>;
    delete legacy.nblOtherDemolishedOn;
    expect(refine(legacy as unknown as NblRawRefineInput).map((i) => [i.path.join("."), i.message])).toEqual([["nblOtherDemolishedOn", DEMOLISHED_ON_REQUIRED_MESSAGE]]);
    const withRow = { ...rawOf({ ...g, mode: "changed", last: "removed" }) } as Record<string, unknown>;
    delete withRow.nblOtherDemolishedOn;
    expect(refine(withRow as unknown as NblRawRefineInput)).toEqual([]);
  });

  it("종합합산·분리과세·비과세 선언 + stale 근거 «철거ㆍ멸실»은 철거ㆍ멸실일을 요구하지 않는다(별도합산 + 건축물 없음일 때만)", () => {
    for (const declared of ["comprehensive", "special_sum", "exempt"] as const) {
      const raw = { ...rawOf({ ...base, on: "blank" }), nblOtherPropertyTaxType: declared } as NblRawRefineInput;
      expect(dateIssues(raw), declared).toEqual([]);
    }
  });

  it("K-28 (leaf) 이력 질문이 적용되지 않는 raw(모드 비어 있음)는 자기 새 칸이 필요하다 — raw마다 판정하고 다른 raw의 철거 행 날짜를 읽지 않는다. 축 B 번들의 실제 흐름(둘째 지분 raw = 첫 카드 땅 사실 + 지분 취득 사실)은 route anchor가 고정한다", () => {
    const first = rawOf({ mode: "changed", last: "removed", toggle: false, basis: "demolished", rowDate: "valid", on: "blank" });
    const noHistory = rawOf({ mode: "", last: "none", toggle: false, basis: "demolished", rowDate: "valid", on: "blank" });
    expect(dateIssues(first)).toEqual([]);
    expect(dateIssues(noHistory).map((i) => i.message)).toEqual([DEMOLISHED_ON_REQUIRED_MESSAGE]);
    expect(dateIssues({ ...noHistory, nblOtherDemolishedOn: "2022-12-01" })).toEqual([]);
    expect(buildNblEngineInput({ ...noHistory, nblOtherDemolishedOn: "2022-12-01" } as never)?.otherLand?.demolishedOn).toEqual(parseISO("2022-12-01"));
  });
});

describe("E3f-1b C — 철거ㆍ멸실일 → 바닥면적 → 용도지역 순서 (종전 `demolishedBasisIssue`는 그대로)", () => {
  const facts = (over: Record<string, unknown>) => ({
    declared: "separate" as const, mode: "" as string | undefined, events: [] as { kind: string; date: unknown }[], rawHasBuilding: false, basis: "demolished" as PropertyTaxBasis | undefined,
    demolishedOn: "2022-12-01" as string | undefined, transferDate: TRANSFER as string | undefined, floorArea: 400 as number | undefined, zoneType: "general_residential", zoneMapped: true, ...over,
  });

  it("철거일 빈칸 + 바닥면적 빈칸 → 철거일이 먼저 · 철거일 해결 후 바닥면적 · 그다음 용도지역", () => {
    expect(demolishedInputIssue(facts({ demolishedOn: "", floorArea: undefined, zoneMapped: false }))?.part).toBe("demolishedOn");
    expect(demolishedInputIssue(facts({ floorArea: undefined, zoneMapped: false }))).toEqual({ part: "floorArea", message: DEMOLISHED_FLOOR_AREA_REQUIRED_MESSAGE });
    expect(demolishedInputIssue(facts({ zoneMapped: false, zoneType: "residential" }))?.part).toBe("zone");
    expect(demolishedInputIssue(facts({}))).toBeNull();
  });

  it("근거가 «철거ㆍ멸실»이 아니면 어느 항목도 검사하지 않는다 · 양도일 빈 값·해석 불가면 «양도일 이후» 규칙만 건너뛴다(앞 단계 검증 몫)", () => {
    expect(demolishedInputIssue(facts({ basis: "vacant_state", demolishedOn: "", floorArea: undefined }))).toBeNull();
    expect(demolishedInputIssue(facts({ basis: undefined, demolishedOn: "", floorArea: undefined }))).toBeNull();
    expect(demolishedInputIssue(facts({ demolishedOn: "2030-01-01", transferDate: "" }))).toBeNull();
    expect(demolishedInputIssue(facts({ demolishedOn: "2030-01-01", transferDate: undefined }))).toBeNull();
    expect(demolishedInputIssue(facts({ demolishedOn: "2030-01-01", transferDate: "xx" }))).toBeNull();
    expect(demolishedInputIssue(facts({ demolishedOn: "2030-01-01" }))?.part).toBe("demolishedOn");
  });

  it("공백만 있는 값은 빈칸이다(trim)", () => {
    expect(demolishedInputIssue(facts({ demolishedOn: "   " }))?.message).toBe(DEMOLISHED_ON_REQUIRED_MESSAGE);
  });
});
