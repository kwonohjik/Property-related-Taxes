/**
 * Pre-Do anchor — 국외주식 **필요경비의 지출일 기준환율** (영 §178의5①)
 *
 * ## 법령 (KoreanLaw MCP 검증 — 현행 MST 286211, 시행 2026-07-01)
 *
 * 소득세법 시행령 §178의5①
 *   「법 제118조의4제2항의 규정에 의하여 양도차익을 계산함에 있어서는 양도가액 및
 *    **필요경비**를 **수령하거나 지출한 날** 현재 「외국환거래법」에 의한 기준환율 또는
 *    재정환율에 의하여 계산한다.」
 *
 * ⇒ 필요경비(자본적지출·양도비)는 **지출한 날** 환율이다. 양도일 환율이 아니다.
 *
 * ## 무엇이 잘못돼 있었나
 *
 * `foreign-stock.ts` STEP 4 가 자본적지출·양도비를 **양도일 기준환율**(`transferExchangeRate`)로
 * 환산했다. 코드 주석도 「지출일 환율, 근사치로 양도일 환율 사용」으로 간극을 인정하고 있었다.
 * 양도가액(양도일)·취득가액(취득일)은 각각 전용 환율을 받는데 **필요경비만 없었다** —
 * UI 에도 입력 칸이 없어 사용자가 「원화 환산은 어떻게 하는가」를 알 수 없었다(제보).
 *
 * ## 설계
 *
 * 자본적지출과 양도비는 **지출 시점이 다르다**(자본적지출은 보유 중, 양도비는 양도 무렵).
 * 하나로 묶으면 한쪽이 조용히 틀리므로 **각각** 환율을 받는다. 미입력이면 양도일 환율로
 * 떨어져 **기존 계산이 변하지 않는다**(FX-3 이 그것을 고정한다).
 */

import { describe, it, expect } from "vitest";

import { calculateForeignStockTax } from "@/lib/tax-engine/stock-transfer/foreign-stock";
import type { ForeignStockInput } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";

const BASE: ForeignStockInput = {
  marketType: "foreign_stock",
  yearsResidentInKorea: 7,
  isListedForeignCorp: true,
  stockName: "Example Corp",
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
  transferCostForeign: 0,
  hasForeignTax: false,
  foreignTaxMethod: "credit",
  isElectronicFiling: false,
};

describe("FX-EXP — 필요경비는 지출일 기준환율로 환산한다 (영 §178의5①)", () => {
  it("FX-1 자본적지출: 지출일 환율(1,100)이 양도일 환율(1,350)을 대신한다", () => {
    const r = calculateForeignStockTax({
      ...BASE,
      capitalExpenditureForeign: 1_000,
      capitalExpenditureExchangeRate: 1_100,
    });
    // 1,000 USD × 1,100 = 1,100,000 (양도일 환율이면 1,350,000)
    expect(r.necessaryExpensesKrw).toBe(1_100_000);
  });

  it("FX-2 양도비: 지출일 환율(1,300)이 양도일 환율(1,350)을 대신한다", () => {
    const r = calculateForeignStockTax({
      ...BASE,
      transferCostForeign: 200,
      transferCostExchangeRate: 1_300,
    });
    // 200 USD × 1,300 = 260,000 (양도일 환율이면 270,000)
    expect(r.necessaryExpensesKrw).toBe(260_000);
  });

  it("FX-2b 두 항목의 지출일이 달라도 각각 자기 환율로 환산된다", () => {
    const r = calculateForeignStockTax({
      ...BASE,
      capitalExpenditureForeign: 1_000,
      capitalExpenditureExchangeRate: 1_100,
      transferCostForeign: 200,
      transferCostExchangeRate: 1_300,
    });
    expect(r.necessaryExpensesKrw).toBe(1_100_000 + 260_000);
  });

  it("FX-3 [회귀 방지] 지출일 환율 미입력이면 양도일 환율로 떨어진다 — 기존 계산 불변", () => {
    const r = calculateForeignStockTax({ ...BASE, transferCostForeign: 200 });
    // 200 USD × 1,350 = 270,000 — 종전과 같은 값
    expect(r.necessaryExpensesKrw).toBe(270_000);
  });

  it("FX-4 환산은 항목별로 floor 한다 — 합산 후 floor 가 아니다", () => {
    const r = calculateForeignStockTax({
      ...BASE,
      capitalExpenditureForeign: 1.5,
      capitalExpenditureExchangeRate: 1_111.1,
      transferCostForeign: 2.5,
      transferCostExchangeRate: 1_111.1,
    });
    // floor(1.5 × 1111.1) + floor(2.5 × 1111.1) = 1666 + 2777 = 4443
    // (합산 후 floor 였다면 floor(4 × 1111.1) = 4444)
    expect(r.necessaryExpensesKrw).toBe(4_443);
  });
});
