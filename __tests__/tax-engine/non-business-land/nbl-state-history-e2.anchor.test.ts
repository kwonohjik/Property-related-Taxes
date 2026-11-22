/**
 * NBL-STATE-HISTORY-E2 — 판정 연결(`applyStateHistory`) anchor. 엔진 계획서 §6 «일 단위» 열 표 + Anchor 4(이력 + DM-01 · 3호 조합) + 고지·echo·가드.
 *
 * 계획서(정본): docs/01-plan/features/nbl-other-land-state-history.plan.md §5-1-1 · engine.plan.md §4.2~4.4 · §6 · §7.2 Anchor 4 · §7.3
 * 결정(2026-11-22): V-1 일 단위(과세기준일 접기 재제안 금지) · Q-15 (가′) · 이력 우선 · 양도일 의제 동시면 이력 미적용 · 「모름」 = 혜택 불성립 + 확인 필요.
 *
 * 입력은 와이어 칸 이름(`nbl*`)의 raw → ⑭ `buildNblEngineInput`(실제 서버 매퍼) → 엔진. route 관통은 `__tests__/api/nbl-state-history-e2-route.anchor.test.ts`가 같은 표를 쓴다.
 * mutation 대응(엔진 §7.3): P-4(core 그대로) = 표 전체 · P-5((가) 문언·꼬리 전체) = V21 3행 + Anchor 4 · P-6/7 = M1·R3 · P-10 = M14 · P-14 = M7 · P-15 = V-19 · P-11 = E0 compat.
 */
import { describe, it, expect } from "vitest";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { judgeOtherLand } from "@/lib/tax-engine/non-business-land/other-land";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import {
  NBL_REVENUE_BUSINESS_START_APPLIED_NOTICE,
  NBL_STATE_AT_TRANSFER_APPLIED_NOTICE,
  NBL_STATE_HISTORY_APPLIED_NOTICE,
  NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE,
  NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE,
  NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE,
  NBL_STATE_HISTORY_REVENUE_START_NOTICE,
} from "@/lib/tax-engine/nbl-confirm-notices";
import { GRID, d, tax } from "@/__tests__/tax-engine/_helpers/nbl-state-history-grid";
import { E2_ROWS, e2RowRaw, type E2Row } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e2-table";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const fromRaw = (raw: Record<string, unknown>) => buildNblEngineInput(raw as never)!;
const judge = (input: NonBusinessLandInput) => judgeNonBusinessLand(input, R);

describe("E2 — 엔진 계획서 §6 «일 단위» 열: raw → ⑭ 매퍼 → 엔진 (판정 · 일수 · 세액)", () => {
  it.each(E2_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, row: E2Row) => {
    const input = fromRaw(e2RowRaw(row));
    const j = judge(input);
    expect(j.periodEvaluation?.basis).toBe("state_history");
    expect(j.isNonBusinessLand).toBe(row.expect.nonBusiness);
    expect(j.effectiveBusinessDays).toBe(row.expect.eff);
    expect(j.totalOwnershipDays).toBe(row.expect.total);
    if (row.expect.graceDays !== undefined) expect(j.gracePeriodDays).toBe(row.expect.graceDays);
    if (row.expect.tax !== undefined) expect(tax(input).calculatedTax).toBe(row.expect.tax);
  });

  it("표 규모: 임계선 쌍(나목 730/729 · 윤일 창 731/730 · 다목 1,462~1,460 · 가목 730/731) · 축 B 지분 3 · 소유 0·1일 · Q-15 3행을 모두 담는다", () => {
    const ids = E2_ROWS.map((r) => r.id);
    for (const id of ["M8a", "M8b", "M8c-731", "M8c-730", "Z-1462", "Z-1461", "Z-1460", "GA-730", "GA-731", "M14-1", "M14-2", "M14-3", "M16", "M16c-built", "M16c-bare", "V21-3호", "V21-DM01", "Q15a", "G1", "G2"]) {
      expect(ids, id).toContain(id);
    }
    expect(E2_ROWS.length).toBeGreaterThanOrEqual(40);
  });
});

