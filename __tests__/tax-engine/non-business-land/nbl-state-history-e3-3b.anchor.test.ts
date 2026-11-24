/**
 * NBL-STATE-HISTORY-E3-③ B (E3d-2) — 엔진 anchor: raw 와이어 칸(`nblOtherStateEvents`의 `buildingKindBefore`·`houseFootprintBefore` · `nblIsMetropolitanArea`) → ⑭ 매퍼 → `judgeNonBusinessLand` → 세액.
 *
 * 계획서: docs/01-plan/features/nbl-state-history-e3-3-house-appurtenant.engine.plan.md §3.4 · §4.3 · §6.2 · §7.2 Anchor 8·9·10(엔진 쪽)·11(엔진 쪽)·12 · §7.3 Y-16~Y-31
 * 표: `_helpers/nbl-state-history-e3-3b-table.ts` — 측정값이 표와 다르면 표를 맞추지 말고 원인을 먼저 본다(기대 = 위장 실측·직접 호출 실측).
 *
 * mutation 대응(§7.3): Y-6(모름 = 사업용) = B6·B15 · Y-7(초과를 사업용으로) = B1b·B7 · Y-13(주택 구간이 재산세 구분을 읽음) = B11 · Y-16(주택 철거 행 `propertyTaxTypeBefore` 운반) = B11 ·
 *   Y-17(`unknownClosers` 필터 제거) = T-6 · Y-21(정착면적을 읽지 않고 항상 사업용) = B6·B7·B1b · Y-24(⑭ 수도권 게이트가 술어를 모름) = B1c·B1d·Anchor 10 · Y-26(술어를 other_land 전체로) = B17 ·
 *   Y-28(`<` 경계) = B1-200.00 · Y-29(구간 당시 법령) = B1d · Y-30(빈칸을 0으로) = B6·B15 · Y-31(정착>토지를 이내로) = B15-1200.
 */
import { describe, it, expect } from "vitest";
import { E3D_B_ROWS, E3D_B_WITHIN_E2_IDS, e3dBRowRaw, type E3dBRow } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-3b-table";
import { E2_ROWS, e2RowRaw } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e2-table";
import { E3D_HOUSE_LIMIT_ROWS } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-3-table";
import { tax } from "@/__tests__/tax-engine/_helpers/nbl-state-history-grid";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { HOUSING_METRO_DEFAULTED_WARNING, judgeHousingLimit } from "@/lib/tax-engine/non-business-land/housing-limit";
import { judgeOtherLand } from "@/lib/tax-engine/non-business-land/other-land";
import {
  NBL_STATE_HISTORY_APPLIED_NOTICE,
  NBL_STATE_HISTORY_BUILDING_KIND_HINT_NOTICE,
  NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE,
  NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE,
  NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE,
  NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE,
  NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE,
  NBL_STATE_HISTORY_HOUSE_WITHIN_UNCONFIRMED_NOTICE,
  NBL_STATE_HISTORY_HOUSING_APPLIED_NOTICE,
  NBL_STATE_HISTORY_HOUSING_NON_HOUSE_BUILDING_NOTICE,
  NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE,
  NBL_STATE_AT_TRANSFER_APPLIED_NOTICE,
} from "@/lib/tax-engine/nbl-confirm-notices";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const row = (id: string) => E3D_B_ROWS.find((r) => r.id === id)!;
const fromRaw = (raw: Record<string, unknown>) => buildNblEngineInput(raw as never)!;
const judge = (input: NonBusinessLandInput) => judgeNonBusinessLand(input, R);
const taxOf = (input: NonBusinessLandInput) => tax(input).calculatedTax;
const N = 253_960_000;
const B = 198_210_000;

/** 판정 비교용 — 주택 echo·고지만 다르고 일수·판정·기준 수치는 같아야 하는 «위장 짝» 비교(Anchor 8). */
const core = (j: ReturnType<typeof judge>) => ({
  nb: j.isNonBusinessLand,
  eff: j.effectiveBusinessDays,
  total: j.totalOwnershipDays,
  grace: j.gracePeriodDays,
  ratio: j.businessUseRatio,
  criteria: j.criteria,
  state: j.periodEvaluation?.stateHistory?.criteria,
  days: j.periodEvaluation?.stateHistory?.intervals.map((i) => [i.days, i.businessDays, i.business]),
});

