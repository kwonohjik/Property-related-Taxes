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
import { calcPreviousYearEquivalent } from "../../lib/tax-engine/comprehensive-prior-year";
import type {
  ComprehensiveTaxInput,
  PreviousYearAutoInput,
} from "../../lib/tax-engine/types/comprehensive.types";

/** 직전연도(2021) 자동계산 입력 — 별지 5호서식 부표 */
function case12PriorAuto(): PreviousYearAutoInput {
  return {
    assessedValue: 1_400_000_000,   // '21 공시 14억
    isOneHouseOwner: true,
    birthDate: new Date("1955-03-01"),       // 2021.6.1 현재 66세 → 65세+ 30%
    acquisitionDate: new Date("2012-01-01"), // 2021.6.1 9년 5개월 → 5년+ 20%
  };
}

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

  // C12-A2b: 서식 echo — 신고서 ⑥⑦⑧·3호부표 ⑤
  it("C12-A2b: 서식 echo — 산출세액 ⑥ 1,008,000 / 고령자 ⑦ 302,400 / 장기보유 ⑧ 403,200 / 추가공제 500,000,000", () => {
    const result = calculateComprehensiveTax(case12Input());
    expect(result.taxAfterPropertyCredit).toBe(1_008_000);          // 신고서 ⑥ = ④ − ⑤
    expect(result.oneHouseDeduction?.seniorAmount).toBe(302_400);    // 신고서 ⑦ 고령자 (30/70 안분)
    expect(result.oneHouseDeduction?.longTermAmount).toBe(403_200);  // 신고서 ⑧ 장기보유 (잔액 흡수)
    expect(result.oneHouseExtraDeduction).toBe(500_000_000);         // 3호부표 ⑤ = 11억 − 6억
    expect(result.taxBeforeCap).toBe(302_400);                      // 별지5호 ⑬
  });
});

describe("사례12 직전연도 자동계산 — 별지 5호서식 부표 (C12-A3·A4)", () => {
  // C12-A3: calcPreviousYearEquivalent 단위 — 부표 ①~⑫
  it("C12-A3: 직전연도(2021) 상당액 — 재산세 2,730,000 + 종부세 513,000 = 3,243,000", () => {
    const pv = calcPreviousYearEquivalent(case12PriorAuto(), 2022);

    expect(pv.detail.basicDeduction).toBe(1_100_000_000); // 부표 ② 1주택 11억
    expect(pv.detail.fairMarketRatio).toBe(0.95);          // 부표 ③ 2021 FMR 95%
    expect(pv.detail.taxBase).toBe(285_000_000);           // 부표 ④ (14억−11억)×95%
    expect(pv.detail.calculatedTax).toBe(1_710_000);       // 부표 ⑥ 2.85억×0.6%
    expect(pv.detail.stdTaxNumerator).toBe(684_000);       // 부표 ⑧ 2.85억×60%×0.4%
    expect(pv.propertyTaxEquiv).toBe(2_730_000);           // 부표 ⑦ 14억×60%×0.4%−63만
    expect(pv.detail.creditAmount).toBe(684_000);          // 부표 ⑩
    expect(pv.detail.oneHouseDeductionRate).toBe(0.5);     // 부표 ⑪ 율 (65세 30%+5년 20%)
    expect(pv.detail.oneHouseDeductionAmount).toBe(513_000); // 부표 ⑪ 액 = (171만−68.4만)×50%
    expect(pv.comprehensiveTaxEquiv).toBe(513_000);        // 부표 ⑫
    expect(pv.total).toBe(3_243_000);                      // ⑯ 합계
  });

  // C12-A4: 자동 모드 통합 — 세부담상한 ⑭~⑲ + 직접입력 동치
  it("C12-A4: 자동 모드 통합 — 상한 4,864,500 미초과 → 결정 302,400 (직접입력과 동치)", () => {
    const auto = calculateComprehensiveTax({ ...case12Input(), previousYearAuto: case12PriorAuto() });

    expect(auto.previousYearEquivalent?.total).toBe(3_243_000); // ⑯
    expect(auto.taxCap?.capAmount).toBe(4_864_500);             // ⑱ 3,243,000×150%
    expect(auto.taxCap?.isApplied).toBe(false);                 // 미초과
    expect(auto.currentYearTotalEquivalent).toBe(2_372_400);    // ⑲ = ⓐ 2,070,000 + ⑬ 302,400
    expect(auto.determinedHousingTax).toBe(302_400);            // 결정세액

    // 직접입력 모드와 동치 (M-02)
    const direct = calculateComprehensiveTax({ ...case12Input(), previousYearTotalTax: 3_243_000 });
    expect(direct.determinedHousingTax).toBe(auto.determinedHousingTax);
  });
});
