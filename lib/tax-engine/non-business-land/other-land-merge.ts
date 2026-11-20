/**
 * 기타토지 판정 합성 — 나·다목 사업용 면적 max 합성(NBL2611-V1-B) · 비사업용 잔여분의 유예기간 판정(NBL2611-V2-C1).
 *
 * `other-land.ts`의 «차례로 시험하다 첫 결론에서 반환»을 «목별 제외 면적 누산기»로 바꾸는 두 끝점이다(리뷰 §7.1).
 * 이 파일은 순수 함수다 — DB를 부르지 않는다.
 */

import { isAreaOver } from "../area-limit";
import { NBL } from "../legal-codes";
import { NBL_EXCLUSION_RANGE_POSITION_NOTICE, NBL_REVENUE_BUSINESS_START_APPLIED_NOTICE } from "../nbl-confirm-notices";
import { differenceInDays } from "../utc-date";
import type {
  CategoryJudgeResult,
  JudgmentStep,
  LandCategoryGroup,
  NonBusinessLandInput,
  NonBusinessLandJudgmentRules,
  PeriodEvaluation,
  RevenueTestResult,
} from "./types";
import { getPeriodJudgmentDate, meetsPeriodCriteria, type PeriodCriteriaResult } from "./period-criteria";
import { getOwnershipStart } from "./utils/period-math";

/** 한 목이 사업용으로 인정한 면적(㎡). 전량 사업용이면 토지 전체, 면적 안분이 없는 비사업용(전량 비사업용)이면 0. */
function businessAreaOf(r: CategoryJudgeResult, landArea: number): number {
  if (r.isBusiness) return landArea;
  return r.areaProportioning?.businessArea ?? 0;
}

/**
 * 다목(영 §168의11① 호별·⑤ 연접·⑥ 복합용도)이 **일부 면적만** 사업용으로 인정한 결과와 나목(배율·공장·2% 바닥면적)이 인정한 결과 중 사업용 면적이 넓은 쪽을 고른다.
 *
 * 법 §104의3①4호 「다음 각 목을 제외한 토지」 — 가·나·다목은 위계 없는 병렬 제외 사유이고 나목·다목 모두 **면적 범위**로 제외한다.
 * 그래서 제외 면적은 적어도 max(나목, 다목)이다. **단순 합산은 하지 않는다** — 두 범위가 같은 위치면 이중 계상이다.
 * 위치 입력이 없어 둘이 겹치는지 알 수 없으므로(서로 다른 위치면 더 넓을 수 있다) 두 후보가 모두 양수면 «확인 필요»를 남긴다.
 *
 * `steps`·`warnings`는 judge가 두 후보 계산에 함께 쓴 배열이다(후보 계산이 이미 단계를 push했다).
 */
export function pickWiderExclusion(
  daMok: CategoryJudgeResult,
  naMok: CategoryJudgeResult,
  landArea: number,
  steps: JudgmentStep[],
  warnings: string[],
): CategoryJudgeResult {
  // 나목이 부속토지 전부를 사업용으로 인정(2% 바닥면적 ≥ 부속토지)하면 다목 부분 결과보다 항상 넓다 — 전량 사업용.
  if (naMok.isBusiness) return naMok;

  const daArea = businessAreaOf(daMok, landArea);
  const naArea = businessAreaOf(naMok, landArea);
  if (naArea <= 0) return daMok;

  const picked = isAreaOver(naArea, daArea) ? naMok : daMok;
  if (daArea > 0) {
    if (!warnings.includes(NBL_EXCLUSION_RANGE_POSITION_NOTICE)) warnings.push(NBL_EXCLUSION_RANGE_POSITION_NOTICE);
    steps.push({
      id: "other_exclusion_merge",
      label: "Step 3-3 나목·다목 사업용 면적 합성(넓은 쪽)",
      status: "FAIL",
      detail:
        `나목 사업용 ${naArea}㎡ · 다목 사업용 ${daArea}㎡ → 넓은 쪽 ${Math.max(naArea, daArea)}㎡ 사업용 · 나머지 ` +
        `${picked.areaProportioning?.nonBusinessArea ?? 0}㎡ 비사업용 (합산하지 않음 — 같은 위치면 이중 계상)`,
      legalBasis: NBL.OTHER_LAND_PROPERTY_TAX_EXCLUSION,
    });
  }
  return picked;
}

