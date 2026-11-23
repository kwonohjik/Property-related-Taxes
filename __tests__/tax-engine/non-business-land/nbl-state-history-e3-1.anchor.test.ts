/**
 * NBL-STATE-HISTORY-E3-① (E3-1a) — 판정 연결 anchor: 와이어 칸(raw) → ⑭ 매퍼(`buildNblEngineInput`) → 엔진(`judgeNonBusinessLand`) → 세액.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-1-tax-type-change.engine.plan.md §5(매트릭스 21행) · §3.6(바이트 동일) · §3.7(고지 2종) · §7.2 Anchor 3·4·7
 * route 관통은 `__tests__/api/nbl-state-history-e3-1-route.anchor.test.ts`가 같은 표(`_helpers/nbl-state-history-e3-1-table.ts`)를 쓴다.
 *
 * mutation 대응(엔진 계획서 §7.3): P-E3-1(derive가 구분 변경을 무시) = T1·T2·T5·T6·T10·T11·T15 · P-E3-2(Before를 After로 한 칸 밀기) = T1·T2·T7 ·
 * P-E3-3(`hasBuildingAtTransfer`가 구분 변경도 «마지막 사건»으로) = Anchor 3 + T1 · P-E3-9(모름을 별도합산으로 접음) = T15 · P-E3-10(새 고지 미탑재/기존과 동시 탑재) = 고지 anchor.
 */
import { describe } from "vitest";
import { it } from "vitest";
import { expect } from "vitest";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { NBL_STATE_AT_TRANSFER_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { E3_B } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-1-table";
import { E3_N } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-1-table";
import { E3_ROWS } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-1-table";
import { e3RowRaw } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-1-table";
import { type E3Row } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-1-table";
import { E2_ROWS } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e2-table";
import { e2RowRaw } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e2-table";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const fromRaw = (raw: Record<string, unknown>) => buildNblEngineInput(raw as never)!;
const judge = (input: NonBusinessLandInput) => judgeNonBusinessLand(input, R);
const row = (id: string) => E3_ROWS.find((r) => r.id === id)!;

function taxOf(input: NonBusinessLandInput, transferPrice = 1_000_000_000) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "land",
      transferPrice,
      acquisitionPrice: 300_000_000,
      acquisitionDate: input.acquisitionDate,
      transferDate: input.transferDate,
      isOneHousehold: false,
      nonBusinessLandDetails: input,
    }),
    makeMockRates(),
  ).calculatedTax;
}

