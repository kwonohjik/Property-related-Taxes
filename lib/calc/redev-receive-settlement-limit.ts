/**
 * 청산금 수령액 상한 — 수령 청산금은 평가액(권리가액, 공유지분이면 그 지분 해당액)보다 작아야 한다.
 *
 * 「도시 및 주거환경정비법」 제89조 제1항의 청산금은 **분양받은 자**의 종전 가격과 분양 가격의 차액이므로, 분양 가격이 있는 한
 * 수령 청산금은 평가액에 이르지 못한다. 「소득세법 시행령」 제166조 제1항 제2호의 「평가액 − 지급받은 청산금」이 그 분양 가격 자리이고, 0 이하는 이 산식이 전제하지 않는다.
 * 계획서 `docs/00-pm/redev-receive-settlement-limit.plan.md`.
 *
 * 공유지분은 ④가 평가액만 지분율로 줄이고 청산금은 본인 지분분을 그대로 싣는다(`buildRedevelopmentPayload`). 지분 평가액을 넘는 분담은 법문이 정하지 않았고
 * 엔진 산식도 성립하지 않으므로 계산을 거절한다(사용자 결정 2026-11-02 · A안).
 *
 * ④ payload 값을 읽어 ⑧·⑫가 같은 술어를 쓴다. 승계조합원은 §166 평가액 칸이 없어(`rightsValue`는 UI 미러) 비교하지 않는다.
 */
import { REDEVELOPMENT } from "@/lib/tax-engine/legal-codes/transfer-redevelopment";

export const REDEV_RECEIVE_SETTLEMENT_LIMIT_MESSAGE = `수령 청산금은 권리가액(지분이면 권리가액의 지분 해당액)보다 작아야 합니다. 청산금은 분양받은 대지·건축물 가격과 종전 가격의 차액이라 권리가액 이상일 수 없습니다. 권리가액과 청산금이 같은 관리처분계획 기준인지 확인하세요. 분양을 받지 않는 현금청산은 이 칸의 청산금이 아닙니다. (${REDEVELOPMENT.SETTLEMENT_DEFINITION} · ${REDEVELOPMENT.RIGHT_RECEIVE})`;

export function redevReceiveSettlementReachesValue(v: {
  settlementDirection: "pay" | "receive";
  settlementAmount: number;
  rightsValue: number;
  isSuccessorMember?: boolean;
}): boolean {
  return v.settlementDirection === "receive" && v.isSuccessorMember !== true && v.settlementAmount > 0 && v.settlementAmount >= v.rightsValue;
}