/**
 * 영 §168의14① 유예기간 — 비사업용으로 끝난 토지(전량·부분)의 **잔여분**을 확정하기 직전에 판정한다.
 * 기타토지(NBL2611-V2-C1 · B3)와 주택부수토지 배율 초과분(NBL2611-D1 · Q-3a (나))이 같은 규칙을 쓴다 — `group`은 단계 id·기간 판정 지목만 가른다.
 *
 * 이 두 지목은 양도일 현재 상태(건축물 없음·배율 초과)를 소유기간 전체에 적용하므로(NBL2611-V2-C2) 사업용 사용기간이 없다.
 * 그래서 «빈 사업기간 + 유예기간»으로 §168의6 기간기준(유예는 해당 기간을 사업용으로 본다는 의제)을 판정한다.
 * (기존 `fullPeriod` 호출에 유예만 얹으면 합집합 증가분이 0이라 효과가 없다.)
 *
 * 충족하면 비사업용 잔여분이 없으므로 전량 사업용으로 돌린다. 미충족이면 판정은 그대로이고 유예 일수만 사실대로 echo한다.
 * 유예 입력이 없으면 아무것도 바꾸지 않는다. `graceJudged`는 결과 카드의 echo(거짓 금지)다.
 */
export function applyGraceToNonBusinessRemainder(
  result: CategoryJudgeResult,
  input: NonBusinessLandInput,
  rules: NonBusinessLandJudgmentRules,
  group: Extract<LandCategoryGroup, "other_land" | "housing"> = "other_land",
): { result: CategoryJudgeResult; graceJudged?: NonNullable<PeriodEvaluation["graceJudged"]> } {
  if (result.isBusiness || input.gracePeriods.length === 0) return { result };

  const pjDate = getPeriodJudgmentDate(input);
  const r = meetsPeriodCriteria([], input.acquisitionDate, pjDate, group, rules, input.gracePeriods);
  const graceJudged = { gracePeriodDays: r.gracePeriodDays, totalOwnershipDays: r.totalOwnershipDays, meets: r.meets };

  const step: JudgmentStep = {
    id: group === "housing" ? "housing_grace_period" : "other_grace_period",
    label: "Step 4 유예기간(영 §168의14①) 기간기준",
    status: r.meets ? "PASS" : "FAIL",
    detail: r.meets
      ? `유예기간 ${r.gracePeriodDays}일을 사업용으로 보아 기간기준 충족 → 비사업용 잔여분 없음 — ${r.detail}`
      : `유예기간 ${r.gracePeriodDays}일을 사업용으로 보아도 기간기준 미충족 — ${r.detail}`,
    legalBasis: NBL.UNAVOIDABLE_PERIOD,
  };
  const base: CategoryJudgeResult = {
    ...result,
    steps: [...result.steps, step],
    appliedLaws: [...result.appliedLaws, NBL.UNAVOIDABLE_PERIOD],
    // 유예를 판정에 쓴 결과이므로 기간 수치도 그 판정의 실제 값으로 싣는다(전 기간 사업용으로 채운 표시값이 아니다).
    effectiveBusinessDays: r.effectiveBusinessDays,
    gracePeriodDays: r.gracePeriodDays,
    businessUseRatio: r.ratio,
    criteria: r.criteria,
  };
  if (!r.meets) return { result: base, graceJudged };
  return {
    result: {
      ...base,
      isBusiness: true,
      reason: `유예기간(${NBL.UNAVOIDABLE_PERIOD}) ${r.gracePeriodDays}일을 사업용으로 보아 기간기준 충족 — 비사업용 잔여분 없음`,
      areaProportioning: undefined,
    },
    graceJudged,
  };
}

