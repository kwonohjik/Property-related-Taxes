/**
 * 1세대1주택 비과세 — **§155①④⑤ 일시적 2주택·합가 1세대1주택 의제** (소득세법 시행령 §155①④⑤)
 *
 * `transfer-tax-exemption-requirements.ts`가 802줄로 파일 크기 정책(트리거 800·착지 ≤700)을
 * 다시 넘겨 분리했다(2026-10-05, 리드 전달). 이 묶음(`evaluateTemporaryTwoHouseTiming`·
 * `resolveDeemedOneHouseBy155`·`resolveMergeDeeming`·`resolveMergeOverlapDeeming` 등)은
 * **서로 순환 참조**한다(선행 계획서 `one-house-judgment-merge-house-link.plan.md` §7-2가
 * 미리 경고한 이음매) — `resolveDeemedOneHouseBy155`가 `evaluateTemporaryTwoHouseTiming`·
 * `resolveMergeOverlapDeeming`·`resolveMergeDeeming`을 부르고, `resolveMergeOverlapDeeming`은
 * 다시 `evaluateTemporaryTwoHouseTiming`·`matchMergeWindow`를 부른다. 그래서 **통째로** 이 파일로
 * 옮겼다 — 쪼개면 두 파일이 서로를 부르는 진짜 순환 import가 생긴다.
 *
 * 의존은 **단방향**이다 — 이 파일은 `../transfer-tax-exemption-holding`의
 * `ExemptionReqInput`(타입)·`resolveExemptionProviso`·`qualifiesRuralHouse`만 가져다 쓰고,
 * 그 파일은 이 파일을 전혀 모른다(`export *` 재수출 순환도 없다 — 재수출은
 * `transfer-tax-exemption-requirements.ts`가 두 파일을 **양쪽에서** 모을 뿐이다).
 *
 * 하위 호환: `transfer-tax-exemption-requirements.ts`가 이 모듈을 통째로 재수출하므로
 * **기존 import 경로는 무변경**이다(memory `feedback_800line_split_export_preservation`).
 *
 *   E-3: 일시적 2주택(부칙 양도일 분기 포함) · E-3.5: §155④⑤ 합가 · F-1: ①+④⑤ 3주택 중첩
 */

import { isWithinDeadline } from "../civil-period";
import { TEMP_TWO_HOUSE_PROVISO_REASONS } from "../legal-codes";
import { resolveMergeExemptionYears } from "../data/merge-exemption-era";
import { marriageRentalSidesOf, resolveDoubleMergeComposition, resolveMergeComposition } from "./merge-composition";
import type { TransferTaxInput, TemporaryTwoHouseDelayReason } from "../types/transfer.types";
import type { OneHouseSpecialRulesData } from "../schemas/rate-table.schema";
import type { DeemedOneHouseBasis } from "../types/multi-house-surcharge.types";
import {
  judgeTemporaryTwoHouseTiming,
  meetsPublicInstitutionRelocationRegion,
  resolveTemporaryTwoHouseDeadline,
} from "../transfer-tax-temporary-two-house-timing";
import {
  type ExemptionReqInput,
  type ResidenceReqInput,
  resolveExemptionProviso,
  qualifiesRuralHouse,
  ruralTemporaryTwoHouseOverlapCountHolds,
} from "../transfer-tax-exemption-holding";

/**
 * §155① 의제 성립 판정 입력 — `ExemptionReqInput` + 일시적 2주택 3필드.
 *
 * `ExemptionReqInput`과 같은 이유로 narrowing한다: 겸용주택 서브엔진은 `TransferTaxInput`
 * 전체를 구성할 수 없으므로, 전체를 요구하면 정본을 재사용하지 못하고 규칙을 재구현하게 된다
 * (그 결과가 계획서 F-2 — 중과 배제가 §155① 기한을 자체 계산해 비과세와 어긋난 것).
 * **타입 전용 narrowing이며 동작은 불변**이다.
 */
