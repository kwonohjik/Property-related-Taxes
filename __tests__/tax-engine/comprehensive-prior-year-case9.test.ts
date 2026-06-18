/**
 * 종합부동산세 사례9 (3주택, 2022 귀속) — 직전연도('21) 총세액상당액 anchor
 *
 * 출처: 교재 제8장 종합부동산세 세액계산 사례9 (177~179쪽).
 * 직전연도 공시: 서울 서초 15억(감면 30%) + 강남 8억(0%) + 안양 4억(0%) — 주택별 감면율 상이.
 *
 * 정답(PDF 179쪽):
 *   나. 직전연도 총세액상당액 = 35,630,694
 *   ① 재산세상당액 = 3,789,000 (서초 2,079,000 + 강남 1,290,000 + 안양 420,000)
 *   ② 종부세상당액 = 31,841,694 (ⓐ 34,830,000 − ⓑ 2,988,306)
 *   ⓐ 과표 15.675억, 중과 3.6% → 34,830,000
 *   ⓑ 공제할 재산세 = 2,988,306
 *
 * Pre-Do: 현재 엔진은 reductionRate를 단일(서초 30%)로 합산 전체에 적용 → 18.9억(정답 22.5억).
 *   이 anchor는 처음에 실패(현재 23,327,187)하며, 주택별 감면 수정 후 통과한다.
 */
import { describe, it, expect } from "vitest";
import { calculateComprehensiveTax } from "../../lib/tax-engine/comprehensive-tax";
import type { ComprehensiveTaxInput } from "../../lib/tax-engine/types/comprehensive.types";

describe("PY-Case9: 직전연도 주택별 감면 — 나 35,630,694", () => {
  const input: ComprehensiveTaxInput = {
    assessmentYear: 2022,
    isOneHouseOwner: false,
    properties: [
      { propertyId: "p1", assessedValue: 2_000_000_000, exclusionType: "none" },
      { propertyId: "p2", assessedValue: 1_000_000_000, exclusionType: "none" },
      { propertyId: "p3", assessedValue: 500_000_000, exclusionType: "none" },
    ],
    previousYearAuto: {
      assessedValue: 2_700_000_000,
      priorHouseValues: [1_500_000_000, 800_000_000, 400_000_000],
      // 주택별 감면율 — 서초 30%, 강남 0%, 안양 0% (인덱스 정합)
      priorHouseReductionRates: [0.3, 0, 0],
      isOneHouseOwner: false,
      taxableHouseCount: 3,
    },
  };

  it("① 재산세상당액 = 3,789,000 (서초만 30% 감면 — 주택별)", () => {
    const r = calculateComprehensiveTax(input);
    expect(r.previousYearEquivalent?.propertyTaxEquiv).toBe(3_789_000);
  });

  it("① 주택별 내역 echo — 서초 2,079,000 / 강남 1,290,000 / 안양 420,000", () => {
    const r = calculateComprehensiveTax(input);
    const bd = r.previousYearEquivalent?.detail.propertyTaxBreakdown;
    expect(bd).toHaveLength(3);
    // 서초: 15억 → 과표 9억 → 표준 2,970,000 → 감면 30% → 2,079,000
    expect(bd?.[0]).toMatchObject({
      assessedValue: 1_500_000_000,
      taxBase: 900_000_000,
      standardTax: 2_970_000,
      reductionRate: 0.3,
      reducedTax: 2_079_000,
    });
    // 강남: 8억 → 과표 4.8억 → 1,290,000 (감면 0)
    expect(bd?.[1]).toMatchObject({ standardTax: 1_290_000, reducedTax: 1_290_000 });
    // 안양: 4억 → 과표 2.4억(6억 이하 0.25%) → 420,000
    expect(bd?.[2]).toMatchObject({ taxBase: 240_000_000, standardTax: 420_000, reducedTax: 420_000 });
    // 합계 = propertyTaxEquiv
    const sum = (bd ?? []).reduce((a, h) => a + h.reducedTax, 0);
    expect(sum).toBe(3_789_000);
  });

  it("ⓐ 재산세공제전 종부세 = 34,830,000 · 과표 15.675억 · 중과 3.6%", () => {
    const r = calculateComprehensiveTax(input);
    expect(r.previousYearEquivalent?.detail.taxBase).toBe(1_567_500_000);
    expect(r.previousYearEquivalent?.detail.appliedRate).toBe(0.036);
    expect(r.previousYearEquivalent?.detail.calculatedTax).toBe(34_830_000);
  });

  it("ⓐⓑ 라벨용 감면후 공시 합(effectiveAssessedValue) = 22.5억", () => {
    const r = calculateComprehensiveTax(input);
    // 서초 15억×0.7=10.5억 + 강남 8억 + 안양 4억 = 22.5억 (원공시 27억 아님)
    expect(r.previousYearEquivalent?.detail.effectiveAssessedValue).toBe(2_250_000_000);
  });

  it("ⓑ 공제할 재산세액 = 2,988,306", () => {
    const r = calculateComprehensiveTax(input);
    expect(r.previousYearEquivalent?.detail.creditAmount).toBe(2_988_306);
  });

  it("② 종부세상당액 = 31,841,694 · 나 총세액상당액 = 35,630,694", () => {
    const r = calculateComprehensiveTax(input);
    expect(r.previousYearEquivalent?.comprehensiveTaxEquiv).toBe(31_841_694);
    expect(r.previousYearEquivalent?.total).toBe(35_630_694);
  });
});
