/**
 * U-15 — 비상장·기타자산 환산에 남은 `acquisitionStdMode = "post_listing"`
 *
 * 리뷰 `docs/review/unlisted-stock-valuation-review-2026-11-28.md` 「U-15」.
 * 「취득 후 상장」 라디오는 상장 3시장에서만 보인다(Step 2 — `isListedStockMarket`). 코스닥에서 그것을 고른 뒤
 * 시장을 비상장으로 바꾸면 값이 폼에 남는다. 종전 ④는 시장을 보지 않고 `acquiredBeforeListing = true`를 실어
 * 엔진이 §165⑤ 분기를 먼저 탔고 분모(상장일 이후 종가)가 없어 취득가액이 0이 됐다.
 *
 *   U15-1  화면 폼 → ④ → ⑫ → 엔진 — 비상장 + 잔존 post_listing = §165④ 보충평가(weighted_avg)
 *   U15-2  기타자산도 ④가 끊는다 · 결산서 어댑터(postListingDetail)도 타지 않는다
 *   U15-3  상장(코스닥)의 post_listing은 그대로 §165⑤ (회귀)
 *   U15-4  ⑫ 직접 API — 비상장 + acquiredBeforeListing = true 차단
 *
 * 공통 입력(2022-06-01 양도 · 8,000주 · 양도가 6,000,000,000):
 *   양도연도 순손익 150,000 / 순자산 200,000 → 170,000 · 취득연도 6,000 / 10,000 → 7,600 → 80% 하한 8,000
 *   취득가액 = 6e9 × 8,000 ÷ 170,000 = 282,352,941
 */

import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { validateStep2Domestic } from "@/lib/calc/stock-transfer-tax-validate-step2";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import { POST_LISTING_UNLISTED_MARKET_MESSAGE } from "@/lib/tax-engine/stock-transfer/listed-stock-market";

function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "잔존취득후상장법인",
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: "20",
    selfMarketCap: "0",
    totalIssuedShares: "40000",
    priorYearEndDate: "2021-12-31",
    acquisitionDate: "2010-01-01",
    transferDate: "2022-06-01",
    shareCount: "8000",
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: "6000000000",
    acquisitionMode: "estimated",
    transferYearNetIncomePerShare: "150000",
    transferYearNetAssetPerShare: "200000",
    acquisitionYearNetIncomePerShare: "6000",
    acquisitionYearNetAssetPerShare: "10000",
    filingType: "preliminary",
    filingDate: "2022-08-31",
    // 코스닥에서 「취득 후 상장」을 고른 흔적 — 시장을 바꿔도 남는다
    acquisitionStdMode: "post_listing",
    listingDate: "2015-03-02",
    ...o,
  } as StockTransferFormData;
}

function run(body: Record<string, unknown>) {
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success) return { issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
  const coerced = coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
  return { r: calculateStockTransferTax(buildEngineInput(coerced)) };
}

describe("U15-1: 비상장 + 잔존 post_listing → §165④ 보충평가 (화면 폼 → ④ → ⑫ → 엔진)", () => {
  it("종전 post_listing_conversion · 취득가액 0 · 결정세액 1,484,375,000", () => {
    const f = form();
    expect(validateStep2Domestic(f).filter((e) => e.severity === "error")).toEqual([]);
    const body = buildStockTransferApiBody(f) as Record<string, unknown>;
    expect(body.acquiredBeforeListing).toBe(false);
    expect(body.postListingDetail).toBeUndefined();
    const out = run(body);
    if (!out.r) throw new Error(JSON.stringify(out.issues));
    expect(out.r.valuationDetail?.method).toBe("weighted_avg");
    expect(out.r.acquisitionPrice).toBe(282_352_941);
    expect(out.r.determinedTax).toBe(1_413_626_760);
  });
});

describe("U15-2: 기타자산도 ④가 플래그를 끊는다 · 결산서 어댑터도 타지 않는다", () => {
  it.each(["simple", "full", "listing_only"] as const)("unlistedDetailMode %s", (unlistedDetailMode) => {
    for (const marketType of ["unlisted", "other_asset"] as const) {
      const body = buildStockTransferApiBody(form({ marketType, unlistedDetailMode })) as Record<string, unknown>;
      expect(body.acquiredBeforeListing).toBe(false);
      expect(body.postListingDetail).toBeUndefined();
    }
  });
});

describe("U15-3: 상장(코스닥) post_listing은 그대로 §165⑤", () => {
  it("acquiredBeforeListing = true", () => {
    const body = buildStockTransferApiBody(form({ marketType: "kosdaq" })) as Record<string, unknown>;
    expect(body.acquiredBeforeListing).toBe(true);
  });
});

describe("U15-4: ⑫ 직접 API — 비상장 + acquiredBeforeListing = true 차단", () => {
  it.each(["unlisted", "other_asset"] as const)("%s", (marketType) => {
    const body = { ...(buildStockTransferApiBody(form({ marketType })) as Record<string, unknown>), acquiredBeforeListing: true };
    const out = run(body);
    expect(out.issues).toContainEqual({ path: "acquiredBeforeListing", message: POST_LISTING_UNLISTED_MARKET_MESSAGE });
  });
  it("실가 취득이면 엔진이 플래그를 읽지 않으므로 막지 않는다", () => {
    const body = {
      ...(buildStockTransferApiBody(form({ acquisitionMode: "actual", perShareAcquisitionPrice: "10000" })) as Record<string, unknown>),
      acquiredBeforeListing: true,
    };
    const out = run(body);
    expect((out.issues ?? []).map((i) => i.path)).not.toContain("acquiredBeforeListing");
  });
});
