/**
 * 1세대1주택 판정 — §155②③ 상속주택 「주택 수에서 빠지지 않은 이유」 수집.
 *
 * `unmet-exceptions.ts`(800줄 정책)에서 순수 이동했다(2026-10-13). 동작 변경 없음 — `collectUnmetExceptions`가 부른다.
 */
import { isBeforeCoInheritedRankingClause } from "../data/co-inherited-ranking-clause-era";
import { isDecedentGiftExclusionApplicable } from "../data/inheritance-general-house-era";
import { INHERITED_HOUSE } from "../legal-codes";
import {
  isSecondClausePoolHouse,
  resolveInheritedHouseExclusionForJudgment,
  resolveInheritedSellingHouseId,
} from "../transfer-inheritance-exclusion";
import type { OneHouseJudgeInput, OneHouseUnmetException } from "./types";

/**
 * §155②③ 상속주택 — 불성립 사유. 다른 축과 **구조가 다르다**.
 *
 * ## 🔑 의제가 아니라 「주택 수에서 빼는」 축이다
 *
 * `checkExemptionCore`에는 상속 분기가 **없다**. 판정 직전에 `runHouseCountExclusionStep`이
 * `householdHousingCount`를 깎을 뿐이다. 그래서 「비과세가 안 된 이유」가 아니라 **「상속주택이
 * 주택 수에서 빠지지 않은 이유」**를 말해야 한다 — §154① 사유를 여기에 붙이지 않는 까닭이다
 * (그것은 이 축의 요건이 아니다).
 *
 * ## 🔑 판정 화면에는 이 안내가 **없었다**
 *
 * 부적격 카운트는 `buildInheritedExclusionSteps`가 **계산기 산식 step**으로만 냈고, 판정 화면이
 * 읽는 `buildOneHouseCountBreakdown`은 **제외에 성공한 행만** 담는다(`house-count.ts`).
 * ⇒ 판정 메뉴에서는 상속주택이 조용히 빠지지 않은 채 과세만 나왔다.
 *
 * ## 🔑 성립 판정은 정본이 한다
 *
 * STEP 0.95가 낸 정본 결과(`inheritedHouseExclusionDetail` echo)를 **그대로 이어받아** 문장으로 옮긴다
 * (`resolveInheritedHouseExclusionForJudgment`). echo가 없는 직접 호출만 정본을 입력으로 부른다 —
 * 재개발 신축주택은 서브트리 입력(취득일 = 준공일 · `redevelopment` strip)이 STEP 0.95 입력과 달라 다시 부르면 답이 갈린다(S07-11).
 */
