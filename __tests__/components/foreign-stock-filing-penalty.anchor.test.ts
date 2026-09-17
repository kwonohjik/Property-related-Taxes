/**
 * anchor: 국외주식 **단건** 서식의 가산세 행 (26·27) — 25 − 25-1 + 26 + 27 = 29
 *
 * 제보 —「즉시 고칠 것 — 국외주식 서식 가산세 누락」
 *
 * ## 실측 결함
 *
 * 어댑터가 가산세를 0으로 옮겨(`underReportPenalty: 0`), 서식이 자기모순이었다:
 *
 * ```
 * 25행 산출세액  19,500,000
 * 26행 신고불성실      0   ← 엔진은 1,950,000 을 계산한다 (foreign-stock.ts:438)
 * 27행 납부지연        0   ← 엔진은   500,000 을 계산한다 (foreign-stock.ts:439)
 * 29행 결정세액  21,950,000   ← 차액 2,450,000 이 **어느 행에도 없다**
 * ```
 *
 * 어댑터 주석은 「엔진이 애초에 계산하지 않는다」였는데 **stale** 이었다.
 *
 * ## ⚠️ 다종목은 0이 **맞다** — 그래서 옵션으로 가른다
 *
 * 가산세는 국세기본법 §47조의2·3·4상 **신고 1건 단위 1회**다. 다종목 합산에서는
 * `stock-transfer-aggregate.ts`가 신고 단위로 1회 매기고 종목별은 `stripItemPenalties`로
 * 0으로 만든다 — 어댑터가 종목에 가산세를 실으면 **이중 계산**이 된다.
 * 단건은 그 종목이 곧 신고 1건이라 실려야 한다. 두 축을 모두 고정한다.
 */

import { describe, it, expect } from "vitest";
import { toStockTransferResult } from "@/lib/tax-engine/stock-transfer/foreign-stock-aggregate-adapter";
import type { ForeignStockResult } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";

const META = {
  transferDate: new Date("2025-09-30"),
  acquisitionDate: new Date("2021-03-15"),
  shareCount: 1000,
  stockName: "FX Corp",
  countryCode: "US",
};

/** 가산세가 있는 국외주식 결과 — 엔진 규약: finalTax = (산출 − 외국납부공제) + 신고불성실 + 납부지연 */
function makeResult(over: Partial<ForeignStockResult> = {}): ForeignStockResult {
  return {
    taxCategory: "foreign_stock",
    isLiable: true,
    transferPriceKrw: 200_000_000,
    acquisitionPriceKrw: 100_000_000,
    necessaryExpensesKrw: 0,
    transferGain: 100_000_000,
    basicDeduction: 2_500_000,
    taxBase: 97_500_000,
    appliedRate: 0.2,
    progressiveDeduction: 0,
    incomeTax: 19_500_000,
    localIncomeTax: 1_950_000,
    underReportPenalty: 1_950_000,
    latePaymentPenalty: 500_000,
    finalTax: 19_500_000 + 1_950_000 + 500_000,
    finalLocalTax: 1_950_000,
    totalTax: 21_950_000 + 1_950_000,
    transferExchangeRate: 1000,
    acquisitionExchangeRate: 1000,
    capitalExpenditureExchangeRateApplied: 1000,
    transferCostExchangeRateApplied: 1000,
    shareCount: 1000,
    warnings: [],
    appliedRules: [],
    ...over,
  } as ForeignStockResult;
}

describe("국외주식 단건 서식 — 가산세 행", () => {
  it("FP-1: 서식 모드는 가산세를 그대로 옮긴다 (25 + 26 + 27 = 29)", () => {
    const a = toStockTransferResult(META, makeResult(), { filingUnitIsThisItem: true });

    expect(a.underReportPenalty).toBe(1_950_000);
    expect(a.latePaymentPenalty).toBe(500_000);
    // 자기일관성 — 외국납부세액공제가 없는 케이스
    expect(a.calculatedTax + a.underReportPenalty + a.latePaymentPenalty).toBe(a.finalTax);
  });

  it("FP-2: 외국납부세액공제가 있어도 항등식이 선다 (25 − 25-1 + 26 + 27 = 29)", () => {
    const r = makeResult({
      foreignTaxCreditApplied: 3_000_000,
      finalTax: 19_500_000 - 3_000_000 + 1_950_000 + 500_000,
    });
    const a = toStockTransferResult(META, r, { filingUnitIsThisItem: true });

    const credit = a.foreignDetail?.foreignTaxCreditApplied ?? 0;
    expect(credit).toBe(3_000_000);
    expect(
      a.calculatedTax - credit + a.underReportPenalty + a.latePaymentPenalty,
    ).toBe(a.finalTax);
  });

  it("FP-3 [회귀 방지]: 기본값(다종목 편입)은 가산세를 **0으로 둔다** — 신고 단위 1회", () => {
    // 옵션 없이 호출 = 종전 동작. 여기가 뚫리면 다종목 신고에서 가산세가 이중으로 잡힌다.
    const a = toStockTransferResult(META, makeResult());
    expect(a.underReportPenalty).toBe(0);
    expect(a.latePaymentPenalty).toBe(0);
  });
});
