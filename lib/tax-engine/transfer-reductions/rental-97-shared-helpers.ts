/**
 * 장기임대 §97 시리즈 — 공유 순수 헬퍼
 *
 * rental-housing-reduction.ts(레거시 정밀 엔진)에서 검증된 순수 함수 3종을 이식.
 * 레거시 파일은 UI 미배선 dead path + 조문 매핑 드리프트(D-1·D-2·D-3)가 있어
 * 전체 재사용 대신 순수 함수만 분리 (plan §3 통합 전략).
 *
 * 법령 근거:
 * - 공실 6개월 간주: 조특령 §97의5①1호 (기존 임차인 퇴거~다음 임차인 전입 6개월 이내는 계속 임대 간주)
 * - 임대료 5% 증액 제한·전월세 전환: 조특령 §97의3③1호 (민특법 §44④ 기준 준용)
 */

import { addDays, differenceInDays, differenceInYears } from "date-fns";
import type { Rental97RentHistoryItem, Rental97VacancyPeriod } from "./types";

/** 6개월 환산 일수 — 조특령 §97의5①1호 "6개월 이내" 공실은 계속 임대 간주 (초과분만 차감) */
export const RENTAL_VACANCY_GRACE_DAYS = 180;

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
 * - 공실 6개월(180일) 이상인 구간은 실제 일수만큼 차감 (6개월 이내 공실은 계속 임대 간주)
 * - 달력 기반 연수: 공실 차감 일수를 시작일에 더해 differenceInYears — 윤년 경계 안전
 */
export function calculateEffectiveRentalPeriod(
  rentalStartDate: Date,
  transferDate: Date,
  vacancyPeriods: Rental97VacancyPeriod[],
): number {
  const totalDays = differenceInDays(transferDate, rentalStartDate);
  if (totalDays <= 0) return 0;

  let deductDays = 0;
  for (const vp of vacancyPeriods) {
    const vpDays = differenceInDays(vp.endDate, vp.startDate);
    if (vpDays >= RENTAL_VACANCY_GRACE_DAYS) {
      deductDays += vpDays;
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
