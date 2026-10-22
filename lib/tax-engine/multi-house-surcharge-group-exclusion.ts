/**
 * 다주택 중과세 — 「소득세법 시행령」 §167의3① 각 호 그룹 배제와 ④ 의무기간 충족 전 의제 (Layer 2 내부 모듈)
 *
 * multi-house-surcharge-exclusion.ts 800줄 정책 분할(2026-10-22, 8호의2 6개월 요건 정정과 함께):
 *   - 3주택+ ①~⑨ 그룹 배제 판정 (⑩ 유일한 1주택) · 사유 문구
 *   - 4호·8호·8호의2 술어(사원용·저당권 3년·어린이집)
 *   - §167의3④ 의무기간 충족 전 의제 (10호 전용)
 *
 * 호출부는 종전대로 `multi-house-surcharge-exclusion`에서 import한다(re-export).
 */

import { isWithinDeadline, isWithinDeadlineMonths } from "./civil-period";
import { MULTI_HOUSE } from "./legal-codes";
import type { HouseInfo } from "./types/multi-house-surcharge.types";
import {
  calcRentalPeriodYears,
  isSurchargeExemptRental,
  isSurchargeExemptInherited,
  getRentalTypeLabel,
  isTaxIncentiveRentalHousingExempt,
  isLongTermRentalDutyPeriodPending,
} from "./multi-house-surcharge-count";

// ============================================================
// 3주택+ ①~⑨ 그룹 배제 판정 (⑩번 "유일한 1주택" 판정용)
// ============================================================

export function isGroupExcludable(house: HouseInfo, transferDate: Date): boolean {
  if (house.regionCriteria === "VALUE") {
    const price = house.transferOfficialPrice ?? house.officialPrice;
    if (price <= 300_000_000) return true;
  }
  // ②·⑦은 D16부터 주택 수에서 빠지지 않고 여기에 도달한다 — 양도 주택 자체 배제와 같은 술어.
  if (isSurchargeExemptRental(house, transferDate)) return true;
  if (isTaxIncentiveRentalHousingExempt(house, transferDate)) return true;
  if (house.isEmployeeHousing && (house.freeProvisionYears ?? 0) >= 10) return true;
  if (house.isTaxSpecialExemption) return true;
  // §167의3①5호 — 조특법 감면 미분양·신축주택은 주택 수에 산입하되 중과 대상에서 뺀다(F-11).
  if (house.isUnsoldHousing) return true;
  if (house.isCulturalHeritage) return true;
  if (isSurchargeExemptInherited(house, transferDate)) return true;
  if (isMortgageExecutionWithin3Years(house, transferDate)) return true;
  if (isDayCareCenterExempt(house, transferDate)) return true;
  return false;
}

/** §167의3①8호의2 의무사용기간(년) · 사용 종료 후 유예(개월) */
const DAYCARE_DUTY_YEARS = 5;
const DAYCARE_END_GRACE_MONTHS = 6;

/**
 * §167의3①8호의2 — 「…5년 이상 어린이집으로 사용하고 **어린이집으로 사용하지 않게 된 날부터 6개월이 경과하지 않은** 주택」
 * (MST 290841 실독 · 6개월 요건은 2006.2.9. 개정부터 — `MULTI_HOUSE.DAYCARE_8_2_BASIS`).
 *
 * 종전에는 운영 연수만 봐서 사용을 그만둔 지 6개월이 지난 주택도 배제했다(F-4 · 과소과세).
 * 사용 상태는 「양도일 현재 사용 중」 또는 사용 종료일 택일이다. 둘 다 없으면 「모름」 — 불성립(⑧·⑫가 먼저 막는다).
 * 「경과하지 않은」은 저당권 3년(`isMortgageExecutionWithin3Years`)과 같은 독법 — 초일불산입, 말일 당일까지, §161 연장.
 */
export function isDayCareCenterExempt(house: HouseInfo, transferDate: Date): boolean {
  if (!house.isDayCareCenter || (house.dayCareOperationYears ?? 0) < DAYCARE_DUTY_YEARS) return false;
  if (house.dayCareInUse === true) return true;
  return !!house.dayCareEndDate && isWithinDeadlineMonths(house.dayCareEndDate, DAYCARE_END_GRACE_MONTHS, transferDate);
}

/** §167의3①8호·§167의4③·§167의10①2호 준용·§167의11 — 저당권 실행 기산 연수(「취득일부터 3년이 경과하지 아니한」). */
const MORTGAGE_EXECUTION_YEARS = 3;

/**
 * §167의3①8호 — 「저당권의 실행으로 인하여 취득하거나 채권변제를 대신하여 취득한 주택으로서 **취득일부터 3년이
 * 경과하지 아니한** 주택」(MST 286211 실독). 「경과하지 아니한」 = 기간(초일불산입 · 민법 §157·§160)의 말일까지 —
 * 응당일 **당일**이 기간 안이다. 말일이 토요일·공휴일이면 익일(민법 §161 · 구 8호 `surcharge-old-clauses-era.ts`와 같은
 * 독법 — 「경과하지 아니한」에 §161을 적용한 직접 선례는 미확보). 종전 `differenceInYears(…) < 3`은 응당일을 기간 밖으로 봤다(E-11).
 */
