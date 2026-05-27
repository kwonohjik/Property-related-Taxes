/**
 * §63②3호 상장법인 증자 신주(미상장) 평가 — 배당차액 차감 (PR-L3)
 *
 * 상증법 §63②3호: 거래소에 상장된 법인의 주식 중 그 법인의 증자로 취득한 새로운 주식으로서
 *   평가기준일 현재 상장되지 아니한 주식. (제1항제1호에도 불구하고 대통령령 방법.)
 * 상증령 §57③: 평가 = (상장 동일 법인 주식의 법 §63①1호가목 평가액) − 재정경제부령 배당차액.
 * 시행규칙 §18②: 배당차액 = [산식 — MCP 렌더 누락(L-1)]. 다만 정관상 신주의 배당기산일을
 *   기존 상장주식과 동일하게 정하면 제외(= 배당차액 0).
 *
 * ★ L-1 (추정 인용 금지): §18② 산식 박스 미확정 → 배당차액은 사용자 직접 입력값 신뢰.
 *   자동 산식 계산 없음. 단서(배당기산일 동일)만 엔진 분기.
 *   정책: feedback_korean_law_82_vs_81_2_drift · feedback_no_silent_apportion_fallback
 *
 * KoreanLaw 검증: 법 mst=276123 §63②3호·③ / 령 mst=283637 §57③ / 규칙 mst=284609 §18② (2026-05-27).
 */

/**
 * 유효 배당차액 해소 (§18② 단서 반영).
 *
 * @param rawDividendDifference 배당차액 직접 입력값 (원/주). §18② 산출액.
 * @param sameBaseDate 정관상 배당기산일을 기존 상장주식과 동일하게 정함 → 배당차액 제외(§18② 단서).
 * @returns 유효 배당차액 (원/주, 0 이상 정수). sameBaseDate면 0.
 */
export function resolveEffectiveDividendDifference(
  rawDividendDifference: number,
  sameBaseDate: boolean,
): number {
  if (sameBaseDate) return 0; // §18② 단서: 배당기산일 동일 → 배당차액 제외
  return Math.max(0, Math.floor(rawDividendDifference)); // 차감액은 0 이상
}

/**
 * §63②3호 1주당 평가액 산정 (§57③).
 *
 * 1주당 = (§63①1호가목 평가액: 상장 동일 법인 전후 2개월 평균) − 유효 배당차액.
 * 음수 방지(0 하한).
 *
 * @param listedAvgPerShare §63①1호가목 평가액 (전후 2개월 최종시세 평균, 원/주).
 * @param rawDividendDifference 배당차액 직접 입력값 (원/주).
 * @param sameBaseDate §18② 단서 (배당기산일 동일 → 배당차액 0).
 */
export function applyCapitalIncreaseShareValuation(
  listedAvgPerShare: number,
  rawDividendDifference: number,
  sameBaseDate: boolean,
): { effectiveDividendDifference: number; perShareValue: number } {
  const eff = resolveEffectiveDividendDifference(rawDividendDifference, sameBaseDate);
  const perShare = Math.max(0, Math.floor(listedAvgPerShare) - eff); // §57③: 가목 − 배당차액, 0 하한
  return { effectiveDividendDifference: eff, perShareValue: perShare };
}
