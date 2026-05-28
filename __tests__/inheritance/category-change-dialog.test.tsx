/**
 * CategoryChangeDialog + EstateItemActionsMenu — Anchor (PR-F FU-6)
 *
 * Plan estate-card-followup-phase2 §FU-6
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CategoryChangeDialog } from "@/components/calc/inheritance/estate-card/CategoryChangeDialog";
import { EstateItemActionsMenu } from "@/components/calc/inheritance/estate-card/EstateItemActionsMenu";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(() => cleanup());

function makeItem(overrides: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "test-1",
    category: "financial",
    name: "테스트",
    marketValue: 1_000_000_000,
    ...overrides,
  };
}

// ============================================================
// EstateItemActionsMenu
// ============================================================

describe("EstateItemActionsMenu", () => {
  it("onChangeCategory 미전달 → ⋮ 메뉴 미렌더 (null)", () => {
    const { container } = render(<EstateItemActionsMenu itemId="card-1" />);
    expect(container.firstChild).toBeNull();
  });

  it("onChangeCategory 전달 → ⋮ 버튼 노출 + testid + a11y", () => {
    render(
      <EstateItemActionsMenu itemId="card-2" onChangeCategory={() => {}} />,
    );
    const trigger = screen.getByTestId("estate-card-actions-menu-card-2");
    expect(trigger).toBeInTheDocument();
    expect(trigger.getAttribute("aria-label")).toBe("자산 카드 더보기 메뉴");
  });
});

// ============================================================
// CategoryChangeDialog
// ============================================================

describe("CategoryChangeDialog — 시각 분기 매트릭스", () => {
  it("open=false → Dialog 미렌더", () => {
    render(
      <CategoryChangeDialog
        open={false}
        item={makeItem()}
        mode="inheritance"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(
      screen.queryByTestId("category-change-dialog-test-1"),
    ).toBeNull();
  });

  it("open=true → Dialog testid 노출", () => {
    render(
      <CategoryChangeDialog
        open={true}
        item={makeItem()}
        mode="inheritance"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(
      screen.getByTestId("category-change-dialog-test-1"),
    ).toBeInTheDocument();
  });

  it("mode=gift → deposit 카테고리 라디오 미노출 (상속세 전용)", () => {
    render(
      <CategoryChangeDialog
        open={true}
        item={makeItem()}
        mode="gift"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(
      screen.queryByTestId("category-change-radio-deposit-test-1"),
    ).toBeNull();
    // 그 외 6개는 노출
    expect(
      screen.getByTestId("category-change-radio-cash-test-1"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("category-change-radio-financial-test-1"),
    ).toBeInTheDocument();
  });

  it("mode=inheritance → deposit 라디오 노출", () => {
    render(
      <CategoryChangeDialog
        open={true}
        item={makeItem()}
        mode="inheritance"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(
      screen.getByTestId("category-change-radio-deposit-test-1"),
    ).toBeInTheDocument();
  });

  it("동일 카테고리 선택 → confirm 버튼 disabled", () => {
    render(
      <CategoryChangeDialog
        open={true}
        item={makeItem({ category: "financial" })}
        mode="inheritance"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const confirm = screen.getByTestId("category-change-confirm-test-1");
    expect(confirm).toBeDisabled();
  });

  it("그룹 내 변경 (cash → financial) → confirm 활성 + indigo 클래스", () => {
    render(
      <CategoryChangeDialog
        open={true}
        item={makeItem({ category: "cash" })}
        mode="inheritance"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(
      screen.getByTestId("category-change-radio-financial-test-1"),
    );
    const confirm = screen.getByTestId("category-change-confirm-test-1");
    expect(confirm).not.toBeDisabled();
    expect(confirm.className).toContain("bg-indigo-600");
    expect(confirm.textContent).toBe("변경 확인");
  });

  it("그룹 간 변경 (financial → real_estate_apartment) → confirm rose + 손실 필드 경고", () => {
    render(
      <CategoryChangeDialog
        open={true}
        item={makeItem({ category: "financial" })}
        mode="inheritance"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(
      screen.getByTestId("category-change-radio-real_estate_apartment-test-1"),
    );
    const confirm = screen.getByTestId("category-change-confirm-test-1");
    expect(confirm.className).toContain("bg-rose-600");
    expect(confirm.textContent).toBe("변경 확인 (필드 손실)");
    // 그룹 간 amber 경고 표시
    expect(screen.getByText(/그룹 간 변경/)).toBeInTheDocument();
  });

  it("그룹 내 변경 시 emerald hint 표시", () => {
    render(
      <CategoryChangeDialog
        open={true}
        item={makeItem({ category: "cash" })}
        mode="inheritance"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(
      screen.getByTestId("category-change-radio-financial-test-1"),
    );
    expect(screen.getByText(/그룹 내 변경/)).toBeInTheDocument();
  });

  it("confirm 클릭 → preserved 객체로 onConfirm 호출", () => {
    const onConfirm = vi.fn();
    render(
      <CategoryChangeDialog
        open={true}
        item={makeItem({
          category: "financial",
          marketValue: 500_000_000,
        })}
        mode="inheritance"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(
      screen.getByTestId("category-change-radio-real_estate_apartment-test-1"),
    );
    fireEvent.click(screen.getByTestId("category-change-confirm-test-1"));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "real_estate_apartment",
        marketValue: 500_000_000,
        name: "테스트",
      }),
    );
  });

  it("취소 버튼 클릭 → onCancel 호출", () => {
    const onCancel = vi.fn();
    render(
      <CategoryChangeDialog
        open={true}
        item={makeItem()}
        mode="inheritance"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText("취소"));
    expect(onCancel).toHaveBeenCalled();
  });
});
