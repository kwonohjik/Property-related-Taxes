/**
 * 비사업용 토지 판정 v2 엔진 — 총괄 (PDF p.1695~1697 4단계 흐름)
 *
 *   ① 사실상 지목 판정 (§168-7)
 *      ↓
 *   ② 무조건 사업용 의제 검토 (§168-14 ③)
 *      ↓  (해당 시 즉시 사업용 확정)
 *   ③ 기간기준 공통 적용 (§168-6) — 지목별 judge 내부에서 호출
 *      ↓
 *   ④ 개별 지목별 사업용 기간 판정
 */

import { NBL } from "../legal-codes";
import type {
  CategoryJudgeResult,
  JudgmentStep,
  NonBusinessLandInput,
  NonBusinessLandJudgment,
  NonBusinessLandJudgmentRules,
  GracePeriod,
  GracePeriodType,
} from "./types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "./types";
import { classifyLandCategory } from "./land-category";
import { checkUnconditionalExemption } from "./unconditional-exemption";
import { judgeFarmland } from "./farmland";
import { judgeForest } from "./forest";
import { judgePasture } from "./pasture";
import { judgeHousingLand } from "./housing-land";
import { judgeVillaLand } from "./villa-land";
import { judgeOtherLand } from "./other-land";
import { checkIncorporationGrace } from "./period-criteria";
import { applyCoOwnershipRatio } from "./co-ownership";

/**
 * 메인 진입점 — 기존 v1 시그니처 호환.
 */
export function judgeNonBusinessLand(
  input: NonBusinessLandInput,
  rules: NonBusinessLandJudgmentRules = DEFAULT_NON_BUSINESS_LAND_RULES,
): NonBusinessLandJudgment {
  const judgmentSteps: JudgmentStep[] = [];
  const appliedLawArticles: string[] = [NBL.MAIN, NBL.CRITERIA];
  const warnings: string[] = [];

  // ── Step 1: 사실상 지목 판정 (§168-7) ────────────────────────────
  const category = classifyLandCategory(input);
  judgmentSteps.push({
    id: "land_category",
    label: "Step 1 사실상 지목 판정",
    status: "PASS",
    detail: category.detail,
    legalBasis: NBL.CATEGORY,
  });
  appliedLawArticles.push(NBL.CATEGORY);

  // ── Step 2: 무조건 사업용 의제 (§168-14 ③) ────────────────────────
  const uncond = checkUnconditionalExemption(input, category.categoryGroup);
  if (uncond.isExempt) {
    judgmentSteps.push({
      id: "unconditional_exemption",
      label: "Step 2 무조건 사업용 의제",
      status: "PASS",
      detail: uncond.detail,
      legalBasis: uncond.legalBasis ?? NBL.UNCONDITIONAL,
    });
    appliedLawArticles.push(uncond.legalBasis ?? NBL.UNCONDITIONAL);
    return assemble({
      isNonBusinessLand: false,
      reason: `사업용 (무조건 의제: ${uncond.detail})`,
      category: category.categoryGroup,
      categoryResult: null,
      unconditionalResult: {
        isApplied: true,
        reason: uncond.reason,
        detail: uncond.detail,
      },
      steps: judgmentSteps,
      appliedLaws: appliedLawArticles,
      warnings,
      input,
      rules,
    });
  }
  judgmentSteps.push({
    id: "unconditional_exemption",
    label: "Step 2 무조건 사업용 의제",
    status: "NOT_APPLICABLE",
    detail: "해당 사유 없음 — 개별 지목별 판정 진행",
    legalBasis: NBL.UNCONDITIONAL,
  });

  // ── Step 3 준비: 부득이한 사유 → gracePeriods 병합 ────────────────
  const mergedGracePeriods: GracePeriod[] = [
    ...input.gracePeriods,
    ...(input.unavoidableReasons ?? []).map((u) => ({
      type: "unavoidable" as GracePeriodType,
      startDate: u.startDate,
      endDate: u.endDate,
    })),
  ];
  const engineInput: NonBusinessLandInput = { ...input, gracePeriods: mergedGracePeriods };

  // ── Step 4: 개별 지목별 judge ─────────────────────────────────────
  let catResult: CategoryJudgeResult;
  switch (category.categoryGroup) {
    case "farmland":
      catResult = judgeFarmland(engineInput, rules);
      break;
    case "forest":
      catResult = judgeForest(engineInput, rules);
      break;
    case "pasture":
      catResult = judgePasture(engineInput, rules);
      break;
    case "housing":
      catResult = judgeHousingLand(engineInput, rules);
      break;
    case "villa": {
      const villaResult = judgeVillaLand(engineInput, rules);
      if (villaResult.action === "REDIRECT_TO_CATEGORY") {
        // 별장 비사용기간이 기간기준 충족 → 주택부수토지로 자동 재분류
        catResult = judgeHousingLand(
          { ...engineInput, landType: "housing_site" },
          rules,
        );
        catResult = {
          ...catResult,
          steps: [...villaResult.steps, ...catResult.steps],
          appliedLaws: [...villaResult.appliedLaws, ...catResult.appliedLaws],
          warnings: [...(villaResult.warnings ?? []), ...(catResult.warnings ?? [])],
        };
      } else {
        catResult = villaResult;
      }
      break;
    }
    case "other_land":
      catResult = judgeOtherLand(engineInput, rules);
      break;
    default:
      judgmentSteps.push({
        id: "category_unknown",
        label: "Step 4 지목 분류 불가",
        status: "FAIL",
        detail: "지원하지 않는 토지 유형",
        legalBasis: NBL.CATEGORY,
      });
      return assemble({
        isNonBusinessLand: true,
        reason: "지목 분류 불가 — 비사업용 간주",
        category: category.categoryGroup,
        categoryResult: null,
        steps: judgmentSteps,
        appliedLaws: appliedLawArticles,
        warnings,
        input: engineInput,
        rules,
      });
  }

  judgmentSteps.push(...catResult.steps);
  appliedLawArticles.push(...catResult.appliedLaws);
  if (catResult.warnings) warnings.push(...catResult.warnings);

  const judgment = assemble({
    isNonBusinessLand: !catResult.isBusiness,
    reason: catResult.reason,
    category: category.categoryGroup,
    categoryResult: catResult,
    steps: judgmentSteps,
    appliedLaws: appliedLawArticles,
    warnings,
    input: engineInput,
    rules,
  });

  // 공동소유 지분 적용 (대법원 2015두39439) — 지분율이 1 미만인 경우에만
  const ownershipRatio = input.ownerProfile?.ownershipRatio;
  if (ownershipRatio !== undefined && ownershipRatio < 1) {
    return applyCoOwnershipRatio(judgment, ownershipRatio);
  }

  return judgment;
}

