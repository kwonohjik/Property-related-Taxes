/**
 * 코스피 거래정지는 §165④ 보충평가로 가지 않는다 (영 §165③ 시장 범위)
 *
 * ## 법문
 *
 * - 법 §99①3 — 「§94①3**가목**에 따른 주식등(**대통령령으로 정하는 주권상장법인**의 주식등은
 *   대통령령으로 정하는 것만 해당한다) … 상증법 §63①1가목을 준용하여 평가한 가액.
 *   이 경우 "평가기준일 이전·이후 각 2개월"은 "양도일·취득일 이전 1개월"로 본다」
 * - 영 §165③ — 「"대통령령으로 정하는 주권상장법인"이란 각각 **코스닥시장 또는 코넥스시장**에
 *   주권을 상장한 법인을 말하며, … "대통령령으로 정하는 것"이란 **상증령 §52의2③**에 해당하는 것」
 * - 상증령 §52의2③ — 「…**매매거래가 정지되거나 관리종목으로 지정된 기간**의 일부 또는 전부가
 *   포함되는 주식등…**을 제외한** 주식등」
 * - 법 §99①4 **전단** — 「**제3호에 따른 대통령령으로 정하는 주권상장법인의 주식등 중 제3호에
 *   해당하지 아니하는 것**과 **§94①3나목**에 따른 주식등」 → 보충적 평가(영 §165④)
 *
 * ## 왜 코스피는 §165④로 갈 수 없는가 — 두 논거
 *
 * **① 공백 논거.** §99①4 전단의 대상은 ⓐ「코스닥·코넥스 상장주 중 3호 비해당」 + ⓑ「§94①3
 * **나목**(주권비상장법인)」 둘뿐이다. 코스피 상장주식은 §94①3**가목**이라 ⓐ도 ⓑ도 아니다.
 * 만약 코스피 거래정지주가 §99①3에서도 빠진다면 **§99① 어느 호에도 속하지 않아 기준시가
 * 산정 근거가 사라진다**. §99①은 「기준시가는 다음 각 호에서 정하는 바에 따른다」로 망라적이고
 * §99③의 보충 위임에도 주식 공백을 메우는 호가 없다 ⇒ 그 해석은 성립 불가.
 *
 * **② 잉여 논거.** 상증법 §63①1가목 **준용만으로** 상증령 §52의2③ 필터가 딸려온다면,
 * 영 §165③이 그 필터를 「각각 코스닥시장 또는 코넥스시장」에 **한정해** 지정한 문언이 잉여가 된다.
 *
 * ⇒ **코스피 상장주식은 거래정지·관리종목이어도 §99①3(1개월 종가평균) 그대로다.**
 *
 * ## 현행 결함 (수정 전 실측 — 5억 양도·1만주)
 *
 * | 경로 | 취득가액 | 개산공제 기준 | method |
 * |---|---|---|---|
 * | §99①3 종가평균 (법정) | 200,000,000 | 200,000,000 | monthly_avg_listed |
 * | halt_transfer → §165④ | 204,166,666 | 196,000,000 | weighted_avg |
 * | halt_acquisition → §165④ | 196,000,000 | 196,000,000 | halt_acquisition_conversion |
 *
 * ⑤·⑧·④·엔진 **네 층 어디에도 시장 게이트가 없었다**.
 *
 * ⚠️ 해석례는 찾지 못했다 — 국세청 법령해석·조세심판원에서 「관리종목」·「거래정지」 ×
 *    「기준시가」로 검색해 **0건**. 없다는 증명이 아니라 검색 실패이며, 위 두 문리 논거로 판정한다.
 *
 * KH-1~3  코스피는 halt 를 고를 수 없다 (⑧·⑫·④)
 * KH-4~5  코스닥·코넥스는 종전대로 §165④ (구별력 짝 — 좁히기가 이웃을 먹지 않았는지)
 */

import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { validateStep2Domestic } from "@/lib/calc/stock-transfer-tax-validate-step2";
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

function runFullStack(
  form: StockTransferFormData,
): { blocked: true; issues: string[] } | { blocked: false; result: StockTransferResult; body: Record<string, unknown> } {
  const body = buildStockTransferApiBody(form);
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success) {
    return { blocked: true, issues: parsed.error.issues.map((i) => i.message) };
  }
  const coerced = coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
  return { blocked: false, result: calculateStockTransferTax(buildEngineInput(coerced)), body };
}

