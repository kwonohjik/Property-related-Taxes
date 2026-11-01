/**
 * 완전 지분 번들(축 B) 지분율 합 100% 검증의 허용 폭 — ⑧(클라이언트 `transfer-tax-validate.ts`)·⑫ 일반건물 지분
 * (`transfer-tax-building-share-schemas.ts`)·⑫ 축 B 가액 합 가드(`transfer-tax-schema.ts`)가 **같은 값**을 쓴다.
 *
 * 0.0006 = 0.06%p. 허용 이유는 균등 분할을 2자리 백분율로 입력할 때의 반올림 오차뿐이다 — 2자리 반올림 합은 3분할 99.99 ·
 * 6분할 100.02 · 7분할 100.03(실측 최대 0.03%p), 서버 상한 11건의 이론 최대는 11 × 0.005 = 0.055%p다. 이보다 넓으면 사용자가
 * 지분율을 잘못 입력해도 막히지 않고, 양도가액 합은 총액으로 고정된 채 취득가액만 지분율을 따라 어긋난다(종전 ±0.5%p에서
 * 합 99.5% +554,400원 · 합 100.4% −443,520원, 총 10억·취득 3억 시료). 1자리 입력(33.3×3 = 99.9%)은 의도적으로 막힌다.
 */
export const FRACTIONAL_RATIO_SUM_TOLERANCE = 0.0006;

/**
 * 부동소수 합산 오차 여유. 지분율 합은 `Σ parseFloat(n)/parseFloat(d)`라, 십진으로 정확히 허용 폭 끝인 합(99.94%·100.06%)이
 * 입력 모양·순서에 따라 `> 0.0006`을 넘거나 못 넘었다(정확 판정 대비 합 99.94%에서 48.7%·100.06%에서 19.4% 어긋남, 전부 «통과해야 하는데 차단»).
 * 부동소수 합산 오차(1e-15 안팎 추정)보다 크고 입력 해상도(2자리 1e-4 · 3자리 1e-5)보다 훨씬 작다 — 1e-12 이상이면 3자리 입력 30만 시료에서 불일치 0이었다.
 * (`fractional-sum-boundary-float.plan.md`)
 */
export const FRACTIONAL_RATIO_SUM_FLOAT_SLACK = 1e-9;

/** 지분율 합(비율, 1 = 100%)이 허용 대역 밖인가 — ⑧(`transfer-tax-validate.ts`)과 ⑫ 일반건물 지분이 같은 판정을 쓴다. ⑫ 축 B 가드는 정수 가액 비교라 쓰지 않는다. */
export function isFractionalRatioSumOutOfTolerance(sumRatio: number): boolean {
  return Math.abs(sumRatio - 1) > FRACTIONAL_RATIO_SUM_TOLERANCE + FRACTIONAL_RATIO_SUM_FLOAT_SLACK;
}