export type DeemedOneHouseReqInput = ExemptionReqInput &
  MergeDeemingReqInput &
  Pick<
    TransferTaxInput,
    "isRegulatedArea" | "isOneHousehold" | "temporaryTwoHouse" | "householdHousingCount" | "ruralHouse"
  >;

/** §155④⑤ 합가 의제 성립 판정 입력 — `resolveMergeDeeming` 전용 narrowing. */
export type MergeDeemingReqInput = Pick<
  TransferTaxInput,
  | "householdHousingCount"
  | "marriageMerge"
  | "parentalCareMerge"
  | "isFirstTransferredInMerge"
  | "acquisitionDate"
  | "transferDate"
  | "houses"
  | "sellingHouseId"
  | "knownHouseExclusionCount"
  | "inheritedHouseExclusionCount"
  | "knownHouseExclusionHouseIds"
  | "noMergeRosterInputPath"
  | "rentalHousingException"
>;

/** §155⑱ 각 호 라벨 (exemptReason 표시용) — 내부 id 노출 금지 원칙에 따라 한국어로 환원 */
export const DISPOSAL_DELAY_REASON_LABEL: Record<TemporaryTwoHouseDelayReason, string> = {
  kamco: "1호 한국자산관리공사 매각 의뢰",
  auction: "2호 법원 경매 신청",
  public_sale: "3호 공매 진행 중",
  cash_settlement_suit: "4호 현금청산금 지급 소송",
  expropriation_suit: "5호 수용재결·매도청구소송",
};

/**
 * 「제154조제1항제1호, 같은 항 제2호가목 및 같은 항 제3호에 해당하는 경우에는 종전의 주택을 취득한 날부터
 * 1년 이상이 지난 후 … 취득하는 요건을 적용하지 아니한다」 — **같은 후단 문언을 쓰는 네 조항의 단일 술어**.
 *
 *   · §155① 후단(신규 주택) · §156의2③·④ 후단(조합원입주권) · §156의3②·③ 후단(분양권)
 *   (소득세법 시행령 MST 286211 현행 · §156의2④·§156의3③은 2022-02-15 시행본부터 1년 요건과 함께 — 실독)
 *
 * 단서 사유가 화이트리스트(1호·2호가목·3호)에 들고 그 사유의 요건까지 충족(`resolveExemptionProviso` "both")
 * 해야 면제된다. 나·다목(출국)·5호(공고 전 계약)는 조문이 열거하지 않는다.
 * OH-47 — 권리 경로(`resolveArticle89Clause2`)가 이 면제를 빠뜨려 수용·부득이 세대를 과세했다.
 */
export function waivesPriorHouseOneYearGap(input: ResidenceReqInput): boolean {
  const provisoReason = input.oneHouseExemptionProviso?.reason;
  return (
    resolveExemptionProviso(input) === "both" &&
    provisoReason !== undefined &&
    TEMP_TWO_HOUSE_PROVISO_REASONS.has(provisoReason)
  );
}

/**
 * §155① 일시적 2주택 **타이밍 요건(A·B)** 판정 — 비과세(E-3)와 중과 배제(§167의10①15호) 공용.
 *
 * `provisoRelaxesHolding`(§154① 단서 화이트리스트 → 1년 요건 면제)까지 함께 산출해
 * 두 호출부가 **같은 규칙**을 쓰게 한다. 15호 ② 요소(§154① 보유·거주 충족)는 여기서 보지 않는다 —
 * 비과세는 `meetsOneHouseHoldingResidence`가, 중과는 `sellingHouseMeetsOneHouseRequirements`가 담당.
 */
