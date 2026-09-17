/**
 * Pre-Do anchor — 주식 **취득가액 「합계 직접 입력」**(`acquisitionActualInputMode: "total"`)
 *
 * ## 무엇을 더하나
 *
 * 양도가액은 이미 두 방식이다 — `transferActualInputMode: "per_share" | "total"` +
 * `transferTotalPrice`. 엔진은 합계를 **나눗셈 없이 그대로** 쓴다
 * (`stock-transfer-tax.ts` STEP 2). 취득가액에는 그 축이 없어 `1주당 × 주식수`뿐이었다
 * (`stock-acquisition-basis.ts` STEP 3).
 *
 * ⇒ **양도측 total 패턴을 그대로 미러링**한다. 클라이언트가 `round(합계 ÷ 주식수)`로 역산해
 *   기존 필드에 태우는 방식은 **채택하지 않는다** — ±(주식수−1)원 잔돈 오차가 새로 생긴다.
 *   합계를 직접 넣는 사람은 그 숫자가 그대로 쓰이기를 기대한다.
 *
 * ## 🔴 스테일 함정 — 이월과세가 조용히 무력화된다
 *
 * §97의2① 시나리오 A **가목**(`stock-carryover.ts` `buildStockScenarioABase`)은
 * `perShareAcquisitionPrice`를 **증여자 실가로 덮어쓴다**. 그런데 `acquisitionActualInputMode`는
 * 건드리지 않으므로, 수증자가 원래 「합계 직접 입력」으로 넣어 뒀다면 **덮어쓴 증여자 값이
 * 무시되고 수증자 본인 합계가 그대로** 쓰인다. AT-5가 그 자리를 지킨다.
 *
 * 법령: 법 §97①1호(실지거래가액) · 법 §97의2①(이월과세) · 영 §163의2
 */
import { describe, it, expect } from "vitest";

import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/** 비상장 단건. 양도 4,000주. */
function base(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: 0.05,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2023-12-31"),
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: new Date("2021-01-02"),
    transferDate: new Date("2024-06-01"),
    shareCount: 4_000,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: 39_000_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 5_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2024-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...o,
  } as StockTransferInput;
}

describe("AT: 취득가액 합계 직접 입력", () => {
  it("AT-1 🔴 합계를 **그대로** 취득가액으로 쓴다 (역산 없음)", () => {
    const r = calculateStockTransferTax(
      base({ acquisitionActualInputMode: "total", acquisitionTotalPrice: 21_000_000 }),
    );
    expect(r.acquisitionPrice).toBe(21_000_000);
    // 양도 39,000,000 − 취득 21,000,000 = 18,000,000
    expect(r.transferIncome).toBe(18_000_000);
  });

  it("AT-2 🟢 per_share 모드는 현행 그대로다 (무영향 짝)", () => {
    const r = calculateStockTransferTax(base());
    expect(r.acquisitionPrice).toBe(5_000 * 4_000);
    expect(calculateStockTransferTax(base({ acquisitionActualInputMode: "per_share" })))
      .toEqual(r);
  });

  it("AT-3 🔴 **양도 합계 + 취득 합계** — 나눗셈이 한 번도 없어 잔돈 오차가 0이다", () => {
    // 4,000주로 나누어떨어지지 «않는» 값 두 개
    const r = calculateStockTransferTax(
      base({
        transferTotalPrice: 39_000_001,
        acquisitionActualInputMode: "total",
        acquisitionTotalPrice: 21_000_003,
      }),
    );
    expect(r.transferPrice).toBe(39_000_001);
    expect(r.acquisitionPrice).toBe(21_000_003);
    expect(r.transferIncome).toBe(18_000_001 - 3);
  });

  it("AT-4 🔴 1주당 echo는 floor(합계 ÷ 주식수)다 — **총액이 정본**이다", () => {
    const r = calculateStockTransferTax(
      base({ acquisitionActualInputMode: "total", acquisitionTotalPrice: 21_000_003 }),
    );
    expect(r.valuationDetail?.finalPerShareValue).toBe(Math.floor(21_000_003 / 4_000));
    // echo가 반올림되어도 **총액은 그대로**다
    expect(r.acquisitionPrice).toBe(21_000_003);
  });

  it("AT-8 🟢 `acquisitionMode`가 실가가 아니면 합계를 무시한다 (오염 0)", () => {
    const withStale = base({
      acquisitionMode: "sale_case",
      acquisitionMarketSamplePrice: 4_000,
      // 모드를 되돌렸는데 값이 남은 상태 — 매매사례가액이 이겨야 한다
      acquisitionActualInputMode: "total",
      acquisitionTotalPrice: 999_999_999,
    });
    const r = calculateStockTransferTax(withStale);
    expect(r.acquisitionPrice).toBe(4_000 * 4_000);
  });
});

