/**
 * NBL-STATE-HISTORY-E3-1b (E3b-1) — 이력 leaf(`other-land-state-history.ts`) 단위: 나대지 구간 선언(Before 사슬의 «닫는 구간이 나대지»).
 *
 * 계획서: docs/01-plan/features/nbl-state-history-e3-1b-bare-land-tax-type.engine.plan.md §4(모델·해석기) · §7.2 Anchor 4·5 · «결정 기록 (2026-11-23 사용자)»
 * 표: `_helpers/nbl-state-history-e3-1b-table.ts` — 사건 → 구간 → 사업용 구간이 표의 `biz`(손으로 쓴 독립 정답)와 같은지 전 행 대조한다.
 *
 * mutation 대응: P-b1(derive가 나대지 선언 무시) = 전 행 대조 · P-b3(근거 확인 없이 선언만 믿음) = `resolveBareDeclaration` 표 · P-b4/b5/b6(면적한도) = 같은 표 ·
 * P-b7(사업용 술어에서 `basisOutcome` 항 삭제) = `isStateIntervalBusiness` 표 · P-b10(건축물 구간 행의 선언 칸을 읽음) = 건축물 구간 행 가드 · P-b11(replay 초기 상태 무시) = `eventClosesBareInterval` 표.
 */
import { describe } from "vitest";
import { it } from "vitest";
import { expect } from "vitest";
import { E3B_ROWS, type E3bRow } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-1b-table";
import { dayDate } from "@/__tests__/tax-engine/_helpers/nbl-state-history-day-table";
import { deriveOtherLandStateIntervals } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { eventBasisOptions } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { eventCarriesTaxTypeBefore } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { eventClosesBareInterval } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { isStateIntervalBusiness } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { resolveBareDeclaration } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { stateEventSequenceIssue } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { stateHistoryBusinessIntervals } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { getOwnershipStart } from "@/lib/tax-engine/non-business-land/utils/period-math";
import type { StateEvent } from "@/lib/tax-engine/non-business-land/land-usage.types";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const T = "2024-01-01";

function eventsOf(row: E3bRow): StateEvent[] {
  return row.events.map(([kind, date, before, basis, limit]) => ({
    kind,
    date: dayDate(date),
    ...(before !== undefined ? { propertyTaxTypeBefore: before } : {}),
    ...(basis !== undefined ? { propertyTaxBasisBefore: basis } : {}),
    ...(limit !== undefined ? { areaWithinLimitBefore: limit } : {}),
  }));
}

/** 표 행의 꼬리(양도일 현재): 마지막 건축물 사건이 정하고, 건축물 사건이 없으면 `tail.hasBuilding`. */
function tailOf(row: E3bRow) {
  const b = row.events.filter(([k]) => k !== "tax_type_changed");
  const hasBuilding = b.length === 0 ? row.tail.hasBuilding : b[b.length - 1][0] === "building_built";
  return { hasBuilding, propertyTaxType: row.tail.type };
}

function derive(row: E3bRow) {
  return deriveOtherLandStateIntervals(eventsOf(row), getOwnershipStart(dayDate(row.acq ?? "2014-01-01")), dayDate(row.transfer ?? T), tailOf(row));
}

/** core(꼬리) 사업용: 건축물 있음 + 비종합합산, 또는 나대지 + 비종합합산 + V1-A 근거 수용(공지상태). */
function coreBusinessOf(row: E3bRow): boolean {
  const t = tailOf(row);
  return t.propertyTaxType !== "comprehensive" && (t.hasBuilding || !!row.tail.basis);
}

/** 인접 구간을 이어 붙여 정규화(반열린 `[start, end)`). */
function normalize(spans: ReadonlyArray<readonly [string, string]>): Array<[string, string]> {
  const sorted = spans.filter(([a, b]) => a < b).map(([a, b]) => [a, b] as [string, string]).sort((x, y) => (x[0] < y[0] ? -1 : 1));
  const out: Array<[string, string]> = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s[0] <= last[1]) last[1] = s[1] > last[1] ? s[1] : last[1];
    else out.push([...s]);
  }
  return out;
}