describe("E3-1a — 엔진 계획서 §5 21행: raw → ⑭ 매퍼 → 엔진 (판정 · 일수 · 세액)", () => {
  it.each(E3_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, r: E3Row) => {
    const input = fromRaw(e3RowRaw(r));
    const j = judge(input);
    expect(j.periodEvaluation?.basis).toBe("state_history");
    expect(j.isNonBusinessLand).toBe(r.expect.nonBusiness);
    expect(j.effectiveBusinessDays).toBe(r.expect.eff);
    expect(j.totalOwnershipDays).toBe(r.expect.total);
    if (r.expect.tax !== undefined) expect(taxOf(input, r.transferPrice)).toBe(r.expect.tax);
  });

  it("echo 불변식(표 전수): 구간 Σ days = 소유일수 · 모든 구간 days > 0 · 사업용 일수 ≤ 일수 · 사건 수 + 1 ≥ 구간 수(클립은 구간을 줄인다)", () => {
    for (const r of E3_ROWS) {
      const j = judge(fromRaw(e3RowRaw(r)));
      const iv = j.periodEvaluation!.stateHistory!.intervals;
      expect(iv.reduce((s, i) => s + i.days, 0), r.id).toBe(j.totalOwnershipDays);
      for (const i of iv) {
        expect(i.days, `${r.id} 구간 길이`).toBeGreaterThan(0);
        expect(i.businessDays, r.id).toBeLessThanOrEqual(i.days);
      }
      expect(iv.length, r.id).toBeLessThanOrEqual(r.events.length + 1);
    }
  });

  it("echo: T1 구간표 — 건축물 있음·별도합산 3,072일(사업용) + 꼬리 건축물 있음·종합합산 579일(사업 0)", () => {
    const iv = judge(fromRaw(e3RowRaw(row("T1")))).periodEvaluation!.stateHistory!.intervals;
    expect(iv.map((i) => [i.hasBuilding, i.propertyTaxType, i.days, i.businessDays, i.business])).toEqual([
      [true, "separate", 3072, 3072, true],
      [true, "comprehensive", 579, 0, false],
    ]);
  });

  it("echo: T7 구간표 — 별도합산 1,825 · 종합합산(건축물 있음) 731 · 나대지 1,095 — 사업용은 앞 구간뿐", () => {
    const iv = judge(fromRaw(e3RowRaw(row("T7")))).periodEvaluation!.stateHistory!.intervals;
    expect(iv.map((i) => [i.hasBuilding, i.propertyTaxType, i.days, i.businessDays])).toEqual([
      [true, "separate", 1825, 1825],
      [true, "comprehensive", 731, 0],
      [false, "comprehensive", 1095, 0],
    ]);
  });

  it("현행(이력 없음) 대비 변동: 과대 해소 −55,750,000(T1·T4a·T5·T6) · 과소 해소 +55,750,000(T2·T3b·T4b·T15) — 같은 거래에서 이력 칸만 뺀 입력과 대조", () => {
    const noHistory = (r: E3Row) => fromRaw({ ...e3RowRaw(r), nblOtherStateHistoryMode: "", nblOtherStateEvents: [] });
    for (const id of ["T1", "T4a", "T5", "T6"]) {
      expect(taxOf(noHistory(row(id))), `${id} 현행`).toBe(E3_N);
      expect(taxOf(fromRaw(e3RowRaw(row(id)))), `${id} 이력`).toBe(E3_B);
    }
    // 현행은 «양도일 현재 구분»을 소유기간 전체에 적용 — 꼬리가 별도합산(T2·T3b·T15)이면 사업용 B, 종합합산(T4b)이면 N
    for (const [id, current] of [["T2", E3_B], ["T3b", E3_B], ["T15", E3_B], ["T4b", E3_N]] as const) {
      expect(taxOf(noHistory(row(id))), `${id} 현행`).toBe(current);
      expect(taxOf(fromRaw(e3RowRaw(row(id)))), `${id} 이력`).toBe(row(id).expect.tax);
    }
    expect(E3_N - E3_B).toBe(55_750_000);
  });
});

describe("E3-1a Anchor 3 — tax-only 이력(건축물 사건 0건): 양도일 현재 건축물 유무 = raw 토글 (M4 무방비 해소의 도달 경로)", () => {
  it("토글 true: 엔진 input hasBuilding = true · 구간 건축물 있음 2개 — 사업용 3,072/3,651(T1)", () => {
    const input = fromRaw(e3RowRaw(row("T1")));
    expect(input.otherLand?.hasBuilding).toBe(true);
    expect(input.landStateHistory?.events.map((e) => e.kind)).toEqual(["tax_type_changed"]);
    expect(judge(input).periodEvaluation?.stateHistory?.intervals.every((i) => i.hasBuilding)).toBe(true);
  });

  it("토글 false여도 ⑭는 raw를 그대로 쓴다 — E3-1b 의도된 반전: 건축물 없음 + 구분 변경은 나대지 선언이라 엔진이 던지지 않는다(근거 없는 별도합산은 종합합산으로 접혀 N)", () => {
    const raw = { ...e3RowRaw(row("T1")), nblOtherHasBuilding: false, nblOtherBuildingFloorArea: "" };
    const input = fromRaw(raw);
    expect(input.otherLand?.hasBuilding).toBe(false);
    const j = judge(input);
    expect([j.isNonBusinessLand, j.effectiveBusinessDays]).toEqual([true, 0]);
  });

  it("건축물 사건이 있으면 구분 변경이 마지막이어도 건축물 사건이 이긴다(V-19 — raw와 모순돼도): 신축 → 구분 변경, 토글 false → hasBuilding = true", () => {
    const r = row("T8");
    const input = fromRaw({ ...e3RowRaw(r), nblOtherHasBuilding: false });
    expect(input.otherLand?.hasBuilding).toBe(true);
    expect(judge(input).isNonBusinessLand).toBe(false);
  });
});

