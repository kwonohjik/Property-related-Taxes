/**
 * 주식 — 영 §163⑨ 상속·증여 취득가액 의제와 **추계 모드 차단** 술어 (단일 소스)
 *
 * 소득세법 시행령 §163⑨: 상속 또는 증여받은 자산에 대하여 법 §97①1호 **가목**을 적용할 때에는
 * 상속개시일 또는 증여일 현재 상증법 §60~§66에 따라 평가한 가액을 «취득당시의 실지거래가액으로 본다».
 *
 * 국심2007중1761(2007.9.19., 기각): 상속받은 자산은 실지거래가액으로 보는 가액을 §163⑨가 직접
 * 규정하므로 「취득 당시의 실지거래가액을 확인할 수 없는 경우」(§97①1호 단서)에 해당하지 않아
 * 환산가액으로 산정할 수 없다. 증여도 같은 문장에 있다 ⇒ 나목(매매사례·환산) 모드는 쓸 자리가 없다.
 *
 * 예외 — 의제취득일 이전 상속·증여(영 §176의2④ 「상속 또는 증여받은 자산을 포함한다」).
 * 주식 의제취득일은 1986.1.1.(영 §162⑦3호)이고, UI는 1985.12.31. 이전 취득일을 그 날로 **바꿔 저장**한다
 * (`AcquisitionInfoBlock.tsx` `coerceDeemed`) ⇒ 비교는 **엄격 초과**여야 의제취득 자산을 막지 않는다.
 *
 * 형제: 부동산 `lib/calc/transfer-tax-validate-gift-163-9.ts`(증여만). 주식은 상속도 포함한다 —
 * 근거 결정례가 상속 사례이고, 주식에는 상속 전용 취득가액 경로가 따로 없다(계획서 Q-2).
 *
 * ⑧ validate · ⑫ Zod · 복원 마이그레이션 · 엔진 시나리오 B가 **이 함수 하나**를 쓴다.
 *
 * 계획서: docs/00-pm/stock-carryover-sale-case-donor-basis.plan.md
 */

import { STOCK } from "@/lib/tax-engine/legal-codes/stock";

/** 주식 의제취득일 — 영 §162⑦3호. `stock-transfer-helpers.ts`의 `DEEMED_ACQUISITION_DATE`와 같은 날이다. */
const STOCK_DEEMED_ACQUISITION_DATE_MS = Date.UTC(1986, 0, 1);

export type GiftLikeCause = "gift" | "carryover_gift" | "inheritance";

/** 영 §163⑨가 취득가액을 의제하는 취득원인인가 */
export function isGiftLikeCause(cause: string | undefined): cause is GiftLikeCause {
  return cause === "gift" || cause === "carryover_gift" || cause === "inheritance";
}

function toUtcMs(date: Date | string): number {
  if (date instanceof Date) return date.getTime();
  // "YYYY-MM-DD"는 UTC 자정으로 파싱된다 — 위 상수와 같은 축
  return new Date(date).getTime();
}

/**
 * 이 취득이 §163⑨로 **추계 모드를 쓸 수 없는** 조합인가.
 *
 * @param acquisitionDate 수증일·상속개시일 (빈 값이면 판정하지 않는다 — 날짜 필수 검증이 따로 막는다)
 */
export function isGiftLikeEstimationBlocked(
  cause: string | undefined,
  acquisitionDate: Date | string | undefined,
  acquisitionMode: string | undefined,
): boolean {
  if (!isGiftLikeCause(cause)) return false;
  if (acquisitionMode !== "estimated" && acquisitionMode !== "sale_case") return false;
  if (!acquisitionDate) return false;
  const ms = toUtcMs(acquisitionDate);
  if (Number.isNaN(ms)) return false;
  return ms > STOCK_DEEMED_ACQUISITION_DATE_MS;
}

export const GIFT_LIKE_ESTIMATION_BLOCKED_MESSAGE =
  "증여·상속받은 주식의 취득가액은 증여일·상속개시일 현재 「상속세 및 증여세법」 제60조~제66조에 따른 " +
  "평가액이며 이를 실지거래가액으로 봅니다 — 환산취득가·매매사례가액은 쓸 수 없습니다 " +
  `(${STOCK.ENFORCEMENT_DECREE_163_9_GIFT_VALUATION}). 「실가」를 고르고 평가액을 입력하세요.`;