export function evaluateTemporaryTwoHouseTiming(
  input: DeemedOneHouseReqInput,
  twoHouseRule: NonNullable<OneHouseSpecialRulesData["temporary_two_house"]>,
): {
  provisoRelaxesHolding: boolean;
  timing: ReturnType<typeof judgeTemporaryTwoHouseTiming>;
  /** 처분기한 연혁(연수·임차인 단서 말일) — 요건 검토 카드가 「N년」 문구에 쓴다 */
  era: ReturnType<typeof resolveTemporaryTwoHouseDeadline>;
} {
  const { previousAcquisitionDate, newAcquisitionDate } = input.temporaryTwoHouse!;

  // §155①→§154①1·2가·3호 준용: 종전주택이 §154① 단서(both, 화이트리스트) 해당 시 보유 2년 요건 면제.
  // 나·다목(출국일 1주택)·5호(무주택·residence_only)는 일시적 2주택과 양립 불가라 화이트리스트로 제외.
  // resolveExemptionProviso는 input.acquisitionDate(=종전주택 취득일, previousAcquisitionDate와 동일 의도) 기준.
  const provisoRelaxesHolding = waivesPriorHouseOneYearGap(input);

  // §155① 요건 A(1년 경과)·B(3년 내) 판정 — 1년 요건은 보유면제 화이트리스트(§154①1·2가·3호) 시 면제.
  // OH-01 — 연혁 기한 + 2019-12-17 체제의 임차인 단서 기한·전입 요건을 한 번에 받는다(A2b).
  const era = resolveTemporaryTwoHouseDeadline(input, twoHouseRule);
  const timing = judgeTemporaryTwoHouseTiming({
    previousAcquisitionDate,
    newAcquisitionDate,
    transferDate: input.transferDate,
    deadlineYears: era.years,
    deadlineDate: era.deadlineDate,
    moveInMet: era.moveInMet,
    oneYearWaived: provisoRelaxesHolding,
    // §155⑯ 후단(1년 면제) · §155⑱(기한 예외) — 정본 한 곳에서 전달해 비과세·중과가 같은 값을 쓴다.
    //   ⑯ 후단 「이 경우」는 전단의 지역 요건(이전한 시·군 또는 연접 시·군) 충족을 받는다 — 기한 5년과
    //   **같은 술어**로 연다(OH-35 · 원시 토글을 넘기면 비연접에도 1년 요건이 면제됐다).
    publicInstitutionRelocation: meetsPublicInstitutionRelocationRegion(input.temporaryTwoHouse!),
    disposalDelayReason: input.temporaryTwoHouse!.disposalDelayReason,
  });

  return { provisoRelaxesHolding, timing, era };
}

/**
 * 영 §167의10①15호(·§167의3①13호) **① 요소** — §155에 따른 1세대1주택 의제 성립 여부.
 *
 * 중과 판정(STEP 0.5)이 비과세 판정(STEP 1)보다 먼저 실행되므로 `checkExemption` 결과를 넘길 수
 * 없다. 그래서 §155① 타이밍만 **선판정**해 `MultiHouseSurchargeInput.deemedOneHouseBy155`로 넘긴다.
 *
 * ② 요소(§154① 요건 모두 충족)는 중과 엔진이 `sellingHouseMeetsOneHouseRequirements`로 AND한다.
 * 채우는 항: ⑦(농어촌) · ①(일시적 2주택) · ④⑤(합가 — `resolveMergeDeeming`). 나머지 §155 각 항은 후속.
 */
export function resolveDeemedOneHouseBy155(
  input: DeemedOneHouseReqInput,
  oneHouseRules: OneHouseSpecialRulesData | undefined,
): DeemedOneHouseBasis | undefined {
  if (!input.isOneHousehold) return undefined;
  // §155⑦ 농어촌주택 — ①(일시적 2주택)과 양립하지 않으므로 먼저 본다.
  if (qualifiesRuralHouse(input)) return "rural_house";
  const twoHouseRule = oneHouseRules?.temporary_two_house;
  // F-1 — ①과 ④⑤가 겹친 3주택. ① 단독 분기보다 먼저 본다(합가 근거를 잃지 않게).
  const overlap = resolveMergeOverlapDeeming(input, twoHouseRule);
  if (overlap) return overlap;
  // E-14 — §155① 「1주택을 소유한 1세대가 … 일시적으로 2주택」: 비과세 E-3과 같은 주택 수 2 게이트
  //   (3주택 세대의 명부가 중과 불산입 주택을 「신규 주택」으로 도출해 15호가 새던 결함 · 부동산납세과-1179).
  //   D3 — ⑦ 농어촌주택이 겹친 3주택도 비과세 E-3과 같은 게이트로 본다.
  if (
    (input.householdHousingCount === 2 || ruralTemporaryTwoHouseOverlapCountHolds(input)) &&
    input.temporaryTwoHouse &&
    twoHouseRule &&
    evaluateTemporaryTwoHouseTiming(input, twoHouseRule).timing.overall
  ) {
    return "temporary_two_house";
  }
  // §155④⑤ 합가 — 비과세 E-3.5와 **같은 술어**다(중과가 따로 판정하면 두 경로가 갈린다).
  //   D4 이중 합가 3주택도 비과세 E-3.5와 같은 순서로 본다(`checkExemption` — merge → 중첩 → D4).
  return resolveMergeDeeming(input) ?? (resolveDoubleMergeDeeming(input) ? "double_merge" : undefined);
}

