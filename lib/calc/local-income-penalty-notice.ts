/**
 * 양도소득분 지방소득세 가산세(지방세기본법 §53~§55) 「포함됨 + 가정·확인 필요」 고지 — 단일 소스 (US-29).
 *
 * 지방세법 §103의2 3호는 지방소득세 총결정세액에 「지방세기본법 제53조부터 제55조까지에 따른 가산세」를 더하게 한다.
 * 엔진(`transfer-tax-local-income-penalty.ts`)이 이 가산세를 지방 법정기한(국세 기한 2020-03-01 이후는 +2개월, 그 전은 같은 날 → 지방세기본법 §24①)으로
 * 따로 산정해 총 납부세액에 더한다. 다만 산정은 아래 가정(`LOCAL_INCOME_PENALTY_ASSUMPTIONS`) 위에 서 있어
 * 지방자치단체 고지액과 다를 수 있다 — 그 가정을 결과 화면에 그대로 고지한다.
 *
 * 노출 술어는 {@link shouldShowLocalIncomePenaltyNotice} 하나다.
 */
import { LOCAL_INCOME_PENALTY_ASSUMPTIONS } from "@/lib/tax-engine/transfer-tax-local-income-penalty";

export const LOCAL_INCOME_PENALTY_NOTICE_LEAD =
  "이 금액에는 양도소득분 지방소득세의 가산세(지방세기본법 §53~§55)가 포함되어 있습니다 (지방세법 §103의2 3호). 아래 가정으로 계산했으며 확인 필요합니다.";

export const LOCAL_INCOME_PENALTY_NOTICE_DETAIL = LOCAL_INCOME_PENALTY_ASSUMPTIONS.join(" ");

/** 입력 단계(가산세 토글) 고지 — 같은 입력으로 지방 가산세도 함께 산정된다 */
export const LOCAL_INCOME_PENALTY_INPUT_NOTICE =
  "아래 가산세 입력은 국세(국세기본법 §47의2~§47의4)와 함께 지방소득세 가산세(지방세기본법 §53~§55)에도 쓰입니다. 지방소득세는 국세와 같은 날 신고·납부한 것으로 보고 지방 법정기한(2020년 3월 1일 이후 기한은 소득세 기한 + 2개월, 그 전은 같은 날)을 기준으로 따로 계산합니다. 지방 법정기한이 2014년 1월 1일 전이면 구 지방세법상 소득세 부가세 체계라 산정하지 않으며, 이 가정은 확인 필요합니다.";

/** 수정신고 카드 고지 — 지방 가산세는 국세 합계에 넣지 않고 참고로 따로 보인다 */
export const LOCAL_INCOME_PENALTY_AMENDMENT_NOTICE =
  "추가 지방소득세의 가산세(지방세기본법 §54 과소신고 · §55 납부지연 · §57② 감면)는 위 국세 합계에 넣지 않고 참고로 따로 보였습니다. 지방자치단체에 별도로 신고·납부합니다.";

/** 국세 가산세를 켜 지방 가산세가 산정된 결과에만 노출한다. */
export function shouldShowLocalIncomePenaltyNotice(r: {
  penaltyDetail?: unknown;
  localIncomePenalty?: unknown;
}): boolean {
  return r.penaltyDetail != null || r.localIncomePenalty != null;
}
