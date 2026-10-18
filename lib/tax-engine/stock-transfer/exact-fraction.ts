/**
 * 정확 유리수(BigInt 분자·분모) — lot 이동평균 풀의 잔여 지분·① 채택 몫 전용
 *
 * 이동평균은 매도 뒤 모든 lot 잔여를 같은 비율(after ÷ before)로 줄인다. 그 비율을 부동소수로 곱하면
 * 425가 424.99999…가 되어 나누어떨어지는 평균이 1원 내려가고, 그 1원이 매도 주식수만큼 곱해진다.
 * 잔고 주식수·단가는 정수(Zod `int()` · 희석·② 단가는 floor)라 비율이 유리수다 → 정확히 들 수 있다.
 * 계획서: docs/02-design/features/stock-valuation-details-moving-avg-81-4.plan.md §4.1
 *
 * 값은 0 이상만 다룬다(주식수·단가·금액). BigInt는 JSON에 실을 수 없으니 결과 객체에는 number로 바꿔 싣는다.
 *
 * Layer 2 (Pure Engine).
 */

export interface Frac {
  n: bigint;
  d: bigint; // > 0
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function norm(n: bigint, d: bigint): Frac {
  const g = gcd(n, d);
  return g > 1n ? { n: n / g, d: d / g } : { n, d };
}

/** 정수(number) → 분수. 정수가 아니면 BigInt 가 RangeError — 운영 경로는 전부 정수다 */
export const frac = (n: number | bigint, d: number | bigint = 1n): Frac => norm(BigInt(n), BigInt(d));
export const FRAC_ZERO: Frac = { n: 0n, d: 1n };

export const fracAdd = (a: Frac, b: Frac): Frac => norm(a.n * b.d + b.n * a.d, a.d * b.d);
export const fracMul = (a: Frac, b: Frac): Frac => norm(a.n * b.n, a.d * b.d);
export const fracDiv = (a: Frac, b: Frac): Frac => norm(a.n * b.d, a.d * b.n);
export const fracIsZero = (a: Frac): boolean => a.n === 0n;

/** 약분 — 약분 없이 누적한 값을 마지막에 한 번 정리할 때 */
export const fracReduce = (a: Frac): Frac => norm(a.n, a.d);

/**
 * 약분 없이 더한다 — 한 분모가 다른 분모의 배수이면 곱셈 한 번으로 통분한다(최대공약수 계산 생략).
 * 이동평균 풀의 가중치 합은 매수 때만 정수배로 커지므로 앞선 분모가 늘 뒤 분모의 약수다 — 매도 수백 건에서
 * 매번 큰 수의 최대공약수를 구하면 수 초가 걸린다. 배수 관계가 아니면 일반 덧셈으로 떨어진다.
 */
export function fracAddLazy(a: Frac, b: Frac): Frac {
  if (a.n === 0n) return b;
  if (b.n === 0n) return a;
  if (b.d % a.d === 0n) return { n: a.n * (b.d / a.d) + b.n, d: b.d };
  if (a.d % b.d === 0n) return { n: a.n + b.n * (a.d / b.d), d: a.d };
  return fracAdd(a, b);
}

/** floor — 0 이상 전제(BigInt 나눗셈은 0 방향 절사) */
export const fracFloor = (a: Frac): number => Number(a.n / a.d);

/**
 * 표시·echo 용 number — 정수면 정확한 정수. 분자·분모가 number 범위를 넘어도(매도 수백 건) 몫·나머지로 나눠
 * Infinity ÷ Infinity = NaN 이 되지 않게 한다. 소수부는 2⁻⁵² 단위로 자른다(표시용).
 */
export const fracToNumber = (a: Frac): number => {
  if (a.d === 1n) return Number(a.n);
  const q = a.n / a.d;
  return Number(q) + Number(((a.n % a.d) << 52n) / a.d) / 2 ** 52;
};