/**
 * §155④(동거봉양)·⑤(혼인) 1세대1주택 **의제 성립** 여부 — §154① 충족은 **보지 않는다**.
 *
 * 비과세 E-3.5(`checkExemption`)와 중과 배제(영 §167의10①15호 ① 요소)가 함께 쓰는 정본이다.
 * ② 요소(§154① 요건)는 각 호출부가 따로 AND한다 — 비과세는 `meetsOneHouseHoldingResidence`,
 * 중과는 `sellingHouseMeetsOneHouseRequirements`.
 *
 * 요건(§155④·⑤ 문언):
 * - 합침(혼인)으로써 **1세대가 2주택**을 보유하게 된 경우
 * - 합친 날(혼인한 날)부터 N년 이내에 **먼저 양도하는 주택** — 사용자 선언(`isFirstTransferredInMerge`)
 *   (N = 양도일 연혁: 동거봉양 2018-02-13·혼인 2024-11-12 전 양도는 5년, 이후 10년 — OH-29)
 * - 양도 주택이 합가(혼인) **전 또는 당일** 취득분 — 서면-2023-부동산-0231(동거봉양 합가일 = 취득일이면
 *   §155④ 적용 가능) · 부동산거래관리과-410(혼인일 = 취득일이면 납세자가 선택한 순서)
 *
 * 혼인·동거봉양 입력이 둘 다 있으면 혼인을 먼저 본다(종전 E-3.5 순서 유지).
 */
export function resolveMergeDeeming(
  input: MergeDeemingReqInput,
): "marriage_merge" | "parental_care_merge" | undefined {
  if (input.householdHousingCount !== 2) return undefined;
  return matchMergeWindow(input);
}

/** 합가 창(窓) — 「먼저 양도」·합가 전(또는 당일) 취득·합친 날부터 N년 이내. **주택 수는 보지 않는다.** */
function matchMergeWindow(
  input: MergeDeemingReqInput,
): "marriage_merge" | "parental_care_merge" | undefined {
  const m = matchMergeApartFromWindow(input);
  if (!m) return undefined;
  // 연수는 **양도일** 연혁이다 — 대통령령 제28637호 부칙 제2조②(동거봉양) · 제34990호 부칙 제2조(혼인).
  const years = resolveMergeExemptionYears(m.kind, input.transferDate);
  if (!isWithinDeadline(m.mergeDate, years, input.transferDate)) return undefined;
  return m.kind === "marriage" ? "marriage_merge" : "parental_care_merge";
}

/**
 * 합가 의제 요건 중 **N년 기한만 뺀** 나머지 — `matchMergeWindow`와 pending 합가 축의 같은 술어(OH-23).
 *
 * 「먼저 양도」 선언 · 합가(혼인) 이후 양도 · 양도 주택이 합가 **전 또는 당일** 취득분 ·
 * 합가 전 보유 구성(`resolveMergeComposition` — 각자 1주택, 판정할 수 없으면 통과).
 * 혼인·동거봉양이 둘 다 있으면 혼인을 본다(`matchMergeWindow`와 같은 순서).
 * **주택 수는 보지 않는다** — `mergeDeemingHouseCountHolds`.
 *
 * 창(窓)·날짜 게이트(① 「먼저 양도」 선언 ② 합가 이후 양도 ③ 합가 전 취득)를 지나야 비로소
 * 합가 전 구성(`resolveMergeComposition`)을 묻는다 — 이 게이트들이 먼저 막으면 구성은 아예
 * 보지 않는다(날짜 자체가 안 맞으면 「모름」을 말할 자리가 없다).
 */
