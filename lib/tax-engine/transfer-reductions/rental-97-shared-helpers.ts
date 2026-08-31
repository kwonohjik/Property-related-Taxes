/**
 * 장기임대 §97 시리즈 — 공유 순수 헬퍼
 *
 * 레거시 `rental-housing-reduction.ts`에 복제돼 있던 순수 함수 3종의 **단일 소스**다(D1-08).
 * 레거시는 이 파일을 import한다 — 같은 조문의 임대기간을 두 곳에서 판정하지 않는다.
 *
 * 법령 근거:
 * - 공실 유예: **조문마다 다르다** — 아래 RENTAL_VACANCY_GRACE_MONTHS_* 주석 참조
 * - 임대료 5% 증액 제한·전월세 전환: 조특령 §97의3③1호 (민특법 §44④ 기준 준용)
 */

import { addDays, addMonths, differenceInDays, differenceInYears } from "date-fns";
import type { Rental97RentHistoryItem, Rental97VacancyPeriod } from "./types";

/**
 * 공실 유예 3월 — §97·§97의2·§97의3·§97의4 (D1-03·D2-08).
 *
 * 조특령 §97⑤5호가 「재정경제부령이 정하는 기간은 이를 주택임대기간에 산입할 것」으로 위임하고,
 * 그 종점인 **조특칙 §44**가 「기존 임차인의 퇴거일부터 다음 임차인의 **입주일**까지의 기간으로서
 * **3월이내**의 기간」이라 정한다.
 *
 * 이 5호는 다음 경로로 네 조문에 걸린다:
 * - §97의2 ← 조특령 §97의2② 「제97조제2항 내지 제6항 준용」(⑤ 전체)
 * - §97의3 ← 조특령 §97의3④ 「제97조제5항제1호ㆍ제3호 및 **제5호** 준용」
 * - §97의4 ← 조특령 §97의4② 「제97조제5항제1호ㆍ제3호 및 **제5호** 준용」
 */
export const RENTAL_VACANCY_GRACE_MONTHS_97 = 3;

/**
 * 공실 유예 6개월 — **§97의5 전용** (조특령 §97의5①1호).
 *
 * 「기존 임차인의 퇴거일부터 다음 임차인의 **주민등록을 이전하는 날**까지의 기간으로서
 * **6개월 이내**의 기간」 — 기산 종점도 3월 규칙(「입주일」)과 다르다.
 *
 * ⚠️ §97의5③은 조특령 §97⑤ 중 **1호·3호만** 준용하고 **5호를 준용하지 않는다** —
 *    그래서 조특칙 §44의 3월이 §97의5에는 걸리지 않고, 이 6개월이 §97의5 고유 규칙이다.
 *    반대로 이 6개월을 다른 조문에 전용하면 임대기간이 과대 산정돼 감면이 과다 적용된다.
 */
export const RENTAL_VACANCY_GRACE_MONTHS_97_5 = 6;

/** 전월세 전환율 기본값 (DB 미설정 시) */
export const DEFAULT_JEONSE_CONVERSION_RATE = 0.04;

export interface RentalRentViolation {
  contractIndex: number;
  contractDate: Date;
  increaseRate: number;
  maxAllowed: number;
}

/**
 * 유효 임대기간(년) 계산.
 *
 * - 유예 **이내**의 공실은 계속 임대한 것으로 보아 차감하지 않는다.
 * - 유예를 **초과**하면 그 구간 **전체**를 차감한다 — 조문이 산입 대상을 「…까지의 기간으로서
 *   3월(6개월)이내의 기간」으로 정의하므로, 유예를 넘긴 공실은 구간째로 산입 대상이 아니다.
 *   (초과분만 차감하는 것이 아니다.)
 * - 경계는 **「이내」라서 포함**이다 — 정확히 3월/6개월이면 차감하지 않는다.
 * - 유예는 **달력 월**로 잰다(`addMonths`). 「3월」을 90일로 환산하면 월 길이에 따라
 *   최대 이틀이 어긋나 납세자에게 불리해질 수 있다.
 *
 * @param graceMonths 조문별 유예 개월 — `RENTAL_VACANCY_GRACE_MONTHS_97`(3) 또는
 *                    `RENTAL_VACANCY_GRACE_MONTHS_97_5`(6). 기본값을 두지 않는다:
 *                    호출부가 조문을 명시하지 않으면 컴파일이 실패해야 한다.
 */