// ============================================================
// 결과 조립 헬퍼
// ============================================================

interface AssembleArgs {
  isNonBusinessLand: boolean;
  reason: string;
  category: string;
  categoryResult: CategoryJudgeResult | null;
  unconditionalResult?: {
    isApplied: boolean;
    reason: import("./types").UnconditionalExemptionReason;
    detail: string;
  };
  steps: JudgmentStep[];
  appliedLaws: string[];
  warnings: string[];
  input: NonBusinessLandInput;
  rules: NonBusinessLandJudgmentRules;
}

function assemble(args: AssembleArgs): NonBusinessLandJudgment {
  const {
    reason,
    categoryResult,
    unconditionalResult,
    steps,
    appliedLaws,
    warnings,
    input,
    rules,
  } = args;

  // [Bug-01 fix] REDIRECT 경로에서는 비사업용으로 조립하지 말 것.
  // 별장 비사용기간이 기간기준을 충족하면 실제 용도 재입력이 필요하므로
  // 중과세·장기보유공제 배제가 잘못 부과되지 않도록 isNonBusinessLand를 false로 강제한다.
  const needsRedirect = categoryResult?.action === "REDIRECT_TO_CATEGORY";
  const isNonBusinessLand = needsRedirect ? false : args.isNonBusinessLand;

  // 전체 소유기간 등 기간 분석 정보 추출
  const totalOwnershipDays = categoryResult?.totalOwnershipDays ?? 0;
  const effectiveBusinessDays = categoryResult?.effectiveBusinessDays ?? (unconditionalResult?.isApplied ? totalOwnershipDays : 0);
  const gracePeriodDays = categoryResult?.gracePeriodDays ?? 0;
  const businessUseRatio = categoryResult?.businessUseRatio ?? (unconditionalResult?.isApplied ? 1 : 0);
  const criteria = categoryResult?.criteria ?? {
    rule2of3Years: unconditionalResult?.isApplied ?? false,
    rule5Years: false,
    rule80Percent: unconditionalResult?.isApplied ?? false,
  };

  // 편입유예 요약 (농지·목장에서 기록된 정보를 재구성)
  let urbanIncorporationGrace: NonBusinessLandJudgment["urbanIncorporationGrace"];
  if (input.urbanIncorporationDate) {
    const g = checkIncorporationGrace(input.urbanIncorporationDate, input.transferDate, rules);
    urbanIncorporationGrace = {
      isApplied: g.isApplied,
      graceYears: g.graceYears,
      graceEndDate: g.graceEndDate,
    };
  }

  // REDIRECT 전파 (needsRedirect는 상단에서 이미 계산)
  const action = categoryResult?.action;
  const redirectHint = categoryResult?.redirectHint;

  return {
    isNonBusinessLand,
    judgmentReason: reason,
    action,
    redirectHint,
    needsRedirect,
    totalOwnershipDays,
    businessUseDays: categoryResult?.effectiveBusinessDays ?? 0,
    gracePeriodDays,
    effectiveBusinessDays,
    businessUseRatio,
    criteria,
    areaProportioning: categoryResult?.areaProportioning,
    surcharge: {
      surchargeType: "non_business_land",
      additionalRate: isNonBusinessLand ? 0.10 : 0,
      longTermDeductionExcluded: isNonBusinessLand,
      basicDeductionApplied: true,
    },
    unconditionalExemption: unconditionalResult,
    urbanIncorporationGrace,
    appliedLawArticles: appliedLaws,
    warnings,
    judgmentSteps: steps,
    residencePeriodsUsed: categoryResult?.residencePeriodsUsed,
  };
}

