/**
 * 1세대1주택 판정 — **「선언했는데 왜 적용되지 않았는가」**(`unmetExceptions[]`) 수집.
 *
 * `pending.ts`(800줄 hard cap)에서 순수 이동했다(2026-09-29 — 판정 기준일·요건 검토 작업의 선행 분리).
 * 동작 변경 없음. 기존 import 경로(`./one-house/pending`)는 `pending.ts`의 재수출로 보존한다.
 */
import {
  MARRIAGE_BOTH_SIDES_MULTI_HOUSE_BASIS,
  marriageRentalSidesOf,
  resolveDoubleMergeComposition,
  resolveMergeComposition,
} from "./merge-composition";
import { doubleMergeOrderOf, mergeAxisHouses, resolveTwoHouseMergeAxis } from "./merge-deeming";
import { isBeforeCoInheritedRankingClause } from "../data/co-inherited-ranking-clause-era";
import { isDecedentGiftExclusionApplicable } from "../data/inheritance-general-house-era";
import { INHERITED_HOUSE, TRANSFER, shortArticle } from "../legal-codes";
import {
  isSecondClausePoolHouse,
  passesHouseholdGate,
  resolveInheritedHouseExclusionForJudgment,
  resolveInheritedSellingHouseId,
} from "../transfer-inheritance-exclusion";
import type { OneHouseSpecialRulesData } from "../schemas/rate-table.schema";
import {
  inheritedBothPoolsExcluded,
  meetsOneHouseHoldingResidence,
  qualifiesLongTermMortgageContract,
  qualifiesLongTermMortgageResidenceExemption,
  RURAL_HOUSE_LABEL,
  ruralTemporaryTwoHouseOverlapCountHolds,
  RURAL_HOUSE_RESIDENCE_YEARS,
  qualifiesRuralHouseApartFromDeadline,
  RURAL_RETURN_TO_FARM_MAX_LAND_SQM,
  RURAL_RETURN_TO_FARM_TRANSFER_YEARS,
  ruralReturnToFarmDeadlineApplies,
  twoHouseSpecialCountHolds,
  UNAVOIDABLE_OUTSIDE_CAPITAL_YEARS,
  unavoidableResolvedDeadlineApplies,
  UNAVOIDABLE_REASON_LABEL,
} from "../transfer-tax-exemption-requirements";
import { collectRental4hoUnmet } from "./rental-registration-4ho";
import { PARENTAL_CARE_AGE_CONFIRM_NOTICE, PARENTAL_CARE_AGE_UNMET_REASON, parentalCareAgeVerdict } from "./parental-care-age";
import { deadlineHoldingUnmetReason } from "./deadline-holding";
import { baseRequirementPhrase } from "./base-requirement-phrase";
import { overlappedTemporaryTwoHouseTimingReasons } from "./unmet-deadline-reasons";
import { deadlineEndFrom, isWithinDeadline } from "../civil-period";
import type { OneHouseJudgeInput, OneHouseUnmetException } from "./types";

type OneHouseRule = OneHouseSpecialRulesData["one_house_exemption"];

/**
 * 「선언했는데 왜 적용되지 않았는가」 수집 — §155④⑤ 합가 축 (2026-09-22).
 *
 * ## 왜 필요했나
 *
 * 합가일을 입력하고 「세대 내 먼저 양도하는 주택」까지 켰는데 과세가 나오면, 종전에는 화면에
 * **아무 단서도 없었다**. `pending`은 기한 초과만, `undetermined`는 자료 부재만 담기 때문이다.
 * 제보 사례(혼인합가 2017-03-11 · 양도주택 취득 2017-08-31 · 3주택)는 `matchMergeWindow`의
 * **합가 전 취득** 조건에서 탈락했는데 `pending=[]`·`undetermined=[]`로 나왔다.
 *
 * ## 🔑 성립 판정은 정본이 한다
 *
 * 이 함수는 **성립 여부를 다시 판정하지 않는다**. `resolveMergeDeeming`·
 * `resolveMergeOverlapDeeming`(정본)이 `undefined`를 돌려준 경우에만 들어와, **사유만** 열거한다.
 * 정본과 별도로 성립을 판정하면 두 벌이 되어 「비과세인데 불성립 사유가 뜨는」 모순이 난다.
 * 그 계약은 `merge-unmet-reasons.anchor.test.ts`의 드리프트 가드가 고정한다.
 *
 * ## 🔑 기한 초과는 여기서 말하지 않는다
 *
 * `collectPendingConditions`의 합가 축이 **날짜와 함께** 안내한다(`155-5-marriage-merge`).
 * 두 곳에서 같은 사실을 말하면 어느 쪽이 정본인지 흐려진다. (판정 기준일 전에 기한이 지나 `pending`에서 빠진 조건의 사유만
 * `collectLapsedDeadlineUnmet`이 따로 남긴다 — S07-3.)
 */
