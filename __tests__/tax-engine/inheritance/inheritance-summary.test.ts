/**
 * computeInheritanceSummary anchor — 종합사례 PDF 입력으로 4필드 일치 검증
 * + 비과세·불산입 자기일관 anchor (2026-06-10)
 */

import { describe, it, expect } from "vitest";
import {
  computeInheritanceSummary,
  type InheritanceSummaryFormInput,
} from "@/lib/stores/inheritance-summary";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import type { InheritanceTaxInput } from "@/lib/tax-engine/types/inheritance-gift.types";
import {
  EXAMPLE_INPUT,
  EXAMPLE_PRESUMED,
  EXAMPLE_DEBT_ITEMS,
  EXAMPLE_HEIRS,
  DEATH_DATE,
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

  it("exemptionItems 없음 — exemptEstimate=0, 기존 과세가액 유지", () => {
    const summary = computeInheritanceSummary(formInput, null);
    // 비과세 없으면 exemptEstimate=0, 과세가액에 영향 없음
    expect(summary.exemptEstimate).toBe(0);
    // 기존 anchor 값 그대로 (회귀 보호)
    expect(summary.taxableEstateValue).toBe(8_775_000_000);
  });
});

// ============================================================
// 비과세·불산입 자기일관 anchor — 추정 과세가액 == 엔진 taxableEstateValue
// ============================================================

describe("computeInheritanceSummary — 비과세·불산입 exemptEstimate 자기일관 anchor", () => {
  /**
   * 기본 단순 입력 — 금융재산 10억, 채무 1억, 장례 500만(한도 적용)
   * 비과세 추가 시 과세가액이 정확히 차감되는지 검증
   */
  const BASE_ESTATE_VALUE = 1_000_000_000; // 금융재산 10억
  const DEBT_VALUE = 100_000_000; // 1억
  const FUNERAL_VALUE = 5_000_000; // 500만 (최소한도 정확히 일치)

  /** 엔진 실행용 최소 InheritanceTaxInput 빌더 */
  function makeEngineInput(
    exemptions: InheritanceTaxInput["exemptions"],
  ): InheritanceTaxInput {
    return {
      ...EXAMPLE_INPUT,
      estateItems: [
        {
          id: "fin_1",
          category: "financial",
          name: "예금",
          marketValue: BASE_ESTATE_VALUE,
        },
      ],
      debtItems: [
        { id: "debt_1", category: "personal", name: "은행대출", amount: DEBT_VALUE },
        { id: "funeral_1", category: "funeral", name: "장례식비", amount: FUNERAL_VALUE, isBongan: false },
      ],
      presumedItems: [],
      preGiftsWithin10Years: [],
      exemptions,
    };
  }

  /** 사이드바 추정 입력 빌더 */
  function makeSummaryInput(
    exemptionItems: InheritanceSummaryFormInput["exemptionItems"],
  ): InheritanceSummaryFormInput {
    return {
      estateItems: [
        {
          id: "fin_1",
          category: "financial",
          name: "예금",
          marketValue: BASE_ESTATE_VALUE,
        },
      ],
      stockItems: [],
      presumedItems: [],
      debtItems: [
        { id: "debt_1", category: "personal", name: "은행대출", amount: DEBT_VALUE },
        { id: "funeral_1", category: "funeral", name: "장례식비", amount: FUNERAL_VALUE, isBongan: false },
      ],
      debts: "",
      funeralExpense: "",
      funeralIncludesBongan: false,
      priorGifts: [],
      exemptionItems,
    };
  }

  it("케이스1 — 비과세 없음: exemptEstimate=0, 과세가액 = 10억−1억−500만 = 8억9500만", () => {
    const engineInput = makeEngineInput([]);
    const engineResult = calcInheritanceTax(engineInput);
    const summaryInput = makeSummaryInput([]);
    const summary = computeInheritanceSummary(summaryInput, null);

    // 비과세 없으면 exemptEstimate=0
    expect(summary.exemptEstimate).toBe(0);
    // 과세가액 추정 = 10억 − 0 − 1억 − 500만 = 895,000,000
    expect(summary.taxableEstateValue).toBe(895_000_000);
    // 엔진 결과와 일치 (자기일관)
    expect(summary.taxableEstateValue).toBe(engineResult.taxableEstateValue);
  });

  it("케이스2 — 국가·지자체 유증 1억 (inh_state_bequest, §12 1호): 추정 과세가액 == 엔진값", () => {
    const EXEMPT_AMOUNT = 100_000_000; // 1억 유증
    const exemptions = [
      { ruleId: "inh_state_bequest", claimedAmount: EXEMPT_AMOUNT },
    ];
    const engineInput = makeEngineInput(exemptions);
    const engineResult = calcInheritanceTax(engineInput);
    const summaryInput = makeSummaryInput(exemptions);
    const summary = computeInheritanceSummary(summaryInput, null);

    // exemptEstimate = 유증 1억 전액 (한도 없음)
    expect(summary.exemptEstimate).toBe(EXEMPT_AMOUNT);
    // 과세가액 추정 = 10억 − 1억(비과세) − 1억(채무) − 500만(장례) = 795,000,000
    expect(summary.taxableEstateValue).toBe(795_000_000);
    // 엔진 결과와 일치 (자기일관 anchor)
    expect(summary.taxableEstateValue).toBe(engineResult.taxableEstateValue);
    // 결과 도착 시 result.exemptAmount 사용 확인
    const summaryWithResult = computeInheritanceSummary(summaryInput, engineResult);
    expect(summaryWithResult.exemptEstimate).toBe(engineResult.exemptAmount);
    expect(summaryWithResult.taxableEstateValue).toBe(engineResult.taxableEstateValue);
  });

  it("케이스3 — 공익법인 출연 2억 (inh_public_interest, §16): 추정 과세가액 == 엔진값", () => {
    const EXEMPT_AMOUNT = 200_000_000; // 2억 출연
    const exemptions = [
      { ruleId: "inh_public_interest", claimedAmount: EXEMPT_AMOUNT },
    ];
    const engineInput = makeEngineInput(exemptions);
    const engineResult = calcInheritanceTax(engineInput);
    const summaryInput = makeSummaryInput(exemptions);
    const summary = computeInheritanceSummary(summaryInput, null);

    // exemptEstimate = 공익법인 출연 2억 (한도 없음)
    expect(summary.exemptEstimate).toBe(EXEMPT_AMOUNT);
    // 과세가액 추정 = 10억 − 2억(불산입) − 1억(채무) − 500만(장례) = 695,000,000
    expect(summary.taxableEstateValue).toBe(695_000_000);
    // 엔진 결과와 일치 (자기일관 anchor)
    expect(summary.taxableEstateValue).toBe(engineResult.taxableEstateValue);
  });
});
