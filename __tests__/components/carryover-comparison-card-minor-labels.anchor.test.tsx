/**
 * anchor — 이월과세 비교 카드 표기(결과뷰 리뷰 R-c04-06·07·08). 표시 전용 — 세액·채택은 바뀌지 않는다.
 *
 * · R-c04-06 B 채택 요약 「채택 시나리오: B (비교과세 미적용)」이 같은 카드의 「§97조의2 ② 3호 비교과세 — 시나리오 B 채택」과 모순 → 「이월과세 미적용」
 *   (B 카드 제목 「[B] 이월과세 미적용」과 같다). 일반건물 부담부증여 카드도 같다.
 * · R-c04-07 증여자 자본적지출 가드 안내 「2024.1.1. 이전 양도 — 가드 발동, 0 처리」 → 명세서와 같은 「전」 · 내부 용어 제거.
 * · R-c04-08 신고 전체 결정세액 비교 박스 금액 — font-mono tabular-nums whitespace-nowrap.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { CarryoverComparisonCard } from "@/components/calc/results/transfer/CarryoverComparisonCard";
import { GbBurdenedGiftCarryoverCard } from "@/components/calc/results/transfer/GbBurdenedGiftCarryoverCard";

afterEach(cleanup);

const norm = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ");

const scenarioA = {
  acquisitionPrice: 100_000_000, holdingPeriodYears: 14, giftTaxAddedToExpense: 0, giftTaxLimitApplied: false, giftTaxLimitCap: 0,
  donorCapexAddedToExpense: 0, donorCapexGuardApplied: false, effectiveCapex: 0, transferGain: 300_000_000, determinedTax: 10_000_000,
};
const scenarioB = { acquisitionPrice: 300_000_000, holdingPeriodYears: 2, transferGain: 100_000_000, determinedTax: 20_000_000 };
const detailB = {
  isEligible: false, applicablePeriodYears: 10, adoptedScenario: "B", comparisonExclusion: true, exclusionReason: "tax_comparison", scenarioA, scenarioB,
};

describe("R-c04-06 B 채택 요약 문구", () => {
  it("단건 카드 — 「이월과세 미적용」 · 비교과세 문구와 모순 없음", () => {
    const t = norm(render(<CarryoverComparisonCard detail={detailB as never} />).container);
    expect(t).toContain("채택 시나리오: B (이월과세 미적용)");
    expect(t).not.toContain("비교과세 미적용");
    expect(t).toContain("§97조의2 ② 3호 비교과세 — 시나리오 B 채택");
  });

  it("A 채택은 종전 그대로 「이월과세 적용」", () => {
    const t = norm(render(<CarryoverComparisonCard detail={{ ...detailB, adoptedScenario: "A", comparisonExclusion: false, exclusionReason: undefined, isEligible: true } as never} />).container);
    expect(t).toContain("채택 시나리오: A (이월과세 적용)");
  });

  it("일반건물 부담부증여 카드 — 같은 문구", () => {
    const d = { isEligible: false, applicablePeriodYears: 10, adoptedScenario: "B", determinedTaxA: 1, determinedTaxB: 2, donorAcquisitionDate: new Date("2012-01-01"), giftTaxAmount: 0 };
    const t = norm(render(<GbBurdenedGiftCarryoverCard detail={d as never} />).container);
    expect(t).toContain("채택 시나리오: B (이월과세 미적용)");
    expect(t).not.toContain("비교과세 미적용");
  });
});

describe("R-c04-07 증여자 자본적지출 가드 안내", () => {
  it("2024.1.1. 전 양도 — 불산입 · 내부 용어 없음", () => {
    const d = { ...detailB, adoptedScenario: "A", comparisonExclusion: false, exclusionReason: undefined, isEligible: true, scenarioA: { ...scenarioA, donorCapexGuardApplied: true } };
    const t = norm(render(<CarryoverComparisonCard detail={d as never} />).container);
    expect(t).toContain("* 2024.1.1. 전 양도 — 증여자 자본적지출 불산입 (§97조의2 ① 2호 시행일)");
    expect(t).not.toContain("가드");
    expect(t).not.toContain("이전 양도");
  });
});

describe("R-c04-08 신고 전체 결정세액 비교 박스 금액 정렬", () => {
  it("두 금액 span — font-mono tabular-nums whitespace-nowrap", () => {
    const d = { ...detailB, filingUnitComparison: { determinedTaxWithCarryover: 12_345_678, determinedTaxWithout: 9_876_543 } };
    const { container } = render(<CarryoverComparisonCard detail={d as never} />);
    const spans = Array.from(container.querySelectorAll("span")).filter((s) => /^(12,345,678|9,876,543)/.test(s.textContent ?? ""));
    expect(spans.length).toBe(2);
    for (const s of spans) {
      expect(s.className).toContain("font-mono");
      expect(s.className).toContain("tabular-nums");
      expect(s.className).toContain("whitespace-nowrap");
    }
  });
});
