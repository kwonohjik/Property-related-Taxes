/**
 * 1세대1주택 판정 — **입력 경로가 없는 연혁 분기**의 판정 보류 고지 (A2a 최소 안전 동작)
 *
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §3.1 · §3.4 · §3.5 · §7(2·3 — 「해당 분기만
 * 경고로 두고 착수」). 셋 다 결론을 바꾸려면 **지금 입력받지 않는 사실**이 필요하다. 사실을 지어내거나
 * 토글로 강행규정을 끄는 대신, 그 분기에 들어온 세대에게 「이 요건은 판정하지 않았다」를 밝힌다
 * (`undetermined` — 「요건 미충족」이 아니라 「자료가 없어 판정하지 않았다」).
 *
 * | id | 조문 | 판정에 필요한 사실(미입력) |
 * |---|---|---|
 * | `154-5-final-one-house-restart-unverified` | 시행령 §154⑤ 단서(2021-01-01~2022-05-09 양도) | OH-22(I-1)에서 입력 경로가 생겼다(보유 중 다른 주택 처분 이력). 이력 미답만 고지 — 판정은 `final-house-restart.ts`. 결정 #36: 순수 1주택은 미답 = 재기산으로 보아 과세(「없음」이면 결론이 달라질 때만 고지), 그 밖의 세대 유형은 종전 결론 + 「해석 미확인」 고지 |
 * | `154-1-4ho-rental-registration-unverified` | 삭제된 §154①4호 · 대통령령 제30395호 부칙 제38조 | OH-38 입력 레인에서 입력 경로가 생겼다(§154① 단서 「4호 임대사업자 등록」). 사유 미선택 또는 선택했으나 사실 미입력만 고지 |
 * | `155-1-move-in-requirement-unverified` | §155①2호 가목(신규 2019-12-17 이후 취득 · 양도 2020-02-11~2022-05-09) | 세대전원 전입일 — A2b에서 입력 경로가 생겼다. 미입력 record만 고지 |
 * | `155-1-2002-transition-unverified` | 대통령령 제17555호 부칙 ③ 1호(2001-03-30 ~ 2002-03-29 신규 취득 · 양도가 2003-03-29 뒤 ~ 취득일부터 2년 안) | 1호 단서(보유기간등 충족일 + 6월) — 미구현, 취득일부터 2년으로 계산. 그 밖의 부칙 ③ 구간은 어느 독법이든 결론이 같아 고지하지 않는다 |
 * | `155-1-regulated-announcement-date-unverified` | §155①2호 괄호 「조정대상지역의 공고가 있은 날 이전에」 (L-7) | 신규 주택 지정 구간의 공고일 — 공고일 표(`PRE_DESIGNATION_CONTRACT_EXCLUSION`)에 없으면 제외를 판정하지 않았다 |
 * | `155-1-regulated-at-new-acquisition-unverified` | §155① 조정대상지역 단축 규정(양도일 연혁별 호 — `temporary-two-house-regulated-clause.ts`) 「종전의 주택이 조정대상지역에 있는 상태에서 조정대상지역에 있는 신규 주택을 취득」 | 신규 취득일 기준 두 주택의 조정 여부(주소 또는 선언) — 미입력이면 양도일 기준 양도주택으로 대신 계산 |
 * | `155-2-reinheritance-reference-date-unverified` | §155② 괄호 「상속개시 당시 보유한 주택」 · 단서(동일세대) — D17 재상속 | 재상속이면 그 괄호의 상속개시일이 최초 상속인지 재상속인지 — 정면 해석 미확보, 입력된 재상속일로 판정(서면-2019-법령해석재산-3032와 같은 기준). 괄호가 걸리고(일반주택 2013-02-15 이후 취득) 그 행이 실제로 제외될 때만 |
 * | `155-2-pre2010-parental-care-exception-unverified` | §155② 단서 동거봉양 예외(2010.2.18. 대통령령 제22034호 신설) — 그 전 양도분 | 동일세대 상속 배제는 그 전에도 적용(조세심판관합동회의 조심2009서2497)되나 동거봉양 예외를 그 전 양도분에 인정한 해석은 미확보 — 예외를 인정해 판정 |
 * | `154-1-capital-newtown-location-unverified` | §154① 본문(2003-11-20 ~ 2011-06-02 양도 — 서울·과천·5개 신도시 거주 2년) | 양도 주택이 신도시 지구 안인지(법정동코드는 시·구까지) 또는 주소 — 요건을 적용해 판정, 거주요건 때문에 과세될 때만 |
 * | `154-1-expropriation-notice-date-unverified` | §154①2호 가목 괄호 「사업인정 고시일 전에 취득한 주택에 한한다」(대통령령 제19327호 2006.2.9. 신설 — 부칙 제3조·제30조①) | 사업인정 고시일 — 공란이면 단서를 적용하지 않았다(모름 = 불성립). 고시일 전 취득이면 결론이 비과세로 바뀔 때만 |
 * | `154-12-co-inherited-residence-unverified` | §154⑫(2021.2.17. 신설 · 2024.2.29. 개정) — 취득 당시 조정대상지역 공동상속주택의 거주기간 | 공동상속주택인지와 다른 공동상속인의 거주기간 — 입력 경로가 없다. 상속 취득 · 본인 거주 미달로 과세될 때만 확인 필요로 밝힌다(판정은 바꾸지 않는다) |
 * | `regulated-hwaseong-announcement-window-unverified` | 화성시 조정대상지역 지정 시작 열흘(2020.6.19.~6.28.) — 원 공고(제2020-828호)일부터로 판정, 정정공고(제2020-877호)일 6.29.로 읽으면 결과가 달라짐 (결정 #3, `hwaseong-announcement-window.ts`) | 해석례·심판례 — 확보하지 못함. 취득 당시 거주요건·§155①2호 신규 주택이 결론을 가를 때만 낸다(다주택 중과는 계산기 경고) |
 * | `154-1-usage-conversion-transition-unverified` | 대통령령 제28293호 부칙 제2조 ②1호(거주요건 경과규정) × 비주택→주택 용도변경(결정 #35) | 「2017년 8월 2일 이전에 취득한 주택」의 취득한 날을 주거용 사용 개시일로 읽었다 — 이 조합의 정면 해석 미확보. 원취득일 2017.8.3. 전·주거용 사용일 이후·그날 조정대상지역이라 거주요건 때문에 비과세(단건·의제)나 중과 배제가 막힐 때만. 부칙 ②2호(계약금 지급일 무주택)는 판정하지 않음 |
 * | `civil-161-holiday-table-uncovered` | 국세기본법 §4 → 민법 §161(「~이내」 기한 말일 토요일·공휴일 → 익일) | 양도일 직전 해의 관공서 공휴일 — 공휴일 표(`data/public-holidays-kr.ts`) 밖이라 토·일요일만 반영, 또는 예정 공휴일 해(월력요항 미발표)라 임시공휴일 미반영 |
 *
 * 계산기(`transfer-tax.ts`)도 같은 항목을 경고로 낸다 — 판정 메뉴와 계산기가 같은 사실을 말한다.
 */
