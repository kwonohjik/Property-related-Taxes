/**
 * NBL-STATE-HISTORY-E1 — 이력 leaf(`other-land-state-history.ts`) 단위 테스트.
 *
 * 계획서: docs/01-plan/features/nbl-other-land-state-history.engine.plan.md §3.6(경계) · §4.2(산식) · §6(케이스 매트릭스) · §7.4 E1
 * 결정(2026-11-22): V-1 일 단위 · **Q-15 (가′)** · 「모름」 = 혜택 불성립 + 확인 필요.
 *
 * 핵심 대조: E0 정답표 `DAY_ROWS`(`_helpers/nbl-state-history-day-table.ts`)의 **모든 행**을 «사건 → 구간 → 사업용 구간 → 영 §168조의6 판정»으로 재현해
 * 표의 `biz`(사업 구간)·판정·일수와 같은지 본다. 표의 행이 늘면 아래 `EVENT_ROWS`에도 추가해야 한다(완전성 단언).
 * 이 파일은 E1에서 **판정 경로에 연결되지 않은** leaf를 직접 호출한다 — 연결은 E2.
 */
import { describe } from "vitest";
import { it } from "vitest";
import { expect } from "vitest";
import { DAY_ROWS } from "@/__tests__/tax-engine/_helpers/nbl-state-history-day-table";
import { dayDate } from "@/__tests__/tax-engine/_helpers/nbl-state-history-day-table";
import { evalDayRow } from "@/__tests__/tax-engine/_helpers/nbl-state-history-day-table";
import { type DayRow } from "@/__tests__/tax-engine/_helpers/nbl-state-history-day-table";
import { consumesStateHistory } from "@/lib/tax-engine/non-business-land/land-category";
import { deriveOtherLandStateIntervals } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { hasBuildingAtTransfer } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { isStateIntervalBusiness } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { STATE_EVENT_KIND_LABEL } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { STATE_PROPERTY_TAX_TYPE_LABEL } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { stateEventRowIssue } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { stateEventSequenceIssue } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { stateHistoryBusinessIntervals } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { GRACE_REASON_SPECS } from "@/lib/tax-engine/non-business-land/grace-reason-period";
import { meetsPeriodCriteria } from "@/lib/tax-engine/non-business-land/period-criteria";
import { PROPERTY_TAX_TYPE_LABEL } from "@/lib/tax-engine/non-business-land/property-tax-type-label";
import { mergeOverlappingPeriods } from "@/lib/tax-engine/non-business-land/utils/period-math";
import { getOwnershipStart } from "@/lib/tax-engine/non-business-land/utils/period-math";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { LandStateInterval } from "@/lib/tax-engine/non-business-land/land-usage.types";
import type { PropertyTaxType } from "@/lib/tax-engine/non-business-land/land-usage.types";
import type { StateEvent } from "@/lib/tax-engine/non-business-land/land-usage.types";
import type { StateEventKind } from "@/lib/tax-engine/non-business-land/land-usage.types";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { TaxErrorCode } from "@/lib/tax-engine/tax-errors";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const B: StateEventKind = "building_built";
const R: StateEventKind = "building_removed";
const ev = (kind: StateEventKind, date: string, tax?: PropertyTaxType | ""): StateEvent => ({ kind, date: dayDate(date), ...(tax !== undefined ? { propertyTaxTypeBefore: tax } : {}) });
const SEP = "separate";

/** 사건 → 구간. 꼬리의 재산세 구분은 판정에 영향이 없다(core가 정한다) — core 사업용이면 별도합산·아니면 종합합산으로 둔다. */
function derive(acq: string, transfer: string, events: StateEvent[], coreBusiness = false): LandStateInterval[] {
  return deriveOtherLandStateIntervals(events, getOwnershipStart(dayDate(acq)), dayDate(transfer), {
    hasBuilding: coreBusiness,
    propertyTaxType: coreBusiness ? "separate" : "comprehensive",
  });
}

const spans = (xs: ReadonlyArray<{ start: Date; end: Date }>) => xs.map((x) => [iso(x.start), iso(x.end)] as const);

// ─────────────────────────────────────────────────────────────
// 1. E0 정답표(DAY_ROWS) 전 행 재현 — 사건 → 구간 → 사업용 구간 → 판정
// ─────────────────────────────────────────────────────────────
const A = "2014-01-01";
const T = "2024-01-01";
const RM_2021 = [ev(R, "2021-01-01", SEP)];

