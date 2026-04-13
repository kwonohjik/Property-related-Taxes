import { addDays, addMonths, addYears, differenceInDays, differenceInMonths, differenceInYears } from "date-fns";
import type { TaxBracket } from "./types";

// ============================================================
// P0-2 원칙: 세율(rate) × 금액(amount) 곱셈은 반드시 applyRate()를 사용.
// 직접 `amount * rate` 후 Math.floor를 쓰지 않는다.
// 이유: 부동소수점 오차가 후속 연산에 누적되는 것을 방지하기 위함.
// ============================================================

/**
 * 누진세율 계산 (정수 연산)
 * 과세표준에 해당하는 구간의 세율과 누진공제액을 적용하여 산출세액 반환.
 *
 * 공식: Math.floor(taxableAmount × rate) - 누진공제액
 * P0-1: Math.floor를 세율 곱셈 직후 적용 → 누진공제액(정수) 차감 순서 보장
 */
export function calculateProgressiveTax(
  taxableAmount: number,
  brackets: TaxBracket[],
): number {
  if (taxableAmount <= 0) return 0;

  for (const bracket of brackets) {
    const max = bracket.max ?? Infinity;
    if (taxableAmount <= max) {
      // P0-2: applyRate() = Math.floor(amount * rate) — 곱셈 직후 절사
      return applyRate(taxableAmount, bracket.rate) - bracket.deduction;
    }
  }

  // 최고 구간 적용 (모든 max보다 큰 경우 — 정상적으로 도달하지 않음)
  const last = brackets[brackets.length - 1];
  return applyRate(taxableAmount, last.rate) - last.deduction;
}

/**
 * [P0-2] 세율 적용 후 즉시 절사 (원 미만)
 * 모든 "세율 × 금액" 연산에 이 함수를 사용하여 부동소수점 오차 방지.
 * 직접 Math.floor(amount * rate) 사용 금지.
 */
export function applyRate(amount: number, rate: number): number {
  return Math.floor(amount * rate);
}

// ============================================================
// 절사 유틸
// ============================================================

/** 천원 미만 절사 — 양도세·재산세·취득세·상속세·증여세 과세표준 */
export function truncateToThousand(amount: number): number {
  return Math.floor(amount / 1000) * 1000;
}

/** 만원 미만 절사 — 종합부동산세 과세표준 */
export function truncateToTenThousand(amount: number): number {
  return Math.floor(amount / 10000) * 10000;
}

/** 원 미만 절사 — 산출세액 공통 */
export function truncateToWon(amount: number): number {
  return Math.floor(amount);
}

// ============================================================
// 정수 안전 연산
// ============================================================

/**
 * 안전한 정수 곱셈 (BigInt fallback)
 * Number.MAX_SAFE_INTEGER 초과 시 BigInt 사용
 */
export function safeMultiply(a: number, b: number): number {
  const result = a * b;
  if (Math.abs(result) > Number.MAX_SAFE_INTEGER) {
    return Number(BigInt(Math.round(a)) * BigInt(Math.round(b)));
  }
  return result;
}

/**
 * (a × b) ÷ c — 곱셈 먼저 수행하여 정밀도 유지.
 * Number.MAX_SAFE_INTEGER 초과 시 BigInt fallback.
 * c === 0 이면 0 반환 (division by zero 방어).
 */
export function safeMultiplyThenDivide(a: number, b: number, c: number): number {
  if (c === 0) return 0;
  const product = a * b;
  if (Math.abs(product) > Number.MAX_SAFE_INTEGER) {
    return Number(
      BigInt(Math.round(a)) * BigInt(Math.round(b)) / BigInt(Math.round(c)),
    );
  }
  return Math.floor(product / c);
}

/**
 * [P0-4] 비율 안분 계산 — amount × (numerator / denominator)
 * - denominator === 0 → 0 반환 (division by zero 방어)
 * - 비율 상한 1.0 적용: numerator > denominator 여도 amount 초과 불가
 *
 * 사용: 12억 초과분 과세 안분, 재산세↔종부세 비율 안분 공제
 */
export function calculateProration(
  amount: number,
  numerator: number,
  denominator: number,
): number {
  if (denominator === 0) return 0;
  // 비율 상한 1.0 — 분자가 분모를 초과해도 원금 이상 공제 방지
  const ratio = Math.min(numerator / denominator, 1.0);
  return Math.floor(amount * ratio);
}

// ============================================================
// 보유기간 계산
// ============================================================

/**
 * 세법상 보유기간 계산 (민법 초일불산입 원칙)
 * 기산일: 취득일 다음날 ~ 양도일 (양도일 포함)
 *
 * @returns { years, months, days } — 연·월·일 분리 (장기보유공제에는 years만 사용)
 */
export function calculateHoldingPeriod(
  acquisitionDate: Date,
  disposalDate: Date,
): { years: number; months: number; days: number } {
  // 민법 초일불산입: 취득일 다음날부터 기산
  const start = addDays(acquisitionDate, 1);

  const years = differenceInYears(disposalDate, start);
  const afterYears = addYears(start, years);

  const months = differenceInMonths(disposalDate, afterYears);
  const afterMonths = addMonths(afterYears, months);

  const days = differenceInDays(disposalDate, afterMonths);

  return { years: Math.max(0, years), months: Math.max(0, months), days: Math.max(0, days) };
}

// ============================================================
// 환산취득가액
// ============================================================

/**
 * 환산취득가액 계산 (취득가 불명 시)
 * 공식: 양도가액 × (취득 당시 기준시가 ÷ 양도 당시 기준시가)
 * standardPriceAtTransfer === 0 → 0 반환 (방어)
 */
export function calculateEstimatedAcquisitionPrice(
  transferPrice: number,
  standardPriceAtAcquisition: number,
  standardPriceAtTransfer: number,
): number {
  return safeMultiplyThenDivide(
    transferPrice,
    standardPriceAtAcquisition,
    standardPriceAtTransfer,
  );
}

// ============================================================
// P0-3: 중과세 유예 판단
// ============================================================

interface SurchargeSpecialRules {
  surcharge_suspended: boolean;
  suspended_types?: string[];
  suspended_until?: string; // ISO date string 'YYYY-MM-DD'
}

/**
 * [P0-3] 중과세 유예 여부 런타임 판단.
 * DB special_rules.suspended_until을 기준일(양도일)과 비교하여 판단.
 * suspended_until이 없거나 기준일이 지났으면 유예 종료(중과세 적용).
 *
 * @param specialRules  DB tax_rates.special_rules (surcharge category)
 * @param referenceDate 양도일 (기준일)
 * @param surchargeType 'multi_house_2' | 'multi_house_3plus' 등
 */
export function isSurchargeSuspended(
  specialRules: SurchargeSpecialRules | null | undefined,
  referenceDate: Date,
  surchargeType: string,
): boolean {
  if (!specialRules?.surcharge_suspended) return false;

  // 해당 유형이 유예 대상인지 확인
  if (
    specialRules.suspended_types &&
    !specialRules.suspended_types.includes(surchargeType)
  ) {
    return false;
  }

  // 유예 종료일 확인 (날짜 포함: referenceDate <= suspended_until)
  if (!specialRules.suspended_until) return false;
  const suspendedUntil = new Date(specialRules.suspended_until);
  return referenceDate <= suspendedUntil;
}
