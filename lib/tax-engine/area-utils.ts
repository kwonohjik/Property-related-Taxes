/**
 * 면적 안분 유틸 — 전 세목 공통 leaf 모듈 (무의존).
 *
 * UI(`use client`)·엔진·bridge 가 모두 이 모듈만 import 한다.
 * 의존이 없어야 무거운 엔진 모듈 그래프가 클라이언트 번들에 유입되지 않는다
 * (`tax-utils.ts`는 date-fns 의존 → 면적 유틸을 그쪽에 두지 않는다).
 *
 * ## 면적 안분 규칙 (강제)
 *
 * 1. 안분 면적은 **소수점 3째 자리에서 반올림**해 2자리까지 확정 — `round2()`.
 *    금액(원)의 `Math.floor` 절사와 달리 면적은 반올림한다.
 * 2. **마지막 항목은 잔액 흡수** — `residualArea(전체, ...앞선 항목들)`.
 *    비율로 직접 재계산하지 않는다.
 *
 * 두 규칙이 함께 `Σ안분면적 = 전체면적` 불변식과 "표시값 = 계산값"을 보장한다.
 */

/**
 * 면적 소수점 2자리 반올림(3째 자리에서 반올림).
 *
 * 화면 표시(`toFixed(2)`)와 계산값을 일치시켜 "표시 76.51 / 계산 76.508" 드리프트를 차단한다.
 * 반올림한 면적을 이후 단가 곱셈에 그대로 사용할 것.
 */
export function round2(area: number): number {
  return Math.round(area * 100) / 100;
}

/**
 * 면적 안분 잔액 — **마지막 항목 전용**. `전체 − 앞서 확정된 항목들의 합`.
 *
 * 각 항목을 독립적으로 `round2(전체 × 비율)` 하면 합이 전체와 어긋난다
 * (예: 100㎡를 3등분 → 33.33 × 3 = 99.99). 마지막 항목이 잔액을 흡수해
 * `Σ안분면적 = 전체` 불변식을 보장한다.
 *
 * @param total 안분 대상 전체 면적 (㎡)
 * @param allocated 앞서 `round2` 로 확정된 항목들의 면적
 */
export function residualArea(total: number, ...allocated: number[]): number {
  return round2(round2(total) - allocated.reduce((s, a) => s + a, 0));
}