/** [행 id, 취득일, 양도일, 사건, core가 꼬리를 사업용으로 결론냈는가] — core 자체 사업기간 경로(DM-01·3호)는 아래 §6에서 따로 본다. */
const EVENT_ROWS: ReadonlyArray<readonly [string, string, string, StateEvent[], boolean]> = [
  ["M1", A, T, RM_2021, false],
  ["M2", A, T, RM_2021, false],
  ["M3", A, T, [ev(R, "2019-01-01", SEP)], false],
  ["M4", A, T, [ev(R, "2022-06-01", SEP)], false],
  ["M4b", A, T, [ev(R, "2022-06-02", SEP)], false],
  ["M5", A, "2025-06-01", RM_2021, false],
  ["M6", A, T, [ev(B, "2023-06-01")], true],
  ["M6b", A, T, [ev(B, "2023-06-02")], true],
  ["M7", A, T, [ev(B, "2023-06-01")], true],
  ["M8a", A, T, [ev(B, "2022-01-01")], true],
  ["M8b", A, T, [ev(B, "2022-01-02")], true],
  ["M8c-731", A, "2024-03-01", [ev(B, "2022-03-01")], true],
  ["M8c-730", A, "2024-03-01", [ev(B, "2022-03-02")], true],
  ["Z-1460", A, T, [ev(R, "2020-01-02", SEP)], false],
  ["Z-1461", A, T, [ev(R, "2020-01-01", SEP)], false],
  ["Z-1462", A, T, [ev(R, "2019-12-31", SEP)], false],
  ["GA-730", A, T, [ev(B, "2019-01-01"), ev(R, "2022-01-01", SEP)], false],
  ["GA-731", A, T, [ev(B, "2019-01-01"), ev(R, "2021-12-31", SEP)], false],
  ["GA-729", A, T, [ev(B, "2019-01-01"), ev(R, "2022-01-02", SEP)], false],
  ["R1a", A, T, [ev(R, "2020-05-31", SEP)], false],
  ["R1b", A, T, [ev(R, "2020-06-02", SEP)], false],
  ["R2", A, T, [ev(R, "2020-06-01", SEP)], false],
  ["R3", A, T, [ev(R, "2020-06-01", "")], false],
  ["S1", A, T, [ev(R, "2022-03-01", SEP), ev(B, "2022-05-01")], true],
  ["S2", A, T, [ev(B, "2023-03-01"), ev(R, "2023-04-01", SEP)], false],
  ["P2", A, "2024-03-15", [ev(R, "2024-02-01", SEP)], false],
  ["P3", A, "2024-09-15", [ev(B, "2024-07-01")], true],
  ["M17", "2020-02-29", "2024-02-29", [ev(B, "2023-01-01")], true],
  ["M17b", A, T, [ev(R, "2020-02-29", SEP)], false],
  ["M13", "2022-07-01", T, [ev(B, "2023-10-01")], true],
  ["P1", "2021-09-01", T, [ev(B, "2022-03-01")], true],
  ["M14-지분1", A, T, RM_2021, false],
  ["M14-지분2", "2020-01-01", T, RM_2021, false],
  ["M14-지분3", "2021-06-01", T, RM_2021, false],
  ["M16", "2023-12-31", T, [], false],
  ["M16b-사업", "2023-12-30", T, [], true],
  ["M16b-나대지", "2023-12-30", T, [], false],
  ["M16c", "2023-12-30", T, [ev(B, "2023-12-31")], true],
  ["E=T-1", A, T, [ev(B, "2023-12-31")], true],
  ["E=OS", A, T, [ev(R, "2014-01-02", SEP)], false],
  ["G1", A, T, [ev(B, "2022-06-01")], true],
  ["G2", A, T, [ev(R, "2020-06-01", SEP)], false],
];

