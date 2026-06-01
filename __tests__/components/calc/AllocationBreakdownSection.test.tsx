/**
 * @vitest-environment jsdom
 *
 * AllocationBreakdownSection — 상속세 배부·증여세액공제 계산 근거 펼침 RTL anchor
 * Plan: docs/00-pm/inheritance-allocation-calc-basis-breakdown.plan.md
 * UI Design: docs/02-design/features/inheritance-allocation-calc-basis-breakdown.ui.design.md
 *
 * - 6 카드 존재 + 핵심 산식 텍스트 + 조건부 렌더(⑩/⑫) + 자기일관(집계표 일치)
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { AllocationBreakdownSection } from "@/components/calc/results/allocation-breakdown/AllocationBreakdownSection";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import {
  EXAMPLE_HEIRS,
  EXAMPLE_INPUT,
} from "@/__tests__/tax-engine/inheritance/fixtures/comprehensive-case-pdf.fixture";
import type { Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(() => cleanup());

const fullResult = calcInheritanceTax(EXAMPLE_INPUT);

describe("AllocationBreakdownSection — 계산 근거 펼침", () => {
  it("AR-1: 섹션 + 6 카드 모두 렌더 (종합사례)", () => {
    render(<AllocationBreakdownSection result={fullResult} heirs={EXAMPLE_HEIRS} />);
    expect(screen.getByTestId("allocation-breakdown-section")).toBeInTheDocument();
    expect(screen.getByTestId("calc-basis-card-distributable-base")).toBeInTheDocument();
    expect(screen.getByTestId("calc-basis-card-surcharge-target")).toBeInTheDocument();
    expect(screen.getByTestId("calc-basis-card-taxbase-share")).toBeInTheDocument();
    expect(screen.getByTestId("calc-basis-card-computed-tax")).toBeInTheDocument();
    expect(screen.getByTestId("calc-basis-card-corporate-credit")).toBeInTheDocument();
    expect(screen.getByTestId("calc-basis-card-heir-credit")).toBeInTheDocument();
  });

  it("AR-2: ⑥ 카드 간접배부 배우자 산식 941,319,862 노출 (print:block 항상 DOM)", () => {
    render(<AllocationBreakdownSection result={fullResult} heirs={EXAMPLE_HEIRS} />);
    const card = screen.getByTestId("calc-basis-card-taxbase-share");
    expect(within(card).getAllByText(/941,319,862/).length).toBeGreaterThan(0);
    // 간접배부대상 과세표준 1,865M·분모 5,815M
    expect(within(card).getAllByText(/1,865,000,000/).length).toBeGreaterThan(0);
    expect(within(card).getAllByText(/5,815,000,000/).length).toBeGreaterThan(0);
  });

  it("AR-3: ⑥ 영리법인 포함 — ㉠ 700,000,000 노출 (U6)", () => {
    render(<AllocationBreakdownSection result={fullResult} heirs={EXAMPLE_HEIRS} />);
    const card = screen.getByTestId("calc-basis-card-taxbase-share");
    expect(within(card).getAllByText(/700,000,000/).length).toBeGreaterThan(0);
  });

  it("AR-4: ④ 산출세액 세율·누진공제 echo 산식 (4,175,000,000 × 50% − 460,000,000)", () => {
    render(<AllocationBreakdownSection result={fullResult} heirs={EXAMPLE_HEIRS} />);
    const card = screen.getByTestId("calc-basis-card-computed-tax");
    expect(within(card).getAllByText(/50% − 누진공제 460,000,000/).length).toBeGreaterThan(0);
  });

  it("AR-5: ⑩ 영리법인 한도 272,874,251 노출", () => {
    render(<AllocationBreakdownSection result={fullResult} heirs={EXAMPLE_HEIRS} />);
    const card = screen.getByTestId("calc-basis-card-corporate-credit");
    expect(within(card).getAllByText(/272,874,251/).length).toBeGreaterThan(0);
  });

  it("AR-6: ⑫ 배우자 한도 68,028,777 노출", () => {
    render(<AllocationBreakdownSection result={fullResult} heirs={EXAMPLE_HEIRS} />);
    const card = screen.getByTestId("calc-basis-card-heir-credit");
    expect(within(card).getAllByText(/68,028,777/).length).toBeGreaterThan(0);
  });

  it("AR-7: 영리법인 없는 케이스 → ⑩ 카드 미표시", () => {
    const heirsNoCorp = EXAMPLE_HEIRS.filter((h) => h.relation !== "corporate");
    const inputNoCorp = { ...EXAMPLE_INPUT, heirs: heirsNoCorp };
    const r = calcInheritanceTax(inputNoCorp);
    render(<AllocationBreakdownSection result={r} heirs={heirsNoCorp} />);
    expect(screen.queryByTestId("calc-basis-card-corporate-credit")).toBeNull();
    // *1/*2/⑥/⑦ 4카드는 유지
    expect(screen.getByTestId("calc-basis-card-distributable-base")).toBeInTheDocument();
  });

  it("AR-8: 사전증여 없는(상속인) 케이스 → ⑫ 카드 미표시 (R2)", () => {
    // 단일 상속인 + 사전증여 0 + 영리법인 0
    const soleHeir: Heir[] = [
      { id: "h-sole", relation: "child", name: "단독", isGenerationSkipBeneficiary: false },
    ];
    const simpleInput = {
      ...EXAMPLE_INPUT,
      heirs: soleHeir,
      priorGifts: [],
      estateItems: EXAMPLE_INPUT.estateItems.map((e) => ({
        ...e,
        heirAllocations: [{ heirId: "h-sole", amount: e.heirAllocations?.[0]?.amount ?? 0 }],
      })),
    };
    const r = calcInheritanceTax(simpleInput);
    render(<AllocationBreakdownSection result={r} heirs={soleHeir} />);
    expect(screen.queryByTestId("calc-basis-card-corporate-credit")).toBeNull();
    expect(screen.queryByTestId("calc-basis-card-heir-credit")).toBeNull();
    // 4카드 유지
    expect(screen.getByTestId("calc-basis-card-distributable-base")).toBeInTheDocument();
    expect(screen.getByTestId("calc-basis-card-computed-tax")).toBeInTheDocument();
  });

  it("AR-9: 자기일관 — ⑥ 합계 trigger = result.taxBase", () => {
    render(<AllocationBreakdownSection result={fullResult} heirs={EXAMPLE_HEIRS} />);
    const card = screen.getByTestId("calc-basis-card-taxbase-share");
    expect(within(card).getAllByText(/4,175,000,000/).length).toBeGreaterThan(0);
  });
});
