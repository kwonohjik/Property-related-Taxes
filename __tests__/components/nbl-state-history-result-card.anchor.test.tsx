// @vitest-environment jsdom
/**
 * NBL-STATE-HISTORY-U2 — ⑦ 결과 카드 anchor. 엔진 echo(`periodEvaluation.stateHistory`) → 구간표 · 영 §168조의6 기준 풀어쓰기.
 * 계획서: docs/01-plan/features/nbl-other-land-state-history.ui.plan.md §7
 *
 * 입력은 엔진 계획서 §6 표(`E2_ROWS` · raw → ⑭ 매퍼 → 엔진)를 그대로 쓴다 — 가공한 echo가 아니라 실제 엔진 결과를 렌더한다.
 * 와이어 경유(날짜가 문자열이 되는 JSON) 결과도 한 건 검증한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NonBusinessLandResultCard } from "@/components/calc/NonBusinessLandResultCard";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES as R } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandJudgment } from "@/lib/tax-engine/non-business-land/types";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { E2_ROWS, e2RowRaw, type E2Row } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e2-table";
import { E3_ROWS, e3RowRaw } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-1-table";
import { NBL_STATE_HISTORY_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";

afterEach(cleanup);

const row = (id: string): E2Row => E2_ROWS.find((r) => r.id === id)!;
const judgeRaw = (raw: Record<string, unknown>): NonBusinessLandJudgment => judgeNonBusinessLand(buildNblEngineInput(raw as never)!, R);
const judgeRow = (id: string) => judgeRaw(e2RowRaw(row(id)));
const mount = (j: NonBusinessLandJudgment) => render(<NonBusinessLandResultCard judgment={j} />);
const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, " ") ?? "";
const crit = (r: ReturnType<typeof render>, key: string) => r.queryByTestId(`nbl-state-history-criterion-${key}`);

describe("구간표 — 행 · 일수 합 · 열", () => {
  it("M1: 2구간(건축물 있음·별도합산 2,556일 사업용 / 없음 1,095일 비사업용) · 합계 = 소유기간 3,651일 = Σ 구간 일수", () => {
    const j = judgeRow("M1");
    const r = mount(j);
    const rows = r.getAllByTestId(/^nbl-state-history-interval-\d+$/);
    expect(rows).toHaveLength(2);
    expect(text(rows[0])).toContain("2014-01-02 ~ 2020-12-31");
    expect(text(rows[0])).toContain("2,556일");
    expect(text(rows[0])).toContain("있음");
    expect(text(rows[0])).toContain("별도합산");
    expect(text(rows[0])).toContain("사업용");
    expect(text(rows[1])).toContain("2021-01-01 ~ 2023-12-31");
    expect(text(rows[1])).toContain("1,095일");
    expect(text(rows[1])).toContain("비사업용");
    const sum = j.periodEvaluation!.stateHistory!.intervals.reduce((s, iv) => s + iv.days, 0);
    expect(sum).toBe(3651);
    expect(text(r.getByTestId("nbl-state-history-total-row"))).toContain("3,651일");
    expect(r.queryByTestId("nbl-state-history-grace-row")).toBeNull();
  });

  it("R3: 철거 직전 재산세 구분 «모름» → «종합합산(모름 — 확인 필요)»", () => {
    const r = mount(judgeRow("R3"));
    expect(text(r.getByTestId("nbl-state-history-interval-0"))).toContain("종합합산(모름 — 확인 필요)");
    expect(text(r.getByTestId("nbl-state-history-interval-0"))).toContain("비사업용");
  });

  it("M2: 유예 가산 행(730일) · 사업용으로 본 기간 문구에 «사업용 구간 + 유예기간 가산»", () => {
    const j = judgeRow("M2");
    const r = mount(j);
    expect(text(r.getByTestId("nbl-state-history-grace-row"))).toContain("730일");
    expect(text(r.getByTestId("nbl-state-history-criteria"))).toContain("(사업용 구간 2,556일 + 유예기간 가산 730일)");
    expect(text(r.getByTestId("nbl-state-history-total-row"))).toContain("3,286일");
  });
});

describe("영 §168조의6 기준 — 가·나·다목 충족/미충족 · 버킷별 생략", () => {
  it("M1(소유 5년 이상): 가·나·다 3행 — 가 충족(1,095 > 730) · 나 충족(1,095 > 365) · 다 미충족(1,095 ≤ 1,460) → 사업용", () => {
    const r = mount(judgeRow("M1"));
    expect(text(crit(r, "ga")!)).toContain("직전 5년(1,826일) 중 비사업용 기간 1,095일 — 기준 730일 초과");
    expect(text(crit(r, "ga")!)).toContain("→ 충족");
    expect(text(crit(r, "na")!)).toContain("직전 3년(1,095일) 중 비사업용 기간 1,095일 — 기준 365일 초과");
    expect(text(crit(r, "na")!)).toContain("→ 충족");
    expect(text(crit(r, "da")!)).toContain("소유기간의 100분의 40(1,460일) 초과");
    expect(text(crit(r, "da")!)).toContain("→ 미충족");
    expect(text(r.getByTestId("nbl-state-history-criteria"))).toContain("제1호");
    expect(text(r.getByTestId("nbl-state-history-criteria-verdict"))).toContain("미충족인 기준이 있어 사업용");
  });

  it("M6(세 기준 모두 충족): 비사업용으로 본다", () => {
    const j = judgeRow("M6");
    expect(j.isNonBusinessLand).toBe(true);
    const r = mount(j);
    for (const k of ["ga", "na", "da"]) expect(text(crit(r, k)!)).toContain("→ 충족");
    expect(text(r.getByTestId("nbl-state-history-criteria-verdict"))).toContain("모두 충족해 비사업용");
  });

  it("M14-2(소유 3~5년 — 2호): 가목은 «소유기간에서 3년을 뺀 기간» · 나·다 포함", () => {
    const j = judgeRow("M14-2");
    expect(j.periodEvaluation!.stateHistory!.criteria.ownershipBucket).toBe(2);
    const r = mount(j);
    expect(text(r.getByTestId("nbl-state-history-criteria"))).toContain("제2호");
    expect(text(crit(r, "ga")!)).toContain("소유기간에서 3년을 뺀 기간");
    expect(crit(r, "na")).not.toBeNull();
    expect(crit(r, "da")).not.toBeNull();
  });

  it("P1(소유 3년 미만 · 2년 이상 — 3호): 나목(직전 3년) 행 없음 · 가목 «소유기간에서 2년을 뺀 기간» · 40% 기준은 «나목»", () => {
    const j = judgeRow("P1");
    expect(j.periodEvaluation!.stateHistory!.criteria.ownershipBucket).toBe(3);
    const r = mount(j);
    expect(text(r.getByTestId("nbl-state-history-criteria"))).toContain("제3호");
    expect(text(crit(r, "ga")!)).toContain("소유기간에서 2년을 뺀 기간");
    expect(crit(r, "na")).toBeNull();
    expect(text(crit(r, "da")!)).toContain("나목");
    expect(text(crit(r, "da")!)).toContain("100분의 40");
  });

  it("M13(소유 2년 미만 — 3호 단서): 가목·나목 행 모두 없고 40% 기준 한 행만", () => {
    const r = mount(judgeRow("M13"));
    expect(crit(r, "ga")).toBeNull();
    expect(crit(r, "na")).toBeNull();
    expect(crit(r, "da")).not.toBeNull();
  });

  it("변수 약어·floor 표기·코드 boolean 이름이 화면에 없다", () => {
    const r = mount(judgeRow("M1"));
    const t = text(r.getByTestId("nbl-state-history-period"));
    for (const bad of ["floor", "rule2of3Years", "rule5Years", "rule80Percent", "limitGa", "nonBizTotal", "Sum_"]) expect(t).not.toContain(bad);
  });
});

describe("고지 — 중복 없이 한 번 · 이력 반영 사유", () => {
  it("한정 고지(NBL_STATE_HISTORY_APPLIED_NOTICE)는 카드 «주의사항»에 정확히 한 번 나온다", () => {
    const r = mount(judgeRow("M1"));
    const t = r.container.textContent ?? "";
    expect(t.split(NBL_STATE_HISTORY_APPLIED_NOTICE).length - 1).toBe(1);
  });

  it("이력이 판정을 뒤집으면(M1: 이력 없으면 비사업용) 배너에 엔진 사유가 보인다", () => {
    const j = judgeRow("M1");
    const r = mount(j);
    expect(j.judgmentReason).toContain("건축물 이력");
    expect(r.container.textContent).toContain(j.judgmentReason);
  });
});

describe("와이어 경유(JSON — 날짜가 문자열)", () => {
  it("JSON 왕복한 결과도 같은 구간표를 그린다", () => {
    const j = JSON.parse(JSON.stringify(judgeRow("M1"))) as NonBusinessLandJudgment;
    const r = mount(j);
    expect(text(r.getByTestId("nbl-state-history-interval-0"))).toContain("2014-01-02 ~ 2020-12-31");
    expect(text(r.getByTestId("nbl-state-history-interval-1"))).toContain("2021-01-01 ~ 2023-12-31");
  });
});

describe("이력 없음 — 기존 카드 그대로", () => {
  it("이력 모드 없음/unchanged/unknown: 구간표·기준 블록이 없다(basis ≠ state_history)", () => {
    for (const mode of ["", "unchanged", "unknown"]) {
      const j = judgeRaw({ ...e2RowRaw(row("M1")), nblOtherStateHistoryMode: mode, nblOtherStateEvents: [] });
      expect(j.periodEvaluation?.basis).not.toBe("state_history");
      const r = mount(j);
      expect(r.queryByTestId("nbl-state-history-period")).toBeNull();
      expect(r.queryByTestId("nbl-state-history-intervals")).toBeNull();
      r.unmount();
    }
  });

  it("state_history echo가 없는 state_history basis(구 저장 결과 방어)는 블록 없이 렌더된다", () => {
    const j = judgeRow("M1");
    const stripped = { ...j, periodEvaluation: { basis: "state_history" as const } };
    const r = mount(stripped);
    expect(r.queryByTestId("nbl-state-history-period")).toBeNull();
  });
});

describe("소유기간 0일(M16 — 축 B 지분이 양도 전날 취득) — U3 probe 실측", () => {
  // 엔진은 0일 보유를 기간기준 비교 없이 비사업용으로 처리한다(`period-criteria.ts` 0일 가드 — 수치 echo 없음).
  // 종전 카드는 기준 행 «나목 0일 중 0일 — 100분의 40(0일) 초과 → 미충족»을 그리면서 판정 문구는 «모두 충족해 비사업용»이라 서로 어긋났다.
  it("M16: 비사업용인데 기준 행(미충족)을 그리지 않고, 엔진 처리(비교 없이 비사업용)를 밝힌다 — 행·«모두 충족» 문구와 모순 없음", () => {
    const j = judgeRow("M16");
    expect(j.isNonBusinessLand).toBe(true);
    expect(j.periodEvaluation?.stateHistory?.intervals).toEqual([]);
    const r = mount(j);
    expect(text(r.getByTestId("nbl-state-history-zero-days"))).toContain("소유기간이 0일");
    expect(text(r.getByTestId("nbl-state-history-zero-days"))).toContain("기간기준(가·나·다목) 비교 없이 비사업용");
    for (const k of ["ga", "na", "da"]) expect(crit(r, k)).toBeNull();
    expect(r.queryByTestId("nbl-state-history-criteria-verdict")).toBeNull();
    expect(text(r.getByTestId("nbl-state-history-total-row"))).toContain("0일");
  });

  it("M16c-bare(소유 1일): 0일 분기가 아니다 — 기준 행·판정 문구 그대로(꼬리 나대지 1일 > 0일 → 나목 충족 → 비사업용)", () => {
    const j = judgeRaw({ ...e2RowRaw(row("M16c-bare")) });
    expect(j.periodEvaluation?.stateHistory?.criteria.limitDa).toBe(0);
    const r = mount(j);
    expect(r.queryByTestId("nbl-state-history-zero-days")).toBeNull();
    expect(text(crit(r, "da")!)).toContain("→ 충족");
    expect(text(r.getByTestId("nbl-state-history-criteria-verdict"))).toContain("모두 충족해 비사업용");
  });
});

describe("E3-① 재산세 과세 구분 변경 — 건축물 «있음» 두 구간이 재산세 구분만 달라도 표에서 읽힌다 (UV-8 · 열 추가 없음)", () => {
  const e3 = (id: string) => judgeRaw(e3RowRaw(E3_ROWS.find((r) => r.id === id)!));

  it("T1(M12: 별도합산 → 종합합산 2022-06-01): 제목에 «재산세 구분 이력» · 두 행 모두 건축물 «있음» · 재산세 구분 열이 별도합산 / 종합합산으로 갈린다 · 사업용 3,072일 + 비사업용 579일", () => {
    const j = e3("T1");
    expect(j.isNonBusinessLand).toBe(false);
    const r = mount(j);
    expect(text(r.getByTestId("nbl-state-history-period"))).toContain("기간 분석 — 소유기간 중 건축물 유무·재산세 구분 이력 반영");
    const rows = r.getAllByTestId(/^nbl-state-history-interval-\d+$/);
    expect(rows).toHaveLength(2);
    expect(text(rows[0])).toContain("2014-01-02 ~ 2022-05-31");
    expect(text(rows[0])).toContain("3,072일");
    expect(text(rows[0])).toContain("있음");
    expect(text(rows[0])).toContain("별도합산");
    expect(text(rows[0])).toContain("사업용");
    expect(text(rows[1])).toContain("2022-06-01 ~ 2023-12-31");
    expect(text(rows[1])).toContain("579일");
    expect(text(rows[1])).toContain("있음");
    expect(text(rows[1])).toContain("종합합산");
    expect(text(rows[1])).toContain("비사업용");
    expect(text(r.getByTestId("nbl-state-history-total-row"))).toContain("3,651일");
  });

  it("T1 고지: 구분 변경 사건이 있으면 변형 고지(TAX_CHANGE_APPLIED)가 한 번 · 종전 한정 고지는 함께 뜨지 않는다(대체)", () => {
    const r = mount(e3("T1"));
    const t = r.container.textContent ?? "";
    expect(t.split(NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE).length - 1).toBe(1);
    expect(t).not.toContain(NBL_STATE_HISTORY_APPLIED_NOTICE);
  });

  it("T15(변경 직전 «모름»): 첫 행 «종합합산(모름 — 확인 필요)» · 비사업용 · 모름 고지가 결과 경고에 있다", () => {
    const j = e3("T15");
    expect(j.isNonBusinessLand).toBe(true);
    const r = mount(j);
    expect(text(r.getByTestId("nbl-state-history-interval-0"))).toContain("종합합산(모름 — 확인 필요)");
    expect(r.container.textContent).toContain(NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE);
  });
});
