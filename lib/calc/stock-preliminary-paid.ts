/**
 * 주식 합산신고 — **§111③ 확정신고 기납부세액**의 전송 판정 (④⑬).
 *
 * 계획서: `docs/00-pm/stock-history-aggregate-filing.plan.md` §4.3
 *
 * ## 이 파일이 하는 일은 「보낼지 말지」다
 *
 * 금액 자체는 사용자가 넣는다. 여기서 정하는 것은 **그 축을 켜도 되는가**이다.
 * 계획서가 「확정신고에서만」이라고 적는 것으로는 부족하다 — 제외를 강제하는 가드를 코드에
 * 넣지 않으면 stale 폼 값이 그 축을 조용히 켠다([[feedback_plan_exclusion_decision_needs_a_code_gate]]).
 *
 * 켜지면 안 되는 경우가 셋이다:
 *
 * ① **예정신고·수정신고** — §111③은 「**확정신고납부**를 하는 경우」의 규정이다.
 * ② **단건(종목 1건)** — 합산 경로가 아니고, 시행령 §173⑤3호의 확정신고 의무 요건도
 *    「주식등을 **2회 이상** 양도한 경우」다.
 * ③ **국외주식만인 신고** — 법 §105① 본문 괄호가 §94①3호다목을 예정신고 대상에서
 *    제외하므로 **예정신고 산출세액이 존재할 수 없다**. 추정 fallback이 아니라 부존재다.
 *
 * 신고 축의 정본은 **편집기(마지막) 종목**이다 — `carryFilingFields`가 승계하지만 사용자가
 * 나중에 신고 유형을 바꾸면 앞서 확정한 종목에는 옛 값이 남는다. 엔진의 `pickFilingAxisInput`이
 * 신고 축을 한 종목에서 뽑는 것과 같은 층위다.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { isForeignOnlyFiling } from "@/lib/calc/stock-filing-type";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

export interface StockAggregateFilingPayload {
  /** §107 예정신고 산출세액(국세). 0이면 싣지 않는다 */
  preliminaryPaidTax?: number;
  /** 예정신고분 지방소득세. 0이면 싣지 않는다 */
  preliminaryPaidLocalTax?: number;
}

export function buildStockAggregateFilingPayload(
  forms: StockTransferFormData[],
): StockAggregateFilingPayload {
  // ② 합산(2건 이상)이 아니면 이 축 자체가 성립하지 않는다
  if (forms.length < 2) return {};

  const axis = forms[forms.length - 1];
  // ① 확정신고납부에서만
  if (axis.filingType !== "final") return {};
  // ③ 국외주식만인 신고는 예정신고가 없다 (§105① 본문 괄호)
  if (isForeignOnlyFiling(forms.map((f) => f.marketType))) return {};

  const national = parseAmount(axis.preliminaryPaidTax ?? "0");
  const local = parseAmount(axis.preliminaryPaidLocalTax ?? "0");

  const payload: StockAggregateFilingPayload = {};
  if (national > 0) payload.preliminaryPaidTax = national;
  if (local > 0) payload.preliminaryPaidLocalTax = local;
  return payload;
}
