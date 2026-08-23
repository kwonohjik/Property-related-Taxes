/**
 * §97의2②3호 비교 스코프 — **신고단위 결정세액** 판정 드라이버
 *
 * ## 왜 자산별 비교로는 안 되는가
 *
 * ②3호는 「제1항을 적용하여 계산한 **양도소득 결정세액**이 제1항을 적용하지 아니하고 계산한
 * **양도소득 결정세액**보다 적은 경우」라고 정한다. 「양도소득 결정세액」은 **§92③2호가 정의한
 * 용어**이고(산출세액 − §90 감면세액), 그 산출세액은 §92②3호의 과세표준 — 즉 **§103 기본공제를
 * 뺀 값** — 에 세율을 적용한 것이다. 기본공제는 **인별·과세기간 단위**라 「자산 1건의 결정세액」은
 * 조문 체계상 성립하지 않는다.
 *
 * 실무적으로도 갈린다. A/B 전환은 그 자산의 **세율군 자체를 바꾼다**
 * (A = 증여자 취득일 기산 → 장기 `progressive` / B = 증여 등기접수일 기산 → `short_term`).
 * A에서는 그 차익이 다른 자산과 **같은 누진 군에 합산**되어 전체 누진을 밀어올리는데,
 * B에서는 별도 군으로 빠져 합산이 없다. **단건 비교는 이 합산을 구조적으로 볼 수 없다.**
 *
 * 실측(계획서 §1.1 · 300 격자): **7건**이 뒤집히고 **전부 현행 과소**였다(750,000 ~ 20,900,000).
 * 컴패니언이 단기뿐인 조합에서 divergence가 0인 것도 같은 이유다 — 합산 상대가 없다.
 *
 * ## 알고리즘 — 순차 고정점 (전수 탐색 아님)
 *
 * ②3호의 문언은 「**그 자산에** ①을 적용/미적용」의 **2항 비교**이지 「전 조합 중 최적」이 아니다.
 * 그래서 2ⁿ 전수 탐색을 하지 않는다(조문에 없는 최적화가 된다).
 *
 *   1. 이월과세 적격 자산을 전부 **A(적용)**로 둔다 — ①이 원칙이고 ②는 그 예외다.
 *   2. 자산 i에 대해 「i만 A」 vs 「i만 B」(나머지는 현재 확정값)로 **집계를 두 번** 돌린다.
 *   3. A 쪽 집계 결정세액이 **적으면** B 확정(②3호 발동), 아니면 A 유지(동률 포함).
 *   4. 한 pass에서 바뀐 자산이 없으면 종료. 최대 {@link MAX_PASSES} pass.
 *
 * 집계 호출은 assignment 키로 **메모이즈**한다 — 자산 1건이면 실호출 3회(A·B·최종=캐시)다.
 *
 * ⛔ **`refCalculatedTax` 역안분 금지** — 집계 세액을 자산별로 되돌려 쪼개 비교하는 방식은
 *    F03·§104⑤에서 두 번 금지 확정됐다. 여기서는 **집계를 두 번 돌려** 비교한다.
 *
 * @see docs/00-pm/transfer-n1-carryover-filing-unit.plan.md
 */

/** 자산 index → 강제할 시나리오. 지정되지 않은 자산은 단건 엔진이 스스로 판정한다. */
export type CarryoverScenarioOverrides = Record<number, "A" | "B">;

/** 신고단위 비교 실적 — 결과 화면이 「무엇과 무엇을 비교했는지」 그대로 보여주기 위한 값. */
export interface FilingUnitCarryoverComparison {
  /** 그 자산에 §97의2①을 **적용**했을 때의 신고 전체 결정세액 */
  determinedTaxWithCarryover: number;
  /** **적용하지 않았을** 때의 신고 전체 결정세액 */
  determinedTaxWithout: number;
}

/**
 * 순환을 막는 pass 상한. 이론상 순서 의존으로 진동할 수 있어 상한을 둔다 —
 * 상한에 걸리면 마지막 assignment를 그대로 쓴다(자산이 늘어도 결과가 **결정적**이어야 한다).
 */
const MAX_PASSES = 2;

/**
 * 신고단위 비교로 각 이월과세 자산의 채택 시나리오를 확정한다.
 *
 * @param eligibleIndices ②3호 비교까지 도달한 자산의 index. ②1호(수용)·②2호(1세대1주택)·
 *   ③ 기간초과·관계 부적격으로 **이미 배제된 자산은 넣지 않는다** — 그 배제가 우선이다.
 * @param determinedTaxOf 주어진 assignment로 집계를 돌려 **결정세액**(가산세 前 · §92③2호)을 돌려준다.
 */
export function resolveFilingUnitCarryoverScope(
  eligibleIndices: readonly number[],
  determinedTaxOf: (overrides: CarryoverScenarioOverrides) => number,
): {
  overrides: CarryoverScenarioOverrides;
  comparisons: Map<number, FilingUnitCarryoverComparison>;
} {
  const comparisons = new Map<number, FilingUnitCarryoverComparison>();
  if (eligibleIndices.length === 0) return { overrides: {}, comparisons };

  // ①이 원칙 — 전부 적용(A)에서 출발한다.
  const assignment: CarryoverScenarioOverrides = {};
  for (const i of eligibleIndices) assignment[i] = "A";

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    for (const i of eligibleIndices) {
      const withCarryover = determinedTaxOf({ ...assignment, [i]: "A" });
      const without = determinedTaxOf({ ...assignment, [i]: "B" });
      comparisons.set(i, {
        determinedTaxWithCarryover: withCarryover,
        determinedTaxWithout: without,
      });
      // ②3호는 「**적은** 경우」에만 ①을 적용하지 않는다 — 동률은 적용 유지.
      const adopted: "A" | "B" = withCarryover < without ? "B" : "A";
      if (assignment[i] !== adopted) {
        assignment[i] = adopted;
        changed = true;
      }
    }
    if (!changed) break;
  }

  return { overrides: assignment, comparisons };
}
