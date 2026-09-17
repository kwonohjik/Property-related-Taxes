/**
 * 국외전출세 → 별지 제84호서식 편입 어댑터
 *
 * 제보 —「일반 주식양도신고서와 동일해 주식 신고서 양식으로 만들면 돼」
 *
 * ## 왜 어댑터인가
 *
 * 서식(`StockFilingFormTable`)은 `StockTransferResult` **한 타입만** 읽는다. 국외전출세는
 * 입력·엔진·결과가 모두 별도 트랙(`ExitTaxInput` / `calculateExitTax` / `ExitTaxResult`)이라
 * 그대로는 실리지 않는다. 국외주식이 이미 같은 이유로 어댑터를 쓰고 있고
 * (`foreign-stock-aggregate-adapter.ts`), 이 파일은 그 **형제**다.
 *
 * ⚠️ **합산(aggregate)에는 넣지 않는다.** 국외전출세는 §118의10④ 별도 기본공제 그룹이고
 *   route 분기도 다르다 — `assertNoExitTaxItem`이 그것을 막는다. 이 어댑터는 **서식 표시
 *   전용**이며, 그 결과를 다종목 배열에 섞으면 안 된다.
 *
 * ## 「없는 것」은 만들어내지 않는다
 *
 * 국내 양도 전용 필드(환산취득가·증권거래세·전자신고 세액공제·단기보유 등)는 중립값으로 둔다.
 * 서식은 그 값들을 `-`로 비운다. 특히 **보유기간은 0**이다 — 국외전출세는 §118의9 **간주양도**라
 * 보유기간이 세율을 가르지 않고(§118의11은 §104①11가목2) 준용 — 단기 30% 없음), 종목마다
 * 취득일이 달라 합계 열 하나로 대표시킬 수 없다. 서식이 `exit_tax`를 보고 05·06행을 비운다.
 */

import type { StockTransferResult } from "./types/stock-transfer.types";
import type { ExitTaxResult } from "./types/exit-tax.types";

/**
 * `ExitTaxResult` → `StockTransferResult` (별지 제84호서식 표시용).
 *
 * 세액 관련 값은 **그대로 옮긴다** — 결과 카드와 서식의 숫자가 갈리면 안 된다.
 */
export function toStockTransferResultFromExitTax(
  r: ExitTaxResult,
  meta: {
    /** 출국일 "YYYY-MM-DD" → 간주양도일. 과세연도 표시의 근거이기도 하다. */
    departureDate: Date;
    /** 보유 종목 주식수 합계 — 서식의 수량 echo */
    totalShareCount: number;
  },
): StockTransferResult {
  const departureDayValue = r.holdingDetails.reduce((s, h) => s + h.departureDayValue, 0);
  const acquisitionCost = r.holdingDetails.reduce((s, h) => s + h.acquisitionCost, 0);

  return {
    taxCategory: "exit_tax",
    /**
     * §118의9 간주양도다 — §94 각 호의 **양도**가 아니다.
     * 서식 01행이 이 값을 「§118의9 — 국외전출 간주양도」로 옮긴다.
     */
    appliedSection94: "118의9",
    section94_2Applied: false,
    // 요건 미충족(`not_liable`)은 「비과세」가 아니라 **납세의무 자체가 없는** 것이다 —
    // 국외주식 어댑터의 `out_of_scope_foreign`과 같은 판단이다.
    isExempt: false,

    shareCount: meta.totalShareCount,
    // 간주양도가액 = Σ(출국일 시가 × 주수) (§118의10①·영 §178의9)
    transferPrice: departureDayValue,
    ownTransferPrice: departureDayValue,
    acquisitionPrice: acquisitionCost,
    ownAcquisitionPrice: acquisitionCost,
    // §118의10②은 실지거래가액 기준이다 — 환산취득가 제도가 오지 않는다.
    acquisitionMode: "actual",
    usedEstimatedAcquisition: false,

    // union 상 `stock`이지만 **서식 라벨은 §118의10④로 갈린다**(`taxCategory`로 판정).
    // 실제 그룹은 §103①2호 주식 그룹과 **별개**다 — 합산 배제가 그것을 강제한다.
    basicDeductionGroup: "stock",
    // 필요경비는 취득가액에 이미 반영된다(엔진이 종목별 `취득가액 × 주수`로 차감).
    expenses: 0,
    ownExpenses: 0,
    expenseMode: "actual",

    transferIncome: r.totalTransferGain,
    basicDeduction: r.basicDeduction,
    taxBase: r.taxBase,
    appliedRate: r.appliedRate,
    progressiveDeduction: r.progressiveDeduction,
    calculatedTax: r.incomeTax,

    // ⚠️ 국세기본법 가산세(§47조의2·3·4)는 국외전출세 엔진이 계산하지 않는다.
    //    §118의15④ 보유현황 미신고 가산세는 **성격이 다른 가산세**라 여기에 섞지 않고
    //    서식의 전용 조건부 행(26-1)이 `exitDetail`에서 직접 읽는다.
    underReportPenalty: 0,
    latePaymentPenalty: 0,
    electronicFilingCredit: 0,
    finalTax: r.finalTax,
    localIncomeTax: r.localIncomeTax,

    // 간주양도라 보유기간이 세율을 가르지 않는다 — 서식이 `exit_tax`를 보고 05·06행을 비운다.
    holdingPeriodMonths: 0,
    holdingPeriodDays: 0,
    isShortTermHolding: false,
    lthdStartDate: null,

    acquiredBeforeListing: false,

    // §104⑤ 비교과세는 §94①1·2·4호 자산의 둘 이상 양도에 걸린다 — 간주양도는 대상이 아니다.
    clause1BucketTaxBase: 0,
    clause1BucketTax: 0,
    clause9TaxBase: 0,
    clause9Tax: 0,

    warnings: r.warnings,
    // 상위 `appliedRules`는 국내 분기 **태그 union**이라 조문 문자열을 섞지 않는다.
    appliedRules: ["국외전출세§118의9"],

    // 국외전출세 전용 값 — 서식의 조건부 행이 읽는다.
    exitDetail: {
      departureDate: meta.departureDate,
      adjustmentDeduction: r.adjustmentDeduction,
      foreignTaxCreditApplied: r.foreignTaxCreditApplied,
      domesticTaxCreditApplied: r.domesticTaxCreditApplied,
      holdingsReportPenalty: r.holdingsReportPenalty,
      deferredTaxAmount: r.deferredTaxAmount,
      deferralYears: r.deferralYears,
    },
  };
}
