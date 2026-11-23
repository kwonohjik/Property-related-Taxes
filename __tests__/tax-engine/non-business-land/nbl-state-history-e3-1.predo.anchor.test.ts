/**
 * NBL-STATE-HISTORY-E3-① (E3-0, 테스트만) — Pre-Do anchor. 지금 코드로 green이어야 한다(제품 코드 변경 0).
 *
 *   Anchor 1  일 단위 정답표: 계획서 §5 21행 + 참고 3행을 `meetsPeriodCriteria`에 «이전 구간 ∪ 꼬리» 구간(`biz`)을 직접 넣어 일수·판정 고정.
 *             임계선 쌍 3개(T3a/b 나목 730/729 · T4a/b 다목 2,191/2,190 · T12a/b 윤일 창 731/730)는 E2 표(M8a/b · Z-1460/1461 · M8c)와 **일수·판정이 같다**.
 *   Anchor 3  `effectiveOtherHasBuilding`의 `?? raw` 경로 — 사건 없는 `changed`에서 raw 토글을 쓴다. 지금까지는 `changed`이면 사건이 항상 ≥ 1건이라
 *             도달 불가였고 mutation 0건(M4: `?? raw` → `?? false`)이었다. E3-①의 tax-only 이력(건축물 사건 0건)이 이 경로를 **도달 가능**하게 만든다.
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-1-tax-type-change.engine.plan.md §5 · §7.1(M4) · §7.2 Anchor 1·3
 * 표: `_helpers/nbl-state-history-e3-1-table.ts` — E3-1a의 leaf 단위·엔진·route anchor가 같은 표를 쓴다.
 */
import { describe, it, expect } from "vitest";
import { E3_REFERENCE_ROWS, E3_ROWS, E3_SWING, E3_B, E3_N } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-1-table";
import { DAY_ROWS, evalDayRow } from "@/__tests__/tax-engine/_helpers/nbl-state-history-day-table";
import { E2_ROWS, e2RowRaw } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e2-table";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { effectiveOtherHasBuilding } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { hasBuildingAtTransfer } from "@/lib/tax-engine/non-business-land/other-land-state-history";

const rowOf = (id: string) => E3_ROWS.find((r) => r.id === id)!;
const evalRow = (id: string) => {
  const r = rowOf(id);
  return evalDayRow({ acq: r.acq ?? "2014-01-01", transfer: r.transfer ?? "2024-01-01", biz: r.biz.map(([a, b]) => [a, b] as const) });
};

describe("E3-0 Anchor 1 — §5 매트릭스 21행: 판정 · 일수 (일 단위 정답표)", () => {
  it("표 규모: 21행 · id 중복 없음 · T1~T15 전부 포함", () => {
    expect(E3_ROWS).toHaveLength(21);
    expect(new Set(E3_ROWS.map((r) => r.id)).size).toBe(21);
    const ids = E3_ROWS.map((r) => r.id);
    for (const id of ["T1", "T2", "T3a", "T3b", "T4a", "T4b", "T5", "T6", "T7", "T8", "T9c", "T9o", "T10", "T11", "T11b", "T12a", "T12b", "T13", "T14", "T15"]) expect(ids, id).toContain(id);
  });

  it.each(E3_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, row) => {
    const res = evalRow(row.id);
    expect(res.meets).toBe(!row.expect.nonBusiness);
    expect(res.totalOwnershipDays).toBe(row.expect.total);
    expect(res.effectiveBusinessDays).toBe(row.expect.eff);
    expect(res.ownershipBucket).toBe(row.expect.bucket);
  });

  it.each(E3_REFERENCE_ROWS.map((r) => [r.id, r.scenario, r] as const))("참고 %s — %s", (_id, _s, r) => {
    const res = evalDayRow({ acq: "2014-01-01", transfer: "2024-01-01", biz: r.biz });
    expect([res.meets, res.effectiveBusinessDays, res.totalOwnershipDays]).toEqual([r.expect.meets, r.expect.eff, r.expect.total]);
  });

  it("스윙: 전량 사업용 B와 전량 비사업용 N의 차이 = 55,750,000 — 과대 해소(T1·T4a·T5·T6·T8) · 과소 해소(T2·T3b·T4b·T7·T12b·T15)의 부호가 판정 방향과 같다", () => {
    expect(E3_N - E3_B).toBe(E3_SWING);
    expect(E3_SWING).toBe(55_750_000);
    for (const r of E3_ROWS.filter((x) => x.expect.tax === E3_B)) expect(r.expect.nonBusiness, r.id).toBe(false);
    for (const r of E3_ROWS.filter((x) => x.expect.tax === E3_N)) expect(r.expect.nonBusiness, r.id).toBe(true);
  });
});

