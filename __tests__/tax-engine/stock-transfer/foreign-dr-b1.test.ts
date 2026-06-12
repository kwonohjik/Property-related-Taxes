/**
 * B-1① 해외상장 내국법인 DR (§157의3 2호)
 *
 * §157의3: 1호(외국법인 발행 주식, isListedForeignCorp=true)·
 *   2호(내국법인 발행 주식등 + 국외 예탁기관 DR §152의2, 해외 상장, false) 모두
 *   §94①3다목 "국외주식 등" → 동일 과세(해외주식 양도소득 §118의2~9).
 *   isListedForeignCorp는 분류 라벨일 뿐 계산 무영향(엔진 미분기).
 */

import { describe, it, expect } from "vitest";
import { calculateForeignStockTax } from "@/lib/tax-engine/stock-transfer/foreign-stock";
import type { ForeignStockInput } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";

const BASE: ForeignStockInput = {
  marketType: "foreign_stock",
  yearsResidentInKorea: 7,
  isListedForeignCorp: true,
  stockName: "Example DR",
  countryCode: "US",
  shareCount: 1_000,
  transferDate: new Date("2025-09-30"),
  transferPriceMode: "per_share",
  perShareTransferPriceForeign: 150,
  transferCurrencyCode: "USD",
  transferExchangeRate: 1_350,
  acquisitionDate: new Date("2022-03-15"),
  acquisitionMode: "actual",
  perShareAcquisitionPriceForeign: 80,
  acquisitionCurrencyCode: "USD",
  acquisitionExchangeRate: 1_200,
  capitalExpenditureForeign: 0,
  transferCostForeign: 200,
  hasForeignTax: false,
  foreignTaxMethod: "credit",
  isElectronicFiling: false,
};

describe("B-1① DR — §157의3 2호 동일 과세", () => {
  it("B1-DR-1: isListedForeignCorp false(DR) == true(외국법인) 세액 동치", () => {
    const foreignCorp = calculateForeignStockTax({ ...BASE, isListedForeignCorp: true });
    const dr = calculateForeignStockTax({ ...BASE, isListedForeignCorp: false });
    // 분류 라벨일 뿐 계산 무영향 — 핵심 출력 전부 동일
    expect(dr.isLiable).toBe(foreignCorp.isLiable);
    expect(dr.transferPriceKrw).toBe(foreignCorp.transferPriceKrw);
    expect(dr.acquisitionPriceKrw).toBe(foreignCorp.acquisitionPriceKrw);
    expect(dr.transferGain).toBe(foreignCorp.transferGain);
    expect(dr.incomeTax).toBe(foreignCorp.incomeTax);
    expect(dr.finalTax).toBe(foreignCorp.finalTax);
    expect(dr.totalTax).toBe(foreignCorp.totalTax);
    // 동치 + 비-vacuous 보장 (실제 양수 세액)
    expect(dr.totalTax).toBeGreaterThan(0);
  });
});