export function collectUnmetExceptions(
  input: OneHouseJudgeInput,
  oneHouseRules: OneHouseSpecialRulesData,
): OneHouseUnmetException[] {
  /**
   * 🔴 **자산 게이트** — `checkExemptionCore`(`transfer-tax-exemption.ts`)의 진입 조건과 같다.
   *
   * §155 특례는 전부 **주택 양도** 특례다. 입주권 양도는 §89①4호가 따로 판정하고, route가
   * `applyOneRightVerdict`로 비과세를 **켠다**. 그 경로에서 이 함수가 사유를 내면
   * 「비과세인데 요건 미충족 카드가 뜨는」 모순이 난다 — 사유는 `judgment`에 spread로
   * 그대로 실려 나가기 때문이다(`one-right-verdict.ts:142`).
   */
  if (input.propertyType !== "housing" || !input.isOneHousehold) return [];

  /**
   * 축 순서 = 기존 축(합가) 우선 + 신규는 **주택 수 층 → 의제 축** 순.
   * §155②는 `householdHousingCount`를 **깎아** 다른 축의 「2주택」 전제를 바꾸는 상위 층이므로
   * 의제 축들보다 먼저 읽히는 편이 이해에 맞는다(`transfer-tax-house-exclusion-step.ts`).
   */
  return [
    ...collectMergeUnmet(input, oneHouseRules),
    ...collectInheritedUnmet(input),
    ...collectTemporaryTwoHouseUnmet(input, oneHouseRules),
    ...collectLongTermMortgageMergeUnmet(input, oneHouseRules),
    ...collectUnavoidableUnmet(input, oneHouseRules),
    ...collectCulturalHeritageUnmet(input, oneHouseRules),
    ...collectRuralUnmet(input, oneHouseRules),
    ...collectRental4hoUnmet(input), // OH-38 삭제 전 §154①4호
  ];
}

