/**
 * 일반건물 비사업용토지 면적 안분 헬퍼 (소득세법 §104의3 — 초과분만 중과)
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음. 순수 함수.
 * general-building-valuation.ts 800줄 정책 회피를 위한 sibling 분리.
 * valuation·extension(환산 경로)·route-helper(실거래가 경로) 3곳이 공유.
 */

import { safeMultiplyThenDivide } from "./tax-utils";

/**
 * 사업용 면적 직접 안분 — 금액 × (사업용 인정면적 / 전체 토지면적).
 *
 * 비율을 4자리로 반올림한 뒤 곱하던 방식(round 의존)을 면적 직접 안분으로 대체.
 * 인정면적/전체면적이 무한소수 비율(예: 80/350)일 때 사업용·비사업용 경계가
 * 어긋나던 수만 원대 오차를 제거한다. 비사업용분은 호출측에서 잔액 흡수.
 *
 * 분자(금액 × 면적)는 MAX_SAFE_INTEGER 이내이므로 소수 면적도
 * safeMultiplyThenDivide가 정확히 처리한다.
 *
 * @param amount       안분 대상 금액 (양도가·환산취득가·개산공제)
 * @param businessArea 사업용 인정면적 (㎡) = 전체 − 초과분
 * @param totalArea    전체 토지면적 (㎡)
 */
export function apportionLandByBusinessArea(
  amount: number,
  businessArea: number,
  totalArea: number,
): number {
  if (totalArea <= 0 || businessArea >= totalArea) return amount;
  if (businessArea <= 0) return 0;
  return Math.floor(safeMultiplyThenDivide(amount, businessArea, totalArea));
}