describe("E3d-2 §6.2 B 행 — raw → ⑭ → 엔진 → 세액 (오라클 표와 같은 값)", () => {
  it.each(E3D_B_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, r: E3dBRow) => {
    const input = fromRaw(e3dBRowRaw(r));
    expect(input.landStateHistory?.mode, "⑭가 이력을 싣는다").toBe("changed");
    const houseRows = input.landStateHistory!.events.filter((e) => e.buildingKindBefore === "house");
    expect(houseRows.length, "⑭가 철거 행의 종류 칸을 싣는다(strip 방지)").toBe(r.events.filter((e) => e.kind === "building_removed").length);
    const j = judge(input);
    expect(j.periodEvaluation?.basis).toBe("state_history");
    expect(j.isNonBusinessLand).toBe(r.expect.nonBusiness);
    expect(j.effectiveBusinessDays).toBe(r.expect.eff);
    expect(j.totalOwnershipDays).toBe(r.expect.total);
    if (r.expect.graceDays !== undefined) expect(j.gracePeriodDays).toBe(r.expect.graceDays);
    if (r.expect.tax !== undefined) expect(taxOf(input), `${r.id} 세액`).toBe(r.expect.tax);

    // 주택 구간 판정(echo) — 소유기간에 남은 주택 구간만(클립된 구간은 없다)
    const houseIv = (j.periodEvaluation?.stateHistory?.intervals ?? []).filter((i) => i.buildingKind === "house");
    expect(houseIv.map((i) => i.houseOutcome), r.id).toEqual(r.outcomes.slice(0, houseIv.length));
    for (const iv of houseIv) expect(iv.propertyTaxType, "주택 구간은 재산세 구분을 읽지 않는다(`unknown` 고정)").toBe("unknown");

    // 고지 — B는 종전 APPLIED 고지를 **대체하지 않는다**(Anchor 9) · A 한정 고지(HOUSING_APPLIED·NON_HOUSE)는 쓰지 않는다 · 이력 없음 고지는 한정 고지가 이미 대체
    expect(j.warnings).toContain(NBL_STATE_HISTORY_APPLIED_NOTICE);
    expect(j.warnings).not.toContain(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE);
    expect(j.warnings).not.toContain(NBL_STATE_HISTORY_HOUSING_APPLIED_NOTICE);
    expect(j.warnings).not.toContain(NBL_STATE_HISTORY_HOUSING_NON_HOUSE_BUILDING_NOTICE);
    expect(j.warnings, "Q-12 hint는 입력 안내 — 결과 warnings에 싣지 않는다").not.toContain(NBL_STATE_HISTORY_BUILDING_KIND_HINT_NOTICE);
    const has = (n: string) => j.warnings.filter((w) => w === n).length;
    if (houseIv.length > 0) {
      expect(has(NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE), `${r.id} Q-2`).toBe(1);
      expect(has(NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE)).toBe(1);
    } else {
      expect(has(NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE), "소유기간에 주택 구간이 없으면 주택 고지도 없다(클립)").toBe(0);
      expect(has(NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE)).toBe(0);
    }
    expect(has(NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE)).toBe(houseIv.some((i) => i.houseOutcome === "exceeded") ? 1 : 0);
    expect(has(NBL_STATE_HISTORY_HOUSE_WITHIN_UNCONFIRMED_NOTICE)).toBe(houseIv.some((i) => i.houseOutcome === "unconfirmed") ? 1 : 0);
    const exceededGrace = houseIv.some((i) => i.houseOutcome === "exceeded") && (r.grace ?? []).some((g) => g.reasonCode === "demolition");
    expect(has(NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE)).toBe(exceededGrace ? 1 : 0);
    // 기타토지 core라 전량 판정 — 비사업용이면 비율 1
    if (r.expect.nonBusiness) expect(j.surcharge.nonBusinessAreaRatio).toBe(1);
  });
});

