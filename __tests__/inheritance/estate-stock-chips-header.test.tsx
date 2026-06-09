/**
 * EstateStockChipsHeader — Anchor (PR-E)
 *
 * Plan estate-card-followup-phase2 §FU-2
 *
 * 정책:
 *   - V1(상장·simple)만 chip-major-shareholder 노출
 *   - V2(formal)는 미노출
 *   - 기존 MajorShareholderStockToggle은 EstateCommonAttributesSection에 그대로 유지 (e2e 무변경)
 *   - chip-major-shareholder 클릭 → isSection22MajorShareholder 토글 + 기존 토글과 양방향 동기
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { EstateStockChipsHeader } from "@/components/calc/inheritance/EstateStockChipsHeader";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(() => cleanup());

function makeStockItem(overrides: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "stock-1",
    category: "listed_stock",
    name: "삼성전자",
    ...overrides,
  };
}

describe("EstateStockChipsHeader — chip-major-shareholder 노출 매트릭스", () => {
  it("showMajorShareholderChip=true → chip-major-shareholder 노출", () => {
    render(
      <EstateStockChipsHeader
        item={makeStockItem()}
        onUpdate={() => {}}
        effectiveValuation={1_000_000_000}
        showMajorShareholderChip={true}
        icon="📈"
        categoryLabel="상장주식"
        index={0}
      />,
    );
    expect(
      screen.getByTestId("estate-stock-chips-header-stock-1"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("estate-chip-major-shareholder-stock-1"),
    ).toBeInTheDocument();
  });

  it("showMajorShareholderChip=false → chip-major-shareholder 미노출", () => {
    render(
      <EstateStockChipsHeader
        item={makeStockItem({ category: "unlisted_stock" })}
        onUpdate={() => {}}
        effectiveValuation={1_000_000_000}
        showMajorShareholderChip={false}
        icon="📊"
        categoryLabel="비상장주식"
        index={0}
      />,
    );
    expect(
      screen.queryByTestId("estate-chip-major-shareholder-stock-1"),
    ).toBeNull();
  });

  it("기본 평가액 칩 노출 — chip-estimated-value", () => {
    render(
      <EstateStockChipsHeader
        item={makeStockItem()}
        onUpdate={() => {}}
        effectiveValuation={500_000_000}
        showMajorShareholderChip={true}
        icon="📈"
        categoryLabel="상장주식"
        index={0}
      />,
    );
    expect(
      screen.getByTestId("estate-chip-estimated-value-stock-1"),
    ).toBeInTheDocument();
  });

  it("중복 방지: heirs 전달해도 farming·family-business·heir-allocation 칩 미노출 (직렬 섹션 단일 소스, D-O1)", () => {
    render(
      <EstateStockChipsHeader
        item={makeStockItem()}
        onUpdate={() => {}}
        heirs={[{ id: "h1", relation: "child", name: "자녀" }]}
        effectiveValuation={1_000_000_000}
        showMajorShareholderChip={true}
        icon="📈"
        categoryLabel="상장주식"
        index={0}
      />,
    );
    // EstateCommonAttributesSection 직렬 섹션과 중복되는 칩은 헤더에서 제외 → 인라인 패널 중복 방지
    expect(screen.queryByTestId("estate-chip-heir-allocation-stock-1")).toBeNull();
    expect(screen.queryByTestId("estate-chip-farming-stock-1")).toBeNull();
    expect(screen.queryByTestId("estate-chip-family-business-stock-1")).toBeNull();
  });

  it("chip-section22 미노출 — listed_stock visibility=hidden_permanent", () => {
    render(
      <EstateStockChipsHeader
        item={makeStockItem({ category: "listed_stock" })}
        onUpdate={() => {}}
        effectiveValuation={500_000_000}
        showMajorShareholderChip={true}
        icon="📈"
        categoryLabel="상장주식"
        index={0}
      />,
    );
    expect(screen.queryByTestId("estate-chip-section22-stock-1")).toBeNull();
  });

  it("chip-major-shareholder 클릭 → isSection22MajorShareholder 토글", () => {
    let captured: EstateItem | null = null;
    render(
      <EstateStockChipsHeader
        item={makeStockItem()}
        onUpdate={(updated) => (captured = updated)}
        effectiveValuation={500_000_000}
        showMajorShareholderChip={true}
        icon="📈"
        categoryLabel="상장주식"
        index={0}
      />,
    );
    fireEvent.click(
      screen.getByTestId("estate-chip-major-shareholder-stock-1"),
    );
    expect((captured as EstateItem | null)?.isSection22MajorShareholder).toBe(true);
  });

  it("⚙️ 옵션 버튼 노출 + 클릭 → 패널 펼침", () => {
    render(
      <EstateStockChipsHeader
        item={makeStockItem()}
        onUpdate={() => {}}
        effectiveValuation={500_000_000}
        showMajorShareholderChip={true}
        icon="📈"
        categoryLabel="상장주식"
        index={0}
      />,
    );
    const advancedToggle = screen.getByTestId(
      "estate-advanced-panel-toggle-stock-1",
    );
    expect(advancedToggle).toBeInTheDocument();
    fireEvent.click(advancedToggle);
    expect(
      screen.getByTestId("estate-advanced-panel-stock-1"),
    ).toBeInTheDocument();
  });

  it("isSection22MajorShareholder=true 시 칩 라벨 '최대주주 §22②' + 체크(aria-pressed)", () => {
    render(
      <EstateStockChipsHeader
        item={makeStockItem({ isSection22MajorShareholder: true })}
        onUpdate={() => {}}
        effectiveValuation={500_000_000}
        showMajorShareholderChip={true}
        icon="📈"
        categoryLabel="상장주식"
        index={0}
      />,
    );
    const chip = screen.getByTestId("estate-chip-major-shareholder-stock-1");
    // 체크는 라벨 텍스트(✓)가 아니라 굵은 Check 아이콘 + aria-pressed로 표현 (2026-05-29)
    expect(chip.textContent).toContain("최대주주 §22②");
    expect(chip.textContent).not.toContain("✓");
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });
});
