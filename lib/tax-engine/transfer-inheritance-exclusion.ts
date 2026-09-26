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
import type { CalculationStep, TransferTaxInput } from "./types/transfer.types";
import { INHERITED_HOUSE } from "./legal-codes";
import {
  isDecedentGiftExclusionApplicable,
  qualifiesAsInheritanceGeneralHouse,
  type GeneralHouseRightAtInheritance,
} from "./data/inheritance-general-house-era";

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
  /**
   * **어느 주택이** 제외됐는지 — 판정 메뉴(P4-2) 「주택 수 산정」 명세용.
   *
   * 종전에는 개수만 냈다. 개수만으로는 화면이 「3채 중 1채 제외」까지만 말할 수 있고
   * 「어느 행이 왜 빠졌는지」를 못 보여준다. **세액과 무관한 표시 축**이며,
   * `excludedCount`는 여기 길이와 항상 같다(아래에서 함께 만든다).
   */
  excludedHouses: Array<{ houseId: string; basis: "sole" | "co_inherited" }>;
  /**
   * 게이트 2종을 통과한 **적격** 상속주택 수 — 풀별. **표시용**이며 계산에는 쓰이지 않는다.
   *
   * 🔑 `soleExcludedCount`만으로는 「적격이 0채」와 「적격이 2채 이상이라 선순위를 특정하지
   *    못해 제외 0」을 **구별할 수 없다**. 둘은 납세자에게 전혀 다른 사실이라
   *    (앞은 해당 없음, 뒤는 「입력을 더 좁히면 제외된다」) 불성립 사유 안내가 이 값을 읽는다.
   *    여기서 내보내지 않으면 안내 쪽이 같은 필터를 다시 쓰게 되어 두 벌이 된다.
   */
  eligibleSoleCount: number;
  eligibleCoMinorityCount: number;
  /**
   * OH-12 — 양도 주택이 「상속개시 당시 보유한 주택」이 아니라서(§155② 괄호, 2013-02-15 이후 취득분)
   * 단독상속 제외가 배제된 상속주택 수. **표시용**(불성립 사유 안내) — 계산은 위 필드가 이미 반영했다.
   */
  generalHouseNotHeldCount: number;
}

/** OH-12 — §155② 괄호 「일반주택」 한정 판정에 쓰는 양도 주택 사실. 미전달이면 이 게이트를 보지 않는다. */
export interface InheritanceGeneralHouseFacts {
  acquisitionDate: Date;
  transferDate: Date;
  rightAtInheritance?: GeneralHouseRightAtInheritance;
}

/**
 * 동거봉양 단서(§155② 단서) 게이트 — 별도세대이거나 동거봉양 합가 전 보유분이면 통과.
 * 중과 7호(「제155조제2항에 해당하는 상속받은 주택」)도 이 게이트를 쓴다 — 단일 소스(D16).
 */
export function passesHouseholdGate(h: HouseInfo): boolean {
  return h.decedentSameHouseholdAtInheritance !== true || h.parentalCareMergeInheritedHouse === true;
}

/** 순위(§155②1~4호) 게이트 — 순위 부적격 선언이 없으면 통과. 중과 7호도 공용(D16). */
export function passesRankingGate(h: HouseInfo): boolean {
  return h.isRankingDisqualifiedInheritedHouse !== true;
}

