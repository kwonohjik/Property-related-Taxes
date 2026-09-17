/**
 * 주식 양도차손 안내 문구 — **§102①2호 단일 소스**
 *
 * 계획서: `docs/00-pm/foreign-stock-loss-notice-102-1-2.plan.md`
 *
 * ## 무엇을 말하나
 *
 * 법 §102①**2호**는 「제94조제1항제3호에 따른 소득」 **전체**를 한 호로 묶는다 —
 * 가·나목(국내주식)과 **다목(국외주식)**이 같은 호다. 그 위에서 §102②은
 * 「각 호별로 **해당 자산 외의 다른 자산**에서 발생한 양도소득금액에서 그 양도차손을
 * **공제한다**」고 한다. 선택이 아니라 **강행**이다.
 *
 * ⇒ 「다른 해외주식과 통산 가능」처럼 **국외끼리로 좁히거나 임의 선택인 것처럼** 적으면
 *   법보다 좁은 안내가 된다(2026-09-17 제보 — 종전 문구가 그랬다).
 *
 * ## 왜 leaf 인가
 *
 * 국내 엔진(`stock-transfer-tax.ts`)과 국외 엔진(`foreign-stock.ts`)이 **같은 문장**을
 * 내보내야 한다. 손으로 두 벌 적으면 한쪽만 고쳐져 조용히 갈라진다.
 *
 * ## ⛔ 이 문구를 §102①**1호** 그룹(부동산·기타자산)에 쓰지 말 것
 *
 * 기타자산(§94①4호)은 **1호** 그룹이라 통산 상대가 다르다. 호출부가 `basicDeductionGroup`
 * 으로 갈라야 한다(anchor FN-7).
 */
import { STOCK_FOREIGN } from "@/lib/tax-engine/legal-codes/stock";

/**
 * §102①2호 근거 배지.
 *
 * 상수 자체는 `STOCK_FOREIGN`에 있지만 **국외 전용이 아니다** — 국내주식도 같은 호다.
 * (선언 위치는 국외 트랙 작업에서 먼저 생긴 사정일 뿐이고, 문자열을 복제하면 dual-truth 가 된다.)
 */
export const LOSS_OFFSET_NOTICE_RULE = STOCK_FOREIGN.SECTION_102_1_2_INCOME_GROUP;

/**
 * 주식 그룹(§102①2호) 양도차손 안내.
 *
 * @param transferIncome 통산 «전» 양도소득금액(음수)
 */
export function stockLossOffsetNotice(transferIncome: number): string {
  return (
    `양도손실 발생 (${transferIncome.toLocaleString()}원) — ` +
    `같은 과세기간의 국내·국외 주식(§94①3호) 양도소득금액에서 공제됩니다(§102②). ` +
    `이 계산기에서는 「종목 추가」로 합산신고를 계산할 때 반영됩니다.`
  );
}
