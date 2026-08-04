/**
 * 「소득세법」 §95⑤ 제1호 — 비주택→주택 용도변경 시 **보유기간별 공제율** leaf
 *
 * `calcLongTermRate`(정본)만 의존하는 순수 leaf라 **클라이언트에서 직접 import해도 안전**하다.
 * `usage-period-info.ts`와 같은 목적 — UI 미리보기가 산식을 재구현하지 않게 한다.
 *
 * ⚠️ **`tax-utils.ts`에 두지 않은 이유**: 정본 `calcLongTermRate`가
 *    `transfer-tax-mixed-use-inheritance.ts`에 있고, 그 파일이 `tax-utils`의 `applyRate`를
 *    import한다 → `tax-utils` → `mixed-use-inheritance` → `tax-utils` 순환.
 *    게이트 상수(`LTHD_CONVERSION_95_5_CUTOFF` 등)는 import가 없어 `tax-utils`에 그대로 둔다.
 */
import { calcLongTermRate } from "./transfer-tax-mixed-use-inheritance";

/**
 * 「소득세법」 §95⑤ 제1호 — **보유기간별 공제율**(정수 %).
 *
 *   비주택으로 보유한 기간 → 표1 공제율
 * + 주택으로 보유한 기간   → 표2 **보유분** 공제율
 * = 합계 (다만 100분의 40을 초과하면 100분의 40 — 같은 호 단서)
 *
 * **정수 %로 반환하는 것이 이 함수의 핵심**이다. 소수 rate로 합산하면
 * `0.22 + 0.12 = 0.33999999999999997`이 되어 `applyRate` 결과가 1원 과소가 된다
 * (전 조합 17,576건 중 78건 — 문제 rate `0.28·0.34·0.38·0.66·0.68·0.70`).
 * 현행 표2 단독 경로는 두 항이 모두 0.04 배수라 이 값이 나오지 않지만, §95⑤은
 * 표1(0.02 배수)과 표2(0.04 배수)를 합쳐 **홀수 0.02 배수**를 새로 만든다.
 * 호출부는 반드시 `applyRateFraction(gain, pct, 100)`으로 적용할 것 —
 * 법문이 「100분의 N」이라 분수 정수 연산이 문언에도 부합한다.
 *
 * 각 구간의 **3년 미만 → 0%** 가드는 `calcLongTermRate`(정본)에 내장돼 있다.
 * 여기서 다시 판정하지 않는다.
 *
 * @param nonHousingYears 비주택으로 보유한 완성연수 (취득일 ~ 주거용 사용 개시일)
 * @param housingYears    주택으로 보유한 완성연수 (주거용 사용 개시일 ~ 양도일, §95⑥)
 */
export function calcConversionHoldingPct(
  nonHousingYears: number,
  housingYears: number,
): { table1Pct: number; table2HoldingPct: number; holdingPct: number; capped: boolean } {
  // Math.round는 정본의 소수 rate를 정수 분자로 되돌리는 변환일 뿐이다
  // (0.02·0.04 배수라 항상 정확한 정수 — 0~30년 전 구간 무오차 실증).
  // 금액 절사가 아니므로 "세법은 floor" 원칙과 무관하다.
  const table1Pct = Math.round(calcLongTermRate(nonHousingYears, 0, false) * 100);
  const table2HoldingPct = Math.round(calcLongTermRate(housingYears, 0, true) * 100);
  const raw = table1Pct + table2HoldingPct;
  return {
    table1Pct,
    table2HoldingPct,
    holdingPct: Math.min(raw, 40),
    capped: raw > 40,
  };
}
