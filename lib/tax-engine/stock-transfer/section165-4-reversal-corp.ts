/**
 * 영 §165④1호 괄호 — 「법 제94조제1항제4호다목에 해당하는 **법인**의 경우에는 순손익가치와 순자산가치의 비율을
 * 각각 2와 3으로 한다」의 대상 법인 판정. **단일 소스.**
 *
 * 독법(계획서 `docs/00-pm/stock-165-4-valuation-followups.plan.md` §3 · Q-2a 확정):
 *   「다목에 해당하는 법인」 = 다목 본문의 «자산총액 중 다목1)·2)의 합계액이 100분의 50 이상인 법인» — **법인 요건**이다.
 *   2007.2.28.~2017.2.2. 문언은 「제158조제1항제1호**가목**에 해당하는 법인」(부동산 50% 법인 요건만)이었고,
 *   대통령령 제27829호(2017.2.3.) 개정문은 같은 개정의 §167의7·§168②와 함께 이 인용을 「법 제94조제1항제4호다목」으로
 *   **바꿔 적기만** 했다(개정이유에 §165④ 언급 없음 — 법률로 옮겨진 요건을 따라간 인용 정비).
 *   ⇒ 과점주주 양도 요건까지 갖출 필요가 없다. 일반 비상장(§94①3)도 이런 법인이면 2:3이다.
 *
 * 사실 셋 중 하나면 성립한다:
 *   1. 사용자가 직접 신고 — `isHeavyRealEstateForValuation` (다목·라목 카드를 쓰지 않는 일반 비상장·상장 후 환산)
 *   2. 다목 카드가 켜져 있고 부동산등 비율 ≥ 50% — 같은 사실을 두 번 받지 않는다
 *   3. 라목 — 자산총액 중 다목1)·2) 합계 80% 이상(법 §94①4 라목)이면 50% 이상은 당연히 충족
 *
 * 순자산 단독(§165④3 · §165⑧1호 후단)이면 가중평균 자체가 없으므로 이 판정은 쓰이지 않는다 — 호출부가 단독 분기를 먼저 본다.
 * ⚠️ 연혁: 2:3은 2007.2.28. 시행본부터 보인다. 그 전 양도분의 평가 모델 자체가 엔진과 다르다(S-1c-3 2단계) — 여기서 날짜로 가르지 않는다.
 */

import type { StockTransferInput } from "./types/stock-transfer.types";

export type ReversalCorpFacts = Partial<
  Pick<
    StockTransferInput,
    | "isHeavyRealEstateForValuation"
    | "isQualifyingBlockShareholder"
    | "blockShareholderRealEstateRatio"
    | "isHeavyRealEstateForRate"
  >
>;

/** 법 §94①4 다목 1)·2) 합계 비율 기준 (100분의 50) */
const REVERSAL_CORP_REAL_ESTATE_RATIO = 0.5;

/** 사용자 신고 없이 다목·라목 사실만으로 성립하는 근거 — 없으면 `undefined` */
export function reversalCorpDerivedBasis(f: ReversalCorpFacts): "ra_mok" | "da_mok_ratio" | undefined {
  if (f.isHeavyRealEstateForRate === true) return "ra_mok";
  if (
    f.isQualifyingBlockShareholder === true &&
    typeof f.blockShareholderRealEstateRatio === "number" &&
    f.blockShareholderRealEstateRatio >= REVERSAL_CORP_REAL_ESTATE_RATIO
  )
    return "da_mok_ratio";
  return undefined;
}

/** 영 §165④1호 괄호(2:3) 대상 법인인가 */
export function isSection165_4_1ReversalCorp(f: ReversalCorpFacts): boolean {
  return f.isHeavyRealEstateForValuation === true || reversalCorpDerivedBasis(f) !== undefined;
}