import {
  DEADLINE_HOLIDAY_EXTENSION_161,
  ONE_HOUSE_PROVISO_2006_ADDENDA as TRANSFER_PROVISO_2006,
  ONE_HOUSE_RESIDENCE_2017_ADDENDA,
  PERIOD_CALCULATION_4,
  TRANSFER,
} from "../legal-codes";
import { INHERITED_HOUSE } from "../legal-codes";

/** 대통령령 제22034호 시행일 — §155② 동일세대 단서(동거봉양 예외 포함)는 이 날 이후 양도분부터(부칙 제3조). */
const SAME_HOUSEHOLD_PROVISO_TRANSFER_START = new Date("2010-02-18");
import type { OneHouseSpecialRulesData } from "../schemas/rate-table.schema";
import {
  evaluateTemporaryTwoHouseTiming,
  meetsOneHouseResidenceRequirement,
  qualifiesLongTermMortgageResidenceExemption,
  ruralTemporaryTwoHouseOverlapCountHolds,
  twoHouseSpecialCountHolds,
} from "../transfer-tax-exemption-requirements";
import {
  describeOneHouseHoldingRequirement,
  describeOneHouseResidenceRequirement,
  usageConversionTransitionApplies,
} from "../transfer-tax-exemption-holding";
import { isCapitalNewTownResidenceEra } from "../data/one-house-holding-residence-era";
import { expropriationNoticeDateRequirementApplies } from "../data/one-house-154-1-proviso-era";
import {
  judgeTemporaryTwoHouseTiming,
  resolveRegulatedAtNewAcquisition,
  resolveTemporaryTwoHouseDeadline,
  resolveTemporaryTwoHouseDeadlineFor,
} from "../transfer-tax-temporary-two-house-timing";
import { resolveDisposalDelay } from "../data/temporary-two-house-delay-era";
import { resolveRegulatedShortenedClauseRef } from "../data/temporary-two-house-regulated-clause";
import { holidayTableNoticeKind } from "./holiday-notice-deadlines";
import {
  PUBLIC_HOLIDAY_TABLE_FIRST_YEAR,
  PUBLIC_HOLIDAY_TABLE_LAST_YEAR,
  PUBLIC_HOLIDAY_TABLE_OFFICIAL_LAST_YEAR,
} from "../data/public-holidays-kr";
import type { OneHouseJudgeInput, OneHouseUndetermined } from "./types";
import type { Article89Clause2Result } from "../transfer-tax-89-2-exclusion";
import { resolveRental4hoRegistration } from "./rental-registration-4ho";
import { resolveFinalOneHouseRestart } from "./final-house-restart";
import { resolveInheritedHouseExclusionForJudgment } from "../transfer-inheritance-exclusion";
import { INHERITANCE_GENERAL_HOUSE_HELD_START } from "../data/inheritance-general-house-era";
import {
  HWASEONG_WINDOW_NOTICE_ID,
  hwaseongAcquisitionWindowNotice,
  hwaseongTemporaryTwoHouseWindowNotice,
} from "./hwaseong-announcement-window";
import { giftHouseholdConfirmedSeparate, giftHouseholdUnconfirmed } from "./gift-household-basis";
import {
  checkReturnToFarmFacts,
  farmland990EraNotice,
  RURAL_FARMLAND_990_ERA_ID,
  RURAL_FARM_FACTS_UNCONFIRMED_ID,
} from "./rural-return-to-farm-facts";
import { qualifiesRuralHouseApartFromDeadline } from "../transfer-tax-exemption-holding";
import { POP_DECLINE_71_2_UNCONFIRMED_ID } from "../transfer-reductions/population-decline-71-2";
import { NEW_HOUSE_ORIGIN_UNCOLLECTED_ID, NEW_HOUSE_ORIGIN_UNCONFIRMED_ID, NEW_HOUSE_PRESALE_HOLDING_ID } from "./new-house-origin";

// §154⑤ 단서 양도 구간 상수는 판정 leaf가 정본이다(OH-22) — 기존 import 경로를 위해 재export.
export {
  FINAL_ONE_HOUSE_RESTART_TRANSFER_START,
  FINAL_ONE_HOUSE_RESTART_TRANSFER_END_EXCLUSIVE,
} from "./final-house-restart";

/** §154⑤ 단서 재기산 이력 미답 — 비과세로 판정된 1주택 양도에만 내는 보류다(아래 `settled`). */
export const FINAL_ONE_HOUSE_RESTART_UNVERIFIED_ID = "154-5-final-one-house-restart-unverified";

/** §154⑫ 신설(대통령령 제31442호, 2021.2.17.) — 시행 이후 양도분부터 적용(검토 문서 인용, 부칙 원문 재확인 필요). */
const CO_INHERITED_RESIDENCE_TRANSFER_START = new Date("2021-02-17");
/** §154⑫ 개정(대통령령 제34265호, 2024.2.29.) — 「거주한 공동상속인 중 거주기간이 가장 긴 사람」. 그 전 양도분은 종전 문언. */
const CO_INHERITED_RESIDENCE_LONGEST_TRANSFER_START = new Date("2024-02-29");

export const CO_INHERITED_RESIDENCE_UNVERIFIED_ID = "154-12-co-inherited-residence-unverified";

/** 용도변경 주택 거주요건 경과규정 기준일(주거용 사용일) 독법 — 정면 해석 미확보 확인 필요 (결정 #35). */
export const USAGE_CONVERSION_TRANSITION_UNVERIFIED_ID = "154-1-usage-conversion-transition-unverified";
/** 증여받은 주택의 증여자와 같은 세대 여부가 미확인이라 보수적으로 판정했고, 그 확인이 비과세 결론을 가른다 (결정 #33·#34·#38). */
export const GIFT_HOUSEHOLD_UNCONFIRMED_ID = "gift-household-continuity-unconfirmed";
/** 같은 세대 통산을 적용했는데 정면 해석 없는 세부(통산 시작일·주택 전부 증여·「취득 당시」 이동)가 결론을 가른다. */
export const GIFT_HOUSEHOLD_CONSOLIDATION_DETAIL_ID = "gift-household-consolidation-detail-unverified";
/** 계산기 일반 증여(이월과세 밖) 화면은 증여자와의 세대 사실을 입력받지 않아 통산을 반영하지 못했다 — 통산하면 결론이 달라질 수 있다. */
export const GIFT_HOUSEHOLD_NOT_REFLECTED_ID = "gift-household-not-reflected-unverified";
/** 증여자가 양도 전에 사망해 통산 없이 계산했고, 통산하면 결론이 달라진다. */
export const GIFT_HOUSEHOLD_DONOR_DECEASED_ID = "gift-household-donor-deceased-unverified";