describe("E3b-1 leaf — R1~R19(+변형): 사건 → 구간 → 사업용 구간이 표의 `biz`와 같다 (나대지 선언 해석)", () => {
  it.each(E3B_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, row) => {
    const intervals = derive(row);
    const days = intervals.map((iv) => (iv.end.getTime() - iv.start.getTime()) / 86_400_000);
    expect(days.reduce((s, x) => s + x, 0)).toBe(row.expect.total);
    for (const d of days) expect(d).toBeGreaterThan(0);
    const biz = stateHistoryBusinessIntervals(intervals, { isBusiness: coreBusinessOf(row) }).map((p) => [iso(p.start), iso(p.end)] as const);
    expect(normalize(biz)).toEqual(normalize(row.biz));
  });
});

describe("E3b-1 leaf — `eventClosesBareInterval`: 사건 순서 replay (초기 건축물 상태 = 첫 건축물 사건 또는 입력 토글)", () => {
  const k = (...kinds: string[]) => kinds.map((kind) => ({ kind }));
  const closes = (kinds: string[], tailHasBuilding: boolean) => kinds.map((_, i) => eventClosesBareInterval(k(...kinds), i, tailHasBuilding));

  it("신축 행은 항상 true · 철거 행은 항상 false (토글과 무관)", () => {
    for (const toggle of [true, false]) {
      expect(closes(["building_built"], toggle)).toEqual([true]);
      expect(closes(["building_removed"], toggle)).toEqual([false]);
    }
  });

  it("tax-only: 건축물 사건이 없으면 초기 상태 = 토글 — 건축물 있음이면 false(건축물 구간) · 없음이면 true(나대지) (P-b11)", () => {
    expect(closes(["tax_type_changed"], true)).toEqual([false]);
    expect(closes(["tax_type_changed"], false)).toEqual([true]);
    expect(closes(["tax_type_changed", "tax_type_changed"], false)).toEqual([true, true]);
  });

  it("건축물 사건이 있으면 토글은 무시 — 첫 건축물 사건이 신축이면 초기 «없음» · 철거이면 초기 «있음»", () => {
    for (const toggle of [true, false]) {
      expect(closes(["tax_type_changed", "building_built"], toggle)).toEqual([true, true]);
      expect(closes(["tax_type_changed", "building_removed"], toggle)).toEqual([false, false]);
    }
  });

  it("replay: 신축 뒤 구분 변경 = false · 철거 뒤 구분 변경 = true · 철거 → 신축 → 구분 변경 = false · 신축 → 철거 → 구분 변경 = true", () => {
    expect(closes(["building_built", "tax_type_changed"], false)).toEqual([true, false]);
    expect(closes(["building_removed", "tax_type_changed"], true)).toEqual([false, true]);
    expect(closes(["building_removed", "building_built", "tax_type_changed"], false)).toEqual([false, true, false]);
    expect(closes(["building_built", "tax_type_changed", "building_removed", "tax_type_changed"], false)).toEqual([true, false, false, true]);
  });

  it("범위 밖 인덱스·허용값 밖 종류는 false", () => {
    expect(eventClosesBareInterval(k("building_built"), 3, false)).toBe(false);
    expect(eventClosesBareInterval(k("foo"), 0, false)).toBe(false);
  });

  it("`eventCarriesTaxTypeBefore`(건축물 구간 운반)의 의미는 E3-①과 같다 — 신축은 false(UI가 두 술어로 교체할 때까지 호출처 의미 불변)", () => {
    expect([eventCarriesTaxTypeBefore("building_built"), eventCarriesTaxTypeBefore("building_removed"), eventCarriesTaxTypeBefore("tax_type_changed")]).toEqual([false, true, true]);
  });
});

describe("E3b-1 leaf — `eventBasisOptions`: V1-A 선택지에서 `demolished`만 뺀다 (Q-3 (가) 3종 + 모름)", () => {
  it("exempt → [statutory_exempt, unknown] · special_sum → [separate_taxation, unknown] · separate → [vacant_state, unknown](demolished 제외) · comprehensive → []", () => {
    expect(eventBasisOptions("exempt")).toEqual(["statutory_exempt", "unknown"]);
    expect(eventBasisOptions("special_sum")).toEqual(["separate_taxation", "unknown"]);
    expect(eventBasisOptions("separate")).toEqual(["vacant_state", "unknown"]);
    expect(eventBasisOptions("comprehensive")).toEqual([]);
  });
});