describe("NBL-STATE-HISTORY-E1 — E0 정답표(DAY_ROWS) 재현", () => {
  it("완전성: 정답표의 모든 행이 사건 표에 있다(행이 늘면 여기도 늘려야 한다)", () => {
    expect(EVENT_ROWS.map((r) => r[0]).sort()).toEqual(DAY_ROWS.map((r) => r.id).sort());
  });

  it.each(EVENT_ROWS.map((r) => [r[0], r] as const))("%s — 사건에서 만든 사업용 구간이 정답표 biz와 같고 판정·일수가 같다", (id, [, acq, transfer, events, coreBusiness]) => {
    const row = DAY_ROWS.find((r) => r.id === id) as DayRow;
    const intervals = derive(acq, transfer, events, coreBusiness);

    // Σ 구간 일수 = 소유일수 · 빈틈·겹침 없음 · 0일 구간 없음
    const total = intervals.reduce((s, x) => s + (x.end.getTime() - x.start.getTime()) / 86_400_000, 0);
    expect(total).toBe(row.expect.total);
    if (intervals.length > 0) {
      expect(iso(intervals[0].start)).toBe(iso(getOwnershipStart(dayDate(acq))));
      expect(iso(intervals[intervals.length - 1].end)).toBe(transfer);
    }
    intervals.forEach((x, i) => {
      expect(x.end.getTime()).toBeGreaterThan(x.start.getTime());
      if (i > 0) expect(iso(x.start)).toBe(iso(intervals[i - 1].end));
    });

    // 사업용 구간 = 정답표 biz (병합 후 비교 — 0일 구간·인접 구간 표기 차이를 흡수)
    const biz = stateHistoryBusinessIntervals(intervals, { isBusiness: coreBusiness });
    const merged = mergeOverlappingPeriods(biz);
    const expected = mergeOverlappingPeriods(row.biz.map(([a, b]) => ({ start: dayDate(a), end: dayDate(b) })));
    expect(spans(merged)).toEqual(spans(expected));

    // 판정·일수 — 같은 구간을 영 §168조의6에 넣은 값이 정답표 기대값과 같다
    const r = evalDayRow({ acq, transfer, biz: spans(merged), grace: row.grace });
    expect(r.meets).toBe(row.expect.meets);
    expect(r.totalOwnershipDays).toBe(row.expect.total);
    expect(r.effectiveBusinessDays).toBe(row.expect.eff);
  });
});