/** §155④⑤ 혼인·동거봉양 합가 — 불성립 사유. */
function collectMergeUnmet(
  input: OneHouseJudgeInput,
  oneHouseRules: OneHouseSpecialRulesData,
): OneHouseUnmetException[] {
  const rule = oneHouseRules.one_house_exemption;
  const unmet: OneHouseUnmetException[] = [];

  /**
   * §155④⑤ — 혼인이 먼저다(E-3.5와 같은 순서). 둘 다 입력돼 있으면 혼인 축으로 안내한다.
   * 입력이 아예 없으면 **선언하지 않은 특례**이므로 아무것도 내지 않는다.
   */
  // D4 이중 합가 3주택은 먼저 합친 날·그 합가가 기준이다(`resolveDoubleMergeDeeming` — 순서 무관).
  const doubleOrder = input.householdHousingCount === 3 ? doubleMergeOrderOf(input) : undefined;
  // 그 밖에는 정본의 합가 축(`resolveTwoHouseMergeAxis` — 두 날짜가 있는 2주택은 명부 소유 쪽이 가리키는 합가, S04-3).
  const axis = doubleOrder ? undefined : resolveTwoHouseMergeAxis(input);
  const mergeDate = doubleOrder?.firstDate ?? axis?.mergeDate;
  if (!mergeDate) return unmet;

  /**
   * 1채(또는 0채)면 합가 항목을 **만들지 않는다**(S07-8). §155②③·조특법 제외로 판정 주택 수가 1채가 된 세대는 「합침으로써
   * 2주택」 의제가 필요 없고 §154①이 바로 적용된다 — 「합가 특례는 2주택까지만」이라는 사유는 틀린 안내이고, 뒤에 오는
   * §154① 사유(`pushBaseRequirementReason`)까지 `reasons.length > 0`으로 가린다. 요건 검토표(`requirement-review.ts`)가 1채를
   * `154-1-one-house`로 보내는 것과 같은 규칙이다. 4채 이상만 상한 사유를 낸다.
   */
  if (input.householdHousingCount <= 1) return unmet;

  const isMarriage = doubleOrder ? doubleOrder.first === "marriage" : axis!.kind === "marriage";
  const mergeLabel = isMarriage ? "혼인한 날" : "합친 날";
  const reasons: string[] = [];

  // ── 창(窓) 조건 — `matchMergeWindow`(requirements.ts)의 각 탈락 지점과 1:1 ──
  if (input.isFirstTransferredInMerge !== true) {
    reasons.push(
      "「세대 내 먼저 양도하는 주택」으로 선언하지 않았습니다 — 합가 특례는 합가 후 세대에서 먼저 양도하는 주택에만 적용됩니다.",
    );
  }
  if (input.transferDate < mergeDate) {
    reasons.push(
      `양도일(${fmtDate(input.transferDate)})이 ${mergeLabel}(${fmtDate(mergeDate)})보다 빠릅니다 — 합가로 2주택이 되기 전의 양도입니다.`,
    );
  }
  if (input.acquisitionDate > mergeDate) {
    reasons.push(
      `양도 주택을 ${mergeLabel}(${fmtDate(mergeDate)}) 이후인 ${fmtDate(input.acquisitionDate)}에 취득했습니다 — 이 특례는 합가 당시 이미 보유하던 주택에 적용됩니다.`,
    );
  }

  // ── 동거봉양 직계존속 연령 요건 — `matchMergeGateAndComposition`·`matchDoubleMergeApartFromWindow`의 같은 leaf(결정 #9) ──
  //    미선택(모름)은 불성립 + 확인 필요, 「해당 없음」은 사실의 선언이라 확인 필요 없이 불성립 사유만 말한다.
  if (doubleOrder || axis!.kind === "parental_care") {
    const ageVerdict = parentalCareAgeVerdict(input.parentalCareMerge?.parentAge, "155_4");
    if (ageVerdict === "unmet") reasons.push(PARENTAL_CARE_AGE_UNMET_REASON);
    else if (ageVerdict === "unknown") reasons.push(`합가의 직계존속 연령 요건을 선택하지 않아 합가 특례를 적용하지 않았습니다 — 확인 필요: ${PARENTAL_CARE_AGE_CONFIRM_NOTICE}`);
  }

  // ── 주택 수 조건 — `resolveMergeDeeming`(2주택) · `resolveMergeOverlapDeeming`(3주택) ──
  const count = input.householdHousingCount;
  // D4 — 혼인·동거봉양 합가일이 **둘 다** 있는 3주택은 이중 합가(`resolveDoubleMergeDeeming`) 기준으로 안내한다(순서 무관).
  if (doubleOrder && (input.inheritedHouseExclusionCount ?? 0) === 0) {
    const secondLabel = doubleOrder.first === "marriage" ? "동거봉양 합가일" : "혼인일";
    const composition = resolveDoubleMergeComposition({
      householdHousingCount: count,
      houses: input.houses,
      sellingHouseId: input.sellingHouseId,
      firstMergeDate: doubleOrder.firstDate,
      secondMergeDate: doubleOrder.secondDate,
      knownHouseExclusionCount: input.knownHouseExclusionCount,
      knownHouseExclusionHouseIds: input.knownHouseExclusionHouseIds,
      noRosterInputPath: input.noMergeRosterInputPath,
    });
    if (composition.status === "fails") {
      reasons.push(
        composition.reason === "acquired_after_merge"
          ? `다른 주택을 ${secondLabel}(${fmtDate(doubleOrder.secondDate)}) 이후인 ${composition.afterMergeDates.map(fmtDate).join("·")}에 취득했습니다 — 합가로 3주택이 된 것이 아닙니다.`
          : composition.reason === "roster_missing" || composition.reason === "origin_missing"
            ? `혼인·동거봉양 합가 전 보유 구성을 판정할 수 없습니다 — 확인 필요: ${composition.confirmNotice}`
            : "혼인·동거봉양 이중 합가 특례는 배우자가 혼인 전부터 보유한 주택 1채와 동거봉양으로 합친 가족이 합가 전부터 보유한 주택 1채가 있는 3주택에 적용됩니다 — 보유 주택 목록의 합가 전 보유자 구성이 이와 다릅니다.",
      );
    }
  } else if (count === 3 && (input.inheritedHouseExclusionCount ?? 0) > 0) {
    reasons.push(
      "상속주택(§155②③)을 주택 수에서 뺀 뒤에도 3주택입니다 — 상속주택 특례·일시적 2주택·합가 특례 세 가지가 겹친 경우를 인정한 해석이 확인되지 않아 적용하지 않습니다(확인 필요).",
    );
  } else if (count === 2 && inheritedBothPoolsExcluded(input)) {
    reasons.push(inheritedBothPoolsCapReason("합가 특례"));
  } else if (count === 3) {
    /**
     * 3주택은 §155①과 **겹친 경우만** 인정된다(F-1 — 사전-2025-법규재산-1240 ·
     * 서면-2022-법규재산-5124). 토글을 켜지 않으면 `temporaryTwoHouse`가 아예 만들어지지 않아
     * (`transfer-tax-api-body-blocks.ts` `buildHouseholdSpecialPayload`) 중첩 분기에 들어가지 못한다.
     */
    if (!input.temporaryTwoHouse) {
      /**
       * §155①은 이제 **명부에서 자동 도출**된다(`resolveTemporaryTwoHouse`) — 사용자가 켤
       * 토글이 없다. 도출이 성립하지 않는 경우는 「양도주택보다 나중 취득한 주택이 명부에
       * 없거나 둘 이상」뿐이므로, 안내도 **명부를 가리켜야** 한다.
       * (종전 문구는 「『일시적 2주택 특례 해당』을 함께 선언해야 합니다」였다 — 2026-09-22
       *  토글 제거로 **존재하지 않는 컨트롤을 누르라는 안내**가 되어 정정했다.)
       */
      reasons.push(
        "세대 주택 수가 3채입니다 — 합가 특례는 일시적 2주택 특례와 겹친 경우에만 3주택까지 적용되는데, ② 보유 주택 목록에서 일시적 2주택의 신규 주택이 하나로 특정되지 않습니다(합가 전에는 같은 쪽 안에서 나중에 취득한 주택, 합가 후에는 새로 취득한 주택 1채).",
      );
    } else if (
      // 규칙 행이 없으면 정본(`resolveMergeOverlapDeeming`)도 기간을 보지 않고 불성립시킨다 —
      // 여기서도 「기간 미충족」이라 단정하지 않는다(규칙을 못 읽은 것과 요건 미충족은 다르다).
      oneHouseRules.temporary_two_house !== undefined
    ) {
      // 어느 요건이 어느 날짜로 깨졌는지 밝힌다 — 종전 문구는 두 요건을 양도 연도와 무관하게 함께 나열해
      // 2012-06-29 전 양도분(1년 요건 없음)에도 1년 요건을 말했다. 합가로 3주택이 된 경우에도 신규주택
      // 취득일부터 처분기한 안에 양도해야 한다(사전-2026-법규재산-0643).
      reasons.push(
        ...overlappedTemporaryTwoHouseTimingReasons(
          { ...input, temporaryTwoHouse: input.temporaryTwoHouse },
          oneHouseRules.temporary_two_house,
          "합가로 3주택이 된 경우에도 이 기한 안에 양도해야 합니다.",
        ),
      );
    }
  } else if (count !== undefined && count !== 2) {
    reasons.push(
      `세대 주택 수가 ${count}채입니다 — 합가 특례는 2주택(일시적 2주택 특례와 겹친 경우 3주택)까지만 적용됩니다.`,
    );
  }

  /**
   * ── 합가 전 보유 구성 — `resolveMergeComposition`(matchMergeApartFromWindow가 AND하는 같은 술어) ──
   *
   * `reasons.length === 0`일 때만 사유를 더한다 — 주택 수 축(위 블록)이 이미 사유를 냈으면
   * (예: 3주택인데 신규주택이 특정 안 됨) 구성은 애초에 판정할 재료가 없다. 두 사유를 함께
   * 내면 「신규주택부터 특정하라」는 안내 위에 「구성이 모른다」가 덧씌워져 원인이 흐려진다
   * (`merge-unmet-reasons.anchor.test.ts` UM-1·UM-6·UM-12가 고정하는 「다른 사유가 없을 때만」
   *  계약과 같은 층위).
   */
  if ((count === 2 || (count === 3 && !doubleOrder)) && reasons.length === 0) {
    const composition = resolveMergeComposition({
      householdHousingCount: count,
      houses: axis ? mergeAxisHouses(input.houses, axis) : input.houses,
      sellingHouseId: input.sellingHouseId,
      mergeDate,
      knownHouseExclusionCount: input.knownHouseExclusionCount,
      knownHouseExclusionHouseIds: input.knownHouseExclusionHouseIds,
      noRosterInputPath: input.noMergeRosterInputPath,
      marriageRentals: marriageRentalSidesOf(input, isMarriage),
    });
    if (composition.status === "fails") {
      const by = isMarriage ? "혼인으로" : "합가로";
      const ev = isMarriage ? "혼인" : "합가";
      reasons.push(
        composition.reason === "acquired_after_merge"
          ? `다른 주택을 ${mergeLabel}(${fmtDate(mergeDate)}) 이후인 ${composition.afterMergeDates.map(fmtDate).join("·")}에 취득했습니다 — ${by} 2주택이 된 것이 아니라 취득으로 늘어난 것이므로, 일시적 2주택 특례(§155①) 요건을 확인하세요.`
          : composition.reason === "seller_side_only"
            ? `${ev} 전 양도자 쪽이 이미 ${composition.sellerSide}주택이었고 상대 쪽은 무주택이었습니다 — 특례는 각자 1주택을 보유하다가 ${by} 2주택이 된 경우에 적용됩니다.`
            : composition.reason === "roster_missing"
              ? `세대 보유 주택을 모두 보유 주택 목록에 입력하지 않아 ${ev} 전 보유 구성을 판정할 수 없습니다 — 확인 필요: ${composition.confirmNotice}`
              : composition.reason === "origin_missing"
                ? `보유 주택 목록에서 ${ev} 전 보유자를 고르지 않아 구성을 판정할 수 없습니다 — 확인 필요: ${composition.confirmNotice}`
                : composition.reason === "both_sides_multi_house"
                  ? `장기임대주택까지 세면 혼인 전 양도자 쪽 ${composition.sellerSide}주택 · 배우자 쪽 ${composition.counterpartSide}주택으로, 각각 2주택 이상인 사람끼리 혼인해 1세대가 4주택 이상이 됐습니다 — 혼인합가 특례는 적용되지 않습니다(${MARRIAGE_BOTH_SIDES_MULTI_HOUSE_BASIS}).`
                  : composition.reason === "rental_origin_missing"
                    ? `장기임대주택의 혼인 전 보유자를 고르지 않아, 각각 2주택 이상인 사람끼리의 혼인인지(${MARRIAGE_BOTH_SIDES_MULTI_HOUSE_BASIS}) 판정할 수 없습니다 — 확인 필요: ${composition.confirmNotice}`
                : `${ev} 전 보유 구성(양도자 쪽 ${composition.sellerSide}채 · 상대 쪽 ${composition.counterpartSide}채)이 「각자 1주택」(일시적 2주택과 겹친 경우 한쪽 2주택)에 맞지 않습니다.`,
      );
    }
  }

  /**
   * ── §154① 보유·거주 ──
   * 의제(①)가 성립해도 §154①(②)은 **따로 충족**해야 한다(`transfer-tax-exemption.ts` E-3.5의
   * `mergeBasis && meetsOneHouseHoldingResidence` 연언). 위 사유가 하나도 없는데 과세라면
   * 남은 원인은 이것뿐이다.
   */
  pushBaseRequirementReason(reasons, input, rule);

  // 사유를 하나도 대지 못하면 항목을 만들지 않는다 — 「적용 안 됨」만 말하면 안내가 아니다.
  if (reasons.length === 0) return unmet;

  unmet.push({
    id: isMarriage ? "155-5-marriage-merge" : "155-4-parental-care-merge",
    label: isMarriage ? "혼인 합가" : "동거봉양 합가",
    legalBasis: isMarriage ? TRANSFER.MARRIAGE_MERGE_EXEMPT : TRANSFER.PARENTAL_CARE_MERGE_EXEMPT,
    reasons,
  });
  return unmet;
}

