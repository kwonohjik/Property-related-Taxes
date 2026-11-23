/**
 * NBL-STATE-HISTORY-E3-① (E3-1a) — 이력 leaf(`other-land-state-history.ts`) 단위: «재산세 과세 구분 변경» 사건(`tax_type_changed`).
 *
 * 계획서: docs/01-plan/features/nbl-state-history-e3-1-tax-type-change.engine.plan.md §3(Before 사슬·순서 규칙·derive) · §7.2 Anchor 3·4·5(leaf 측) · 결정 기록(2026-11-23)
 * 표: `_helpers/nbl-state-history-e3-1-table.ts` — 사건 → 구간 → 사업용 구간이 표의 `biz`(손으로 쓴 독립 정답)와 같은지 전 행 대조한다.
 */
import { describe } from "vitest";
import { it } from "vitest";
import { expect } from "vitest";
import { E3_ROWS } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-1-table";
import { type E3Row } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-1-table";
import { dayDate } from "@/__tests__/tax-engine/_helpers/nbl-state-history-day-table";
import { STATE_EVENT_KIND_LABEL } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { deriveOtherLandStateIntervals } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { effectiveOtherHasBuilding } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { eventCarriesTaxTypeBefore } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { hasBuildingAtTransfer } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { isBuildingEventKind } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { isEventKind } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { stateEventRowIssue } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { stateEventSequenceIssue } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { stateHistoryBusinessIntervals } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { getOwnershipStart } from "@/lib/tax-engine/non-business-land/utils/period-math";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import type { StateEvent } from "@/lib/tax-engine/non-business-land/land-usage.types";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const T = "2024-01-01";

function eventsOf(row: E3Row): StateEvent[] {
  return row.events.map(([kind, date, before]) => ({ kind, date: dayDate(date), ...(before !== undefined && kind !== "building_built" ? { propertyTaxTypeBefore: before } : {}) }));
}

/** 표 행의 꼬리(양도일 현재): 마지막 건축물 사건이 철거이면 나대지, 그 밖에는 건축물 있음 — `e3RowRaw`와 같은 규칙. */
function tailOf(row: E3Row) {
  const b = row.events.filter(([k]) => k !== "tax_type_changed");
  const hasBuilding = b.length === 0 ? true : b[b.length - 1][0] === "building_built";
  return { hasBuilding, propertyTaxType: row.tail };
}

function derive(row: E3Row) {
  return deriveOtherLandStateIntervals(eventsOf(row), getOwnershipStart(dayDate(row.acq ?? "2014-01-01")), dayDate(row.transfer ?? T), tailOf(row));
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

describe("E3-1a leaf — §5 21행: 사건 → 구간 → 사업용 구간이 표의 `biz`와 같다 (Before 사슬)", () => {
  it.each(E3_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, row) => {
    const intervals = derive(row);
    // Σ 구간 일수 = 소유일수(빈틈·겹침 없음) · 모든 구간 길이 > 0(클립이 0일 구간을 남기지 않는다)
    const days = intervals.map((iv) => (iv.end.getTime() - iv.start.getTime()) / 86_400_000);
    expect(days.reduce((s, x) => s + x, 0)).toBe(row.expect.total);
    for (const d of days) expect(d).toBeGreaterThan(0);
    const t = tailOf(row);
    const coreBusiness = t.hasBuilding && t.propertyTaxType !== "comprehensive";
    const biz = stateHistoryBusinessIntervals(intervals, { isBusiness: coreBusiness }).map((p) => [iso(p.start), iso(p.end)] as const);
    expect(normalize(biz)).toEqual(normalize(row.biz));
  });
});