// ─────────────────────────────────────────────────────────────
// 2. deriveOtherLandStateIntervals — 상태·재산세 구분·경계
// ─────────────────────────────────────────────────────────────
describe("NBL-STATE-HISTORY-E1 — deriveOtherLandStateIntervals", () => {
  it("사건 0건: 소유기간 전체가 꼬리 한 구간(꼬리 입력 그대로)", () => {
    const xs = derive(A, T, [], true);
    expect(xs).toHaveLength(1);
    expect(spans(xs)).toEqual([["2014-01-02", T]]);
    expect(xs[0]).toMatchObject({ hasBuilding: true, propertyTaxType: "separate" });
  });

  it("첫 사건이 신축이면 그 전은 나대지(종합합산 고정) · 이후 꼬리는 건축물 있음", () => {
    const xs = derive(A, T, [ev(B, "2023-06-01")], true);
    expect(spans(xs)).toEqual([["2014-01-02", "2023-06-01"], ["2023-06-01", T]]);
    expect(xs[0]).toMatchObject({ hasBuilding: false, propertyTaxType: "comprehensive" });
    expect(xs[1]).toMatchObject({ hasBuilding: true });
  });

  it("첫 사건이 멸실이면 그 전은 건축물 있음 — 재산세 구분은 그 철거 사건의 `propertyTaxTypeBefore`", () => {
    const xs = derive(A, T, [ev(R, "2021-01-01", "special_sum")]);
    expect(xs[0]).toMatchObject({ hasBuilding: true, propertyTaxType: "special_sum" });
    expect(xs[1]).toMatchObject({ hasBuilding: false });
  });

  it("철거 사건의 재산세 구분 `\"\"`(모름) → \"unknown\" · 미지정(undefined)도 모름", () => {
    expect(derive(A, T, [ev(R, "2021-01-01", "")])[0].propertyTaxType).toBe("unknown");
    expect(derive(A, T, [ev(R, "2021-01-01")])[0].propertyTaxType).toBe("unknown");
  });

  it("재신축: 멸실 → 신축이면 건축물 구간 · 나대지 구간 · 꼬리(건축물)가 번갈아 온다 — 각 건축물 구간의 구분은 그것을 닫은 철거 사건 것", () => {
    const xs = derive(A, T, [ev(B, "2016-01-01"), ev(R, "2018-01-01", "exempt"), ev(B, "2020-01-01"), ev(R, "2022-01-01", "comprehensive")]);
    expect(xs.map((x) => [x.hasBuilding, x.propertyTaxType])).toEqual([
      [false, "comprehensive"],
      [true, "exempt"],
      [false, "comprehensive"],
      [true, "comprehensive"],
      [false, "comprehensive"],
    ]);
  });

  it("경계 E = OS(소유 첫날): 앞 구간이 0일이라 버려진다 — 구간이 꼬리 하나", () => {
    const xs = derive(A, T, [ev(R, "2014-01-02", SEP)]);
    expect(spans(xs)).toEqual([["2014-01-02", T]]);
    expect(xs[0].hasBuilding).toBe(false);
  });

  it("경계 E = T − 1: 꼬리가 1일", () => {
    const xs = derive(A, T, [ev(B, "2023-12-31")], true);
    expect(spans(xs)[1]).toEqual(["2023-12-31", T]);
  });

  it("사건일 ≤ 취득일(축 B 늦은 지분·클립): 사건을 순서대로 적용한 결과가 소유 첫날 상태 — 앞 구간은 버려진다", () => {
    // 지분 취득 2021-06-01(OS 2021-06-02): 철거 2021-01-01은 소유 전 → 건축물 없음으로 시작
    const xs = derive("2021-06-01", T, RM_2021);
    expect(spans(xs)).toEqual([["2021-06-02", T]]);
    expect(xs[0].hasBuilding).toBe(false);
    // 신축·멸실이 모두 소유 전: 최종 상태(건축물 있음)가 소유 첫날 상태
    const xs2 = derive("2021-06-01", T, [ev(R, "2016-01-01", SEP), ev(B, "2018-01-01")], true);
    expect(spans(xs2)).toEqual([["2021-06-02", T]]);
    expect(xs2[0].hasBuilding).toBe(true);
  });

  it("클립 부분 적용: 소유 시작이 사건 사이에 있으면 그 사건 구간의 남은 일수만 남는다", () => {
    // 지분 취득 2020-01-01: 철거 2021-01-01 앞 구간은 [2020-01-02, 2021-01-01)만(366일 — 윤년 2020)
    const xs = derive("2020-01-01", T, RM_2021);
    expect(spans(xs)).toEqual([["2020-01-02", "2021-01-01"], ["2021-01-01", T]]);
    expect(xs[0]).toMatchObject({ hasBuilding: true, propertyTaxType: "separate" });
  });

  it("윤일: 사건일 2020-02-29가 취득일(2020-02-29)이면 클립 · 취득일 전날이면 소유 첫날 3/1부터 시작", () => {
    const xs = derive("2020-02-29", "2024-02-29", [ev(B, "2023-01-01")], true);
    expect(spans(xs)).toEqual([["2020-03-01", "2023-01-01"], ["2023-01-01", "2024-02-29"]]);
    expect(derive(A, T, [ev(R, "2020-02-29", SEP)]).map((x) => iso(x.end))).toEqual(["2020-02-29", T]);
  });

  it("소유 0일(취득 2023-12-31 · 양도 2024-01-01): 구간 없음", () => {
    expect(derive("2023-12-31", T, [])).toEqual([]);
  });

  it("사건이 있으면 꼬리의 건축물 유무는 마지막 사건 종류가 정한다 — 꼬리 입력과 모순돼도 사건이 이긴다(V-19)", () => {
    const xs = deriveOtherLandStateIntervals([ev(B, "2023-06-01")], getOwnershipStart(dayDate(A)), dayDate(T), { hasBuilding: false, propertyTaxType: "comprehensive" });
    expect(xs[xs.length - 1].hasBuilding).toBe(true);
    const ys = deriveOtherLandStateIntervals([ev(R, "2021-01-01", SEP)], getOwnershipStart(dayDate(A)), dayDate(T), { hasBuilding: true, propertyTaxType: "separate" });
    expect(ys[ys.length - 1].hasBuilding).toBe(false);
  });

  it("hasBuildingAtTransfer: 마지막 사건 종류 · 사건 없음 = undefined", () => {
    expect(hasBuildingAtTransfer([])).toBeUndefined();
    expect(hasBuildingAtTransfer([{ kind: B }])).toBe(true);
    expect(hasBuildingAtTransfer([{ kind: B }, { kind: R }])).toBe(false);
  });

  it("속성: 무작위 유효 사건열 300건 — Σ 구간 일수 = 소유일수 · 빈틈·겹침·0일 구간 없음 · 마지막 = 꼬리", () => {
    let seed = 20261122;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const base = dayDate("2010-01-01").getTime();
    const DAY = 86_400_000;
    for (let n = 0; n < 300; n++) {
      const acqT = base + Math.floor(rnd() * 3000) * DAY;
      const transferT = acqT + (2 + Math.floor(rnd() * 5000)) * DAY;
      const count = Math.floor(rnd() * 5);
      const times = new Set<number>();
      const days = Math.floor((transferT - (base - 1500 * DAY)) / DAY) - 1; // 마지막 사건일 < 양도일
      while (times.size < count) times.add(base - 1500 * DAY + Math.floor(rnd() * days) * DAY);
      const sorted = [...times].sort((a, b) => a - b);
      let kind: StateEventKind = rnd() < 0.5 ? B : R;
      const events: StateEvent[] = sorted.map((t) => {
        const e: StateEvent = { kind, date: new Date(t), propertyTaxTypeBefore: kind === R ? "separate" : undefined };
        kind = kind === B ? R : B;
        return e;
      });
      const os = getOwnershipStart(new Date(acqT));
      const xs = deriveOtherLandStateIntervals(events, os, new Date(transferT), { hasBuilding: false, propertyTaxType: "comprehensive" });
      const sum = xs.reduce((s, x) => s + (x.end.getTime() - x.start.getTime()) / DAY, 0);
      expect(sum).toBe((transferT - os.getTime()) / DAY);
      expect(xs[0].start.getTime()).toBe(os.getTime());
      expect(xs[xs.length - 1].end.getTime()).toBe(transferT);
      xs.forEach((x, i) => {
        expect(x.end.getTime()).toBeGreaterThan(x.start.getTime());
        if (i > 0) expect(x.start.getTime()).toBe(xs[i - 1].end.getTime());
      });
    }
  });
});

