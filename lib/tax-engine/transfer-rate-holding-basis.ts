/**
 * §104② — **세율 판정 보유기간의 기산일** 단일 소스
 *
 * 설계: docs/02-design/features/transfer-104-2-2-gift-carryover-scope.plan.md
 *
 * ── 법령 ──────────────────────────────────────────────────────────────
 * 「소득세법」 제104조 제2항
 *   "② 제1항제2호ㆍ제3호 및 제11호가목의 보유기간은 **해당 자산의 취득일부터 양도일까지로 한다.**
 *      다만, 다음 각 호의 어느 하나에 해당하는 경우에는 각각 그 정한 날을 그 자산의 취득일로 본다.
 *      1. 상속받은 자산은 피상속인이 그 자산을 취득한 날
 *      2. **제97조의2제1항에 해당하는 자산**은 증여자가 그 자산을 취득한 날
 *      3. 법인의 합병ㆍ분할 … 주식등을 취득한 날"
 *
 * 예외는 **3개 호 한정 열거**다. 단순 증여는 어느 호에도 없으므로 본문 원칙이 적용되고,
 * 그 원칙의 구체적 날짜는 법 §98 + 「소득세법 시행령」 §162①5호가 정한다 —
 *   "5. 상속 또는 증여에 의하여 취득한 자산에 대하여는 … 또는 **증여를 받은 날**"
 *
 * ── 왜 `acquisitionCause`로 판정하는가 ────────────────────────────────
 * 2호의 대상은 「§97의2①에 **해당하는 자산**」이다. UI는 취득원인을
 * **「증여」(`gift`)** 와 **「이월과세(증여)」(`carryover_gift`)** 로 갈라 두었으므로,
 * 사용자가 `gift`를 고른 것은 **§97의2① 미해당 선언**이다.
 * ⇒ `gift`에는 통산하지 않는다. `donorAcquisitionDate`가 입력되어 있어도 마찬가지다
 *   (값의 존재는 선언이 아니다 — 그 값은 §97의2① 해당 여부 판정·비교과세에 쓰인다).
 *
 * ── §97의2②로 배제된 자산은? ─────────────────────────────────────────
 * **통산하지 않는다.** 구법(~2013.12.31) §104②2호는 「**제97조제4항**에 해당하는 자산」이었고
 * 구 §97④는 배제사유(수용)를 **본문 안 「~한 경우 외에는」**으로 품고 있었다 ⇒ 배제 자산은
 * 문언상 「④에 해당하는 자산」이 아니었다. 2014.1.1.(법률 제12169호)의 §97의2 이관은
 * 개정이유에 **가업상속 ④ 신설만** 적혀 있는 **조문 정비**이므로 범위는 그대로다.
 * 실제 배선은 `transfer-tax-carryover.ts`가 시나리오 B를 `acquisitionCause: "purchase"`로
 * 재귀시켜 자연히 달성한다(계획서 §2 ⑧ · §3.2).
 */

/** §104② 기산일 판정에 필요한 **사실**만 받는다 (UI 모드 플래그·계산 중간값 금지). */
export interface RateBasisFacts {
  /** 취득 원인. `carryover_gift`만 §104②2호 대상이다. */
  acquisitionCause?:
    | "purchase"
    | "inheritance"
    | "gift"
    | "carryover_gift"
    | "newConstruction"
    | "burdened_gift";
  /** 해당 자산의 취득일 (§104② 본문 원칙 · 증여는 영 §162①5호의 「증여받은 날」) */
  acquisitionDate: Date;
  /** §104②1호 — 피상속인이 그 자산을 취득한 날 */
  decedentAcquisitionDate?: Date;
  /** §104②2호 — 증여자가 그 자산을 취득한 날 */
  donorAcquisitionDate?: Date;
}

/**
 * §104② 단서를 적용해 세율 판정용 취득일을 확정한다.
 * 어느 호에도 해당하지 않으면 본문 원칙대로 `acquisitionDate`를 그대로 돌려준다.
 */
export function resolveRateBasisAcquisitionDate(facts: RateBasisFacts): Date {
  // 1호 — 상속받은 자산
  if (facts.acquisitionCause === "inheritance" && facts.decedentAcquisitionDate) {
    return facts.decedentAcquisitionDate;
  }
  // 2호 — §97의2①에 해당하는 자산 (이월과세). 단순 증여(`gift`)는 대상이 아니다.
  if (facts.acquisitionCause === "carryover_gift" && facts.donorAcquisitionDate) {
    return facts.donorAcquisitionDate;
  }
  // 본문 — 해당 자산의 취득일
  return facts.acquisitionDate;
}
