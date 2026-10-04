/**
 * @vitest-environment jsdom
 *
 * Y1-4 — 의제취득일은 **저장하지 않고 파생**한다 (영 §162⑦ · 2026-10-04 비파괴 전환)
 *
 * 계획서 `docs/00-pm/stock-deemed-date-other-asset-and-conversion-citation.plan.md` §5.1 · §6
 *
 * 종전 `coerceDeemed`는 1985.12.31. 이전 입력을 1986-01-01로 **바꿔 저장**했다. 4호(기타자산 —
 * 의제취득일 1985.1.1.)는 §94②(라목·다목 토글)로도 정해지는데 그 토글은 이 블록보다 뒤에 입력되므로,
 * 원래 날짜가 사라진 뒤에는 분류가 바뀌어도 되돌릴 수 없었다.
 *
 *   Y1-4a  1985-06-01 입력 → onChange 값이 1985-06-01 그대로 (1986-01-01로 바뀌지 않는다)
 *   Y1-4b  같은 저장값에서 분류만 바꾸면 안내가 따라 바뀐다 (순서 독립)
 *   Y1-4c  환산 분자(취득일 이전 1개월 종가) 표의 기준일 = 의제취득일 (영 §176의2④ · 사전-2015-법령해석재산-0242)
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AcquisitionInfoBlock } from "@/components/calc/stock-transfer/AcquisitionInfoBlock";
import { Step2 } from "@/app/calc/stock-transfer-tax/steps/Step2";
import { preTransferAutoFillDates } from "@/components/calc/stock-transfer/PostListingClosingPriceTable";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function renderBlock(o: Partial<StockTransferFormData> = {}) {
  const onChange = vi.fn();
  const form = {
    ...createInitialStockFormData(),
    marketType: "unlisted",
    transferDate: "2025-12-01",
    ...o,
  } as StockTransferFormData;
  const r = render(<AcquisitionInfoBlock form={form} onChange={onChange} />);
  return { ...r, onChange };
}

const notice = () => screen.queryByTestId("deemed-acquisition-notice");

describe("Y1-4a: 입력 날짜는 그대로 저장된다", () => {
  it("1985-06-01 → onChange에 1985-06-01 (1986-01-01 아님)", () => {
    const { onChange } = renderBlock();
    const card = screen.getByText("취득일").closest("[data-slot='field-card']") as HTMLElement;
    fireEvent.change(card.querySelector('input[aria-label="연도"]')!, { target: { value: "1985" } });
    fireEvent.change(card.querySelector('input[aria-label="월"]')!, { target: { value: "06" } });
    fireEvent.change(card.querySelector('input[aria-label="일"]')!, { target: { value: "01" } });
    const dates = onChange.mock.calls
      .map((c) => (c[0] as Partial<StockTransferFormData>).acquisitionDate)
      .filter(Boolean);
    expect(dates).toContain("1985-06-01");
    expect(dates).not.toContain("1986-01-01");
  });
});

describe("Y1-4b: 안내는 분류(§94①3호/4호)로 매 렌더 파생된다", () => {
  it("비상장(3호) 1985-06-01 → 의제취득일 1986.1.1. · §162⑦3호", () => {
    renderBlock({ acquisitionDate: "1985-06-01" });
    expect(notice()?.textContent).toContain("1986.1.1.");
    expect(notice()?.textContent).toContain("§162⑦3호");
  });
  it("같은 날짜 + 라목 ON(§94② → 4호) → 의제 아님 · 안내 없음", () => {
    renderBlock({ acquisitionDate: "1985-06-01", isHeavyRealEstateForRate: true });
    expect(notice()).toBeNull();
  });
  it("1984-06-01 + 라목 ON → 의제취득일 1985.1.1. · §162⑦1호", () => {
    renderBlock({ acquisitionDate: "1984-06-01", isHeavyRealEstateForRate: true });
    expect(notice()?.textContent).toContain("1985.1.1.");
    expect(notice()?.textContent).toContain("§162⑦1호");
    expect(notice()?.textContent).toContain("기타자산");
  });
  it("2010-01-01 → 안내 없음", () => {
    renderBlock({ acquisitionDate: "2010-01-01" });
    expect(notice()).toBeNull();
  });
});

describe("Y1-4c: Step 2 취득 축 1개월 종가표의 기준일은 의제취득일이다", () => {
  function tableHeader(o: Partial<StockTransferFormData>): string {
    const form = {
      ...createInitialStockFormData(),
      marketType: "kospi",
      transferDate: "2025-12-01",
      acquisitionDate: "1985-06-01",
      acquisitionMode: "estimated",
      acquisitionStdMode: "monthly_avg",
      acquisitionStdInputMode: "daily",
      ...o,
    } as StockTransferFormData;
    const { container } = render(<Step2 form={form} onChange={vi.fn()} />);
    return container.textContent ?? "";
  }
  const lastOf = (d: string) => preTransferAutoFillDates(d).at(-1)!;

  it("주식(3호) 1985-06-01 → 1986-01-01 이전 1개월", () => {
    const text = tableHeader({});
    expect(text).toContain(lastOf("1986-01-01"));
    expect(text).not.toContain(lastOf("1985-06-01"));
  });
  it("같은 날짜 + 라목 ON(4호 — 1985.1.1. 이후 취득) → 실제 취득일 이전 1개월", () => {
    const text = tableHeader({ isHeavyRealEstateForRate: true });
    expect(text).toContain(lastOf("1985-06-01"));
    expect(text).not.toContain(lastOf("1986-01-01"));
  });
});
