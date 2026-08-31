/**
 * anchor: 국외전출세 §118의12 조정공제 산식 · §118의15④ 가산세 총계 가산
 *
 * 리뷰 2026-08-28 #15(high) · #24(medium).
 *
 * ## #15 — 조정공제가 법정 산식이 아니었다
 *
 * 조문은 곱셈 한 줄이다:
 *   [§118의10① 양도가액 − 실제 양도가액] × §118의11에 따른 세율
 *
 * 그런데 코드는 법문에 없는 **실효세율**(산출세액 ÷ 양도차익)을 세율 자리에 넣었다.
 * 산출세액에는 §118의10④ 기본공제 250만원과 §118의11 누진공제 1,500만원이 이미 빠져
 * 있어 이 비율은 **항상 한계세율보다 작다** ⇒ 조정공제가 발동하는 모든 케이스에서
 * 과소공제 방향으로 편향된다.
 *
 * ## 「§118의11에 따른 세율」이 무엇인가
 *
 * §118의11의 세율은 스칼라가 아니라 **누진표**다(3억 이하 20% / 초과 6천만원 + 초과액 25%).
 * 그러므로 차액이 실제로 얹혀 있는 위치에, 걸친 구간마다 그 구간의 세율로 적용해야 한다.
 * 이는 「출국일 기준 산출세액 − 실제 양도가액 기준 산출세액」과 정확히 같다 —
 * 취득가액·기본공제가 양쪽에서 상쇄되기 때문이다:
 *
 *   세액① = 6천만 + (과표① − 3억) × 25%
 *   세액② = 6천만 + (과표② − 3억) × 25%
 *   차이  = (과표① − 과표②) × 25% = (출국일 양도가액 − 실제 양도가액) × 25%
 *
 * ⚠️ **두 과표가 같은 구간에 있을 때만** 「차액 × 단일세율」로 축약된다. 구간을 걸치면
 *    차액의 아랫부분에는 20%가 적용되므로 25%를 통으로 곱하면 과다공제가 된다
 *    (EX-ADJ-2가 그 케이스다 — 69,875,000 vs 75,000,000).
 *    ⇒ 산식은 **두 산출세액의 차**로 쓴다. 한 줄이 두 경우를 모두 처리한다.
 *
 * ## #24 — 가산세가 어느 총계에도 들어가지 않았다
 *
 * §118의15④는 「… 100분의 2에 상당하는 금액을 **산출세액에 더한다**」인데,
 * `holdingsReportPenalty`는 계산만 되고 어느 합계에도 가산되지 않았다.
 * `ExitTaxResult`에 `finalTax`/`totalTax` 필드 자체가 없어(형제 `ForeignStockResult`엔
 * 있다) 사이드바 요약에서 금액이 통째로 사라졌다.
 *
 * ⚠️ `incomeTax`에 직접 더하면 안 된다 — 조정공제·§118의13·§118의14 한도·`deferredTaxAmount`·
 *    지방소득세·§118의17③ 환급 제외가 전부 그 값에 종속되고, 마지막은 가산세가 산출세액과
 *    **분리돼 있어야** 성립한다.
 */

import { describe, it, expect } from "vitest";
import { calculateExitTax } from "@/lib/tax-engine/stock-transfer/exit-tax";
import type { ExitTaxInput } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";

function makeInput(over: Partial<ExitTaxInput> = {}): ExitTaxInput {
  return {
    marketType: "exit_tax",
    yearsResidentLast10: 8,
    departureDate: new Date("2025-06-02"),
    isMajorShareholder: true,
    holdings: [
      {
        id: "h1",
        stockName: "삼성전자",
        marketType: "kospi",
        shareCount: 100_000,
        acquisitionDate: new Date("2015-03-02"),
        perShareAcquisitionPrice: 20_000,
        departureDayValuationMode: "market_price",
        departureDayMarketPrice: 50_000,
      },
    ],
    hasFiledHoldingsReport: true,
    ...over,
  } as ExitTaxInput;
}

