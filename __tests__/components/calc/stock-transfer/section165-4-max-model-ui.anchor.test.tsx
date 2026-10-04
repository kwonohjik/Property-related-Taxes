/**
 * @vitest-environment jsdom
 *
 * ⑤⑦ 2007.2.27. 이전 양도 — §165④ 평가액은 max(순손익가치, 순자산가치) · 2000.4.2. 이전은 미지원 (S-1c-3 2단계)
 *
 * 계획서 `docs/00-pm/stock-165-4-valuation-followups.plan.md` §11
 *
 * 가중치가 없는 산식을 «× 0/5»나 «× 3/5»로 펼치면 화면의 산수가 엔진과 어긋난다. 2:3 반전 토글도 의미가 없다.
 *
 *   UI-MX-1  입력 — 비상장 보충평가 산식 안내 · 반전 토글 (2006 / 2007-02-28 / 1997)
 *   UI-MX-2  입력 — 상장 후 환산 카드: 반전 토글 숨김 · 미리보기 산식
 *   UI-MX-3  결과 — 사례 49 산식 카드
 *   UI-MX-4  결과 — 취득일 거래정지 산식 분해
 *   UI-MX-5  결과 화면 배선 — 엔진 결과 → `StockTransferTaxResultView` → 사례 49 카드
 */

import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EstimatedUnlistedBlock } from "@/components/calc/stock-transfer/EstimatedUnlistedBlock";
import { PostListingValuationCard } from "@/components/calc/stock-transfer/PostListingValuationCard";
import { PostListingFormulaPreview } from "@/components/calc/stock-transfer/PostListingFormulaPreview";
import { CaseFortyNineFormulaCard } from "@/components/calc/stock-transfer/CaseFortyNineFormulaCard";
import { EstimatedValuationBreakdown } from "@/components/calc/results/StockTransferTaxResultViewHelpers";
import { UNLISTED_MESSAGES } from "@/lib/tax-engine/stock-transfer/unlisted-messages";
import { createInitialStockFormData, type StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { StockTransferTaxResultView } from "@/components/calc/results/StockTransferTaxResultView";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";

afterEach(cleanup);

function formOf(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "max연혁법인",
    marketType: "unlisted",
    transferDate: "2006-06-01",
    ...o,
  };
}
const toggle = () => screen.queryByTestId("reversal-corp-toggle");

describe("UI-MX-1: 비상장 보충평가 산식 안내 · 반전 토글", () => {
  it("2006 양도 → 「중 큰 금액」 안내 · 가중평균·80% 하한 문구 없음 · 반전 토글 없음", () => {
    const { container } = render(<EstimatedUnlistedBlock form={formOf()} onChange={vi.fn()} />);
    expect(container.textContent).toContain("평가액 = 순손익가치·순자산가치 중 큰 금액");
    expect(container.textContent).toContain(UNLISTED_MESSAGES.MAX_MODEL_CAPTION);
    expect(container.textContent).not.toContain("80% 하한 없음");
    expect(toggle()).toBeNull();
  });
  it("대조 — 2007-02-28 양도 → 가중평균 안내 · 반전 토글 있음", () => {
    const { container } = render(<EstimatedUnlistedBlock form={formOf({ transferDate: "2007-02-28" })} onChange={vi.fn()} />);
    expect(container.textContent).toContain("가중평균");
    expect(container.textContent).not.toContain(UNLISTED_MESSAGES.MAX_MODEL_CAPTION);
    expect(toggle()).not.toBeNull();
  });
  it("1997 양도 → 미지원 안내", () => {
    render(<EstimatedUnlistedBlock form={formOf({ transferDate: "1997-06-01" })} onChange={vi.fn()} />);
    expect(screen.getByTestId("section165-4-era-unsupported").textContent).toBe(
      UNLISTED_MESSAGES.SECTION_165_4_ERA_UNSUPPORTED,
    );
  });
});