/**
 * NBL2611-D1 (V2-C2 · DM-01 · 리뷰 Q-4 (나)) — 수입금액비율(영 §168의11②) 충족 토지의 **당해 사업개시일**을 기간기준 판정에 쓴다.
 *
 * 기타토지는 양도일 현재 상태를 소유기간 전체에 적용하므로(V2-C2) 수입금액비율을 충족하면 전 기간을 사업용으로 본다. 그런데 화면은
 * 「당해 사업개시일」을 받아 연환산(§168의11③3호)에만 쓰고 판정에서는 버렸다 — 개시 직후 양도한 토지가 전 기간 사업용이 됐다(과소).
 * 최소안: 개시일이 있고 **직전 비율②(당해+직전)가 기준 미통과**일 때만 사업 구간을 [개시일, 양도일]로 보아 기간기준(§168의6)을 판정한다.
 * 직전 비율②가 통과면 직전 과세기간에도 이미 사업 실적이 있어 개시일 전도 사업에 쓴 것으로 보아 현행(전 기간)대로 둔다.
 * 개시일 전 토지의 실제 이용 상태·상태 이력 입력 모델(Q-4 (다))은 이 최소안의 범위 밖이다 — 고지(`NBL_REVENUE_BUSINESS_START_APPLIED_NOTICE`)로 알린다.
 *
 * 개시일이 없거나 수입금액비율 미충족이면 `undefined`(아무것도 바꾸지 않는다). 유예기간은 [개시일, 양도일]과 합집합으로 본다.
 */
export function judgeRevenueBusinessStart(
  input: NonBusinessLandInput,
  revenue: RevenueTestResult,
  rules: NonBusinessLandJudgmentRules,
): { step: JudgmentStep; applied?: { r: PeriodCriteriaResult; revenue: RevenueTestResult; notice: string } } | undefined {
  const start = input.revenueTest?.currentBusinessStartDate;
  if (!start || !revenue.pass) return undefined;

  const priorPass = revenue.ratioCombined !== undefined && revenue.ratioCombined >= revenue.threshold;
  if (priorPass) {
    return {
      step: {
        id: "other_revenue_business_start",
        label: "§168의11② 당해 사업개시일 기간기준",
        status: "NOT_APPLICABLE",
        detail: "직전 비율②(당해+직전)가 기준을 충족해 직전 과세기간에도 사업 실적이 있다 — 당해 사업개시일을 기간기준에 쓰지 않고 전 기간으로 본다",
        legalBasis: NBL.REVENUE_TEST,
      },
    };
  }

  const pjDate = getPeriodJudgmentDate(input);
  const r = meetsPeriodCriteria(start < pjDate ? [{ start, end: pjDate }] : [], input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);
  const ownershipStart = getOwnershipStart(input.acquisitionDate);
  const businessDays = start < pjDate ? Math.max(0, differenceInDays(pjDate, start < ownershipStart ? ownershipStart : start)) : 0;
  const startIso = start.toISOString().slice(0, 10);
  return {
    step: {
      id: "other_revenue_business_start",
      label: "§168의11② 당해 사업개시일 기간기준",
      status: r.meets ? "PASS" : "FAIL",
      detail:
        `직전 비율②가 기준 미통과 — 사업 구간을 당해 사업개시일(${startIso})부터 양도일까지 ${businessDays}일로 보아 기간기준 ` +
        `${r.meets ? "충족" : "미충족"} — ${r.detail}`,
      legalBasis: NBL.REVENUE_TEST,
    },
    applied: {
      r,
      revenue: { ...revenue, businessStartJudged: { startDate: startIso, businessDays, totalOwnershipDays: r.totalOwnershipDays, meets: r.meets } },
      notice: NBL_REVENUE_BUSINESS_START_APPLIED_NOTICE,
    },
  };
}
