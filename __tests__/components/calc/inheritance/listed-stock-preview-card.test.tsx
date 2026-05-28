/**
 * Phase 2 anchor — ListedStockBesshiPreviewCard
 *
 * 입력 충족 / 미충족 / 토글 동작 검증
 */

import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import { ListedStockBesshiPreviewCard } from "@/components/calc/inheritance/listed-stock/ListedStockBesshiPreviewCard";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

function buildItem(patch?: Partial<EstateItem>): EstateItem {
  return {
    id: "test-1",
    category: "listed_stock",
    name: "삼성전자",
    listedStockAvgPrice: 50000,
    listedStockShares: 100,
    stockClass: "common",
    ...patch,
  };
}

describe("ListedStockBesshiPreviewCard", () => {
  it("UX-01 입력 충족 → 미리보기 카드 + 토글 표시", () => {
    const { getByTestId } = render(
      <ListedStockBesshiPreviewCard item={buildItem()} valuationDate="2022-07-06" />,
    );
    expect(getByTestId("ls-besshi-preview-card")).toBeTruthy();
    expect(getByTestId("ls-besshi-preview-toggle")).toBeTruthy();
  });

  it("UX-02 평균가 0 → 비활성 안내 카드", () => {
    const { getByTestId, queryByTestId } = render(
      <ListedStockBesshiPreviewCard
        item={buildItem({ listedStockAvgPrice: 0 })}
        valuationDate="2022-07-06"
      />,
    );
    expect(getByTestId("ls-besshi-preview-disabled")).toBeTruthy();
    expect(queryByTestId("ls-besshi-preview-card")).toBeNull();
  });

  it("UX-03 valuationDate 미입력 → 비활성 안내", () => {
    const { getByTestId, queryByTestId } = render(
      <ListedStockBesshiPreviewCard item={buildItem()} valuationDate={undefined} />,
    );
    expect(getByTestId("ls-besshi-preview-disabled")).toBeTruthy();
    expect(queryByTestId("ls-besshi-preview-card")).toBeNull();
  });

  it("주식수 0 → 비활성 안내", () => {
    const { getByTestId } = render(
      <ListedStockBesshiPreviewCard
        item={buildItem({ listedStockShares: 0 })}
        valuationDate="2022-07-06"
      />,
    );
    expect(getByTestId("ls-besshi-preview-disabled")).toBeTruthy();
  });

  it("토글 OFF 기본 → Page1/Page2 hidden (print:block은 화면 hidden 유지)", () => {
    const { getByTestId, queryByTestId } = render(
      <ListedStockBesshiPreviewCard item={buildItem()} valuationDate="2022-07-06" />,
    );
    // hidden 클래스 — 화면에서는 보이지 않음. testid는 DOM에는 있어도 hidden
    expect(getByTestId("ls-besshi-preview-toggle").textContent).toContain("▶");
    // Page1·Page2 자체는 hidden div 안 — 토글 ON 후 보임
    expect(queryByTestId("ls-besshi-p1-section")).toBeTruthy(); // DOM에는 존재
  });

  it("토글 클릭 → 펼침 (▼)", () => {
    const { getByTestId } = render(
      <ListedStockBesshiPreviewCard item={buildItem()} valuationDate="2022-07-06" />,
    );
    const toggle = getByTestId("ls-besshi-preview-toggle");
    expect(toggle.textContent).toContain("▶");
    fireEvent.click(toggle);
    expect(toggle.textContent).toContain("▼");
  });
});
