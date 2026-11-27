/**
 * 국외전출세 2027.1.1. 개정 화면 테스트 공용 픽스처 — 폼(`StockTransferFormData`) 빌더
 *
 * 시료(손계산 — 엔진 실행값 복사 아님. 엔진 route anchor `stock-transfer.route.exit-tax-2027.anchor.test.ts`와 같은 시료):
 *   H1 코스닥 10,000주 · 취득 10,000/주 · 시가 50,000/주                    → 차익 400,000,000 (1호)
 *   F1 국외주식 1,000주 · 취득 400 USD × 1,200 · 시가 1,000 USD × 1,400    → 시가 1,400,000,000 · 취득 480,000,000 · 차익 920,000,000 (2호나목, 외국법인 발행)
 *   F1 단독 · 2027-01-01 출국 → (920,000,000 − 2,500,000) × 20% = 183,500,000
 *   H1 + F1 · 배분 (clause1 2,500,000 / clause2b 0) → 84,375,000 + 184,000,000 = 268,375,000
 */
import {
  createEmptyExitTaxActualTransfer,
  createEmptyExitTaxHolding,
  createInitialStockFormData,
} from "@/lib/stores/calc-wizard-stock-store";
import type {
  ExitTaxHoldingActualForm,
  ExitTaxHoldingForm,
  StockTransferFormData,
} from "@/lib/stores/calc-wizard-stock-store";

/** 종목별 실제 양도 입력(PR-7b) — 기본은 비어 있는 입력(토글 ON 직후) */
export const exitActual = (over: Partial<ExitTaxHoldingActualForm> = {}): ExitTaxHoldingActualForm => ({
  ...createEmptyExitTaxActualTransfer(),
  ...over,
});

/**
 * F1(국외 1,000주) 전량 양도 — 외화 1,000 × 실제 양도일 기준환율 1,200 = 1,200,000,000
 * 하락분 = 출국일 1,400,000,000 − 1,200,000,000 = 200,000,000 → 2호나목 20% → 조정공제 40,000,000 · 경정 후 183,500,000 − 40,000,000 = 143,500,000
 */
export const F1_SOLD = exitActual({ shareCount: "1,000", priceForeign: "1000", exchangeRate: "1200" });

export function exitHolding(id: string, over: Partial<ExitTaxHoldingForm> = {}): ExitTaxHoldingForm {
  return { ...createEmptyExitTaxHolding(), id, ...over };
}

/** 국내 코스닥 H1 — 차익 400,000,000 */
export const H1 = (over: Partial<ExitTaxHoldingForm> = {}) =>
  exitHolding("h1", {
    stockName: "H1 코스닥",
    marketType: "kosdaq",
    shareCount: "10,000",
    acquisitionDate: "2015-01-01",
    perShareAcquisitionPrice: "10,000",
    departureDayValuationMode: "market_price",
    departureDayMarketPrice: "50,000",
    ...over,
  });

/** 국외주식 F1(외화 경로) — 차익 920,000,000 · 외국법인 발행(2호나목) */
export const F1 = (over: Partial<ExitTaxHoldingForm> = {}) =>
  exitHolding("f1", {
    stockName: "F1 국외주식",
    marketType: "foreign_stock",
    isListedForeignCorp: true,
    countryCode: "US",
    foreignCurrencyCode: "USD",
    shareCount: "1,000",
    acquisitionDate: "2018-01-01",
    departureDayValuationMode: "foreign_market_price",
    departureDayPriceForeign: "1000",
    departureExchangeRate: "1400",
    perShareAcquisitionPriceForeign: "400",
    acquisitionExchangeRate: "1200",
    ...over,
  });

export function exitForm(over: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    marketType: "exit_tax",
    securityName: "전출 케이스",
    etYearsResidentLast10: "10",
    etDepartureDate: "2027-01-01",
    etIsMajorShareholder: true,
    etHasFiledHoldingsReport: true,
    etHoldings: [F1()],
    ...over,
  } as StockTransferFormData;
}