describe("E3-1a ⑭ 매퍼 — Before 운반(단일 술어) · 날짜 변환", () => {
  it("구분 변경 사건의 propertyTaxTypeBefore가 엔진 input까지 운반된다(P-E3-6) · 신축 행의 Before는 E3-1b부터 나대지 구간 선언이라 값이 있으면 싣는다(`\"\"`는 키 없음 = 종전 바이트) · 철거는 종전대로", () => {
    const input = fromRaw(e3RowRaw(row("T7")));
    const [tax, removed] = input.landStateHistory!.events;
    expect([tax.kind, tax.date.toISOString(), tax.propertyTaxTypeBefore]).toEqual(["tax_type_changed", "2019-01-01T00:00:00.000Z", "separate"]);
    expect([removed.kind, removed.propertyTaxTypeBefore]).toEqual(["building_removed", "comprehensive"]);
    // E3-1b 의도된 반전: T9o(신축 행에 stray «별도합산» Before)는 이제 나대지 구간 선언으로 운반된다(근거가 없어 엔진이 종합합산으로 접는다 — 판정은 T9c와 같다)
    const built = fromRaw(e3RowRaw(row("T9o"))).landStateHistory!.events[0];
    expect([built.kind, built.propertyTaxTypeBefore]).toEqual(["building_built", "separate"]);
    // 신축 행 `""`(선언 없음)은 키가 없다 — 기존 이력과 바이트 동일
    const none = fromRaw(e3RowRaw(row("T9c"))).landStateHistory!.events[0];
    expect("propertyTaxTypeBefore" in none).toBe(false);
  });

  it("종류가 허용값 밖이면 행을 건너뛴다(⑧·⑫가 먼저 막는 불량 행 — 다른 raw 배열 규약) · 신규 종류는 건너뛰지 않는다(P-E3-8)", () => {
    const raw = { ...e3RowRaw(row("T1")) } as Record<string, unknown>;
    raw.nblOtherStateEvents = [{ kind: "foo", date: "2021-01-01", propertyTaxTypeBefore: "separate" }, ...(raw.nblOtherStateEvents as unknown[])];
    expect(fromRaw(raw).landStateHistory?.events.map((e) => e.kind)).toEqual(["tax_type_changed"]);
  });
});

describe("E3-1a 고지 — 새 고지 2종은 구분 변경 사건이 있을 때만 · 기존 고지 문구는 바이트 동일 (P-E3-10)", () => {
  it("구분 변경 사건이 있으면 한정 고지가 변형 고지로 **대체**된다 — 기존 APPLIED·이력 없음 고지와 함께 뜨지 않고 정확히 1회", () => {
    const j = judge(fromRaw(e3RowRaw(row("T1"))));
    expect(j.warnings.filter((w) => w === NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE)).toHaveLength(1);
    expect(j.warnings).not.toContain(NBL_STATE_HISTORY_APPLIED_NOTICE);
    expect(j.warnings).not.toContain(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE);
    // 변형 고지는 면적 변동·배율 미반영을 밝힌다(V-5)
    expect(NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE).toContain("면적 변동");
    expect(NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE).toContain("확인 필요");
  });

  it("건축물 사건만 있는 이력은 종전 고지 그대로(변형 고지 없음) — E2 표 전 행", () => {
    for (const r of E2_ROWS) {
      const j = judge(fromRaw(e2RowRaw(r)));
      expect(j.warnings, r.id).toContain(NBL_STATE_HISTORY_APPLIED_NOTICE);
      expect(j.warnings, r.id).not.toContain(NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE);
      expect(j.warnings, r.id).not.toContain(NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE);
    }
  });

  it("변경 직전 구분이 «모름»(T15)이면 새 모름 고지(철거의 모름 고지가 아니다) · 알면 붙지 않는다(T1)", () => {
    const j = judge(fromRaw(e3RowRaw(row("T15"))));
    expect(j.warnings).toContain(NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE);
    expect(j.warnings).not.toContain(NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE);
    const known = judge(fromRaw(e3RowRaw(row("T1")))).warnings;
    expect(known).not.toContain(NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE);
    expect(known).not.toContain(NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE);
  });

  it("철거의 «모름»은 종전 고지만 · 철거 «모름» + 구분 변경 «모름»은 두 고지가 각각 1회", () => {
    const r3 = judge(fromRaw(e2RowRaw(E2_ROWS.find((r) => r.id === "R3")!))).warnings;
    expect(r3).toContain(NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE);
    expect(r3).not.toContain(NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE);
    const both = judge(fromRaw({
      ...e3RowRaw(row("T7")),
      nblOtherStateEvents: [
        { kind: "tax_type_changed", date: "2019-01-01", propertyTaxTypeBefore: "" },
        { kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "" },
      ],
    })).warnings;
    expect(both.filter((w) => w === NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE)).toHaveLength(1);
    expect(both.filter((w) => w === NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE)).toHaveLength(1);
  });

  it("모름 구간이 클립으로 사라지면(소유 전 사건) 모름 고지도 없다 — T11b 변형(Before `\"\"`)", () => {
    const raw = { ...e3RowRaw(row("T11b")), nblOtherStateEvents: [{ kind: "tax_type_changed", date: "2022-06-01", propertyTaxTypeBefore: "" }] };
    expect(judge(fromRaw(raw)).warnings).not.toContain(NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE);
  });

  it("T15 «모름» = 혜택 불성립: Before 모름 → 종합합산 접힘이라 사업용 구간이 꼬리뿐(579) — 알면(별도합산) 3,651이 될 시료와 대조", () => {
    const unknown = judge(fromRaw(e3RowRaw(row("T15"))));
    const known = judge(fromRaw({ ...e3RowRaw(row("T15")), nblOtherStateEvents: [{ kind: "tax_type_changed", date: "2022-06-01", propertyTaxTypeBefore: "separate" }] }));
    expect([unknown.isNonBusinessLand, unknown.effectiveBusinessDays]).toEqual([true, 579]);
    expect([known.isNonBusinessLand, known.effectiveBusinessDays]).toEqual([false, 3651]);
  });
});

