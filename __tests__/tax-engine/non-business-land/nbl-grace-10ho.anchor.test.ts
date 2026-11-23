/**
 * NBL-STATE-HISTORY-E3-② (E3c-0, 테스트만) — **10호 유예(`business_closure_relocation`, 규칙 §83의5①10호 «휴·폐업·이전일부터 2년») 안전망 신설**.
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-2-business-period.engine.plan.md §4 · §7.1 P-3 · §7.2 Anchor 3
 * 사실: 계획 단계 mutation P-3(`grace-reason-period.ts:49` 10호 `fixedYears: 2` → `3`)이 **0건 실패**였다 — `__tests__` 전체에 이 사유 코드를 검사하는 테스트가 없었다.
 *       E3c-2가 영위 기간 ON 경로에서만 «영위 통산 2년 미만이면 그 10호 유예 제외»를 넣으므로, **이 파일은 현행 동작(전제 검사 없음 · OFF)을 고정**한다.
 *
 * 전부 지금 코드로 green이어야 한다(제품 코드 변경 0). E3c-2 이후에도 green이어야 한다 — 전제 검사는 영위 기간 ON 경로 한정이다.
 */
import { describe, it, expect } from "vitest";
import { GRACE_REASON_SPECS, resolveGraceIntervals } from "@/lib/tax-engine/non-business-land/grace-reason-period";
import { graceRowIssue } from "@/lib/tax-engine/non-business-land/grace-row-issue";
import { meetsPeriodCriteria } from "@/lib/tax-engine/non-business-land/period-criteria";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { dayDate, evalDayRow } from "@/__tests__/tax-engine/_helpers/nbl-state-history-day-table";
import { E3C_ROWS, e3cRowRaw } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-2-table";

const CODE = "business_closure_relocation" as const;
const d = dayDate;
const iso = (x: Date) => x.toISOString().slice(0, 10);
const ctx = (transfer: string, over: Partial<{ dealer: boolean }> = {}) => ({ transferDate: d(transfer), acquisitionDate: d("2014-01-01"), isRealEstateDealerMatter: over.dealer ?? false });
const resolve = (anchor: string | undefined, transfer = "2024-06-30", over: Partial<{ dealer: boolean }> = {}) =>
  resolveGraceIntervals(CODE, anchor ? d(anchor) : undefined, undefined, undefined, ctx(transfer, over)).map((iv) => [iso(iv.start), iso(iv.end)]);

describe("E3c-0 Anchor 3 ① — 10호 유예 구간: 기산일 + 2년 (P-3: `fixedYears` 2 → 3이면 이 블록이 실패한다)", () => {
  it("사양: 기산일 + 고정 2년 · 매매업 단서 배제 호 아님 · 기산일 입력 필수(취득일 기산 아님)", () => {
    const spec = GRACE_REASON_SPECS[CODE];
    expect([spec.lengthKind, spec.fixedYears, spec.excludedForDealer, spec.anchorFromAcquisition]).toEqual(["fixed_from_anchor", 2, false, undefined]);
  });

  it.each([
    ["2021-06-01", [["2021-06-01", "2023-06-01"]]],
    ["2019-01-01", [["2019-01-01", "2021-01-01"]]], // 2020 윤년을 지나는 731일
    ["2023-03-01", [["2023-03-01", "2025-03-01"]]],
    ["2020-02-29", [["2020-02-29", "2022-02-28"]]], // 윤일 기산 — 없는 날은 말일(UTC 달력)
  ] as const)("기산일 %s → %j", (anchor, expected) => {
    expect(resolve(anchor)).toEqual(expected);
  });

  it("연수가 2년임을 일수로 고정: 731일(2019-01-01 기산) ≠ 3년(1,096일)", () => {
    const [iv] = resolveGraceIntervals(CODE, d("2019-01-01"), undefined, undefined, ctx("2024-06-30"));
    expect(Math.round((iv.end.getTime() - iv.start.getTime()) / 86_400_000)).toBe(731);
  });

  it("양도일 연혁과 무관: 9호(철거)와 달리 2025-03-21 전후로 연수가 바뀌지 않는다", () => {
    for (const transfer of ["2015-06-30", "2025-03-20", "2025-03-21", "2026-06-30"]) expect(resolve("2021-06-01", transfer), transfer).toEqual([["2021-06-01", "2023-06-01"]]);
  });

  it("매매업 단서(1·2호 배제)는 10호에 적용되지 않는다 — 부동산매매업 매매용부동산이어도 10호 유예는 산출된다", () => {
    expect(resolve("2021-06-01", "2024-06-30", { dealer: true })).toEqual([["2021-06-01", "2023-06-01"]]);
  });

  it("기산일이 없으면 구간을 만들지 않는다(자동 안분 fallback 금지) — 취득일로 대체하지 않는다", () => {
    expect(resolve(undefined)).toEqual([]);
  });

  it("⑧·⑫ 공용 leaf: 기산일 누락 → `anchorDate` 칸에 «기산일을 입력하세요» · 기산일이 있으면 이상 없음(종료일은 묻지 않는다 — 자동 산정)", () => {
    const issue = graceRowIssue({ reasonCode: CODE }, 0);
    expect(issue?.part).toBe("anchorDate");
    expect(issue?.message).toBe("휴·폐업·이전 (10호) 유예기간 — 기산일을 입력하세요.");
    expect(graceRowIssue({ reasonCode: CODE, anchorDate: "2021-06-01" }, 0)).toBeNull();
    expect(graceRowIssue({ reasonCode: CODE, anchorDate: "2021-06-01", endDate: "2020-01-01" }, 0)).toBeNull();
  });
});

