/**
 * NBL-STATE-HISTORY-E0 · Anchor 1 — 일 단위 임계선 쌍 + v2 폐기 가드 G1·G2 (모델 고정 · «일 단위 정답표»)
 *
 * 계획서(정본): docs/01-plan/features/nbl-other-land-state-history.plan.md §4 E0 (통합 v3)
 *   엔진 계획서: docs/01-plan/features/nbl-other-land-state-history.engine.plan.md §4.2(산식) · §6(케이스 매트릭스 «일 단위» 열 · «임계선 상수») · §7.2 Anchor 1
 * 결정(2026-11-22 사용자)
 *   · V-1 **일 단위** — 영 §168조의6 «기간의 계산은 일수로 한다». 과세기준일(6.1.) 단위로 «접는» 구현은 폐기(재제안 금지) — G1·G2와 6.1. 이웃 쌍이 접기 재구현을 막는다.
 *   · Q-15 (가) — core 자체 사업기간(DM-01 당해 사업개시일 · 3호 조성 완료 `[완료일, +2년)`)이 있으면 꼬리(양도일 현재) 구간은
 *     «꼬리 ∩ core 자체 사업기간»으로만 사업용으로 인정한다. 이력 우선 · 양도일 의제 동시 시 이력 미적용은 유지.
 *
 * 이 anchor는 `meetsPeriodCriteria`만으로 지금(master) green이다 — 이력 leaf(E1)가 없다. E1이 사건에서 만드는 구간이 `DAY_ROWS`의 `biz`와 다르면 E1의 leaf 단위 테스트가
 * 같은 표(`_helpers/nbl-state-history-day-table.ts`)로 빨강이 되어야 한다. 기대값은 §6 «일 단위» 열을 손 유도·probe로 전 행 확인한 값이다(2026-11-22).
 */
import { describe, it, expect } from "vitest";
import { BUCKET_ROWS, DAY_ROWS, dayDate, evalDayRow, lensOf } from "@/__tests__/tax-engine/_helpers/nbl-state-history-day-table";
import { meetsPeriodCriteria } from "@/lib/tax-engine/non-business-land/period-criteria";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const row = (id: string) => DAY_ROWS.find((r) => r.id === id)!;
const run = (id: string) => evalDayRow(row(id));

describe("NBL-STATE-HISTORY-E0 Anchor 1 — §6 대표 행: 판정 · 일수 · 가·나·다 (일 단위 정답표)", () => {
  it("정답표 규모: 대표 행 ≥ 40 · id 중복 없음", () => {
    expect(DAY_ROWS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(DAY_ROWS.map((r) => r.id)).size).toBe(DAY_ROWS.length);
  });

  it.each(DAY_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, r) => {
    const res = evalDayRow(r);
    expect(res.meets).toBe(r.expect.meets);
    expect(res.totalOwnershipDays).toBe(r.expect.total);
    expect(res.effectiveBusinessDays).toBe(r.expect.eff);
    expect(res.ownershipBucket).toBe(r.expect.bucket);
    if (r.expect.graceDays !== undefined) expect(res.gracePeriodDays).toBe(r.expect.graceDays);
    if (r.expect.bizIn3 !== undefined) expect(res.bizInLast3).toBe(r.expect.bizIn3);
    if (r.expect.bizIn5 !== undefined) expect(res.bizInLast5).toBe(r.expect.bizIn5);
    if (r.expect.lens !== undefined) expect(lensOf(res)).toBe(r.expect.lens);
  });
});

