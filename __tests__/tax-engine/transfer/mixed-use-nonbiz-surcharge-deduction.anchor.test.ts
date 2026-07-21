/**
 * anchor: 겸용주택 비사업용토지 +10%p 중과 base = 과세표준 귀속분 (#2 ① — 기본공제 전액 nonBiz 귀속)
 *
 * 계획: docs/02-design/features/transfer-audit-residual-3items.plan.md §#2
 *
 * 버그(수정 전): buildTotalTax가 +10%p를 nonBizIncome(양도소득금액, 기본공제 前 raw)에 적용 →
 *   기본공제(250만)가 nonBiz 부분에 반영되지 않아 최대 25만원 과다(단건 엔진 transfer-tax-rate-calc.ts:307-311는
 *   과세표준 taxBase 기준).
 *
 * 정본(사용자 지시): 양도소득기본공제는 세율이 높은 부분(비사업용 +10%p)에 전액 귀속(납세자 유리 원칙).
 *   → 중과 base = max(0, nonBizIncome − 적용된 기본공제). 적용 기본공제 = aggregateIncome − taxBase.
 *   §104①8호 중과는 과세표준(=양도소득금액−기본공제)에 적용.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { buildTotalTax } from "@/lib/tax-engine/transfer-tax-mixed-use-totals";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { makeMockRates } from "../_helpers/mock-rates";

afterEach(cleanup);

const { brackets, basicDeductionRules } = parseRatesFromMap(makeMockRates());
const LIMIT = basicDeductionRules.annualLimit; // 2,500,000
const T = (h: number, c: number, n: number) => buildTotalTax(h, c, n, brackets, LIMIT);

describe("겸용 nonBiz +10%p 중과 base = 기본공제 후 (전액 nonBiz 귀속)", () => {
  it("nonBiz 단독 1억: 중과 = (1억 − 250만) × 10% = 9,750,000 (현행 1,000만서 정정)", () => {
    const r = T(0, 0, 100_000_000);
    expect(r.nonBusinessSurcharge).toBe(9_750_000);
    // taxBase도 aggregate − 250만
    expect(r.taxBase).toBe(97_500_000);
  });

  it("혼합(주택 5천만 + nonBiz 1억): 기본공제 전액 nonBiz → 중과 = 9,750,000", () => {
    const r = T(50_000_000, 0, 100_000_000);
    expect(r.nonBusinessSurcharge).toBe(9_750_000);
  });

  it("경계: nonBiz(200만) < 기본공제(250만) → 중과 base 0 (nonBiz 전액 흡수)", () => {
    const r = T(100_000_000, 0, 2_000_000);
    expect(r.nonBusinessSurcharge).toBe(0);
  });

  it("회귀: nonBiz 0 → 중과 0", () => {
    const r = T(80_000_000, 20_000_000, 0);
    expect(r.nonBusinessSurcharge).toBe(0);
  });
});
