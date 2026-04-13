import type { TaxBracket } from "./types";

/**
 * 누진세율 계산 (정수 연산)
 * 과세표준에 해당하는 구간의 세율을 적용하여 산출세액을 계산
 */
export function calculateProgressiveTax(
  taxableAmount: number,
  brackets: TaxBracket[],
): number {
  if (taxableAmount <= 0) return 0;

  for (const bracket of brackets) {
    const max = bracket.max ?? Infinity;
    if (taxableAmount <= max) {
      // 곱셈 먼저, 나눗셈 나중 (정수 연산 원칙)
      return Math.floor(taxableAmount * bracket.rate) - bracket.deduction;
    }
  }

  // 최고 구간 적용
  const last = brackets[brackets.length - 1];
  return Math.floor(taxableAmount * last.rate) - last.deduction;
}

/**
 * 천원 미만 절사
 */
export function truncateToThousand(amount: number): number {
  return Math.floor(amount / 1000) * 1000;
}

/**
 * 만원 미만 절사
 */
export function truncateToTenThousand(amount: number): number {
  return Math.floor(amount / 10000) * 10000;
}

/**
 * 원 미만 절사 (소수점 제거)
 */
export function truncateToWon(amount: number): number {
  return Math.floor(amount);
}

/**
 * 안전한 정수 곱셈 (BigInt fallback)
 * Number.MAX_SAFE_INTEGER 초과 시 BigInt 사용
 */
export function safeMultiply(a: number, b: number): number {
  const result = a * b;
  if (Math.abs(result) > Number.MAX_SAFE_INTEGER) {
    return Number(BigInt(a) * BigInt(b));
  }
  return result;
}

/**
 * 비율 적용 후 절사 (곱셈-후-나눗셈 순서)
 * amount * rate를 계산하되, 부동소수점 오차 방지를 위해 즉시 Math.floor
 */
export function applyRate(amount: number, rate: number): number {
  return Math.floor(amount * rate);
}
