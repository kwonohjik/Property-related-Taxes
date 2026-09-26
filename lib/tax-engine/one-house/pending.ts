/**
 * 1세대1주택 판정 — **조건부·기한**(`pending[]`)과 **판정 보류**(`undetermined[]`) 수집 (P4-1).
 *
 * 계획서 `docs/00-pm/one-house-exemption-automation.plan.md` G-3 ·
 * 엔진 설계 `one-house-exemption-automation.engine.design.md` 「6. pending[] 생성」.
 *
 * ## 왜 별도 파일인가
 *
 * `checkExemptionCore`에는 반환 지점이 **22개**고 그중 12개가 과세다. 기한을 각 지점에
 * 끼워 넣으면 그 12곳을 전부 고쳐야 하고, 「어느 요건이 마지막으로 남았는가」는 분기 안에서
 * 알 수 없다(분기를 빠져나간 뒤에야 확정된다). ⇒ 판정이 끝난 뒤 **한 층에서** 모은다.
 *
 * ## 🔑 pending의 계약 — 지키지 않으면 틀린 약속이 된다
 *
 * 「이 날짜까지 ~하면 비과세」는 **기한이 남은 그 요건 하나만 미충족일 때만** 참이다.
 * 보유기간도 못 채운 세대에게 「기한 내 양도하면 비과세」라고 하면 **거짓말**이다.
 * ⇒ 각 축마다 「그 요건을 충족시켰다면 실제로 비과세였는가」를 **같은 술어로** 확인한다.
 *
 * ## 🔑 재계산하지 않는다
 *
 * 날짜는 전부 기존 술어가 이미 만든 값이거나(`judgeTemporaryTwoHouseTiming.deadline`),
 * 기존 정본 기산일에 술어와 같은 기간 함수(`civil-period.ts`·`calculateHoldingPeriod`)를 적용한 것이다
 * (`resolveExemptionHoldingStartDate` 등). 기산일 규칙을 여기서 다시 쓰지 않는다 —
 * 두 벌이 되면 §154⑤ 용도변경·§154⑧3호 상속 통산이 한쪽에만 반영된다.
 */
import { addDays, addYears } from "date-fns";
import { isWithinPeriod, periodEndFrom } from "../civil-period";
import { INHERITED_HOUSE, TRANSFER, shortArticle } from "../legal-codes";
import {
  resolveInheritedHouseExclusionFromInput,
  resolveInheritedSellingHouseId,
} from "../transfer-inheritance-exclusion";
import { calculateHoldingPeriod } from "../tax-utils";
import type { OneHouseSpecialRulesData } from "../schemas/rate-table.schema";
import type { Article89Clause2Result } from "../transfer-tax-89-2-exclusion";
import {
  evaluateTemporaryTwoHouseTiming,
  meetsOneHouseHoldingResidence,
  meetsOneHouseResidenceRequirement,
  MERGE_EXEMPTION_YEARS,
  qualifiesLongTermMortgageResidenceExemption,
  resolveExemptionHoldingStartDate,
  RURAL_HOUSE_LABEL,
  RURAL_HOUSE_RESIDENCE_YEARS,
  RURAL_RETURN_TO_FARM_MAX_LAND_SQM,
  RURAL_RETURN_TO_FARM_TRANSFER_YEARS,
  UNAVOIDABLE_OUTSIDE_CAPITAL_YEARS,
  UNAVOIDABLE_REASON_LABEL,
} from "../transfer-tax-exemption-requirements";
import type {
  OneHouseJudgeInput,
  OneHousePendingCondition,
  OneHouseUndetermined,
  OneHouseUnmetException,
} from "./types";

type OneHouseRule = OneHouseSpecialRulesData["one_house_exemption"];