function matchMergeGateAndComposition(
  input: MergeDeemingReqInput,
): { kind: "marriage" | "parental_care"; mergeDate: Date; composition: ReturnType<typeof resolveMergeComposition> } | undefined {
  if (input.isFirstTransferredInMerge !== true) return undefined;
  const mergeDate = input.marriageMerge?.marriageDate ?? input.parentalCareMerge?.mergeDate;
  if (!mergeDate) return undefined;
  // 합가(혼인) 전 양도는 「합침으로써 2주택」이 아직 성립하지 않았다.
  if (input.transferDate < mergeDate) return undefined;
  if (input.acquisitionDate > mergeDate) return undefined;
  const composition = resolveMergeComposition({
    householdHousingCount: input.householdHousingCount,
    houses: input.houses,
    sellingHouseId: input.sellingHouseId,
    mergeDate,
    knownHouseExclusionCount: input.knownHouseExclusionCount,
    knownHouseExclusionHouseIds: input.knownHouseExclusionHouseIds,
    noRosterInputPath: input.noMergeRosterInputPath,
    marriageRentals: marriageRentalSidesOf(input, input.marriageMerge !== undefined),
  });
  return { kind: input.marriageMerge ? "marriage" : "parental_care", mergeDate, composition };
}

export function matchMergeApartFromWindow(
  input: MergeDeemingReqInput,
): { kind: "marriage" | "parental_care"; mergeDate: Date } | undefined {
  const gated = matchMergeGateAndComposition(input);
  if (!gated) return undefined;
  // 합가 전 각자 1주택 — 판정할 수 없는 행 수 불일치(`unknown`)는 종전 동작 그대로 둔다
  // (merge-composition.ts). 「모름」이 확정되는 roster_missing·origin_missing은 `fails`다.
  if (gated.composition.status === "fails") return undefined;
  return { kind: gated.kind, mergeDate: gated.mergeDate };
}

/**
 * 합가 의제가 성립하지 않은 이유가 **오직** 합가 전 구성을 몰라서(`roster_missing`·
 * `origin_missing`·`rental_origin_missing`)일 때만 확인 필요 문구를 돌려준다 — §155⑳ 선례(`confirmNotice` + 호출부의
 * 「결론을 가를 때만」게이트, `transfer-tax-rental-housing-step.ts`)와 같은 모양이다.
 *
 * 창·날짜 게이트가 먼저 막았거나(날짜 자체가 안 맞음) 구성이 이미 성립/다른 사유로 불성립이면
 * `undefined` — 호출부(`checkExemptionCore` E-3.5)가 §154① 보유·거주까지 **함께** 충족할 때만
 * 불러 결론을 가르는 경우에만 쓴다.
 */
export function resolveMergeCompositionConfirmNotice(input: MergeDeemingReqInput): string | undefined {
  const gated = matchMergeGateAndComposition(input);
  if (!gated || gated.composition.status !== "fails" || !gated.composition.confirmNotice) return undefined;
  // N년 기한도 함께 충족해야 「구성만 알면 비과세가 된다」가 성립한다 — 기한을 넘겼으면
  // 구성을 몰라서가 아니라 기한 초과로 과세이므로 확인 필요를 말하지 않는다.
  const years = resolveMergeExemptionYears(gated.kind, input.transferDate);
  if (!isWithinDeadline(gated.mergeDate, years, input.transferDate)) return undefined;
  return gated.composition.confirmNotice;
}