/**
 * §154① 보유·거주 — **다른 사유가 하나도 없을 때만** 낸다.
 *
 * §155 의제 조문들은 전부 「…1세대1주택으로 보아 **제154조제1항을 적용**한다」이므로 의제(①)가
 * 서도 §154①(②)을 따로 충족해야 한다. 앞 단계 사유가 이미 있으면 의제부터 불성립이라
 * §154①을 덧붙이는 것은 원인을 흐린다(합가 축이 UM-6·UM-12로 고정한 계약).
 */
function pushBaseRequirementReason(
  reasons: string[],
  input: OneHouseJudgeInput,
  rule: OneHouseRule,
): void {
  if (reasons.length > 0) return;
  if (meetsOneHouseHoldingResidence(input, rule)) return;
  // 연수·거주 기준은 양도일 연혁이다(X2-3) — 같은 화면의 요건 검토표와 같은 leaf를 읽는다.
  reasons.push(`${baseRequirementPhrase(input.transferDate, rule)} 요건을 충족하지 않습니다.`);
}

/**
 * 상속주택 두 채(②·③)를 뺀 뒤 2주택이 남아 **세 특례**가 겹치는 경우의 사유 — 정본 술어는 `inheritedBothPoolsExcluded`
 * (`transfer-tax-exemption-holding.ts`)이고, 여기서는 사실을 문장으로 옮길 뿐 성립을 다시 판정하지 않는다(S01-2).
 * 3주택 중첩(`count === 3 && inheritedHouseExclusionCount > 0`)의 문구와 같은 형식이다.
 */