describe("E3-0 Anchor 1 — 임계선 쌍: E2 표와 일수·판정이 같다 (구분 변경도 같은 `meetsPeriodCriteria`로 들어간다)", () => {
  const e2 = (id: string) => DAY_ROWS.find((r) => r.id === id)!;
  const PAIRS = [
    ["T3a", "T3b", "M8a", "M8b", "나목 «1년 초과»: 꼬리 730 → 사업용 / 729 → 비사업용"],
    ["T4a", "T4b", "Z-1460", "Z-1461", "다목 40%: 비사업 1,460 → 사업용 / 1,461 → 비사업용"],
    ["T12a", "T12b", "M8c-731", "M8c-730", "윤일 낀 창: 꼬리 731 → 사업용 / 730 → 비사업용(730/729가 아니다)"],
  ] as const;

  it.each(PAIRS)("%s ↔ %s (= E2 %s ↔ %s) — %s", (front, back, e2Front, e2Back) => {
    const a = evalRow(front);
    const b = evalRow(back);
    expect(a.meets).toBe(true);
    expect(b.meets).toBe(false);
    expect(a.effectiveBusinessDays - b.effectiveBusinessDays).toBe(1);
    expect([a.effectiveBusinessDays, a.meets]).toEqual([e2(e2Front).expect.eff, e2(e2Front).expect.meets]);
    expect([b.effectiveBusinessDays, b.meets]).toEqual([e2(e2Back).expect.eff, e2(e2Back).expect.meets]);
  });

  it("T1 ↔ T1b: 하루 이동 = 정확히 1일 변화(판정은 모두 사업용) · E2 M4·M4b와 같은 일수 — 6.1.(과세기준일)은 특별하지 않다", () => {
    const [a, b] = [evalRow("T1"), evalRow("T1b")];
    expect([a.effectiveBusinessDays, b.effectiveBusinessDays]).toEqual([3072, 3073]);
    expect([a.meets, b.meets]).toEqual([true, true]);
    expect([e2("M4").expect.eff, e2("M4b").expect.eff]).toEqual([3072, 3073]);
  });
});

describe("E3-0 Anchor 3 — `?? raw` 경로(M4 무방비 해소): 건축물 사건 0건이면 양도일 현재 건축물 유무는 raw 토글", () => {
  it("`hasBuildingAtTransfer([])` = undefined — «사건으로는 모른다»는 뜻(호출자가 raw를 쓴다)", () => {
    expect(hasBuildingAtTransfer([])).toBeUndefined();
  });

  it("`effectiveOtherHasBuilding(raw, \"changed\", [])` = raw — true는 true · false는 false (`?? false`·`?? true` 어느 쪽 mutation도 잡는다)", () => {
    expect(effectiveOtherHasBuilding(true, "changed", [])).toBe(true);
    expect(effectiveOtherHasBuilding(false, "changed", [])).toBe(false);
  });

  it("`changed`가 아니면 사건과 무관하게 raw 그대로", () => {
    for (const mode of ["", "unchanged", "unknown", undefined]) {
      expect(effectiveOtherHasBuilding(true, mode, [{ kind: "building_removed" }]), String(mode)).toBe(true);
      expect(effectiveOtherHasBuilding(false, mode, [{ kind: "building_built" }]), String(mode)).toBe(false);
    }
  });

  it("`changed` + 사건이 있으면 사건이 이긴다(V-19) — raw와 모순돼도(회귀 가드: `?? raw`는 사건이 없을 때만 쓰인다)", () => {
    expect(effectiveOtherHasBuilding(false, "changed", [{ kind: "building_built" }])).toBe(true);
    expect(effectiveOtherHasBuilding(true, "changed", [{ kind: "building_removed" }])).toBe(false);
  });

  it("⑭ 매퍼: `changed` + 사건 0행 raw → 엔진 input의 hasBuilding = raw 토글 (직접 API가 사건 없는 changed를 보낸 경우 — ⑫가 막지만 매퍼는 raw를 쓴다)", () => {
    const base = e2RowRaw(E2_ROWS.find((r) => r.id === "M1")!);
    for (const toggle of [true, false]) {
      const input = buildNblEngineInput({ ...base, nblOtherStateEvents: [], nblOtherHasBuilding: toggle } as never)!;
      expect(input.landStateHistory?.mode).toBe("changed");
      expect(input.landStateHistory?.events).toEqual([]);
      expect(input.otherLand?.hasBuilding, `toggle=${toggle}`).toBe(toggle);
    }
  });
});
