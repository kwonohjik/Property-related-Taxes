/**
 * 공익법인등 사후관리 **증여세** 추징 공통 — 과세표준·산출세액 확정.
 *
 * §48②의 증여세 사유(1호·3호·4호·6호)는 과세가액 산정 방식이 제각각이지만, 거기서
 * 과세표준·산출세액을 얻는 절차는 동일하다:
 *
 * · **§53 증여재산공제는 적용되지 않는다** — 「거주자가 배우자·직계존비속·기타친족으로부터
 *   증여받은 경우」의 인적공제라 공익법인등에는 걸리지 않는다. ⇒ 과세가액 = 과세표준.
 * · **§55② 과세최저한** — 「과세표준이 50만원 미만이면 증여세를 부과하지 아니한다」.
 *   본류 증여세(`gift-tax.ts`)가 쓰는 값과 같다.
 * · **§56 누진세율**을 그대로 적용한다(marginal 재계산 아님 — §48②는 「증여받은 것으로 보아」).
 *
 * ⚠️ **가산세(§48②5·7호 → §78⑨)에는 이 규칙을 쓰지 않는다.** 가산세는 정률(10%·200%)이라
 * 과세최저한도 누진세율도 걸리지 않는다 — `./public-interest-penalty` 참조.
 */

import { calcInheritanceGiftTax, findApplicableBracket } from "../inheritance-gift-common";

/** 상증법 §55② — 과세표준이 이 금액 미만이면 증여세를 부과하지 않는다. */
export const GIFT_TAX_BASE_MIN = 500_000;

export interface MinimumTaxBaseResult {
  taxBase: number;
  giftTax: number;
  rate: number;
  deduction: number;
  belowMinimumTaxBase: boolean;
}

/** §55② 적용 — 과세표준과 산출세액을 함께 확정한다. */
export function applyMinimumTaxBase(clawbackBase: number): MinimumTaxBaseResult {
  const below = clawbackBase > 0 && clawbackBase < GIFT_TAX_BASE_MIN;
  const taxBase = below ? 0 : clawbackBase;
  const { rate, deduction } = findApplicableBracket(taxBase);
  return {
    taxBase,
    giftTax: calcInheritanceGiftTax(taxBase),
    rate,
    deduction,
    belowMinimumTaxBase: below,
  };
}
