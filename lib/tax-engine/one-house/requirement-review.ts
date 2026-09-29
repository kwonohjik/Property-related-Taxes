/**
 * 1세대1주택 판정 — **비과세 요건 순차 검토** echo (2026-09-29)
 *
 * 계획서 `docs/00-pm/one-house-judgment-temp-two-house-review.plan.md` §5-3.
 *
 * 판정 결과 화면이 결론(배지)만 보여 주고 **어느 요건에서 떨어졌는지**는 보여 주지 않았다.
 * 이 모듈은 법정 검토 순서대로 요건 행을 만든다.
 *
 * ## 🔑 판정을 다시 하지 않는다
 *
 * 각 행의 `status`는 `checkExemptionCore`가 쓰는 **정본 술어의 반환값을 옮긴 것**이다
 * (`evaluateTemporaryTwoHouseTiming` · `describeOneHouseHoldingRequirement` ·
 * `describeOneHouseResidenceRequirement` · `resolveHighValueHouseThreshold`). 요건을 여기서
 * 다시 쓰면 「과세」 배지 아래에 「전 요건 충족」이 그려지는 dual truth가 된다 —
 * 행렬 드리프트 가드(`one-house-requirement-review.anchor.test.ts`)가 동치를 고정한다.
 *
 * ## 🔑 싣는 경우는 세 가지뿐이다
 *
 *   `155-1-temporary-two-house` — §155① 일시적 2주택(E-3)으로 판정된 경우
 *   `154-1-one-house`           — 1주택 단독 양도(E-4·E-1·E-2)로 판정된 경우
 *   `155-4-5-merge`             — §155④⑤ 합가(E-3.5)로 판정됐거나, 합가를 선언했는데 성립하지 않은
 *                                 경우(2026-09-29 — `docs/00-pm/one-house-judgment-merge-house-link.plan.md`)
 *
 * 다른 특례(상속·농어촌·대체주택 등)로 결론이 났거나 §89② 배제면 싣지 않는다. 그 요건은
 * 이 행들과 다르고, 「적용된 특례」·「선언했으나 적용되지 않은 특례」 카드가 따로 말한다.
 */
import { deadlineEndFrom, isAfterPeriod, isOnOrBeforeDay, isWithinDeadline } from "../civil-period";
import { resolveMergeExemptionYears } from "../data/merge-exemption-era";
import { TRANSFER } from "../legal-codes";
import type { OneHouseSpecialRulesData } from "../schemas/rate-table.schema";
import type { Article89Clause2Result } from "../transfer-tax-89-2-exclusion";
import {
  describeOneHouseHoldingRequirement,
  describeOneHouseResidenceRequirement,
  DISPOSAL_DELAY_REASON_LABEL,
  evaluateTemporaryTwoHouseTiming,
  mergeDeemingHouseCountHolds,
  qualifiesLongTermMortgageResidenceExemption,
  type OneHouseResidenceBasis,
} from "../transfer-tax-exemption-requirements";
import {
  formatHighValueThresholdLabel,
  resolveHighValueHouseThreshold,
  resolveHighValuePriceCheck,
} from "./threshold";
import { resolveMergeComposition } from "./merge-composition";
import type {
  OneHouseAppliedException,
  OneHouseJudgeInput,
  OneHouseRequirementCheck,
  OneHouseRequirementReview,
  OneHouseRequirementStatus,
} from "./types";

type OneHouseRule = OneHouseSpecialRulesData["one_house_exemption"];

/** §155④⑤ 합가로 결론이 났음을 뜻하는 적용 특례 id(중첩이면 §155①과 함께 붙는다). */
const MERGE_EXCEPTION_IDS = ["155-5-marriage-merge", "155-4-parental-care-merge"];

/** 1주택 경로(E-1·E-2)가 비과세일 때 붙일 수 있는 적용 특례 — 요건을 **완화**한 것만이다. */
const ONE_HOUSE_RELAXATION_PREFIXES = ["154-1-proviso:", "155-2-1-", "155-3-1-"];

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 「이 날까지 양도」 기한이 **판정 기준일에 아직 이룰 수 있는가** — 기한 당일까지 양도할 수 있다.
 * pending 필터(`checkExemption`)와 요건 행 안내가 **같은 술어**를 쓴다.
 */