describe("E3d-2 Anchor 8 — B ↔ 위장 parity: 철거 행을 «별도합산 위장»에서 «주택 + 정착면적 200(이내)»으로 바꿔도 같은 eff·판정·세액", () => {
  it.each(E3D_B_WITHIN_E2_IDS.map((id) => [id] as const))("E2 %s", (id) => {
    const b = row(`B-${id}`);
    const e2 = E2_ROWS.find((r) => r.id === id)!;
    const jb = judge(fromRaw(e3dBRowRaw(b)));
    const je = judge(fromRaw({ ...e2RowRaw(e2), nblIsMetropolitanArea: "no" }));
    expect(core(jb)).toEqual(core(je));
    expect(jb.effectiveBusinessDays).toBe(e2.expect.eff);
    if (e2.expect.tax !== undefined) expect(taxOf(fromRaw(e3dBRowRaw(b)))).toBe(e2.expect.tax);
  });

  it("같은 철거 행의 «위장» raw(`disguise: separate`)는 B 도입 후에도 그 값이다 — B1′ 회귀 가드(위장 입력의 결과를 B가 바꾸지 않는다)", () => {
    for (const id of ["B-M1", "B-M3", "B-GA-730", "B-S1"]) {
      const b = row(id);
      expect(judge(fromRaw(e3dBRowRaw(b, { disguise: "separate" }))).isNonBusinessLand, id).toBe(b.expect.nonBusiness);
      expect(taxOf(fromRaw(e3dBRowRaw(b, { disguise: "separate" }))), id).toBe(b.expect.tax);
    }
  });

  it("접힘 행(B1b·B6·B7·B15 계열)은 «철거 직전 재산세 구분 모름»(E2 R3)과 같은 판정·일수·세액 — 「모름 = 혜택 불성립」 · «초과»가 «모름»보다 유리하지 않다(Y-7)", () => {
    for (const id of ["B1b", "B6", "B7", "B15-0", "B15-neg", "B15-abc", "B15-1200", "B1c-333.33"]) {
      const b = row(id);
      const jb = judge(fromRaw(e3dBRowRaw(b)));
      const ju = judge(fromRaw(e3dBRowRaw(b, { disguise: "unknown" })));
      expect(core(jb), id).toEqual(core(ju));
      expect(jb.isNonBusinessLand, id).toBe(true);
      expect(taxOf(fromRaw(e3dBRowRaw(b))), id).toBe(N);
    }
  });
});

