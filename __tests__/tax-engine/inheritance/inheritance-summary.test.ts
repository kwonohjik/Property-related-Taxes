/**
 * computeInheritanceSummary anchor — 종합사례 PDF 입력으로 4필드 일치 검증
 */

import { describe, it, expect } from "vitest";
import {
  computeInheritanceSummary,
  type InheritanceSummaryFormInput,
} from "@/lib/stores/inheritance-summary";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import {
  EXAMPLE_INPUT,
  EXAMPLE_PRESUMED,
  EXAMPLE_DEBT_ITEMS,
} from "./fixtures/comprehensive-case-pdf.fixture";

describe("computeInheritanceSummary — 종합사례 PDF 4필드", () => {
  // PDF anchor: 총상속 6,680M + 추정 350M = 7,030M, 과세가액 8,775M
  const formInput: InheritanceSummaryFormInput = {
    estateItems: EXAMPLE_INPUT.estateItems.filter(
      (it) =>
        !it.id.startsWith("estate_listed_") &&
        !it.id.startsWith("estate_unlisted_"),
    ),
    stockItems: EXAMPLE_INPUT.estateItems.filter(
      (it) =>
        it.id.startsWith("estate_listed_") ||
        it.id.startsWith("estate_unlisted_"),
    ),
    presumedItems: EXAMPLE_PRESUMED,
    debtItems: EXAMPLE_DEBT_ITEMS,
    debts: "",
    funeralExpense: "",
    funeralIncludesBongan: false,
    priorGifts: EXAMPLE_INPUT.preGiftsWithin10Years,
  };

  it("결과 미도착 시 입력값으로 총상속·과세가액 추정", () => {
    const summary = computeInheritanceSummary(formInput, null);
    expect(summary.totalEstate).toBe(7_030_000_000); // 본래+간주 6,680M + 추정 350M
    expect(summary.presumedAdded).toBe(350_000_000);
    expect(summary.totalDebts).toBe(1_200_000_000); // K은행 + S 745 + 종소세 55
    expect(summary.funeralApplied).toBe(15_000_000); // 식대 10M + 봉안 5M
    expect(summary.priorGiftTotal).toBe(2_960_000_000);
    // 과세가액 추정 = 7,030 − 1,200 − 15 + 2,960 = 8,775M
    expect(summary.taxableEstateValue).toBe(8_775_000_000);
    // 결과 미도착이면 taxBase·estimatedTax null
    expect(summary.taxBase).toBeNull();
    expect(summary.estimatedTax).toBeNull();
  });

  it("결과 도착 시 엔진값 사용 — taxBase·estimatedTax 채워짐", () => {
    const result = calcInheritanceTax(EXAMPLE_INPUT);
    const summary = computeInheritanceSummary(formInput, result);
    // 엔진 결과 값 사용
    expect(summary.taxableEstateValue).toBe(result.taxableEstateValue);
    expect(summary.taxBase).toBe(4_175_000_000);
    // heirAllocationResult가 있으면 4명 finalTax 합 = 1,033,760,232 (±1원 PDF 오기 toleranc)
    expect(Math.abs(summary.estimatedTax! - 1_033_760_232)).toBeLessThanOrEqual(1);
  });

  it("빈 폼 — 모두 0/null", () => {
    const summary = computeInheritanceSummary(
      {
        estateItems: [],
        stockItems: [],
        presumedItems: [],
        debtItems: [],
        debts: "",
        funeralExpense: "",
        funeralIncludesBongan: false,
        priorGifts: [],
      },
      null,
    );
    expect(summary.totalEstate).toBe(0);
    expect(summary.taxableEstateValue).toBe(0);
    expect(summary.taxBase).toBeNull();
    expect(summary.estimatedTax).toBeNull();
  });

  it("legacy 모드 — debts·funeralExpense 사용 (debtItems 없음)", () => {
    const summary = computeInheritanceSummary(
      {
        estateItems: [{ id: "x1", category: "financial", name: "예금", marketValue: 1_000_000_000 }],
        stockItems: [],
        presumedItems: [],
        debtItems: [],
        debts: "200000000", // 2억
        funeralExpense: "20000000", // 2천만 (한도 1천만 → 10M)
        funeralIncludesBongan: false,
        priorGifts: [],
      },
      null,
    );
    expect(summary.totalEstate).toBe(1_000_000_000);
    expect(summary.totalDebts).toBe(200_000_000);
    expect(summary.funeralApplied).toBe(10_000_000);
    expect(summary.taxableEstateValue).toBe(790_000_000); // 1,000 − 200 − 10
  });
});