export function isDeadlineStillReachable(deadline: Date, judgmentBaseDate: Date): boolean {
  return isOnOrBeforeDay(judgmentBaseDate, deadline);
}

export function buildRequirementReview(
  input: OneHouseJudgeInput,
  oneHouseRules: OneHouseSpecialRulesData,
  verdict: { isExempt: boolean; isPartialExempt: boolean; appliedExceptions: OneHouseAppliedException[] },
  article89Clause2: Article89Clause2Result,
  judgmentBaseDate?: Date,
): OneHouseRequirementReview | undefined {
  // 판정 본체의 선행 게이트 — 판정 대상이 아닌 자산에는 요건 검토가 없다.
  if (input.isUnregistered || input.oneHouseUnitRole === "appurtenant_land") return undefined;
  if (!input.isOneHousehold || input.propertyType !== "housing") return undefined;
  // §89② 배제는 본체 판정과 무관하게 결론을 뒤집는다 — 행이 전부 충족이어도 과세라 싣지 않는다.
  if (article89Clause2.status === "excluded") return undefined;

  const settled = verdict.isExempt || verdict.isPartialExempt;
  const ids = verdict.appliedExceptions.map((e) => e.id);
  const rule = oneHouseRules.one_house_exemption;
  const twoHouseRule = oneHouseRules.temporary_two_house;
  const mergeDeclared = !!(input.marriageMerge?.marriageDate ?? input.parentalCareMerge?.mergeDate);

  // 합가로 결론이 났으면(중첩 3주택 포함) 그 요건이 근거다 — §155① 행보다 먼저 본다.
  if (settled && ids.some((id) => MERGE_EXCEPTION_IDS.includes(id))) {
    return { scheme: "155-4-5-merge", items: mergeItems(input, rule, twoHouseRule, judgmentBaseDate) };
  }

  if (input.householdHousingCount === 2 && input.temporaryTwoHouse && twoHouseRule) {
    // 다른 §155 특례로 비과세가 됐으면 이 행들은 결론의 근거가 아니다.
    if (settled && !ids.includes("155-1-temporary-two-house")) return undefined;
    return {
      scheme: "155-1-temporary-two-house",
      items: temporaryTwoHouseItems(input, rule, twoHouseRule, judgmentBaseDate),
    };
  }

  // 합가를 선언했는데 결론이 나지 않았다 — 어느 요건에서 떨어졌는지 보여 준다.
  //   (§155①도 함께 성립 가능한 2주택은 위 분기가 먼저 잡는다 — 그쪽이 법이 가리키는 다음 경로다.)
  if (!settled && mergeDeclared && (input.householdHousingCount === 2 || input.householdHousingCount === 3)) {
    return { scheme: "155-4-5-merge", items: mergeItems(input, rule, twoHouseRule, judgmentBaseDate) };
  }

  if (input.householdHousingCount === 1) {
    if (settled && !ids.every((id) => ONE_HOUSE_RELAXATION_PREFIXES.some((p) => id.startsWith(p)))) {
      return undefined;
    }
    return { scheme: "154-1-one-house", items: oneHouseItems(input, rule) };
  }

  return undefined;
}

