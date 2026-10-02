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
 * | `154-5-final-one-house-restart-unverified` | 시행령 §154⑤ 단서(2021-01-01~2022-05-09 양도) | OH-22(I-1)에서 입력 경로가 생겼다(보유 중 다른 주택 처분 이력). 이력 미답만 고지 — 판정은 `final-house-restart.ts` |
 * | `154-1-4ho-rental-registration-unverified` | 삭제된 §154①4호 · 대통령령 제30395호 부칙 제38조 | OH-38 입력 레인에서 입력 경로가 생겼다(§154① 단서 「4호 임대사업자 등록」). 사유 미선택 또는 선택했으나 사실 미입력만 고지 |
 * | `155-1-move-in-requirement-unverified` | §155①2호 가목(신규 2019-12-17 이후 취득 · 양도 2020-02-11~2022-05-09) | 세대전원 전입일 — A2b에서 입력 경로가 생겼다. 미입력 record만 고지 |
 * | `155-1-regulated-announcement-date-unverified` | §155①2호 괄호 「조정대상지역의 공고가 있은 날 이전에」 (L-7) | 신규 주택 지정 구간의 공고일 — 공고일 표(`PRE_DESIGNATION_CONTRACT_EXCLUSION`)에 없으면 제외를 판정하지 않았다 |
 * | `155-1-regulated-at-new-acquisition-unverified` | §155①2호 「종전의 주택이 조정대상지역에 있는 상태에서 조정대상지역에 있는 신규 주택을 취득」 | 신규 취득일 기준 두 주택의 조정 여부(주소 또는 선언) — 미입력이면 양도일 기준 양도주택으로 대신 계산 |
 * | `civil-161-holiday-table-uncovered` | 국세기본법 §4 → 민법 §161(「~이내」 기한 말일 토요일·공휴일 → 익일) | 양도일 직전 해의 관공서 공휴일 — 공휴일 표(`data/public-holidays-kr.ts`) 밖이라 토·일요일만 반영, 또는 예정 공휴일 해(월력요항 미발표)라 임시공휴일 미반영 |
 *
 * 계산기(`transfer-tax.ts`)도 같은 항목을 경고로 낸다 — 판정 메뉴와 계산기가 같은 사실을 말한다.
 */
import { DEADLINE_HOLIDAY_EXTENSION_161, PERIOD_CALCULATION_4, TRANSFER } from "../legal-codes";
import type { OneHouseSpecialRulesData } from "../schemas/rate-table.schema";
import {
  meetsOneHouseResidenceRequirement,
  qualifiesLongTermMortgageResidenceExemption,
} from "../transfer-tax-exemption-requirements";
import {
  meetsPublicInstitutionRelocationRegion,
  resolveRegulatedAtNewAcquisition,
  resolveTemporaryTwoHouseDeadline,
} from "../transfer-tax-temporary-two-house-timing";
import { resolveTemporaryTwoHouseDeadlineEra } from "../data/temporary-two-house-deadline-era";
import { holidayTableProvisionalBefore, holidayTableUncoveredBefore } from "../civil-period";
import {
  PUBLIC_HOLIDAY_TABLE_FIRST_YEAR,
  PUBLIC_HOLIDAY_TABLE_LAST_YEAR,
  PUBLIC_HOLIDAY_TABLE_OFFICIAL_LAST_YEAR,
} from "../data/public-holidays-kr";
import type { OneHouseJudgeInput, OneHouseUndetermined } from "./types";
import { resolveRental4hoRegistration } from "./rental-registration-4ho";
import { resolveFinalOneHouseRestart } from "./final-house-restart";

// §154⑤ 단서 양도 구간 상수는 판정 leaf가 정본이다(OH-22) — 기존 import 경로를 위해 재export.
export {
  FINAL_ONE_HOUSE_RESTART_TRANSFER_START,
  FINAL_ONE_HOUSE_RESTART_TRANSFER_END_EXCLUSIVE,
} from "./final-house-restart";

export const ERA_UNDETERMINED_IDS = new Set([
  "154-5-final-one-house-restart-unverified",
  "154-1-4ho-rental-registration-unverified",
  "155-1-move-in-requirement-unverified",
  "155-1-regulated-at-new-acquisition-unverified",
  "155-1-regulated-announcement-date-unverified",
  "civil-161-holiday-table-uncovered",
]);

const law = (s: string) => `${TRANSFER.ONE_HOUSE_REQUIREMENT}${s}`;