describe("NBL-STATE-HISTORY-E0 Anchor 1 — 임계선 쌍: 하루 차이로 판정이 정확히 뒤집힌다", () => {
  /** [앞 행(사업용), 뒤 행(비사업용), 임계선 설명] — 두 행의 사업 일수는 정확히 1일 차이. */
  const PAIRS = [
    ["M8a", "M8b", "1호 나목 «직전 3년 중 1년 초과»: 사업 730 → 사업용 / 729 → 비사업용"],
    ["M8c-731", "M8c-730", "같은 목 — 윤일 낀 창(양도 2024-03-01, 창 1,096일): 경계는 사업 731/730(730/729가 아니다)"],
    ["Z-1460", "Z-1461", "1호 다목 «소유기간 100분의 40 초과»: 비사업 1,460 = floor(3,651×40/100) → 사업용 / 1,461 → 비사업용"],
    ["GA-730", "GA-731", "1호 가목 «직전 5년 중 2년(730일) 초과»: 비사업 730 → 사업용 / 731 → 비사업용"],
    ["M16b-사업", "M16b-나대지", "소유 1일: 꼬리 사업용 → 사업용 / 꼬리 나대지 → 비사업용(3호 단서)"],
  ] as const;

  it.each(PAIRS)("%s ↔ %s — %s", (front, back) => {
    const a = run(front);
    const b = run(back);
    expect(a.meets).toBe(true);
    expect(b.meets).toBe(false);
    expect(a.effectiveBusinessDays - b.effectiveBusinessDays).toBe(1);
  });

  it("추가 이웃: 다목 1,462(철거 2019-12-31)·가목 729(철거 2022-01-02)도 같은 방향 — 임계선은 한 곳뿐이다", () => {
    expect(run("Z-1462").meets).toBe(false);
    expect(run("GA-729").meets).toBe(true);
  });

  it("소유기간 0일 = 비사업용(사업 구간 입력과 무관) · 1일 = 위 소유 1일 쌍", () => {
    const zero = evalDayRow({ ...row("M16"), biz: [["2023-12-31", "2024-01-01"]] });
    expect(zero.totalOwnershipDays).toBe(0);
    expect(zero.meets).toBe(false);
    expect(run("M16").meets).toBe(false);
  });

  it("빈 구간(길이 0일) 사업 구간은 판정에 영향이 없다 — 사건일 = 소유 첫날 (§3.6 E = OS)", () => {
    expect(run("M16c").meets).toBe(run("M16b-사업").meets);
    expect(run("M16c").effectiveBusinessDays).toBe(run("M16b-사업").effectiveBusinessDays);
    expect(run("E=OS").effectiveBusinessDays).toBe(0);
  });

  it.each(BUCKET_ROWS)("소유기간 버킷 경계 — $id", ({ acq, total, bucket }) => {
    const r = evalDayRow({ acq, transfer: "2024-01-01", biz: [] });
    expect(r.totalOwnershipDays).toBe(total);
    expect(r.ownershipBucket).toBe(bucket);
  });
});