/** §155① — ① 1년 → ② 처분기한 → (②′ 전입) → ③ 보유 → ④ 거주 → 고가. */
function temporaryTwoHouseItems(
  input: OneHouseJudgeInput,
  rule: OneHouseRule,
  twoHouseRule: NonNullable<OneHouseSpecialRulesData["temporary_two_house"]>,
  judgmentBaseDate: Date | undefined,
): OneHouseRequirementCheck[] {
  const tth = input.temporaryTwoHouse!;
  const { provisoRelaxesHolding, timing, era } = evaluateTemporaryTwoHouseTiming(input, twoHouseRule);
  const basis155 = `${TRANSFER.TEMPORARY_TWO_HOUSE}①`;
  const items: OneHouseRequirementCheck[] = [];

  // ① 「종전의 주택을 취득한 날부터 1년 이상이 지난 후 신규 주택을 취득」
  const oneYearNatural = isAfterPeriod(tth.previousAcquisitionDate, 1, tth.newAcquisitionDate);
  items.push({
    id: "one-year",
    label: "종전주택 취득일부터 1년 이상 지난 뒤 신규주택 취득",
    status: oneYearNatural ? "met" : timing.oneYearMet ? "waived" : "unmet",
    facts: [
      { label: "종전주택 취득일", value: fmt(tth.previousAcquisitionDate) },
      { label: "1년 경과일", value: fmt(timing.oneYearThreshold) },
      { label: "신규주택 취득일", value: fmt(tth.newAcquisitionDate) },
    ],
    ...(!oneYearNatural && timing.oneYearMet
      ? {
          note: provisoRelaxesHolding
            ? "§154① 단서 사유에 해당해 1년 요건을 적용하지 않습니다."
            : "§155⑯ 법인·공공기관 지방이전에 해당해 1년 요건을 적용하지 않습니다.",
        }
      : {}),
    legalBasis: oneYearNatural || provisoRelaxesHolding || !timing.oneYearMet ? basis155 : `${TRANSFER.TEMPORARY_TWO_HOUSE}⑯`,
  });

  // ② 「신규 주택을 취득한 날부터 3년 이내에 종전의 주택을 양도」(⑱ 사유 포함)
  const withinDeadline = isOnOrBeforeDay(input.transferDate, timing.deadline);
  const deadlineStatus: OneHouseRequirementStatus = timing.threeYearMet
    ? withinDeadline
      ? "met"
      : "waived"
    : "unmet";
  const deadlineNotes: string[] = [];
  if (deadlineStatus === "waived" && tth.disposalDelayReason) {
    deadlineNotes.push(
      `§155⑱ 사유(${DISPOSAL_DELAY_REASON_LABEL[tth.disposalDelayReason]})에 해당해 기한 요건을 충족한 것으로 봅니다.`,
    );
  }
  if (deadlineStatus === "unmet") {
    deadlineNotes.push(
      judgmentBaseDate && !isDeadlineStillReachable(timing.deadline, judgmentBaseDate)
        ? `처분기한이 판정 기준일(${fmt(judgmentBaseDate)}) 전에 지나 양도일을 조정해도 충족할 수 없습니다.`
        : `${fmt(timing.deadline)}까지 양도하면 이 요건을 충족합니다.`,
    );
  }
  if (timing.deadlineNote) deadlineNotes.push(timing.deadlineNote);
  items.push({
    id: "disposal-deadline",
    label: era.deadlineDate
      ? "신규주택 취득일부터 기존 임차인의 임대차계약 종료일까지(최대 2년) 종전주택 양도"
      : `신규주택 취득일부터 ${era.years}년 이내 종전주택 양도`,
    status: deadlineStatus,
    facts: [
      { label: "신규주택 취득일", value: fmt(tth.newAcquisitionDate) },
      { label: "처분기한", value: fmt(timing.deadline) },
      { label: "양도(예정)일", value: fmt(input.transferDate) },
    ],
    ...(deadlineNotes.length > 0 ? { note: deadlineNotes.join(" ") } : {}),
    legalBasis: deadlineStatus === "waived" ? `${TRANSFER.TEMPORARY_TWO_HOUSE}⑱` : basis155,
  });

  // ②′ 2019-12-17 체제 — 1년 내 세대 전원 이사·전입신고(연혁 leaf가 해당할 때만 값이 있다)
  if (timing.moveInMet !== undefined) {
    items.push({
      id: "move-in",
      label: "신규주택 취득일부터 1년 이내 세대 전원 이사·전입신고(조정대상지역 신규주택 취득분)",
      status: timing.moveInMet ? "met" : "unmet",
      facts: [],
      legalBasis: basis155,
    });
  }

  // ③ 종전주택 보유 — §155①이 「제154조제1항을 적용」하므로 그대로 요구된다.
  //    E-3의 보유 게이트는 `meetsTemporaryTwoHousePrevHolding`(화이트리스트 단서만 면제)다.
  const holding = describeOneHouseHoldingRequirement(input, rule);
  items.push(
    holdingItem(
      holding,
      rule,
      holding.met ? "met" : provisoRelaxesHolding ? "waived" : "unmet",
      "종전주택",
    ),
  );

  // ④ 종전주택 거주 — E-3는 §155의2 면제 인자를 넘기지 않는다(1주택 경로 한정).
  items.push(residenceItem(describeOneHouseResidenceRequirement(input, rule), false, "종전주택"));

  items.push(highValueItem(input));
  return items;
}

