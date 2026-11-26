/**
 * 국외주식 이월과세(§97의2①) 공용 픽스처 — 계획서 `foreign-stock-carryover-97-2.engine.plan.md` §8.1
 *
 * FC-1: 100주 · USD
 *   증여자 취득  2025-08-01  1주 USD 400 · 환율 1,250  = 50,000,000
 *   수증(증여)   2026-01-05  1주 USD 800 · 환율 1,250  = 100,000,000 (증여세 0 — 배우자 공제)
 *   양도         2026-12-02  1주 USD 2,000 · 환율 1,500 = 300,000,000
 *
 *   B(미적용) 양도차익 200,000,000 → 과세표준 197,500,000 → 산출세액 39,500,000
 *   A(적용)   양도차익 250,000,000 → 과세표준 247,500,000 → 산출세액 49,500,000
 */
import type { ForeignStockInput } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";

/** 이월과세 미선언 기준 입력 — 수증자(B) 기준 취득가액 */
export const FOREIGN_BASE: ForeignStockInput = {
  marketType: "foreign_stock",
  yearsResidentInKorea: 7,
  isListedForeignCorp: true,
  stockName: "Example Corp",
  countryCode: "US",
  shareCount: 100,
  transferDate: new Date("2026-12-02"),
  transferPriceMode: "per_share",
  perShareTransferPriceForeign: 2_000,
  transferCurrencyCode: "USD",
  transferExchangeRate: 1_500,
  acquisitionDate: new Date("2026-01-05"),
  acquisitionMode: "actual",
  perShareAcquisitionPriceForeign: 800,
  acquisitionCurrencyCode: "USD",
  acquisitionExchangeRate: 1_250,
  capitalExpenditureForeign: 0,
  transferCostForeign: 0,
  hasForeignTax: false,
  foreignTaxMethod: "credit",
  isElectronicFiling: false,
};

/** FC-1 — 배우자 증여 이월과세 선언 */
export const FOREIGN_CARRYOVER: ForeignStockInput = {
  ...FOREIGN_BASE,
  acquisitionCause: "carryover_gift",
  donorRelation: "spouse",
  donorDeceased: false,
  donorAcquisitionDate: new Date("2025-08-01"),
  donorAcquisitionMode: "actual",
  donorPerShareAcquisitionPriceForeign: 400,
  donorAcquisitionCurrencyCode: "USD",
  donorAcquisitionExchangeRate: 1_250,
};