describe("NBL-STATE-HISTORY-E0 Anchor 1 — v2 폐기 가드 G1·G2: 6.1.(과세기준일)은 특별하지 않다", () => {
  it("G1 준공 2022-06-01(6.1. 당일) → 비사업용 · 사업 579일 — «접기»를 구현하면 사업용으로 뒤집힌다", () => {
    const r = run("G1");
    expect(r.meets).toBe(false);
    expect(r.effectiveBusinessDays).toBe(579);
  });

  it("G2 철거 2020-06-01(6.1. 당일) → 사업용 · 비사업 1,309일 — «접기»를 구현하면 비사업용으로 뒤집힌다", () => {
    const r = run("G2");
    expect(r.meets).toBe(true);
    expect(r.totalOwnershipDays - r.effectiveBusinessDays).toBe(1309);
  });

  it("6.1. 경계 쌍(준공 05-31 / 06-01 / 06-02): 일 단위 판정이 그대로 — 하루 이동 = 정확히 1일 변화, 판정은 모두 비사업용", () => {
    const eff = ["2022-05-31", "2022-06-01", "2022-06-02"].map((s) => evalDayRow({ acq: "2014-01-01", transfer: "2024-01-01", biz: [[s, "2024-01-01"]] }));
    expect(eff.map((r) => r.effectiveBusinessDays)).toEqual([580, 579, 578]);
    expect(eff.every((r) => !r.meets)).toBe(true);
  });

  it("6.1. 경계 쌍(철거 05-31 / 06-01 / 06-02): 일 단위 판정이 그대로 — 비사업 1,310 / 1,309 / 1,308, 판정은 모두 사업용", () => {
    const out = ["2020-05-31", "2020-06-01", "2020-06-02"].map((s) => evalDayRow({ acq: "2014-01-01", transfer: "2024-01-01", biz: [["2014-01-02", s]] }));
    expect(out.map((r) => r.totalOwnershipDays - r.effectiveBusinessDays)).toEqual([1310, 1309, 1308]);
    expect(out.every((r) => r.meets)).toBe(true);
  });

  it("연도가 달라도 6.1.은 특별하지 않다 — 6.1. 전후 하루씩 옮긴 사업 일수는 연속(선형): 2021·2022·2023", () => {
    for (const y of [2021, 2022, 2023]) {
      const days = [`${y}-05-31`, `${y}-06-01`, `${y}-06-02`].map(
        (s) => evalDayRow({ acq: "2014-01-01", transfer: "2024-01-01", biz: [[s, "2024-01-01"]] }).effectiveBusinessDays,
      );
      expect(days[0] - days[1]).toBe(1);
      expect(days[1] - days[2]).toBe(1);
    }
  });

  it("직접 호출 확인: 사업 구간 입력 순서·분할은 결과에 영향이 없다(반열린 구간 합집합)", () => {
    const whole = meetsPeriodCriteria([{ start: dayDate("2014-01-02"), end: dayDate("2020-06-01") }], dayDate("2014-01-01"), dayDate("2024-01-01"), "other_land", DEFAULT_NON_BUSINESS_LAND_RULES);
    const split = meetsPeriodCriteria(
      [{ start: dayDate("2017-01-01"), end: dayDate("2020-06-01") }, { start: dayDate("2014-01-02"), end: dayDate("2017-01-01") }],
      dayDate("2014-01-01"), dayDate("2024-01-01"), "other_land", DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(split.effectiveBusinessDays).toBe(whole.effectiveBusinessDays);
    expect(split.meets).toBe(whole.meets);
  });
});

describe("NBL-STATE-HISTORY-E0 Anchor 1 — Q-15 (가) 수치 고정 (E2 Anchor 4 선행 · core 자체 사업기간 경로)", () => {
  // ⚠️ V-21(미결 · E2 전 확인): (가) 문언은 «꼬리 ∩ core 자체 사업기간»이라 꼬리 앞 구간에 걸친 core 자체 사업기간(아래 3호 시료의 [2021-01-02, 2021-07-01) 185일)을
  //    세지 않는다. 그 구간까지 세면 730/1,094 사업용(현행 core와 같음). 아래 수치는 (가) 문언 그대로의 값이며 V-21 결정에 따라 E2에서 갱신될 수 있다.
  //    (docs/01-plan/features/nbl-other-land-state-history.engine.plan.md §8.2 V-21 · §8.3)
  // 시료: DM-01 — 잡종지 · 주차장운영업 수입금액비율 충족 · 당해 사업개시일 2024-03-01 · 취득 2014-01-01 · 양도 2024-06-30(소유 3,832일),
  //       이력 1건: 건축물(별도합산) 2014-01-02~2016-01-01 철거 → 꼬리 [2016-01-01, 2024-06-30).
  const DM = { acq: "2014-01-01", transfer: "2024-06-30" } as const;

  it("Q15a-(가): 꼬리 ∩ [개시일 2024-03-01, 양도일) + 건축물 구간 729일 → 사업 850일 · 비사업용(현행 DM-01과 같은 결론)", () => {
    const r = evalDayRow({ ...DM, biz: [["2014-01-02", "2016-01-01"], ["2024-03-01", "2024-06-30"]] });
    expect(r.effectiveBusinessDays).toBe(850);
    expect(r.meets).toBe(false);
    expect(lensOf(r)).toBe("TTT");
  });

  it("Q15a-(다) 원안(DM-01 건너뜀 → 꼬리 전체 사업용): 사업 3,832/3,832 · 사업용 — 이력 1건으로 비사업용 → 사업용이 되는 과소 경로(채택하지 않음)", () => {
    const r = evalDayRow({ ...DM, biz: [["2014-01-02", "2016-01-01"], ["2016-01-01", "2024-06-30"]] });
    expect(r.effectiveBusinessDays).toBe(3832);
    expect(r.meets).toBe(true);
  });

  // 시료: 3호 — 잡종지 · 취득 2021-01-01 · 조성 완료 2021-01-02 · 양도 2024-01-01(소유 1,094일 · 3호 버킷) · 이력: 신축 2021-07-01(꼬리 [2021-07-01, 2024-01-01)).
  //       현행 core는 3호 구간 [2021-01-02, 2023-01-02) 730일로 사업용(V-18 실측).
  it("3호 × 이력 (가): 꼬리 ∩ [조성 완료일, +2년) = [2021-07-01, 2023-01-02) 550일 → 비사업용", () => {
    const r = evalDayRow({ acq: "2021-01-01", transfer: "2024-01-01", biz: [["2021-07-01", "2023-01-02"]] });
    expect(r.totalOwnershipDays).toBe(1094);
    expect(r.effectiveBusinessDays).toBe(550);
    expect(r.meets).toBe(false);
  });

  it("3호 × 이력 (다) 원안(core 사업용 → 꼬리 전체): 914일 · 사업용 — 3호 «2년 경과분 제외» 문언을 넘어서는 과소 경로(채택하지 않음)", () => {
    const r = evalDayRow({ acq: "2021-01-01", transfer: "2024-01-01", biz: [["2021-07-01", "2024-01-01"]] });
    expect(r.effectiveBusinessDays).toBe(914);
    expect(r.meets).toBe(true);
  });

  it("3호 현행 core 구간(이력 없음) [2021-01-02, 2023-01-02) 730일 → 사업용 — 이력 없는 경로는 바이트 동일(Anchor 2)", () => {
    const r = evalDayRow({ acq: "2021-01-01", transfer: "2024-01-01", biz: [["2021-01-02", "2023-01-02"]] });
    expect(r.effectiveBusinessDays).toBe(730);
    expect(r.meets).toBe(true);
  });
});