export function collectInheritedUnmet(input: OneHouseJudgeInput): OneHouseUnmetException[] {
  const sellingId = resolveInheritedSellingHouseId(input);
  const candidates = (input.houses ?? []).filter((h) => h.isInherited && h.id !== sellingId);
  if (candidates.length === 0) return []; // 선언하지 않은 특례는 말하지 않는다

  const x = resolveInheritedHouseExclusionForJudgment(input);
  const reasons: string[] = [];

  // OH-12c — 증여 제외 괄호는 2018-02-13 이후 증여분부터(제28637호 부칙 제16조). 정본 leaf로 같은 판정을 한다.
  // L-11 — 괄호는 §155② 풀(단독상속·최대지분 공동상속)에만 걸린다(「이하 이 항에서」). ② 풀 후보가 있을 때만 말한다.
  if (
    candidates.some(isSecondClausePoolHouse) &&
    isDecedentGiftExclusionApplicable({
      gifted: input.generalHouseGiftedFromDecedentWithin2yr,
      giftDate: input.generalHouseGiftDate,
    })
  ) {
    reasons.push(
      "양도하는 일반주택을 상속개시일부터 2년 이내에 피상속인으로부터 증여받았습니다 — 단독상속주택·최대지분 공동상속주택은 주택 수에서 빼지 않습니다(§155② 괄호). §155③ 공동상속주택(소수지분)에는 이 괄호가 없어 제외에 영향이 없습니다.",
    );
  }
  if (x.generalHouseNotHeldCount > 0) {
    reasons.push(
      "양도하는 주택을 상속개시 후(2013.2.15. 이후) 취득했습니다 — §155② 괄호의 「상속개시 당시 보유한 주택」이 아니라 상속주택을 주택 수에서 빼지 않습니다(대통령령 제24356호 부칙 제20조). 상속개시 당시 보유한 조합원입주권·분양권으로 사업시행 완료 후 취득한 신축주택이면 ② 보유 주택 목록 아래에서 선택하세요.",
    );
  }
  if (x.inheritedDateUnknownCount > 0) {
    reasons.push(
      `상속주택 ${x.inheritedDateUnknownCount}채의 상속개시일이 없어 양도하는 주택이 「상속개시 당시 보유한 주택」(§155② 괄호)인지 확인되지 않습니다 — 주택 수에서 빼지 않았습니다. 상속개시일을 입력하면 판정합니다.`,
    );
  }
  if (x.sameInheritanceAsSoldCount > 0) {
    reasons.push(
      `양도하는 주택도 상속주택이고 상속주택 ${x.sameInheritanceAsSoldCount}채를 같은 날(같은 상속) 함께 상속받았습니다 — ` +
        "§155②·③은 상속주택 외의 주택을 양도할 때 적용하므로 함께 상속받은 주택을 주택 수에서 빼지 않습니다" +
        "(서면-2015-부동산-1134 · 조심-2018-서-3806). 피상속인이 다른 별개의 상속이면 상속개시일을 확인하세요.",
    );
  }
  if (x.householdUnconfirmedCount > 0) {
    reasons.push(
      `상속주택 ${x.householdUnconfirmedCount}채는 상속개시 당시 피상속인과 같은 세대였는지 모르거나 답하지 않았습니다 — 주택 수에서 빼지 않았습니다(§155② 단서). 「상속 정보」에서 별도세대·동일세대를 고르면 판정합니다.`,
    );
  }
  if (x.sameHouseholdDisqualifiedCount > 0) {
    reasons.push(
      `상속주택 ${x.sameHouseholdDisqualifiedCount}채는 상속개시 당시 피상속인과 동일세대였습니다 — 주택 수 제외 대상이 아닙니다(§155② 단서). 동거봉양 합가로 합친 뒤 합가 전부터 보유한 경우에만 예외로 인정됩니다.`,
    );
  }
  // 결정 #10 — §155③ 「선순위 1주택」 한정은 2017.2.3. 신설이다. 그 전 양도의 소수지분 행에는 당시 문언에 없는 요건을 말하지 않는다.
  const beforeRankingClause = isBeforeCoInheritedRankingClause(input.transferDate);
  const rankingCoMinority = beforeRankingClause ? x.rankingDisqualifiedCoMinorityCount : 0;
  if (x.rankingDisqualifiedCount - rankingCoMinority > 0) {
    reasons.push(
      `상속주택 ${x.rankingDisqualifiedCount - rankingCoMinority}채를 「순위상 상속주택이 아님」으로 선언했습니다 — 주택 수 제외 대상이 아닙니다(§155②1~4호).`,
    );
  }
  if (rankingCoMinority > 0) {
    reasons.push(
      `공동상속주택(소수지분) ${rankingCoMinority}채를 「순위상 상속주택이 아님」으로 선언했습니다 — 이 양도는 §155③에 「선순위 1주택」 한정이 신설(2017.2.3.)되기 전이라 당시 문언에는 순위 요건이 없지만, 과세관청 해석에 따라 주택 수에서 빼지 않았습니다. 조세심판원은 소수지분을 모두 뺍니다 — 아래 「해석이 갈리는 쟁점」에서 두 결론을 함께 확인하세요.`,
    );
  }
  /**
   * 적격 2채 이상 — 정본이 **보수적으로 제외 0**을 내는 자리다(피상속인이 다르면 엔진이
   * 선순위를 정할 수 없다). 「해당 없음」과 전혀 다른 사실이라 반드시 구분해 알린다.
   */
  if (x.eligibleSoleCount >= 2) {
    reasons.push(
      `제외 요건을 갖춘 상속주택이 ${x.eligibleSoleCount}채여서 선순위 1채를 특정할 수 없습니다 — 어느 것도 주택 수에서 빼지 않았습니다. 순위상 상속주택이 아닌 행을 ② 보유 주택 목록에서 표시하면 1채로 좁혀집니다.`,
    );
  }
  if (x.eligibleCoMinorityCount >= 2) {
    reasons.push(
      beforeRankingClause
        ? `제외 요건을 갖춘 공동상속주택(소수지분)이 ${x.eligibleCoMinorityCount}채여서 어느 것도 주택 수에서 빼지 않았습니다 — 이 양도는 §155③에 「선순위 1주택」 한정이 신설(2017.2.3.)되기 전이라 당시 문언에는 순위 요건이 없습니다. 과세관청 해석(재산세과-2922)은 비과세를 인정하지 않았고 조세심판원은 소수지분을 모두 뺐습니다(조심-2019-서-2002 등) — 아래 「해석이 갈리는 쟁점」에서 두 결론을 함께 확인하세요.`
        : `제외 요건을 갖춘 공동상속주택(소수지분)이 ${x.eligibleCoMinorityCount}채여서 선순위 1채를 특정할 수 없습니다 — 어느 것도 주택 수에서 빼지 않았습니다.`,
    );
  }
  if (reasons.length === 0) return [];

  return [
    {
      id: "155-2-inherited-house",
      label: "상속주택 주택 수 제외",
      legalBasis: INHERITED_HOUSE.EXEMPTION_SOLE_BASIS,
      reasons,
    },
  ];
}