/**
 * 합가 의제의 **주택 수** 요건 — `resolveMergeDeeming`(2주택)·`resolveMergeOverlapDeeming`(§155① 중첩
 * 3주택)이 보는 것과 같은 조건이다. pending 합가 축이 「기한 외 요건 충족」을 확인할 때 쓴다(OH-23).
 */
export function mergeDeemingHouseCountHolds(
  input: DeemedOneHouseReqInput,
  twoHouseRule: OneHouseSpecialRulesData["temporary_two_house"] | undefined,
): boolean {
  return input.householdHousingCount === 2 || mergeOverlapTwoHouseHolds(input, twoHouseRule);
}

/** F-1 중첩의 주택 수·§155① 조건 — `resolveMergeOverlapDeeming`과 `mergeDeemingHouseCountHolds` 공용. */
function mergeOverlapTwoHouseHolds(
  input: DeemedOneHouseReqInput,
  twoHouseRule: OneHouseSpecialRulesData["temporary_two_house"] | undefined,
): boolean {
  if (input.householdHousingCount !== 3) return false;
  // 상속주택 제외까지 겹치면 세 특례 — 인정 해석 없음(`inheritedHouseExclusionCount` 주석).
  if ((input.inheritedHouseExclusionCount ?? 0) > 0) return false;
  if (!input.temporaryTwoHouse || !twoHouseRule) return false;
  return evaluateTemporaryTwoHouseTiming(input, twoHouseRule).timing.overall;
}

/** 이중 합가의 순서 — 먼저 합친 쪽(2주택이 된 합가)과 나중에 합친 쪽(3주택이 된 합가). 같은 날이면 혼인을 먼저 본다. */
export type DoubleMergeOrder = {
  first: "marriage" | "parental_care";
  firstDate: Date;
  secondDate: Date;
};

export function doubleMergeOrderOf(input: Pick<MergeDeemingReqInput, "marriageMerge" | "parentalCareMerge">): DoubleMergeOrder | undefined {
  const marriageDate = input.marriageMerge?.marriageDate;
  const parentalCareMergeDate = input.parentalCareMerge?.mergeDate;
  if (!marriageDate || !parentalCareMergeDate) return undefined;
  return marriageDate.getTime() <= parentalCareMergeDate.getTime()
    ? { first: "marriage", firstDate: marriageDate, secondDate: parentalCareMergeDate }
    : { first: "parental_care", firstDate: parentalCareMergeDate, secondDate: marriageDate };
}

/**
 * D4 역순(동거봉양 합가 → 혼인)으로 의제했을 때의 확인 필요 문구 — 판정 메뉴(판정하지 않은 부분)·계산기 경고·
 * 중과 배제(§167의3①13호 등)가 같은 문장을 쓴다. 해석 미확보라 적용하되 알린다(사용자 결정 2026-10-09).
 */
export const REVERSE_DOUBLE_MERGE_NOTICE =
  "동거봉양 합가 후 혼인으로 3주택이 된 세대를 1세대1주택으로 보아 판정했습니다(§155④·⑤). " +
  "이중 합가를 1세대1주택으로 본 해석(서면인터넷방문상담4팀-598)은 혼인 후 동거봉양 합가한 경우이고, " +
  "순서가 반대인 경우를 다룬 해석은 확인되지 않았으니 확인이 필요합니다.";

