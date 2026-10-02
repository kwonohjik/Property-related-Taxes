/**
 * 자경농지 감면(조특법 §69) — 본인 순 자경기간이 요건(8년)을 혼자 채우는가.
 *
 * 순 기간 = 자경기간 − 결격 과세기간(조특령 §66⑭). 엔진 `calculateSelfFarmingReduction`의 `ownYears`와 같은 식이다.
 * 이미 채우면 피상속인 경작기간(§66⑪·⑫ 합산)은 결과를 바꾸지 않으므로 화면(`Step5.tsx`)은 합산 칸을 숨기고
 * 검증(`transfer-tax-validate-reductions.ts`)은 합산 요건 확인을 묻지 않는다 — 두 곳이 이 술어 하나를 쓴다(C1).
 */
const SELF_FARMING_MIN_YEARS = 8;

export function selfFarmingOwnYearsSufficient(farmingYears?: string, disqualifiedTaxPeriodsSelf?: string): boolean {
  const net = Math.max(0, (parseInt(farmingYears ?? "0") || 0) - (parseInt(disqualifiedTaxPeriodsSelf ?? "0") || 0));
  return net >= SELF_FARMING_MIN_YEARS;
}
