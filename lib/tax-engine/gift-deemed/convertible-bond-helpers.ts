/**
 * §40 전환사채 자동계산 순수 헬퍼 — 이자손실분(§10의2)·초과분 비율(②⑤).
 * 엔진 코어(convertible-bond.ts) 밖에서 호출(lib/calc·변환계층) → 최종값(interestLoss·creditedShares)을 도출.
 * 모든 율·현가계수는 분수/정수 스케일 → applyRateFraction 정수연산(부동소수 0).
 */
import { applyRateFraction, safeMultiplyThenDivide } from "../tax-utils";

/** 현가계수·연금현가계수 스케일 — 5자리 소수 → 정수(0.73502 → 73502) */
export const PV_FACTOR_SCALE = 100_000;

/**
 * 이자손실분 (상증칙 §10의2) = ㉠ 사채발행이율 PV − ㉡ 적정할인율 PV.
 * ㉠ = 액면(par): 발행이율=표면이율·만기상환할증금 부재 시 발행이율 PV는 액면과 정확히 일치.
 *   (만기상환할증금이 있는 사채는 별도 처리 필요 — 현 범위 par 가정)
 * ㉡ = 공시 적정할인율 현가계수(문제 제공값) × 원금/연이자 → PV_FACTOR_SCALE 정수곱(0원 정확).
 */
export function bondInterestLoss(args: {
  maturityAmount: number; // 만기상환금액(원금) = ㉠ par
  annualCoupon: number; // 연이자 = 원금 × 사채발행이율
  pvFactorAppropriate: number; // 적정할인율 현가계수 ×1e5 (예: 0.73502 → 73502)
  annuityFactorAppropriate: number; // 적정할인율 연금현가계수 ×1e5 (예: 3.31212 → 331212)
}): number {
  const appropriatePV =
    applyRateFraction(args.maturityAmount, args.pvFactorAppropriate, PV_FACTOR_SCALE) +
    applyRateFraction(args.annualCoupon, args.annuityFactorAppropriate, PV_FACTOR_SCALE);
  return Math.max(0, args.maturityAmount - appropriatePV);
}

/**
 * 균등지분 초과분 비율 (②⑤ — §40①1호나·2호나).
 * 초과분 = 인수(전환)주식수 − 총인수가능주식수 × 본인 전환전 지분율.
 * 제3자(③⑥)는 균등배정 baseline 없음 → 호출 금지(교부 전부).
 */
export function computeExcessRatio(args: {
  subscribedShares: number; // 인수(전환) 주식수
  totalSubscribableShares: number; // 총인수가능주식수
  ownPreRatio: { numer: number; denom: number }; // 본인 전환전 지분율
}): { numer: number; denom: number } {
  if (args.subscribedShares <= 0) return { numer: 0, denom: 1 };
  const equalAllotment = safeMultiplyThenDivide(
    args.totalSubscribableShares,
    args.ownPreRatio.numer,
    args.ownPreRatio.denom,
  );
  const excess = Math.max(0, args.subscribedShares - equalAllotment);
  return { numer: excess, denom: args.subscribedShares };
}

/** 초과분 비율을 금액·주식수에 적용 (floor 정수) */
export function applyExcessRatio(amount: number, ratio: { numer: number; denom: number }): number {
  return safeMultiplyThenDivide(amount, ratio.numer, ratio.denom);
}