describe("E3c-0 Anchor 3 ② — 합집합: 유예는 «사업용으로 본다»는 의제라 사업용 구간과 겹치는 날을 두 번 세지 않는다 (이중 계상 없음)", () => {
  const trade = { acq: "2014-01-01", transfer: "2024-06-30" };

  it("영업 [소유 첫날, 2021-06-01) + 10호 유예 [2021-06-01, 2023-06-01): 맞닿는 구간 — 합 3,437 = 2,707 + 730(겹침 0)", () => {
    const r = evalDayRow({ ...trade, biz: [["2014-01-02", "2021-06-01"]], grace: [["2021-06-01", "2023-06-01"]] });
    expect([r.effectiveBusinessDays, r.gracePeriodDays]).toEqual([3437, 730]);
  });

  it("유예가 영업 구간과 70일 겹치면 증가분은 730 − 70 = 660일 · 유효 일수 3,367 (산술 합산 3,437이 아니다)", () => {
    const r = evalDayRow({ ...trade, biz: [["2014-01-02", "2021-06-01"]], grace: [["2021-03-23", "2023-03-23"]] });
    expect([r.effectiveBusinessDays, r.gracePeriodDays]).toEqual([3367, 3367 - 2707]);
    expect(r.gracePeriodDays).toBe(660);
  });

  it("유예가 영업 구간 안에 완전히 겹치면 가산 0 — 결과 카드 «유예기간 가산»은 증가분이다", () => {
    const r = evalDayRow({ ...trade, biz: [["2014-01-02", "2021-06-01"]], grace: [["2020-01-01", "2021-06-01"]] });
    expect([r.effectiveBusinessDays, r.gracePeriodDays]).toEqual([2707, 0]);
  });

  it("양도일 이후로 흘러가는 유예(2년)는 양도일까지만 센다 — 소유기간을 넘지 않는다", () => {
    const [iv] = resolveGraceIntervals(CODE, d("2024-03-01"), undefined, undefined, ctx("2024-06-30"));
    const r = meetsPeriodCriteria([], d("2014-01-01"), d("2024-06-30"), "other_land", DEFAULT_NON_BUSINESS_LAND_RULES, [{ reasonCode: CODE, startDate: iv.start, endDate: iv.end }]);
    expect(r.gracePeriodDays).toBe(121); // 2024-03-01 ~ 2024-06-30 (끝 제외)
  });
});

describe("E3c-0 Anchor 3 ③ — 현행(영위 기간 OFF) 엔진 값 고정: 10호 유예 «기산일 + 2년»이 판정·일수에 그대로 쓰인다 · **«2년 이상 사업에 사용» 전제는 검사하지 않는다(V-7 — E3c-2가 ON 경로에서만 반전)**", () => {
  const rowOf = (id: string) => E3C_ROWS.find((r) => r.id === id)!;
  const judgeOff = (id: string) => {
    const input = buildNblEngineInput(e3cRowRaw(rowOf(id), false) as never)!;
    return judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);
  };

  it("C4b 현행: 유예 [2019-01-01, 2021-01-01) 731일 단독(유예가 ‘영업’ 없이도 그대로 인정) — 비사업용 N · 유효 731 (P-3: 3년이면 1,096)", () => {
    const j = judgeOff("C4b");
    expect([j.isNonBusinessLand, j.effectiveBusinessDays, j.gracePeriodDays]).toEqual([true, 731, 731]);
  });

  it("M11p-10ho 현행: 유예 [2021-06-01, 2023-06-01) 730일 단독 — 비사업용 N · 유효 730", () => {
    const j = judgeOff("M11p-10ho");
    expect([j.isNonBusinessLand, j.effectiveBusinessDays, j.gracePeriodDays]).toEqual([true, 730, 730]);
  });

  it("V7a 현행(전제 미검사): 영업 이력을 말할 칸이 없어 유예 487/729(2023-03-01 ~ 양도일)가 사업용 비율 66.8%로 사업용 → B — 사용 181일뿐인 폐업도 유예가 그대로 먹는다", () => {
    const j = judgeOff("V7a");
    expect([j.isNonBusinessLand, j.effectiveBusinessDays, j.gracePeriodDays, j.totalOwnershipDays]).toEqual([false, 487, 487, 729]);
  });

  it("전제 일수는 입력 어디에도 없다: 같은 유예 입력에 사용 일수를 바꿔도(= 현행에는 칸이 없어 바꿀 수 없다) 결과가 같다 — V7a·V7b는 현행에서 같은 값", () => {
    const a = judgeOff("V7a");
    const b = judgeOff("V7b");
    expect([b.isNonBusinessLand, b.effectiveBusinessDays, b.gracePeriodDays]).toEqual([a.isNonBusinessLand, a.effectiveBusinessDays, a.gracePeriodDays]);
  });

  it("유예 단독 판정의 일수 경계: 기산일 2021-06-01 유예는 2023-06-01에 끝난다 — 유예 종료 다음날부터 비사업(전 기간 3,832 중 730)", () => {
    const j = judgeOff("M11p-10ho");
    expect(j.totalOwnershipDays - j.effectiveBusinessDays).toBe(3102);
  });
});
