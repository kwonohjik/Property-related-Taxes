/**
 * @vitest-environment jsdom
 *
 * UnlistedStockBesshiResultSection — 결과 화면 별지 출력 섹션 anchor (RV-1·3·4·5)
 *
 * Plan: docs/00-pm/inheritance-besshi-result-view-integration.plan.md
 * Design: docs/02-design/features/inheritance-besshi-result-view-integration.ui.design.md
 *
 * - RV-1: V2 자산 1건 → 섹션 + besshi-form-toggle 존재
 * - RV-3: V2 0건 → 섹션 미표시(null)
 * - RV-4: V2 2건 → toggle 2개 + 법인명 헤더
 * - RV-5: 간편평가(unlistedStockData)만 → 섹션 미표시 (R-7/F-5)
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { UnlistedStockBesshiResultSection } from "@/components/calc/results/UnlistedStockBesshiResultSection";
import type {
  EstateItem,
  UnlistedStockData,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

afterEach(() => cleanup());

// 최소 V2 정식평가 입력 (totalShares>0 — BesshiForm 가드 통과)
function makeV2Input(corpName: string): UnlistedStockValuationInput {
  return {
    corpName,
    businessStartDate: new Date("2000-01-01"),
    evaluationDate: new Date("2024-01-20"),
    faceValuePerShare: 5_000,
    totalShares: 50_000,
    ownedShares: 26_000,
    isRealEstateHeavy: false,
    fiscalYears: [
      { fiscalYearLabel: "2023", fiscalYearEndDate: new Date("2023-12-31"), taxableIncome: 76_842_660 },
      { fiscalYearLabel: "2022", fiscalYearEndDate: new Date("2022-12-31"), taxableIncome: 62_416_500 },
      { fiscalYearLabel: "2021", fiscalYearEndDate: new Date("2021-12-31"), taxableIncome: 50_000_000 },
    ],
    capitalChanges: [],
    netAssetValueRaw: {
      bsTotalAssets: 2_476_889_520,
      assetValuationDelta: 91_548_350,
      corpTaxReservedAmount: 0,
      paidInCapitalIncrease: 0,
      otherEarnedRights: 0,
      prepaidExpenses: 65_400_500,
      preGiftRetainedEarnings: 0,
      bsTotalLiabilities: 1_833_780_000,
      corporateTaxPayable: 32_627_890,
      farmingSurtax: 0,
      localIncomeTax: 3_262_780,
      dividendPayable: 0,
      retirementProvision: 445_785_000,
      otherProvision: 0,
      reserveExcluded: 0,
      allowanceExcluded: 301_770_000,
      deferredTaxAdjustment: 0,
    },
    isContinuousLossLastThreeYears: false,
    capitalizationRate: 0.1,
    isMaxShareholder: false,
    companySize: "small",
  };
}

function makeEstateItem(overrides: Partial<EstateItem>): EstateItem {
  return {
    id: overrides.id ?? "item-1",
    category: overrides.category ?? "unlisted_stock",
    name: overrides.name ?? "비상장주식",
    ...overrides,
  };
}

const simpleData: UnlistedStockData = {
  totalShares: 10_000,
  ownedShares: 5_000,
  weightedNetIncome: 0,
  netIncomeY1: 30_000_000,
  netIncomeY2: 25_000_000,
  netIncomeY3: 20_000_000,
  netAssetValue: 500_000_000,
  capitalizationRate: 0.1,
};

describe("[RV-1] V2 자산 1건 → 별지 섹션 렌더", () => {
  it("besshi-result-section + besshi-form-toggle 존재", () => {
    const items = [makeEstateItem({ id: "a", unlistedStockValuationV2: makeV2Input("㈜가") })];
    render(<UnlistedStockBesshiResultSection estateItems={items} />);
    expect(screen.getByTestId("besshi-result-section")).toBeTruthy();
    expect(screen.getAllByTestId("besshi-form-toggle")).toHaveLength(1);
  });

  it("헤더에 건수 1건 표기", () => {
    const items = [makeEstateItem({ id: "a", unlistedStockValuationV2: makeV2Input("㈜가") })];
    render(<UnlistedStockBesshiResultSection estateItems={items} />);
    expect(screen.getByTestId("besshi-result-section")).toHaveTextContent("1건");
  });
});

describe("[RV-3] V2 0건 → 섹션 미표시", () => {
  it("일반 재산만 → null (섹션 부재)", () => {
    const items = [
      makeEstateItem({ id: "land", category: "real_estate_land", name: "토지", marketValue: 100_000_000 }),
    ];
    render(<UnlistedStockBesshiResultSection estateItems={items} />);
    expect(screen.queryByTestId("besshi-result-section")).toBeNull();
  });

  it("빈 배열 → null", () => {
    render(<UnlistedStockBesshiResultSection estateItems={[]} />);
    expect(screen.queryByTestId("besshi-result-section")).toBeNull();
  });
});

describe("[RV-4] V2 2건 → 별지 2개 + 법인명 헤더", () => {
  it("toggle 2개", () => {
    const items = [
      makeEstateItem({ id: "a", unlistedStockValuationV2: makeV2Input("㈜가") }),
      makeEstateItem({ id: "b", unlistedStockValuationV2: makeV2Input("㈜나") }),
    ];
    render(<UnlistedStockBesshiResultSection estateItems={items} />);
    expect(screen.getAllByTestId("besshi-form-toggle")).toHaveLength(2);
  });

  it("다건 시 법인명 구분 헤더 2개 표시", () => {
    const items = [
      makeEstateItem({ id: "a", unlistedStockValuationV2: makeV2Input("㈜가") }),
      makeEstateItem({ id: "b", unlistedStockValuationV2: makeV2Input("㈜나") }),
    ];
    render(<UnlistedStockBesshiResultSection estateItems={items} />);
    const headers = screen.getAllByTestId("besshi-corp-header");
    expect(headers).toHaveLength(2);
    expect(headers[0]).toHaveTextContent("㈜가");
    expect(headers[1]).toHaveTextContent("㈜나");
    expect(screen.getByTestId("besshi-result-section")).toHaveTextContent("2건");
  });
});

describe("[RV-5] 간편평가(unlistedStockData)만 → 섹션 미표시 (R-7/F-5)", () => {
  it("간편평가 자산은 별지 미대상 (filter 자동 제외)", () => {
    const items = [
      makeEstateItem({ id: "simple", category: "unlisted_stock", name: "비상장(간편)", unlistedStockData: simpleData }),
    ];
    render(<UnlistedStockBesshiResultSection estateItems={items} />);
    expect(screen.queryByTestId("besshi-result-section")).toBeNull();
  });

  it("간편+정식 혼재 → 정식 1건만 렌더", () => {
    const items = [
      makeEstateItem({ id: "simple", category: "unlisted_stock", name: "간편", unlistedStockData: simpleData }),
      makeEstateItem({ id: "formal", category: "unlisted_stock", name: "정식", unlistedStockValuationV2: makeV2Input("㈜정식") }),
    ];
    render(<UnlistedStockBesshiResultSection estateItems={items} />);
    expect(screen.getByTestId("besshi-result-section")).toHaveTextContent("1건");
    expect(screen.getAllByTestId("besshi-form-toggle")).toHaveLength(1);
  });
});
