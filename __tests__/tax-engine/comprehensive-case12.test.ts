/**
 * 종합부동산세 사례12 — Pre-Do anchor (C12-A1·A2)
 *
 * 출처: 국세청 「2022 귀속 종합부동산세 계산 사례」 사례12 (책 p.186~187, 원단위 toBe 고정)
 *   1세대1주택, 공시 15억('22)·14억('21), 67세(2022.6.1), '12.1.1 취득 (보유 10년+)
 *
 * ⚠️ Pre-Do 상태: G-1(재산세 안분 FMR 2022 1주택 45% — 지방세법 시행령 §109①2호 단서,
 *   제32747호) 미구현으로 C12-A1·A2는 **실패가 정상** (현행 60% 고정 — comprehensive-tax.ts:320).
 *   커밋 1(G-1·G-2 수정)에서 통과 전환 예정. 실패 실측값은 설계 §3 영향 주장의 근거.
 *
 * 설계: docs/02-design/features/comprehensive-case12-replica.engine.design.md
 */

import { describe, it, expect } from "vitest";
import { calculateComprehensiveTax } from "../../lib/tax-engine/comprehensive-tax";
import type { ComprehensiveTaxInput } from "../../lib/tax-engine/types/comprehensive.types";

/** 사례12 해당연도(2022) 입력 — M-01 (직전연도 자동계산 모드는 G-4 구현 후 추가) */
function case12Input(): ComprehensiveTaxInput {
  return {
    assessmentYear: 2022,
    isOneHouseOwner: true,
    birthDate: new Date("1955-03-01"),       // 2022.6.1 현재 67세 → 고령자 30%
    acquisitionDate: new Date("2012-01-01"), // 보유 10년 4개월 → 장기보유 40%
    properties: [
      { propertyId: "p1", assessedValue: 1_500_000_000, exclusionType: "none" },
    ],
  };
}

// Pre-Do 실측 (2026-06-12, 수정 전 현행 엔진): ⓐ/ⓒ 2,970,000 · ⓑ/ⓓ 576,000 · 세액공제 604,800
//   · 결정 259,200 · 농특세 51,840 — 설계 §3 예측과 전 항목 일치.
// 커밋 1(G-1·G-2·G-3 재산세 FMR 45%)로 통과 전환됨.
describe("사례12 anchor — 재산세 안분 FMR 45% (C12-A1·A2)", () => {
  // C12-A1: 안분 단위 — 별지 3호 부표 ⑨(ⓑ)·⑩(ⓒ)·⑪(ⓓ)
  it("C12-A1: 2022 1주택 안분 — ⓑ 432,000 / ⓒ 2,070,000 / ⓓ 432,000 (재산세 FMR 45%)", () => {
    const result = calculateComprehensiveTax(case12Input());

    // ⓑ 종부세 과표분 표준세율재산세액 = 2.4억 × 45% × 0.4% (p.186 ②ⓑ)
    expect(result.propertyTaxCredit.comprehensiveTaxBase).toBe(432_000);
    // ⓒ 총표준세율재산세액 = 15억 × 45% → 6.75억 표준세율 누진 = 2,070,000 (p.186 ②ⓒ)
    expect(result.propertyTaxCredit.propertyTaxBase).toBe(2_070_000);
    // ⓓ 공제할 재산세액 = ⓐ × ⓑ/ⓒ = 432,000 (p.186 ②ⓓ, 별지 3호 부표 ⑪)
    expect(result.propertyTaxCredit.creditAmount).toBe(432_000);
  });

  // C12-A2: 통합 — 신고서 ④⑤⑦⑧⑩·농특세 ㉓
  it("C12-A2: 사례12 통합 — 산출 1,440,000 → 결정 302,400 + 농특세 60,480", () => {
    const result = calculateComprehensiveTax(case12Input());

    expect(result.basicDeduction).toBe(1_100_000_000);  // 2022 1세대1주택 11억
    expect(result.taxBase).toBe(240_000_000);           // (15억 − 11억) × 60%
    expect(result.calculatedTax).toBe(1_440_000);       // 신고서 ④ (재산세 공제 전)
    expect(result.propertyTaxCredit.creditAmount).toBe(432_000);          // 신고서 ⑤
    expect(result.oneHouseDeduction?.combinedRate).toBe(0.7);             // 30% + 40%
    expect(result.oneHouseDeduction?.deductionAmount).toBe(705_600);      // p.187 ③
    expect(result.determinedHousingTax).toBe(302_400);  // 신고서 ⑩ 결정세액
    expect(result.housingRuralSpecialTax).toBe(60_480); // 농특세 ㉓ = 302,400 × 20%
  });
});