function inheritedBothPoolsCapReason(what: string): string {
  return (
    `상속주택 2채(단독상속 §155② · 공동상속 소수지분 §155③)를 주택 수에서 뺀 뒤에도 2주택이 남았습니다 — 상속주택 특례 두 가지와 ${what}이(가) ` +
    "겹친 세 특례를 인정한 해석이 확인되지 않고 불허 회신(사전-2023-법규재산-0209)이 있어 적용하지 않습니다(확인 필요)."
  );
}

/** 상속주택 2채 제외 + 2주택 전제 특례 → 세 특례 상한 사유(`inheritedBothPoolsCapReason`) — 각 특례 수집기가 부른다. */
function pushInheritedBothPoolsCapReason(reasons: string[], input: OneHouseJudgeInput, what: string): void {
  if (input.householdHousingCount === 2 && inheritedBothPoolsExcluded(input)) {
    reasons.push(inheritedBothPoolsCapReason(what));
  }
}

/**
 * §155① 일시적 2주택 — 상속주택 2채 제외로 세 특례가 겹쳐 적용되지 않은 사유.
 *
 * 🔑 §155① 기간 요건 사유는 `pending`(처분기한)·`collectEraUndetermined`가 말한다 — 여기는 **세 특례 상한**과
 *    ⑦ 농어촌 중첩 3주택(D3)의 기간 탈락만 낸다(2주택은 검토표가 같은 사유를 낸다).
 *    선언하지 않은 특례(`temporaryTwoHouse` 없음)는 말하지 않는다.
 */
function collectTemporaryTwoHouseUnmet(
  input: OneHouseJudgeInput,
  oneHouseRules: OneHouseSpecialRulesData,
): OneHouseUnmetException[] {
  if (!input.temporaryTwoHouse) return [];
  const reasons: string[] = [];
  pushInheritedBothPoolsCapReason(reasons, input, "일시적 2주택 특례(§155①)");
  /**
   * D3 — ⑦ 농어촌주택이 겹친 3주택은 엔진이 §155① 분기로 본다(E-3 `ruralTemporaryTwoHouseOverlapCountHolds`). 기간 요건에서 탈락했으면
   * 그 날짜를 밝힌다 — 종전에는 ⑦ 카드가 「주택 수가 3채라 2주택에만 적용」이라고만 말해 실제 탈락 원인이 가려졌다(S07-5).
   */
  const twoHouseRule = oneHouseRules.temporary_two_house;
  if (twoHouseRule && ruralTemporaryTwoHouseOverlapCountHolds(input)) {
    reasons.push(
      ...overlappedTemporaryTwoHouseTimingReasons(
        { ...input, temporaryTwoHouse: input.temporaryTwoHouse },
        twoHouseRule,
        "농어촌주택(§155⑦)과 겹쳐 3주택이 된 경우에도 이 기한 안에 양도해야 합니다.",
      ),
    );
  }
  if (reasons.length === 0) return [];
  return [
    {
      id: "155-1-temporary-two-house",
      label: "일시적 2주택",
      // 구조화 인용이라 법령명을 남긴다(`pending`의 `155-1-disposal-deadline`과 같은 이유 — 항(①)이 있어야 본문 하이라이트가 걸린다).
      legalBasis: `${TRANSFER.TEMPORARY_TWO_HOUSE}①`,
      reasons,
    },
  ];
}