/**
 * §155① 종전주택의 **§154① 보유 2년** 충족 여부 — E-3와 `collectPendingConditions`의 **단일 소스**.
 *
 * 🔴 E-3(`transfer-tax-exemption.ts`)가 쓰던 인라인 2줄을 그대로 옮긴 것이다. 기한 수집기가
 *    같은 판정을 따로 쓰면 §154⑤(용도변경)·§154⑧3호(동일세대 상속 통산) 기산일 보정이
 *    한쪽에만 반영돼 「비과세인데 기한 안내가 안 뜨는」 모순이 난다.
 *
 * ⚠️ `provisoRelaxesHolding`은 `meetsOneHouseHoldingResidence`의 `proviso === "both"`와 **다르다** —
 *    §155① 준용 화이트리스트(`TEMP_TWO_HOUSE_PROVISO_REASONS`)로 좁혀진 값이라 호출부가 주입한다.
 */
export function meetsTemporaryTwoHousePrevHolding(
  input: OneHouseJudgeInput,
  rule: Pick<OneHouseRule, "minHoldingYears">,
  provisoRelaxesHolding: boolean,
): boolean {
  if (provisoRelaxesHolding) return true;
  const prevHolding = calculateHoldingPeriod(
    resolveExemptionHoldingStartDate(input),
    input.transferDate,
  );
  return prevHolding.years >= rule.minHoldingYears;
}

/**
 * §154① **보유요건만** 미충족인가 — 거주요건은 충족한 상태인가.
 *
 * 🔑 `meetsHolding`을 다시 구현하지 않는다. `meetsOneHouseHoldingResidence`가
 *    `meetsHolding && (면제 || 거주충족)`이므로, **거주가 참이면 그 함수값이 곧 `meetsHolding`**이다.
 *    두 기존 export의 논리곱에서 정확히 역산된다(중복 구현 0).
 */
function holdingIsTheOnlyUnmetRequirement(input: OneHouseJudgeInput, rule: OneHouseRule): boolean {
  const residenceExempt = qualifiesLongTermMortgageResidenceExemption(input);
  const residenceOk = residenceExempt || meetsOneHouseResidenceRequirement(input, rule);
  if (!residenceOk) return false;
  return !meetsOneHouseHoldingResidence(input, rule, residenceExempt);
}

/**
 * §154① 보유요건 충족 예정일 — `calculateHoldingPeriod`(§95④ 초일 산입)로 최소 보유연수가 되는
 * **가장 이른 양도일**. N년은 기산일 응당일의 전날 만료(민법 §160②)라 기본값은 그 전날이고,
 * 응당일이 없는 달(2/29 기산)은 §160③ 월말이 만료일이라 판정 함수로 하루를 보정한다.
 */
function holdingDeadline(input: OneHouseJudgeInput, rule: OneHouseRule): Date {
  const start = resolveExemptionHoldingStartDate(input);
  const candidate = addDays(addYears(start, rule.minHoldingYears), -1);
  return calculateHoldingPeriod(start, candidate).years >= rule.minHoldingYears
    ? candidate
    : addDays(candidate, 1);
}

/**
 * 조건부·기한 수집 — **과세로 판정된 경우에만** 부른다.
 *
 * @param article89Clause2 §89② 판정. `"excluded"`면 그 축이 유일한 장애물인지 따로 본다.
 * @param coreWouldPass §89②을 **무시했을 때** 본체 판정이 비과세·부분과세였는가.
 *   §89② 배제는 본체 판정보다 먼저 단락하므로, 「그것만 아니었다면」을 알려면 이 값이 필요하다.
 */