describe("NBL-STATE-HISTORY-E1 — deriveOtherLandStateIntervals 사전 조건 위반은 침묵 보정하지 않고 오류", () => {
  const run = (events: StateEvent[]) => derive(A, T, events);
  const expectInvalid = (fn: () => unknown) => {
    try {
      fn();
      throw new Error("오류가 나야 한다");
    } catch (e) {
      expect(e).toBeInstanceOf(TaxCalculationError);
      expect((e as TaxCalculationError).code).toBe(TaxErrorCode.INVALID_INPUT);
    }
  };

  it("같은 날 2건", () => expectInvalid(() => run([ev(R, "2021-01-01", SEP), ev(B, "2021-01-01")])));
  it("날짜 역순(자동 정렬하지 않는다)", () => expectInvalid(() => run([ev(B, "2022-01-01"), ev(R, "2021-01-01", SEP)])));
  it("같은 종류 연속(신축 뒤 신축)", () => expectInvalid(() => run([ev(B, "2016-01-01"), ev(B, "2018-01-01")])));
  it("같은 종류 연속(멸실 뒤 멸실)", () => expectInvalid(() => run([ev(R, "2016-01-01", SEP), ev(R, "2018-01-01", SEP)])));
  it("사건일 = 양도일", () => expectInvalid(() => run([ev(B, T)])));
  it("사건일 > 양도일", () => expectInvalid(() => run([ev(B, "2024-06-01")])));
});