/**
 * §155의2② 장기저당담보주택 동거봉양 합가 — 불성립 사유 (X3-5).
 *
 * 엔진 분기(E-3.9 `checkExemptionCore`)의 조건과 **1:1**이다: 담보주택 동거봉양 합가 선언 · 2주택 · 「먼저 양도」 ·
 * 계약 요건(`qualifiesLongTermMortgageContract`) · §154①(양도 주택이 담보주택이면 거주기간 면제를 주입).
 * 종전에는 이 축의 사유가 하나도 없어 칩을 선언하고도 「먼저 양도」를 입력하지 않은 세대가 아무 안내 없이 과세됐다 —
 * 선언한 사실이 출력에서 사라졌다. 성립 판정은 정본이 하고 여기서는 **사유만** 옮긴다(선언하지 않았으면 말하지 않는다).
 *
 * 🔑 「먼저 양도」는 법정 요건이다(「…합침으로써 1세대가 2주택을 소유하게 되는 경우 **먼저 양도하는 주택**에 대하여는」) — 선언하지
 *    않았으면 사실을 몰라 불성립으로 판정한 것이므로 「확인 필요」를 붙인다(모름 = 혜택 불성립 + 결론을 가를 때만 고지).
 * 🔑 기한은 없다(§155④의 10년과 다르다) — 기한 사유를 만들지 않는다.
 */
function collectLongTermMortgageMergeUnmet(
  input: OneHouseJudgeInput,
  oneHouseRules: OneHouseSpecialRulesData,
): OneHouseUnmetException[] {
  const m = input.longTermMortgageHouse;
  if (m?.parentalCareMerge !== true) return []; // 선언하지 않은 특례는 말하지 않는다

  const reasons: string[] = [];
  const count = input.householdHousingCount;
  if (count !== undefined && count !== 2) {
    reasons.push(
      `세대 주택 수가 ${count}채입니다 — 이 특례는 담보주택을 보유한 직계존속과 동거봉양 합가로 1세대가 2주택이 된 경우에만 적용됩니다.`,
    );
  }
  if (input.isFirstTransferredInMerge !== true) {
    reasons.push(
      "합가 후 세대에서 먼저 양도하는 주택으로 선언하지 않았습니다 — 이 특례는 「먼저 양도하는 주택」에만 적용됩니다(§155의2②). 확인 필요: 먼저 양도하는 주택이면 선언하세요.",
    );
  }
  if (m.transferredBeforeMaturity) {
    reasons.push("장기저당담보주택을 계약기간 만료 이전에 양도합니다 — §155의2③에 따라 ①·②를 적용하지 않습니다.");
  } else if (!qualifiesLongTermMortgageContract(input)) {
    reasons.push(
      "장기저당담보대출계약 요건(계약체결일 현재 가입자 60세 이상 · 계약기간 10년 이상 · 만기에 해당 주택을 처분해 일시 상환하는 조건 — §155의2①1~3호)을 충족하지 않습니다.",
    );
  }
  // §154① — 앞 사유가 없을 때만(의제부터 불성립이면 §154①을 덧붙이면 원인이 흐려진다). 양도 주택이 담보주택이면 거주기간 면제를 준다.
  if (
    reasons.length === 0 &&
    !meetsOneHouseHoldingResidence(input, oneHouseRules.one_house_exemption, qualifiesLongTermMortgageResidenceExemption(input))
  ) {
    reasons.push(
      `${shortArticle(TRANSFER.ONE_HOUSE_REQUIREMENT)}① 보유 2년(취득 당시 조정대상지역이면 거주 2년 — 양도 주택이 담보주택이면 거주기간은 면제) 요건을 충족하지 않습니다.`,
    );
  }
  if (reasons.length === 0) return [];

  return [
    {
      id: "155-2-2-long-term-mortgage-merge",
      label: "장기저당담보주택 동거봉양 합가",
      legalBasis: TRANSFER.LONG_TERM_MORTGAGE_MERGE,
      reasons,
    },
  ];
}

/** 주택 수 요건(「각각 1개씩」 = 2주택) 사유 — §155⑦·⑧이 같은 문장을 쓴다. */
function pushTwoHouseCountReason(
  reasons: string[],
  count: number | undefined,
  what: string,
): void {
  if (count === undefined || count === 2) return;
  reasons.push(
    `세대 주택 수가 ${count}채입니다 — 이 특례는 ${what}과 일반주택을 각각 1개씩(2주택) 보유한 세대가 일반주택을 양도하는 경우에만 적용됩니다.`,
  );
}

/**
 * §155⑧ 수도권 밖 부득이한 사유 주택 — 불성립 사유.
 *
 * 🔑 **「양도일 현재 미해소」 선택은 사유가 아니다.** 정본(`qualifiesUnavoidableOutsideCapital`)이 기한을 기산하지 않고
 *    **통과**시키는 자리라(해소 전 양도는 명문 없음 — 계획서 W-1), 미충족으로 읽으면 법 근거 없이 납세자에게 불리해진다.
 *    해소일도 「미해소」 선택도 없는 빈 값(모름)은 ⑧·⑫가 막으므로 여기서 말할 사유가 없다(#31 — 종전의 판정 보류
 *    `155-8-resolved-date-missing`은 이 택일 입력으로 사라졌다).
 * 🔑 **3년 기한 초과도 여기서 말하지 않는다** — `collectPendingConditions`가 **날짜와 함께**
 *    안내한다(`155-8-unavoidable-resolved`). 두 카드가 같은 사실을 말하지 않는다. 단 기한일 기준 §154① 보유 2년이 모자라
 *    안내를 못 낸 경우는 그 이유를 여기서 말한다(S07-4).
 */
