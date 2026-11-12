/**
 * 다주택 중과 — 장기임대주택(소득세법 시행령 §167의3①2호)·감면대상장기임대주택(①3호)의 임대기간(년).
 * `multi-house-surcharge-count.ts`에서 분리한 leaf(계획서 `docs/01-plan/features/surcharge-rental-period-dates.plan.md`).
 *
 * 입력 우선순위: 임대개시일(`rentalStartDate`)이 있으면 날짜로 계산하고, 없으면 연수(`rentalPeriodYears` —
 * 직접 API·⑳ 카드 명부 행 `rental-card-surcharge-rows.ts`·옛 기록)를 쓴다.
 *
 * - 종점 = min(임대 종료일, 판정 양도일). 임대 종료일이 없으면 판정 양도일까지 임대한 것으로 본다(Q-1).
 * - 2호만 기산일을 자른다 — §167의3③ 「제1항제2호의 규정에 의한 장기임대주택의 임대기간의 계산은 … 이 경우
 *   사업자등록등을 하고 임대주택으로 등록하여 임대하는 날부터 임대를 개시한 것으로 본다」. 3호는 ③의 대상이
 *   아니어서 입력한 임대개시일 그대로다(조특령 §97⑤1호 「주택의 임대를 개시한 날」).
 * - 2호 상속: 조특령 §97⑤3호(③ 준용) — 피상속인 임대개월(`decedentRentalMonths`)을 더한다(Q-2). 3호에는 더하지 않는다.
 * - 3개월 이내 공실 산입(조특칙 §44)은 입력이 단일 구간이라 공백이 없다 — 해당 없음. 3개월을 넘는 공실을 빼는
 *   입력은 없다(Q-4 — 화면 고지).
 */

import { differenceInMonths } from "./utc-date";
import { differenceInYears } from "./utc-date";
import type { HouseInfo } from "./types/multi-house-surcharge.types";

function periodEnd(house: HouseInfo, referenceDate: Date): Date {
  const end = house.rentalEndDate;
  return end && end.getTime() < referenceDate.getTime() ? end : referenceDate;
}

/**
 * §167의3①2호 장기임대주택 임대기간(년, 소수 — 개월/12). 판정기는 `rentalYears < 의무연수`로만 비교한다.
 * 개시일을 세무서 사업자등록일·지자체 임대사업자 등록일 중 늦은 날 이후로 자른다.
 */
export function calcLongTermRentalPeriodYears(house: HouseInfo, referenceDate: Date): number {
  const decedentMonths = house.decedentRentalMonths ?? 0;
  if (!house.rentalStartDate) {
    if (house.rentalPeriodYears == null) return decedentMonths / 12;
    return house.rentalPeriodYears + decedentMonths / 12;
  }
  let start = house.rentalStartDate;
  for (const d of [house.businessRegistrationDate, house.rentalRegistrationDate]) {
    if (d && d.getTime() > start.getTime()) start = d;
  }
  const end = periodEnd(house, referenceDate);
  const months = end.getTime() > start.getTime() ? differenceInMonths(end, start) : 0;
  return (months + decedentMonths) / 12;
}

/** §167의3①3호 감면대상장기임대주택 임대기간(만 년) — 등록일로 자르지 않는다. */
export function calcTaxIncentiveRentalPeriodYears(house: HouseInfo, referenceDate: Date): number {
  if (!house.rentalStartDate) return house.rentalPeriodYears ?? 0;
  const end = periodEnd(house, referenceDate);
  return end.getTime() > house.rentalStartDate.getTime() ? differenceInYears(end, house.rentalStartDate) : 0;
}
