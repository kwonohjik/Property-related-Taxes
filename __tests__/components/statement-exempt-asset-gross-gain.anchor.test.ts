/**
 * anchor: 상세명세서의 **자산별 양도차익**이 비과세 자산을 0으로 찍지 않는다 — UI 리뷰 高.
 *
 * 전액 비과세 자산은 엔진 `transferGain`이 **0**이다(과세 대상이 없다). 그래서
 * `exempt-gross-gain.ts`가 gross echo(`exemptGrossGain`)를 쓰는 leaf를 두고 있는데,
 * 상세명세서의 **자산별 picker와 산식만** 원시 `p.transferGain`으로 남아 있었다.
 *
 * 실측(2026-09-06) — 양도 10억 · 취득 4억 · 필요경비 1천만 · 전액 비과세:
 *   자산별 행   : 0            (합계 행은 5.9억 → 「합계 ≠ 자산별 합」)
 *   양도차익 산식: `1,000,000,000 - 400,000,000 - 10,000,000 = 0`   ← 거짓 등식
 *   과세대상 산식: `차손 자산 — 양도차익 0 (음수)`                    ← 비과세를 차손이라 단정
 *
 * 같은 화면 신고서 양식(`FilingFormTableAggregateHelpers.ts:185`)은 이미 `effectiveGrossGain`을
 * 쓰고 있어 두 표가 같은 자산을 다르게 표시했다 — 이 저장소가 #011·#012·#020·#084·#094·#102에서
 * 반복해 고쳐온 결함이다.
 */
import { describe, it, expect } from "vitest";
import {
  buildSubGainFormula,
  buildTaxableGainFormula,
} from "@/components/calc/results/transfer/DetailedStatementFormulaBuilders";
import { effectiveGrossGain } from "@/components/calc/results/transfer/exempt-gross-gain";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";

/** 전액 비과세 자산 — 엔진이 `transferGain: 0` + `exemptGrossGain` echo를 싣는 형태. */
const exemptAsset = {
  isExempt: true,
  exemptGrossGain: 590_000_000,
  transferGain: 0,
  transferPrice: 1_000_000_000,
  acquisitionPrice: 400_000_000,
  capitalExpenditureForDisplay: 0,
  necessaryExpense: 10_000_000,
  income: 0,
  longTermHoldingDeduction: 0,
} as unknown as PerPropertyBreakdown;

/** 과세 자산 — 회귀 가드(값이 달라지면 안 된다). */
const taxableAsset = {
  isExempt: false,
  transferGain: 300_000_000,
  transferPrice: 1_000_000_000,
  acquisitionPrice: 690_000_000,
  capitalExpenditureForDisplay: 0,
  necessaryExpense: 10_000_000,
  income: 200_000_000,
  longTermHoldingDeduction: 100_000_000,
} as unknown as PerPropertyBreakdown;

describe("상세명세서 — 비과세 자산 양도차익", () => {
  it("🔑 S-1: 자산별 값은 gross echo다 (0이 아니다)", () => {
    expect(effectiveGrossGain(exemptAsset)).toBe(590_000_000);
  });

  it("🔑 S-2: 양도차익 산식의 좌변과 우변이 맞는다 (거짓 등식 금지)", () => {
    const f = buildSubGainFormula(exemptAsset);
    expect(f).toContain("590,000,000");
    expect(f).not.toMatch(/= 0$/);
    // 좌변 − 좌변 = 우변이 실제로 성립한다.
    expect(1_000_000_000 - 400_000_000 - 10_000_000).toBe(590_000_000);
  });

  it("🔑 S-3: 비과세 자산을 「차손」이라 부르지 않는다", () => {
    const f = buildTaxableGainFormula(exemptAsset);
    expect(f).not.toContain("차손");
    // 과세대상은 0이 맞다 — 사유가 「비과세」이지 「차손」이 아닐 뿐이다.
    expect(f).toMatch(/= 0$/);
  });

  it("S-4: 과세 자산은 종전과 같다 (회귀 가드)", () => {
    expect(effectiveGrossGain(taxableAsset)).toBe(300_000_000);
    expect(buildSubGainFormula(taxableAsset)).toContain("300,000,000");
    expect(buildTaxableGainFormula(taxableAsset)).toContain("300,000,000");
  });

  it("S-5: 진짜 차손 자산은 여전히 「차손」으로 표시한다 (문구를 지운 게 아니다)", () => {
    const loss = { ...taxableAsset, transferGain: -50_000_000 } as PerPropertyBreakdown;
    expect(buildTaxableGainFormula(loss)).toContain("차손");
  });
});
