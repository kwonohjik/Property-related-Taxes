/**
 * loss-offset-rate-key.ts — §102② 통산의 **「같은 세율」 판정 축** (부동산, 무의존 leaf)
 *
 * 「소득세법 시행령」 §167의2① — 「양도차손은 다음 각호의 자산의 양도소득금액에서 **순차로**
 * 공제한다. 1. 양도차손이 발생한 자산과 **같은 세율을 적용받는 자산** … 2. … **다른 세율**을
 * 적용받는 자산 …」
 *
 * ## 왜 `RateGroup`을 쓰면 안 되나 — 두 축은 **직교**한다
 *
 * | 축 | 조문 | 기준 |
 * |---|---|---|
 * | 비교과세 합산 단위 | **§104⑤2호** | **호** — 「제104조 **각 호별**로 합산한 자산」<br>(기획재정부 재산세제과-536, 2018.6.19. · 국세청 기준-2018-법령해석재산-0098) |
 * | **차손 통산 범위** | **영 §167의2①1호** | **세율** |
 *
 * `classifyRateGroup`은 앞줄(§104⑤)용이고 그 목적으로는 옳다. 그것을 §102②에 재사용하면
 * **양방향으로 틀린다**:
 *   🔴 **거짓 분리** — 미등기(§104①10호 **70%**)와 주택 1년미만(3호 괄호 **70%**)은 호가 달라
 *      `unregistered` / `short_term`으로 갈린다. 세율은 같으니 **1호**여야 한다.
 *   🔴 **거짓 병합** — §104①2호 40%·3호 50%/70%·1호 괄호 60%가 전부 `short_term` 한 그룹이다.
 *      §104⑦1호(+20%p)와 3호(+30%p)도 `multi_house_surcharge` 한 그룹이다. **2호**여야 한다.
 *
 * 🔑 코어(`loss-offset-core.ts`)의 배분 순서·안분·잔액 흡수는 **정확하다** — 고친 것은 축뿐이다.
 *   코어 doc 주석이 「주식은 **적용 세율 값**을 축으로 쓴다(별지 제84호서식 작성요령 4번
 *   「**세율이 같은 자산**을 합산」)」고 이미 같은 논증을 폈는데 **부동산에만 적용되지 않았다**.
 *
 * ## 규약 셋
 *
 * 1. **누진 호는 세율 «값»이 아니라 «표»로 묶는다** (`prog:{호}`).
 *    두 §55① 자산의 실효세율이 15%·38%로 달라도 「같은 세율(§55① 표)을 적용받는 자산」이다.
 *    값으로 키를 만들면 **일반누진끼리 갈려 1호가 죽는다** — 이 안의 가장 큰 함정이다.
 *    표가 다르면(§104①8호 +10%p · §104⑦1호 +20%p · 3호 +30%p) 키도 다르다.
 * 2. **단일세율 호는 세율 값으로 묶는다** (`rate:{세율}`). 호가 달라도 값이 같으면 1호다 — 제보 케이스.
 * 3. **호를 단정할 수 없으면 묶지 않는다** (`solo:{자산}`). 조특법 특칙(§98①1호 20% 등)·
 *    부수토지 수동 오버라이드가 여기다. `clauseBucketKey`의 「호 불명 → `solo-{id}`」와 같은 안전측이다.
 *
 * ⚠️ **분양권은 「호는 1호, 세율은 단일 60%」다** — §104①1호 본문 괄호(「제55조제1항에 따른
 *   세율(**분양권의 경우에는 양도소득 과세표준의 100분의 60**)」). `PROGRESSIVE_RATE_CLAUSES`가
 *   1호를 담고 있으므로 그대로 두면 `prog:104-1-1`이 되어 **일반 누진 자산과 1호로 통산된다**.
 *   같은 함정이 `clauseBucketKey`에도 있고 거기서는 `classifyRateGroup`이 분양권을
 *   `short_term`으로 빼 막고 있다(`transfer-tax-rate-clause.ts` 주석 · 가드 anchor
 *   `presale-clause-1-bucket-guard.anchor.test.ts`). 여기서는 **자산 종류로 직접** 막는다.
 */
import { PROGRESSIVE_RATE_CLAUSES, type RateClause } from "./transfer-tax-rate-clause";

export interface LossOffsetRateKeyArgs {
  /** `calcTax`가 실제로 탄 §104 호. 조특법 특칙 등 §104 밖이면 undefined. */
  rateClause: RateClause | undefined;
  /** 그 호의 적용 세율. 단일세율 호에서만 키에 들어간다. */
  appliedRate: number;
  /** 자산 종류 — 분양권(§104①1호 괄호 단일 60%) 예외 판정에만 쓴다. */
  propertyType: string;
  /** 호 불명 시 자기만의 키를 만들기 위한 식별자. */
  propertyId: string;
}

export function lossOffsetRateKey({
  rateClause,
  appliedRate,
  propertyType,
  propertyId,
}: LossOffsetRateKeyArgs): string {
  // 호 불명 — 묶지 않는다(안전측). `clauseBucketKey`와 같은 규약.
  if (!rateClause) return `solo:${propertyId}`;
  // 분양권은 호가 1호여도 누진표가 아니다(위 ⚠️).
  const isProgressiveTable =
    PROGRESSIVE_RATE_CLAUSES.has(rateClause) && propertyType !== "presale_right";
  if (isProgressiveTable) return `prog:${rateClause}`;
  // 세율은 DB에서 온 소수라 부동소수 오차를 정규화한다(`calcTax`의 `roundRate`와 같은 자릿수).
  return `rate:${Math.round(appliedRate * 10000) / 10000}`;
}
