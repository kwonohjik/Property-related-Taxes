/**
 * @vitest-environment jsdom
 *
 * HeirAllocationSummaryTable — UI 가독성 수정 anchor (2026-06-01)
 * Plan: docs/00-pm/inheritance-heir-allocation-summary-table-ui-fix.plan.md
 *
 * - 이슈1: 그룹 헤더 행(⑥/⑩/⑫) 화면 렌더 + 세부행 들여쓰기(pl-7)
 * - 이슈2: 폰트 통일 — 강조 행 th(라벨)에 font-normal 강제 제거 → tr weight 일관,
 *          숫자 td에 tabular-nums 명시
 * - 이슈3: 미배부 셀 빈칸("") 렌더, 대시(—) 미사용
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HeirAllocationSummaryTable } from "@/components/calc/results/HeirAllocationSummaryTable";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import {
  EXAMPLE_HEIRS,
  EXAMPLE_INPUT,
} from "@/__tests__/tax-engine/inheritance/fixtures/comprehensive-case-pdf.fixture";

afterEach(() => cleanup());

const result = calcInheritanceTax(EXAMPLE_INPUT);

function renderTable() {
  return render(
    <HeirAllocationSummaryTable result={result} heirs={EXAMPLE_HEIRS} />,
  );
}

describe("HeirAllocationSummaryTable — UI 가독성 수정", () => {
  it("UR-1: 그룹 헤더 행 3개 렌더 (⑥ 과세표준 / ⑩·⑫ 증여세액공제)", () => {
    renderTable();
    expect(
      screen.getByTestId("heir-summary-row-row-6-group"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("heir-summary-row-row-10-group"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("heir-summary-row-row-12-group"),
    ).toBeInTheDocument();
    expect(screen.getByText("과세표준")).toBeInTheDocument();
    expect(
      screen.getByText("상속인(수유자)외 증여세액공제"),
    ).toBeInTheDocument();
    expect(screen.getByText("상속인등의 증여세액공제")).toBeInTheDocument();
  });

  it("UR-2: 세부행 라벨 들여쓰기(pl-7) — 직접배부 등", () => {
    renderTable();
    const directRow = screen.getByTestId("heir-summary-row-row-6a-direct");
    const th = directRow.querySelector("th");
    expect(th?.className).toContain("pl-7");
  });

  it("UR-3: 폰트 통일 — 강조행 ⑮ th에 font-normal 없음, tr에 font-bold", () => {
    renderTable();
    const finalRow = screen.getByTestId("heir-summary-row-row-15-finalTax");
    expect(finalRow.className).toContain("font-bold");
    const th = finalRow.querySelector("th");
    expect(th?.className).not.toContain("font-normal");
  });

  it("UR-4: 숫자 td에 tabular-nums 명시 (폭 통일)", () => {
    renderTable();
    const cell = screen.getByTestId(
      "heir-summary-cell-total-row-15-finalTax",
    );
    expect(cell.className).toContain("tabular-nums");
  });

  it("UR-5: 미배부 셀 빈칸 — ⑤ 상속공제 인별 칸은 '' (대시 미사용)", () => {
    renderTable();
    // ⑤ 상속공제 합계는 값 있으나 인별 칸은 구조적 미배부(null) → 빈칸
    const spouseCell = screen.getByTestId(
      `heir-summary-cell-${EXAMPLE_HEIRS[0].id}-row-5-deduction`,
    );
    expect(spouseCell.textContent).toBe("");
    expect(spouseCell.textContent).not.toContain("—");
  });

  it("UR-6: 그룹 헤더 행 값 칸 공란 (⑥ 과세표준 합계 빈칸)", () => {
    renderTable();
    const totalCell = screen.getByTestId(
      "heir-summary-cell-total-row-6-group",
    );
    expect(totalCell.textContent).toBe("");
  });
});
