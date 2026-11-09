/**
 * 함께 양도(다른 물건) 묶음 안 조합원입주권의 §89①4호 비과세 — 「확인 필요」 고지
 * (계획서 `docs/00-pm/companion-right-4ho-open.plan.md` §4-3 · 사용자 결정 2026-11-09 Q-1·Q-2).
 *
 * 두 고지 모두 **정면 해석례가 없는 판단**을 쓴 사실을 알린다. 세액은 바꾸지 않는다.
 *  - Q-1: 같은 날 함께 양도하는 다른 주택·입주권을 «양도일 현재 보유»로 봤다(소득세법 §89①4호 가·나목 · 본문 «1개 보유»).
 *  - Q-2: 12억 비교는 법 §100② 안분 후 입주권 몫의 양도가액으로 했다.
 *
 * 축 B(같은 물건 지분 분할)는 대상이 아니다 — 그쪽 고지는 `oneRightSharedOwnershipNotice` 등이 맡는다.
 */
import type { AggregateTransferResult } from "@/lib/tax-engine/types/transfer-aggregate.types";

export const BUNDLED_RIGHT_HOLDING_NOTICE =
  "함께 양도하는 주택·조합원입주권은 양도일 현재 보유한 것으로 보아 조합원입주권 비과세(「소득세법」 §89①4호 가목·나목)를 판정했습니다. " +
  "같은 날 함께 양도하는 경우의 «보유» 해당 여부는 정면 해석례를 확인하지 못했으니 확인이 필요합니다.";

export const BUNDLED_RIGHT_HIGH_VALUE_NOTICE =
  "함께 양도한 조합원입주권의 12억 비교는 「소득세법」 §100②에 따라 안분한 입주권 몫의 양도가액으로 했습니다. " +
  "일괄양도에서의 비교 기준은 정면 해석례를 확인하지 못했으니 확인이 필요합니다.";

export interface BundledRightCardFacts {
  /** 이 자산이 입주권 양도인가(`redevelopment.subject === "right"`). */
  isRight: boolean;
  /** 인가일 현재 기존주택 소유 선언(§89①4호 본문) 「예」. */
  declaredEligible: boolean;
  /** 입주권이 아닌 주택 계열(주택 · 겸용주택 · 재개발 완공주택)인가. */
  isOtherHouse: boolean;
}

/**
 * @param cards 묶음 안 모든 자산(주 자산 + 컴패니언)의 사실 — 호출부가 만든다.
 * @param aggregated 합산 결과 — 카드별 `redevelopmentDetail.oneRightExemptionClause`로 «4호가 성립했는가»를 본다.
 */
export function bundledRightExemptionNotices(
  cards: readonly BundledRightCardFacts[],
  aggregated: Pick<AggregateTransferResult, "properties">,
): string[] {
  if (cards.length < 2) return [];
  const rightCards = cards.filter((c) => c.isRight);
  if (rightCards.length === 0) return [];
  const out: string[] = [];
  // Q-1 — 선언 «예»인 입주권 카드가 있고, «같은 날 보유로 세는» 다른 주택·입주권이 묶음에 있을 때.
  const hasOtherHouseOrRight = cards.some((c) => c.isOtherHouse) || rightCards.length >= 2;
  if (rightCards.some((c) => c.declaredEligible) && hasOtherHouseOrRight) {
    out.push(BUNDLED_RIGHT_HOLDING_NOTICE);
  }
  // Q-2 — 4호가 실제로 성립한 입주권 카드가 있을 때(성립해야 12억 비교가 결론에 닿는다).
  if (aggregated.properties.some((p) => p.redevelopmentDetail?.oneRightExemptionClause !== undefined)) {
    out.push(BUNDLED_RIGHT_HIGH_VALUE_NOTICE);
  }
  return out;
}