describe("E3d-2 경계 수치 — 허용 면적·초과 면적 echo는 `housing-limit.ts` 직접 호출 실측과 같다(단일 소스 · Anchor 12)", () => {
  it("B1b: 199.99㎡ → 5배 허용 999.95 · 초과 0.05 — 0.05㎡ 차이가 −55,750,000 ↔ 0을 가른다(절벽)", () => {
    const j = judge(fromRaw(e3dBRowRaw(row("B1b"))));
    const iv = j.periodEvaluation!.stateHistory!.intervals[0];
    expect(iv).toMatchObject({ buildingKind: "house", houseOutcome: "exceeded", business: false });
    expect(iv.houseCheck).toMatchObject({ footprint: 199.99, multiplier: 5, allowedArea: 999.95, landArea: 1000, excessArea: 0.05 });
    expect(taxOf(fromRaw(e3dBRowRaw(row("B1-200.00")))) - taxOf(fromRaw(e3dBRowRaw(row("B1b"))))).toBe(B - N); // −55,750,000
  });

  it("B1c: 수도권 3배 — 333.34 허용 1,000.02 이내 · 333.33 허용 999.99 초과 0.01", () => {
    const within = judge(fromRaw(e3dBRowRaw(row("B1c-333.34")))).periodEvaluation!.stateHistory!.intervals[0];
    expect(within.houseCheck).toMatchObject({ multiplier: 3, allowedArea: 1000.02, excessArea: 0 });
    const exceeded = judge(fromRaw(e3dBRowRaw(row("B1c-333.33")))).periodEvaluation!.stateHistory!.intervals[0];
    expect(exceeded.houseCheck).toMatchObject({ multiplier: 3, allowedArea: 999.99, excessArea: 0.01 });
  });

  it("B1d: 배율 연혁은 **양도일** 기준(D-11) — 수도권 일반주거 · 정착 200: 양도 2021-12-31 → 5배 이내 / 2022-01-01 → 3배 초과 400㎡ (구간 당시 법령이 아니다 · Y-29)", () => {
    const base: Omit<E3dBRow, "id" | "scenario" | "transfer"> = { metro: "yes", events: [{ kind: "building_removed", date: "2021-01-01", house: true, fp: "200" }], outcomes: ["within"], expect: { nonBusiness: false, eff: 0, total: 0 } };
    const pre = judge(fromRaw(e3dBRowRaw({ id: "pre", scenario: "", transfer: "2021-12-31", ...base })));
    const post = judge(fromRaw(e3dBRowRaw({ id: "post", scenario: "", transfer: "2022-01-01", ...base })));
    expect(pre.periodEvaluation!.stateHistory!.intervals[0]).toMatchObject({ houseOutcome: "within" });
    expect(pre.periodEvaluation!.stateHistory!.intervals[0].houseCheck).toMatchObject({ multiplier: 5, allowedArea: 1000 });
    expect(post.periodEvaluation!.stateHistory!.intervals[0]).toMatchObject({ houseOutcome: "exceeded" });
    expect(post.periodEvaluation!.stateHistory!.intervals[0].houseCheck).toMatchObject({ multiplier: 3, allowedArea: 600, excessArea: 400 });
    expect(pre.isNonBusinessLand).toBe(false);
    expect(post.isNonBusinessLand).toBe(true);
  });

  it.each(E3D_HOUSE_LIMIT_ROWS.map((r) => [r.id, r] as const))("E3d-0 배율 경계 표 %s — B 철거 행이 같은 값(배율·허용 면적·이내)을 낸다", (_id, r) => {
    const raw = e3dBRowRaw({
      id: r.id, scenario: "", transfer: r.transfer, zone: r.zone, area: String(r.landArea), metro: r.metro ? "yes" : "no",
      events: [{ kind: "building_removed", date: "2020-01-01", house: true, fp: String(r.footprint) }], outcomes: [], expect: { nonBusiness: false, eff: 0, total: 0 },
    });
    const iv = judge(fromRaw({ ...raw, acquisitionDate: "2014-01-01" })).periodEvaluation!.stateHistory!.intervals[0];
    expect(iv.houseOutcome).toBe(r.expect.within ? "within" : "exceeded");
    expect(iv.houseCheck).toMatchObject({ multiplier: r.expect.multiplier, allowedArea: r.expect.allowedArea, excessArea: r.expect.excess });
  });
});