export const ERA_UNDETERMINED_IDS = new Set([
  GIFT_HOUSEHOLD_UNCONFIRMED_ID,
  GIFT_HOUSEHOLD_CONSOLIDATION_DETAIL_ID,
  GIFT_HOUSEHOLD_DONOR_DECEASED_ID,
  GIFT_HOUSEHOLD_NOT_REFLECTED_ID,
  FINAL_ONE_HOUSE_RESTART_UNVERIFIED_ID,
  "154-1-4ho-rental-registration-unverified",
  "155-1-move-in-requirement-unverified",
  "155-1-2002-transition-unverified",
  "155-1-regulated-at-new-acquisition-unverified",
  "155-1-regulated-announcement-date-unverified",
  "155-18-disposal-method-unverified",
  "155-2-reinheritance-reference-date-unverified",
  "155-2-pre2010-parental-care-exception-unverified",
  "154-1-capital-newtown-location-unverified",
  "154-1-expropriation-notice-date-unverified",
  CO_INHERITED_RESIDENCE_UNVERIFIED_ID,
  USAGE_CONVERSION_TRANSITION_UNVERIFIED_ID,
  "civil-161-holiday-table-uncovered",
  HWASEONG_WINDOW_NOTICE_ID,
  RURAL_FARM_FACTS_UNCONFIRMED_ID,
  RURAL_FARMLAND_990_ERA_ID,
  NEW_HOUSE_ORIGIN_UNCONFIRMED_ID,
  NEW_HOUSE_ORIGIN_UNCOLLECTED_ID,
  NEW_HOUSE_PRESALE_HOLDING_ID,
  POP_DECLINE_71_2_UNCONFIRMED_ID,
]);

const law = (s: string) => `${TRANSFER.ONE_HOUSE_REQUIREMENT}${s}`;

/**
 * 미입력·미확인 사실이 비과세 **결론을 가르는가**를 엔진 판정으로 알려 주는 게이트 — `checkExemption`이 반사실 판정으로 채운다.
 * **생략하면 게이트 없음**(종전 동작) — 운영 경로는 항상 넘긴다.
 */
export interface EraNoticeRelevance {
  /** 거주요건 고지(S07-10) — 거주 개월을 채운 반사실 판정(`checkExemptionCore`)과 보유 미달 1주택(PD-15)이다. */
  residenceDecides: () => boolean;
  /** 사업인정 고시일 고지(S02-2) — 고시일이 「취득 전」이냐 「취득 후」냐에 따라 비과세 결론이 달라지는가 */
  expropriationNoticeDate: () => boolean;
  /**
   * §155①2호 조정대상지역 고지(#30·#32) — 신규 취득 당시 두 주택 중 하나가 조정대상지역이 **아니었다**고 읽은 반사실 판정이
   * 실제 판정(모름 = 두 주택 모두 조정대상지역으로 읽는 불성립 독법)과 비과세·부분과세 결론이 다른가.
   */
  regulatedReadingDecides: () => boolean;
  /** §155①2호 가목 전입일 고지(#30) — 세대전원이 1년 안에 전입했다고 읽은 반사실 판정이 실제 판정과 결론이 다른가. */
  moveInDecides: () => boolean;
  /** 처분 이력 미답 고지(결정 #36) — 이력을 「없음」으로 답하면 비과세·부분 비과세로 바뀌는가 */
  finalHouseRestartNone: () => boolean;
  /**
   * 증여받은 주택의 세대 사실 고지(결정 #33·#34·#38) — 세대 관계를 바꾼 반사실 판정이 현재 판정과 다를 때만 참.
   * 미확인이면 「통산 성립」·「별도세대」 두 가정, 통산이 적용됐으면 「별도세대」, 증여자 사망이면 「통산 성립」 가정과 비교한다.
   */
  giftHouseholdDecides: () => boolean;
  /** 귀농주택 ⑩4호·⑪·귀농 전 취득 일반주택 「모름」·미응답 고지(결정 #44) — 그 사실을 유리하게 채운 반사실 판정이 비과세인가 */
  ruralFarmFactsDecide?: () => boolean;
  /** 신규 주택 취득 경위 「모름」·미입력·3년 경과 예외 미선언 고지(결정 #43) — 경위를 일반 취득으로 채운 반사실 판정이 비과세인가 */
  newHouseOriginDecides?: () => boolean;
  /** 조특법 §71의2① 인구감소지역주택 「모름」·해석 미확보 고지(결정 #42) — 그 후보를 소유주택에서 뺀 반사실 판정이 비과세인가 */
  popDeclineDecides?: () => boolean;
}

