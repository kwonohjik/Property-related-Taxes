/**
 * 수정신고·경정청구 농어촌특별세 고지 — 단일 소스 (US-28 · Q-26).
 *
 * 결정(Q-26): 농특세는 소득세(국세 순액)와 **별도 줄**로 두고 세목 간 상계를 하지 않는다
 * (§99 리뷰 Q-22 결정과 같다 — #2936). 소득세 납부지연가산세 기준(미납세액)에도 이미 낸 농특세를
 * 기납부세액으로 넣지 않는다.
 *
 * 조세심판원 재결례는 반대 노선이다 — 감면 부인으로 양도소득세를 경정·고지하면서 이미 낸 농특세를
 * 환급하는 사안에서 그 과다납부 농특세를 양도소득세 기납부세액으로 보아 납부불성실가산세를 경정하라고 한다.
 *  · 조심 2012서3715 (2013.1.17, 조특법 §99의3 사안) — KoreanLaw MCP 재결요지·주문 확인(2026-11).
 *  · 조심 2012서4679 (2012.12.31, 조특법 §99의3 재건축 사안) — KoreanLaw MCP로 본문 확인(2026-11-11). 재결요지: 「청구인이 양도소득세를 신고하면서
 *    그 부가세로서 농어촌특별세를 납부한 점 등을 고려할 때, 그 납부액을 양도소득세 기납부세액으로 인정하여 납부불성실가산세를 감액함이 타당」.
 *    주문은 과다납부한 농특세를 양도소득세 기납부세액으로 보아 납부불성실가산세액을 경정하라는 것이고(나머지 기각), 처분청이 환급한 농특세의
 *    국세환급가산금 환수는 «별론»으로 남겼다. 위 노선 서술과 일치한다.
 * 이 노선을 엔진에 채택할지는 정해지지 않았다(확인 필요) — 계산하지 않고 고지로 둔다. 세액은 바꾸지 않는다.
 *
 * 심판례는 법령 조문이 아니라 manifest 등록 대상이 아니다. 조문은 `RURAL_SURTAX_FILING_7_1`
 * (농어촌특별세법 §7①)만 인용한다.
 */
import { RURAL_SURTAX_FILING_7_1 } from "@/lib/tax-engine/legal-codes";
import type { AmendmentDetail } from "@/lib/tax-engine/types/transfer-amendment.types";

export const AMENDMENT_RURAL_SURTAX_NOTICE_TITLE = "농어촌특별세 정정 안내";

export const AMENDMENT_RURAL_SURTAX_NOTICE_LEAD =
  `농어촌특별세는 양도소득세 금액과 별도로 계산·표시하며(${RURAL_SURTAX_FILING_7_1}), ` +
  "양도소득세와 서로 상계하지 않습니다.";

export const AMENDMENT_RURAL_SURTAX_NOTICE_DETAIL =
  "이미 낸 농어촌특별세를 양도소득세 기납부세액으로 보아 소득세 납부지연가산세의 미납세액에서 빼지 않고 계산했습니다. " +
  "조세심판원 재결례(조심 2012서3715, 조심 2012서4679)는 이미 낸 농어촌특별세를 양도소득세 기납부세액으로 인정해 " +
  "납부불성실가산세를 경정하는 노선이어서, 이 계산과 달리 적용될 수 있습니다 (확인 필요).";

/** 농특세 정정 줄(`ruralSurtax`)이 있는 수정신고·경정청구 결과에만 노출한다. */
export function shouldShowAmendmentRuralSurtaxNotice(detail: Pick<AmendmentDetail, "ruralSurtax">): boolean {
  return detail.ruralSurtax != null;
}
