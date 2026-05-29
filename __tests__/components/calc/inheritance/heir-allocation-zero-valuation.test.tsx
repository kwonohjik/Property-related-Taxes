/**
 * heir-allocation-zero-valuation — Issue 1·2 Pre-Do anchor
 *
 * Plan: docs/02-design/features/estate-card-input-ux-3fix.plan.md (v2)
 *
 * 검증:
 *   AC-1 평가액 0 + heirs 1명 + ToggleCard 활성 (isDisabled = !canDistribute만)
 *   AC-5 평가액 300M + 토글 ON → 첫 자연인 amount = 300M (현행 buildInitialHeirAllocations)
 *   AC-6 배우자 해제 + 장남 토글 ON → 장남 amount = expectedTotal (잔여 분배)
 *   AC-7 장남 200M + 차남 추가 → 차남 amount = 100M (잔여 분배)
 *   AC-9 expectedTotal 0 + 추가 → amount = 0 (Math.max 가드)
 *
 * 현행 코드 기준 RED 예상:
 *   - AC-1: HeirAllocationToggleSection.tsx:41 `effectiveValuation === 0`이 disabled에 포함 → RED
 *   - AC-6/AC-7: HeirAllocationInput.tsx:95 `amount: 0` 하드코딩 → RED
 *   - AC-5/AC-9: 현행 통과(GREEN) — 회귀 가드
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

import { HeirAllocationToggleSection } from "@/components/calc/inheritance/HeirAllocationToggleSection";
import { HeirAllocationInput } from "@/components/calc/inheritance/HeirAllocationInput";
import type {
  EstateItem,
  Heir,
  HeirAllocation,
} from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(() => cleanup());

const heirs: Heir[] = [
  { id: "h-spouse", relation: "spouse", name: "배우자" },
  { id: "h-son1", relation: "child", name: "장남" },
  { id: "h-son2", relation: "child", name: "차남" },
];

function makeItem(over: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "e1",
    category: "real_estate_apartment",
    name: "테스트 아파트",
    ...over,
  } as EstateItem;
}

describe("[UX3-AC1] 평가액 0 시 ToggleCard 활성", () => {
  it("AC-1: heirs 1명 + expectedTotal=0 → ToggleCard disabled=false", () => {
    const onChange = vi.fn();
    render(
      <HeirAllocationToggleSection
        item={makeItem()}
        heirs={[heirs[0]]}
        effectiveValuation={0}
        onChange={onChange}
      />,
    );
    // ToggleCard의 Switch 컨트롤 — disabled 속성으로 검증
    const sw = screen.getByRole("switch");
    expect(sw).not.toHaveAttribute("disabled");
    expect(sw).not.toHaveAttribute("data-disabled");
  });

  it("AC-1b: heirs 0명 → ToggleCard disabled=true (canDistribute만 차단)", () => {
    render(
      <HeirAllocationToggleSection
        item={makeItem()}
        heirs={[{ id: "corp", relation: "corporate", name: "영리법인" }]}
        effectiveValuation={1_000_000}
        onChange={vi.fn()}
      />,
    );
    const sw = screen.getByRole("switch");
    // disabled prop 또는 data-disabled 둘 중 하나 (ToggleCard 구현 의존)
    const isDisabled =
      sw.hasAttribute("disabled") || sw.getAttribute("data-disabled") !== null;
    expect(isDisabled).toBe(true);
  });
});

describe("[UX3-AC5..9] HeirAllocationInput 잔여 자동 채움", () => {
  it("AC-5: 토글 ON 첫 추가 → expectedTotal 전액", () => {
    const onChange = vi.fn();
    render(
      <HeirAllocationInput
        allocations={[]}
        expectedTotal={300_000_000}
        heirs={heirs}
        onChange={onChange}
      />,
    );
    // 배우자 칩 클릭
    fireEvent.click(screen.getByRole("button", { name: /배우자/ }));
    expect(onChange).toHaveBeenCalledWith([
      { heirId: "h-spouse", amount: 300_000_000 },
    ]);
  });

  it("AC-6: 잔여 0 상태에서 추가 → 새 상속인 amount = 0", () => {
    // 장남 200M 입력된 상태 + expectedTotal=200M (이미 잔여 0)
    const allocs: HeirAllocation[] = [
      { heirId: "h-son1", amount: 200_000_000 },
    ];
    const onChange = vi.fn();
    render(
      <HeirAllocationInput
        allocations={allocs}
        expectedTotal={200_000_000}
        heirs={heirs}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /차남/ }));
    expect(onChange).toHaveBeenCalledWith([
      { heirId: "h-son1", amount: 200_000_000 },
      { heirId: "h-son2", amount: 0 },
    ]);
  });

  it("AC-7: 장남 200M + 차남 추가 (expectedTotal 300M) → 차남 100M (잔여)", () => {
    const allocs: HeirAllocation[] = [
      { heirId: "h-son1", amount: 200_000_000 },
    ];
    const onChange = vi.fn();
    render(
      <HeirAllocationInput
        allocations={allocs}
        expectedTotal={300_000_000}
        heirs={heirs}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /차남/ }));
    expect(onChange).toHaveBeenCalledWith([
      { heirId: "h-son1", amount: 200_000_000 },
      { heirId: "h-son2", amount: 100_000_000 },
    ]);
  });

  it("AC-9: expectedTotal 0 + 추가 → amount 0 (Math.max 음수 가드)", () => {
    const onChange = vi.fn();
    render(
      <HeirAllocationInput
        allocations={[]}
        expectedTotal={0}
        heirs={heirs}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /장남/ }));
    expect(onChange).toHaveBeenCalledWith([
      { heirId: "h-son1", amount: 0 },
    ]);
  });

  it("AC-7b: 음수 잔여 가드 — 첫 행 과대 입력 후 추가 시 amount = 0", () => {
    const allocs: HeirAllocation[] = [
      { heirId: "h-son1", amount: 500_000_000 }, // expectedTotal 초과
    ];
    const onChange = vi.fn();
    render(
      <HeirAllocationInput
        allocations={allocs}
        expectedTotal={300_000_000}
        heirs={heirs}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /차남/ }));
    expect(onChange).toHaveBeenCalledWith([
      { heirId: "h-son1", amount: 500_000_000 },
      { heirId: "h-son2", amount: 0 }, // Math.max(0, 300M - 500M) = 0
    ]);
  });
});
