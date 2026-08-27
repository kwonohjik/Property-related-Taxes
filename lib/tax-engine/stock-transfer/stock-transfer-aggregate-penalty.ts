/**
 * 다종목 합산 — **가산세 신고-단위 산정** 헬퍼
 *
 * 가산세는 「국세의 과세표준 **신고**」 단위로 걸린다(국세기본법 §47조의2·§47조의3·§47조의4).
 * 종목마다 매겨 합산하면 ① 국외 종목이 신고축 필드를 갖지 않아 **0으로 빠지고**
 * ② base 를 신고 단위 「과소신고납부세액등」으로 계산할 수 없다.
 *
 * 부동산 정본도 같은 구조다 — 자산별로 합산하는 것은 §114조의2 **환산가액적용가산세**
 * (자산 고유)뿐이고, 신고불성실·납부지연은 `transfer-tax-aggregate.ts` 의
 * `filingUnitPenaltyDetail` 이 **신고 단위 결정세액에 1회** 매긴다.
 */

import type { StockTransferInput, StockTransferResult } from "./types/stock-transfer.types";
import {
  isForeignStockItem,
  type AggregateStockItemInput,
} from "./foreign-stock-aggregate-adapter";
import { floorTen } from "./stock-transfer-helpers";
import {
  computeStockFilingPenalty,
  computeStockLatePaymentPenalty,
  STOCK_PENALTY_RULE_REFS,
} from "./stock-transfer-finalize";

export /**
 * 가산세 신고축을 들고 있는 **국내** 종목 하나 — 없으면 `undefined`.
 *
 * 가산세는 「국세의 과세표준 **신고**」 단위로 걸리므로(국세기본법 §47조의2·§47조의3) 대표
 * 1건이면 된다. 신고축 필드(`filingViolation`·`isFraudulent`·당초신고세액 …)는 **신고 단위
 * 공통**이라 어느 국내 종목에서 읽어도 같은 값이다.
 *
 * ⚠️ **전부 국외 종목인 신고는 `undefined` 다** — `ForeignStockInput` 에는 신고축 필드가
 *    타입 자체에 없다. 그 경우 가산세가 0 이 되는 것은 **알려진 잔여 갭**이며 결과 warning 으로
 *    알린다(계획서 `stock-transfer-pr3-followup-closeout.plan.md` Track 잔여).
 */
function pickFilingAxisInput(
  inputs: AggregateStockItemInput[],
): StockTransferInput | undefined {
  return inputs.find((i): i is StockTransferInput => !isForeignStockItem(i));
}

/**
 * 종목별 가산세를 **0으로 돌린다** — 신고 단위 1회 산정이라 종목에 귀속되지 않는다.
 *
 * 종전에는 종목마다 `finalizeStockTax` 가 매긴 값을 합산했는데, 그러면 ① 국외 종목은
 * 신고축 필드가 없어 **0으로 빠지고**(혼합 신고에서 국외 소득분 가산세 누락) ② base 가
 * 종목별 산출세액이라 「과소신고납부세액등」을 신고 단위로 계산할 수 없었다.
 * 부동산 정본도 신고불성실·납부지연은 **신고 단위 1회**로 낸다
 * (`transfer-tax-aggregate.ts` `filingUnitPenaltyDetail`).
 */
export function stripItemPenalties(items: StockTransferResult[]): StockTransferResult[] {
  return items.map((r) => {
    if (r.underReportPenalty === 0 && r.latePaymentPenalty === 0) return r;
    const foreignCredit = r.foreignDetail?.foreignTaxCreditApplied ?? 0;
    return {
      ...r,
      underReportPenalty: 0,
      latePaymentPenalty: 0,
      // 가산세를 뺀 결정세액으로 되돌린다 — finalize 의 `determinedTax` 와 같은 식이다.
      finalTax: Math.max(0, floorTen(r.calculatedTax - foreignCredit - r.electronicFilingCredit)),
      // 값과 함께 **조문 표시도** 걷는다 — 안 그러면 「가산세 0인데 §47조의3 40% 배지」가 남는다
      // (메모리 `feedback_engine_result_display_drift`).
      warnings: (r.warnings ?? []).filter((w) => !STOCK_PENALTY_RULE_REFS.includes(w)),
    };
  });
}

/** 신고 단위 가산세 1회 산정 — 국내 종목이 하나도 없으면 0 */
export function computeFilingUnitPenalty(
  determinedTotal: number,
  axis: StockTransferInput | undefined,
): { filing: number; late: number } {
  if (!axis) return { filing: 0, late: 0 };
  return {
    filing: computeStockFilingPenalty(determinedTotal, axis).penalty,
    late: computeStockLatePaymentPenalty(axis),
  };
}
