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
import type { FraudPortionSplit } from "../transfer-tax-penalty";
import { floorTen } from "./stock-transfer-helpers";
import {
  computeStockFilingPenalty,
  computeStockLatePaymentPenalty,
  STOCK_PENALTY_RULE_REFS,
  type FilingAxisFields,
} from "./stock-transfer-finalize";

export /**
 * 가산세 신고축을 들고 있는 종목 하나 — 없으면 `undefined`.
 *
 * 가산세는 「국세의 과세표준 **신고**」 단위로 걸리므로(국세기본법 §47조의2·§47조의3·§47조의4)
 * 대표 1건이면 된다. 국내·국외를 가르지 않는다 — 국외주식도 §94① 양도소득이라 **§110①
 * 확정신고가 직접** 걸려 **같은 신고**이기 때문이다(§118의8 준용이 아니다 — §118의2의
 * 「국외자산」에서 3호·4호가 삭제돼 국외주식은 그 조문의 적용대상이 아니다).
 *
 * 🔑 **「무엇을 선언했는가」로 고른다 — 「국내인가」가 아니다.**
 *    종전에는 국내 종목이 있으면 `filingViolation` 값을 보지 않고 **첫 국내 종목**을 대표로
 *    삼았다. UI는 `[...savedItems, formData]`로 편집 중 종목을 **항상 마지막**에 붙이므로,
 *    확정된 국내 종목이 하나라도 있으면 지금 화면에서 선언한 위반이 결코 축이 되지 못했다
 *    (순서만 뒤집으면 세액이 달라졌다).
 *
 * 🔑 **납부지연은 신고불성실과 독립이다.** §47조의4①1호는 「법정납부기한까지 납부하지
 *    아니하거나 적게 납부한 경우」로 §47조의2·§47조의3을 요건으로 하지 않는다. 그래서
 *    선언이 없어도 납부지연 축을 든 종목을 찾는다 — 종전에는 전(全)국외 「정상신고 +
 *    납부지연」이 축을 못 골라 `computeFilingUnitPenalty`가 **납부지연까지 0**으로 돌렸고,
 *    같은 입력을 단건으로 넣으면 계산돼 **종목 개수만으로 세액이 갈렸다**.
 */
function pickFilingAxisInput(
  inputs: AggregateStockItemInput[],
): FilingAxisFields | undefined {
  // ① 신고 위반을 **선언한** 종목 — 국내·국외를 가르지 않는다
  const declared = inputs.find(
    (i) => i.filingViolation !== undefined && i.filingViolation !== "none",
  );
  if (declared) return declared;
  // ② 선언이 없어도 납부지연 축(§47조의4)을 든 종목이 있으면 그것이 대표다
  const late = inputs.find((i) => (i.unpaidTax ?? 0) > 0 && i.paymentDeadline !== undefined);
  if (late) return late;
  // ③ 둘 다 없으면 정상신고 — 국내 종목을 대표로 돌려도 가산세는 0이다(축 필드 echo용).
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
    /**
     * 🔑 비과세 종목은 건드리지 않는다 — `applyExemptZeroing`이 `finalTax`를 0으로 **강제**해
     * 두었고 `calculatedTax`는 echo 로 남는다(§94①3 가목1) 단서 등). 아래 식으로 다시 쓰면
     * 비과세 종목에 세액이 되살아난다(anchor AG-EX-4가 이 회귀를 잡는다).
     */
    if (r.isExempt) return r;
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

/**
 * 신고 단위 가산세 1회 산정 — 축을 든 종목이 하나도 없으면 0.
 *
 * 🔴 G-46: 금액뿐 아니라 **기준금액·적용 조문·가목나목 분해**도 돌려준다. 종전에는
 * `{filing, late}`만 돌려줘 다종목 신고에서는 「기준금액 × 세율」 산식과 적용 조문이 화면에서
 * 통째로 사라졌다 — 종목별 결과는 `stripItemPenalties`가 0으로 만들어 상세 카드가 조기반환하고,
 * 합산 카드에는 금액 2행뿐이었다. 사용자가 「산출세액 × 세율」로 오해하는 것을 막으려고
 * base 를 싣는다는 것이 상세 카드의 존재 이유인데, 그 이유가 다종목에서만 사라져 있었다.
 */
export function computeFilingUnitPenalty(
  determinedTotal: number,
  axis: FilingAxisFields | undefined,
): {
  filing: number;
  late: number;
  /** 「과소신고납부세액등」(국세기본법 §47조의3①) — 표시 산식용 echo */
  penaltyBase: number;
  /** 적용 조문 — 가산세가 0이면 빈 문자열 */
  ruleRef: string;
  /** §47조의3①1호 가목·나목 분해 — 「부정행위로 인한 과소신고분」 입력 시에만 */
  fraudSplit?: FraudPortionSplit;
} {
  if (!axis) return { filing: 0, late: 0, penaltyBase: 0, ruleRef: "" };
  const filing = computeStockFilingPenalty(determinedTotal, axis);
  return {
    filing: filing.penalty,
    late: computeStockLatePaymentPenalty(axis),
    penaltyBase: filing.penaltyBase,
    ruleRef: filing.ruleRef,
    ...(filing.fraudSplit ? { fraudSplit: filing.fraudSplit } : {}),
  };
}