export function resolveInheritedHouseExclusion(
  houses: HouseInfo[] | undefined,
  sellingHouseId: string | undefined,
  generalHouseGiftedFromDecedentWithin2yr: boolean | undefined,
  generalHouse?: InheritanceGeneralHouseFacts,
): InheritedHouseExclusionResult {
  const empty: InheritedHouseExclusionResult = {
    soleExcludedCount: 0,
    coExcludedCount: 0,
    excludedCount: 0,
    sameHouseholdDisqualifiedCount: 0,
    rankingDisqualifiedCount: 0,
    excludedHouses: [],
    eligibleSoleCount: 0,
    eligibleCoMinorityCount: 0,
    generalHouseNotHeldCount: 0,
  };
  if (generalHouseGiftedFromDecedentWithin2yr || !houses) return empty;

  /**
   * OH-12 — §155② 괄호 「그 밖의 주택(상속개시 당시 보유한 주택 … 만 해당)」은 **단독상속 풀**의 요건이다
   * (§155③ 공동상속주택 조문에는 이 괄호가 없다). 상속주택마다 상속개시일이 다르므로 행별로 본다.
   * 상속개시일을 모르면(`unknown`) 종전 동작을 유지한다.
   */
  const heldForSole = (h: HouseInfo) =>
    !generalHouse ||
    qualifiesAsInheritanceGeneralHouse({
      generalHouseAcquisitionDate: generalHouse.acquisitionDate,
      inheritedDate: h.inheritedDate,
      transferDate: generalHouse.transferDate,
      rightAtInheritance: generalHouse.rightAtInheritance,
    }) !== "no";

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

  const gatesPassed = inheritedOthers.filter((h) => passesHouseholdGate(h) && passesRankingGate(h));
  const generalHouseNotHeldCount = gatesPassed.filter((h) => !h.isCoInherited && !heldForSole(h)).length;
  const eligible = gatesPassed.filter((h) => h.isCoInherited || heldForSole(h));
  const soleCount = eligible.filter((h) => !h.isCoInherited).length;
  const coMinorityCount = eligible.filter(
    (h) => h.isCoInherited && h.isLargestCoInheritedShareholder !== true,
  ).length;
  const soleExcludedCount = soleCount === 1 ? 1 : 0;
  const coExcludedCount = coMinorityCount === 1 ? 1 : 0;
  // 🔑 제외 판정은 「적격이 **정확히 1채**일 때만」이므로, 그 1채가 곧 제외 대상이다
  //    (2채 이상이면 선순위를 특정할 수 없어 제외 0 — 위 주석). 같은 필터를 다시 쓴다.
  const excludedHouses: InheritedHouseExclusionResult["excludedHouses"] = [];
  if (soleExcludedCount === 1) {
    const h = eligible.find((x) => !x.isCoInherited);
    if (h) excludedHouses.push({ houseId: h.id, basis: "sole" });
  }
  if (coExcludedCount === 1) {
    const h = eligible.find((x) => x.isCoInherited && x.isLargestCoInheritedShareholder !== true);
    if (h) excludedHouses.push({ houseId: h.id, basis: "co_inherited" });
  }
  return {
    soleExcludedCount,
    coExcludedCount,
    excludedCount: soleExcludedCount + coExcludedCount,
    sameHouseholdDisqualifiedCount,
    rankingDisqualifiedCount,
    excludedHouses,
    eligibleSoleCount: soleCount,
    eligibleCoMinorityCount: coMinorityCount,
    generalHouseNotHeldCount,
  };
}

/**
 * 입력에서 §155②③ 제외를 판정하는 **단일 진입점**.
 *
 * 🔴 양도(일반)주택 id의 **폴백 규칙**(`sellingHouseId ?? houses[0].id`)이 이 함수 안에만 있다.
 *    `runHouseCountExclusionStep`이 인라인으로 갖고 있던 것을 끌어올린 것이다 — 불성립 사유
 *    안내(`collectInheritedUnmet`)가 같은 판정을 해야 하는데, 폴백을 두 곳에 적으면
 *    `sellingHouseId` 미입력 케이스에서만 답이 갈린다(제외 대상 주택이 달라진다).
 */
export function resolveInheritedHouseExclusionFromInput(
  input: Pick<
    TransferTaxInput,
    | "houses"
    | "sellingHouseId"
    | "generalHouseGiftedFromDecedentWithin2yr"
    | "generalHouseGiftDate"
    | "generalHouseRightAtInheritance"
    | "acquisitionDate"
    | "transferDate"
  >,
): InheritedHouseExclusionResult {
  return resolveInheritedHouseExclusion(
    input.houses,
    resolveInheritedSellingHouseId(input),
    // OH-12c — 소급 2년 내 증여주택 제외는 2018-02-13 이후 증여분부터(제28637호 부칙 제16조).
    isDecedentGiftExclusionApplicable({
      gifted: input.generalHouseGiftedFromDecedentWithin2yr,
      giftDate: input.generalHouseGiftDate,
    }),
    // OH-12 — 양도 주택(일반주택)의 취득일이 「상속개시 당시 보유」 판정의 기준이다.
    {
      acquisitionDate: input.acquisitionDate,
      transferDate: input.transferDate,
      rightAtInheritance: input.generalHouseRightAtInheritance,
    },
  );
}

/**
 * 양도(일반)주택으로 볼 명부 행 id — `sellingHouseId` 미입력 시 **첫 행**으로 폴백한다.
 *
 * 제외 후보는 「상속주택이면서 **양도 대상이 아닌** 행」이므로, 불성립 사유 안내도 이 id를
 * 같은 규칙으로 정해야 후보 집합이 어긋나지 않는다.
 */
export function resolveInheritedSellingHouseId(
  input: Pick<TransferTaxInput, "houses" | "sellingHouseId">,
): string | undefined {
  return input.sellingHouseId ?? input.houses?.[0]?.id;
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
  if (result.generalHouseNotHeldCount > 0) {
    steps.push({
      label: "상속개시 후 취득한 일반주택 — 주택수 제외 배제 (§155② 괄호)",
      formula: `양도 주택은 상속개시 당시 보유한 주택이 아닙니다(2013.2.15. 이후 취득분 한정 — 대통령령 제24356호 부칙 제20조) — 상속주택 ${result.generalHouseNotHeldCount}채 주택수 제외 대상 아님`,
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