// ============================================================
// 외부 테스트·레거시 호환용 팩토리
// ============================================================

type PartialJudgment = Omit<NonBusinessLandJudgment, "isNonBusinessLand" | "judgmentReason" | "surcharge">;

function makeSurchargeResult(
  isNonBusinessLand: boolean,
  judgmentReason: string,
  partial: PartialJudgment,
): NonBusinessLandJudgment {
  return {
    isNonBusinessLand,
    judgmentReason,
    ...partial,
    surcharge: {
      surchargeType: "non_business_land",
      additionalRate: isNonBusinessLand ? 0.10 : 0,
      longTermDeductionExcluded: isNonBusinessLand,
      basicDeductionApplied: true,
    },
  };
}

export function createBusinessResult(
  reason: string,
  partial: Partial<PartialJudgment> &
    Pick<PartialJudgment, "judgmentSteps" | "appliedLawArticles" | "warnings">,
): NonBusinessLandJudgment {
  const defaults: PartialJudgment = {
    totalOwnershipDays: 0,
    businessUseDays: 0,
    gracePeriodDays: 0,
    effectiveBusinessDays: 0,
    businessUseRatio: 1,
    criteria: { rule80Percent: true, rule5Years: false, rule2of3Years: false },
    areaProportioning: undefined,
    unconditionalExemption: undefined,
    urbanIncorporationGrace: undefined,
    ...partial,
  };
  return makeSurchargeResult(false, reason, defaults);
}

export function createNonBusinessResult(
  reason: string,
  partial: Partial<PartialJudgment> &
    Pick<PartialJudgment, "judgmentSteps" | "appliedLawArticles" | "warnings">,
): NonBusinessLandJudgment {
  const defaults: PartialJudgment = {
    totalOwnershipDays: 0,
    businessUseDays: 0,
    gracePeriodDays: 0,
    effectiveBusinessDays: 0,
    businessUseRatio: 0,
    criteria: { rule80Percent: false, rule5Years: false, rule2of3Years: false },
    areaProportioning: undefined,
    unconditionalExemption: undefined,
    urbanIncorporationGrace: undefined,
    ...partial,
  };
  return makeSurchargeResult(true, reason, defaults);
}
