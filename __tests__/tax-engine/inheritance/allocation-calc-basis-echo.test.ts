/**
 * 상속세 배부·증여세액공제 계산 근거 — 엔진 echo anchor
 *
 * Plan: docs/00-pm/inheritance-allocation-calc-basis-breakdown.plan.md
 * Engine Design: docs/02-design/features/inheritance-allocation-calc-basis-breakdown.engine.design.md
 *
 * 6개 항목(*1·*2·⑥·⑦⑧⑨⑪·⑩·⑫) 계산 근거 표시값이 엔진 echo로 도달하는지 검증.
 * 신규 계산 0 — echo 노출만. ⑦ 세율·누진공제 echo 2필드(R1·D1) 포함.
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { findApplicableBracket } from "@/lib/tax-engine/inheritance-gift-common";
import {
  EXAMPLE_INPUT,
  HEIR_ID,
} from "./fixtures/comprehensive-case-pdf.fixture";

describe("배부 계산 근거 echo (종합사례)", () => {
  const r = calcInheritanceTax(EXAMPLE_INPUT);
  const a = r.heirAllocationResult!;
  const ph = a.perHeir;
  const st = r.summaryTable!;

  // ── A4-1: ⑦ 세율·누진공제 echo 2필드 (R1·D1) ──
  it("A4-1: ⑦ 적용세율 0.5 · 누진공제 460M echo", () => {
    expect(r.computedTaxAppliedRate).toBe(0.5);
    expect(r.computedTaxProgressiveDeduction).toBe(460_000_000);
    // 산식 검증: 4,175M × 0.5 − 460M = computedTax
    expect(r.taxBase * r.computedTaxAppliedRate! - r.computedTaxProgressiveDeduction!).toBe(
      r.computedTax,
    );
  });

  it("A4-1b: findApplicableBracket 순수 헬퍼 — 구간별", () => {
    expect(findApplicableBracket(0)).toEqual({ rate: 0, deduction: 0 });
    expect(findApplicableBracket(100_000_000)).toEqual({ rate: 0.1, deduction: 0 });
    expect(findApplicableBracket(4_175_000_000)).toEqual({
      rate: 0.5,
      deduction: 460_000_000,
    });
  });

  // ── A4-2: *1 / *2 / *3 합계 echo ──
  it("A4-2: *1 5,815M · *2 8,075M · *3 3,475M", () => {
    expect(st.distributableTaxBase).toBe(5_815_000_000);
    expect(st.surchargeTargetTaxableValue).toBe(8_075_000_000);
    expect(st.distributableTaxBaseAfterGifts).toBe(3_475_000_000);
    expect(a.computedTaxShareDenominator).toBe(3_475_000_000);
  });

  // ── A4-3: ⑥ 간접배부 분자·분모 + 배우자 산식 ──
  it("A4-3: ⑥㉡ 분자 1,865M · 분모 5,815M · 배우자 941,319,862", () => {
    expect(a.indirectNumerator).toBe(1_865_000_000);
    expect(a.indirectDistributionBase).toBe(5_815_000_000);
    const sp = ph[HEIR_ID.spouse];
    expect(sp.directTaxBaseShare).toBe(160_000_000);
    expect(sp.indirectTaxBaseShare).toBe(941_319_862);
    expect(sp.taxBaseShare).toBe(1_101_319_862);
  });

  // ── A4-4: ⑥ 영리법인 포함 (U6) ──
  it("A4-4: 영리법인 ⑥㉠ 700M · ㉡ 0 · ㉢ 700M (포함)", () => {
    const co = ph[HEIR_ID.corporate];
    expect(co.directTaxBaseShare).toBe(700_000_000);
    expect(co.indirectTaxBaseShare).toBe(0);
    expect(co.taxBaseShare).toBe(700_000_000);
  });

  // ── A4-5: 배부대상 산출세액 + ⑪ + *5 ──
  it("A4-5: 배부대상 1,477.5M · 배우자 ⑪ 468,259,020 · *5 0.3169", () => {
    expect(a.distributableTax).toBe(1_477_500_000);
    const sp = ph[HEIR_ID.spouse];
    expect(sp.computedTaxShare).toBe(468_259_020);
    expect(sp.burdenRatio).toBeCloseTo(0.3169, 4);
  });

  // ── A4-6: ⑩ 영리법인 증여세액공제 ──
  // GAP-1 2026-06-07: 합계열 할증 제거(법령 정합) → 영리법인 1개라 합계 == perHeir(272,874,251).
  //   구 anchor 합계 277,943,123(할증 포함)은 상증령 §3① 근거 없어 정정(사용자 결정 "법령 정합").
  it("A4-6: ⑩a 150M · ⑩b 영리법인 272,874,251 · 합계 272,874,251 · ⑩c 150M", () => {
    const co = ph[HEIR_ID.corporate];
    expect(co.priorGiftComputedTax).toBe(150_000_000);
    expect(co.priorGiftCreditLimit).toBe(272_874_251);
    expect(st.corporateExemptionLimitDisplay).toBe(272_874_251);
    expect(r.corporateExemption?.amount).toBe(150_000_000);
    // R4 역산: 영리법인 과세표준 = taxBase − computedTaxShareDenominator
    expect(r.taxBase - a.computedTaxShareDenominator).toBe(700_000_000);
  });

  // ── A4-7: ⑫ 상속인 증여세액공제 + ㉠ 증여공제 역산(R8) ──
  it("A4-7: ⑫ 배우자 ⓐ22M·ⓑ68,028,777·ⓒ22M / 증여공제 역산 600M", () => {
    const sp = ph[HEIR_ID.spouse];
    expect(sp.priorGiftComputedTax).toBe(22_000_000);
    expect(sp.priorGiftCreditLimit).toBe(68_028_777);
    expect(sp.priorGiftCredit).toBe(22_000_000);
    // R8 역산: 증여재산공제 = priorGiftAmount − directTaxBaseShare
    expect(sp.priorGiftAmount - sp.directTaxBaseShare).toBe(600_000_000);
    const son = ph[HEIR_ID.son];
    expect(son.priorGiftAmount - son.directTaxBaseShare).toBe(50_000_000);
  });

  // ── A4-8: ⑫ 조건 — 영리법인 제외 합 > 0 (R2) ──
  it("A4-8: 상속인(영리법인 제외) 사전증여 증여세 합 > 0", () => {
    const heirSum = EXAMPLE_INPUT.heirs
      .filter((h) => h.relation !== "corporate")
      .reduce((s, h) => s + (ph[h.id]?.priorGiftComputedTax ?? 0), 0);
    expect(heirSum).toBeGreaterThan(0);
  });
});