/** 상장 + 환산취득가. 종가평균(§99①3)·보충평가(§165④) 입력을 **둘 다** 채워 경로만 가른다. */
function listedForm(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "게이트테스트",
    marketType: "kospi",
    securityCode: "005930",
    isMajorShareholder: true,
    selfShareRatio: "60",
    selfMarketCap: "20000000000",
    priorYearEndDate: "2024-12-31",
    acquisitionDate: "2015-03-15",
    transferDate: "2025-02-26",
    shareCount: "10000",
    totalIssuedShares: "1000000",
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: "500000000",
    acquisitionMode: "estimated",
    acquisitionStdMode: "monthly_avg",
    transferStdInputMode: "direct",
    transferDatePriceAvg1Month: "50000",
    acquisitionDatePriceAvg1Month: "20000",
    acquisitionYearNetIncomePerShare: "18000",
    acquisitionYearNetAssetPerShare: "22000",
    transferYearNetIncomePerShare: "40000",
    transferYearNetAssetPerShare: "60000",
    filingType: "preliminary",
    filingDate: "2025-08-31",
    ...o,
  } as StockTransferFormData;
}

const errorsOf = (form: StockTransferFormData) =>
  validateStep2Domestic(form).filter((e) => e.severity === "error");

describe("KH — 코스피 거래정지는 §165④로 가지 않는다 (영 §165③ 코스닥·코넥스 한정)", () => {
  it("KH-1: ⑧ — 코스피에서 양도일·취득일 거래정지 선택은 차단된다", () => {
    for (const stdMode of ["halt_transfer", "halt_acquisition"] as const) {
      const errs = errorsOf(listedForm({ acquisitionStdMode: stdMode }));
      expect(
        errs.some((e) => e.field === "acquisitionStdMode"),
        `stdMode=${stdMode}`,
      ).toBe(true);
    }
  });

  it("KH-2: ⑫ — API 직접 호출도 Zod 가 거부한다 (세액이 갈리므로 UI 게이트만으로 부족)", () => {
    for (const flag of ["tradingHaltAtTransfer", "tradingHaltAtAcquisition"] as const) {
      const parsed = addStockRefines(stockTransferInputSchema).safeParse({
        ...buildStockTransferApiBody(listedForm()),
        [flag]: true,
      });
      expect(parsed.success, `flag=${flag}`).toBe(false);
    }
  });

  it("KH-3: ④ — stale 한 acquisitionStdMode 가 남아도 플래그를 싣지 않는다", () => {
    // 코스닥에서 halt 를 고른 뒤 코스피로 바꾸면 acquisitionStdMode 가 남는다
    const body = buildStockTransferApiBody(listedForm({ acquisitionStdMode: "halt_transfer" }));
    expect(body.tradingHaltAtTransfer).toBe(false);
    expect(body.tradingHaltAtAcquisition).toBe(false);
    // 그래서 엔진은 법정 경로(§99①3 종가평균)를 탄다
    const run = runFullStack(listedForm({ acquisitionStdMode: "halt_transfer" }));
    expect(run.blocked).toBe(false);
    if (run.blocked) return;
    expect(run.result.valuationDetail?.method).toBe("monthly_avg_listed");
    // 500,000,000 × 20,000 ÷ 50,000 = 200,000,000 (§165④ 경로였다면 204,166,666)
    expect(run.result.acquisitionPrice).toBe(200_000_000);
  });

  /**
   * 구별력 짝 — 좁히기가 이웃(코스닥·코넥스)을 함께 먹지 않았는지 본다.
   * KH-1~3 만 두면 「halt 를 전부 막아도」 통과한다.
   */
  it("KH-4: 코스닥은 종전대로 §165④ 보충평가를 탄다", () => {
    const form = listedForm({ marketType: "kosdaq", acquisitionStdMode: "halt_transfer" });
    expect(errorsOf(form).some((e) => e.field === "acquisitionStdMode")).toBe(false);
    const run = runFullStack(form);
    expect(run.blocked).toBe(false);
    if (run.blocked) return;
    expect(run.body.tradingHaltAtTransfer).toBe(true);
    expect(run.result.valuationDetail?.method).toBe("weighted_avg");
    expect(run.result.acquisitionPrice).toBe(204_166_666);
  });

  it("KH-5: 코넥스도 종전대로 — 취득일 거래정지 경로", () => {
    const form = listedForm({ marketType: "konex", acquisitionStdMode: "halt_acquisition" });
    expect(errorsOf(form).some((e) => e.field === "acquisitionStdMode")).toBe(false);
    const run = runFullStack(form);
    expect(run.blocked).toBe(false);
    if (run.blocked) return;
    expect(run.body.tradingHaltAtAcquisition).toBe(true);
    expect(run.result.valuationDetail?.method).toBe("halt_acquisition_conversion");
    expect(run.result.acquisitionPrice).toBe(196_000_000);
  });
});