/**
 * §155④⑤ 합가 — ① 합가 전 구성 → ② 양도 주택 합가 전 취득 → ③ 먼저 양도 → ④ N년 이내 → 보유 → 거주 → 고가.
 *
 * 각 행은 `matchMergeApartFromWindow`·`matchMergeWindow`(requirements.ts)의 탈락 지점과 1:1이다.
 * 합가 의제가 성립하면 E-3.5가 `meetsOneHouseHoldingResidence`(§155의2 면제 없이)로 보유·거주를 본다.
 */
function mergeItems(
  input: OneHouseJudgeInput,
  rule: OneHouseRule,
  twoHouseRule: OneHouseSpecialRulesData["temporary_two_house"],
  judgmentBaseDate: Date | undefined,
): OneHouseRequirementCheck[] {
  const isMarriage = input.marriageMerge?.marriageDate !== undefined;
  const mergeDate = (input.marriageMerge?.marriageDate ?? input.parentalCareMerge?.mergeDate)!;
  const event = isMarriage ? "혼인" : "합가";
  const basis = isMarriage ? TRANSFER.MARRIAGE_MERGE_EXEMPT : TRANSFER.PARENTAL_CARE_MERGE_EXEMPT;
  const items: OneHouseRequirementCheck[] = [];

  // ① 「1주택을 보유하는 자가 1주택을 보유하는 자와 … 합침으로써 1세대가 2주택」
  const count = input.householdHousingCount;
  const countHolds = mergeDeemingHouseCountHolds(input, twoHouseRule);
  const composition = resolveMergeComposition({
    householdHousingCount: count,
    houses: input.houses,
    sellingHouseId: input.sellingHouseId,
    mergeDate,
  });
  const compositionFacts =
    composition.status === "fails"
      ? [
          { label: `${event} 전 양도자 쪽`, value: `${composition.sellerSide}채` },
          { label: `${event} 전 상대 쪽`, value: `${composition.counterpartSide}채` },
          { label: `${event} 후 취득`, value: `${composition.afterMergeDates.length}채` },
        ]
      : [];
  items.push({
    id: "merge-composition",
    label: `${event} 전 각자 1주택을 보유하다가 ${isMarriage ? "혼인으로" : "합가로"} 1세대 2주택이 됨`,
    status: !countHolds || composition.status === "fails" ? "unmet" : composition.status === "holds" ? "met" : "unchecked",
    facts: [{ label: "세대 주택 수", value: `${count}채` }, ...compositionFacts],
    ...(!countHolds
      ? {
          note:
            count === 3
              ? "3주택은 일시적 2주택 특례(§155①)와 겹친 경우에만 인정됩니다 — 그 기간 요건을 충족하지 않습니다."
              : `합가 특례는 2주택(일시적 2주택과 겹친 경우 3주택)까지만 적용됩니다.`,
        }
      : composition.status === "fails"
        ? {
            note:
              composition.reason === "acquired_after_merge"
                ? `다른 주택을 ${event}일 이후에 취득했습니다 — ${isMarriage ? "혼인으로" : "합가로"} 2주택이 된 것이 아닙니다.`
                : composition.reason === "seller_side_only"
                  ? `${event} 전 양도자 쪽이 이미 ${composition.sellerSide}주택이었고 상대 쪽은 무주택이었습니다.`
                  : `${event} 전 보유 구성이 「각자 1주택」(일시적 2주택과 겹친 경우 한쪽 2주택)에 맞지 않습니다.`,
          }
        : composition.status === "unknown"
          ? { note: `보유 주택 목록에서 각 주택의 ${event} 전 보유자를 고르면 이 요건까지 판정합니다.` }
          : {}),
    legalBasis: basis,
  });

  // ② 양도 주택이 합가 전(당일 포함) 보유분
  items.push({
    id: "merge-selling-before",
    label: `양도 주택을 ${event}일 이전(당일 포함)에 취득`,
    status: input.acquisitionDate.getTime() <= mergeDate.getTime() ? "met" : "unmet",
    facts: [
      { label: "양도 주택 취득일", value: fmt(input.acquisitionDate) },
      { label: `${event}일`, value: fmt(mergeDate) },
    ],
    legalBasis: basis,
  });

  // ③ 「먼저 양도하는 주택」 — 사용자 선언
  items.push({
    id: "merge-first-transfer",
    label: `${event} 후 세대에서 먼저 양도하는 주택`,
    status: input.isFirstTransferredInMerge === true ? "met" : "unmet",
    facts: [],
    legalBasis: basis,
  });

  // ④ 「합친 날(혼인한 날)부터 N년 이내」 — N은 양도일 연혁(OH-29)
  const years = resolveMergeExemptionYears(isMarriage ? "marriage" : "parental_care", input.transferDate);
  const deadline = deadlineEndFrom(mergeDate, years).end;
  const afterMerge = input.transferDate.getTime() >= mergeDate.getTime();
  const within = afterMerge && isWithinDeadline(mergeDate, years, input.transferDate);
  items.push({
    id: "merge-window",
    label: `${event}일부터 ${years}년 이내 양도`,
    status: within ? "met" : "unmet",
    facts: [
      { label: `${event}일`, value: fmt(mergeDate) },
      { label: "기한", value: fmt(deadline) },
      { label: "양도(예정)일", value: fmt(input.transferDate) },
    ],
    ...(!afterMerge
      ? { note: `${event}일 전의 양도입니다 — ${isMarriage ? "혼인으로" : "합가로"} 2주택이 되기 전입니다.` }
      : !within
        ? {
            note:
              judgmentBaseDate && !isDeadlineStillReachable(deadline, judgmentBaseDate)
                ? `기한이 판정 기준일(${fmt(judgmentBaseDate)}) 전에 지나 양도일을 조정해도 충족할 수 없습니다.`
                : `${fmt(deadline)}까지 양도하면 이 요건을 충족합니다.`,
          }
        : {}),
    legalBasis: basis,
  });

  const holding = describeOneHouseHoldingRequirement(input, rule);
  items.push(holdingItem(holding, rule, holding.met ? "met" : holding.provisoWaives ? "waived" : "unmet", "양도주택"));
  items.push(residenceItem(describeOneHouseResidenceRequirement(input, rule), false, "양도주택"));
  items.push(highValueItem(input));
  return items;
}

