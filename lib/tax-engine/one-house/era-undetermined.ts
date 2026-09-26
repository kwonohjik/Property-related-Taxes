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
 * | `154-5-final-one-house-restart-unverified` | 시행령 §154⑤ 단서(2021-01-01~2022-05-09 양도) | 과거 2주택 이상 보유 여부 · 다른 주택 전부의 처분(양도·증여·용도변경)일 |
 * | `154-1-4ho-rental-registration-unverified` | 삭제된 §154①4호 · 대통령령 제30395호 부칙 제38조 | 2019-12-16 이전 사업자등록·임대사업자 등록 신청 사실 · 임대의무기간·5% 증액 단서 |
 * | `155-1-move-in-requirement-unverified` | §155①2호 가목·단서(신규 2019-12-17 이후 취득 · 양도 2020-02-11~2022-05-09) | 세대전원 전입일 · 기존 임차인 임대차 종료일 (A2b) |
 *
 * 계산기(`transfer-tax.ts`)도 같은 항목을 경고로 낸다 — 판정 메뉴와 계산기가 같은 사실을 말한다.
 */
import { TRANSFER } from "../legal-codes";
import type { OneHouseSpecialRulesData } from "../schemas/rate-table.schema";
import {
  meetsOneHouseResidenceRequirement,
  qualifiesLongTermMortgageResidenceExemption,
} from "../transfer-tax-exemption-requirements";
import { resolveTemporaryTwoHouseDeadline } from "../transfer-tax-temporary-two-house-timing";
import type { OneHouseJudgeInput, OneHouseUndetermined } from "./types";

/**
 * §154⑤ 단서(최종 1주택 보유기간 재기산)가 적용되는 양도 구간.
 * - 시작: 대통령령 제29523호 부칙 제1조3호(「제154조제5항의 개정규정: 2021년 1월 1일」)·제2조②(시행 이후 양도분)
 * - 끝: 대통령령 제32654호 부칙 제2조①(개정규정은 2022-05-10 이후 양도분부터)·②(그 전 양도는 종전 규정)
 */
export const FINAL_ONE_HOUSE_RESTART_TRANSFER_START = new Date("2021-01-01");
export const FINAL_ONE_HOUSE_RESTART_TRANSFER_END_EXCLUSIVE = new Date("2022-05-10");
/**
 * 대통령령 제30395호 부칙 제38조② — 「2019년 12월 16일 이전에 해당 주택을 임대하기 위해 …
 * 임대사업자로 등록을 신청한 경우」. 그 날 뒤에 취득한 주택은 이 경과조치 대상이 될 수 없다고 본다
 * (⚠️ 매매계약만으로 먼저 등록 신청한 뒤 나중에 취득한 경우는 확인 필요 — 계약일 입력 없음).
 */
export const RENTAL_4HO_REGISTRATION_DEADLINE = new Date("2019-12-16");

export const ERA_UNDETERMINED_IDS = new Set([
  "154-5-final-one-house-restart-unverified",
  "154-1-4ho-rental-registration-unverified",
  "155-1-move-in-requirement-unverified",
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
  const t = input.transferDate.getTime();

  /*
   * OH-22 — 비과세로 판정된 1주택 양도에만 낸다. 과세면 재기산은 결론을 바꾸지 못한다
   * (기산일이 늦어질 뿐이다). 확인 필요(계획서 §7-2): 2020-12-31 이전 처분 완료 세대도 대상인지,
   * 거주기간도 재기산하는지.
   */
  if (
    settled &&
    input.householdHousingCount === 1 &&
    t >= FINAL_ONE_HOUSE_RESTART_TRANSFER_START.getTime() &&
    t < FINAL_ONE_HOUSE_RESTART_TRANSFER_END_EXCLUSIVE.getTime()
  ) {
    out.push({
      id: "154-5-final-one-house-restart-unverified",
      reason:
        `2021년 1월 1일~2022년 5월 9일 양도분은 2주택 이상을 보유한 세대가 1주택 외의 주택을 모두 처분한 경우 ` +
        `처분 후 1주택이 된 날부터 보유기간을 다시 셉니다(${law("⑤")} 단서 — 대통령령 제29523호·제32654호 부칙). ` +
        "과거 다른 주택의 보유·처분 이력을 입력받지 않아 이 요건은 판정하지 않았습니다 — 해당하면 그날부터 2년 보유를 직접 확인하세요.",
    });
  }

  /*
   * OH-38 — 거주요건 미충족으로 과세된 경우에만 낸다(비과세면 면제를 따질 이유가 없다).
   * 확인 필요(계획서 §7-3): 「1주택 보유」 판정 시점, 2020-08-18 자동말소 시 임대의무기간 단서.
   */
  if (
    !settled &&
    input.householdHousingCount === 1 &&
    input.acquisitionDate.getTime() <= RENTAL_4HO_REGISTRATION_DEADLINE.getTime() &&
    // 취득 당시 비조정이면 거주요건 자체가 없어 아래 술어가 참이다 — 조정 여부를 따로 보지 않는다.
    !qualifiesLongTermMortgageResidenceExemption(input) &&
    !meetsOneHouseResidenceRequirement(input, oneHouseRules.one_house_exemption)
  ) {
    out.push({
      id: "154-1-4ho-rental-registration-unverified",
      reason:
        `조정대상지역 1주택을 2019년 12월 16일 이전에 임대하기 위해 사업자등록과 임대사업자 등록을 신청했다면, ` +
        `삭제 전 ${law("①")}4호(거주기간 제한 없음 — 임대의무기간 중 양도·임대료 5% 초과 증액은 제외)가 적용됩니다` +
        "(대통령령 제30395호 부칙 제38조). 등록 사실을 입력받지 않아 이 경과조치는 판정하지 않았습니다.",
    });
  }

  /*
   * OH-01 — 2019-12-17 체제(1년 내 양도 + 1년 내 세대전원 전입, 기존 임차인 단서). 기한(1년)만 적용했고
   * 전입 요건·임차인 단서는 판정하지 않았다(A2b에서 입력 경로를 만든다). 결론과 무관하게 낸다 —
   * 비과세면 전입 요건이 빠졌고, 과세면 임차인 단서(최대 2년)가 빠졌을 수 있다.
   */
  const twoHouseRule = oneHouseRules.temporary_two_house;
  if (input.householdHousingCount === 2 && input.temporaryTwoHouse && twoHouseRule) {
    if (resolveTemporaryTwoHouseDeadline(input, twoHouseRule).moveInRequirementPending) {
      out.push({
        id: "155-1-move-in-requirement-unverified",
        reason:
          `조정대상지역 종전주택 보유 중 2019년 12월 17일 이후 조정대상지역 신규주택을 취득해 2022년 5월 9일 이전에 ` +
          `양도하면 신규주택 취득일부터 1년 이내 양도 외에 1년 이내 세대전원 전입 요건이 있고, 기존 임차인이 있으면 ` +
          `그 임대차 종료일까지(최대 2년) 기한이 늘어납니다(${TRANSFER.TEMPORARY_TWO_HOUSE}①2호 — 대통령령 제30395호 부칙 제15조). ` +
          "전입일·임대차 사실을 입력받지 않아 두 요건은 판정하지 않았습니다(처분기한 1년만 적용).",
      });
    }
  }

  return out;
}
