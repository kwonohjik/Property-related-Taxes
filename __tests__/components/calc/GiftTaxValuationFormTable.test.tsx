/**
 * GiftTaxValuationFormTable — 별지 제10호서식 부표 1 컴포넌트 단위 테스트
 *
 * 디자인: docs/02-design/features/gift-tax-valuation-besshi-10-buppyo.engine.design.md
 * 계획서: docs/00-pm/gift-tax-valuation-besshi-10-buppyo.plan.md
 *
 * anchor 8건 (GV-1 ~ GV-8) — KoreanLaw MCP 검증 (2026-05-20) 부표 1 본문 기준.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import { GiftTaxValuationFormTable } from "@/components/calc/results/GiftTaxValuationFormTable";
import type {
  EstateItem,
  PropertyValuationResult,
  AssetCategory,
  ValuationMethod,
} from "@/lib/tax-engine/types/inheritance-gift.types";

function makeItem(
  id: string,
  category: AssetCategory,
  name = "테스트",
): EstateItem {
  return { id, category, name };
}

function makeVR(
  estateItemId: string,
  valuatedAmount: number,
  method: ValuationMethod = "market_value",
): PropertyValuationResult {
  return {
    estateItemId,
    method,
    valuatedAmount,
    breakdown: [],
    warnings: [],
  };
}

describe("GiftTaxValuationFormTable — 별지 제10호서식 부표 1", () => {
  it("GV-1: 현금 350M 1건 — ②=01 / ⑧=06 / ⑨=⑮=350M", () => {
    const item = makeItem("i1", "cash", "현금");
    render(
      <GiftTaxValuationFormTable
        valuationResults={[makeVR("i1", 350_000_000)]}
        estateItems={[item]}
        grossGiftValue={350_000_000}
        exemptAmount={0}
        aggregatedGiftValue={350_000_000}
      />,
    );

    const row1 = screen.getByTestId("row-data-1");
    expect(within(row1).getByTestId("col-property-class")).toHaveTextContent(
      "A11",
    );
    expect(within(row1).getByTestId("col-property-type")).toHaveTextContent(
      "01",
    );
    expect(within(row1).getByTestId("col-valuation-method")).toHaveTextContent(
      "06",
    );
    expect(within(row1).getByTestId("col-amount")).toHaveTextContent(
      "350,000,000",
    );

    expect(screen.getByTestId("row-9-gross")).toHaveTextContent("350,000,000");
    expect(screen.getByTestId("row-15-sum")).toHaveTextContent("350,000,000");
  });

  it("GV-2: 사용자 이미지 14 케이스 — ⑨=1B / ⑭=820M / ⑮=1.82B", () => {
    const item = makeItem("i1", "cash", "현금");
    render(
      <GiftTaxValuationFormTable
        valuationResults={[makeVR("i1", 1_000_000_000)]}
        estateItems={[item]}
        grossGiftValue={1_000_000_000}
        exemptAmount={0}
        aggregatedGiftValue={1_820_000_000}
      />,
    );
    expect(screen.getByTestId("row-9-gross")).toHaveTextContent(
      "1,000,000,000",
    );
    expect(screen.getByTestId("row-14-add")).toHaveTextContent("820,000,000");
    expect(screen.getByTestId("row-15-sum")).toHaveTextContent("1,820,000,000");
  });

  it("GV-3: 자산 3건 + 빈 행 7개 — tbody tr count = 10", () => {
    const items = [1, 2, 3].map((i) => makeItem(`i${i}`, "cash"));
    const vrs = items.map((it) => makeVR(it.id, 100_000_000));
    render(
      <GiftTaxValuationFormTable
        valuationResults={vrs}
        estateItems={items}
        grossGiftValue={300_000_000}
        exemptAmount={0}
        aggregatedGiftValue={300_000_000}
      />,
    );
    const tbody = screen.getByTestId("table-data-tbody");
    expect(tbody.querySelectorAll("tr")).toHaveLength(10);
  });

  it("GV-4: 자산 12건 — tbody tr count = 12 (10행 한계 초과 시 양식 확장)", () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      makeItem(`i${i + 1}`, "cash"),
    );
    const vrs = items.map((it) => makeVR(it.id, 50_000_000));
    render(
      <GiftTaxValuationFormTable
        valuationResults={vrs}
        estateItems={items}
        grossGiftValue={600_000_000}
        exemptAmount={0}
        aggregatedGiftValue={600_000_000}
      />,
    );
    const tbody = screen.getByTestId("table-data-tbody");
    expect(tbody.querySelectorAll("tr")).toHaveLength(12);
  });

  it("GV-5: 자기일관성 음수 가드 — gross<exempt 케이스도 ⑮ ≥ 0", () => {
    const item = makeItem("i1", "cash");
    render(
      <GiftTaxValuationFormTable
        valuationResults={[makeVR("i1", 100_000_000)]}
        estateItems={[item]}
        grossGiftValue={100_000_000}
        exemptAmount={200_000_000}
        aggregatedGiftValue={50_000_000}
      />,
    );
    expect(screen.getByTestId("row-10-exempt")).toHaveTextContent(
      "200,000,000",
    );
    expect(screen.getByTestId("row-15-sum")).toHaveTextContent("50,000,000");
    // ⑭ = aggregated − max(0, gross − exempt) = 50M − 0 = 50M
    expect(screen.getByTestId("row-14-add")).toHaveTextContent("50,000,000");
  });

  it("GV-6: 재산종류코드 매핑 — AssetCategory 실제 enum 9종", () => {
    const cases: Array<[AssetCategory, string]> = [
      ["cash", "01"],
      ["real_estate_land", "02"],
      ["real_estate_apartment", "05"],
      ["real_estate_building", "07"],
      ["listed_stock", "09"],
      ["unlisted_stock", "10"],
      ["financial", "11"],
      ["deposit", "12"],
      ["other", "12"],
    ];
    cases.forEach(([cat, code]) => {
      const item = makeItem(`i-${cat}`, cat);
      const { unmount } = render(
        <GiftTaxValuationFormTable
          valuationResults={[makeVR(item.id, 1_000_000)]}
          estateItems={[item]}
          grossGiftValue={1_000_000}
          exemptAmount={0}
          aggregatedGiftValue={1_000_000}
        />,
      );
      const row = screen.getByTestId("row-data-1");
      expect(within(row).getByTestId("col-property-type")).toHaveTextContent(
        code,
      );
      unmount();
    });
  });

  it("GV-7: 평가기준코드 매핑 — ValuationMethod 6종 + cash 자산 우선", () => {
    type Case = [AssetCategory, ValuationMethod, string];
    const cases: Case[] = [
      ["real_estate_land", "market_value", "01"],
      ["real_estate_land", "appraisal", "02"],
      ["real_estate_land", "similar_sales", "05"],
      ["real_estate_land", "standard_price", "08"],
      ["real_estate_land", "book_value", "08"],
      ["real_estate_land", "acquisition_cost", "08"],
      ["cash", "market_value", "06"], // cash는 method 무관 06
      ["cash", "standard_price", "06"],
    ];
    cases.forEach(([cat, method, code]) => {
      const item = makeItem(`i-${cat}-${method}`, cat);
      const { unmount } = render(
        <GiftTaxValuationFormTable
          valuationResults={[makeVR(item.id, 1_000_000, method)]}
          estateItems={[item]}
          grossGiftValue={1_000_000}
          exemptAmount={0}
          aggregatedGiftValue={1_000_000}
        />,
      );
      const row = screen.getByTestId("row-data-1");
      expect(within(row).getByTestId("col-valuation-method")).toHaveTextContent(
        code,
      );
      unmount();
    });
  });

  it("GV-8: ① 재산구분코드 — Phase 1은 모든 본문 행 A11", () => {
    const items = [
      makeItem("i1", "cash"),
      makeItem("i2", "real_estate_land"),
    ];
    const vrs = items.map((it) => makeVR(it.id, 100_000_000));
    render(
      <GiftTaxValuationFormTable
        valuationResults={vrs}
        estateItems={items}
        grossGiftValue={200_000_000}
        exemptAmount={0}
        aggregatedGiftValue={200_000_000}
      />,
    );
    [1, 2].forEach((n) => {
      const row = screen.getByTestId(`row-data-${n}`);
      expect(within(row).getByTestId("col-property-class")).toHaveTextContent(
        "A11",
      );
    });
  });

  it("⑪/⑫/⑬ 분리값 직접 매핑 — public*Exclusion 3 props", () => {
    const item = makeItem("i1", "cash");
    render(
      <GiftTaxValuationFormTable
        valuationResults={[makeVR("i1", 1_000_000_000)]}
        estateItems={[item]}
        grossGiftValue={1_000_000_000}
        exemptAmount={300_000_000}
        aggregatedGiftValue={700_000_000}
        publicInterestExclusion={50_000_000}
        publicTrustExclusion={30_000_000}
        disabledTrustExclusion={20_000_000}
      />,
    );
    // ⑩ = exempt − ⑪ − ⑫ − ⑬ = 300M − 50M − 30M − 20M = 200M
    expect(screen.getByTestId("row-10-exempt")).toHaveTextContent("200,000,000");
    expect(screen.getByTestId("row-11-public-interest")).toHaveTextContent(
      "50,000,000",
    );
    expect(screen.getByTestId("row-12-public-trust")).toHaveTextContent(
      "30,000,000",
    );
    expect(screen.getByTestId("row-13-disabled-trust")).toHaveTextContent(
      "20,000,000",
    );
  });
});
