/**
 * 「소득세법」 §97의2④ 의제 취득가액 — 부동산·주식 공용 leaf
 *
 *   취득가액 = 피상속인 취득가액 × 가업상속공제적용률 + 상속개시일 현재 자산가액 × (1 − 가업상속공제적용률)
 *
 * 종전 `transfer-tax-family-business.ts`에 있던 함수를 그대로 옮겼다(그 파일은 재export한다).
 * 주식 양도(계획서 F-1)가 같은 산식을 쓰므로 부동산 엔진 의존을 끊었다.
 */

import { applyRateFraction } from "./tax-utils";
import {
  resolveFamilyBusinessRateFraction,
  type FamilyBusinessRateBasis,
} from "./family-business-applied-rate";

/**
 * 소법 §97의2④ 의제 취득가액 산출
 *
 * 산식 (1호 + 2호):
 *   (피상속인 취득가액 + **피상속인 자본적지출**) × 적용률
 *   + 상속개시일 평가액 × (1 − 적용률)
 *
 * ## 피상속인 자본적지출을 1호 base에 넣는 이유 (계획서 Q7 = 안 B)
 *
 * 자본적지출은 취득가액에 속하는 개념이고(법인세법 시행령 §72), §97의2**①**1호가
 * "취득할 **당시의** §97①1호에 따른 금액"으로 시점을 못박은 것과 달리 **④1호에는 시점
 * 한정어가 없다**. ⇒ 1호 base에 가산해 **적용률이 곱해지도록** 한다.
 *
 * ⚠️ **해석례 미확보 상태의 채택이다.** 국세법령정보시스템 실측 0건이고, 안 C(§97①2호
 *    필요경비로 **전액** 산입 — 적용률이 곱해지지 않는다)를 배제할 결정적 근거는 없다.
 *    회신이 C를 지지하면 **이 가산을 여기서 빼고 필요경비 항으로 옮겨야 한다.**
 *    (anchor: `fb-lthd-95-4-latter.anchor.test.ts` M-4)
 *
 * ## 절사 — 잔액흡수가 아니라 문언대로
 *
 * 2항을 `market − floor(market × r)`(잔액흡수)로 계산하면 문언 `floor(market × (1−r))`보다
 * 1원 크다. 두 항의 base가 서로 달라 `Σ = 전체` 불변식이 없으므로 잔액흡수를 쓸 자리가 아니다.
 * `1 − rate`를 부동소수로 쓰지 않고 두 항을 정수 분수로 각각 floor한다.
 *
 * ## 적용률 — 법정량이 있으면 정확한 분수 (계획서 F-3)
 *
 * `basis`(「소득세법 시행령」 §163의2③의 법정량)가 있으면 그 분수를 그대로 곱한다.
 * 없으면 0~1 적용률을 소수 6자리 basis로 바꾼 값을 쓴다(종전과 비트 동일).
 *
 * @param decedentAcquisitionPrice 피상속인 원취득가액 (원) — §97①1호(실지거래가액. 확인 불가 시 매매사례·감정·환산 순차)
 * @param inheritanceMarketValue 상속개시일 현재 자산가액 (원)
 * @param fbDeductionAppliedRate 가업상속공제적용률 (0~1) — 소령 §163의2③
 * @param decedentCapitalExpenditure 피상속인 자본적지출액 (원, 기본 0)
 * @param basis 가업상속공제적용률의 법정량 (있으면 우선)
 * @returns 의제 취득가액 (원)
 */
export function calcFamilyBusinessImputedAcquisitionPrice(
  decedentAcquisitionPrice: number,
  inheritanceMarketValue: number,
  fbDeductionAppliedRate: number,
  decedentCapitalExpenditure = 0,
  basis?: FamilyBusinessRateBasis,
): number {
  const { numerator, denominator } = resolveFamilyBusinessRateFraction(fbDeductionAppliedRate, basis);
  const decedentBase = decedentAcquisitionPrice + decedentCapitalExpenditure;
  const term1 = applyRateFraction(decedentBase, numerator, denominator);
  const term2 = applyRateFraction(inheritanceMarketValue, denominator - numerator, denominator);
  return term1 + term2;
}