export function collectEraUndetermined(
  input: OneHouseJudgeInput,
  oneHouseRules: OneHouseSpecialRulesData,
  settled: boolean,
  relevance?: EraNoticeRelevance,
  /** §89② 판정 — 권리 3년 기한 말일이 공휴일 표 고지의 후보다(없으면 그 축은 보지 않는다) */
  article89Clause2?: Pick<Article89Clause2Result, "deadline" | "noticeDeadlines">,
): OneHouseUndetermined[] {
  if (input.propertyType !== "housing" || !input.isOneHousehold || input.isUnregistered) return [];
  if (input.oneHouseUnitRole === "appurtenant_land") return [];
  const out: OneHouseUndetermined[] = [];

  /*
   * 결정 #33·#34·#38 — 증여받은 주택의 「증여자와 계속 같은 세대」 사실. 세 고지는 모두 그 사실을 바꾼 판정이 현재 판정과 다를 때만 낸다
   * (결론을 가르지 않으면 말하지 않는다). 모르면 증여일 기준(보수)으로 판정했다 — 어느 방향으로도 유리하게 읽지 않는다.
   */
  const gift = input.giftHouseholdBasis;
  const giftNotice: { id: string; reason: string } | undefined = !gift
    ? input.acquisitionCause === "gift"
      ? {
          id: GIFT_HOUSEHOLD_NOT_REFLECTED_ID,
          reason:
            "증여받은 주택은 증여자와 증여일부터 양도일까지 계속 같은 세대였다면 증여자 세대의 보유기간을 통산하고 「취득 당시」도 세대가 보유를 " +
            "시작한 날로 보지만(조심 2022서7583), 이 화면은 증여자와의 세대 관계를 입력받지 않아 증여일부터 보유기간을 세어 판정했습니다 — " +
            "같은 세대였다면 결론이 달라질 수 있으니 확인이 필요합니다. 1세대1주택 판정 메뉴에서 같은 사실을 입력해 판정할 수 있습니다.",
        }
      : undefined
    : gift.donorDeceased === true
      ? {
          id: GIFT_HOUSEHOLD_DONOR_DECEASED_ID,
          reason:
            "증여자가 양도 전에 사망한 경우 증여자 세대의 보유기간을 통산하는지에 대한 정면 해석은 확인하지 못했습니다. " +
            "통산 없이 증여일부터 보유기간을 세어 판정했으니, 증여 후 양도 전까지 증여자와 계속 같은 세대였다면 확인이 필요합니다.",
        }
      : giftHouseholdConfirmedSeparate(gift)
        ? undefined
        : giftHouseholdUnconfirmed(gift)
          ? {
              id: GIFT_HOUSEHOLD_UNCONFIRMED_ID,
              reason:
                "증여자와 증여일부터 양도일까지 계속 같은 세대였는지(배우자는 혼인 유지) 입력되지 않아, 증여일부터 보유기간을 세고 " +
                "「취득 당시」 조정대상지역은 증여일과 증여자 취득일 중 어느 하나라도 지정 중이면 거주요건을 적용해 판정했습니다. " +
                "같은 세대였다면 증여자 세대의 보유기간이 통산되어 결론이 달라질 수 있으니 확인이 필요합니다.",
            }
          : {
              id: GIFT_HOUSEHOLD_CONSOLIDATION_DETAIL_ID,
              reason:
                "증여자와 계속 같은 세대였다는 입력에 따라 세대가 보유를 시작한 날부터 보유기간을 통산하고 그 날을 「취득 당시」로 보았습니다" +
                "(조심 2022서7583 — 보유기간은 양도인 세대 기준). 혼인·합가 전에 취득한 주택의 통산 시작일, 주택 전부를 증여한 경우, " +
                "거주요건이 새로 붙는 방향의 「취득 당시」 이동은 정면 해석을 확인하지 못해 확인이 필요합니다(세대가 보유를 시작한 날에는 조정대상지역이었다가 " +
                "해제된 뒤 증여한 주택은 증여일을 기준으로 보아 거주요건을 적용하지 않았습니다). 통산은 비과세 판정에만 쓰고 " +
                "장기보유특별공제(표2 대상 판정 포함)와 세율 보유기간은 증여일 기준으로 계산했습니다.",
            };
  if (giftNotice && (relevance?.giftHouseholdDecides() ?? true)) out.push(giftNotice);

  /*
   * OH-22 · 결정 #36 — §154⑤ 단서 처분 이력 미답. 세대 유형으로 갈린다.
   *
   * · 순수 1주택(`unanswered_plain`): 재기산되면 보유 2년 미달이 확정되므로 모르는 사실은 재기산으로 본다(모름 = 혜택 불성립).
   *   `describeOneHouseHoldingRequirement`가 이미 보유 불성립으로 판정했다. 「없음」이라고 답하면 결론(비과세·부분 비과세)이
   *   달라지는 경우에만 확인 필요를 낸다(`relevance.finalHouseRestartNone`). §154① 단서 1~3호로 보유요건이 면제되면
   *   재기산은 결론을 가르지 못하므로 고지하지 않는다.
   * · 그 밖의 세대 유형(`undetermined` — 주택 수 제외·§155⑳ 임대주택·1주택+입주권·분양권): 이 세대에 단서가 걸리는지
   *   해석이 확인되지 않아 종전 결론을 두고 판정하지 않았음을 밝힌다. 비과세로 판정된 경우에만(과세면 재기산은 결론을
   *   바꾸지 못한다), 단서 1~3호 면제 세대는 제외. 이 유형은 질문 칸이 숨겨질 수 있어 「칸에 입력하세요」를 쓰지 않는다.
   */
  const restart = resolveFinalOneHouseRestart(input);
  if (restart.status === "unanswered_plain" && !settled) {
    const holding = describeOneHouseHoldingRequirement(input, oneHouseRules.one_house_exemption);
    if (!holding.provisoWaives && (relevance?.finalHouseRestartNone() ?? true)) {
      out.push({
        id: FINAL_ONE_HOUSE_RESTART_UNVERIFIED_ID,
        reason:
          `2021년 1월 1일~2022년 5월 9일 양도분은 2주택 이상을 보유한 세대가 1주택 외의 주택을 모두 처분한 경우 ` +
          `처분 후 1주택이 된 날부터 보유기간을 다시 셉니다(${law("⑤")} 단서 — 대통령령 제29523호·제32654호 부칙). ` +
          "이 주택을 보유하는 동안 다른 주택을 처분한 이력이 입력되지 않아 재기산된 것으로 보고 보유기간 2년 요건을 충족하지 않는 " +
          "것으로 판정했습니다 — 처분한 적이 없다면 「최종 1주택 보유기간 재기산」 칸에서 「없음」을 선택하세요(확인 필요).",
      });
    }
  } else if (restart.status === "undetermined" && settled) {
    if (!describeOneHouseHoldingRequirement(input, oneHouseRules.one_house_exemption).provisoWaives) {
      out.push({
        id: FINAL_ONE_HOUSE_RESTART_UNVERIFIED_ID,
        reason:
          `2021년 1월 1일~2022년 5월 9일 양도분은 2주택 이상을 보유한 세대가 1주택 외의 주택을 모두 처분한 경우 ` +
          `처분 후 1주택이 된 날부터 보유기간을 다시 셉니다(${law("⑤")} 단서 — 대통령령 제29523호·제32654호 부칙). ` +
          "이 주택은 주택 수에서 제외되는 주택·장기임대주택·조합원입주권·분양권을 함께 보유한 세대에 해당하는데, 이 세대 유형에 " +
          "단서가 걸리는지 해석이 확인되지 않아 이 요건은 판정하지 않았습니다 — 확인 필요.",
      });
    }
  }

  /*
   * OH-38 — 거주요건 미충족으로 과세된 경우에만 낸다(비과세면 면제를 따질 이유가 없다).
   *
   * 🔑 게이트 축은 **등록 신청일**이다(계획서 §9.7 L-3). 종전에는 주택 **취득일** ≤ 2019-12-16에 걸어
   *    분양권 상태로 먼저 신청한 세대(사전-2025-법규재산-0117 — 준공 취득일은 기한 뒤)를 고지조차 하지 않았다.
   *    신청일은 4호를 골라야 입력되므로, 고르지 않았으면 신청일을 모른다 — 취득일로 배제하지 않고 고지한다.
   *    골랐는데 사실이 빠졌으면 빠진 사실을 적는다. 골랐고 판정이 났으면(성립·제외) 여기서 말하지 않는다
   *    (제외 사유는 `collectRental4hoUnmet`이 「선언했으나 적용되지 않은 특례」로 낸다).
   * 확인 필요(계획서 §9.7 L-3(a)): 「1주택 보유」 판정 시점 — 신청 당시 **선언**으로 받는다.
   */
  const rental4ho = resolveRental4hoRegistration(input);
  // M2 — 2011.6.2. 이전 양도분의 거주요건은 서울 등 소재 요건이다(4호 경과조치는 2019년 등록분).
  const capitalNewTownEra = isCapitalNewTownResidenceEra(input.transferDate);
  if (
    !settled &&
    !capitalNewTownEra &&
    input.householdHousingCount === 1 &&
    (rental4ho === null || rental4ho.status === "undetermined") &&
    // 취득 당시 비조정이면 거주요건 자체가 없어 아래 술어가 참이다 — 조정 여부를 따로 보지 않는다.
    !qualifiesLongTermMortgageResidenceExemption(input) &&
    !meetsOneHouseResidenceRequirement(input, oneHouseRules.one_house_exemption)
  ) {
    out.push({
      id: "154-1-4ho-rental-registration-unverified",
      reason:
        rental4ho === null
          ? `조정대상지역 1주택을 2019년 12월 16일 이전에(분양권 상태 포함) 임대하기 위해 사업자등록과 임대사업자 등록을 ` +
            `신청했다면, 삭제 전 ${law("①")}4호(거주기간 제한 없음 — 등록 유지 중 임대의무기간 내 양도·임대료 5% 초과 ` +
            `증액은 제외)가 적용됩니다(대통령령 제30395호 부칙 제38조). 해당하면 §154① 단서에서 「4호 임대사업자 등록」을 ` +
            "선택하고 등록 사실을 입력하세요 — 입력하지 않아 이 경과조치는 판정하지 않았습니다."
          : `삭제 전 ${law("①")}4호(임대사업자 등록)를 선택했지만 다음 사실이 입력되지 않아 판정하지 않았습니다: ` +
            `${rental4ho.missing.join(" · ")}.`,
    });
  }

  /*
   * M2 — 2003-11-20 ~ 2011-06-02 양도분 서울·과천·5개 신도시 거주 2년. 소재지가 신도시가 있는 시·구이거나
   *   주소가 없으면 요건을 적용했다(모름 = 혜택 불성립). 거주요건 때문에 과세된 경우에만 낸다.
   */
  if (!settled && capitalNewTownEra) {
    const residence = describeOneHouseResidenceRequirement(input, oneHouseRules.one_house_exemption);
    const holding = describeOneHouseHoldingRequirement(input, oneHouseRules.one_house_exemption);
    if (
      residence.basis === "unmet" &&
      (residence.capitalNewTown === "maybe" || residence.capitalNewTown === "unknown") &&
      (holding.met || holding.provisoWaives) &&
      // S07-10 — 거주요건이 결론을 가를 때만. 주택 수·처분기한 같은 다른 사유로 과세가 이미 정해졌으면 소재지를 되물어도 결론이 같다.
      (relevance?.residenceDecides() ?? true)
    ) {
      out.push({
        id: "154-1-capital-newtown-location-unverified",
        reason:
          `2011년 6월 2일 이전 양도분은 서울특별시·과천시와 분당·일산·평촌·산본·중동 신도시(택지개발예정지구) 주택이면 ` +
          `보유기간 중 거주 2년이 필요합니다(${law("①")} — 대통령령 제18127호 · 제22950호 부칙 제3조). ` +
          (residence.capitalNewTown === "unknown"
            ? "양도 주택 주소가 입력되지 않아 이 요건을 적용했습니다 — 주소를 입력하면 판정합니다."
            : "양도 주택이 신도시가 있는 시·구에 있어 이 요건을 적용했습니다 — 신도시 지구 밖이면 거주요건이 없습니다(확인 필요)."),
      });
    }
  }

  /*
   * 결정 #35 — 2017.8.2. 이전에 취득한 비주택을 2017.8.3. 이후 조정대상지역 지정 중 주거용으로 바꾼 주택. 거주요건 경과규정
   * (대통령령 제28293호 부칙 제2조 ②1호 「2017년 8월 2일 이전에 취득한 주택」)의 「취득한 날」을 주거용 사용 개시일로 읽어
   * 거주요건을 적용했다(조정대상지역 판정과 같은 날 — `resolveResidenceTransitionDate`). 이 조합을 직접 다룬 해석은 확인되지 않아,
   * 그 독법 때문에 비과세(단건·의제)나 중과 배제가 거주요건에서 막힌 경우에만 확인 필요를 밝힌다(결론을 가를 때만).
   * 의제 비과세·중과 배제는 같은 거주요건 술어를 공유하므로 이 판정(`residenceDecides` 반사실)에 함께 걸린다.
   */
  if (!settled && usageConversionTransitionApplies(input)) {
    const rule = oneHouseRules.one_house_exemption;
    const useStart = input.nonHousingToHousingConversion!.residentialUseStartDate;
    const prePolicy = new Date(rule.prePolicyDate);
    if (input.acquisitionDate < prePolicy && useStart >= prePolicy) {
      const residence = describeOneHouseResidenceRequirement(input, rule);
      const holding = describeOneHouseHoldingRequirement(input, rule);
      if (
        residence.basis === "unmet" &&
        residence.wasRegulated &&
        (holding.met || holding.provisoWaives) &&
        (relevance?.residenceDecides() ?? true)
      ) {
        out.push({
          id: USAGE_CONVERSION_TRANSITION_UNVERIFIED_ID,
          reason:
            `2017년 8월 2일 이전에 취득한 비주택을 주거용으로 바꾼 주택이라, 거주요건 경과규정(${ONE_HOUSE_RESIDENCE_2017_ADDENDA.ACQUIRED_BEFORE} ` +
            `「2017년 8월 2일 이전에 취득한 주택」)의 취득한 날을 주거용 사용 개시일(${useStart.toISOString().slice(0, 10)})로 보아 ` +
            `거주요건을 적용했습니다 — 조정대상지역 판정과 같은 날입니다(서면-2020-부동산-5098). 이 조합을 직접 다룬 해석은 확인되지 않았습니다(확인 필요). ` +
            `또 2017년 8월 2일 이전에 매매계약을 체결하고 계약금을 지급했으며 계약금 지급일 현재 세대가 무주택이었다면 ` +
            `${ONE_HOUSE_RESIDENCE_2017_ADDENDA.CONTRACTED_BEFORE}(종전 규정)을 주장할 여지가 있으나 판정하지 않았습니다 ` +
            "(서면-2020-부동산-0221은 오피스텔 분양계약 후 잔금 때부터 거주한 사례여서 사실관계가 다릅니다).",
        });
      }
    }
  }

  /*
   * S02-2 — §154①2호 가목 괄호 「사업인정 고시일 전에 취득한 주택에 한한다」. 고시일을 입력하지 않아 단서를 적용하지 않았고
   *   (모름 = 불성립), 고시일 전 취득이었다면 비과세로 바뀔 때만 낸다. 괄호가 없는 구간(2006.2.9. 전 양도 등)·이미 비과세면 낸다 없다.
   */
  const proviso = input.oneHouseExemptionProviso;
  if (
    !settled &&
    proviso?.reason === "expropriation" &&
    !proviso.businessApprovalDate &&
    expropriationNoticeDateRequirementApplies(input) &&
    (relevance?.expropriationNoticeDate ?? (() => true))()
  ) {
    out.push({
      id: "154-1-expropriation-notice-date-unverified",
      reason:
        `공익사업 수용 단서(${law("①")}2호 가목)는 「사업인정 고시일 전에 취득한 주택 및 그 부수토지」에만 적용됩니다` +
        `(2006년 2월 9일 이후 양도분 — ${TRANSFER_PROVISO_2006.GENERAL_APPLICATION}). ` +
        "사업인정 고시일이 입력되지 않아 이 단서를 적용하지 않았습니다 — 고시일 전에 취득한 주택이면 보유·거주 요건 없이 비과세될 수 있으니 " +
        "고시일을 입력하세요(확인 필요). 도시계획시설 부지 매수청구로 양도한 경우 사업인정 고시일은 보상계획을 통지한 날로 본 재결례가 있습니다(조심2008중2343).",
    });
  }

  /*
   * G5-4 — §154⑫ 공동상속주택 거주기간. 취득 당시 조정대상지역의 **상속 취득** 주택이 본인 거주 미달로 과세될 때,
   * 공동상속주택이면 다른 공동상속인의 거주기간으로 판단될 수 있다. 공동상속 여부·다른 공동상속인의 거주기간은
   * 입력 경로가 없어(새 칸은 사용자 결정 대기) 판정을 바꾸지 않고 확인 필요로만 밝힌다(모름 = 혜택 불성립 + 결론을 가를 때만 고지).
   * 비조정·경과규정(거주요건 없음)·거주 충족이면 `basis`가 `unmet`이 아니라 내지 않는다.
   */
  if (
    !settled &&
    input.acquisitionCause === "inheritance" &&
    input.transferDate.getTime() >= CO_INHERITED_RESIDENCE_TRANSFER_START.getTime() &&
    !qualifiesLongTermMortgageResidenceExemption(input)
  ) {
    const residence = describeOneHouseResidenceRequirement(input, oneHouseRules.one_house_exemption);
    const holding = describeOneHouseHoldingRequirement(input, oneHouseRules.one_house_exemption);
    if (
      residence.basis === "unmet" &&
      (holding.met || holding.provisoWaives) &&
      (relevance?.residenceDecides() ?? true)
    ) {
      const longest = input.transferDate.getTime() >= CO_INHERITED_RESIDENCE_LONGEST_TRANSFER_START.getTime();
      out.push({
        id: CO_INHERITED_RESIDENCE_UNVERIFIED_ID,
        reason:
          `취득 당시 조정대상지역에 있는 공동상속주택이면 거주기간은 ` +
          (longest
            ? "그 주택에 거주한 공동상속인 중 거주기간이 가장 긴 사람이 거주한 기간으로 판단합니다"
            : "소득세법 시행령 §155③ 단서에 따라 공동상속주택을 소유한 것으로 보는 사람이 거주한 기간으로 판단합니다") +
          `(${law("⑫")}). 공동상속주택인지와 다른 공동상속인의 거주기간은 입력받지 않아 입력한 거주기간 ` +
          `${residence.residenceMonths}개월만으로 판정했습니다 — 공동상속주택이면 확인이 필요합니다.`,
      });
    }
  }

  // 결정 #3 하위 2 — 화성시 지정 시작 열흘(2020.6.19.~6.28.)의 취득 당시 조정대상지역 판정(거주요건이 결론을 가를 때만).
  out.push(...hwaseongAcquisitionWindowNotice(input, settled, relevance?.residenceDecides));

  /*
   * OH-01 — §155①2호. 결론과 무관하게 낸다(입력이 없어 판정하지 않은 사실을 밝힌다).
   *   ① 신규 취득일 기준 두 주택의 조정 여부가 미입력이고 그 값이 기한을 바꾸는 구간이면 —
   *      종전 대리 지표(양도일 기준 양도주택)로 계산했음을 알린다.
   *   ② 2019-12-17 체제인데 세대전원 전입일이 없으면 — 가목(1년 내 전입)을 판정하지 않았다.
   */
  const twoHouseRule = oneHouseRules.temporary_two_house;
  const tt = input.temporaryTwoHouse;
  /*
   * 신규 취득 당시 조정 여부·전입일 미입력(#30) — 3주택 겹침(농어촌 §155⑦ · 합가 §155④⑤)도 같은 규칙이다. 주택 수 게이트는 넓게 잡고
   * 결론을 가를 때만 낸다(`relevance` 반사실 판정이 3주택·특례 없는 세대를 걸러 낸다).
   */
  const overlapCount = (input.householdHousingCount === 2 || input.householdHousingCount === 3) && tt && twoHouseRule;
  if (overlapCount) {
    const reg = resolveRegulatedAtNewAcquisition(input);
    // ⑯ 5년이 연혁상 단축 기한을 덮는지까지 포함해 두 독법의 기한이 다를 때만 조정 여부가 기한에 쓰인다(#29).
    const yrs = (b: boolean) => resolveTemporaryTwoHouseDeadlineFor(input, twoHouseRule, b).years;
    const regulatedAxisMatters = yrs(true) !== yrs(false);
    const regulatedDecides = regulatedAxisMatters && (relevance?.regulatedReadingDecides() ?? true);
    // L-7 — 신규 주택 지정 구간의 공고일이 표에 없으면 「공고가 있은 날 이전」 제외를 판정하지 않았다(제외하지 않는 불성립 독법).
    //   결론을 가를 때만 낸다(#32).
    if (reg.announcementWarning && regulatedDecides) {
      out.push({ id: "155-1-regulated-announcement-date-unverified", reason: reg.announcementWarning });
    }
    // 결정 #3 하위 2 — 신규 주택 취득·계약이 화성시 지정 시작 열흘에 걸리고 처분기한 판정이 갈릴 때.
    if (reg.determined) out.push(...hwaseongTemporaryTwoHouseWindowNotice(input, tt, reg.bothRegulated, yrs));
    if (!reg.determined && regulatedDecides) {
      out.push({
        id: "155-1-regulated-at-new-acquisition-unverified",
        reason:
          `이 양도 시기에는 종전주택이 조정대상지역에 있는 상태에서 조정대상지역의 신규주택을 취득하면 처분기한이 ` +
          `짧아집니다(${TRANSFER.TEMPORARY_TWO_HOUSE}${resolveRegulatedShortenedClauseRef(input.transferDate)}). 그 판정은 신규주택 취득일 기준 두 주택의 소재지로 하는데, ` +
          "주소나 조정대상지역 여부가 입력되지 않아 두 주택 모두 조정대상지역인 것으로 보고 불성립으로 계산했습니다" +
          `(모두 조정대상지역이면 ${yrs(true)}년, 아니면 ${yrs(false)}년 — 이 양도일은 결론이 갈립니다) — ` +
          "1세대1주택 판정 메뉴의 일시적 2주택 특례 칸에서 입력하세요(확인 필요).",
      });
    }
    /*
     * 2019-12-17 체제인데 세대전원 전입일이 없다 — 가목(1년 내 전입)은 적극 요건이라 불성립으로 읽었다(모름 = 혜택 불성립 · #30).
     * 전입을 충족한 독법이 결론을 바꿀 때만 낸다(전입하지 않아 비운 세대도 같은 빈칸이다).
     */
    if (resolveTemporaryTwoHouseDeadline(input, twoHouseRule).moveInRequirementPending && (relevance?.moveInDecides() ?? true)) {
      out.push({
        id: "155-1-move-in-requirement-unverified",
        reason:
          `조정대상지역 종전주택 보유 중 2019년 12월 17일 이후 조정대상지역 신규주택을 취득해 2022년 5월 9일 이전에 ` +
          `양도하면 신규주택 취득일부터 1년 이내 양도 외에 1년 이내 세대전원 전입 요건이 있습니다` +
          `(${TRANSFER.TEMPORARY_TWO_HOUSE}①2호 가목 — 대통령령 제30395호 부칙 제15조). ` +
          "세대전원 전입일이 입력되지 않아 이 요건을 충족하지 않은 것으로 보고 불성립으로 계산했습니다 — " +
          "신규주택 취득일부터 1년 이내에 세대전원이 전입했다면 비과세로 바뀌므로 전입일을 입력하세요(확인 필요).",
      });
    }
  }
  if (input.householdHousingCount === 2 && tt && twoHouseRule) {
    if (resolveTemporaryTwoHouseDeadline(input, twoHouseRule).transition2002Unverified) {
      out.push({
        id: "155-1-2002-transition-unverified",
        reason:
          `신규주택을 2001년 3월 30일 이후 2002년 3월 29일 이전에 취득하고 그 후 종전주택을 양도하면 처분기한이 ` +
          `2년에서 1년으로 줄어든 개정의 경과조치(대통령령 제17555호 부칙 ③ 1호)에 따라 시행일(2002. 3. 30.)부터 ` +
          `1년이 되는 날까지 양도해야 합니다. 다만 시행일부터 6월이 지난 뒤 종전주택이 당시 보유기간(거주기간) 요건을 ` +
          `채우면 그 날에 6월을 더한 날과 신규주택 취득일부터 2년이 되는 날 중 빠른 날까지입니다. 이 양도일은 ` +
          `시행일부터 1년이 지난 뒤이면서 신규주택 취득일부터 2년 안이라 결론이 이 단서에 달려 있는데, 단서는 판정하지 ` +
          `않았고 신규주택 취득일부터 2년으로 계산했습니다 — 확인이 필요합니다.`,
      });
    }
    /*
     * S15-14 — ⑱ 사유를 골랐는데 2022-02-15 전 양도분의 「그 방법으로 양도」가 확인되지 않았다(모름 = 불성립). 그 확인이 요건 B(처분기한)를
     * 가를 때만 낸다 — 방법을 확인했다고 가정하면 기한이 충족되는 경우.
     */
    if (tt.disposalDelayReason) {
      const era = resolveTemporaryTwoHouseDeadline(input, twoHouseRule);
      const threeYearMet = (disposalDelayDisposedByThatMethod: boolean) =>
        judgeTemporaryTwoHouseTiming({
          previousAcquisitionDate: tt.previousAcquisitionDate,
          newAcquisitionDate: tt.newAcquisitionDate,
          transferDate: input.transferDate,
          deadlineYears: era.years,
          deadlineDate: era.deadlineDate,
          oneYearWaived: true, // 요건 A는 이 판단과 무관하다
          disposalDelayReason: tt.disposalDelayReason,
          disposalDelayDisposedByThatMethod,
        }).threeYearMet;
      const delay = resolveDisposalDelay({
        reason: tt.disposalDelayReason,
        disposedByThatMethod: tt.disposalDelayDisposedByThatMethod,
        transferDate: input.transferDate,
      });
      if (delay.methodPending && !threeYearMet(false) && threeYearMet(true) && delay.note) {
        out.push({ id: "155-18-disposal-method-unverified", reason: delay.note });
      }
    }
  }

  /*
   * L-1 — 「~이내」 기한(§155①④⑤⑦⑧·§154① 단서·§156의2·§156의3·§155㉓)은 말일이 토요일·공휴일이면 익일로 만료한다(민법 §161).
   * 양도일 직전이 공휴일 표 밖의 해(또는 예정 공휴일 해)면 토·일요일만 반영했거나 임시공휴일을 빼고 계산했다. 그 한계가 판정을 바꾸는 것은
   * 선언한 기한 중 하나의 말일이 양도일 직전 최장 연휴 일수 안에 있을 때뿐이다 — 아래 고지가 그때만 낸다(#32).
   */
  /*
   * D17 — 재상속(별도세대에서 받은 상속주택을 동일세대원이 다시 상속)으로 §155② 단서를 통과한 행이 있으면, 일반주택
   * 「상속개시 당시 보유」 괄호를 재상속일로 판정했다는 것을 밝힌다(최초 상속일 기준인지 정면 해석은 확보되지 않았다 —
   * 가장 가까운 것은 서면-2019-법령해석재산-3032: 나머지 지분을 재상속받은 날 현재 보유한 일반주택에 §155② 적용).
   * 그 괄호가 걸리고(일반주택 2013-02-15 이후 취득 — 제24356호 부칙 제20조) 재상속일 기준으로 그 행이 실제로 제외될
   * 때만 낸다 — 괄호가 안 걸리면 기준일이 무의미하고, 재상속일로도 제외되지 않으면 최초 상속일로는 더더욱 아니다.
   */
  const reInheritedIds = (input.houses ?? [])
    .filter(
      (h) =>
        h.isInherited &&
        h.decedentSameHouseholdAtInheritance === true &&
        h.parentalCareMergeInheritedHouse !== true &&
        h.reInheritedFromSeparateHousehold === true,
    )
    .map((h) => h.id);
  const reInheritedMatters =
    reInheritedIds.length > 0 &&
    input.acquisitionDate >= INHERITANCE_GENERAL_HOUSE_HELD_START &&
    resolveInheritedHouseExclusionForJudgment(input).excludedHouses.some((e) => reInheritedIds.includes(e.houseId));
  if (reInheritedMatters) {
    out.push({
      id: "155-2-reinheritance-reference-date-unverified",
      reason:
        `별도세대에서 받은 상속주택을 동일세대원이 다시 상속받은 주택은 상속주택 지위를 이어받는 것으로 보았습니다(${INHERITED_HOUSE.EXEMPTION_SOLE_BASIS} 단서 — ` +
        "재산세과-2961 · 부동산납세과-624 · 서면-2022-법규재산-4747 등). 일반주택을 「상속개시 당시 보유한 주택」으로 한정하는 요건은 " +
        "입력한 상속개시일(재상속일)로 판정했습니다(재상속받은 날 현재 보유한 일반주택에 적용한 서면-2019-법령해석재산-3032와 같은 기준) — " +
        "최초 상속일을 기준으로 보는지는 확인되지 않았으니, 일반주택을 최초 상속 뒤에 취득했다면 확인이 필요합니다.",
    });
  }

  /*
   * 동일세대 상속 배제는 단서 신설(2010.2.18.) 전 양도분에도 적용한다(조세심판관합동회의 조심2009서2497 — 게이트 주석).
   * 그 단서의 동거봉양 예외를 그 전 양도분에 인정한 해석은 확보하지 못했다 — 예외를 인정해 판정하고 밝힌다(사용자 결정 2026-10-07).
   */
  const parentalCarePre2010 =
    input.transferDate.getTime() < SAME_HOUSEHOLD_PROVISO_TRANSFER_START.getTime() &&
    (input.houses ?? []).some(
      (h) =>
        h.isInherited &&
        h.decedentSameHouseholdAtInheritance === true &&
        h.parentalCareMergeInheritedHouse === true &&
        h.reInheritedFromSeparateHousehold !== true,
    );
  if (parentalCarePre2010) {
    out.push({
      id: "155-2-pre2010-parental-care-exception-unverified",
      reason:
        `동거봉양 합가 전부터 보유하던 주택은 동일세대원으로부터 상속받아도 상속주택으로 보는 예외(${INHERITED_HOUSE.EXEMPTION_SOLE_BASIS} 단서)는 ` +
        "2010년 2월 18일 이후 양도분부터 적용되는 규정입니다(대통령령 제22034호 부칙 제3조). 그 전 양도분도 동일세대원으로부터 상속받은 주택은 " +
        "상속주택 특례 대상이 아니라고 보지만(조세심판관합동회의 조심2009서2497), 동거봉양 예외를 그 전 양도분에 인정했는지는 확인되지 않았습니다 — " +
        "예외를 인정해 판정했으니 확인이 필요합니다.",
    });
  }

  /*
   * §155⑦3호 귀농주택 — ⑩4호(영농·영어 목적)·⑪(귀농 후 최초 1개)·귀농 전 취득 일반주택에 「모름」이거나 답이 없으면 불성립으로 판정한다
   * (원칙 1). 그 사실이 **결론을 가를 때만** 확인 필요를 낸다 — 유리하게 채운 반사실 판정이 비과세일 때다.
   */
  const farm = input.ruralHouse;
  if (farm?.kind === "return_to_farm") {
    const facts = checkReturnToFarmFacts(farm, input.transferDate);
    if (!settled && facts.unconfirmed.length > 0 && (relevance?.ruralFarmFactsDecide?.() ?? true)) {
      out.push({
        id: RURAL_FARM_FACTS_UNCONFIRMED_ID,
        reason: `${facts.unconfirmed.join(" ")} 확인 필요 — 사실을 확인해 답을 고르면 다시 판정합니다.`,
      });
    }
    const n990 = farmland990EraNotice(farm);
    if (settled && n990 && qualifiesRuralHouseApartFromDeadline(input)) {
      out.push({ id: RURAL_FARMLAND_990_ERA_ID, reason: n990 });
    }
  }

  /*
   * §155① 신규 주택의 취득 경위(결정 #43 · G6-4) — 권리(분양권·조합원입주권) 유래 주택은 갈래를 가른다(`new-house-origin.ts`).
   *   · 모름·미입력·3년 경과 예외 미선언으로 불성립한 것은 **결론을 가를 때만** 확인 필요를 낸다(경위를 일반 취득으로 채운 반사실 판정이 비과세일 때).
   *   · 종전주택 보유 중 분양권이 완공된 갈래(직접 해석 없음)와 경위를 묻지 못한 경로는 §155①로 비과세가 선 경우에만 확인 필요를 낸다.
   */
  const originRule = oneHouseRules.temporary_two_house;
  if (
    originRule &&
    input.temporaryTwoHouse?.newHouseOrigin &&
    (twoHouseSpecialCountHolds(input) || ruralTemporaryTwoHouseOverlapCountHolds(input))
  ) {
    const { origin, timing } = evaluateTemporaryTwoHouseTiming(input, originRule);
    if (!settled && origin.blocked && origin.unconfirmed.length > 0 && (relevance?.newHouseOriginDecides?.() ?? true)) {
      out.push({ id: NEW_HOUSE_ORIGIN_UNCONFIRMED_ID, reason: `${origin.unconfirmed.join(" ")} 확인 필요 — 사실을 확인해 답을 고르면 다시 판정합니다.` });
    }
    if (settled && timing.overall && origin.confirmNotes.length > 0) {
      out.push({
        id: origin.holdingPresale ? NEW_HOUSE_PRESALE_HOLDING_ID : NEW_HOUSE_ORIGIN_UNCOLLECTED_ID,
        reason: origin.confirmNotes.join(" "),
      });
    }
  }

  /*
   * 조특법 §71의2① 인구감소지역주택 — 후보인데 모름·미답·해석 미확보라 소유주택에서 빼지 않았다(결정 #42). **결론을 가를 때만** 알린다 —
   * 그 후보를 뺀 반사실 판정이 비과세일 때다. 양도 주택·입주권 모두 같은 echo를 읽지만 이 수집기는 주택 양도만 본다.
   */
  const popUnconfirmed = input.popDecline71_2Unconfirmed;
  if (popUnconfirmed && !settled && (relevance?.popDeclineDecides?.() ?? true)) {
    out.push({
      id: POP_DECLINE_71_2_UNCONFIRMED_ID,
      reason:
        `${TRANSFER.POP_DECLINE_HOUSE_71_2}(인구감소지역주택을 소유주택이 아닌 것으로 봄) 후보가 있으나 적용하지 않았습니다 — ${popUnconfirmed.reasons.join(" ")} ` +
        "확인 필요 — 사실을 확인해 답을 고르면 다시 판정합니다.",
    });
  }

  // 어느 선언된 기한의 말일이 양도일 곁에 있어 공휴일 표 한계가 판정을 바꿀 수 있을 때만(#32 하위 1 가 — `holiday-notice-deadlines.ts`).
  const holidayKind = holidayTableNoticeKind(input, oneHouseRules, article89Clause2 ?? {});
  if (holidayKind === "uncovered") {
    out.push({
      id: "civil-161-holiday-table-uncovered",
      reason:
        `「~이내」 기한의 말일이 토요일·공휴일이면 다음 날까지 늘어납니다(${PERIOD_CALCULATION_4} → ${DEADLINE_HOLIDAY_EXTENSION_161}). ` +
        `관공서 공휴일 계산표는 ${PUBLIC_HOLIDAY_TABLE_FIRST_YEAR}~${PUBLIC_HOLIDAY_TABLE_LAST_YEAR}년만 담고 있어 ` +
        "양도일 직전 기간의 공휴일(설·추석·대체공휴일·임시공휴일 등)은 반영하지 못하고 토·일요일만 반영했습니다 — " +
        "기한 말일이 공휴일이었다면 직접 확인하세요.",
    });
  } else if (holidayKind === "provisional") {
    // 같은 고지 채널(id) — 2028~는 표가 덮지만 월력요항 전 예정값이라 임시공휴일·규정 개정이 빠져 있다.
    out.push({
      id: "civil-161-holiday-table-uncovered",
      reason:
        `「~이내」 기한의 말일이 토요일·공휴일이면 다음 날까지 늘어납니다(${PERIOD_CALCULATION_4} → ${DEADLINE_HOLIDAY_EXTENSION_161}). ` +
        `${PUBLIC_HOLIDAY_TABLE_OFFICIAL_LAST_YEAR + 1}년 이후 관공서 공휴일은 규정·음력으로 계산한 예정 공휴일 기준으로 반영했습니다 — ` +
        "임시공휴일·규정 개정은 반영하지 않았으니 기한 말일 무렵이 임시공휴일로 지정됐다면 직접 확인하세요.",
    });
  }

  return out;
}