describe("E3d-2 Anchor 9 — B 하위호환: 종류 칸이 없거나 `\"\"`인 철거 행은 종전과 바이트 동일", () => {
  const legacy = (id: string) => ({ ...e2RowRaw(E2_ROWS.find((r) => r.id === id)!), nblIsMetropolitanArea: "" });

  it.each(["M1", "M3", "GA-731", "S1", "R3", "Z-1461", "M14-2"])("E2 %s — `buildingKindBefore` 미전송 = 명시 `\"\"` = 종전(결과 객체 전체 toEqual)", (id) => {
    const raw = legacy(id) as unknown as Record<string, unknown> & { nblOtherStateEvents: Array<Record<string, unknown>> };
    const withEmptyKind = { ...raw, nblOtherStateEvents: raw.nblOtherStateEvents.map((e) => (e.kind === "building_removed" ? { ...e, buildingKindBefore: "" } : e)) };
    const a = judge(fromRaw(raw));
    const b = judge(fromRaw(withEmptyKind));
    expect(b).toEqual(a);
    expect(fromRaw(withEmptyKind).landStateHistory).toEqual(fromRaw(raw).landStateHistory); // 엔진 입력도 같다(종류 칸이 새지 않는다)
    expect(a.warnings).not.toContain(NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE);
    expect(a.warnings).not.toContain(NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE);
    expect(a.periodEvaluation?.stateHistory?.intervals.some((i) => i.buildingKind !== undefined || i.houseOutcome !== undefined || i.houseCheck !== undefined)).toBe(false);
  });

  it("B8: 주택 아닌 건축물 + 철거 직전 별도합산(종류 칸 없음) — B 198,210,000(위장 값 그대로)", () => {
    const b8: E3dBRow = { id: "B8", scenario: "", events: [{ kind: "building_removed", date: "2021-01-01", house: false, taxBefore: "separate" }], outcomes: [], expect: { nonBusiness: false, eff: 2556, total: 3651 } };
    const input = fromRaw(e3dBRowRaw(b8));
    expect(input.landStateHistory!.events[0]).not.toHaveProperty("buildingKindBefore");
    expect(judge(input).effectiveBusinessDays).toBe(2556);
    expect(taxOf(input)).toBe(B);
  });

  it("B19(Q-12 현행 유지): 종류 «그 밖»으로 정착면적 없이 철거 직전 구분만 고르면 종전 그대로 — 모름·종합합산 N · 비종합합산 선언만 B (이 경로를 B가 열지도 막지도 않는다)", () => {
    const by = (taxBefore: BEvTax) => ({ id: "B19", scenario: "", events: [{ kind: "building_removed" as const, date: "2021-01-01", house: false, taxBefore }], outcomes: [] as never[], expect: { nonBusiness: false, eff: 0, total: 0 } });
    type BEvTax = "" | "comprehensive" | "exempt" | "separate" | "special_sum";
    const out: Record<string, number> = {};
    for (const t of ["", "comprehensive", "exempt", "special_sum", "separate"] as const) out[t || "모름"] = taxOf(fromRaw(e3dBRowRaw(by(t))));
    expect(out).toEqual({ 모름: N, comprehensive: N, exempt: B, special_sum: B, separate: B });
    // 결과 warnings에 Q-12 hint를 싣지 않는다(바이트 동일 요구 — hint는 입력 안내 상수다)
    expect(judge(fromRaw(e3dBRowRaw(by("separate")))).warnings).not.toContain(NBL_STATE_HISTORY_BUILDING_KIND_HINT_NOTICE);
  });
});

