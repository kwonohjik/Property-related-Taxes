/**
 * U-14 — §165⑤ 분자·분모 「제4항에 따른 평가액」에 §165④3 순자산 단독 사유
 *
 * 리뷰 `docs/review/unlisted-stock-valuation-review-2026-11-28.md` 「U-14」.
 * 소득세법 시행령 §165⑤는 분자·분모를 「취득일 현재의 제4항에 따른 평가액」·「상장일 현재의 제4항에 따른 평가액」이라
 * 부른다. 제4항 3호(각 목 → 「제1호 각 목 외의 부분에도 불구하고 제1호나목의 계산식에 따라 평가한 가액」)도
 * 제4항이므로 그 쪽 평가는 순자산가치 단독(80% 하한 없음)이다. 종전 엔진은 두 쪽 모두 가중평균 + 80% 하한만 썼다.
 *
 * 공통(코스닥 · 2025-06-10 양도 · 1,000주 · 상장일 이후 1개월 종가평균 20,000 · 양도일 이전 1개월 종가평균 25,000):
 *   상장연도 순손익 30,000 / 순자산 10,000 → 18,000 + 4,000 = 22,000 (하한 8,000 미발동)
 *   취득연도 순손익      0 / 순자산  5,000 →      0 + 2,000 =  2,000 → 80% 하한 4,000
 *
 *   PL3-1 사유 없음(회귀)      : 분자 4,000 · 1주당 floor(20,000 × 4,000/22,000) = 3,636
 *   PL3-2 취득측 나목          : 분자 5,000 · floor(20,000 × 5,000/22,000) = 4,545
 *   PL3-3 취득측 나목 + 순손익 공란 : ⑧·⑫ 통과 · 같은 4,545
 *   PL3-4 상장일측 다목(주식 80%) : 분모 10,000 · floor(20,000 × 4,000/10,000) = 8,000
 *   PL3-5 연혁 — 2023.2.28. 이후 양도에 구 다목(3년 연속 결손) 상장일측 → ⑧·⑫ 차단
 *   PL3-6 ④ — 상장일측 사유는 취득 후 상장일 때만 싣는다 · normalize 종전 레코드 = 없음
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
import { normalizeStockFormData } from "@/lib/stores/calc-wizard-stock-normalize";
import { UNLISTED_MESSAGES } from "@/lib/tax-engine/stock-transfer/unlisted-messages";
import { STOCK } from "@/lib/tax-engine/legal-codes/stock";
import { calcPostListingConversion } from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import { toDate } from "@/lib/api/date-coerce";

const d = (s: string) => toDate(s, "test");

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
    netAssetOnlyReason: "",
    acquisitionNetAssetOnlyReason: "",
    listingNetAssetOnlyReason: "",
    ...o,
  } as StockTransferFormData;
}

function run(f: StockTransferFormData) {
  const step2 = validateStep2Domestic(f).filter((e) => e.severity === "error").map((e) => ({ field: e.field, message: e.message }));
  const body = buildStockTransferApiBody(f) as Record<string, unknown>;
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success)
    return { step2, issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
  const coerced = coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
  return { step2, issues: [], r: calculateStockTransferTax(buildEngineInput(coerced)) };
}
function ok(f: StockTransferFormData) {
  const out = run(f);
  if (!out.r) throw new Error(`blocked: ${JSON.stringify(out.issues)}`);
  expect(out.step2).toEqual([]);
  return out.r;
}

describe("PL3: §165⑤ 분자·분모의 §165④3 사유", () => {
  it("PL3-1 사유 없음 — 분자 가중평균 2,000 → 80% 하한 4,000 · 1주당 3,636 (회귀)", () => {
    const r = ok(form());
    expect(r.valuationDetail?.method).toBe("post_listing_conversion");
    expect(r.postListingDetail?.listingYearPerShareValue).toBe(22_000);
    expect(r.postListingDetail?.acquisitionYearPerShareValue).toBe(4_000);
    expect(r.postListingDetail?.detail?.floor80Applied).toEqual({ listing: false, acquisition: true });
    expect(r.postListingDetail?.finalPerShareValue).toBe(3_636);
    expect(r.postListingDetail?.netAssetOnlyReason).toBeUndefined();
    expect(r.acquisitionPrice).toBe(Math.floor((30_000_000 * 3_636) / 25_000));
  });

  it("PL3-2 취득측 나목(사업개시 후 1년 미만) — 분자 순자산가치 단독 5,000 · 1주당 4,545", () => {
    const r = ok(form({ acquisitionNetAssetOnlyReason: "no_business_or_short_or_closed" }));
    expect(r.postListingDetail?.listingYearPerShareValue).toBe(22_000);
    expect(r.postListingDetail?.acquisitionYearPerShareValue).toBe(5_000);
    expect(r.postListingDetail?.detail?.floor80Applied).toEqual({ listing: false, acquisition: false });
    expect(r.postListingDetail?.finalPerShareValue).toBe(4_545);
    expect(r.postListingDetail?.netAssetOnlyReason).toEqual({ acquisition: "no_business_or_short_or_closed" });
    expect(r.postListingDetail?.appliedRules).toContain(
      `${STOCK.ENFORCEMENT_DECREE_165_4_3_NA_PRE_BUSINESS} — 취득일 현재 순자산가치 단독`,
    );
    expect(r.acquisitionPrice).toBe(Math.floor((30_000_000 * 4_545) / 25_000));
  });

  it("PL3-3 취득측 사유 + 취득연도 순손익 공란 — ⑧·⑫ 통과 · 같은 값", () => {
    const r = ok(form({ acquisitionNetAssetOnlyReason: "no_business_or_short_or_closed", acquisitionYearNetIncomePerShare: "" }));
    expect(r.postListingDetail?.finalPerShareValue).toBe(4_545);
  });

  it("PL3-4 상장일측 다목(주식등 80% 이상) — 분모 순자산가치 단독 10,000 · 1주당 8,000", () => {
    const r = ok(form({ listingNetAssetOnlyReason: "stock_holding_company", listingYearNetIncomePerShare: "" }));
    expect(r.postListingDetail?.listingYearPerShareValue).toBe(10_000);
    expect(r.postListingDetail?.acquisitionYearPerShareValue).toBe(4_000);
    expect(r.postListingDetail?.finalPerShareValue).toBe(8_000);
    expect(r.postListingDetail?.netAssetOnlyReason).toEqual({ listing: "stock_holding_company" });
  });

  it("PL3-5 연혁 — 2025 양도에 구 다목(3년 연속 결손)은 상장일측·취득측 모두 ⑧·⑫ 차단", () => {
    const out = run(form({ listingNetAssetOnlyReason: "consecutive_loss_3y", acquisitionNetAssetOnlyReason: "consecutive_loss_3y" }));
    expect(out.step2).toContainEqual({ field: "listingNetAssetOnlyReason", message: UNLISTED_MESSAGES.NET_ASSET_ONLY_REASON_ERA });
    expect(out.step2).toContainEqual({ field: "acquisitionNetAssetOnlyReason", message: UNLISTED_MESSAGES.NET_ASSET_ONLY_REASON_ERA });
    expect(out.issues).toContainEqual({ path: "listingNetAssetOnlyReason", message: UNLISTED_MESSAGES.NET_ASSET_ONLY_REASON_ERA });
    expect(out.issues).toContainEqual({ path: "acquisitionNetAssetOnlyReason", message: UNLISTED_MESSAGES.NET_ASSET_ONLY_REASON_ERA });
  });

  it("PL3-6 ④ — 상장일측 사유는 취득 후 상장일 때만 싣는다 · 종전 레코드는 없음", () => {
    const listed = buildStockTransferApiBody(form({ listingNetAssetOnlyReason: "stock_holding_company" })) as Record<string, unknown>;
    expect(listed.listingNetAssetOnlyReason).toBe("stock_holding_company");
    const monthly = buildStockTransferApiBody(
      form({ acquisitionStdMode: "monthly_avg", acquisitionDatePriceAvg1Month: "10000", listingNetAssetOnlyReason: "stock_holding_company" }),
    ) as Record<string, unknown>;
    expect(monthly.listingNetAssetOnlyReason).toBeUndefined();
    const legacy = { ...form() } as Record<string, unknown>;
    delete legacy.listingNetAssetOnlyReason;
    expect(normalizeStockFormData(legacy).listingNetAssetOnlyReason).toBe("");
  });
});

describe("PL3 리뷰 후속", () => {
  it("PL3-7 (M-1) 종전 레코드(취득 사유 키 없음) + 취득 후 상장 — 양도측 사유를 분자로 이어받지 않는다 · 과거 세액 불변", () => {
    const legacy = { ...form({ netAssetOnlyReason: "no_business_or_short_or_closed" }) } as Record<string, unknown>;
    delete legacy.acquisitionNetAssetOnlyReason;
    delete legacy.listingNetAssetOnlyReason;
    const n = normalizeStockFormData(legacy);
    expect(n.acquisitionNetAssetOnlyReason).toBe("");
    expect(ok(n).postListingDetail?.finalPerShareValue).toBe(3_636);
    // 취득 후 상장이 아닌 종전 레코드는 종전대로 이어받는다(계획서 §14)
    const unlisted = { ...legacy, marketType: "unlisted", acquisitionStdMode: "" } as Record<string, unknown>;
    expect(normalizeStockFormData(unlisted).acquisitionNetAssetOnlyReason).toBe("no_business_or_short_or_closed");
  });

  it("PL3-8 (L-1) §81④1호 월할 가산 + 상장일측 사유 — 전전사업연도도 순자산가치 단독(순손익 공란 허용)", () => {
    const r = calcPostListingConversion({
      transferDate: d("2025-06-10"),
      acquisitionDate: d("2022-01-10"),
      listingDate: d("2022-05-02"),
      listingDatePriceAvg1Month: 20_000,
      listingYearNetAssetPerShare: 5_000,
      acquisitionYearNetAssetPerShare: 5_000,
      listingNetAssetOnlyReason: "no_business_or_short_or_closed",
      acquisitionNetAssetOnlyReason: "no_business_or_short_or_closed",
      prePriorYearNetAssetPerShare: 3_000,
      postListingDetail: { unlistedDetailMode: "simple", monthlyAccrualToggle: true },
    } as unknown as Parameters<typeof calcPostListingConversion>[0]);
    // 보정 상장일 평가액 = 5,000 + (5,000 − 3,000) × 4/12 = 5,666 · 1주당 floor(20,000 × 5,000 / 5,666) = 17,649
    expect(r.monthlyAccrualDetail?.prePriorYearPerShareValue).toBe(3_000);
    expect(r.monthlyAccrualDetail?.adjustedListingYearPerShareValue).toBe(5_666);
    expect(r.finalPerShareValue).toBe(17_649);
  });
});