describe("AT: 실가 모드 게이트", () => {
  /**
   * 🔑 **AT-8만으로는 게이트를 지키지 못한다** — 뮤테이션 실측(2026-09-17)에서
   * `isActualTotalMode`의 `acquisitionMode === "actual"` 조건을 지워도 AT-8이 통과했다.
   * 매매사례 «본체» 분기는 이 leaf를 아예 타지 않기 때문이다
   * ([[feedback_mutation_zero_discrimination_is_not_proof]]).
   *
   * 실제로 두 모드가 **한 분기에 섞이는 곳**은 비과세 표시용 취득가액이다
   * (`exempt-informational-acquisition.ts` — `actual || sale_case`). 거기가 게이트의 과녁이다.
   */
  it("AT-9 🔴 비과세 + 매매사례가액 — 스테일 합계가 남아도 매매사례 기준이 이긴다", () => {
    const r = calculateStockTransferTax(
      base({
        isKOTCTrading: true,
        isMajorShareholder: false,
        selfShareRatio: 0,
        isSmallMediumEnterprise: true,
        isListedSmallShareholder: true,
        acquisitionMode: "sale_case",
        perShareAcquisitionPrice: 5_000,
        // 실가에서 되돌렸는데 값이 남은 상태
        acquisitionActualInputMode: "total",
        acquisitionTotalPrice: 999_999_999,
      }),
    );
    expect(r.isExempt).toBe(true);
    expect(r.acquisitionPrice).toBe(5_000 * 4_000);
  });
});

describe("AT: 이월과세(§97의2①)와의 상호작용", () => {
  const carryover = (o: Partial<StockTransferInput> = {}) =>
    base({
      acquisitionCause: "carryover_gift",
      // §97의2① 다섯 축 — ⓒ 증여일 ≥ 2025-01-01 · ⓓ 양도일 − 증여일 ≤ 1년 · ⓔ 배우자
      acquisitionDate: new Date("2025-03-01"),
      transferDate: new Date("2025-09-01"),
      filingDate: new Date("2025-11-30"),
      donorRelation: "spouse",
      donorAcquisitionDate: new Date("2018-03-02"),
      // §97의2②는 「적용 시 세액이 더 클 때만」 적용한다 — 증여자 실가를 충분히 낮춰
      //   A(장기·20%)가 B(단기·30%)보다 커지게 둔다. 그래야 가목 분기에 도달한다.
      donorAcquisitionPrice: 1_000,
      giftTaxAmount: 1_000_000,
      ...o,
    });

  it("AT-5 🔴 시나리오 A 가목 — total 모드가 남아 있어도 **증여자 실가**가 이긴다", () => {
    const stale = calculateStockTransferTax(
      carryover({ acquisitionActualInputMode: "total", acquisitionTotalPrice: 21_000_000 }),
    );
    const clean = calculateStockTransferTax(carryover());
    // 증여자 실가 1,000 × 4,000주 = 4,000,000 — 수증자 본인 합계(21,000,000)가 아니다
    expect(stale.carryoverDetail?.outcome).toBe("applied");
    expect(stale.acquisitionPrice).toBe(clean.acquisitionPrice);
    expect(stale.acquisitionPrice).toBe(1_000 * 4_000);
  });

  it("AT-6 🔴 증여 당시 평가액 echo가 total 모드에서도 살아 있다", () => {
    const r = calculateStockTransferTax(
      carryover({ acquisitionActualInputMode: "total", acquisitionTotalPrice: 21_000_003 }),
    );
    expect(r.carryoverDetail?.giftDateValuationPerShare).toBe(Math.floor(21_000_003 / 4_000));
  });
});

describe("AT: K-OTC 비과세 정보용 취득가액", () => {
  it("AT-7 🔴 비과세여도 취득가액 echo가 0이 되지 않는다", () => {
    const r = calculateStockTransferTax(
      base({
        isKOTCTrading: true,
        isMajorShareholder: false,
        selfShareRatio: 0,
        isSmallMediumEnterprise: true,
        isListedSmallShareholder: true,
        acquisitionActualInputMode: "total",
        acquisitionTotalPrice: 21_000_000,
      }),
    );
    expect(r.isExempt).toBe(true);
    expect(r.acquisitionPrice).toBe(21_000_000);
  });
});
