/**
 * 1세대1주택 판정 보류 고지 중 **§155① 일시적 2주택** 축 — `era-undetermined.ts`(`collectEraUndetermined`)에서 분리(800줄 정책 · 2026-11-13).
 *
 * 고지 id·근거 표는 `era-undetermined.ts` 머리 주석이 정본이다. 모든 고지는 모르는 사실을 불성립 쪽으로 읽어 계산하고(#30)
 * **결론을 가를 때만** 낸다(#32 — `EraNoticeRelevance` 반사실 판정 또는 이 축의 두 독법 비교).
 */
import { TRANSFER } from "../legal-codes";
import type { OneHouseSpecialRulesData } from "../schemas/rate-table.schema";
import { evaluateTemporaryTwoHouseTiming } from "../transfer-tax-exemption-requirements";
import { ruralTemporaryTwoHouseOverlapCountHolds } from "../transfer-tax-exemption-requirements";
import { twoHouseSpecialCountHolds } from "../transfer-tax-exemption-requirements";
import { waivesPriorHouseOneYearGap } from "../transfer-tax-exemption-requirements";
import { judgeTemporaryTwoHouseTiming } from "../transfer-tax-temporary-two-house-timing";
import { resolveRegulatedAtNewAcquisition } from "../transfer-tax-temporary-two-house-timing";
import { resolveTemporaryTwoHouseDeadline } from "../transfer-tax-temporary-two-house-timing";
import { resolveTemporaryTwoHouseDeadlineFor } from "../transfer-tax-temporary-two-house-timing";
import { resolveDisposalDelay } from "../data/temporary-two-house-delay-era";
import { resolveRegulatedShortenedClauseRef } from "../data/temporary-two-house-regulated-clause";
import { MERGED_SPECIAL_CITY_START } from "@/lib/geo/relocation-region-unit";
import { relocationRegionReadingsDiverge } from "@/lib/geo/relocation-region-unit";
import { getAdjacentSigunguCodes } from "@/lib/geo/administrative-district-adjacency";
import { resolveTempTwoHouseRemnantDisposalDate } from "./expropriation-remnant-155-1";
import { hwaseongTemporaryTwoHouseWindowNotice } from "./hwaseong-announcement-window";
import type { EraNoticeRelevance } from "./era-undetermined";
import type { OneHouseJudgeInput, OneHouseUndetermined } from "./types";