function collectUnavoidableUnmet(
  input: OneHouseJudgeInput,
  oneHouseRules: OneHouseSpecialRulesData,
): OneHouseUnmetException[] {
  const u = input.unavoidableOutsideCapitalHouse;
  if (!u) return []; // 선언하지 않은 특례는 말하지 않는다

  const reasons: string[] = [];
  pushTwoHouseCountReason(reasons, input.householdHousingCount, "부득이한 사유로 취득한 수도권 밖 주택");
  pushInheritedBothPoolsCapReason(reasons, input, "수도권 밖 부득이한 사유 주택 특례(§155⑧)");
  pushBaseRequirementReason(reasons, input, oneHouseRules.one_house_exemption);
  // 해소일도 「양도일 현재 미해소」도 고르지 않은 빈 값은 「모름」이다 — 혜택 불성립 + 확인 필요(#31 · 직접 호출 방어, ⑧·⑫가 먼저 막는다).
  if (!u.resolvedDate && u.unresolvedAtTransfer !== true) {
    reasons.push(
      "부득이한 사유가 해소된 날을 입력하거나 「사유가 양도일 현재 해소되지 않음」을 선택하지 않아 적용하지 않았습니다(확인 필요).",
    );
  }
  // 다른 사유가 없는데 3년 기한이 지났다면 `pending`이 기한을 안내한다 — 단 기한일 기준 보유 2년이 모자라 안내를 못 냈으면 그 이유를 말한다(S07-4).
  if (reasons.length === 0 && u.resolvedDate && unavoidableResolvedDeadlineApplies(u.resolvedDate) && twoHouseSpecialCountHolds(input)) {
    const dl = deadlineEndFrom(u.resolvedDate, UNAVOIDABLE_OUTSIDE_CAPITAL_YEARS);
    if (!isWithinDeadline(u.resolvedDate, UNAVOIDABLE_OUTSIDE_CAPITAL_YEARS, input.transferDate)) {
      const why = deadlineHoldingUnmetReason(input, oneHouseRules.one_house_exemption, dl.end, "부득이한 사유가 해소된 날부터 3년");
      if (why) reasons.push(why);
    }
  }
  if (reasons.length === 0) return [];

  return [
    {
      id: `155-8-unavoidable:${u.reason}`,
      label: `수도권 밖 부득이한 사유 주택 (${UNAVOIDABLE_REASON_LABEL[u.reason]})`,
      legalBasis: TRANSFER.UNAVOIDABLE_OUTSIDE_CAPITAL,
      reasons,
    },
  ];
}

/**
 * §155⑥1호 문화유산 주택 — 불성립 사유.
 *
 * 🔑 **정본에 별도 술어가 없다.** `checkExemptionCore`(E-3.6)가 세 조건을 인라인 연언으로 쓴다:
 *    `householdHousingCount === 2 && culturalHeritageHouse === true && meetsOneHouseHoldingResidence`.
 *    2·3호가 삭제돼 요건이 boolean 하나뿐이라 술어를 따로 두지 않은 것이다 — 그래서 여기서도
 *    술어를 **새로 만들지 않고** 남은 두 조건만 옮긴다(두 번째 조건은 선언 자체라 사유가 아니다).
 */
function collectCulturalHeritageUnmet(
  input: OneHouseJudgeInput,
  oneHouseRules: OneHouseSpecialRulesData,
): OneHouseUnmetException[] {
  if (input.culturalHeritageHouse !== true) return []; // 선언하지 않은 특례는 말하지 않는다

  const reasons: string[] = [];
  pushTwoHouseCountReason(reasons, input.householdHousingCount, "문화유산 주택");
  pushInheritedBothPoolsCapReason(reasons, input, "문화유산 주택 특례(§155⑥)");
  pushBaseRequirementReason(reasons, input, oneHouseRules.one_house_exemption);
  if (reasons.length === 0) return [];

  return [
    {
      id: "155-6-1ho-cultural-heritage",
      label: "문화유산 주택",
      legalBasis: TRANSFER.CULTURAL_HERITAGE_HOUSE,
      reasons,
    },
  ];
}

/**
 * §155⑦ 농어촌주택 — 불성립 사유. 각 항은 `qualifiesRuralHouse`의 탈락 지점과 **1:1**이다.
 *
 * 🔑 3호(귀농)의 「취득일부터 5년 이내 양도」 초과는 `collectPendingConditions`가 날짜와 함께
 *    안내한다(`155-7-3ho-return-to-farm`) — 여기서 중복해 말하지 않는다. 단 기한일 기준 §154① 보유 2년이 모자라
 *    안내를 못 낸 경우는 그 이유를 말한다(S07-4).
 */