export function isMortgageExecutionWithin3Years(house: HouseInfo, transferDate: Date): boolean {
  return (
    house.isMortgageExecution === true &&
    isWithinDeadline(house.acquisitionDate, MORTGAGE_EXECUTION_YEARS, transferDate)
  );
}

export function getGroupExcludeReason(house: HouseInfo, transferDate: Date): string {
  if (house.regionCriteria === "VALUE") {
    const price = house.transferOfficialPrice ?? house.officialPrice;
    if (price <= 300_000_000) return "① 지방 저가주택 (3억 이하)";
  }
  if (isSurchargeExemptRental(house, transferDate)) {
    return house.rentalType
      ? `② 장기임대주택 (${getRentalTypeLabel(house.rentalType)})`
      : "② 장기임대 등록주택 (말소 전)";
  }
  if (isTaxIncentiveRentalHousingExempt(house, transferDate)) return "③ 조특법 감면 임대주택";
  if (house.isEmployeeHousing && (house.freeProvisionYears ?? 0) >= 10) return "④ 사원용 주택 (10년 이상)";
  if (house.isTaxSpecialExemption) return "⑤ 조특법 특례";
  if (house.isUnsoldHousing) return `⑤ 조특법 감면 미분양·신축주택 (${MULTI_HOUSE.TAX_INCENTIVE_HOUSE_5_BASIS})`;
  if (house.isCulturalHeritage) return "⑥ 문화재";
  if (isSurchargeExemptInherited(house, transferDate)) return "⑦ 상속주택 (5년 이내 · §155②)";
  if (isMortgageExecutionWithin3Years(house, transferDate)) return "⑧ 저당권 실행 (3년 이내)";
  if (isDayCareCenterExempt(house, transferDate)) return "⑨ 어린이집 (5년 이상)";
  return "일반주택 (배제 불가)";
}

// ============================================================
// §167의3④ — 의무임대기간등 충족 전에 일반주택을 양도하는 경우 (10호 전용 · F-10)
// ============================================================

/**
 * 「제1항제2호부터 제4호까지 또는 제8호의2」 주택이 **의무 기간만** 모자라면 사유 문구, 아니면 null.
 * 기간 외 요건은 각 호의 판정 그대로 요구한다(임대는 `isLongTermRentalDutyPeriodPending`).
 * 2주택은 §167의10②가 §167의3④를 준용한다.
 */
export function dutyPeriodPendingReason(house: HouseInfo, transferDate: Date): string | null {
  const basis = `의무기간 충족 전 — ${MULTI_HOUSE.DUTY_PERIOD_PENDING_BASIS}`;
  if (isLongTermRentalDutyPeriodPending(house, transferDate)) {
    return `② 장기임대주택 (${getRentalTypeLabel(house.rentalType)} · ${basis})`;
  }
  if (house.isTaxIncentiveRental && house.isNationalSizeHousing && calcRentalPeriodYears(house) < 5) {
    return `③ 조특법 감면 임대주택 (${basis})`;
  }
  if (house.isEmployeeHousing && (house.freeProvisionYears ?? 0) < 10) {
    return `④ 사원용 주택 (${basis})`;
  }
  // 의무사용기간 「충족 전」은 아직 어린이집으로 쓰는 중일 때뿐이다 — 5년 전에 사용을 그만뒀으면 요건을 못 채운 것이다(⑤ 추징 사유).
  if (house.isDayCareCenter && house.dayCareInUse === true && (house.dayCareOperationYears ?? 0) < DAYCARE_DUTY_YEARS) {
    return `⑨ 어린이집 (${basis})`;
  }
  return null;
}

/** 10호(「그 주택을 제외하고 1개의 주택만」) 판정용 — ①~⑨ 배제 + §167의3④ 의제. */
export function isExcludableForGeneralHouse(house: HouseInfo, transferDate: Date): boolean {
  return isGroupExcludable(house, transferDate) || dutyPeriodPendingReason(house, transferDate) !== null;
}

export function getGeneralHouseExcludeReason(house: HouseInfo, transferDate: Date): string {
  return isGroupExcludable(house, transferDate)
    ? getGroupExcludeReason(house, transferDate)
    : (dutyPeriodPendingReason(house, transferDate) ?? "일반주택 (배제 불가)");
}

/** §167의3⑤ — ④를 적용받은 뒤 의무기간등을 채우지 못하면 차액을 신고·납부해야 한다. */
export const DUTY_PERIOD_PENDING_WARNING =
  "의무임대기간(의무무상·의무사용기간)을 채우기 전인 임대주택등을 장기임대주택등으로 보아 중과를 배제했습니다" +
  `(${MULTI_HOUSE.DUTY_PERIOD_PENDING_BASIS}). 이후 그 요건을 채우지 못하게 되면 사유 발생일이 속하는 달의 말일부터 ` +
  `2개월 이내에 중과했을 세액과의 차액을 신고·납부해야 합니다(${MULTI_HOUSE.DUTY_PERIOD_PENDING_CLAWBACK_BASIS}).`;