describe("E3-1a leaf — derive: Before 사슬 · 건축물 상태 replay", () => {
  it("T1: 구분 변경 하나 → 구간 2개 — [소유 첫날, 변경일) 건축물 있음·별도합산(Before) / 꼬리 건축물 있음·종합합산(입력)", () => {
    const iv = derive(E3_ROWS.find((r) => r.id === "T1")!);
    expect(iv.map((i) => [iso(i.start), iso(i.end), i.hasBuilding, i.propertyTaxType])).toEqual([
      ["2014-01-02", "2022-06-01", true, "separate"],
      ["2022-06-01", "2024-01-01", true, "comprehensive"],
    ]);
  });

  it("T6: 구분 변경 3건 → 구간 4개 — 각 구간의 구분 = 그 구간을 닫는 사건의 Before(비과세 → 분리과세 → 별도합산), 꼬리는 입력(종합합산)", () => {
    const iv = derive(E3_ROWS.find((r) => r.id === "T6")!);
    expect(iv.map((i) => [iso(i.end), i.propertyTaxType])).toEqual([
      ["2016-01-01", "exempt"], ["2018-01-01", "special_sum"], ["2021-01-01", "separate"], ["2024-01-01", "comprehensive"],
    ]);
    expect(iv.every((i) => i.hasBuilding)).toBe(true);
  });

  it("T7: 구분 변경 후 철거 — 철거가 닫는 구간은 «변경 후» 구분(종합합산)이다. Before를 한 칸 밀어 After 의미로 읽으면 별도합산이 나온다(P-E3-2)", () => {
    const iv = derive(E3_ROWS.find((r) => r.id === "T7")!);
    expect(iv.map((i) => [iso(i.end), i.hasBuilding, i.propertyTaxType])).toEqual([
      ["2019-01-01", true, "separate"],
      ["2021-01-01", true, "comprehensive"],
      ["2024-01-01", false, "comprehensive"],
    ]);
  });

  it("T8: 신축(앞 나대지 = 종합합산 고정) 뒤 구분 변경 — 나대지 구간 · 별도합산 건물 구간 · 꼬리 종합합산", () => {
    const iv = derive(E3_ROWS.find((r) => r.id === "T8")!);
    expect(iv.map((i) => [iso(i.end), i.hasBuilding, i.propertyTaxType])).toEqual([
      ["2019-01-01", false, "comprehensive"],
      ["2022-06-01", true, "separate"],
      ["2024-01-01", true, "comprehensive"],
    ]);
  });

  it("V-6 닫힘: 신축 행의 propertyTaxTypeBefore는 뜻이 없다 — 앞 나대지 구간은 항상 종합합산(T9o)", () => {
    const row = E3_ROWS.find((r) => r.id === "T9o")!;
    const withBefore = deriveOtherLandStateIntervals(
      [{ kind: "building_built", date: dayDate("2023-06-01"), propertyTaxTypeBefore: "separate" }],
      getOwnershipStart(dayDate("2014-01-01")), dayDate(T), tailOf(row),
    );
    expect(withBefore[0]).toMatchObject({ hasBuilding: false, propertyTaxType: "comprehensive" });
  });

  it("«모름»(`\"\"`): 변경 직전 구간이 `unknown` — 사업용 구간에서 빠진다(T15 · 혜택 불성립)", () => {
    const iv = derive(E3_ROWS.find((r) => r.id === "T15")!);
    expect(iv[0]).toMatchObject({ hasBuilding: true, propertyTaxType: "unknown" });
  });

  it("건축물 사건이 없으면 초기 건축물 상태 = tail.hasBuilding(입력 토글) — 구분 변경만 있는 이력(tax-only)", () => {
    const ev: StateEvent[] = [{ kind: "tax_type_changed", date: dayDate("2022-06-01"), propertyTaxTypeBefore: "separate" }];
    const out = deriveOtherLandStateIntervals(ev, getOwnershipStart(dayDate("2014-01-01")), dayDate(T), { hasBuilding: true, propertyTaxType: "comprehensive" });
    expect(out.map((i) => [i.hasBuilding, i.propertyTaxType])).toEqual([[true, "separate"], [true, "comprehensive"]]);
  });

  it("Anchor 4(E3-1b 의도된 반전 — 차단 규칙 삭제): 건축물 없는 구간 위의 구분 변경은 더 이상 오류가 아니다 — 나대지 구간 선언이다(선언이 없으면 «모름» = 종합합산으로 접힘)", () => {
    const start = getOwnershipStart(dayDate("2014-01-01"));
    const end = dayDate(T);
    const tax = (date: string): StateEvent => ({ kind: "tax_type_changed", date: dayDate(date), propertyTaxTypeBefore: "separate" });
    const removed = (date: string): StateEvent => ({ kind: "building_removed", date: dayDate(date), propertyTaxTypeBefore: "separate" });
    const built = (date: string): StateEvent => ({ kind: "building_built", date: dayDate(date) });
    const shape = (iv: ReturnType<typeof deriveOtherLandStateIntervals>) => iv.map((i) => [i.hasBuilding, i.propertyTaxType]);
    // 철거 뒤 구분 변경: [건축물 별도합산 | 나대지 — 근거 없는 별도합산은 종합합산으로 접힘 | 꼬리]
    expect(shape(deriveOtherLandStateIntervals([removed("2020-01-01"), tax("2021-01-01")], start, end, { hasBuilding: false, propertyTaxType: "comprehensive" }))).toEqual([
      [true, "separate"], [false, "comprehensive"], [false, "comprehensive"],
    ]);
    // tax-only + 건축물 없음: [나대지 접힘 | 꼬리]
    expect(shape(deriveOtherLandStateIntervals([tax("2021-01-01")], start, end, { hasBuilding: false, propertyTaxType: "comprehensive" }))).toEqual([[false, "comprehensive"], [false, "comprehensive"]]);
    // 신축 앞 구분 변경(초기 없음): 나대지 구분 변경 → 신축 앞 나대지 → 건축물
    expect(shape(deriveOtherLandStateIntervals([tax("2018-01-01"), built("2021-01-01")], start, end, { hasBuilding: true, propertyTaxType: "separate" }))).toEqual([
      [false, "comprehensive"], [false, "comprehensive"], [true, "separate"],
    ]);
    // 대조: 신축 뒤 · 철거 앞은 건축물이 있으므로 종전 그대로
    expect(() => deriveOtherLandStateIntervals([built("2018-01-01"), tax("2020-01-01"), removed("2022-01-01")], start, end, { hasBuilding: false, propertyTaxType: "comprehensive" })).not.toThrow();
  });

  it("같은 날·역순·같은 건축물 종류 연속은 종류와 무관하게/건축물끼리 오류를 던진다 (derive 안전망)", () => {
    const start = getOwnershipStart(dayDate("2014-01-01"));
    const end = dayDate(T);
    const mk = (kind: StateEvent["kind"], date: string): StateEvent => ({ kind, date: dayDate(date), propertyTaxTypeBefore: "separate" });
    const tail = { hasBuilding: true, propertyTaxType: "comprehensive" as const };
    expect(() => deriveOtherLandStateIntervals([mk("tax_type_changed", "2020-01-01"), mk("building_removed", "2020-01-01")], start, end, tail)).toThrow(TaxCalculationError);
    expect(() => deriveOtherLandStateIntervals([mk("building_removed", "2020-01-01"), mk("tax_type_changed", "2019-01-01")], start, end, tail)).toThrow(TaxCalculationError);
    // 철거 → (구분 변경은 건너뜀) → 철거 = 건축물 사건끼리 같은 종류 연속
    expect(() => deriveOtherLandStateIntervals([mk("building_removed", "2019-01-01"), mk("building_removed", "2021-01-01")], start, end, tail)).toThrow(TaxCalculationError);
  });
});

