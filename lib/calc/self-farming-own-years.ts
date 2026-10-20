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

/**
 * 피상속인 경작기간(조특령 §66⑪·⑫)을 합산할 수 있는 취득인가 — **상속이면서 상속인이 아닌 수유자가 아닐 때**.
 *
 * ⑪·⑫는 「**상속인이** 상속받은 농지」다. 상속인이 아닌 수유자(유증·사인증여)에게는 합산을 부인한 결정이 있다
 * (조심2021구1132 · 조심2023중10792). 상속인이 유증·사인증여로 받은 농지는 합산한다(부동산거래관리과-370).
 * 화면(`Step5.tsx`) · ④(`toEngineReductions`) · ⑧(`transfer-tax-validate-reductions.ts`)이 이 술어 하나를 쓴다 —
 * 화면이 숨긴 칸의 값을 ④가 싣거나 ⑧이 묻지 않게(계획서 `sp69-77-non-heir-bequest.plan.md`).
 */
export function selfFarmingDecedentAggregable(asset: {
  acquisitionCause?: string;
  nonHeirBequest?: boolean;
}): boolean {
  return asset.acquisitionCause === "inheritance" && asset.nonHeirBequest !== true;
}