export function collectPendingConditions(
  input: OneHouseJudgeInput,
  oneHouseRules: OneHouseSpecialRulesData,
  article89Clause2: Article89Clause2Result,
  coreWouldPass: boolean,
): OneHousePendingCondition[] {
  const { one_house_exemption: rule, temporary_two_house: twoHouseRule } = oneHouseRules;
  const pending: OneHousePendingCondition[] = [];

  /**
   * 🔴 판정 본체(`checkExemptionCore`)의 **선행 게이트 3개를 그대로 복제**한다 — 하나라도 빠지면
   *    판정 대상이 아닌 자산에 기한 안내가 붙는다.
   *
   * 실측(P4-1 뮤테이션 M13이 드러냈다): 이 게이트가 없을 때
   * `isOneHousehold: false`(1세대 비해당 **선언**)와 `propertyType: "land"`에도
   * 「§155① 종전주택 처분기한」이 떴다. 둘 다 본체는 `:188`에서 즉시 과세로 반환하는 자리다.
   *
   * ⚠️ 부수토지 카드(`oneHouseUnitRole === "appurtenant_land"`)도 제외한다 — 그 카드의 판정은
   *    **짝 주택을 따르는** 것이라 이 카드 자체의 기한이라는 개념이 없다.
   */
  if (input.isUnregistered) return pending; // §91① — 기한으로 치유되지 않는다
  if (input.oneHouseUnitRole === "appurtenant_land") return pending;
  if (!input.isOneHousehold || input.propertyType !== "housing") return pending;

  /**
   * §89② 축 — 「주택 + 권리」 세대가 **권리 취득일부터 3년**을 넘겨 배제된 경우.
   *
   * 그 3년이 유일한 장애물일 때만 낸다(`coreWouldPass`). 보유 2년도 못 채운 세대에게
   * 「3년 내 양도했으면 비과세」라고 하면 안 된다.
   */
  if (article89Clause2.status === "excluded" && article89Clause2.deadline && coreWouldPass) {
    pending.push({
      id: "156-2-3-right-three-year",
      description: "주택과 조합원입주권·분양권을 함께 보유한 세대는 권리 취득일부터 3년 이내에 종전주택을 양도해야 비과세",
      deadline: article89Clause2.deadline,
      legalBasis: TRANSFER.RIGHT_HOLDING_EXCLUSION,
    });
    // §89② 배제가 확정된 이상 아래 §154①·§155 축의 기한을 함께 내면 「무엇을 하면 되는지」가
    // 흐려진다 — 배제를 먼저 풀어야 한다. 한 축만 낸다.
    return pending;
  }
  if (article89Clause2.status === "excluded") return pending;

  /**
   * §155① 일시적 2주택 — **종전주택 처분기한**.
   *
   * 요건 A(1년)는 이미 지난 사실(신규주택을 언제 샀는가)이라 **치유할 수 없다** ⇒ pending 대상 아님.
   * 요건 B(처분기한)만 미충족이고 §154① 보유·거주가 충족일 때 기한을 낸다.
   */
  if (input.householdHousingCount === 2 && input.temporaryTwoHouse && twoHouseRule) {
    const { provisoRelaxesHolding, timing } = evaluateTemporaryTwoHouseTiming(input, twoHouseRule);
    /**
     * 📌 `!timing.threeYearMet`는 **현재 도달 불가능한 방어 조건**이다(뮤테이션 M13 SURVIVED).
     *    나머지 네 조건이 모두 참이면 E-3가 비과세를 내고, 그러면 `checkExemption`의 `settled`
     *    단락이 이 함수를 아예 부르지 않는다. 위 게이트 3개를 닫기 전에는 1세대 비해당·토지·
     *    부수토지 경로로 도달했는데(그것이 M13의 진짜 값어치였다) 이제 그 길이 막혔다.
     *    형제 조건과 모양을 맞추고 의도를 드러내기 위해 남긴다 — 지워도 현재 동작은 같다.
     */
    if (
      !timing.threeYearMet &&
      timing.oneYearMet &&
      meetsTemporaryTwoHousePrevHolding(input, rule, provisoRelaxesHolding) &&
      meetsOneHouseHoldingResidence(input, rule)
    ) {
      pending.push({
        id: "155-1-disposal-deadline",
        description: "신규주택 취득일부터 이 날짜까지 종전주택을 양도해야 비과세",
        deadline: timing.deadline,
        /**
         * 🔴 **`shortArticle`을 쓰지 않는다.** 이 필드는 `exemptReason` 문장 속 인라인 인용이
         *    아니라 화면이 `LawArticleModal legalBasis=`로 넘기는 **구조화 인용**이다.
         *    법령명이 없으면 `parseLawRef`가 「본법↔시행령 오인 위험」으로 `null`을 반환하고
         *    (`law-url.ts:59-61`), 배지를 눌러도 **「조문 정보를 파싱할 수 없습니다」**만 뜬다.
         *    실제 서버 응답으로 재현했다(2026-09-20). 항(①)은 남겨야 본문 하이라이트가 걸린다.
         */
        legalBasis: `${TRANSFER.TEMPORARY_TWO_HOUSE}①`,
      });
    }
  }

  /**
   * §155④⑤ 혼인·동거봉양 합가 — 합가일부터 **10년** 이내 「먼저 양도하는 주택」.
   *
   * `resolveMergeDeeming`은 10년을 넘기면 `undefined`를 돌려줄 뿐 날짜를 남기지 않는다
   * (`matchMergeWindow`의 `isWithinPeriod(mergeDate, MERGE_EXEMPTION_YEARS, …)`).
   * 같은 기간 함수로 기한(만료일 — 초일불산입)을 복원한다.
   */
  const mergeAxes: Array<{ id: string; mergeDate?: Date; label: string; basis: string }> = [
    {
      id: "155-5-marriage-merge",
      mergeDate: input.marriageMerge?.marriageDate,
      label: "혼인한 날",
      basis: TRANSFER.MARRIAGE_MERGE_EXEMPT,
    },
    {
      id: "155-4-parental-care-merge",
      mergeDate: input.parentalCareMerge?.mergeDate,
      label: "합친 날",
      basis: TRANSFER.PARENTAL_CARE_MERGE_EXEMPT,
    },
  ];
  for (const axis of mergeAxes) {
    if (!axis.mergeDate) continue;
    // 합가 의제는 「먼저 양도하는 주택」이 전제다 — 그 선언이 없으면 기한 안내가 의미 없다.
    if (input.isFirstTransferredInMerge !== true) continue;
    const deadline = periodEndFrom(axis.mergeDate, MERGE_EXEMPTION_YEARS);
    // 기한 내인데 과세면 원인이 다른 곳이다
    if (isWithinPeriod(axis.mergeDate, MERGE_EXEMPTION_YEARS, input.transferDate)) continue;
    if (!meetsOneHouseHoldingResidence(input, rule)) continue;
    pending.push({
      id: axis.id,
      description: `${axis.label}부터 이 날짜까지 두 주택 중 먼저 양도하는 주택을 양도해야 비과세`,
      deadline,
      legalBasis: axis.basis,
    });
  }

  /**
   * §155⑧ 수도권 밖 부득이한 사유 주택 — **해소일부터 3년** 이내 일반주택 양도.
   *
   * 해소일이 없으면 현행 술어가 기한을 **보지 않고 통과**시키므로(안전측) 여기도 기한을 내지 않는다.
   * 그 사실은 `collectUndetermined`가 판정 보류로 남긴다.
   */
  const unavoidable = input.unavoidableOutsideCapitalHouse;
  if (unavoidable?.resolvedDate && input.householdHousingCount === 2) {
    const deadline = periodEndFrom(unavoidable.resolvedDate, UNAVOIDABLE_OUTSIDE_CAPITAL_YEARS);
    if (
      !isWithinPeriod(unavoidable.resolvedDate, UNAVOIDABLE_OUTSIDE_CAPITAL_YEARS, input.transferDate) &&
      meetsOneHouseHoldingResidence(input, rule)
    ) {
      pending.push({
        id: "155-8-unavoidable-resolved",
        description: "부득이한 사유가 해소된 날부터 이 날짜까지 일반주택을 양도해야 비과세",
        deadline,
        legalBasis: TRANSFER.UNAVOIDABLE_OUTSIDE_CAPITAL,
      });
    }
  }

  /**
   * §155⑦3호 귀농주택 — 귀농주택 **취득일부터 5년** 이내 일반주택 양도.
   *
   * 1호(상속 농어촌주택)·2호(이농주택)에는 이 기한이 없다 — 3호에만 붙는다.
   */
  const rural = input.ruralHouse;
  if (rural?.kind === "return_to_farm" && rural.acquisitionDate && input.householdHousingCount === 2) {
    const deadline = periodEndFrom(rural.acquisitionDate, RURAL_RETURN_TO_FARM_TRANSFER_YEARS);
    if (
      !isWithinPeriod(rural.acquisitionDate, RURAL_RETURN_TO_FARM_TRANSFER_YEARS, input.transferDate) &&
      meetsOneHouseHoldingResidence(input, rule)
    ) {
      pending.push({
        id: "155-7-3ho-return-to-farm",
        description: "귀농주택 취득일부터 이 날짜까지 일반주택을 양도해야 비과세",
        deadline,
        // 위와 같은 이유로 법령명을 남긴다 — `§155⑦3호`만으로는 파싱되지 않는다.
        legalBasis: `${TRANSFER.TEMPORARY_TWO_HOUSE}⑦3호`,
      });
    }
  }

  /**
   * §154① **보유 2년** — 아직 못 채웠지만 기다리면 채워진다.
   *
   * 🔑 거주요건은 충족인데 보유만 모자란 경우에만 낸다. 둘 다 모자라면 「이 날까지 보유하면
   *    비과세」가 거짓이 된다(거주 개시일 입력이 없어 거주 충족 예정일은 낼 수 없다 —
   *    `collectUndetermined` 참조).
   */
  if (input.householdHousingCount === 1 && holdingIsTheOnlyUnmetRequirement(input, rule)) {
    pending.push({
      id: "154-1-holding-years",
      description: "이 날짜까지 보유한 뒤 양도해야 비과세(보유기간 요건)",
      deadline: holdingDeadline(input, rule),
      legalBasis: TRANSFER.ONE_HOUSE_REQUIREMENT,
    });
  }

  return pending;
}

