/**
 * ListedStockValuationPreviewCard — 평가액 미리보기 카드 산식 표시 anchor.
 *
 * Plan: docs/00-pm/listed-stock-form-formula-premium-display-fix.plan.md
 *
 * 검증: §63③ 할증 20% 반영 산식 표시 정합 (이미지 16 버그 회귀 가드).
 */

import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ListedStockValuationPreviewCard } from "@/components/calc/inheritance/listed-stock/ListedStockValuationPreviewCard";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

const BASE_ITEM: EstateItem = {
  id: "ls-form-preview-anchor",
  category: "listed_stock",
  name: "삼성전자",
  listedStockShares: 30_000,
  listedStockAvgPrice: 61_465,
  listedStockCode: "005930",
  stockClass: "common",
  companyName: "삼성전자",
};

afterEach(() => cleanup());

describe("ListedStockValuationPreviewCard — §63③ 할증 산식 표시", () => {
  it("AC-1 이미지 16 fixture (할증 20%) → ⑩ 산식 + ⑩ × shares + 2,212,740,000원", () => {
    render(
      <ListedStockValuationPreviewCard
        item={{
          ...BASE_ITEM,
          isMaxShareholder: true,
          companySize: "large",
          premiumExclusionReason: "none",
        }}
      />,
    );

    // 1행 — ⑩ 1주당 평가액 = floor(61,465 × 1.2) = 73,758
    const perShare = screen.getByTestId("ls-preview-per-share-formula");
    expect(perShare.textContent).toMatch(/61,465.*×.*1\.2/);
    expect(perShare.textContent).toContain("73,758");
    expect(screen.getByText(/⑩ 최대주주 1주당 평가액/)).toBeTruthy();

    // 2행 — 73,758 × 30,000주
    const total = screen.getByTestId("ls-preview-total-formula");
    expect(total.textContent).toContain("73,758");
    expect(total.textContent).toContain("30,000");
    expect(total.textContent).not.toMatch(/^61,465 × 30,000주$/); // ★ 회귀 가드: ⑨ 산식 금지

    // 합계 = 73,758 × 30,000 = 2,212,740,000
    const value = screen.getByTestId("ls-preview-total-value");
    expect(value.textContent).toContain("2,212,740,000");
  });

  it("AC-2 할증 0% (isMaxShareholder=false) → ⑨·⑩ = 61,465, 61,465 × 30,000주, 1,843,950,000", () => {
    render(<ListedStockValuationPreviewCard item={BASE_ITEM} />);

    expect(screen.getByText(/1주당 평가액 \(⑨·⑩\)/)).toBeTruthy();
    const perShare = screen.getByTestId("ls-preview-per-share-formula");
    expect(perShare.textContent).toBe("61,465");

    const total = screen.getByTestId("ls-preview-total-formula");
    expect(total.textContent).toBe("61,465 × 30,000주");

    const value = screen.getByTestId("ls-preview-total-value");
    expect(value.textContent).toContain("1,843,950,000");
  });

  it("AC-3 §63②3호 + 할증 20% → ⑰ floor((61,465 − 2,000) × 1.2) = 71,358, ⑰ × shares", () => {
    render(
      <ListedStockValuationPreviewCard
        item={{
          ...BASE_ITEM,
          isMaxShareholder: true,
          companySize: "large",
          premiumExclusionReason: "none",
          isCapitalIncreaseUnlistedShare: true,
          capitalIncreaseDate: "2022-06-15",
          faceValuePerShare: 5000,
          priorDividendRate: 0.05,
          dividendBaseDate: "2022-01-01",
          listedStockDividendDifference: 2000,
        }}
      />,
    );
    expect(screen.getByText(/⑰ 최대주주 1주당 평가액/)).toBeTruthy();
    const perShare = screen.getByTestId("ls-preview-per-share-formula");
    // floor((61,465 − 2,000) × 1.2) = floor(59,465 × 1.2) = floor(71,358) = 71,358
    expect(perShare.textContent).toContain("71,358");
    const total = screen.getByTestId("ls-preview-total-formula");
    expect(total.textContent).toContain("71,358");
    expect(total.textContent).toContain("30,000");
  });

  it("AC-4 §63②3호 + 배당기산일 동일 (⑮=0) → '−' 부호 없는 단순 표시", () => {
    render(
      <ListedStockValuationPreviewCard
        item={{
          ...BASE_ITEM,
          isCapitalIncreaseUnlistedShare: true,
          capitalIncreaseDate: "2022-06-15",
          faceValuePerShare: 5000,
          priorDividendRate: 0.05,
          dividendBaseDate: "2022-01-01",
          dividendBaseDateSameAsListed: true,
          listedStockDividendDifference: 0,
        }}
      />,
    );
    expect(screen.getByText(/1주당 평가액 \(⑯·⑰\)/)).toBeTruthy();
    const perShare = screen.getByTestId("ls-preview-per-share-formula");
    // 배당기산일 동일 시 차감 표시 안 함
    expect(perShare.textContent).not.toContain("−");
    expect(perShare.textContent).toBe("61,465");
  });

  it("AC-5 §63③ 배제 사유 (companySize=small + isMaxShareholder=true) → 할증 0% + 배제 사유 안내", () => {
    render(
      <ListedStockValuationPreviewCard
        item={{
          ...BASE_ITEM,
          isMaxShareholder: true,
          companySize: "small", // 자동 배제
        }}
      />,
    );
    expect(screen.getByText(/1주당 평가액 \(⑨·⑩\)/)).toBeTruthy();
    const exclusion = screen.getByTestId("ls-preview-premium-exclusion");
    expect(exclusion.textContent).toContain("배제 사유");
    const value = screen.getByTestId("ls-preview-total-value");
    expect(value.textContent).toContain("1,843,950,000"); // 할증 0%
  });

  it("avgPrice·shares 미충족 시 카드 미렌더 (null)", () => {
    const { container } = render(
      <ListedStockValuationPreviewCard item={{ ...BASE_ITEM, listedStockAvgPrice: 0 }} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