export function collectEraUndetermined(
  input: OneHouseJudgeInput,
  oneHouseRules: OneHouseSpecialRulesData,
  settled: boolean,
): OneHouseUndetermined[] {
  if (input.propertyType !== "housing" || !input.isOneHousehold || input.isUnregistered) return [];
  if (input.oneHouseUnitRole === "appurtenant_land") return [];
  const out: OneHouseUndetermined[] = [];

  /*
   * OH-22 — 비과세로 판정된 1주택 양도에만 낸다. 과세면 재기산은 결론을 바꾸지 못한다
   * (기산일이 늦어질 뿐이다). I-1에서 처분 이력 입력이 생겼다 — **이력 질문에 답하지 않았을 때만**
   * 판정 보류로 남긴다(`undetermined`). 답했으면 leaf가 재기산 여부를 판정한다.
   */
  if (settled && resolveFinalOneHouseRestart(input).status === "undetermined") {
    out.push({
      id: "154-5-final-one-house-restart-unverified",
      reason:
        `2021년 1월 1일~2022년 5월 9일 양도분은 2주택 이상을 보유한 세대가 1주택 외의 주택을 모두 처분한 경우 ` +
        `처분 후 1주택이 된 날부터 보유기간을 다시 셉니다(${law("⑤")} 단서 — 대통령령 제29523호·제32654호 부칙). ` +
        "이 주택을 보유하는 동안 다른 주택을 처분한 이력이 입력되지 않아 이 요건은 판정하지 않았습니다 — " +
        "「최종 1주택 보유기간 재기산」 칸에 처분 이력을 입력하세요.",
    });
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
  if (
    !settled &&
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
   * OH-01 — §155①2호. 결론과 무관하게 낸다(입력이 없어 판정하지 않은 사실을 밝힌다).
   *   ① 신규 취득일 기준 두 주택의 조정 여부가 미입력이고 그 값이 기한을 바꾸는 구간이면 —
   *      종전 대리 지표(양도일 기준 양도주택)로 계산했음을 알린다.
   *   ② 2019-12-17 체제인데 세대전원 전입일이 없으면 — 가목(1년 내 전입)을 판정하지 않았다.
   */
  const twoHouseRule = oneHouseRules.temporary_two_house;
  const tt = input.temporaryTwoHouse;
  if (input.householdHousingCount === 2 && tt && twoHouseRule) {
    const reg = resolveRegulatedAtNewAcquisition(input);
    const eraFor = (bothRegulated: boolean) =>
      resolveTemporaryTwoHouseDeadlineEra({
        bothRegulated,
        baseDeadlineYears: twoHouseRule.disposalDeadlineYears,
        newAcquisitionDate: tt.newAcquisitionDate,
        newContractDate: tt.newHouseContractDate,
        transferDate: input.transferDate,
      }).years;
    const regulatedAxisMatters = !meetsPublicInstitutionRelocationRegion(tt) && eraFor(true) !== eraFor(false);
    // L-7 — 신규 주택 지정 구간의 공고일이 표에 없으면 「공고가 있은 날 이전」 제외를 판정하지 않았다.
    if (reg.announcementWarning && regulatedAxisMatters) {
      out.push({ id: "155-1-regulated-announcement-date-unverified", reason: reg.announcementWarning });
    }
    if (!reg.determined && regulatedAxisMatters) {
      out.push({
        id: "155-1-regulated-at-new-acquisition-unverified",
        reason:
          `이 양도 시기에는 종전주택이 조정대상지역에 있는 상태에서 조정대상지역의 신규주택을 취득하면 처분기한이 ` +
          `짧아집니다(${TRANSFER.TEMPORARY_TWO_HOUSE}①2호). 그 판정은 신규주택 취득일 기준 두 주택의 소재지로 하는데, ` +
          "주소나 조정대상지역 여부가 입력되지 않아 양도일 기준 양도주택의 조정대상지역 여부로 대신 계산했습니다 — " +
          "1세대1주택 판정 메뉴의 일시적 2주택 특례 칸에서 입력하세요.",
      });
    }
    if (resolveTemporaryTwoHouseDeadline(input, twoHouseRule).moveInRequirementPending) {
      out.push({
        id: "155-1-move-in-requirement-unverified",
        reason:
          `조정대상지역 종전주택 보유 중 2019년 12월 17일 이후 조정대상지역 신규주택을 취득해 2022년 5월 9일 이전에 ` +
          `양도하면 신규주택 취득일부터 1년 이내 양도 외에 1년 이내 세대전원 전입 요건이 있습니다` +
          `(${TRANSFER.TEMPORARY_TWO_HOUSE}①2호 가목 — 대통령령 제30395호 부칙 제15조). ` +
          "세대전원 전입일이 입력되지 않아 전입 요건은 판정하지 않았습니다(처분기한만 적용).",
      });
    }
  }

  /*
   * L-1 — 「~이내」 기한(§155①④⑤⑦⑧·§154① 단서·§156의2·§156의3)은 말일이 토요일·공휴일이면 익일로 만료한다
   * (민법 §161). 양도일 직전이 공휴일 표 밖의 해면 토·일요일만 반영했으므로 결론과 무관하게 밝힌다.
   * 표 안이라도 월력요항 미발표 해(예정 공휴일)면 임시공휴일이 빠져 있어 같은 id로 문구만 달리해 밝힌다.
   * 기한 축을 선언하지 않은 세대에게는 말하지 않는다.
   */
  const hasWithinDeadlineAxis =
    !!input.temporaryTwoHouse ||
    !!input.marriageMerge ||
    !!input.parentalCareMerge ||
    !!input.unavoidableOutsideCapitalHouse?.resolvedDate ||
    input.ruralHouse?.kind === "return_to_farm" ||
    !!input.oneHouseExemptionProviso ||
    (input.presaleRights?.length ?? 0) > 0 ||
    !!input.replacementHouse;
  if (hasWithinDeadlineAxis && holidayTableUncoveredBefore(input.transferDate)) {
    out.push({
      id: "civil-161-holiday-table-uncovered",
      reason:
        `「~이내」 기한의 말일이 토요일·공휴일이면 다음 날까지 늘어납니다(${PERIOD_CALCULATION_4} → ${DEADLINE_HOLIDAY_EXTENSION_161}). ` +
        `관공서 공휴일 계산표는 ${PUBLIC_HOLIDAY_TABLE_FIRST_YEAR}~${PUBLIC_HOLIDAY_TABLE_LAST_YEAR}년만 담고 있어 ` +
        "양도일 직전 기간의 공휴일(설·추석·대체공휴일·임시공휴일 등)은 반영하지 못하고 토·일요일만 반영했습니다 — " +
        "기한 말일이 공휴일이었다면 직접 확인하세요.",
    });
  } else if (hasWithinDeadlineAxis && holidayTableProvisionalBefore(input.transferDate)) {
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