describe("E3-1a leaf — 술어: 종류 판별 · Before 운반(단일 술어) · 양도일 현재 건축물", () => {
  it("`isEventKind`는 새 종류를 허용하고 라벨 표가 3종을 가진다(Record 완전성)", () => {
    expect(isEventKind("tax_type_changed")).toBe(true);
    expect(isEventKind("")).toBe(false);
    expect(isEventKind("foo")).toBe(false);
    expect(Object.keys(STATE_EVENT_KIND_LABEL).sort()).toEqual(["building_built", "building_removed", "tax_type_changed"]);
    expect(STATE_EVENT_KIND_LABEL.tax_type_changed).toBe("재산세 과세 구분 변경");
  });

  it("`isBuildingEventKind` — 신축·멸실만 true", () => {
    expect([isBuildingEventKind("building_built"), isBuildingEventKind("building_removed"), isBuildingEventKind("tax_type_changed"), isBuildingEventKind("")]).toEqual([true, true, false, false]);
  });

  it("`eventCarriesTaxTypeBefore` — 철거·구분 변경은 true, 신축·미선택·허용값 밖은 false (⑭·④·③·⑤가 이 술어 하나를 읽는다)", () => {
    expect([
      eventCarriesTaxTypeBefore("building_built"),
      eventCarriesTaxTypeBefore("building_removed"),
      eventCarriesTaxTypeBefore("tax_type_changed"),
      eventCarriesTaxTypeBefore(""),
      eventCarriesTaxTypeBefore("foo"),
    ]).toEqual([false, true, true, false, false]);
  });

  it("`hasBuildingAtTransfer` — 마지막 «건축물» 사건 기준: 구분 변경이 마지막이어도 직전 건축물 사건을 읽는다 · 건축물 사건 0건은 undefined", () => {
    const k = (...kinds: string[]) => kinds.map((kind) => ({ kind }));
    expect(hasBuildingAtTransfer(k("tax_type_changed"))).toBeUndefined();
    expect(hasBuildingAtTransfer(k("tax_type_changed", "tax_type_changed"))).toBeUndefined();
    expect(hasBuildingAtTransfer(k("building_built", "tax_type_changed"))).toBe(true);
    expect(hasBuildingAtTransfer(k("building_removed", "tax_type_changed"))).toBe(false);
    expect(hasBuildingAtTransfer(k("tax_type_changed", "building_built"))).toBe(true);
    expect(hasBuildingAtTransfer(k("building_built", "building_removed", "tax_type_changed"))).toBe(false);
  });

  it("Anchor 3(leaf): tax-only 이력의 `effectiveOtherHasBuilding` = raw 토글 · 건축물 사건이 있으면 사건이 이긴다(구분 변경이 마지막이어도)", () => {
    const tax = [{ kind: "tax_type_changed" }];
    expect(effectiveOtherHasBuilding(true, "changed", tax)).toBe(true);
    expect(effectiveOtherHasBuilding(false, "changed", tax)).toBe(false);
    expect(effectiveOtherHasBuilding(false, "changed", [{ kind: "building_built" }, ...tax])).toBe(true);
    expect(effectiveOtherHasBuilding(true, "changed", [{ kind: "building_removed" }, ...tax])).toBe(false);
  });
});

