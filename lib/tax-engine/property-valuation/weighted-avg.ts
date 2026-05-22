/**
 * Phase 2 모듈 — 3년 가중평균 (별지 부표3 6쪽 아·자·차 산출)
 *
 * 법령: 상증령 §56 ① + 상증규 §17 (KoreanLaw 검증 2026-05-22)
 *
 * §56①: "1주당 최근 3년간 순손익액의 가중평균액 = 다음 계산식. 음수인 경우에는 영으로 한다."
 *       계산식: (1년전 × 3 + 2년전 × 2 + 3년전 × 1) / 6
 *
 * §17 (상증규): "영 제54조제1항의 계산식에서 '재정경제부령으로 정하는 이자율'이란
 *               연간 100분의 10을 말한다."
 *
 * ★ Pre-Do P1-A1 환류 (2026-05-22):
 *   현행 엔진은 "회사 전체 가중평균 ÷ (주식수 × 환원율)" 단일 floor로 PDF와 5~8원 차이.
 *   본 모듈은 PDF 산식 준수: 1주당 순손익액(사) → 1주당 가중평균(아) floor →
 *   ÷ 환원율 (자) floor → 1주당 순손익가치(차).
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 */

/**
 * 3년 가중평균 산정 — §56①
 *
 * @param perShareIncomes [1년전, 2년전, 3년전] 1주당 순손익액 (사. = 마 / 바)
 * @returns 아. 1주당 순손익액 가중평균 (음수면 0)
 */
export function calcWeightedAvg3y(
  perShareIncomes: [number, number, number],
): number {
  const [y1, y2, y3] = perShareIncomes;
  const weighted = (y1 * 3 + y2 * 2 + y3 * 1) / 6;
  // §56① 후단: 음수면 0
  if (weighted <= 0) return 0;
  return Math.floor(weighted);
}

/**
 * 1주당 순손익가치 = 가중평균 ÷ 환원율 (별지 6쪽 차.)
 *
 * @param weightedAvg 아. 1주당 가중평균 (음수 시 이미 0 처리됨)
 * @param capitalizationRate 자. 환원율 (기본 0.10 — 상증규 §17)
 * @returns 차. 1주당 순손익가치
 *
 * ★ Pre-Do 환류 반영: floor 시점이 PDF 산식과 정합
 *   weightedAvg는 이미 floor된 1주당 가중평균 → ÷환원율 → floor
 */
export function calcPerShareNetIncomeValue(
  weightedAvg: number,
  capitalizationRate: number,
): number {
  if (weightedAvg <= 0 || capitalizationRate <= 0) return 0;
  return Math.floor(weightedAvg / capitalizationRate);
}

/**
 * 1주당 가중평균 (⑥-㉠) — 별지 1쪽
 *
 * 일반 본칙 (§54① 본문): (1주당 순손익가치 × 3 + 1주당 순자산가치 × 2) / 5
 * 부동산과다보유 (§54① 본문 괄호): (1주당 순손익가치 × 2 + 1주당 순자산가치 × 3) / 5
 *
 * @param netIncomePerShare ⑤ 1주당 순손익가치
 * @param netAssetPerShare ④ 1주당 순자산가치
 * @param isRealEstateHeavy 부동산과다보유법인 여부
 */
export function calcPerShareWeightedValuation(
  netIncomePerShare: number,
  netAssetPerShare: number,
  isRealEstateHeavy: boolean,
): number {
  const [niW, naW] = isRealEstateHeavy ? [2, 3] : [3, 2];
  const weighted = (netIncomePerShare * niW + netAssetPerShare * naW) / 5;
  return Math.floor(weighted);
}

/**
 * 80% 하한 적용 (§54① 단서) — 별지 1쪽 ⑥-㉡
 *
 * @param netAssetPerShare ④ 1주당 순자산가치
 * @returns ⑥-㉡ = ④ × 0.80
 */
export function calcNetAssetFloor80(netAssetPerShare: number): number {
  if (netAssetPerShare <= 0) return 0;
  return Math.floor(netAssetPerShare * 0.8);
}

/**
 * 최종 1주당 평가액 ⑥ — max(㉠, ㉡)
 *
 * §54① 단서: "가중평균한 가액이 1주당 순자산가치에 100분의 80을 곱한 금액보다 낮은 경우에는
 *           1주당 순자산가치에 100분의 80을 곱한 금액을 비상장주식등의 가액으로 한다."
 */
export function calcFinalPerShareValue(
  weightedAvgPerShare: number,
  netAssetFloor80: number,
): { finalValue: number; floorApplied: boolean } {
  if (netAssetFloor80 > weightedAvgPerShare) {
    return { finalValue: netAssetFloor80, floorApplied: true };
  }
  return { finalValue: weightedAvgPerShare, floorApplied: false };
}