describe("E3-1a Anchor 7 — Q-15 (가′) 교차: core 자체 사업기간(DM-01 · 3호)은 구분 변경 사건에 영향받지 않는다", () => {
  const dm01 = (extra: Record<string, unknown> = {}) => ({
    ...e3RowRaw(row("T1")),
    transferDate: "2024-06-30",
    nblZoneType: "commercial",
    nblRevenueBusinessType: "parking_operation",
    nblRevenueCurrentRevenue: "20000000",
    nblRevenueCurrentLandValue: "100000000",
    nblRevenueCurrentBusinessStartDate: "2022-01-01",
    ...extra,
  });

  it("V21-DM01 동형: 개시일 2022-01-01 · 구분 변경 2023-01-01(별도 → 종합) · 양도 2024-06-30 — 사업용 = 건축물 구간 ∪ (소유기간 ∩ DM-01) = 전 구간 3,832(구분 변경이 DM-01 구간을 줄이지 않는다)", () => {
    const withTax = judge(fromRaw(dm01({ nblOtherStateEvents: [{ kind: "tax_type_changed", date: "2023-01-01", propertyTaxTypeBefore: "separate" }] })));
    const without = judge(fromRaw(dm01({ nblOtherStateHistoryMode: "", nblOtherStateEvents: [] })));
    expect(without.isNonBusinessLand).toBe(false);
    expect(withTax.isNonBusinessLand).toBe(false);
    // 사업용 구간 = 건축물(별도합산) [2014-01-02, 2023-01-01) ∪ DM-01 [2022-01-01, 2024-06-30) = 소유기간 전체
    expect([withTax.effectiveBusinessDays, withTax.totalOwnershipDays]).toEqual([3832, 3832]);
  });

  it("구분 변경 직전 «모름» + DM-01 — 모름 구간(비사업용)이어도 DM-01 구간(개시일 이후)은 사업용으로 센다(자체 구간 우선 — 법에 없는 불리 적용 금지)", () => {
    const j = judge(fromRaw(dm01({ nblOtherStateEvents: [{ kind: "tax_type_changed", date: "2023-01-01", propertyTaxTypeBefore: "" }] })));
    const intervals = j.periodEvaluation!.stateHistory!.intervals;
    expect(intervals[0].propertyTaxType).toBe("unknown");
    // 개시일(2022-01-01) 이후는 DM-01로 사업용 — 모름 구간 [2014-01-02, 2023-01-01) 안에서 개시일 이후 365일(2022-01-01~2023-01-01)만 센다
    expect([intervals[0].days, intervals[0].businessDays]).toEqual([3286, 365]);
  });
});