describe("E3b-1 leaf — `resolveBareDeclaration`: 나대지 선언 해석 표 (V1-A `resolvePropertyTaxBasis` 재사용 + 면적한도)", () => {
  type Decl = Parameters<typeof resolveBareDeclaration>[0];
  const ev = (kind: Decl["kind"], before?: Decl["propertyTaxTypeBefore"], basis?: Decl["propertyTaxBasisBefore"], limit?: Decl["areaWithinLimitBefore"]): Decl => ({ kind, propertyTaxTypeBefore: before, propertyTaxBasisBefore: basis, areaWithinLimitBefore: limit });
  const fold = (reason: string, over: Record<string, unknown> = {}) => ({ propertyTaxType: "comprehensive", basisOutcome: "unconfirmed", foldReason: reason, ...over });

  it("선언 없음: 신축 행 `\"\"`·미전송 = 종합합산(echo 키 없음 — 종전과 같다) · 구분 변경 행 `\"\"` = 모름(`unknown`)", () => {
    expect(resolveBareDeclaration(ev("building_built"))).toEqual({ propertyTaxType: "comprehensive" });
    expect(resolveBareDeclaration(ev("building_built", ""))).toEqual({ propertyTaxType: "comprehensive" });
    expect(resolveBareDeclaration(ev("tax_type_changed", ""))).toEqual({ propertyTaxType: "unknown" });
    expect(resolveBareDeclaration(ev("tax_type_changed"))).toEqual({ propertyTaxType: "unknown" });
  });

  it("`comprehensive`: 근거·한도를 읽지 않는다(stale 값이 있어도) — echo 키 없음", () => {
    for (const kind of ["building_built", "tax_type_changed"] as const) {
      expect(resolveBareDeclaration(ev(kind, "comprehensive", "vacant_state", "within"))).toEqual({ propertyTaxType: "comprehensive" });
    }
  });

  it.each([
    ["exempt", "statutory_exempt"],
    ["special_sum", "separate_taxation"],
  ] as const)("%s + %s → accepted (한도 칸은 읽지 않는다 — stale `exceeded`여도)", (declared, basis) => {
    for (const limit of [undefined, "", "exceeded", "unknown"] as const) {
      expect(resolveBareDeclaration(ev("building_built", declared, basis, limit))).toEqual({ propertyTaxType: declared, basisOutcome: "accepted", basis, declaredPropertyTaxType: declared });
    }
  });

  it("공지상태 별도합산: `within`만 accepted — `exceeded`·`unknown`·`\"\"`·미전송은 그 구간 전체를 종합합산으로 접는다(부분 면적 안분 없음 · 일부 초과 = 모름) (P-b4·b5·b6)", () => {
    expect(resolveBareDeclaration(ev("building_built", "separate", "vacant_state", "within"))).toEqual({ propertyTaxType: "separate", basisOutcome: "accepted", basis: "vacant_state", declaredPropertyTaxType: "separate" });
    const base = { basis: "vacant_state", declaredPropertyTaxType: "separate" };
    expect(resolveBareDeclaration(ev("building_built", "separate", "vacant_state", "exceeded"))).toEqual(fold("area_exceeded", base));
    for (const limit of ["unknown", "", undefined] as const) expect(resolveBareDeclaration(ev("tax_type_changed", "separate", "vacant_state", limit)), String(limit)).toEqual(fold("area_unknown", base));
  });

  it.each([
    ["separate", undefined, "unselected", false],
    ["separate", "", "unselected", false],
    ["exempt", "unknown", "unknown", true],
    ["special_sum", "unknown", "unknown", true],
    ["exempt", "vacant_state", "incompatible", true],
    ["separate", "separate_taxation", "incompatible", true],
    ["separate", "demolished", "demolished_unsupported", true],
    ["exempt", "demolished", "demolished_unsupported", true],
  ] as const)("근거 확인 불가: %s + %s → 종합합산으로 접힘(%s) — 선택한 근거는 echo에 남는다(%s)", (declared, basis, reason, hasBasis) => {
    const res = resolveBareDeclaration(ev("tax_type_changed", declared, basis));
    expect(res).toMatchObject({ propertyTaxType: "comprehensive", basisOutcome: "unconfirmed", declaredPropertyTaxType: declared, foldReason: reason });
    expect("basis" in res).toBe(hasBasis);
  });
});

