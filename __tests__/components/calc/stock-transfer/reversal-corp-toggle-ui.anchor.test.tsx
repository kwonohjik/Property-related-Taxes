/**
 * @vitest-environment jsdom
 *
 * ⑤ 영 §165④1호 괄호 — 2:3 대상 법인 토글(`ReversalCorpToggle`)이 평가 입력 영역에 있고, 다목·라목 사실이면 켠 채 잠긴다 (S-1c-2)
 *
 * 계획서 `docs/00-pm/stock-165-4-valuation-followups.plan.md` §3 · Q-2b·Q-2c
 *
 *   UI-RC-1  일반 비상장 → 토글 있음 · 꺼짐 · 누르면 `isHeavyRealEstateForValuation: true`
 *   UI-RC-2  라목 + 2023-02-27 → 켜짐 · 잠김 (라목 사유)
 *   UI-RC-3  다목 카드 비율 60% → 켜짐 · 잠김 (다목 사유) / 49.9% → 꺼짐 · 열림
 *   UI-RC-4  순자산 단독(라목 2024 · §165④3 사유) → 토글 없음
 *   UI-RC-5  증여 부담부(hideReversalToggle) → 토글 없음
 *   UI-RC-6  상장 후 환산 카드 → 토글 있음 · 산식 안내·환산 미리보기도 같은 leaf
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { EstimatedUnlistedBlock } from "@/components/calc/stock-transfer/EstimatedUnlistedBlock";
import { PostListingValuationCard } from "@/components/calc/stock-transfer/PostListingValuationCard";
import { PostListingFormulaPreview } from "@/components/calc/stock-transfer/PostListingFormulaPreview";
import { createInitialStockFormData, type StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

afterEach(cleanup);

function formOf(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "부동산법인",
    marketType: "unlisted",
    transferDate: "2024-06-01",
    ...o,
  };
}
const card = () => screen.queryByTestId("reversal-corp-toggle");
const sw = () => within(screen.getByTestId("reversal-corp-toggle")).getByRole("switch");

describe("UI-RC-1: 일반 비상장 — 사용자 신고", () => {
  it("토글 있음 · 꺼짐 · 열림 · 누르면 신고값이 켜진다", () => {
    const onChange = vi.fn();
    render(<EstimatedUnlistedBlock form={formOf()} onChange={onChange} />);
    expect(sw()).toHaveAttribute("aria-checked", "false");
    expect(card()).not.toHaveAttribute("data-disabled");
    fireEvent.click(sw());
    expect(onChange).toHaveBeenCalledWith({ isHeavyRealEstateForValuation: true });
  });
});

describe("UI-RC-2·3: 다목·라목 사실 → 켠 채 잠김", () => {
  it("라목 + 2023-02-27 → 켜짐 · 잠김 · 라목 사유", () => {
    render(<EstimatedUnlistedBlock form={formOf({ isHeavyRealEstateForRate: true, transferDate: "2023-02-27" })} onChange={vi.fn()} />);
    expect(sw()).toHaveAttribute("aria-checked", "true");
    expect(card()).toHaveAttribute("data-disabled");
    expect(card()?.textContent).toContain("라목");
  });
  it("다목 카드 · 부동산등 비율 60% → 켜짐 · 잠김 · 다목 사유", () => {
    render(
      <EstimatedUnlistedBlock
        form={formOf({ isQualifyingBlockShareholder: true, blockShareholderRealEstateRatio: "60" })}
        onChange={vi.fn()}
      />,
    );
    expect(sw()).toHaveAttribute("aria-checked", "true");
    expect(card()?.textContent).toContain("다목");
    // 미리보기 가중치도 같은 leaf — 2:3
    expect(screen.getByText(/순손익가치 × 2\/5 \+ 순자산가치 × 3\/5/)).toBeInTheDocument();
  });
  it("다목 비율 49.9% → 꺼짐 · 열림", () => {
    render(
      <EstimatedUnlistedBlock
        form={formOf({ isQualifyingBlockShareholder: true, blockShareholderRealEstateRatio: "49.9" })}
        onChange={vi.fn()}
      />,
    );
    expect(sw()).toHaveAttribute("aria-checked", "false");
    expect(card()).not.toHaveAttribute("data-disabled");
  });
});

describe("UI-RC-4·5: 토글이 없어야 하는 곳", () => {
  it("라목 + 2024 (후단 순자산 단독) → 없음", () => {
    render(<EstimatedUnlistedBlock form={formOf({ isHeavyRealEstateForRate: true })} onChange={vi.fn()} />);
    expect(card()).toBeNull();
  });
  it("§165④3 사유(청산) → 없음", () => {
    render(<EstimatedUnlistedBlock form={formOf({ netAssetOnlyReason: "liquidation_or_owner_death", acquisitionNetAssetOnlyReason: "liquidation_or_owner_death" })} onChange={vi.fn()} />);
    expect(card()).toBeNull();
  });
  it("hideReversalToggle(증여 부담부) → 없음", () => {
    render(<EstimatedUnlistedBlock form={formOf()} onChange={vi.fn()} simpleOnly hideReversalToggle />);
    expect(card()).toBeNull();
  });
});

describe("UI-RC-6: 상장 후 환산(§165⑤) 카드", () => {
  it("토글 있음", () => {
    render(<PostListingValuationCard form={formOf({ marketType: "kosdaq", acquisitionStdMode: "post_listing" })} onChange={vi.fn()} />);
    expect(card()).toBeInTheDocument();
    expect(screen.queryByText(/2:3 반전/)).toBeNull();
  });
  it("라목 상장주식 → 산식 안내가 2:3 (같은 leaf)", () => {
    render(
      <PostListingValuationCard
        form={formOf({ marketType: "kosdaq", acquisitionStdMode: "post_listing", isHeavyRealEstateForRate: true })}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/부동산등 50% 이상 법인 — 2:3 반전/)).toBeInTheDocument();
  });
  it("환산 미리보기(`PostListingFormulaPreview`)도 라목이면 2:3 — 300×2/5 + 100×3/5", () => {
    const f = formOf({
      marketType: "kosdaq",
      acquisitionStdMode: "post_listing",
      isHeavyRealEstateForRate: true,
      listingYearNetIncomePerShare: "300",
      listingYearNetAssetPerShare: "100",
    });
    const { container } = render(<PostListingFormulaPreview form={f} />);
    expect(container.textContent).toContain("300×2/5");
  });
});
