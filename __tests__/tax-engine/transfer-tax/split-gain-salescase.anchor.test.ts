/**
 * 토지/건물 분리(§166⑥) — 매매사례가액(§176의2③1호) 취득가액 소실 anchor.
 *
 * 계획서: docs/02-design/features/land-building-split-mode-gating-and-salescase-drift.plan.md (A-1·A-2)
 *
 * 버그: `calcSplitAcquisitionPrice`에 salesCase 분기가 없어 fallthrough(`base = input.acquisitionPrice`)로
 * 떨어진다. API가 `isSalesCase → acquisitionPrice: 0`(transfer-tax-api.ts:199-201)을 보내므로 **base = 0**
 * → 취득가액이 통째로 사라진다. 비-split 경로에는 salesCase 분기가 있다(transfer-tax-helpers.ts:343
 * `similarSalesValue ?? acquisitionPrice`) → **split ↔ 비-split 드리프트**.
 *
 * 같은 함수의 usedEstimated(helpers.ts:281-284)는 "salesCase"를 이미 포함 → 저자가 이 경로를 인지했으나
 * split 분기만 빠뜨린 단순 누락.
 *
 * 안분 비율: 토지기준시가 = 10,000 × 60 = 600,000 / 전체 1,000,000 → landRatio = 0.6
 */
import { describe, it, expect } from "vitest";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const base = {
  propertyType: "housing",
  acquisitionDate: new Date("2010-03-01"),
  landAcquisitionDate: new Date("2005-06-10"),
  transferDate: new Date("2026-02-16"),
  transferPrice: 1_000_000_000,
  standardPricePerSqmAtAcquisition: 10_000,
  acquisitionArea: 60,
  standardPriceAtAcquisition: 1_000_000,
  standardPriceAtTransfer: 2_000_000,
  expenses: 0,
} as unknown as TransferTaxInput;

const run = (over: Partial<TransferTaxInput>) =>
  calcSplitGain({ ...base, ...over } as TransferTaxInput)!;

/** 매매사례가액 모드 — API가 acquisitionPrice: 0을 보내고 실제 값은 similarSalesValue에 있다 */
const salesCaseInput = {
  acquisitionMethod: "salesCase" as const,
  similarSalesValue: 400_000_000,
  acquisitionPrice: 0,
};

describe("split — 매매사례가액 취득가액 (A-1)", () => {
  it("케이스 9: 매매사례가액 4억 → 기준시가 비율 안분 2.4억 / 1.6억", () => {
    const r = run(salesCaseInput);
    expect(r.land.acquisitionPrice, "토지 = floor(4억 × 0.6)").toBe(240_000_000);
    expect(r.building.acquisitionPrice, "건물 = 4억 − 2.4억(잔액)").toBe(160_000_000);
    expect(
      r.land.acquisitionPrice + r.building.acquisitionPrice,
      "합계 = 매매사례가액 총액",
    ).toBe(400_000_000);
  });

  it("케이스 9-b: 추계액이라 landAcquisitionPrice 직접 입력을 무시한다 (§166⑥ 구분 불가)", () => {
    // 매매사례가액은 추계액 → 토지/건물 개별 실지가액이 존재할 수 없다.
    // 감정가액 분기(:55-59)와 달리 input.landAcquisitionPrice를 읽지 않아야 한다.
    const r = run({ ...salesCaseInput, landAcquisitionPrice: 350_000_000 });
    expect(r.land.acquisitionPrice, "직접 입력이 아니라 비율 안분값이어야 함").toBe(240_000_000);
  });

  it("케이스 10: 매매사례가액 → 개산공제 적용 (§163⑥, 비-split helpers.ts:339-348 정합)", () => {
    const r = run(salesCaseInput);
    // 토지 취득시 기준시가 = 600,000 → 개산공제 = floor(600,000 × 3%) = 18,000
    // 건물 취득시 기준시가 = 1,000,000 − 600,000 = 400,000 → 12,000
    expect(r.land.appraisalDeduction).toBe(18_000);
    expect(r.building.appraisalDeduction).toBe(12_000);
  });

  it("케이스 10-b: 매매사례가액 + 자본적지출 명시 → 차감 안 됨 (본문 = 개산공제 단독)", () => {
    // 추계 모드 필요경비는 개산공제 단독(비-split calcNecessaryExpense 본문과 정합).
    // 종전엔 salesCase가 실가 early-return으로 빠져 directExp가 전액 차감됐다.
    const r = run({ ...salesCaseInput, expenses: 100_000_000, landDirectExpenses: 60_000_000 });
    expect(r.land.directExpenses, "추계 모드에서 자본적지출은 차감하지 않는다").toBe(0);
  });

  it("케이스 11: 매매사례가액 → §97② swap 미발화 (환산 전용 — 회귀 방어)", () => {
    // swap 게이트는 input.useEstimatedAcquisition 단독(:148). salesCase는 false → 미발화.
    // feedback_97_2_swap_necessary_expense_max_not_sum: "환산모드 전용"
    const r = run({
      ...salesCaseInput,
      expenses: 900_000_000,
      landDirectExpenses: 540_000_000, // 개산공제+취득가보다 크지만 swap 대상 아님
    });
    expect(r.land.swapApplied ?? false, "salesCase에 swap이 붙으면 §97② 정책 위반").toBe(false);
  });

  it("케이스 13: 실거래가 → 개산공제 0 (회귀 방어)", () => {
    const r = run({ acquisitionMethod: "actual", acquisitionPrice: 400_000_000 });
    expect(r.land.appraisalDeduction).toBe(0);
    expect(r.building.appraisalDeduction).toBe(0);
  });

  it("케이스 14: 환산 + 자본적지출 명시 → swap 정상 발화 (회귀 방어)", () => {
    const r = run({
      useEstimatedAcquisition: true,
      acquisitionMethod: "estimated",
      acquisitionPrice: 0,
      expenses: 900_000_000,
      landDirectExpenses: 540_000_000,
    });
    expect(r.land.swapApplied, "환산 모드 swap은 그대로 동작해야 함").toBe(true);
  });
});