describe("E3b-1 leaf — `isStateIntervalBusiness`: 나대지는 «근거가 받아들여진» 비종합합산만 사업용 (Anchor 4 · P-b7)", () => {
  const biz = (hasBuilding: boolean, propertyTaxType: "exempt" | "special_sum" | "separate" | "comprehensive" | "unknown", basisOutcome?: "accepted" | "unconfirmed") =>
    isStateIntervalBusiness({ hasBuilding, propertyTaxType, ...(basisOutcome ? { basisOutcome } : {}) });

  it("건축물 있음: 종전 그대로(구분만 본다 · basisOutcome 무관) — 비과세·분리·별도 true / 종합·모름 false", () => {
    expect(["exempt", "special_sum", "separate"].map((t) => biz(true, t as "exempt"))).toEqual([true, true, true]);
    expect([biz(true, "comprehensive"), biz(true, "unknown")]).toEqual([false, false]);
    expect(biz(true, "separate", "unconfirmed")).toBe(true); // 건축물 구간은 근거 해석 대상이 아니다
  });

  it("나대지: accepted + 비종합합산만 true — 선언 없음(basisOutcome 없음)·unconfirmed·종합합산·모름은 false", () => {
    expect(["exempt", "special_sum", "separate"].map((t) => biz(false, t as "exempt", "accepted"))).toEqual([true, true, true]);
    expect(biz(false, "separate")).toBe(false); // M-b3: hasBuilding 항 삭제 mutation이 잡히는 쪽
    expect(biz(false, "separate", "unconfirmed")).toBe(false);
    expect([biz(false, "comprehensive", "accepted"), biz(false, "unknown")]).toEqual([false, false]);
  });
});

describe("E3b-1 leaf — `stateEventSequenceIssue`: 차단 규칙 삭제 후에도 순서·교대·같은 날·하한·양도일 규칙은 불변 (Anchor 5 leaf 측)", () => {
  const row = (kind: string, date: string) => ({ kind, date });
  const issue = (events: Array<{ kind: string; date: string }>, floorDate?: string) => stateEventSequenceIssue(events, { transferDate: T, floorDate });

  it("나대지 선언 행(구분 변경)은 토글·위치와 무관하게 통과 — 선언 칸 값(근거 미선택·모름)은 막지 않는다", () => {
    expect(issue([row("tax_type_changed", "2022-06-01")])).toBeNull();
    expect(issue([row("building_removed", "2019-01-01"), row("tax_type_changed", "2021-01-01")])).toBeNull();
    expect(issue([row("tax_type_changed", "2019-01-01"), row("building_built", "2021-01-01")])).toBeNull();
  });

  it("남는 규칙: 같은 날(전 종류) · 역순 · 건축물 교대 위반 · 하한일 · 양도일 이후 · 0건 · 행 결함", () => {
    expect(issue([row("building_built", "2019-01-01"), row("tax_type_changed", "2019-01-01")])).toMatchObject({ index: 1, field: "date" });
    expect(issue([row("building_built", "2020-01-01"), row("tax_type_changed", "2019-01-01")])).toMatchObject({ index: 1, field: "date" });
    expect(issue([row("building_built", "2017-01-01"), row("tax_type_changed", "2018-01-01"), row("building_built", "2019-01-01")])).toMatchObject({ index: 2, field: "kind" });
    expect(issue([row("tax_type_changed", "2014-01-01")], "2014-01-01")).toMatchObject({ index: 0, field: "date" });
    expect(issue([row("tax_type_changed", T)])).toMatchObject({ index: 0, field: "date" });
    expect(issue([])).toMatchObject({ index: null, field: "events" });
    expect(issue([row("tax_type_changed", "")])).toMatchObject({ index: 0, field: "date" });
  });
});

describe("E3b-1 leaf — derive 불변식: 건축물 구간을 닫는 행은 나대지 선언 칸을 읽지 않는다 (P-b10)", () => {
  const start = getOwnershipStart(dayDate("2014-01-01"));
  const end = dayDate(T);
  const tail = { hasBuilding: true, propertyTaxType: "comprehensive" as const };

  it("철거 행·건축물 위 구분 변경 행에 근거·한도 stale 값이 있어도 구간은 Before(종전 E3-① 규칙)만으로 정해진다 — 근거 echo 키 없음", () => {
    const stale = { propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "exceeded" } as const;
    const iv = deriveOtherLandStateIntervals(
      [
        { kind: "tax_type_changed", date: dayDate("2018-01-01"), propertyTaxTypeBefore: "exempt", ...stale },
        { kind: "building_removed", date: dayDate("2021-01-01"), propertyTaxTypeBefore: "separate", ...stale },
      ],
      start, end, tail,
    );
    expect(iv.map((i) => [i.hasBuilding, i.propertyTaxType])).toEqual([[true, "exempt"], [true, "separate"], [false, "comprehensive"]]);
    for (const i of iv) for (const key of ["basisOutcome", "basis", "declaredPropertyTaxType", "foldReason"]) expect(key in i, key).toBe(false);
  });
});