describe("EX-ADJ — §118의12 조정공제 = 두 산출세액의 차", () => {
  it("EX-ADJ-1: 두 과표가 같은 구간 — 차액 × 25%와 일치한다", () => {
    // 출국일 50억 · 취득 20억 → 차익 30억 · 과표 29억 9,750만 · 산출세액 734,375,000
    // 실제 40억            → 과표 19억 9,750만 · 산출세액 484,375,000
    const r = calculateExitTax(makeInput({ actualTransferPricePerShare: 40_000 }));
    expect(r.incomeTax).toBe(734_375_000);
    expect(r.adjustmentDeduction).toBe(250_000_000);
    expect(r.finalTaxAfterAdjustment).toBe(484_375_000);
  });

  it("EX-ADJ-2: 구간을 걸치면 차액 아랫부분에 20%가 적용된다", () => {
    // 출국일 10억 · 취득 5억 → 차익 5억 · 과표 4억 9,750만 · 산출세액 109,375,000
    // 실제 7억              → 과표 1억 9,750만 · 산출세액  39,500,000 (3억 이하 20%)
    // 조정공제 = 69,875,000  (차액 3억 × 25% = 75,000,000 이 아니다)
    const r = calculateExitTax(
      makeInput({
        holdings: [
          {
            id: "h1",
            stockName: "중소기업",
            marketType: "unlisted",
            shareCount: 100_000,
            acquisitionDate: new Date("2015-03-02"),
            perShareAcquisitionPrice: 5_000,
            departureDayValuationMode: "market_price",
            departureDayMarketPrice: 10_000,
          },
        ],
        actualTransferPricePerShare: 7_000,
      }),
    );
    expect(r.incomeTax).toBe(109_375_000);
    expect(r.adjustmentDeduction).toBe(69_875_000);
    expect(r.finalTaxAfterAdjustment).toBe(39_500_000);
  });

  it("EX-ADJ-3: 항등식 — 경정 후 세액 = 실제 양도가액으로 다시 계산한 산출세액", () => {
    // 조정공제의 존재 이유 그 자체. 다른 공제가 없으면 두 값이 같아야 한다.
    const actual = calculateExitTax(makeInput({ actualTransferPricePerShare: 33_000 }));
    // 실제 단가를 출국일 시가로 넣어 「처음부터 그 값이었다면」을 계산한다
    const recomputed = calculateExitTax(
      makeInput({
        holdings: [
          {
            ...makeInput().holdings[0],
            departureDayMarketPrice: 33_000,
          },
        ],
      }),
    );
    expect(actual.finalTaxAfterAdjustment).toBe(recomputed.incomeTax);
  });

  it("EX-ADJ-4: 실제 양도가액이 출국일 시가 이상이면 조정공제 없음 (§118의12① 요건)", () => {
    const r = calculateExitTax(makeInput({ actualTransferPricePerShare: 60_000 }));
    expect(r.adjustmentDeduction).toBe(0);
  });

  it("EX-ADJ-5: 조정공제는 산출세액을 넘지 않는다", () => {
    // 실제 양도가 1원 — 차액이 과세표준보다 크다
    const r = calculateExitTax(makeInput({ actualTransferPricePerShare: 1 }));
    expect(r.adjustmentDeduction).toBe(r.incomeTax);
    expect(r.finalTaxAfterAdjustment).toBe(0);
  });
});

describe("EX-TOT — §118의15④ 가산세가 총계에 더해진다", () => {
  const withPenalty = (over: Partial<ExitTaxInput> = {}) =>
    calculateExitTax(
      makeInput({
        hasFiledHoldingsReport: false,
        totalFaceValue: 500_000_000,
        ...over,
      }),
    );

  it("EX-TOT-1: finalTax = 경정 후 세액 + 가산세 (§118의15④ 「산출세액에 더한다」)", () => {
    const r = withPenalty();
    expect(r.holdingsReportPenalty).toBe(10_000_000);
    expect(r.incomeTax).toBe(734_375_000);
    expect(r.finalTax).toBe(744_375_000);
  });

  it("EX-TOT-2: totalTax = finalTax + 지방소득세", () => {
    const r = withPenalty();
    expect(r.localIncomeTax).toBe(73_437_500);
    expect(r.totalTax).toBe(744_375_000 + 73_437_500);
  });

  it("EX-TOT-3: 지방소득세는 가산세 이전 금액 기준이다 (가산세에 지방세 미부과)", () => {
    const withP = withPenalty();
    const withoutP = calculateExitTax(makeInput());
    expect(withP.localIncomeTax).toBe(withoutP.localIncomeTax);
  });

  it("EX-TOT-4: 가산세가 없으면 finalTax는 경정 후 세액과 같다", () => {
    const r = calculateExitTax(makeInput({ actualTransferPricePerShare: 40_000 }));
    expect(r.holdingsReportPenalty).toBeUndefined();
    expect(r.finalTax).toBe(484_375_000);
  });

  it("EX-TOT-6: 재전입 환급액에는 가산세가 들어가지 않는다 (§118의17③)", () => {
    // finalTax가 가산세를 품게 됐어도 환급액은 소득세+지방소득세만이어야 한다.
    // 둘이 같은 값을 쓰기 시작하면 §118의17③이 조용히 깨진다.
    const r = withPenalty({ reenteredWithin5Years: true });
    expect(r.holdingsReportPenalty).toBe(10_000_000);
    expect(r.reentryRefund?.amount).toBe(734_375_000 + 73_437_500);
    expect(r.reentryRefund?.amount).not.toBe(r.totalTax);
  });

  it("EX-TOT-5: 가산세는 조정공제·한도 계산에 섞이지 않는다 (§118의17③ 환급 제외 전제)", () => {
    const withP = withPenalty({ actualTransferPricePerShare: 40_000 });
    const withoutP = calculateExitTax(makeInput({ actualTransferPricePerShare: 40_000 }));
    expect(withP.adjustmentDeduction).toBe(withoutP.adjustmentDeduction);
    expect(withP.finalTaxAfterAdjustment).toBe(withoutP.finalTaxAfterAdjustment);
    expect(withP.finalTax).toBe(withoutP.finalTax! + 10_000_000);
  });
});