/** 1주택 단독 — 1세대 1주택 → 보유 → 거주 → 고가. */
function oneHouseItems(input: OneHouseJudgeInput, rule: OneHouseRule): OneHouseRequirementCheck[] {
  const holding = describeOneHouseHoldingRequirement(input, rule);
  return [
    {
      id: "one-house",
      label: "1세대가 양도일 현재 국내에 1주택 보유",
      status: "met",
      facts: [{ label: "판정에 세는 주택", value: "1채" }],
      legalBasis: TRANSFER.ONE_HOUSE_EXEMPT,
    },
    holdingItem(holding, rule, holding.met ? "met" : holding.provisoWaives ? "waived" : "unmet", ""),
    // E-4는 §155의2① 장기저당담보주택 거주기간 면제를 여기서 주입한다.
    residenceItem(
      describeOneHouseResidenceRequirement(input, rule),
      qualifiesLongTermMortgageResidenceExemption(input),
      "",
    ),
    highValueItem(input),
  ];
}

function holdingItem(
  holding: ReturnType<typeof describeOneHouseHoldingRequirement>,
  rule: OneHouseRule,
  status: OneHouseRequirementStatus,
  subject: string,
): OneHouseRequirementCheck {
  return {
    id: "holding",
    label: `${subject ? `${subject} ` : ""}보유기간 ${rule.minHoldingYears}년 이상`,
    status,
    facts: [
      { label: "보유 기산일", value: fmt(holding.startDate) },
      { label: "보유기간", value: `${holding.years}년 ${holding.months}개월` },
    ],
    ...(status === "waived" ? { note: "§154① 단서 사유에 해당해 보유기간 요건을 적용하지 않습니다." } : {}),
    legalBasis: TRANSFER.ONE_HOUSE_REQUIREMENT,
  };
}

