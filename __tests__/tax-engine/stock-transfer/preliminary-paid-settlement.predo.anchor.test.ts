/**
 * Pre-Do anchor — 주식 합산 **§111③ 확정신고 기납부세액 정산**
 *
 * 계획서: `docs/00-pm/stock-history-aggregate-filing.plan.md` §2 G-D · §4.3 (PR-2)
 *
 * ## 왜 필요한가
 *
 * 주식 엔진의 `priorPaidTax`는 **가산세 base 차감 전용**이다 —
 * `types/stock-transfer.types.ts`가 명시한다: 「납부할 세액을 1원도 줄이지 않는다」.
 * 즉 **확정신고에서 예정신고 산출세액을 빼는 축이 주식에는 없었다**.
 *
 * 법: 소득세법 §111③ — 확정신고납부 시 §107 예정신고 산출세액을 **공제하여 납부**.
 * 이 축이 필요한 이유는 시행령 §173⑤3호다 — 주식등을 2회 이상 양도하고 §103②를 적용해
 * 산출세액이 달라지면 **확정신고 의무**가 생긴다. 그때 이미 낸 예정신고분을 빼야 한다.
 *
 * ⚠️ 이름을 `preliminaryPaidTax`로 둔다 — 기존 `priorPaidTax`(가산세 base)와 **다른 축**이라
 *    같은 이름을 쓰면 한쪽을 고칠 때 다른 쪽이 조용히 따라온다
 *    ([[feedback_rename_same_name_two_axes]]).
 */
import { describe, it, expect } from "vitest";
import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function si(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi",
    isMajorShareholder: true,
    selfShareRatio: 0.03,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2023-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: new Date("2022-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 100,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 400_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 100_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "final",
    filingDate: new Date("2025-05-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...o,
  };
}

/** 2종목 — 소득 3,000만 + 2,000만 */
const A = si();
const B = si({
  perShareTransferPrice: 300_000,
  perShareAcquisitionPrice: 100_000,
  transferDate: new Date("2024-09-01"),
});

describe("주식 합산 — §111③ 기납부세액 정산 anchor", () => {
  it("D-0 기준선: 기납부 미지정이면 종전과 같다 (회귀 대조)", () => {
    const base = calculateStockTransferTaxAggregate([A, B], "aggregate");
    const withZero = calculateStockTransferTaxAggregate([A, B], "aggregate", {
      preliminaryPaidTax: 0,
      preliminaryPaidLocalTax: 0,
    });
    expect(withZero.totalFinalTax).toBe(base.totalFinalTax);
    expect(withZero.totalLocalIncomeTax).toBe(base.totalLocalIncomeTax);
    // 차감이 없으면 정산 필드도 싣지 않는다 — 결과 카드가 빈 행을 그리지 않게
    expect(base.settlement).toBeUndefined();
  });

  it("D-1 🔴 기납부세액만큼 이번에 낼 국세가 줄어든다", () => {
    const base = calculateStockTransferTaxAggregate([A, B], "aggregate");
    const paid = 3_000_000;
    const r = calculateStockTransferTaxAggregate([A, B], "aggregate", {
      preliminaryPaidTax: paid,
      preliminaryPaidLocalTax: 0,
    });
    expect(r.settlement).toBeDefined();
    expect(r.settlement!.preliminaryPaidTax).toBe(paid);
    expect(r.settlement!.settlementAdditionalPayable).toBe(base.totalFinalTax - paid);
    // 결정세액 자체는 바뀌지 않는다 — 정산은 「납부할 세액」 축이다
    expect(r.totalFinalTax).toBe(base.totalFinalTax);
  });

  it("D-2 기납부가 결정세액을 넘으면 환급이다 (납부액 0으로 clamp)", () => {
    const base = calculateStockTransferTaxAggregate([A, B], "aggregate");
    const paid = base.totalFinalTax + 1_000_000;
    const r = calculateStockTransferTaxAggregate([A, B], "aggregate", {
      preliminaryPaidTax: paid,
      preliminaryPaidLocalTax: 0,
    });
    expect(r.settlement!.settlementAdditionalPayable).toBe(0);
    expect(r.settlement!.settlementRefund).toBe(1_000_000);
  });

  it("D-3 지방소득세도 **대칭으로** 차감·환급된다", () => {
    const base = calculateStockTransferTaxAggregate([A, B], "aggregate");
    const localPaid = 500_000;
    const r = calculateStockTransferTaxAggregate([A, B], "aggregate", {
      preliminaryPaidTax: 0,
      preliminaryPaidLocalTax: localPaid,
    });
    expect(r.settlement!.settlementLocalPayable).toBe(base.totalLocalIncomeTax - localPaid);
    expect(r.settlement!.settlementLocalRefund).toBe(0);

    const over = calculateStockTransferTaxAggregate([A, B], "aggregate", {
      preliminaryPaidTax: 0,
      preliminaryPaidLocalTax: base.totalLocalIncomeTax + 200_000,
    });
    expect(over.settlement!.settlementLocalPayable).toBe(0);
    expect(over.settlement!.settlementLocalRefund).toBe(200_000);
  });

  it("D-4 최종 납부할세액 = 국세 납부분 + 지방 납부분", () => {
    const r = calculateStockTransferTaxAggregate([A, B], "aggregate", {
      preliminaryPaidTax: 2_000_000,
      preliminaryPaidLocalTax: 300_000,
    });
    expect(r.settlement!.settlementTotalDue).toBe(
      r.settlement!.settlementAdditionalPayable + r.settlement!.settlementLocalPayable,
    );
  });

  /**
   * 🔴 **현재 구별력 0** — 정직하게 남긴다.
   *
   * base 를 절사 **전** 값(`determinedTotal + 가산세`)으로 바꾸는 뮤테이션에서 이 anchor 는
   * 통과했다. 조합 4종(기본·가산세 동반·홀수 단가·전자신고)을 실측하니 `floorTen` 차이가
   * 전부 0 — 상류가 이미 10원 단위로 내려놓아 이 절사가 지금은 no-op 이기 때문이다.
   *
   * ⇒ 「이 anchor 가 절사 축을 지킨다」고 **세지 않는다**
   *   ([[feedback_mutation_zero_discrimination_is_not_proof]]). 남겨 두는 이유는 상류가 바뀌어
   *   절사가 물기 시작하면 그때 자기일관이 깨지는 것을 잡기 위함이다.
   */
  it("D-5 정산 base는 화면에 뜨는 totalFinalTax와 일치한다 (⚠️ 현재 구별력 0)", () => {
    const base = calculateStockTransferTaxAggregate([A, B], "aggregate");
    const r = calculateStockTransferTaxAggregate([A, B], "aggregate", {
      preliminaryPaidTax: 1,
      preliminaryPaidLocalTax: 0,
    });
    // 절사 **전** 값을 base로 쓰면 여기서 최대 9원이 어긋난다
    expect(r.settlement!.settlementAdditionalPayable + 1).toBe(base.totalFinalTax);
  });
});
