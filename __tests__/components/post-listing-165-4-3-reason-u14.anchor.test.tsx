/**
 * U-14 ⑤·⑦ — 취득 후 상장 카드의 §165④3 사유 칸 · 결과 카드의 순자산가치 단독 줄 (+ U-15 ⑤ 표시 조건)
 *
 *   PLU-1 ⑤ 카드에 분모(상장일 현재)·분자(취득일 현재) 사유 칸이 있다
 *   PLU-2 ⑤ 사유를 고른 쪽의 1주당 순손익가치 칸은 숨는다(엔진이 쓰지 않는다)
 *   PLU-3 ⑤ 미리보기 [3]이 순자산가치 단독 5,000을 보인다
 *   PLU-4 ⑦ 결과 카드 — 취득연도 1주당 평가액 = 순자산가치 단독 (소득세법 시행령 §165④3 나목)
 *   PLU-5 U-15 ⑤ — 비상장으로 바꾸면 잔존 post_listing이어도 취득 후 상장 카드가 없다
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step2 } from "@/app/calc/stock-transfer-tax/steps/Step2";
import { PostListingDetailCard } from "@/components/calc/results/PostListingDetailCard";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";

afterEach(cleanup);

function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "취득후상장법인",
    marketType: "kosdaq",
    isMajorShareholder: true,
    selfShareRatio: "20",
    selfMarketCap: "10000000000",
    totalIssuedShares: "40000",
    priorYearEndDate: "2024-12-31",
    acquisitionDate: "2018-03-01",
    transferDate: "2025-06-10",
    shareCount: "1000",
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: "30000000",
    acquisitionMode: "estimated",
    acquisitionStdMode: "post_listing",
    unlistedDetailMode: "simple",
    simpleValueInputMode: "direct",
    listingStdInputMode: "direct",
    listingDate: "2022-05-02",
    listingDatePriceAvg1Month: "20000",
    transferDatePriceAvg1Month: "25000",
    listingYearNetIncomePerShare: "30000",
    listingYearNetAssetPerShare: "10000",
    acquisitionYearNetIncomePerShare: "0",
    acquisitionYearNetAssetPerShare: "5000",
    filingType: "preliminary",
    filingDate: "2025-08-31",
    ...o,
  } as StockTransferFormData;
}
const noop = () => {};

describe("U-14 ⑤ 취득 후 상장 카드", () => {
  it("PLU-1 분모·분자 사유 칸", () => {
    render(<Step2 form={form()} onChange={noop} />);
    expect(screen.getByText(/상장일 현재 순자산 단독 평가 사유/)).toBeTruthy();
    expect(screen.getByText(/취득일 현재 순자산 단독 평가 사유/)).toBeTruthy();
  });

  it("PLU-2·3 취득측 사유 — 취득연도 순손익 칸 숨김 · 미리보기 순자산가치 단독 5,000", () => {
    render(<Step2 form={form({ acquisitionNetAssetOnlyReason: "no_business_or_short_or_closed" })} onChange={noop} />);
    expect(screen.queryByText("취득일 직전 사업연도 1주당 순손익가치")).toBeNull();
    expect(screen.getByText("상장일 직전 사업연도 1주당 순손익가치")).toBeTruthy();
    const preview = screen.getByText("환산취득가 미리보기").parentElement!;
    expect(preview.textContent).toContain("순자산가치 단독 — 소득세법 시행령 §165④3");
    expect(preview.textContent).toContain("4,545");
  });

  it("PLU-5 U-15 — 비상장 + 잔존 post_listing이면 취득 후 상장 카드가 없다", () => {
    render(<Step2 form={form({ marketType: "unlisted" })} onChange={noop} />);
    expect(screen.queryByText(/취득 후 상장 — 환산취득가/)).toBeNull();
    expect(screen.queryByText(/상장일 현재 순자산 단독 평가 사유/)).toBeNull();
  });
});

describe("U-14 ⑦ 결과 카드", () => {
  it("PLU-4 취득연도 1주당 평가액 = 순자산가치 단독", () => {
    const body = buildStockTransferApiBody(form({ acquisitionNetAssetOnlyReason: "no_business_or_short_or_closed" }));
    const parsed = addStockRefines(stockTransferInputSchema).parse(body);
    const r = calculateStockTransferTax(buildEngineInput(coerceDates(parsed as Record<string, unknown>, [...STOCK_DATE_FIELDS])));
    const { container } = render(<PostListingDetailCard result={r} />);
    const text = container.textContent ?? "";
    expect(text).toContain("취득연도 1주당 평가액 = 순자산가치 단독 5,000 = 5,000");
    expect(text).toContain("소득세법 시행령 §165④3 나목 — 가중평균·80% 하한 대신 순자산가치");
    expect(text).toContain("상장연도 1주당 가중평균");
    expect(text).toContain("4,545");
  });
});
