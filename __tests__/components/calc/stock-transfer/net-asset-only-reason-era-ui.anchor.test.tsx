/**
 * @vitest-environment jsdom
 *
 * ⑤ 영 §165④3 순자산 단독 사유 — 양도일에 있던 사유만 보인다 (Q-3b)
 *
 * 계획서 `docs/00-pm/stock-165-4-valuation-followups.plan.md` §13
 *
 *   UI-RE-1  2024 양도 → 가·나·다(주식등 80%)·라
 *   UI-RE-2  2022 양도 → 가·나·구 다(3년 연속 결손)
 *   UI-RE-3  2006 양도(max 구간) · 1999 양도(미지원) → 사유 칸 없음
 *   UI-RE-4  시기가 맞지 않는 값이 남아 있으면 그 값은 보인다 — 숨기면 ⑧ 오류를 고칠 칸이 없다
 *   UI-RE-5  양도일 미입력 → 현행 사유
 *   UI-RE-6  구 다목을 고르면 그 값이 폼에 실린다
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { EstimatedUnlistedBlock } from "@/components/calc/stock-transfer/EstimatedUnlistedBlock";
import { createInitialStockFormData, type StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

afterEach(cleanup);

function formOf(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "사유연혁법인",
    marketType: "unlisted",
    transferDate: "2024-06-01",
    ...o,
  };
}
const reasons = (c: HTMLElement) =>
  Array.from(c.querySelectorAll<HTMLInputElement>('input[name="netAssetOnlyReason"]')).map((i) => i.value);

const CURRENT = ["", "liquidation_or_owner_death", "no_business_or_short_or_closed", "stock_holding_company", "remaining_term_under_3y"];
const PRE2023 = ["", "liquidation_or_owner_death", "no_business_or_short_or_closed", "consecutive_loss_3y"];

describe("UI-RE-1·2: 양도일 연혁", () => {
  it.each([
    ["2024-06-01", CURRENT],
    ["2023-02-28", CURRENT],
    ["2023-02-27", PRE2023],
    ["2022-06-01", PRE2023],
    ["2007-02-28", PRE2023],
  ])("%s 양도", (transferDate, expected) => {
    const { container } = render(<EstimatedUnlistedBlock form={formOf({ transferDate })} onChange={vi.fn()} />);
    expect(reasons(container)).toEqual(expected);
  });
});

describe("UI-RE-3: 사유가 없는 구간 → 칸 없음", () => {
  it.each(["2007-02-27", "2006-06-01", "1999-06-01"])("%s 양도", (transferDate) => {
    const { container } = render(<EstimatedUnlistedBlock form={formOf({ transferDate })} onChange={vi.fn()} />);
    expect(reasons(container)).toEqual([]);
    expect(container.textContent).not.toContain("순자산 단독 평가 사유");
  });
});

describe("UI-RE-4: 남은 값은 보인다", () => {
  it("2022 양도 + 현행 다목 선택 → 구 다목과 함께 선택된 채 보인다", () => {
    const { container } = render(
      <EstimatedUnlistedBlock form={formOf({ transferDate: "2022-06-01", netAssetOnlyReason: "stock_holding_company" })} onChange={vi.fn()} />,
    );
    expect(reasons(container)).toEqual([...PRE2023.slice(0, 3), "consecutive_loss_3y", "stock_holding_company"]);
    expect(container.querySelector<HTMLInputElement>('input[value="stock_holding_company"]')?.checked).toBe(true);
  });
  it("2006 양도 + 가목 선택 → 칸이 보인다 (해당 없음 · 가목)", () => {
    const { container } = render(
      <EstimatedUnlistedBlock form={formOf({ transferDate: "2006-06-01", netAssetOnlyReason: "liquidation_or_owner_death" })} onChange={vi.fn()} />,
    );
    expect(reasons(container)).toEqual(["", "liquidation_or_owner_death"]);
  });
});

describe("UI-RE-5: 양도일 미입력 → 현행 사유", () => {
  it("구 다목은 보이지 않는다", () => {
    const { container } = render(<EstimatedUnlistedBlock form={formOf({ transferDate: "" })} onChange={vi.fn()} />);
    expect(reasons(container)).toEqual(CURRENT);
  });
});

describe("UI-RE-6: 구 다목 선택", () => {
  it("누르면 consecutive_loss_3y가 실린다", () => {
    const onChange = vi.fn();
    const { container } = render(<EstimatedUnlistedBlock form={formOf({ transferDate: "2022-06-01" })} onChange={onChange} />);
    fireEvent.click(container.querySelector<HTMLInputElement>('input[value="consecutive_loss_3y"]')!);
    expect(onChange).toHaveBeenCalledWith({ netAssetOnlyReason: "consecutive_loss_3y" });
  });
});