describe("E2 Anchor 4 — Q-15 (가′): 이력 한 건이 core의 자체 사업기간 결론을 뒤집지 않는다 (현 안전망 0건이던 조합)", () => {
  const V21_3HO = E2_ROWS.find((r) => r.id === "V21-3호")!;
  const V21_DM01 = E2_ROWS.find((r) => r.id === "V21-DM01")!;
  const Q15A = E2_ROWS.find((r) => r.id === "Q15a")!;
  const withoutHistory = (row: E2Row) => ({ ...e2RowRaw(row), nblOtherStateHistoryMode: "", nblOtherStateEvents: [] });

  it("V-21 3호: 이력 없음(현행 core) 730/1,094 사업용 = 이력 한 건 + (가′) 730/1,094 사업용 — 초판 (가) 문언 값 550 비사업용이 아니다", () => {
    const control = judge(fromRaw(withoutHistory(V21_3HO)));
    expect([control.isNonBusinessLand, control.effectiveBusinessDays, control.totalOwnershipDays]).toEqual([false, 730, 1094]);
    const j = judge(fromRaw(e2RowRaw(V21_3HO)));
    expect([j.isNonBusinessLand, j.effectiveBusinessDays, j.totalOwnershipDays]).toEqual([false, 730, 1094]);
  });

  it("V-21 DM-01: 이력 없음 911/3,832 사업용 = 이력 한 건 + (가′) 911/3,832 사업용 — 초판 (가) 문언 값 546 비사업용이 아니다", () => {
    const control = judge(fromRaw(withoutHistory(V21_DM01)));
    expect([control.isNonBusinessLand, control.effectiveBusinessDays, control.totalOwnershipDays]).toEqual([false, 911, 3832]);
    const j = judge(fromRaw(e2RowRaw(V21_DM01)));
    expect([j.isNonBusinessLand, j.effectiveBusinessDays, j.totalOwnershipDays]).toEqual([false, 911, 3832]);
  });

  it("Q15a: 이력 없음 비사업용 = 이력 한 건 + (가′) 비사업용(사업 850 = 건축물 729 + 개시일 이후 121) — 통합 Q-9 원안(DM-01 건너뜀 → 3,832/3,832 사업용 과소)이 아니다", () => {
    const control = judge(fromRaw(withoutHistory(Q15A)));
    expect([control.isNonBusinessLand, control.effectiveBusinessDays]).toEqual([true, 3832]); // core 비사업용(전 기간 표시값 아님 — 유예 없음 echo)
    const j = judge(fromRaw(e2RowRaw(Q15A)));
    expect([j.isNonBusinessLand, j.effectiveBusinessDays, j.totalOwnershipDays]).toEqual([true, 850, 3832]);
    expect(j.periodEvaluation?.stateHistory?.intervals.map((i) => [i.days, i.businessDays])).toEqual([
      [729, 729], // 2014-01-02 ~ 2016-01-01 건물(별도합산) — 전 구간 사업용
      [3103, 121], // 철거 후 나대지 — DM-01 개시일(2024-03-01) 이후 121일만 사업용
    ]);
  });

  it("3호 구간이 신축(2023-06-01) 앞 나대지 구간에 전부 놓여도 그 730일은 사업용으로 센다 — (가′)는 이전 구간도 소유기간으로 교차한다((가) 문언은 0일)", () => {
    // 조성 완료 2021-01-02 → 3호 구간 [2021-01-02, 2023-01-02). 이전 구간 전체가 나대지이지만 3호 구간 730일은 법 §104의3①4호 다목(영 §168의11①3호)에 해당하는 날이다.
    const j = judge(fromRaw({ ...e2RowRaw(V21_3HO), nblOtherStateEvents: [{ kind: "building_built", date: "2023-06-01" }] }));
    expect(j.effectiveBusinessDays).toBe(730);
    expect(j.isNonBusinessLand).toBe(false);
  });

  it("DM-01 구간이 기간기준을 못 채웠으나 꼬리(별도합산 건축물)가 사업용이면 꼬리 구간도 사업용으로 센다 — 법에 없는 «자체 사업기간이 있으면 양도일 현재 상태를 버린다» 제한을 두지 않는다", () => {
    // 현행(이력 없음): DM-01(121일) 미충족 → Step 3-1 비종합합산 + 기간기준(fullPeriod) 충족 → 사업용.
    const raw = { ...e2RowRaw(Q15A), nblZoneType: "general_residential", nblOtherPropertyTaxType: "separate", nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "250", nblOtherStateEvents: [{ kind: "building_built", date: "2020-01-01" }] };
    const control = judge(fromRaw({ ...raw, nblOtherStateHistoryMode: "", nblOtherStateEvents: [] }));
    expect(control.isNonBusinessLand).toBe(false);
    const j = judge(fromRaw(raw));
    // 사업용 구간 = 꼬리 [2020-01-01, 2024-06-30) ∪ DM-01 [2024-03-01, ..) = 꼬리 1,642일 — 꼬리를 세지 않으면 121일뿐이라 비사업용이 된다.
    expect(j.isNonBusinessLand).toBe(false);
    expect(j.effectiveBusinessDays).toBe(3832 - 2190);
  });
});

