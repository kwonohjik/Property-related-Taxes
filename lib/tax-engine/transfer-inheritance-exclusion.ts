/**
 * §155②③ 상속주택·공동상속주택 비과세 주택수 제외 산정 (Tier 2-A2 LEAN)
 *
 * 일반주택 양도 시, 세대가 보유한 상속주택을 비과세 판정 주택수에서 제외한다.
 * - 단독상속 풀(§155②): isInherited && !isCoInherited → 1채이면 제외 1채.
 * - 공동상속 풀(§155③): isInherited && isCoInherited && 최대지분자 아님 → 1채이면 제외 1채.
 *   최대지분자(isLargestCoInheritedShareholder === true)는 산입(제외 안 함, §155③ 단서).
 * - 양도(일반)주택이 상속개시 2년내 피상속인 증여분이면 §155② 전체 게이트-오프.
 *
 * ⚠️ 순위(§155②1~4호)는 제외 개수(세액)에 영향이 없어 미구현(Tier 2-B 이월).
 *    §155②(단독)·§155③(공동) 모두 인정 상속주택은 피상속인당 1채(§155③ 원문도 공동상속주택을
 *    "여러 사람이 공동소유하는 1주택"으로, 피상속인 2주택↑이면 §155②각호 순위 1주택으로 정의).
 *    따라서 각 풀 2채↑는 선순위 특정 불가 → 보수적으로 제외 0. 2채↑ 세대는 정정(제외 1채)이어도
 *    주택수가 1로 내려가지 않아 어차피 과세 → 세액은 단독·공동 풀 모두 보수적 0과 동일(불리 아님).
 */
import type { HouseInfo } from "./types/multi-house-surcharge.types";
import type { CalculationStep } from "./types/transfer.types";
import { INHERITED_HOUSE } from "./legal-codes";

export interface InheritedHouseExclusionResult {
  /** §155② 단독상속 상속주택 제외 수 (0 또는 1) */
  soleExcludedCount: number;
  /** §155③ 공동상속(소수지분) 주택 제외 수 (0 또는 1) */
  coExcludedCount: number;
  /** 합계 (0~2) */
  excludedCount: number;
}

export function resolveInheritedHouseExclusion(
  houses: HouseInfo[] | undefined,
  sellingHouseId: string | undefined,
  generalHouseGiftedFromDecedentWithin2yr: boolean | undefined,
): InheritedHouseExclusionResult {
  if (generalHouseGiftedFromDecedentWithin2yr || !houses) {
    return { soleExcludedCount: 0, coExcludedCount: 0, excludedCount: 0 };
  }
  const soleCount = houses.filter(
    (h) => h.isInherited && !h.isCoInherited && h.id !== sellingHouseId,
  ).length;
  const coMinorityCount = houses.filter(
    (h) =>
      h.isInherited &&
      h.isCoInherited &&
      h.isLargestCoInheritedShareholder !== true &&
      h.id !== sellingHouseId,
  ).length;
  const soleExcludedCount = soleCount === 1 ? 1 : 0;
  const coExcludedCount = coMinorityCount === 1 ? 1 : 0;
  return {
    soleExcludedCount,
    coExcludedCount,
    excludedCount: soleExcludedCount + coExcludedCount,
  };
}

/**
 * 상속·공동상속주택 주택수 제외 결과 → 비과세 판정 산식 step (단독 §155②·공동 §155③ 별도 행).
 * `before` = 상속 제외 진입 시점 주택수(hce·감면주택 제외 후). 단독→공동 순으로 per-step 델타를 체이닝해
 * 각 행이 실제 −1을 표시(두 행이 동일 range를 중복 표기하지 않도록 — feedback_engine_result_display_drift).
 */
export function buildInheritedExclusionSteps(
  result: InheritedHouseExclusionResult,
  before: number,
): CalculationStep[] {
  const steps: CalculationStep[] = [];
  const suffix = "(비과세 판정 한정 — 중과 주택수 불변)";
  const afterSole = before - result.soleExcludedCount;
  if (result.soleExcludedCount > 0) {
    steps.push({
      label: "상속주택 주택수 제외 (§155② 일반주택 양도)",
      formula: `상속주택 1채 — 주택수 ${before} → ${afterSole} ${suffix}`,
      amount: 0,
      legalBasis: INHERITED_HOUSE.EXEMPTION_SOLE_BASIS,
    });
  }
  if (result.coExcludedCount > 0) {
    steps.push({
      label: "공동상속주택(소수지분) 주택수 제외 (§155③)",
      formula: `공동상속주택 1채(소수지분) — 주택수 ${afterSole} → ${afterSole - result.coExcludedCount} ${suffix}`,
      amount: 0,
      legalBasis: INHERITED_HOUSE.EXEMPTION_CO_INHERITED_BASIS,
    });
  }
  return steps;
}
