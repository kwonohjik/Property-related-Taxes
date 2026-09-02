/**
 * ② 일자별 입력 배너 — 폼 → ④ → ⑨⑫ Zod → ⑭ route → 엔진 result 전 계층 배관
 *
 * 계획서 자가검토 **D-5**: ①(양도 당시 기준시가)은 결과 화면에 「✓ 일자별 입력 모드」
 * 배너가 뜨는데 ②(상장일 이후 1개월 종가)에는 없어, 사용자가 결과만 보고
 * **②를 일자별로 넣었는지 알 수 없었다.**
 *
 * ⚠️ 이 축은 «표시용 메타»라 산식에 영향이 없다 — 그래서 **누락돼도 세액이 안 바뀐다**.
 *    세액 anchor로는 절대 안 잡힌다. 배관 각 층을 직접 걸어야 한다.
 *
 *   LDB-1  ④ API 변환이 `listingStdInputMode`를 body에 싣는다
 *   LDB-2  ⑫⑭를 지나 엔진 result의 `valuationDetail.listingDailyModeUsed`가 true가 된다
 *   LDB-3  direct면 false다 (LDB-2의 음성 대조군 — 「항상 true」 구현을 배제)
 *   LDB-4  배너가 읽는 평균은 엔진이 실제로 §165⑤ 첫 항으로 쓴 값과 **같은 출처**다
 *
 * 🔑 엔진을 직접 호출하는 anchor는 ④의 strip을 **구조적으로 볼 수 없다**
 *    ([[feedback_leaf_anchor_skips_zod_layer]]) — 그래서 `stock-api-plumbing-strip`과
 *    같은 full-stack 해네스를 쓴다.
 */

import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import {
  stockTransferInputSchema,
  addStockRefines,
} from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/** route.ts와 같은 순서로 전 계층을 태운다 */
function runFullStack(
  form: StockTransferFormData,
): { blocked: true; issues: string[] } | { blocked: false; result: StockTransferResult; body: Record<string, unknown> } {
  const body = buildStockTransferApiBody(form);
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success) return { blocked: true, issues: parsed.error.issues.map((i) => i.message) };
  const coerced = coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
  return { blocked: false, result: calculateStockTransferTax(buildEngineInput(coerced)), body };
}

/** 상장일 2023-06-01 이후 거래일 3일 — 평균 10,000 */
const DATES = ["2023-06-01", "2023-06-02", "2023-06-05"];
const CLOSES = ["10000", "10000", "10000"];

function postListingForm(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "테스트",
    marketType: "kosdaq",
    isMajorShareholder: true,
    selfShareRatio: "60",
    selfMarketCap: "2000000000",
    priorYearEndDate: "2024-12-31",
    acquisitionDate: "2020-01-01",
    transferDate: "2025-06-01",
    shareCount: "5000",
    totalIssuedShares: "1000000",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: "20000",
    transferTotalPrice: "",
    filingType: "preliminary",
    filingDate: "2025-08-31",
    acquisitionMode: "estimated",
    acquiredBeforeListing: true,
    unlistedDetailMode: "simple",
    listingDate: "2023-06-01",
    transferDatePriceAvg1Month: "20000",
    listingYearNetIncomePerShare: "5000",
    listingYearNetAssetPerShare: "5000",
    acquisitionYearNetIncomePerShare: "4000",
    acquisitionYearNetAssetPerShare: "4000",
    ...o,
  } as StockTransferFormData;
}

/** daily — 단일 숫자 칸은 «비워 둔다»(화면에도 없다). 값은 표에서 파생된다. */
const dailyForm = (o: Partial<StockTransferFormData> = {}) =>
  postListingForm({
    listingStdInputMode: "daily",
    listingDatePriceAvg1Month: "",
    listingPriceDates: DATES,
    listingPriceClosing: CLOSES,
    ...o,
  });

describe("LDB — ② 일자별 입력 배너 배관 (D-5)", () => {
  it("LDB-1: ④가 listingStdInputMode를 body에 싣는다", () => {
    const body = buildStockTransferApiBody(dailyForm());
    expect(body.listingStdInputMode).toBe("daily");
    // 값 자체는 표에서 파생돼 함께 실린다 (resolveListingClosingAvg)
    expect(body.listingDatePriceAvg1Month).toBe(10_000);
  });

  it("LDB-2: ⑫⑭를 지나 엔진 result가 listingDailyModeUsed=true를 echo한다", () => {
    const run = runFullStack(dailyForm());
    expect(run.blocked).toBe(false);
    if (run.blocked) return;
    expect(run.result.valuationDetail?.listingDailyModeUsed).toBe(true);
  });

  it("LDB-3: direct면 false다 (「항상 true」 구현 배제 — 음성 대조군)", () => {
    const run = runFullStack(
      postListingForm({ listingStdInputMode: "direct", listingDatePriceAvg1Month: "10000" }),
    );
    expect(run.blocked).toBe(false);
    if (run.blocked) return;
    expect(run.result.valuationDetail?.listingDailyModeUsed).toBe(false);
  });

  /**
   * 🔴 **이 anchor가 실제 결함을 잡았다** (2026-09-02).
   *
   * `buildStockTransferApiBody`는 simple 모드에서 adapter를 **호출하지 않는다**
   * (`:400`이 listing_only·full 게이트). 그래서 ②의 daily 모드가 «칸을 비워 두는 것이
   * 정상»인데도 body에 아무것도 안 실려 엔진이 `undefined`를 받았고,
   * **취득가액이 조용히 0**이 됐다 — 화면 미리보기는 파생값 10,000을 보여주는 채로.
   *
   * 세액이 «달라지는» 축이므로 배너 anchor(LDB-1~4)와 달리 이건 회귀 안전망이다.
   */
  it("LDB-5: simple+daily의 취득가액이 같은 평균의 direct와 «일치»한다 (0으로 무너지지 않는다)", () => {
    const daily = runFullStack(dailyForm());
    const direct = runFullStack(
      postListingForm({ listingStdInputMode: "direct", listingDatePriceAvg1Month: "10000" }),
    );
    expect(daily.blocked).toBe(false);
    expect(direct.blocked).toBe(false);
    if (daily.blocked || direct.blocked) return;
    expect(direct.result.acquisitionPrice).toBeGreaterThan(0);   // 대조군이 살아 있는지 먼저
    expect(daily.result.acquisitionPrice).toBe(direct.result.acquisitionPrice);
    expect(daily.result.postListingDetail?.finalPerShareValue).toBe(
      direct.result.postListingDetail?.finalPerShareValue,
    );
  });

  it("LDB-4: 배너가 읽는 평균은 엔진이 §165⑤ 첫 항으로 쓴 값과 같은 출처다", () => {
    const run = runFullStack(dailyForm());
    expect(run.blocked).toBe(false);
    if (run.blocked) return;
    // 배너는 `postListingDetail.listingClosingAvg1Month`를 읽는다 — 사본을 두지 않았다
    expect(run.result.postListingDetail?.listingClosingAvg1Month).toBe(10_000);
  });
});