/**
 * 판정 보류 수집 — 「요건 미충족」이 아니라 **「자료가 없어 판정하지 않았다」**.
 *
 * 둘을 섞지 않는 것이 이 저장소의 확립된 철학이다(§89② 3갈래). 미입력을 미해당으로 읽으면
 * 법 근거 없이 납세자에게 불리해진다(`feedback_no_unfavorable_application_without_legal_basis`).
 */
export function collectUndetermined(
  input: OneHouseJudgeInput,
  oneHouseRules: OneHouseSpecialRulesData,
  article89Clause2: Article89Clause2Result,
  settled: boolean,
): OneHouseUndetermined[] {
  const undetermined: OneHouseUndetermined[] = [];

  // §89② — 입력 경로가 없는 예외 항. 기존 `openArticles: string[]`를 구조화 형태로 옮긴다.
  for (const article of article89Clause2.openArticles ?? []) {
    undetermined.push({
      id: `89-2-open:${article}`,
      reason: `${article}에 해당하는지를 판정하지 않았습니다 — 해당 조문을 직접 확인하세요.`,
    });
  }

  /**
   * §155⑧ — 부득이한 사유 **해소일**이 없으면 3년 기한을 확인하지 않고 통과시킨다
   * (`qualifiesUnavoidableOutsideCapital` 안전측 설계). 그 사실을 숨기지 않는다.
   */
  if (input.unavoidableOutsideCapitalHouse && !input.unavoidableOutsideCapitalHouse.resolvedDate) {
    undetermined.push({
      id: "155-8-resolved-date-missing",
      reason:
        "부득이한 사유가 해소된 날을 입력하지 않아 3년 이내 양도 요건을 확인하지 않았습니다.",
    });
  }

  /**
   * §154① 거주요건 — 「언제까지 거주하면 충족」을 **구조적으로 낼 수 없다**.
   *
   * 입력이 `residencePeriodMonths`(개월 수)뿐이고 **거주 개시일 필드가 없어** 역산이 불가능하다.
   * 다른 축은 전부 기산일이 있어 `addYears`로 기한이 나오는데 이 축만 없다.
   * ⇒ 기한을 지어내지 않고(`pending`에 넣지 않고), **거주요건이 실제로 미충족이라 과세로
   *   갈린 경우에만** 「이 축은 날짜를 못 냈다」고 밝힌다.
   *
   * 🔑 비과세·부분과세(`settled`)면 낼 이유가 없다 — 이미 충족했거나 면제됐다.
   * 🔑 `qualifiesLongTermMortgageResidenceExemption`은 §155의2 경로 한정 면제라
   *    공통 술어(`meetsOneHouseResidenceRequirement`)에 들어 있지 않다 — 따로 본다.
   */
  const residenceExempt = qualifiesLongTermMortgageResidenceExemption(input);
  if (
    !settled &&
    input.propertyType === "housing" &&
    input.isOneHousehold === true &&
    !input.isUnregistered &&
    !residenceExempt &&
    !meetsOneHouseResidenceRequirement(input, oneHouseRules.one_house_exemption)
  ) {
    undetermined.push({
      id: "154-1-residence-deadline-unavailable",
      reason:
        "거주기간 요건을 충족하게 되는 날짜는 계산하지 않았습니다 — 거주 개시일이 아니라 거주 개월 수를 입력받기 때문입니다.",
    });
  }

  return undetermined;
}

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
 * 두 곳에서 같은 사실을 말하면 어느 쪽이 정본인지 흐려진다.
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
    ...collectUnavoidableUnmet(input, oneHouseRules),
    ...collectCulturalHeritageUnmet(input, oneHouseRules),
    ...collectRuralUnmet(input, oneHouseRules),
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
  const marriageDate = input.marriageMerge?.marriageDate;
  const parentalCareDate = input.parentalCareMerge?.mergeDate;
  const mergeDate = marriageDate ?? parentalCareDate;
  if (!mergeDate) return unmet;

  const isMarriage = marriageDate !== undefined;
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

  // ── 주택 수 조건 — `resolveMergeDeeming`(2주택) · `resolveMergeOverlapDeeming`(3주택) ──
  const count = input.householdHousingCount;
  if (count === 3) {
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
        "세대 주택 수가 3채입니다 — 합가 특례는 일시적 2주택 특례와 겹친 경우에만 3주택까지 적용되는데, ② 보유 주택 목록에서 신규 주택(양도 주택보다 나중에 취득한 주택)이 하나로 특정되지 않습니다.",
      );
    } else if (
      // 규칙 행이 없으면 정본(`resolveMergeOverlapDeeming`)도 기간을 보지 않고 불성립시킨다 —
      // 여기서도 「기간 미충족」이라 단정하지 않는다(규칙을 못 읽은 것과 요건 미충족은 다르다).
      oneHouseRules.temporary_two_house !== undefined &&
      !evaluateTemporaryTwoHouseTiming(input, oneHouseRules.temporary_two_house).timing.overall
    ) {
      reasons.push(
        "겹쳐 있는 일시적 2주택 특례가 기간 요건(종전주택 취득 후 1년 경과 후 신규주택 취득 · 신규주택 취득일부터 처분기한 내 양도)을 충족하지 않습니다.",
      );
    }
  } else if (count !== undefined && count !== 2) {
    reasons.push(
      `세대 주택 수가 ${count}채입니다 — 합가 특례는 2주택(일시적 2주택 특례와 겹친 경우 3주택)까지만 적용됩니다.`,
    );
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
  reasons.push(
    `${shortArticle(TRANSFER.ONE_HOUSE_REQUIREMENT)}① 보유 2년(취득 당시 조정대상지역이면 거주 2년) 요건을 충족하지 않습니다.`,
  );
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
 * 🔑 **해소일 미입력은 사유가 아니다.** 정본(`qualifiesUnavoidableOutsideCapital`)이 기한을
 *    기산하지 않고 **통과**시키는 자리라(해소 전 양도는 명문 없음 — 계획서 W-1), 미입력을
 *    미충족으로 읽으면 법 근거 없이 납세자에게 불리해진다. 그 사실은 `collectUndetermined`가
 *    판정 보류(`155-8-resolved-date-missing`)로 따로 밝힌다.
 * 🔑 **3년 기한 초과도 여기서 말하지 않는다** — `collectPendingConditions`가 **날짜와 함께**
 *    안내한다(`155-8-unavoidable-resolved`). 두 카드가 같은 사실을 말하지 않는다.
 */
function collectUnavoidableUnmet(
  input: OneHouseJudgeInput,
  oneHouseRules: OneHouseSpecialRulesData,
): OneHouseUnmetException[] {
  const u = input.unavoidableOutsideCapitalHouse;
  if (!u) return []; // 선언하지 않은 특례는 말하지 않는다

  const reasons: string[] = [];
  pushTwoHouseCountReason(reasons, input.householdHousingCount, "부득이한 사유로 취득한 수도권 밖 주택");
  pushBaseRequirementReason(reasons, input, oneHouseRules.one_house_exemption);
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
 *    안내한다(`155-7-3ho-return-to-farm`) — 여기서 중복해 말하지 않는다.
 */
function collectRuralUnmet(
  input: OneHouseJudgeInput,
  oneHouseRules: OneHouseSpecialRulesData,
): OneHouseUnmetException[] {
  const r = input.ruralHouse;
  if (!r) return []; // 선언하지 않은 특례는 말하지 않는다

  const reasons: string[] = [];
  pushTwoHouseCountReason(reasons, input.householdHousingCount, "농어촌주택");

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
      break;
    case "farm_exit":
      if ((r.ownerResidenceYears ?? 0) < RURAL_HOUSE_RESIDENCE_YEARS) {
        reasons.push(
          `2호 이농주택은 이농인이 취득일 후 ${RURAL_HOUSE_RESIDENCE_YEARS}년 이상 거주해야 하는데 입력값이 ${r.ownerResidenceYears ?? 0}년입니다.`,
        );
      }
      break;
    case "return_to_farm":
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
 * `resolveInheritedHouseExclusionFromInput`(정본)을 **그대로 호출**해 그 결과만 문장으로 옮긴다.
 * 순수 함수이고 인자가 같으므로 `runHouseCountExclusionStep`이 얻은 값과 항상 일치한다.
 */
function collectInheritedUnmet(input: OneHouseJudgeInput): OneHouseUnmetException[] {
  const sellingId = resolveInheritedSellingHouseId(input);
  const candidates = (input.houses ?? []).filter((h) => h.isInherited && h.id !== sellingId);
  if (candidates.length === 0) return []; // 선언하지 않은 특례는 말하지 않는다

  const x = resolveInheritedHouseExclusionFromInput(input);
  const reasons: string[] = [];

  if (input.generalHouseGiftedFromDecedentWithin2yr === true) {
    reasons.push(
      "양도하는 일반주택을 상속개시일부터 2년 이내에 피상속인으로부터 증여받았습니다 — 이 경우 상속주택 주택 수 제외가 전부 배제됩니다(§155② 단서).",
    );
  }
  if (x.sameHouseholdDisqualifiedCount > 0) {
    reasons.push(
      `상속주택 ${x.sameHouseholdDisqualifiedCount}채는 상속개시 당시 피상속인과 동일세대였습니다 — 주택 수 제외 대상이 아닙니다(§155② 단서). 동거봉양 합가로 합친 뒤 합가 전부터 보유한 경우에만 예외로 인정됩니다.`,
    );
  }
  if (x.rankingDisqualifiedCount > 0) {
    reasons.push(
      `상속주택 ${x.rankingDisqualifiedCount}채를 「순위상 상속주택이 아님」으로 선언했습니다 — 주택 수 제외 대상이 아닙니다(§155②1~4호).`,
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
      `제외 요건을 갖춘 공동상속주택(소수지분)이 ${x.eligibleCoMinorityCount}채여서 선순위 1채를 특정할 수 없습니다 — 어느 것도 주택 수에서 빼지 않았습니다.`,
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