function collectRuralUnmet(
  input: OneHouseJudgeInput,
  oneHouseRules: OneHouseSpecialRulesData,
): OneHouseUnmetException[] {
  const r = input.ruralHouse;
  if (!r) return []; // 선언하지 않은 특례는 말하지 않는다

  const reasons: string[] = [];
  // D3 — ⑦이 §155①과 겹친 3주택은 엔진이 성립시키는 주택 수다(`ruralTemporaryTwoHouseOverlapCountHolds`). 「2주택에만 적용」은 틀린 사유다.
  if (!ruralTemporaryTwoHouseOverlapCountHolds(input)) {
    pushTwoHouseCountReason(reasons, input.householdHousingCount, "농어촌주택");
  }
  pushInheritedBothPoolsCapReason(reasons, input, "농어촌주택 특례(§155⑦)");

  if (!r.isOutsideCapitalEupMyeon) {
    reasons.push(
      "농어촌주택이 수도권 밖의 읍(도시지역 제외)·면에 있다는 요건을 충족하지 않습니다 — 유형(상속·이농·귀농)과 무관한 공통 요건입니다.",
    );
  }

  switch (r.kind) {
    case "inherited":
      if ((r.decedentResidenceYears ?? 0) < RURAL_HOUSE_RESIDENCE_YEARS) {
        reasons.push(
          `1호 상속 농어촌주택은 피상속인이 취득 후 ${RURAL_HOUSE_RESIDENCE_YEARS}년 이상 거주해야 하는데 입력값이 ${r.decedentResidenceYears ?? 0}년입니다.`,
        );
      }
      // D7 — 단서 괄호가 제7항제1호에도 걸린다. 같은 게이트(`passesHouseholdGate`)를 쓴다.
      if (!passesHouseholdGate(r)) {
        reasons.push(
          "상속개시 당시 피상속인과 동일세대였습니다 — 동거봉양 합가 전부터 보유하던 주택이 아니면 1호의 「상속받은 주택」으로 보지 않습니다(§155② 단서 괄호 「이하 제3항, 제7항제1호 … 에서 같다」).",
        );
      }
      break;
    case "farm_exit":
      if ((r.ownerResidenceYears ?? 0) < RURAL_HOUSE_RESIDENCE_YEARS) {
        reasons.push(
          `2호 이농주택은 이농인이 취득일 후 ${RURAL_HOUSE_RESIDENCE_YEARS}년 이상 거주해야 하는데 입력값이 ${r.ownerResidenceYears ?? 0}년입니다.`,
        );
      }
      if (r.returnedToFarmExitHouse === true) {
        reasons.push(
          "이농한 뒤 이 주택으로 다시 귀농했습니다 — 이 경우 2호 이농주택 특례를 적용하지 않는다는 회신이 있습니다(부동산납세과-67 · 부적용 사유는 회신에 밝혀져 있지 않음).",
        );
      }
      break;
    case "return_to_farm":
      if (r.returnedToFarmExitHouse === true) {
        reasons.push(
          "당초 5년 이상 거주하다 이농했던 주택으로 다시 귀농했습니다 — 영농 목적으로 취득한 3호 귀농주택으로 보지 않습니다(재산세과-1504 · 부동산납세과-67).",
        );
      }
      if (r.isHighPriceAtAcquisition === true) {
        reasons.push("3호 귀농주택이 취득 당시 고가주택이었습니다 — 귀농주택으로 인정되지 않습니다(§155⑩2호).");
      }
      if (r.landAreaSqm === undefined) {
        // ⚠️ 정본은 미입력을 `Infinity`로 보아 **탈락**시킨다(⑩3호). 미충족이라 단정하지 않고
        //    「확인할 수 없다」고 밝힌다 — 화면 경로는 항상 숫자를 싣는다(`one-house-row-facts.ts`).
        reasons.push("3호 귀농주택의 대지면적을 입력하지 않아 660㎡ 이내 요건을 확인할 수 없습니다(§155⑩3호).");
      } else if (r.landAreaSqm > RURAL_RETURN_TO_FARM_MAX_LAND_SQM) {
        reasons.push(
          `3호 귀농주택의 대지면적 ${r.landAreaSqm}㎡가 상한 ${RURAL_RETURN_TO_FARM_MAX_LAND_SQM}㎡를 초과합니다(§155⑩3호).`,
        );
      }
      if (r.wholeHouseholdMoved !== true) {
        reasons.push("3호 귀농주택으로 세대전원이 이사해 거주한다고 선언하지 않았습니다(§155⑩5호).");
      }
      if (!r.acquisitionDate) {
        reasons.push(
          "3호 귀농주택의 취득일을 입력하지 않아 「취득일부터 5년 이내 일반주택 양도」 요건(§155⑦ 단서)을 확인할 수 없습니다.",
        );
      }
      break;
  }

  pushBaseRequirementReason(reasons, input, oneHouseRules.one_house_exemption);
  // 3호 5년 기한 — 위 ⑧과 같다(S07-4). 다른 사유가 없을 때만, 기한 안내(`pending`)가 못 나간 이유를 말한다.
  if (
    reasons.length === 0 &&
    r.kind === "return_to_farm" &&
    r.acquisitionDate &&
    ruralReturnToFarmDeadlineApplies(r.acquisitionDate) &&
    qualifiesRuralHouseApartFromDeadline(input) &&
    !isWithinDeadline(r.acquisitionDate, RURAL_RETURN_TO_FARM_TRANSFER_YEARS, input.transferDate)
  ) {
    const dl = deadlineEndFrom(r.acquisitionDate, RURAL_RETURN_TO_FARM_TRANSFER_YEARS);
    const why = deadlineHoldingUnmetReason(input, oneHouseRules.one_house_exemption, dl.end, "귀농주택 취득일부터 5년");
    if (why) reasons.push(why);
  }
  if (reasons.length === 0) return [];

  return [
    {
      id: `155-7-rural:${r.kind}`,
      label: `농어촌주택 (${RURAL_HOUSE_LABEL[r.kind]})`,
      legalBasis: `${TRANSFER.TEMPORARY_TWO_HOUSE}⑦`,
      reasons,
    },
  ];
}

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
function collectInheritedUnmet(input: OneHouseJudgeInput): OneHouseUnmetException[] {
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

/** 표시용 날짜 — 화면이 아니라 엔진이 문장을 만들므로 여기서 포맷한다(YYYY-MM-DD). */
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