describe("E3-1a leaf — `stateEventSequenceIssue`: 순서·교대·초기 건축물 상태 (Anchor 4·5 leaf 측)", () => {
  const row = (kind: string, date: string) => ({ kind, date });
  const issue = (events: Array<{ kind: string; date: string }>, tailHasBuilding?: boolean, floorDate?: string) =>
    stateEventSequenceIssue(events, { transferDate: T, tailHasBuilding, floorDate });

  it("tax-only(E3-1b 의도된 반전): 초기 건축물 상태가 «없음»(토글 off · 생략)이어도 차단하지 않는다 — 나대지 구간 선언이다 · `tailHasBuilding`은 결과에 영향이 없다(호출자 호환용으로만 받는다)", () => {
    const ev = [row("tax_type_changed", "2022-06-01")];
    expect(issue(ev, true)).toBeNull();
    expect(issue(ev, false)).toBeNull();
    expect(issue(ev)).toBeNull();
  });

  it("건축물 사건이 있을 때도 구분 변경 위치와 무관하게 순서 규칙만 본다(E3-1b 의도된 반전) — 철거 앞 구분 변경 · 신축 앞 구분 변경 모두 통과, 건축물 교대 위반은 여전히 차단", () => {
    expect(issue([row("tax_type_changed", "2019-01-01"), row("building_removed", "2021-01-01")], false)).toBeNull();
    expect(issue([row("tax_type_changed", "2019-01-01"), row("building_built", "2021-01-01")], true)).toBeNull();
    expect(issue([row("building_built", "2019-01-01"), row("building_built", "2021-01-01")])).toMatchObject({ index: 1, field: "kind" });
  });

  it("신축 뒤 · 철거 뒤(나대지 위) · 철거 → 신축 → 구분 변경 모두 통과(E3-1b 의도된 반전 — 나대지 위 구분 변경은 선언이다)", () => {
    expect(issue([row("building_built", "2019-01-01"), row("tax_type_changed", "2021-01-01")])).toBeNull();
    expect(issue([row("building_removed", "2019-01-01"), row("tax_type_changed", "2021-01-01")])).toBeNull();
    expect(issue([row("building_removed", "2019-01-01"), row("building_built", "2020-01-01"), row("tax_type_changed", "2021-01-01")])).toBeNull();
  });

  it("구분 변경은 교대에 참여하지 않는다 — 신축 → 구분 변경 → 신축은 «같은 종류 연속»이다(직전 건축물 사건과 비교) · 구분 변경끼리 연속은 허용", () => {
    const same = issue([row("building_built", "2018-01-01"), row("tax_type_changed", "2019-01-01"), row("building_built", "2021-01-01")]);
    expect(same).toMatchObject({ index: 2, field: "kind" });
    expect(same?.message).toContain("건축물 사건 3번째 행");
    expect(same?.message).toContain("앞 사건이 이미 「건축물 있음」입니다");
    expect(issue([row("building_built", "2018-01-01"), row("tax_type_changed", "2019-01-01"), row("tax_type_changed", "2020-01-01"), row("tax_type_changed", "2021-01-01")])).toBeNull();
    expect(issue([row("building_built", "2017-01-01"), row("tax_type_changed", "2018-01-01"), row("building_removed", "2019-01-01"), row("building_built", "2020-01-01"), row("tax_type_changed", "2021-01-01")])).toBeNull();
  });

  it("같은 날은 종류와 무관한 전 사건 기준 — 건축물 + 구분 변경 · 구분 변경 + 건축물 · 구분 변경끼리 모두 차단 (P-E3-11)", () => {
    expect(issue([row("building_built", "2019-01-01"), row("tax_type_changed", "2019-01-01")])).toMatchObject({ index: 1, field: "date" });
    expect(issue([row("tax_type_changed", "2019-01-01"), row("building_removed", "2019-01-01")], true)).toMatchObject({ index: 1, field: "date" });
    expect(issue([row("tax_type_changed", "2019-01-01"), row("tax_type_changed", "2019-01-01")], true)).toMatchObject({ index: 1, field: "date" });
  });

  it("역순 · 하한일 · 양도일은 구분 변경 행에도 같은 규칙 — 문구 접두는 종류별(구분 변경 행 «재산세 과세 구분 변경 사건 N번째 행», 건축물 행은 종전 그대로)", () => {
    const rev = issue([row("building_built", "2020-01-01"), row("tax_type_changed", "2019-01-01")]);
    expect(rev).toMatchObject({ index: 1, field: "date" });
    expect(rev?.message.startsWith("재산세 과세 구분 변경 사건 2번째 행 — ")).toBe(true);
    const floor = issue([row("tax_type_changed", "2014-01-01")], true, "2014-01-01");
    expect(floor?.message.startsWith("재산세 과세 구분 변경 사건 1번째 행 — ")).toBe(true);
    const after = issue([row("tax_type_changed", T)], true);
    expect(after?.message.startsWith("재산세 과세 구분 변경 사건 1번째 행 — ")).toBe(true);
    // 건축물 행 접두는 바이트 동일
    expect(issue([row("building_built", T)])?.message.startsWith("건축물 사건 1번째 행 — 사건일(2024-01-01)이 양도일(2024-01-01)")).toBe(true);
  });

  it("행 결함: 종류는 신규 값 허용 · 날짜 빈 칸/해석 불가 문구도 종류별 접두", () => {
    expect(stateEventRowIssue({ kind: "tax_type_changed", date: "2021-01-01" }, 0)).toBeNull();
    expect(stateEventRowIssue({ kind: "tax_type_changed", date: "" }, 2)?.message.startsWith("재산세 과세 구분 변경 사건 3번째 행 — 날짜를 입력하세요")).toBe(true);
    expect(stateEventRowIssue({ kind: "tax_type_changed", date: "2021-13-45" }, 0)?.message.startsWith("재산세 과세 구분 변경 사건 1번째 행 — 날짜(2021-13-45)")).toBe(true);
    expect(stateEventRowIssue({ kind: "building_built", date: "" }, 0)?.message.startsWith("건축물 사건 1번째 행 — 날짜를 입력하세요")).toBe(true);
    expect(stateEventRowIssue({ kind: "", date: "2021-01-01" }, 0)?.message).toContain("종류(건축물 신축 / 건축물 멸실·철거·붕괴)를 선택하세요");
  });

  it("구분 변경 행의 Before가 같은 구분(= 바로 뒤 구간 구분)이어도 차단하지 않는다 — 무해한 분할(Q-6) · derive는 구간만 둘로 가른다", () => {
    expect(issue([row("tax_type_changed", "2022-06-01")], true)).toBeNull();
    const ev: StateEvent[] = [{ kind: "tax_type_changed", date: dayDate("2022-06-01"), propertyTaxTypeBefore: "separate" }];
    const out = deriveOtherLandStateIntervals(ev, getOwnershipStart(dayDate("2014-01-01")), dayDate(T), { hasBuilding: true, propertyTaxType: "separate" });
    expect(out.map((i) => i.propertyTaxType)).toEqual(["separate", "separate"]);
  });
});