describe("E2 판정 연결 — 고지·echo·미적용 경로", () => {
  const base = GRID["G01 나대지·종합합산 → 전량 비사업용(253,960,000)"];
  const removedSep = [{ kind: "building_removed" as const, date: d("2021-01-01"), propertyTaxTypeBefore: "separate" as const }];
  const withHistory = (input: NonBusinessLandInput, mode: "changed" | "unchanged" | "unknown", events = removedSep) =>
    ({ ...input, landStateHistory: { mode, events: mode === "changed" ? events : [] } }) as NonBusinessLandInput;

  it("적용 시 «양도일 현재 상태» 고지가 한정 고지(`NBL_STATE_HISTORY_APPLIED_NOTICE`)로 교체된다 — 둘이 함께 실리지 않는다", () => {
    const j = judge(withHistory(base, "changed"));
    expect(j.warnings).toContain(NBL_STATE_HISTORY_APPLIED_NOTICE);
    expect(j.warnings).not.toContain(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE);
    expect(j.warnings.filter((w) => w.includes("양도일 현재의 상태로 판정해 소유기간 전체에 적용했습니다"))).toEqual([]);
    expect(j.warnings.filter((w) => w === NBL_STATE_HISTORY_APPLIED_NOTICE)).toHaveLength(1);
  });

  it("DM-01 + 이력: D1 개시일 고지가 «이력과 함께 판정» 고지로 바뀐다", () => {
    const j = judge(fromRaw(e2RowRaw(E2_ROWS.find((r) => r.id === "Q15a")!)));
    expect(j.warnings).toContain(NBL_STATE_HISTORY_REVENUE_START_NOTICE);
    expect(j.warnings).not.toContain(NBL_REVENUE_BUSINESS_START_APPLIED_NOTICE);
  });

  it("철거 직전 재산세 구분이 «모름»이면 확인 필요 고지가 붙는다(R3) — 선언한 경우(M1)에는 붙지 않는다", () => {
    expect(judge(fromRaw(e2RowRaw(E2_ROWS.find((r) => r.id === "R3")!))).warnings).toContain(NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE);
    expect(judge(fromRaw(e2RowRaw(E2_ROWS.find((r) => r.id === "M1")!))).warnings).not.toContain(NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE);
  });

  it("echo: 구간표 Σ days = 소유일수 · 구간별 사업용 일수 · 영 §168의6 가·나·다목 수치(M1: 1호 · 직전 5년 창 1,826일 중 1,095 비사업)", () => {
    const j = judge(fromRaw(e2RowRaw(E2_ROWS.find((r) => r.id === "M1")!)));
    const sh = j.periodEvaluation!.stateHistory!;
    expect(sh.intervals.reduce((s, i) => s + i.days, 0)).toBe(j.totalOwnershipDays);
    expect(sh.intervals.map((i) => [i.hasBuilding, i.propertyTaxType, i.days, i.businessDays, i.business])).toEqual([
      [true, "separate", 2556, 2556, true],
      [false, "comprehensive", 1095, 0, false],
    ]);
    expect(sh.criteria).toEqual({
      ownershipBucket: 1, window5Days: 1826, nonBizInWindow5: 1095, window3Days: 1095, nonBizInWindow3: 1095, nonBizTotal: 1095,
      limitGa: 730, limitNa: 365, limitDa: 1460,
    });
  });

  it("echo 가목 임계: 소유 3~5년(2호)은 «소유기간 − 3년»(M17: 1,460 − 1,095 = 365) · 5년 이상(1호)은 730", () => {
    const two = judge(fromRaw(e2RowRaw(E2_ROWS.find((r) => r.id === "M17")!))).periodEvaluation!.stateHistory!.criteria;
    expect([two.ownershipBucket, two.limitGa, two.limitNa, two.limitDa]).toEqual([2, 365, 365, 584]);
  });

  it("echo 불변식(표 전수): 구간 Σ days = 소유일수 · 모든 구간 days > 0 · 사업용 일수 ≤ 일수 — 클립이 0일·음수 구간을 남기지 않는다(P-10)", () => {
    for (const row of E2_ROWS) {
      const j = judge(fromRaw(e2RowRaw(row)));
      const iv = j.periodEvaluation!.stateHistory!.intervals;
      expect(iv.reduce((s, i) => s + i.days, 0), row.id).toBe(j.totalOwnershipDays);
      for (const i of iv) {
        expect(i.days, `${row.id} 구간 길이`).toBeGreaterThan(0);
        expect(i.businessDays, row.id).toBeLessThanOrEqual(i.days);
      }
    }
  });

  it("echo: 3호 버킷(소유 3년 미만)은 나목이 없다(`limitNa` null) · 소유 2년 미만이면 가목도 없다(`limitGa` null — 3호 단서)", () => {
    const three = judge(fromRaw(e2RowRaw(E2_ROWS.find((r) => r.id === "P1")!))).periodEvaluation!.stateHistory!.criteria; // 소유 851일 → 3호 · 2년 미만 아님? 851 ≥ 730
    expect([three.ownershipBucket, three.limitGa, three.limitNa, three.limitDa]).toEqual([3, 851 - 730, null, Math.floor((851 * 40) / 100)]);
    const under2 = judge(fromRaw(e2RowRaw(E2_ROWS.find((r) => r.id === "M13")!))).periodEvaluation!.stateHistory!.criteria; // 소유 548일 < 730
    expect([under2.ownershipBucket, under2.limitGa, under2.limitNa]).toEqual([3, null, null]);
  });

  it("`businessPeriodsUsed`: 판정이 §168의6에 넘긴 사업용 구간(감사용) — M1은 건축물(별도합산) 구간 하나, 꼬리(나대지)는 없다", () => {
    const used = judgeOtherLand(fromRaw(e2RowRaw(E2_ROWS.find((r) => r.id === "M1")!)), R).businessPeriodsUsed;
    expect(used?.map((p) => [p.start.toISOString().slice(0, 10), p.end.toISOString().slice(0, 10)])).toEqual([["2014-01-02", "2021-01-01"]]);
  });

  it("`changed`이지만 면적 일부만 비사업용(배율 초과)이면 이력을 쓰지 않는다 — 현행 결과 + 이유 고지(세액 불변)", () => {
    const partial = GRID["G04 건축물·별도합산 배율 초과(1,000㎡) → 부분 면적"];
    const none = judge(partial);
    const j = judge(withHistory(partial, "changed"));
    expect(j.periodEvaluation?.basis).toBe("state_at_transfer");
    expect(j.warnings).toContain(NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE);
    expect(j.warnings).toContain(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE);
    expect({ ...j, warnings: j.warnings.filter((w) => w !== NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE) }).toEqual(none);
    expect(tax(withHistory(partial, "changed"))).toEqual(tax(partial));
  });

  it("`changed` + 양도일 의제(경매) 동시 입력이면 이력을 쓰지 않는다 — 현행 결과 + 이유 고지(통합 Q-9)", () => {
    const deemed = GRID["G10 나대지·종합합산 + 경매 의제양도일(2020-01-01) → 의제일 기준 기간기준"];
    const none = judge(deemed);
    const j = judge(withHistory(deemed, "changed"));
    expect(j.periodEvaluation?.basis).toBe("state_at_transfer");
    expect(j.warnings).toContain(NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE);
    expect({ ...j, warnings: j.warnings.filter((w) => w !== NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE) }).toEqual(none);
  });

  it("`unchanged` = 현행(바이트 동일 — 고지 포함) · `changed` + 사건 0건 = 엔진이 던진다(직접 호출 안전망 — 조용히 «이력 없음»으로 읽지 않는다)", () => {
    expect(judge(withHistory(base, "unchanged"))).toEqual(judge(base));
    expect(() => judge(withHistory(base, "changed", []))).toThrow(TaxCalculationError);
  });

  it("무조건 사업용 의제(§168의14③) 성립이면 이력은 무관하다 — 의제가 지목별 judge 앞에서 끝낸다", () => {
    // 공익수용(고시일 2020-01-01 · 취득 2014-01-01 — 고시일 전 2년·5년 이전 취득 성립) — 이력(철거 → 사업용으로 뒤집을 수 있는 시료)과 무관하게 의제로 끝난다.
    const exemptRaw = { ...e2RowRaw(E2_ROWS.find((r) => r.id === "M6")!), transferCause: "public_expropriation", expropriationNoticeDate: "2020-01-01", nblExemptPublicExpropriation: true };
    const j = judge(fromRaw(exemptRaw));
    expect(j.isNonBusinessLand).toBe(false);
    expect(j.periodEvaluation?.basis).toBe("not_judged");
  });
});