describe("UI-MX-2: 상장 후 환산", () => {
  const POST: Partial<StockTransferFormData> = {
    marketType: "kosdaq",
    acquisitionStdMode: "post_listing",
    unlistedDetailMode: "simple",
    listingDatePriceAvg1Month: "1000",
    listingYearNetIncomePerShare: "100",
    listingYearNetAssetPerShare: "200",
    acquisitionYearNetIncomePerShare: "30",
    acquisitionYearNetAssetPerShare: "40",
    shareCount: "10",
  };
  it("2006 양도 → 반전 토글 없음 (대조 2007-02-28 있음)", () => {
    render(<PostListingValuationCard form={formOf(POST)} onChange={vi.fn()} />);
    expect(toggle()).toBeNull();
    cleanup();
    render(<PostListingValuationCard form={formOf({ ...POST, transferDate: "2007-02-28" })} onChange={vi.fn()} />);
    expect(toggle()).not.toBeNull();
  });
  it("미리보기 — 「중 큰 금액」으로 펼치고 가중치 분수를 쓰지 않는다 · 환산 = 1,000 × 40/200 = 200", () => {
    const { container } = render(<PostListingFormulaPreview form={formOf(POST)} />);
    const text = container.textContent ?? "";
    expect(text).toContain("= 순손익가치 100·순자산가치 200 중 큰 금액 = 200");
    expect(text).toContain("= 순손익가치 30·순자산가치 40 중 큰 금액 = 40");
    expect(text).not.toContain("3/5");
    expect(text).toContain(UNLISTED_MESSAGES.MAX_MODEL_CAPTION);
    expect(text).toContain("1주당 취득기준시가 = 종가평균 1,000 × 0.20000 = 200");
  });
});

describe("UI-MX-3: 결과 — 사례 49 산식 카드", () => {
  it("isMaxModel → 「중 큰 금액」 · 가중평균 분수 없음", () => {
    const { container } = render(
      <CaseFortyNineFormulaCard
        transferPrice={6_000_000_000}
        acqFaceValuePerShare={12_500}
        shareCount={8_000}
        niPerShare={150_000}
        naPerShare={200_000}
        isHeavyRE={false}
        isMaxModel
        isNetAssetOnly={false}
        weighted={200_000}
        transferStdPriceAfterFloor={200_000}
        floor80Applied={false}
        acquisitionStdPriceTotal={100_000_000}
        acquisitionPrice={375_000_000}
        expenses={1_000_000}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("양도기준시가 = 순손익가치 150,000·순자산가치 200,000 중 큰 금액 = 200,000");
    expect(text).not.toContain("가중평균");
  });
});

describe("UI-MX-4: 결과 — 취득일 거래정지 산식 분해", () => {
  it("section165_4Model max → 「중 큰 금액」 (가중치 분수 아님)", () => {
    const result = {
      acquisitionPrice: 300_000_000,
      appliedRules: [],
      valuationDetail: {
        method: "halt_acquisition_conversion",
        netAssetFloorApplied: false,
        finalPerShareValue: 10_000,
        conversionAcqStdPerShare: 10_000,
        conversionTransferStd: 200_000,
        niPerShare: 6_000,
        naPerShare: 10_000,
        isHeavyRE: false,
        section165_4Model: "max",
      },
    } as unknown as StockTransferResult;
    const { container } = render(<EstimatedValuationBreakdown result={result} />);
    const text = container.textContent ?? "";
    expect(text).toContain("취득시 보충평가액 (1주당) = 순손익가치 6,000·순자산가치 10,000 중 큰 금액 = 10,000");
    expect(text).not.toContain("순손익가치 6,000 × 3");
  });
});

describe("UI-MX-5: 결과 화면 배선 — 사례 49 카드까지 max가 전달된다", () => {
  it("2006 양도 · 장부분실 → 카드에 「중 큰 금액」 (prop 배선을 끊으면 가중평균으로 그린다)", () => {
    // 폼 → ④ → ⑫ → ⑭ → 엔진 (MX-5와 같은 입력 · 375,000,000)
    const f = formOf({
      isMajorShareholder: true,
      selfShareRatio: "20",
      selfMarketCap: "0",
      totalIssuedShares: "40000",
      priorYearEndDate: "2005-12-31",
      acquisitionDate: "1990-01-01",
      shareCount: "8000",
      acquisitionCause: "purchase",
      transferPriceMode: "actual",
      transferActualInputMode: "total",
      transferTotalPrice: "6000000000",
      acquisitionMode: "estimated",
      transferYearNetIncomePerShare: "150000",
      transferYearNetAssetPerShare: "200000",
      acqFaceValueOnly: true,
      acqFaceValuePerShare: "12500",
      filingType: "preliminary",
      filingDate: "2006-08-31",
    });
    const parsed = addStockRefines(stockTransferInputSchema).safeParse(buildStockTransferApiBody(f));
    if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.path.join(".")).join(", "));
    const r = calculateStockTransferTax(
      buildEngineInput(coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS])),
    );
    expect(r.acquisitionPrice).toBe(375_000_000);
    expect(r.valuationDetail?.section165_4Model).toBe("max");
    render(<StockTransferTaxResultView result={r} shareCount={8_000} acqFaceValueOnly />);
    const card = screen.getByTestId("case49-formula-card");
    expect(card.textContent).toContain("중 큰 금액 = 200,000");
    expect(card.textContent).not.toContain("가중평균");
  });
});