export function calculateEffectiveRentalPeriod(
  rentalStartDate: Date,
  transferDate: Date,
  vacancyPeriods: Rental97VacancyPeriod[],
  graceMonths: number,
): number {
  const totalDays = differenceInDays(transferDate, rentalStartDate);
  if (totalDays <= 0) return 0;

  let deductDays = 0;
  for (const vp of vacancyPeriods) {
    const graceEnd = addMonths(vp.startDate, graceMonths);
    if (vp.endDate.getTime() > graceEnd.getTime()) {
      deductDays += differenceInDays(vp.endDate, vp.startDate);
    }
  }

  const effectiveDays = Math.max(0, totalDays - deductDays);
  const effectiveEndDate = addDays(rentalStartDate, effectiveDays);
  return differenceInYears(effectiveEndDate, rentalStartDate);
}

/**
 * 환산보증금 = 보증금 + (월세 × 12 / 전월세전환율). 원 미만 절사.
 */
export function convertToStandardDeposit(
  rent: Rental97RentHistoryItem,
  conversionRate: number,
): number {
  if (rent.contractType === "jeonse") {
    return rent.deposit;
  }
  return rent.deposit + Math.floor((rent.monthlyRent * 12) / conversionRate);
}

/**
 * 직전 계약 대비 임대료 증액률 검증 — 환산보증금 5% 이내 (조특령 §97의3③1호).
 * 위반 1건이라도 있으면 감면 전액 배제.
 */
export function validateRentIncrease(
  history: Rental97RentHistoryItem[],
  conversionRate: number,
  limit: number = 0.05,
): { isAllValid: boolean; violations: RentalRentViolation[] } {
  if (history.length < 2) return { isAllValid: true, violations: [] };

  const violations: RentalRentViolation[] = [];

  for (let i = 1; i < history.length; i++) {
    const prev = convertToStandardDeposit(history[i - 1], conversionRate);
    const curr = convertToStandardDeposit(history[i], conversionRate);

    if (prev === 0) continue; // 직전 환산보증금 0 — 비교 불가

    const increaseRate = (curr - prev) / prev;
    if (increaseRate > limit + 1e-9) {
      violations.push({
        contractIndex: i,
        contractDate: history[i].contractDate,
        increaseRate,
        maxAllowed: limit,
      });
    }
  }

  return { isAllValid: violations.length === 0, violations };
}

/**
 * 임대기간 분 양도차익 비율 (조특령 §97의3⑤·§97의5② 기준시가 안분).
 *
 * - 취득 즉시 임대(rentalStartDate ≤ acquisitionDate): 전체가 임대기간 → 1
 * - 그 외: (양도시 − 임대개시시) / (양도시 − 취득시) 기준시가 비례, 0~1 클램프
 * - 분모 ≤ 0 또는 3점 미입력: null 반환 — 호출측에서 불적용 사유 처리 (silent 안분 금지)
 */
export function calcRentalGainRatio(args: {
  rentalStartDate: Date;
  acquisitionDate: Date;
  stdPriceAtAcquisition?: number;
  stdPriceAtRentalStart?: number;
  stdPriceAtTransfer?: number;
}): number | null {
  if (args.rentalStartDate.getTime() <= args.acquisitionDate.getTime()) return 1;

  const { stdPriceAtAcquisition: acq, stdPriceAtRentalStart: start, stdPriceAtTransfer: transfer } = args;
  if (
    acq === undefined || start === undefined || transfer === undefined ||
    acq <= 0 || start <= 0 || transfer <= 0
  ) {
    return null;
  }
  const denominator = transfer - acq;
  if (denominator <= 0) return null;
  const ratio = (transfer - start) / denominator;
  return Math.min(1, Math.max(0, ratio));
}
