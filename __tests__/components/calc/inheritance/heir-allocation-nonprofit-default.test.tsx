/**
 * heir-allocation-nonprofit-default — 비영리법인 노출·기본값 제거·2열 배치 anchor
 *
 * Design: docs/02-design/features/inheritance-heir-allocation-nonprofit-default-layout.ui.design.md
 *
 * 검증 (계획 §9 U-1~U-3):
 *   U-1 비영리법인 포함 / 영리법인 제외
 *   U-2 ON 빈 배열(buildInitialHeirAllocations) + 칩 선택 시 전액 자동
 *   U-3 2열 그리드 레이아웃
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";

import {
  HeirAllocationInput,
  buildInitialHeirAllocations,
  hasDistributableHeir,
} from "@/components/calc/inheritance/HeirAllocationInput";
import type { Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(() => cleanup());

const heirs: Heir[] = [
  { id: "h-son1", relation: "child", name: "김첫째" },
  { id: "h-np", relation: "corporate", name: "△△재단", isForProfit: false }, // 비영리법인
  { id: "h-fp", relation: "corporate", name: "○○주식회사", isForProfit: true }, // 영리법인
];

describe("[비영리법인·기본값·2열] HeirAllocationInput", () => {
  it("U-1: 비영리법인 포함 / 영리법인 제외", () => {
    render(
      <HeirAllocationInput
        allocations={[]}
        expectedTotal={300_000_000}
        heirs={heirs}
        onChange={vi.fn()}
      />,
    );
    const rows = screen.getByTestId("heir-allocation-rows");
    // 자녀 + 비영리법인 = 2개 (영리법인 제외)
    expect(within(rows).getAllByRole("button").length).toBe(2);
    expect(within(rows).getByText(/△△재단/)).toBeTruthy(); // 비영리법인 노출
    expect(within(rows).queryByText(/○○주식회사/)).toBeNull(); // 영리법인 제외
    // hasDistributableHeir 헬퍼도 동일 판정
    expect(hasDistributableHeir(heirs)).toBe(true);
    expect(
      hasDistributableHeir([{ id: "x", relation: "corporate", isForProfit: true }]),
    ).toBe(false);
  });

  it("U-2: ON 빈 배열 + 칩 선택 시 전액 자동", () => {
    // buildInitialHeirAllocations는 항상 빈 배열 (전액 자동배정 제거)
    expect(buildInitialHeirAllocations(heirs, 300_000_000)).toEqual([]);

    const onChange = vi.fn();
    render(
      <HeirAllocationInput
        allocations={[]}
        expectedTotal={300_000_000}
        heirs={heirs}
        onChange={onChange}
      />,
    );
    // 미선택 → 금액 input 없음
    expect(screen.queryByPlaceholderText("분배 금액")).toBeNull();
    // 칩 1개 클릭 → 전액 자동
    const rows = screen.getByTestId("heir-allocation-rows");
    fireEvent.click(within(rows).getByText(/김첫째/));
    expect(onChange).toHaveBeenCalledWith([
      { heirId: "h-son1", amount: 300_000_000 },
    ]);
  });

  it("U-3: 2열 그리드 레이아웃", () => {
    render(
      <HeirAllocationInput
        allocations={[]}
        expectedTotal={300_000_000}
        heirs={heirs}
        onChange={vi.fn()}
      />,
    );
    const rows = screen.getByTestId("heir-allocation-rows");
    expect(rows.className).toContain("grid");
    expect(rows.className).toContain("sm:grid-cols-2");
  });
});
