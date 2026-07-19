/**
 * §155②③ 상속주택·공동상속주택 비과세 주택수 제외 산정 (Tier 2-A2 + 단서·순위 게이트 완성)
 *
 * 일반주택 양도 시, 세대가 보유한 상속주택을 비과세 판정 주택수에서 제외한다.
 * - 단독상속 풀(§155②): isInherited && !isCoInherited → 적격 1채이면 제외 1채.
 * - 공동상속 풀(§155③): isInherited && isCoInherited && 최대지분자 아님 → 적격 1채이면 제외 1채.
 *   최대지분자(isLargestCoInheritedShareholder === true)는 산입(제외 안 함, §155③ 단서).
 * - 양도(일반)주택이 상속개시 2년내 피상속인 증여분이면 §155② 전체 게이트-오프.
 *
 * 적격(제외 후보) 게이트 2종 — 둘 다 통과해야 상속주택으로 인정(§155③도 단서 준용):
 * - 동거봉양 단서(§155② 단서): 상속개시 당시 피상속인과 동일세대(decedentSameHouseholdAtInheritance)
 *   이면 특례 배제. 단, 동거봉양 합가+합가 전 보유(parentalCareMergeInheritedHouse)면 예외로 인정.
 * - 순위(§155②1~4호): 피상속인 2주택↑ 중 순위상 상속주택 아니면(isRankingDisqualifiedInheritedHouse)
 *   부적격. (자기선언 — 엔진은 피상속인 전체 포트폴리오를 알 수 없음.)
 *
 * 각 풀 적격 2채↑는 선순위 특정 불가 → 보수적으로 제외 0(§155②·③ 원문상 인정 상속주택은 1채이나
 * 피상속인이 다르면 엔진이 우열을 못 정함). 순위 게이트로 하위순위를 배제하면 적격 1채만 남아 제외 1채.
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
  /** §155② 단서(동일세대·비동거봉양)로 제외 배제된 상속주택 수 — 표시용 */
  sameHouseholdDisqualifiedCount: number;
  /** §155②1~4호 순위 부적격으로 제외 배제된 상속주택 수 — 표시용 */
  rankingDisqualifiedCount: number;
}

/** 동거봉양 단서(§155② 단서) 게이트 — 별도세대이거나 동거봉양 합가 전 보유분이면 통과. */
function passesHouseholdGate(h: HouseInfo): boolean {
  return h.decedentSameHouseholdAtInheritance !== true || h.parentalCareMergeInheritedHouse === true;
}

/** 순위(§155②1~4호) 게이트 — 순위 부적격 선언이 없으면 통과. */
function passesRankingGate(h: HouseInfo): boolean {
  return h.isRankingDisqualifiedInheritedHouse !== true;
}

export function resolveInheritedHouseExclusion(
  houses: HouseInfo[] | undefined,
  sellingHouseId: string | undefined,
  generalHouseGiftedFromDecedentWithin2yr: boolean | undefined,
): InheritedHouseExclusionResult {
  const empty: InheritedHouseExclusionResult = {
    soleExcludedCount: 0,
    coExcludedCount: 0,
    excludedCount: 0,
    sameHouseholdDisqualifiedCount: 0,
    rankingDisqualifiedCount: 0,
  };
  if (generalHouseGiftedFromDecedentWithin2yr || !houses) return empty;

  const inheritedOthers = houses.filter((h) => h.isInherited && h.id !== sellingHouseId);

  // 표시용 부적격 카운트 — 제외 후보(단독 or 공동 소수지분)만 대상. household 사유 우선.
  let sameHouseholdDisqualifiedCount = 0;
  let rankingDisqualifiedCount = 0;
  for (const h of inheritedOthers) {
    const isExclusionCandidate = !h.isCoInherited || h.isLargestCoInheritedShareholder !== true;
    if (!isExclusionCandidate) continue; // 최대지분 공동상속 = 산입(별도 처리), 부적격 표시 대상 아님
    if (!passesHouseholdGate(h)) sameHouseholdDisqualifiedCount++;
    else if (!passesRankingGate(h)) rankingDisqualifiedCount++;
  }

  const eligible = inheritedOthers.filter((h) => passesHouseholdGate(h) && passesRankingGate(h));
  const soleCount = eligible.filter((h) => !h.isCoInherited).length;
  const coMinorityCount = eligible.filter(
    (h) => h.isCoInherited && h.isLargestCoInheritedShareholder !== true,
  ).length;
  const soleExcludedCount = soleCount === 1 ? 1 : 0;
  const coExcludedCount = coMinorityCount === 1 ? 1 : 0;
  return {
    soleExcludedCount,
    coExcludedCount,
    excludedCount: soleExcludedCount + coExcludedCount,
    sameHouseholdDisqualifiedCount,
    rankingDisqualifiedCount,
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
  // 부적격 상속주택 안내(제외 대상 아님) — 주택수 불변, 산식 투명성용.
  if (result.sameHouseholdDisqualifiedCount > 0) {
    steps.push({
      label: "동일세대 상속주택 — 주택수 제외 배제 (§155② 단서)",
      formula: `상속개시 당시 피상속인과 동일세대(동거봉양 합가 아님) ${result.sameHouseholdDisqualifiedCount}채 — 주택수 제외 대상 아님`,
      amount: 0,
      legalBasis: INHERITED_HOUSE.EXEMPTION_SOLE_BASIS,
    });
  }
  if (result.rankingDisqualifiedCount > 0) {
    steps.push({
      label: "순위 부적격 상속주택 — 주택수 제외 배제 (§155②1~4호)",
      formula: `피상속인 2주택 이상 중 순위상 상속주택 아님 ${result.rankingDisqualifiedCount}채 — 주택수 제외 대상 아님`,
      amount: 0,
      legalBasis: INHERITED_HOUSE.EXEMPTION_SOLE_BASIS,
    });
  }
  return steps;
}
