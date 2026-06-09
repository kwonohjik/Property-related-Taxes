/**
 * heir-allocation-unified-row — 협의분할 통합 행 + 높이/라벨 중복 압축 anchor
 *
 * Design: docs/02-design/features/heir-allocation-compaction.ui.design.md
 *
 * 검증:
 *   A-1 미선택 → 전원 토글(+), 금액 input 0개, 법정상속분 안내 노출
 *   A-2 1명 선택 → 그 행 금액 input 1개, 이름 1회(중복 라벨 부재)
 *   A-3 선택 해제 → onChange(undefined)
 *   A-6 heading 기본값 노출 / heading={null} 미노출
 *   A-7 토글 aria-pressed 선택 상태 반영
 *   A-8 flush=false 카드 테두리 / flush=true 평탄화
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";

import { HeirAllocationInput } from "@/components/calc/inheritance/HeirAllocationInput";
import type { Heir, HeirAllocation } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(() => cleanup());

const heirs: Heir[] = [
  { id: "h-spouse", relation: "spouse", name: "한배우자" },
  { id: "h-son1", relation: "child", name: "김첫째" },
  { id: "h-son2", relation: "child", name: "김둘째" },
];

describe("[통합 행] HeirAllocationInput 압축", () => {
  it("A-1: 미선택 → 전원 토글(+) 노출, 금액 input 0개, 법정상속분 안내 노출", () => {
    render(
      <HeirAllocationInput
        allocations={[]}
        expectedTotal={300_000_000}
        heirs={heirs}
        onChange={vi.fn()}
      />,
    );
    const rows = screen.getByTestId("heir-allocation-rows");
    // 전원 토글 버튼 3개
    expect(within(rows).getAllByRole("button").length).toBe(3);
    // 미선택 → 금액 input(분배 금액 placeholder) 없음
    expect(screen.queryByPlaceholderText("분배 금액")).toBeNull();
    // 법정상속분 안내
    expect(screen.getByText(/법정상속분/)).toBeTruthy();
  });

  it("A-2: 1명 선택 → 금액 input 1개, 이름 1회만 (중복 라벨 부재)", () => {
    const allocs: HeirAllocation[] = [{ heirId: "h-spouse", amount: 300_000_000 }];
    render(
      <HeirAllocationInput
        allocations={allocs}
        expectedTotal={300_000_000}
        heirs={heirs}
        onChange={vi.fn()}
      />,
    );
    // 금액 input 1개
    expect(screen.getAllByPlaceholderText("분배 금액").length).toBe(1);
    // 이름 "한배우자"는 토글 1회만 — 입력행 별도 라벨 없음
    expect(screen.getAllByText(/한배우자/).length).toBe(1);
  });

  it("A-3: 선택 해제 → onChange(undefined)", () => {
    const allocs: HeirAllocation[] = [{ heirId: "h-spouse", amount: 300_000_000 }];
    const onChange = vi.fn();
    render(
      <HeirAllocationInput
        allocations={allocs}
        expectedTotal={300_000_000}
        heirs={heirs}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /한배우자/ }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("A-6: heading 기본값 노출 / heading={null} 미노출", () => {
    const { unmount } = render(
      <HeirAllocationInput
        allocations={[{ heirId: "h-spouse", amount: 1 }]}
        expectedTotal={1}
        heirs={heirs}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByText("협의분할 (상속인별 분배)")).not.toBeNull();
    unmount();

    render(
      <HeirAllocationInput
        allocations={[{ heirId: "h-spouse", amount: 1 }]}
        expectedTotal={1}
        heirs={heirs}
        onChange={vi.fn()}
        heading={null}
      />,
    );
    expect(screen.queryByText("협의분할 (상속인별 분배)")).toBeNull();
  });

  it("A-7: 토글 aria-pressed 선택 상태 반영", () => {
    render(
      <HeirAllocationInput
        allocations={[{ heirId: "h-spouse", amount: 1 }]}
        expectedTotal={1}
        heirs={heirs}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /한배우자/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /김첫째/ }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("A-8: flush=true 평탄화 (카드 테두리 클래스 부재)", () => {
    const { rerender } = render(
      <HeirAllocationInput
        allocations={[]}
        expectedTotal={0}
        heirs={heirs}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("heir-allocation-input").className).toContain("border");

    rerender(
      <HeirAllocationInput
        allocations={[]}
        expectedTotal={0}
        heirs={heirs}
        onChange={vi.fn()}
        flush
      />,
    );
    expect(screen.getByTestId("heir-allocation-input").className).not.toContain("border");
  });
});
