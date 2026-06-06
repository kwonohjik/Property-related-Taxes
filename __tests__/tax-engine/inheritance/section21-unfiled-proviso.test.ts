/**
 * 상속세 §21① 단서 — 무신고 시 일괄공제 5억원 고정
 *
 * 법령: 상증법 §21① 단서 (KoreanLaw mst 276123, 시행 20260102)
 *   "다만, 제67조 또는 「국세기본법」 제45조의3에 따른 신고가 없는 경우에는 5억원을 공제한다."
 *   → 완전 무신고(정기신고·기한후신고 모두 없음) 시 일괄공제 5억 고정(기초+인적이 5억 초과해도).
 *   기한후신고(§45의3)는 단서 미해당 → 본문 max 적용.
 *   §21②(배우자 단독상속)는 §21① 전체 특칙 → 단서보다 우선(일괄공제 배제).
 *
 * 설계: docs/02-design/features/inheritance-section21-unfiled-proviso.engine.design.md
 * 계획: docs/00-pm/inheritance-numeric-gaps.plan.md §1
 *
 * ★ Pre-Do anchor (2026-06-07): 엔진 분기 미구현 상태 — SEC21P-1·4·5는 "실패 확보"가 목적.
 *   ([[feedback_pre_anchor_verification]] — "현행 일치 예상" 가정 금지, 실패 메시지로 디자인 확정)
 *   SEC21P-2는 단서 미해당이라 현행과 일치(회귀 anchor).
 */
import { describe, it, expect } from "vitest";
import { calcInheritanceDeductions } from "@/lib/tax-engine/deductions/inheritance-deductions";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import type { Heir } from "@/lib/tax-engine/types/inheritance-gift.types";
import { EXAMPLE_INPUT } from "./fixtures/comprehensive-case-pdf.fixture";

describe("SEC21P §21① 단서 무신고 일괄공제 5억 고정", () => {
  const HUGE = 10_000_000_000; // §24 종합한도 회피용 큰 과세가액
  const spouse: Heir = { id: "sp", relation: "spouse", name: "배우자" };
  const child = (n: number): Heir => ({
    id: `c${n}`,
    relation: "child",
    name: `자녀${n}`,
  });
  // 자녀 7명 = 기초 2억 + 인적(7×5천만=3.5억) = 5.5억 > 5억 (CI-LS2와 동일 구성)
  const sevenChildren: Heir[] = [1, 2, 3, 4, 5, 6, 7].map(child);

  it("SEC21P-1 무신고 + 기초2억+인적3.5억(5.5억) → 일괄 5억 고정 (단서)", () => {
    const r = calcInheritanceDeductions(
      { heirs: sevenChildren, deathDate: "2024-06-10", isUnfiled: true },
      HUGE,
      0,
    );
    // 기대(법령 정합): 무신고 단서로 일괄 5억 강제
    expect(r.chosenMethod).toBe("lump_sum");
    expect(r.lumpSumDeduction).toBe(500_000_000);
    expect(r.lumpSumForcedByUnfiled).toBe(true);
  });

  it("SEC21P-2 기한후신고(isUnfiled=false) + 동일 5.5억 → 본문 max 5.5억 (단서 미해당)", () => {
    const r = calcInheritanceDeductions(
      { heirs: sevenChildren, deathDate: "2024-06-10", isUnfiled: false },
      HUGE,
      0,
    );
    // 기대: 단서 미해당 → 본문 max → 항목별 5.5억 (현행과 일치, 회귀)
    expect(r.chosenMethod).toBe("itemized");
    expect(r.basicDeduction).toBe(200_000_000);
    expect(r.personalDeductionTotal).toBe(350_000_000);
    expect(r.lumpSumForcedByUnfiled ?? false).toBe(false);
  });

  it("SEC21P-4 무신고 + 합계 2.5억(≤5억) → 일괄 5억 (금액 무영향, forcedByUnfiled=true)", () => {
    const r = calcInheritanceDeductions(
      { heirs: [spouse, child(1)], deathDate: "2024-06-10", isUnfiled: true },
      HUGE,
      0,
    );
    // 본문·단서 모두 5억(자기상쇄) — 단, 무신고 분기는 탔으므로 플래그 true
    expect(r.chosenMethod).toBe("lump_sum");
    expect(r.lumpSumDeduction).toBe(500_000_000);
    expect(r.lumpSumForcedByUnfiled).toBe(true);
  });

  it("SEC21P-5 무신고 ∩ §21② 배우자 단독상속(기초+인적 큰 경우) → §21② 우선, 일괄·단서 모두 배제", () => {
    const r = calcInheritanceDeductions(
      { heirs: [spouse], deathDate: "2024-06-10", isUnfiled: true },
      HUGE,
      0,
    );
    // §21② 우선: 배우자 단독상속 → itemized(기초+인적만), 무신고 단서 무관
    expect(r.chosenMethod).toBe("itemized");
    expect(r.lumpSumExcludedBySpouseSoleHeir).toBe(true);
    expect(r.lumpSumForcedByUnfiled ?? false).toBe(false);
  });

  // ── 통합 레벨 (calcInheritanceTax) — §69 신고세액공제 상호작용 ──
  describe("SEC21P-3 통합 — 무신고 시 §69 신고세액공제 미적용", () => {
    it("무신고(creditInput.isFiledOnTime=false) finalTax > 정기신고 finalTax (§69 3% 차이)", () => {
      const onTime = calcInheritanceTax(EXAMPLE_INPUT);
      const unfiled = calcInheritanceTax({
        ...EXAMPLE_INPUT,
        deductionInput: { ...EXAMPLE_INPUT.deductionInput, isUnfiled: true },
        creditInput: { ...EXAMPLE_INPUT.creditInput, isFiledOnTime: false },
      });
      // 무신고: §69 신고세액공제(3%) 미적용 → 결정세액이 정기신고보다 큼
      expect(unfiled.finalTax).toBeGreaterThan(onTime.finalTax);
    });
  });
});