describe("E3d-2 함정 — T-5(숨은 stale)·T-6(모름 고지 오발동)·B14", () => {
  it("B11/T-5: 철거 행을 주택으로 바꾼 뒤에도 남은 `propertyTaxTypeBefore = separate`는 ⑭가 싣지 않는다 — 정착면적 빈칸이면 B6과 같은 N(위장 값이 새지 않는다)", () => {
    const raw = e3dBRowRaw(row("B6")) as Record<string, unknown> & { nblOtherStateEvents: Array<Record<string, unknown>> };
    const stale = { ...raw, nblOtherStateEvents: raw.nblOtherStateEvents.map((e) => ({ ...e, propertyTaxTypeBefore: "separate" })) };
    const input = fromRaw(stale);
    expect(input.landStateHistory!.events[0]).not.toHaveProperty("propertyTaxTypeBefore");
    expect(input.landStateHistory!.events[0]).toMatchObject({ buildingKindBefore: "house" });
    const j = judge(input);
    expect(j.isNonBusinessLand).toBe(true);
    expect(j.effectiveBusinessDays).toBe(0);
    expect(taxOf(input)).toBe(N);
  });

  it("T-6: 주택 구간 `\"unknown\"`은 «철거 직전 재산세 구분 모름» 고지를 내지 않는다(접힘·초과·이내 모두) — 주택 아닌 «모름» 철거 행은 그대로 낸다", () => {
    for (const id of ["B1", "B1b", "B6", "B7", "B15-1200"].map((i) => (i === "B1" ? "B-M1" : i))) {
      expect(judge(fromRaw(e3dBRowRaw(row(id)))).warnings, id).not.toContain(NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE);
    }
    const unknownNonHouse = judge(fromRaw(e3dBRowRaw(row("B-M1"), { disguise: "unknown" })));
    expect(unknownNonHouse.warnings).toContain(NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE);
    // 주택 구간 + 주택 아닌 «모름» 철거 행이 섞이면 고지는 주택 아닌 행 때문에만 나온다
    const mixed = e3dBRowRaw({ id: "mix", scenario: "", events: [{ kind: "building_removed", date: "2016-01-01", house: true }, { kind: "building_built", date: "2017-01-01" }, { kind: "building_removed", date: "2021-01-01", house: false, taxBefore: "" }], outcomes: [], expect: { nonBusiness: false, eff: 0, total: 0 } });
    expect(judge(fromRaw(mixed)).warnings).toContain(NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE);
  });

  it("B14: 주택 → 철거 → 건물 신축 → 양도 — 주택 구간(이내)과 건물 구간·나대지 갭이 한 표에 나온다. 위장 짝과 같은 값", () => {
    const b14 = row("B14");
    const j = judge(fromRaw(e3dBRowRaw(b14)));
    const sep = judge(fromRaw(e3dBRowRaw(b14, { disguise: "separate" })));
    expect(core(j)).toEqual(core(sep));
    expect(j.periodEvaluation!.stateHistory!.intervals.map((i) => [i.days, i.hasBuilding, i.buildingKind ?? null, i.houseOutcome ?? null, i.business])).toEqual([
      [1825, true, "house", "within", true],
      [731, false, null, null, false],
      [1095, true, null, null, true],
    ]);
  });

  it("복수 주택 구간: 이내 + 초과 — 초과한 구간만 접히고(구간별 판정) 고지는 EXCEEDED 1줄", () => {
    const r: E3dBRow = {
      id: "multi", scenario: "", events: [{ kind: "building_removed", date: "2016-01-01", house: true, fp: "200" }, { kind: "building_built", date: "2017-01-01" }, { kind: "building_removed", date: "2021-01-01", house: true, fp: "100" }],
      outcomes: ["within", "exceeded"], expect: { nonBusiness: false, eff: 0, total: 0 },
    };
    const j = judge(fromRaw(e3dBRowRaw(r)));
    const ivs = j.periodEvaluation!.stateHistory!.intervals;
    expect(ivs.filter((i) => i.buildingKind === "house").map((i) => [i.houseOutcome, i.business])).toEqual([["within", true], ["exceeded", false]]);
    expect(j.warnings.filter((w) => w === NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE)).toHaveLength(1);
  });
});