describe("E2 ⑭ 매퍼 — 질문 답별 운반 · hasBuilding 파생(V-19 · P-15)", () => {
  const base = e2RowRaw(E2_ROWS.find((r) => r.id === "M6")!);

  it("`changed` + 신축으로 끝나면 숨은 토글이 «건축물 없음»이어도 사건이 이긴다 — 엔진 input hasBuilding = true", () => {
    const input = fromRaw({ ...base, nblOtherHasBuilding: false });
    expect(input.otherLand?.hasBuilding).toBe(true);
    expect(input.landStateHistory?.mode).toBe("changed");
    expect(input.landStateHistory?.events.map((e) => e.kind)).toEqual(["building_built"]);
  });

  it("`changed` + 철거로 끝나면 숨은 토글이 «건축물 있음»이어도 사건이 이긴다 — hasBuilding = false(+ 건축물 의존 칸 복합용도 안분도 끈다)", () => {
    const input = fromRaw({ ...e2RowRaw(E2_ROWS.find((r) => r.id === "M1")!), nblOtherHasBuilding: true, nblOtherMixedUseMode: "floor_area", nblOtherMixedUseSpecificFloorArea: "10", nblOtherMixedUseTotalFloorArea: "20" });
    expect(input.otherLand?.hasBuilding).toBe(false);
    expect(input.otherLand?.mixedUseBuildingMode).toBeUndefined();
  });

  it("`unchanged`·`unknown`은 모드만 싣고 사건은 싣지 않는다 · 숨은 토글을 그대로 쓴다 · `\"\"`·미전송은 이력 없음(undefined)", () => {
    const events = [{ kind: "building_built", date: "2023-06-01" }];
    for (const mode of ["unchanged", "unknown"] as const) {
      const input = fromRaw({ ...base, nblOtherStateHistoryMode: mode, nblOtherStateEvents: events, nblOtherHasBuilding: false });
      expect(input.landStateHistory).toEqual({ mode, events: [] });
      expect(input.otherLand?.hasBuilding).toBe(false);
    }
    expect(fromRaw({ ...base, nblOtherStateHistoryMode: "" }).landStateHistory).toBeUndefined();
    const { nblOtherStateHistoryMode: _m, nblOtherStateEvents: _e, ...noFields } = base;
    expect(fromRaw(noFields).landStateHistory).toBeUndefined();
  });

  it("이력을 쓰지 않는 지목(농지)은 이력 칸이 와도 싣지 않는다 — `consumesStateHistory` 소비표", () => {
    const farm = fromRaw({ ...base, nblLandType: "farmland", nblZoneType: "agriculture_forest" });
    expect(farm.landStateHistory).toBeUndefined();
  });

  it("날짜는 Date(UTC 자정)로 변환된다 · 철거 직전 재산세 구분은 철거 사건에만 실린다", () => {
    const input = fromRaw(e2RowRaw(E2_ROWS.find((r) => r.id === "S1")!));
    const [rm, built] = input.landStateHistory!.events;
    expect([rm.kind, rm.date.toISOString(), rm.propertyTaxTypeBefore]).toEqual(["building_removed", "2022-03-01T00:00:00.000Z", "separate"]);
    expect([built.kind, built.date.toISOString(), "propertyTaxTypeBefore" in built]).toEqual(["building_built", "2022-05-01T00:00:00.000Z", false]);
  });
});