const RESIDENCE_STATUS: Record<OneHouseResidenceBasis, OneHouseRequirementStatus> = {
  proviso: "waived",
  win_win_rental: "waived",
  not_regulated: "not_required",
  pre_policy: "not_required",
  met: "met",
  unmet: "unmet",
};

const RESIDENCE_NOTE: Partial<Record<OneHouseResidenceBasis, string>> = {
  proviso: "§154① 단서 사유에 해당해 거주요건을 적용하지 않습니다.",
  win_win_rental: "상생임대주택(§155의3)으로 거주기간의 제한을 받지 않습니다.",
  not_regulated: "취득 당시 조정대상지역이 아니어서 거주요건이 없습니다.",
  pre_policy: "조정대상지역 거주요건 도입(2017.8.3.) 전에 취득해 거주요건이 적용되지 않습니다.",
};

function residenceItem(
  residence: ReturnType<typeof describeOneHouseResidenceRequirement>,
  longTermMortgageExempt: boolean,
  subject: string,
): OneHouseRequirementCheck {
  // §155의2① — 거주요건만 면제한다. 이미 충족·요건 없음이면 그 사실이 더 정확하다.
  const mortgageWaives = longTermMortgageExempt && residence.basis === "unmet";
  const status = mortgageWaives ? "waived" : RESIDENCE_STATUS[residence.basis];
  const note = mortgageWaives
    ? "장기저당담보주택(§155의2)으로 거주기간의 제한을 받지 않습니다."
    : RESIDENCE_NOTE[residence.basis];
  return {
    id: "residence",
    label: `${subject ? `${subject} ` : ""}거주기간 ${residence.requiredYears}년 이상(취득 당시 조정대상지역인 경우)`,
    status,
    facts: [
      { label: "취득 당시 조정대상지역", value: residence.wasRegulated ? "해당" : "비해당" },
      { label: "거주기간", value: `${residence.residenceMonths}개월` },
    ],
    ...(note ? { note } : {}),
    legalBasis: TRANSFER.ONE_HOUSE_REQUIREMENT,
  };
}

/** 법 §89①3호 각 목 외의 부분 — 기준금액(양도일 연혁) 초과분은 과세. */
function highValueItem(input: OneHouseJudgeInput): OneHouseRequirementCheck {
  const threshold = resolveHighValueHouseThreshold(input.transferDate);
  const price = resolveHighValuePriceCheck(input);
  const label = formatHighValueThresholdLabel(threshold);
  const over = price > threshold;
  return {
    id: "high-value",
    label: `양도가액 ${label}원 이하(고가주택이 아님)`,
    status: over ? "partial" : "met",
    facts: [
      { label: "양도가액", value: price.toLocaleString("ko-KR") },
      { label: "고가주택 기준금액", value: label },
    ],
    ...(over ? { note: `고가주택이므로 양도차익 중 ${label}원 초과분에 해당하는 부분은 과세됩니다.` } : {}),
    legalBasis: TRANSFER.ONE_HOUSE_EXEMPT,
  };
}
