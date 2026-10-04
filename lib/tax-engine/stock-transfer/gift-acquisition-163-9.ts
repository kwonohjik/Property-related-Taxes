/**
 * 주식 — 영 §163⑨ 상속·증여 취득가액 의제와 **추계 모드 차단** 술어 (단일 소스)
 *
 * 소득세법 시행령 §163⑨: 상속 또는 증여받은 자산에 대하여 법 §97①1호 **가목**을 적용할 때에는
 * 상속개시일 또는 증여일 현재 상증법 §60~§66에 따라 평가한 가액을 «취득당시의 실지거래가액으로 본다».
 *
 * 국심2007중1761(2007.9.19., 기각): 상속받은 자산은 실지거래가액으로 보는 가액을 §163⑨가 직접
 * 규정하므로 「취득 당시의 실지거래가액을 확인할 수 없는 경우」(§97①1호 단서)에 «해당하지 않아»
 * 환산가액으로 산정할 수 없다. 증여도 같은 문장에 있다 ⇒ 나목(매매사례·환산) 모드는 쓸 자리가 없다.
 *
 * **예외 — 평가액을 구할 수 없는 경우(장부분실).** 위 결정은 «평가액이 있는» 사안의 판단이다.
 * 비상장주식의 §163⑨ 평가액(상증법 §63①1호 나목)과 취득 당시 기준시가(법 §99①4)는 **같은 평가**라서,
 * 장부 분실 등으로 기준시가를 확인할 수 없어 액면가액을 대체값으로 쓰는 경우(법 §99①4 후단 — 사례 49)에는
 * 평가액도 산정할 수 없다 → 실지거래가액을 확인할 수 없는 경우(영 §176의2①1호)가 되어 환산이 열린다.
 * 이 예외의 신호는 장부분실 토글(`acqFaceValueOnly`) 하나다 — 법이 대체값(액면가)까지 정한 경로가 이것뿐이다.
 * **매매사례는 계속 막는다**: 장부분실 규정은 «기준시가»만 대체하고, 상속·증여일 근처의 정상 매매사례는
 * 그 자체가 상증법 시가(= §163⑨ 평가액)이기 때문이다(상증령 §49①). 좁은 예외는 미지원 — 계획서 §8 S-2.
 *
 * 종전에는 예외 기준이 «의제취득일 전 취득»(영 §176의2④ 괄호)이었다. 그 괄호는 추계를 **적용하게 된 경우**의
 * 산정 방법이지 추계를 허용하는 근거가 아니며(국심2003부0627), 날짜는 평가액 확인 가능성의 대리 지표라
 * 양방향으로 틀렸다(의제일 후 상속 + 장부분실은 막히고, 의제일 전 상속 + 장부 있음은 열렸다).
 *
 * 형제: 부동산 `lib/calc/transfer-tax-validate-gift-163-9.ts`(증여만). 주식은 상속도 포함한다 —
 * 근거 결정례가 상속 사례이고, 주식에는 상속 전용 취득가액 경로가 따로 없다(계획서 Q-2).
 *
 * ⑧ validate · ⑫ Zod · 복원 마이그레이션 · 엔진 시나리오 B · ⑤ Step 2가 **이 함수 하나**를 쓴다.
 *
 * 계획서: docs/00-pm/stock-163-9-valuation-unavailable-exception.plan.md
 */

import { STOCK } from "@/lib/tax-engine/legal-codes/stock";
import { usesUnlistedSupplementaryValuation } from "./supplementary-valuation-market";

export type GiftLikeCause = "gift" | "carryover_gift" | "inheritance";

/** 영 §163⑨가 취득가액을 의제하는 취득원인인가 */
export function isGiftLikeCause(cause: string | undefined): cause is GiftLikeCause {
  return cause === "gift" || cause === "carryover_gift" || cause === "inheritance";
}

export interface BookLostFacts {
  /** 취득시점 장부분실 토글 (법 §99①4 후단) */
  acqFaceValueOnly?: boolean;
  /** 1주당 액면가 — **0보다 커야** 엔진이 이 분기를 탄다(`stock-valuation-unlisted.ts`) */
  acqFaceValuePerShare?: number;
  marketType?: string;
  /** 양도일 거래정지·관리종목 우회(영 §165③) — 코스닥·코넥스 */
  tradingHaltAtTransfer?: boolean;
}

/**
 * 취득 당시 기준시가를 확인할 수 없어 액면가액으로 대체하는가 = 상증법 평가액도 확인할 수 없는가.
 *
 * 엔진이 사례 49 분기(`calcUnlistedValuation`의 `acq_face_value_only`)를 타는 조건과 **같다** —
 * 비상장·기타자산이거나 양도일 거래정지(비상장 보충평가로 우회)일 때만 그 분기가 있고, 액면가가 없으면 분기가
 * 켜지지 않는다. 토글만 켠 반쪽 입력이 §163⑨ 예외의 통로가 되면 안 되므로 액면가까지 요구한다.
 * 폼(문자열) 형태는 `isBookLostAtAcquisitionForm`(⑤⑧③)이 같은 규칙으로 감싼다.
 */
export function isBookLostAtAcquisition(facts: BookLostFacts): boolean {
  if (facts.acqFaceValueOnly !== true) return false;
  if (!((facts.acqFaceValuePerShare ?? 0) > 0)) return false;
  return usesUnlistedSupplementaryValuation(facts.marketType) || facts.tradingHaltAtTransfer === true;
}

/**
 * 이 취득이 §163⑨로 **추계 모드를 쓸 수 없는** 조합인가.
 *
 * - 매매사례: 상속·증여면 언제나 막는다.
 * - 환산: 장부분실(`bookLostAtAcquisition`)이면 열린다 — 위 «예외» 참조.
 *
 * @param bookLostAtAcquisition `isBookLostAtAcquisition`(엔진·⑫) 또는 `isBookLostAtAcquisitionForm`(폼) 결과.
 *   **필수 인자**다 — 빠뜨리면 사례 49가 조용히 차단된다(호출부 5곳이 같은 판정을 넘겨야 한다).
 */
export function isGiftLikeEstimationBlocked(
  cause: string | undefined,
  acquisitionMode: string | undefined,
  bookLostAtAcquisition: boolean,
): boolean {
  if (!isGiftLikeCause(cause)) return false;
  if (acquisitionMode === "sale_case") return true;
  if (acquisitionMode === "estimated") return !bookLostAtAcquisition;
  return false;
}

export const GIFT_LIKE_ESTIMATION_BLOCKED_MESSAGE =
  "증여·상속받은 주식의 취득가액은 증여일·상속개시일 현재 「상속세 및 증여세법」 제60조~제66조에 따른 " +
  "평가액이며 이를 실지거래가액으로 봅니다 — 매매사례가액은 쓸 수 없고, 환산취득가는 장부 분실 등으로 " +
  "취득 당시 기준시가를 확인할 수 없을 때(「취득시점 장부분실」 — 비상장·기타자산·거래정지)에만 쓸 수 있습니다 " +
  `(${STOCK.ENFORCEMENT_DECREE_163_9_GIFT_VALUATION}). 그 밖에는 「실가」를 고르고 평가액을 입력하세요.`;