// ─────────────────────────────────────────────────────────────
// 3. isStateIntervalBusiness
// ─────────────────────────────────────────────────────────────
describe("NBL-STATE-HISTORY-E1 — isStateIntervalBusiness (이전 구간: 건축물 있음 ∧ 구분 ∈ {비과세·면제, 분리과세, 별도합산})", () => {
  const TYPES: ReadonlyArray<readonly [LandStateInterval["propertyTaxType"], boolean]> = [
    ["exempt", true],
    ["special_sum", true],
    ["separate", true],
    ["comprehensive", false],
    ["unknown", false], // 모름 = 혜택 불성립
  ];
  it.each(TYPES)("건축물 있음 + %s → %s", (propertyTaxType, expected) => {
    expect(isStateIntervalBusiness({ hasBuilding: true, propertyTaxType })).toBe(expected);
  });
  it.each(TYPES)("건축물 없음(나대지) + %s → 항상 비사업용", (propertyTaxType) => {
    expect(isStateIntervalBusiness({ hasBuilding: false, propertyTaxType })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// 4. 사건 행·순서 검증 (⑧·⑫ 공용 issue leaf)
// ─────────────────────────────────────────────────────────────
describe("NBL-STATE-HISTORY-E1 — stateEventRowIssue", () => {
  it.each([
    [{ kind: "", date: "2021-01-01" }, "kind"],
    [{ kind: "demolished", date: "2021-01-01" }, "kind"],
    [{ kind: B, date: "" }, "date"],
    [{ kind: B, date: "2021-13-45" }, "date"],
    [{ kind: R, date: "abc" }, "date"],
  ])("%j → %s 칸 결함", (row, field) => {
    const issue = stateEventRowIssue(row, 2);
    expect(issue).toMatchObject({ index: 2, field });
    expect(issue!.message).toContain("3번째 행");
  });
  it("종류·날짜가 정상이면 null", () => {
    expect(stateEventRowIssue({ kind: B, date: "2021-01-01" }, 0)).toBeNull();
    expect(stateEventRowIssue({ kind: R, date: "2020-02-29" }, 0)).toBeNull();
  });
  it("종류 결함이 날짜 결함보다 먼저 보고된다(화면 순서)", () => {
    expect(stateEventRowIssue({ kind: "", date: "" }, 0)!.field).toBe("kind");
  });
});

describe("NBL-STATE-HISTORY-E1 — stateEventSequenceIssue", () => {
  const OPTS = { transferDate: T, floorDate: A };
  const rows = (...r: Array<[string, string]>) => r.map(([kind, date]) => ({ kind, date }));

  it("#2 사건 0건 → events 컨테이너 결함(index null)", () => {
    expect(stateEventSequenceIssue([], OPTS)).toMatchObject({ index: null, field: "events" });
  });

  it("정상 시퀀스는 null — 번갈아 · 엄격 증가 · 하한·양도일 사이", () => {
    expect(stateEventSequenceIssue(rows([R, "2021-01-01"], [B, "2022-01-01"], [R, "2023-01-01"]), OPTS)).toBeNull();
  });

  it("#5 역순: 두 번째 행이 앞 사건보다 빠르면 그 행의 date 결함", () => {
    expect(stateEventSequenceIssue(rows([B, "2022-01-01"], [R, "2021-01-01"]), OPTS)).toMatchObject({ index: 1, field: "date" });
  });

  it("#5 같은 날 2건(종류가 달라도) → date 결함", () => {
    const issue = stateEventSequenceIssue(rows([R, "2021-01-01"], [B, "2021-01-01"]), OPTS);
    expect(issue).toMatchObject({ index: 1, field: "date" });
    expect(issue!.message).toContain("같은 날");
  });

  it("#8 같은 종류 연속(신축 뒤 신축) → 뒤 행 kind 결함 · 빠진 사건 종류 라벨을 밝힌다", () => {
    const issue = stateEventSequenceIssue(rows([B, "2016-01-01"], [B, "2018-01-01"]), OPTS);
    expect(issue).toMatchObject({ index: 1, field: "kind" });
    expect(issue!.message).toContain("건축물 있음");
    expect(issue!.message).toContain(STATE_EVENT_KIND_LABEL.building_removed);
  });

  it("#8 같은 종류 연속(멸실 뒤 멸실)", () => {
    const issue = stateEventSequenceIssue(rows([R, "2016-01-01"], [R, "2018-01-01"]), OPTS);
    expect(issue).toMatchObject({ index: 1, field: "kind" });
    expect(issue!.message).toContain("건축물 없음");
    expect(issue!.message).toContain(STATE_EVENT_KIND_LABEL.building_built);
  });

  it("첫 행의 종류는 제한이 없다(신축·멸실 모두 허용 — 첫 사건이 취득 당시 상태를 정한다)", () => {
    expect(stateEventSequenceIssue(rows([B, "2016-01-01"]), OPTS)).toBeNull();
    expect(stateEventSequenceIssue(rows([R, "2016-01-01"]), OPTS)).toBeNull();
  });

  it("#7 사건일 = 양도일 → 차단 · 양도일 − 1 → 허용 · 양도일 이후 → 차단", () => {
    expect(stateEventSequenceIssue(rows([B, T]), OPTS)).toMatchObject({ index: 0, field: "date" });
    expect(stateEventSequenceIssue(rows([B, "2023-12-31"]), OPTS)).toBeNull();
    expect(stateEventSequenceIssue(rows([B, "2024-06-01"]), OPTS)).toMatchObject({ index: 0, field: "date" });
  });

  it("#6 하한일(⑧만): 사건일 = 취득일 → 차단 · 취득일 + 1 → 허용", () => {
    expect(stateEventSequenceIssue(rows([R, A]), OPTS)).toMatchObject({ index: 0, field: "date" });
    expect(stateEventSequenceIssue(rows([R, "2014-01-02"]), OPTS)).toBeNull();
    expect(stateEventSequenceIssue(rows([R, "2013-12-31"]), OPTS)).toMatchObject({ index: 0, field: "date" });
  });

  it("⑫ 모드: `floorDate`를 넘기지 않으면 하한 규칙이 없다(축 B 늦은 지분 400 방지) — 취득일 이전 사건도 통과", () => {
    expect(stateEventSequenceIssue(rows([R, "2013-12-31"]), { transferDate: T })).toBeNull();
  });

  it("양도일이 비었거나 해석 불가면 #7은 건너뛴다(앞 단계 검증 몫 · 중복 오류 금지)", () => {
    expect(stateEventSequenceIssue(rows([B, "2030-01-01"]), { transferDate: "" })).toBeNull();
    expect(stateEventSequenceIssue(rows([B, "2030-01-01"]), { transferDate: "garbage" })).toBeNull();
  });

  it("첫 오류는 화면 순서: 1행 날짜 결함이 2행 종류 결함보다 먼저", () => {
    const issue = stateEventSequenceIssue(rows([B, ""], [B, "2018-01-01"]), OPTS);
    expect(issue).toMatchObject({ index: 0, field: "date" });
  });

  it("행 결함이 있는 행은 순서 검사에 쓰이지 않고 그 행 결함이 먼저 보고된다", () => {
    expect(stateEventSequenceIssue(rows([B, "2016-01-01"], ["", "2015-01-01"]), OPTS)).toMatchObject({ index: 1, field: "kind" });
  });

  it("문구의 행 번호는 1부터", () => {
    expect(stateEventSequenceIssue(rows([B, "2016-01-01"], [B, "2018-01-01"]), OPTS)!.message).toContain("2번째 행");
  });
});

// ─────────────────────────────────────────────────────────────
// 5. 라벨 단일 소스
// ─────────────────────────────────────────────────────────────
describe("NBL-STATE-HISTORY-E1 — 라벨", () => {
  it("재산세 구분 라벨은 PROPERTY_TAX_TYPE_LABEL 단일 소스를 그대로 쓰고 「모름」만 더한다", () => {
    expect(STATE_PROPERTY_TAX_TYPE_LABEL).toMatchObject(PROPERTY_TAX_TYPE_LABEL);
    expect(STATE_PROPERTY_TAX_TYPE_LABEL.unknown).toBe("모름");
    expect(Object.keys(STATE_PROPERTY_TAX_TYPE_LABEL).sort()).toEqual([...Object.keys(PROPERTY_TAX_TYPE_LABEL), "unknown"].sort());
  });
  it("철거 사건 라벨은 유예 사유 9호 라벨과 같은 표기", () => {
    expect(GRACE_REASON_SPECS.demolition.label.startsWith(STATE_EVENT_KIND_LABEL.building_removed)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// 6. Q-15 (가′) — core 자체 사업기간(DM-01 · 3호)과 이력의 결합
// ─────────────────────────────────────────────────────────────
describe("NBL-STATE-HISTORY-E1 — stateHistoryBusinessIntervals · Q-15 (가′)", () => {
  const judge = (acq: string, transfer: string, events: StateEvent[], core: Parameters<typeof stateHistoryBusinessIntervals>[1]) => {
    const intervals = derive(acq, transfer, events, core.isBusiness);
    const biz = stateHistoryBusinessIntervals(intervals, core);
    return { biz, r: meetsPeriodCriteria(biz, dayDate(acq), dayDate(transfer), "other_land", DEFAULT_NON_BUSINESS_LAND_RULES) };
  };
  const own = (a: string, b: string) => [{ start: dayDate(a), end: dayDate(b) }];

  // Q15a — DM-01: 개시일 2024-03-01 · 철거 2016-01-01(별도합산) · 양도 2024-06-30. core는 비사업용(개시일 이후 121일뿐).
  it("Q15a DM-01 × 이력: 건축물 구간 729 + 개시일 이후 121 = 사업 850 · 비사업용 — 이력 1건으로 비사업용 → 사업용이 되지 않는다", () => {
    const { r, biz } = judge(A, "2024-06-30", [ev(R, "2016-01-01", SEP)], { isBusiness: false, ownBusinessPeriods: own("2024-03-01", "2024-06-30") });
    expect(spans(mergeOverlappingPeriods(biz))).toEqual([["2014-01-02", "2016-01-01"], ["2024-03-01", "2024-06-30"]]);
    expect(r.effectiveBusinessDays).toBe(850);
    expect(r.meets).toBe(false);
  });

  // 3호: 취득 2021-01-01 · 조성 완료 2021-01-02 · 양도 2024-01-01(소유 1,094일) · 신축 2021-07-01. 현행 core = 3호 구간 730일 사업용.
  it("V-21 3호 × 이력 (가′): 신축 앞 구간에 걸친 3호 사업기간 185일도 센다 → 730/1,094 사업용(현행 core와 같은 결론)", () => {
    const { r, biz } = judge("2021-01-01", "2024-01-01", [ev(B, "2021-07-01")], { isBusiness: true, ownBusinessPeriods: own("2021-01-02", "2023-01-02") });
    expect(spans(mergeOverlappingPeriods(biz))).toEqual([["2021-01-02", "2023-01-02"]]);
    expect(r.totalOwnershipDays).toBe(1094);
    expect(r.effectiveBusinessDays).toBe(730);
    expect(r.meets).toBe(true);
  });

  it("V-21 3호: (가) 문언(꼬리 ∩ 자체 사업기간)이었다면 550 비사업용 — (가′)와 갈리는 지점(E0 anchor는 (가) 문언 값)", () => {
    const intervals = derive("2021-01-01", "2024-01-01", [ev(B, "2021-07-01")], true);
    const tail = intervals[intervals.length - 1];
    const gaWording = [{ start: tail.start, end: dayDate("2023-01-02") }];
    const r = meetsPeriodCriteria(gaWording, dayDate("2021-01-01"), dayDate("2024-01-01"), "other_land", DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.effectiveBusinessDays).toBe(550);
    expect(r.meets).toBe(false);
  });

  // DM-01 V-21 시료: 개시일 2022-01-01 · 신축 2023-01-01 · 취득 2014-01-01 · 양도 2024-06-30(소유 3,832일). 현행 core 911/3,832 사업용.
  it("V-21 DM-01 × 이력 (가′): 신축(2023-01-01) 앞 구간에 걸친 개시일(2022-01-01) 이후도 센다 → 911/3,832 사업용(현행 core와 같음)", () => {
    const { r } = judge(A, "2024-06-30", [ev(B, "2023-01-01")], { isBusiness: true, ownBusinessPeriods: own("2022-01-01", "2024-06-30") });
    expect(r.totalOwnershipDays).toBe(3832);
    expect(r.effectiveBusinessDays).toBe(911);
    const noHistory = meetsPeriodCriteria(own("2022-01-01", "2024-06-30"), dayDate(A), dayDate("2024-06-30"), "other_land", DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.meets).toBe(noHistory.meets);
  });

  it("V-21 DM-01: (가) 문언(꼬리 ∩ 자체 사업기간)이었다면 546 비사업용 — (가′)의 911 사업용과 갈리는 지점", () => {
    const intervals = derive(A, "2024-06-30", [ev(B, "2023-01-01")], true);
    const tail = intervals[intervals.length - 1];
    const r = meetsPeriodCriteria([{ start: tail.start, end: dayDate("2024-06-30") }], dayDate(A), dayDate("2024-06-30"), "other_land", DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.effectiveBusinessDays).toBe(546);
    expect(r.meets).toBe(false);
  });

  it("자체 사업기간이 있으면 core 결과(isBusiness)와 무관하게 그 구간을 센다 — 자체 구간 [] 이면 꼬리는 사업용이 아니다", () => {
    const a = judge(A, T, [ev(B, "2023-06-01")], { isBusiness: true, ownBusinessPeriods: [] });
    expect(a.biz).toEqual([]);
    const b = judge(A, T, [ev(B, "2023-06-01")], { isBusiness: false, ownBusinessPeriods: own("2023-09-01", T) });
    expect(spans(b.biz)).toEqual([["2023-09-01", T]]);
  });

  it("자체 사업기간은 소유기간으로 잘린다(소유 시작 전 · 양도일 뒤는 세지 않는다)", () => {
    const { biz } = judge(A, T, [ev(R, "2021-01-01", SEP)], { isBusiness: false, ownBusinessPeriods: own("2010-01-01", "2014-06-01") });
    expect(spans(mergeOverlappingPeriods(biz))).toEqual([["2014-01-02", "2021-01-01"]]); // 건축물 구간(이전)과 자체 구간이 겹쳐 병합 → 중복 계상 없음
    const { biz: late } = judge(A, T, [ev(B, "2023-06-01")], { isBusiness: true, ownBusinessPeriods: own("2023-12-01", "2025-01-01") });
    expect(spans(late)).toEqual([["2023-12-01", T]]);
  });

  it("자체 사업기간이 없을 때(`undefined`): core 사업용 → 꼬리 전체 · core 비사업용 → 꼬리 없음(이전 구간만)", () => {
    const yes = judge(A, T, [ev(R, "2021-01-01", SEP)], { isBusiness: true });
    expect(spans(mergeOverlappingPeriods(yes.biz))).toEqual([["2014-01-02", T]]);
    const no = judge(A, T, [ev(R, "2021-01-01", SEP)], { isBusiness: false });
    expect(spans(no.biz)).toEqual([["2014-01-02", "2021-01-01"]]);
  });

  it("모름(`unknown`)·종합합산·나대지 이전 구간은 사업용으로 세지 않는다 — 자체 사업기간이 없으면 구간 없음", () => {
    expect(stateHistoryBusinessIntervals(derive(A, T, [ev(R, "2021-01-01", "")]), { isBusiness: false })).toEqual([]);
    expect(stateHistoryBusinessIntervals(derive(A, T, [ev(R, "2021-01-01", "comprehensive")]), { isBusiness: false })).toEqual([]);
    expect(stateHistoryBusinessIntervals([], { isBusiness: true })).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// 7. 소비표 — 상태 이력 열
// ─────────────────────────────────────────────────────────────
describe("NBL-STATE-HISTORY-E1 — INPUT_CONSUMPTION.stateHistory (`consumesStateHistory`)", () => {
  it.each(["other_land", "vacant_lot", "miscellaneous"] as const)("기타토지 계열 %s → true", (t) => {
    expect(consumesStateHistory(t)).toBe(true);
  });
  it.each(["farmland", "paddy", "field", "orchard", "forest", "pasture", "building_site", "housing_site", "villa_land", "other", "", undefined] as const)("그 밖의 지목 %s → false", (t) => {
    expect(consumesStateHistory(t)).toBe(false);
  });
});