export function collectTempTwoHouseEraUndetermined(
  input: OneHouseJudgeInput,
  oneHouseRules: OneHouseSpecialRulesData,
  relevance: EraNoticeRelevance | undefined,
): OneHouseUndetermined[] {
  const out: OneHouseUndetermined[] = [];
  /*
   * OH-01 — §155①2호. 모르는 사실을 불성립 쪽으로 읽어 계산하고(#30), **결론을 가를 때만** 낸다(#32).
   *   ① 신규 취득일 기준 두 주택의 조정 여부가 미입력이면 — 두 주택 모두 조정대상지역인 독법(짧은 기한·전입 요건)으로
   *      계산했다. 두 독법의 기한이 다르고(`yrs(true) !== yrs(false)`) 「조정 아님」 반사실 판정이 비과세(부분 포함) 결론을
   *      바꿀 때(`relevance.regulatedReadingDecides`)만 확인 필요를 알린다. 공고일 고지도 같은 게이트다.
   *   ② 2019-12-17 체제인데 세대전원 전입일이 없으면 — 가목(1년 내 전입)을 불성립으로 읽었다. 전입한 반사실 판정이
   *      결론을 바꿀 때(`relevance.moveInDecides`)만 알린다.
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
          "일시적 2주택 특례의 「조정대상지역 처분기한」 칸에서 두 주택의 조정대상지역 여부를 입력하세요" +
          "(양도세 계산기에는 이 칸이 없어 1세대1주택 판정 메뉴에서 입력해 다시 넘기면 됩니다 — 확인 필요).",
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
  /*
   * J-3 — 합가 D8 상대 쪽 짝(B → C)의 1년 요건은 양도 주택 A의 §154① 단서로 면제하지 않았다(사용자 결정 2026-11-12). 직접 근거가
   * 없어 「확인 필요」다 — 면제했다면 짝의 타이밍이 성립하는 경우에만 낸다(#32).
   */
  if (tt?.previousHouseIsRosterRow && twoHouseRule && waivesPriorHouseOneYearGap(input)) {
    const base = evaluateTemporaryTwoHouseTiming(input, twoHouseRule).timing.overall;
    const waived = evaluateTemporaryTwoHouseTiming(input, twoHouseRule, { forceProvisoOneYearWaiver: true }).timing.overall;
    if (!base && waived) {
      out.push({
        id: "155-1-roster-pair-one-year-waiver-unverified",
        reason:
          `합가 전 상대 쪽 일시적 2주택(${TRANSFER.TEMPORARY_TWO_HOUSE}①)은 종전 주택을 취득한 날부터 1년이 지난 뒤 신규 주택을 ` +
          `취득해야 합니다. 양도하는 주택에 해당하는 ${TRANSFER.ONE_HOUSE_REQUIREMENT}① 단서 사유로 상대 쪽 짝의 이 요건을 ` +
          `면제하는 근거를 찾지 못해 면제하지 않고 판정했습니다 — 면제된다면 결론이 달라지므로 확인이 필요합니다.`,
      });
    }
  }
  // 주택 수 게이트는 비과세 판정(E-3)과 같은 술어다 — ⑦ 농어촌주택이 겹친 3주택(D3)도 §155① 분기로 판정한다(리뷰 J-6).
  if ((twoHouseSpecialCountHolds(input) || ruralTemporaryTwoHouseOverlapCountHolds(input)) && tt && twoHouseRule) {
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
          // §155① 후단(E-5) — 수용일로 이미 충족하면 방법 확인이 결론에 닿지 않는다(정본과 같은 값)
          remnantDisposalDate: resolveTempTwoHouseRemnantDisposalDate(input),
        }).threeYearMet;
      const delay = resolveDisposalDelay({
        reason: tt.disposalDelayReason,
        disposedByThatMethod: tt.disposalDelayDisposedByThatMethod,
        transferDate: input.transferDate,
      });
      // 기한 축만 반사실 판정하면 1년 요건·취득 경위·§154① 보유가 이미 불충족인 세대에도 고지가 났다 — 결론을 가를 때만(#32 · 리뷰 J-6).
      if (
        delay.methodPending &&
        !threeYearMet(false) &&
        threeYearMet(true) &&
        delay.note &&
        (relevance?.disposalMethodDecides?.() ?? true)
      ) {
        out.push({ id: "155-18-disposal-method-unverified", reason: delay.note });
      }
    }
    /*
     * E-1 — §155⑯ 지역 요건을 전남광주통합특별시 구역에서 판정할 때 「옛 광주 5개 자치구 = 한 시」로 읽었다(사용자 결정 2026-11-12).
     * 2026.7.1. 이후 양도분은 특별법 §11①·⑩ 사이의 해석이라, 읽기에 따라 지역 요건이 갈리고 그것이 §155① 결론을 가를 때만 낸다(#32).
     */
    const from = tt.relocatedSigunguCode;
    const to = tt.newHouseSigunguCode;
    if (
      tt.publicInstitutionRelocation &&
      from &&
      to &&
      input.transferDate.getTime() >= MERGED_SPECIAL_CITY_START.getTime() &&
      relocationRegionReadingsDiverge(from, to, getAdjacentSigunguCodes)
    ) {
      const overall = (relocationMet: boolean) =>
        evaluateTemporaryTwoHouseTiming(
          {
            ...input,
            temporaryTwoHouse: relocationMet
              ? { ...tt, relocatedSigunguCode: undefined, newHouseSigunguCode: undefined }
              : { ...tt, publicInstitutionRelocation: false },
          },
          twoHouseRule,
        ).timing.overall;
      if (overall(true) !== overall(false)) {
        out.push({
          id: "155-16-merged-special-city-unit",
          reason:
            `공공기관·법인 지방이전 특례(${TRANSFER.TEMPORARY_TWO_HOUSE}⑯)의 지역 요건을 전남광주통합특별시(2026. 7. 1. 설치) 구역에서 ` +
            `옛 광주광역시 5개 자치구를 하나의 시로, 옛 전라남도 시·군을 각각의 시·군으로 보아 판정했습니다. ` +
            `${TRANSFER.MERGED_SPECIAL_CITY_OTHER_LAWS}①(다른 법령의 「광역시」에 통합특별시를 포함)과 같은 조 ⑩(광역시·도 규정이 ` +
            `다르면 자치구 구역에는 광역시, 시·군 구역에는 도 규정) 중 어느 쪽으로 읽느냐에 따라 이 양도의 결론이 달라집니다 — 확인이 필요합니다.`,
        });
      }
    }
  }
  return out;
}