/**
 * D4 — **혼인·동거봉양 이중 합가**로 3주택이 된 경우의 1세대1주택 의제 (서면인터넷방문상담4팀-598, 2008.3.10.).
 *
 * > 1주택(A)을 보유한 자가 1주택을 보유한 자와 혼인함으로써 1세대가 2주택을 보유한 상태에서 1주택을 보유하고 있는
 * > 60세 이상의 직계존속을 동거봉양하기 위하여 세대를 합침으로써 1세대가 3주택을 보유하게 되는 경우 혼인한 날부터
 * > 2년 이내에 양도하는 A주택은 「소득세법 시행령」 제154조 제1항 규정을 적용받을 수 있습니다.
 *
 * 🔑 **두 순서 모두** 인정한다(2026-10-09 사용자 결정 — 종전 2026-10-06 「혼인 → 동거봉양만」을 바꿨다). 반대 순서
 *    (동거봉양 합가 → 혼인)를 다룬 해석은 확인되지 않았고 598을 대칭으로 옮긴 것이다 — 적용하되 확인 필요를 낸다
 *    (`REVERSE_DOUBLE_MERGE_NOTICE`).
 * 🔑 기한은 **먼저 합친 날**부터 그 합가의 기한(598이 혼인일 · 혼인 기한을 쓴 것과 대칭 — `resolveMergeExemptionYears`;
 *    회신 당시 2년은 연혁에 없다). 양도 주택은 먼저 합친 날 이전 취득, 양도는 나중에 합친 날 이후.
 * 🔑 3주택까지만이고, §155②③ 상속주택 제외가 겹치면 세 특례라 성립하지 않는다(`inheritedHouseExclusionCount`).
 * 🔑 구성은 `resolveDoubleMergeComposition`이 본다 — 「모름」은 불성립(holds만 인정 — 종전 동작이 없는 새 갈래다).
 */
export function resolveDoubleMergeDeeming(input: MergeDeemingReqInput): boolean {
  const order = doubleMergeOrderOf(input);
  if (!order) return false;
  if (input.householdHousingCount !== 3 || (input.inheritedHouseExclusionCount ?? 0) > 0) return false;
  if (input.isFirstTransferredInMerge !== true) return false;
  if (input.transferDate < order.secondDate || input.acquisitionDate > order.firstDate) return false;
  const years = resolveMergeExemptionYears(order.first, input.transferDate);
  if (!isWithinDeadline(order.firstDate, years, input.transferDate)) return false;
  const composition = resolveDoubleMergeComposition({
    householdHousingCount: input.householdHousingCount,
    houses: input.houses,
    sellingHouseId: input.sellingHouseId,
    firstMergeDate: order.firstDate,
    secondMergeDate: order.secondDate,
    knownHouseExclusionCount: input.knownHouseExclusionCount,
    knownHouseExclusionHouseIds: input.knownHouseExclusionHouseIds,
    noRosterInputPath: input.noMergeRosterInputPath,
  });
  return composition.status === "holds";
}

/**
 * F-1 — §155①(일시적 2주택)과 §155④·⑤(합가)가 **겹쳐 3주택**이 된 경우의 1세대1주택 의제.
 *
 * 국세청은 두 특례의 중첩으로 §154①이 적용된다고 반복 회신했다(본문 직독):
 * - 사전-2025-법규재산-1240(2026.3.16) — 「…제155조제1항 및 제4항에 따라 이를 1세대1주택으로 보아
 *   … 제154조제1항을 적용하는 것입니다」(일시적 2주택 상태에서 동거봉양 합가)
 * - 서면-2022-법규재산-5124(2025.6.18) — 「…제155조제1항 및 제5항의 규정에 의하여 1세대1주택
 *   비과세를 적용받을 수 있는 것」(혼인 합가 후 신규주택 취득)
 * - 기본통칙 89-155…2① — 일시 2주택 중 상속·혼인·동거봉양으로 3주택이 된 경우 3년 내 종전주택 양도
 *
 * **3주택까지만** 인정한다 — 4주택 이상을 인정한 자료가 없고, 국세청은 4주택이 되면 비과세를
 * 부인했다(서면-2021-부동산-0263). 중과 배제(13호)의 시행일 게이트는 중과 엔진이 따로 건다.
 */
export function resolveMergeOverlapDeeming(
  input: DeemedOneHouseReqInput,
  twoHouseRule: OneHouseSpecialRulesData["temporary_two_house"] | undefined,
): "marriage_merge_overlap" | "parental_care_merge_overlap" | undefined {
  if (!mergeOverlapTwoHouseHolds(input, twoHouseRule)) return undefined;
  const merge = matchMergeWindow(input);
  if (merge === "marriage_merge") return "marriage_merge_overlap";
  if (merge === "parental_care_merge") return "parental_care_merge_overlap";
  return undefined;
}