describe("E3d-2 B12 · UQ-12 — 양도일 의제 동시 입력이면 이력(주택 구간 포함)을 쓰지 않는다 + 같은 술어", () => {
  it("의제 사유 선택 + 주택 철거 행: 이력 미적용 + DEEMED 고지(종전과 같다) — 주택 고지는 없다", () => {
    const raw = { ...e3dBRowRaw(row("B-M1")), nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2020-01-01" };
    const j = judge(fromRaw(raw));
    expect(j.periodEvaluation?.basis).not.toBe("state_history");
    expect(j.warnings).toContain(NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE);
    expect(j.warnings).not.toContain(NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE);
  });
});

describe("E3d-2 수도권 값 관통(엔진 쪽 — T-7 · Anchor 10 · B16 · B17)", () => {
  const houseRow = (over: Partial<E3dBRow>): E3dBRow => ({ id: "m", scenario: "", events: [{ kind: "building_removed", date: "2021-01-01", house: true, fp: "200" }], outcomes: [], expect: { nonBusiness: false, eff: 0, total: 0 }, ...over });

  it("B1c/Anchor 10: 같은 정착 200㎡가 수도권 yes → 3배 초과 / no → 5배 이내로 갈린다 — ⑭ 게이트가 값을 엔진 `isMetropolitanArea`까지 싣는다(Y-24)", () => {
    const yes = fromRaw(e3dBRowRaw(houseRow({ metro: "yes" })));
    const no = fromRaw(e3dBRowRaw(houseRow({ metro: "no" })));
    expect([yes.isMetropolitanArea, no.isMetropolitanArea]).toEqual([true, false]);
    expect(judge(yes).periodEvaluation!.stateHistory!.intervals[0]).toMatchObject({ houseOutcome: "exceeded" });
    expect(judge(no).periodEvaluation!.stateHistory!.intervals[0]).toMatchObject({ houseOutcome: "within" });
    expect(judge(yes).periodEvaluation!.stateHistory!.intervals[0].houseCheck).toMatchObject({ multiplier: 3, allowedArea: 600, excessArea: 400 });
    expect(judge(no).periodEvaluation!.stateHistory!.intervals[0].houseCheck).toMatchObject({ multiplier: 5, allowedArea: 1000, excessArea: 0 });
  });

  it("B16 직접 API: 수도권 «모름»·미선택·칸 없음(주·상·공) → 값이 엔진에 닿지 않아 보수적 수도권(3배) 기본값 + 기존 경고 문구(UI는 ⑧이 차단)", () => {
    for (const metro of ["unknown", ""] as const) {
      const input = fromRaw(e3dBRowRaw(houseRow({ metro })));
      expect(input.isMetropolitanArea, metro || "미선택").toBeUndefined();
      const j = judge(input);
      expect(j.periodEvaluation!.stateHistory!.intervals[0].houseCheck).toMatchObject({ multiplier: 3 });
      expect(j.warnings.filter((w) => w === HOUSING_METRO_DEFAULTED_WARNING)).toHaveLength(1);
    }
    const none = fromRaw(e3dBRowRaw(houseRow({ metroOmit: true })));
    expect(none.isMetropolitanArea).toBeUndefined();
    expect(judge(none).warnings).toContain(HOUSING_METRO_DEFAULTED_WARNING);
  });

  it("B17: 수도권이 배율을 가르지 않는 조합(녹지·도시지역 밖·미지정)은 값이 와도 싣지 않는다(칸을 묻지 않는 조합) — 경고도 없다. 철거 행이 주택이 아니면(`house` 없음) 주·상·공이어도 싣지 않는다(Y-26)", () => {
    for (const zone of ["green", "management", "undesignated"] as const) {
      const input = fromRaw(e3dBRowRaw(houseRow({ zone, metro: "yes", events: [{ kind: "building_removed", date: "2021-01-01", house: true, fp: "100" }] })));
      expect(input.isMetropolitanArea, zone).toBeUndefined();
      expect(judge(input).warnings, zone).not.toContain(HOUSING_METRO_DEFAULTED_WARNING);
    }
    const nonHouse = fromRaw(e3dBRowRaw(houseRow({ metro: "yes", events: [{ kind: "building_removed", date: "2021-01-01", house: false, taxBefore: "separate" }] })));
    expect(nonHouse.isMetropolitanArea).toBeUndefined();
    // 이력이 `unchanged`·`unknown`이면 남은 stale 주택 행·수도권 값을 읽지 않는다(와이어 events 인자 — R-11)
    for (const mode of ["unchanged", "unknown"]) {
      expect(fromRaw({ ...e3dBRowRaw(houseRow({ metro: "yes" })), nblOtherStateHistoryMode: mode }).isMetropolitanArea, mode).toBeUndefined();
    }
    // 소비 지목이 아닌 농지는 수도권 값을 읽지 않는다
    expect(fromRaw({ ...e3dBRowRaw(houseRow({ metro: "yes" })), nblLandType: "farmland" }).isMetropolitanArea).toBeUndefined();
  });

  it("양도일이 2022.1.1. 전이면 수도권 여부가 배율을 가르지 않아 값이 없어도 경고하지 않는다(소음 방지) — 보수 기본값 계산 자체는 같다", () => {
    const input = fromRaw(e3dBRowRaw(houseRow({ transfer: "2021-12-31", metro: "" })));
    const j = judge(input);
    expect(j.periodEvaluation!.stateHistory!.intervals[0].houseCheck).toMatchObject({ multiplier: 5 });
    expect(j.warnings).not.toContain(HOUSING_METRO_DEFAULTED_WARNING);
  });
});

describe("E3d-2 B18 — 수용 양도 + 주택 구간: 사업인정 고시일 전날 용도지역 고지(주택부수토지 카드와 같은 고지)", () => {
  it("공익수용(고시일 미입력 · 양도 2025-11-28 이후)이면 `expropriationZoneBaseDateNotice`가 붙는다 · 주택 구간이 없으면 붙지 않는다", () => {
    const late = { ...row("B-M1"), transfer: "2025-12-31" };
    const expr = { ...fromRaw(e3dBRowRaw(late)), unconditionalExemption: { isPublicExpropriation: true } } as unknown as NonBusinessLandInput;
    const withHouse = judgeOtherLand(expr, R);
    const nonHouse = judgeOtherLand({ ...fromRaw(e3dBRowRaw(late, { disguise: "separate" })), unconditionalExemption: { isPublicExpropriation: true } } as unknown as NonBusinessLandInput, R);
    const zone = (w: string[]) => w.filter((x) => x.includes("사업인정 고시일"));
    expect(zone(withHouse.warnings ?? []).length).toBeGreaterThan(0);
    expect(zone(nonHouse.warnings ?? [])).toEqual([]);
  });
});

describe("E3d-2 Anchor 11 (엔진 쪽) — 정착면적 × 수도권 × 용도지역 격자: 엔진 `houseOutcome`이 `judgeHousingLimit` 직접 호출과 같다 · 수도권 값은 술어가 참일 때만 엔진에 닿는다", () => {
  const FPS = ["200", "199.99", "333.34", "333.33", "100", "1200", "", "0", "abc"];
  const METROS = ["yes", "no", "unknown", ""] as const;
  const ZONES = ["general_residential", "green", "management", "undesignated"] as const;
  const cells = ZONES.flatMap((zone) => METROS.flatMap((metro) => FPS.map((fp) => [zone, metro, fp] as const)));

  it.each(cells)("zone=%s metro=%j fp=%j", (zone, metro, fp) => {
    const r: E3dBRow = { id: "g", scenario: "", zone, metro, events: [{ kind: "building_removed", date: "2021-01-01", house: true, fp }], outcomes: [], expect: { nonBusiness: false, eff: 0, total: 0 } };
    const input = fromRaw(e3dBRowRaw(r));
    // ⑭ 게이트: 수도권이 배율을 가르는 용도지역(주·상·공)에서만 엔진 `isMetropolitanArea`에 닿는다
    const gated = zone === "general_residential";
    const expectedMetro = gated ? (metro === "yes" ? true : metro === "no" ? false : undefined) : undefined;
    expect(input.isMetropolitanArea).toBe(expectedMetro);
    const iv = judge(input).periodEvaluation!.stateHistory!.intervals[0];
    // 엔진 직접 호출 기대값
    const parsed = parseFloat(fp.replace(/,/g, ""));
    const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= 1000;
    if (!valid) {
      expect(iv.houseOutcome).toBe("unconfirmed");
      return;
    }
    const direct = judgeHousingLimit({ zoneType: zone, isMetropolitanArea: expectedMetro, transferDate: new Date("2024-01-01T00:00:00Z"), footprint: parsed, landArea: 1000 });
    expect(iv.houseOutcome).toBe(direct.limit.within ? "within" : "exceeded");
    expect(iv.houseCheck).toMatchObject({ multiplier: direct.multiplier, allowedArea: direct.allowedArea, excessArea: direct.limit.excess });
    // 수도권 미제공(주·상·공): 보수적 3배 기본값 — 같은 정착면적도 «yes»와 같은 판정
    if (gated && expectedMetro === undefined) expect(iv.houseCheck?.multiplier).toBe(3);
  });
});
