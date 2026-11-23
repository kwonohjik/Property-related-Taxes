/**
 * NBL-STATE-HISTORY-E3-② (E3c-0, 테스트만) — **수입금액비율 «정확 경계» 안전망 신설**.
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-2-business-period.engine.plan.md §3.6(연산 정밀도) · §7.1 P-6
 * 사실: 계획 단계 mutation P-6(`computeRevenueTest`의 `pass: >=` → `>`)이 **1건**만 실패했고 그것도 공통수입 안분 테스트가 우연히 잡았다 —
 *       «임계 비율 정확히 3.00%에서 통과»를 지키는 테스트가 사실상 없었다. E3c-1의 연도 판정은 이 함수를 연도마다 재사용하므로 경계 계약을 먼저 고정한다.
 *
 * 비교는 현행 계약대로 부동소수 `>=`다(정수 분수 비교로 바꾸지 않는다 — 현행 유지). 아래 쌍은 전부 정수 나눗셈이 정확히 임계 소수와 같은 double이 되는 값이다.
 * 전부 지금 코드로 green이어야 한다(제품 코드 변경 0).
 */
import { describe, it, expect } from "vitest";
import { computeRevenueTest } from "@/lib/tax-engine/non-business-land/revenue-test";
import { getNblRevenueThreshold, type NblRevenueBusinessType } from "@/lib/tax-engine/legal-codes";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import { E3C_ROWS, E3C_THRESHOLD_PAIRS, e3cRowRaw } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-2-table";

const LV = 100_000_000;
const test = (businessType: NblRevenueBusinessType, currentRevenue: number, extra: Partial<Parameters<typeof computeRevenueTest>[0]> = {}) =>
  computeRevenueTest({ businessType, currentRevenue, currentLandValue: LV, ...extra });

describe("E3c-0 — 업종별 임계 정확 경계: 토지가액 1억 · 수입 = 임계 × 1억 → 통과 / 1원 모자라면 불통과 (P-6 `>=` → `>`이면 8행 전부 실패)", () => {
  it.each([
    ["parking_operation", 3_000_000, 0.03],
    ["mineral_spring", 4_000_000, 0.04],
    ["fish_farm_other", 4_000_000, 0.04],
    ["block_stone_pipe_mfg", 20_000_000, 0.2],
    ["landscaping_floriculture", 7_000_000, 0.07],
    ["vehicle_repair_academy", 10_000_000, 0.1],
    ["agriculture_academy", 7_000_000, 0.07],
    ["wholesale_retail", 10_000_000, 0.1],
  ] as const)("%s — 기준 %s", (type, revenue, threshold) => {
    expect(getNblRevenueThreshold(type)).toBe(threshold);
    const on = test(type, revenue);
    expect([on.ratioCurrent, on.actualRatio, on.pass]).toEqual([threshold, threshold, true]);
    const below = test(type, revenue - 1);
    expect([below.pass, below.actualRatio < threshold]).toEqual([false, true]);
  });

  it("비율②(당해 + 직전) 정확 경계: (2,000,000 + 4,000,000) ÷ (1억 + 1억) = 3.00% → ①은 2%라 ②만이 통과를 만든다 · 직전 1원 적으면 불통과", () => {
    const pass = test("parking_operation", 2_000_000, { priorRevenue: 4_000_000, priorLandValue: LV });
    expect([pass.ratioCurrent, pass.ratioCombined, pass.actualRatio, pass.pass]).toEqual([0.02, 0.03, 0.03, true]);
    const fail = test("parking_operation", 2_000_000, { priorRevenue: 3_999_999, priorLandValue: LV });
    expect([fail.ratioCombined! < 0.03, fail.pass]).toEqual([true, false]);
  });

  it("큰 것 선택: ①이 정확히 경계이고 ②가 더 작아도 통과 — max(①,②)", () => {
    const r = test("parking_operation", 3_000_000, { priorRevenue: 0, priorLandValue: LV });
    expect([r.ratioCurrent, r.ratioCombined, r.actualRatio, r.pass]).toEqual([0.03, 0.015, 0.03, true]);
  });

  it("연환산(§168의11③3호) 후 정확 경계: 영위 306일(365일 연도) · 수입 2,515,069 → floor(×365/306) = 3,000,000 통과 / 2,515,068 → 2,999,999 불통과", () => {
    const pass = test("parking_operation", 2_515_069, { currentBusinessDays: 306, currentTaxYear: 2023 });
    expect([pass.annualizedCurrentRevenue, pass.annualizationApplied, pass.pass]).toEqual([3_000_000, true, true]);
    const fail = test("parking_operation", 2_515_068, { currentBusinessDays: 306, currentTaxYear: 2023 });
    expect([fail.annualizedCurrentRevenue, fail.pass]).toEqual([2_999_999, false]);
  });

  it("윤년(366일) 연환산 경계: 영위 122일 · 수입 1,000,000 → ×366/122 = 3,000,000 통과 / 999,999 → 2,999,997 불통과 — 365로 고정하면 1,000,000이 2,991,803으로 모자란다", () => {
    const pass = test("parking_operation", 1_000_000, { currentBusinessDays: 122, currentTaxYear: 2024 });
    expect([pass.annualizedCurrentRevenue, pass.pass]).toEqual([3_000_000, true]);
    const fail = test("parking_operation", 999_999, { currentBusinessDays: 122, currentTaxYear: 2024 });
    expect([fail.annualizedCurrentRevenue, fail.pass]).toEqual([2_999_997, false]);
    expect(Math.floor((1_000_000 * 365) / 122)).toBe(2_991_803); // 총일수 365 고정 변이의 값 — 불통과가 된다
  });

  it("영위일수 = 해당 연도 총일수면 환산하지 않는다(경계 ≥) · 총일수보다 1일 적으면 환산한다", () => {
    expect(test("parking_operation", 3_000_000, { currentBusinessDays: 365, currentTaxYear: 2023 }).annualizationApplied).toBe(false);
    expect(test("parking_operation", 3_000_000, { currentBusinessDays: 366, currentTaxYear: 2024 }).annualizationApplied).toBe(false);
    expect(test("parking_operation", 3_000_000, { currentBusinessDays: 364, currentTaxYear: 2023 }).annualizationApplied).toBe(true);
    expect(test("parking_operation", 3_000_000, { currentBusinessDays: 365, currentTaxYear: 2024 }).annualizationApplied).toBe(true); // 윤년 366일에 365일은 환산 대상
  });
});

describe("E3c-0 — 판정 수준의 경계쌍(엔진 raw → 판정): 현행 = 기대 — 새 모델이 같은 `computeRevenueTest`를 쓰므로 단일 과세기간 판정은 변하지 않아야 한다(회귀 가드)", () => {
  const judgeOff = (id: string) => {
    const row = E3C_ROWS.find((r) => r.id === id)!;
    return judgeNonBusinessLand(buildNblEngineInput(e3cRowRaw(row, false) as never)!, DEFAULT_NON_BUSINESS_LAND_RULES);
  };

  it.each(E3C_THRESHOLD_PAIRS.filter(([a]) => a !== "V7c").map(([pass, fail, what]) => [pass, fail, what] as const))("%s ↔ %s — %s", (passId, failId) => {
    const p = judgeOff(passId);
    const f = judgeOff(failId);
    expect([p.isNonBusinessLand, f.isNonBusinessLand]).toEqual([false, true]);
    expect(p.revenueTestDetail?.pass).toBe(true);
    expect(f.revenueTestDetail?.pass).toBe(false);
    expect(p.revenueTestDetail!.actualRatio).toBeGreaterThanOrEqual(0.03);
    expect(f.revenueTestDetail!.actualRatio).toBeLessThan(0.03);
  });
});
