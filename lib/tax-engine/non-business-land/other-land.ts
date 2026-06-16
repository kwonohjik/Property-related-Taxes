/**
 * 기타토지 판정 (§168-11, PDF p.1706~1707 흐름도 1:1)
 *
 * 판정 순서:
 *   Step 0     나대지 간주 검증 (건축물시가표준액 < 토지 × 2% → 재산세 별도합산 제외, 소득세법 §104의3①4호나목·지방세법 시행령 §101①2호나목)
 *   Step 3-1   재산세 종합합산이 아닌 토지 + 기간기준 → 사업용
 *   Step 3-1-1 거주·사업관련 토지 + 기간기준 → 사업용
 *   둘 다 미달 → 비사업용
 */

import { differenceInDays } from "date-fns";
import { NBL } from "../legal-codes";
import type {
  CategoryJudgeResult,
  DateInterval,
  JudgmentStep,
  NblRelatedBusinessType,
  NonBusinessLandInput,
  NonBusinessLandJudgmentRules,
  OtherLandUsage,
  PropertyTaxType,
  RevenueTestResult,
} from "./types";
import { meetsPeriodCriteria, type PeriodCriteriaResult } from "./period-criteria";
import { getOwnershipStart } from "./utils/period-math";
import { computeAreaProportioning } from "./utils/area-proportioning";
import { NBL_AREA_MULTIPLIER } from "./data/area-standards";
import { computeRevenueTest } from "./revenue-test";

/**
 * 나대지 간주 (소득세법 §104의3①4호나목 + 지방세법 시행령 §101①2호나목·단서 — 재산세 별도합산 제외 → 비사업용):
 * - 건축물시가표준액 < 부속토지 시가표준액 × 2% → 건축물 없는 토지로 봄 (지방세법 시행령 §101①2호나목)
 * - 무허가·사용승인 없는 건축물 부속토지 → 건축물 없는 토지로 봄 (지방세법 시행령 §101①단서)
 * 결과적으로 propertyTaxType을 "종합합산"으로 조정.
 */
export function isBareLand(input: NonBusinessLandInput): boolean {
  const o = input.otherLand;
  if (!o) return false;
  if (!o.hasBuilding) return true;
  if (o.buildingStandardValue !== undefined && o.landStandardValue !== undefined) {
    if (o.buildingStandardValue < o.landStandardValue * 0.02) return true;
  }
  return false;
}

/**
 * §168의11① 호별 기준면적(㎡) 해석. undefined = 면적기준 없는 호(14호·none) → boolean 유지.
 *
 * 자동산출(KoreanLaw 본문 검증): 7호 최대면적×1.2 · 4호 수용정원×200㎡ · 2호나 최저차고×1.5 · 13호 660㎡.
 * 직접입력(별표 의존): 1호(별표3/4/5) · 2호가목(설치기준면적) · 5호다(별표6) · 6호(휴양 합산면적).
 */
export function resolveAreaLimit(o: OtherLandUsage): number | undefined {
  switch (o.relatedBusinessType) {
    case "hatchang":
      return o.maxAnnualArea !== undefined ? o.maxAnnualArea * NBL_AREA_MULTIPLIER.HATCHANG_RATIO : undefined;
    case "youth_training":
      return o.youthCapacity !== undefined ? o.youthCapacity * NBL_AREA_MULTIPLIER.YOUTH_PER_CAPITA : undefined;
    case "parking_garage":
      return o.minGarageArea !== undefined ? o.minGarageArea * NBL_AREA_MULTIPLIER.GARAGE_MULTIPLIER : undefined;
    case "vacant_lot_1household":
      return NBL_AREA_MULTIPLIER.VACANT_LOT_1HOUSEHOLD;
    case "sports":
    case "parking_attached":
    case "reserve_forces":
    case "resort":
      return o.standardAreaLimit; // 별표/설치기준 직접입력 (미입력 시 undefined → 면적기준 미적용)
    default:
      return undefined; // etc_14호 · none · 미설정 → 면적기준 없음 (boolean 유지)
  }
}

/** §168의11① 호별 면적기준 legalBasis. 미해당(14호·legacy)은 OTHER_LAND_BUSINESS. */
function resolveAreaLegalBasis(t: NblRelatedBusinessType | undefined): string {
  switch (t) {
    case "sports":                return NBL.OTHER_LAND_AREA_SPORTS;
    case "parking_attached":      return NBL.OTHER_LAND_AREA_PARKING;
    case "parking_garage":        return NBL.OTHER_LAND_AREA_GARAGE;
    case "youth_training":        return NBL.OTHER_LAND_AREA_YOUTH;
    case "reserve_forces":        return NBL.OTHER_LAND_AREA_RESERVE;
    case "resort":                return NBL.OTHER_LAND_AREA_RESORT;
    case "hatchang":              return NBL.OTHER_LAND_AREA_HATCHANG;
    case "vacant_lot_1household": return NBL.OTHER_LAND_AREA_VACANT_LOT;
    default:                      return NBL.OTHER_LAND_BUSINESS;
  }
}

export function judgeOtherLand(
  input: NonBusinessLandInput,
  rules: NonBusinessLandJudgmentRules,
): CategoryJudgeResult {
  const steps: JudgmentStep[] = [];
  const appliedLaws: string[] = [NBL.OTHER_LAND];
  const warnings: string[] = [];

  const ownershipStart = getOwnershipStart(input.acquisitionDate);
  const totalOwnershipDays = Math.max(0, differenceInDays(input.transferDate, ownershipStart));

  const o = input.otherLand;
  if (!o) {
    steps.push({
      id: "other_missing",
      label: "기타토지 사용현황 입력",
      status: "FAIL",
      detail: "사용현황 미입력",
      legalBasis: NBL.OTHER_LAND,
    });
    return {
      isBusiness: false,
      reason: "기타토지 사용현황 미입력",
      steps,
      appliedLaws,
      totalOwnershipDays,
      effectiveBusinessDays: 0,
      gracePeriodDays: 0,
      businessUseRatio: 0,
      criteria: { rule2of3Years: false, rule5Years: false, rule80Percent: false },
      warnings,
    };
  }

  // Step 0: 나대지 간주
  const bareLand = isBareLand(input);
  const effectiveTaxType: PropertyTaxType = bareLand ? "comprehensive" : o.propertyTaxType;
  steps.push({
    id: "other_bare_land",
    label: "Step 0 나대지 간주 검증 (2% 기준)",
    status: bareLand ? "FAIL" : "PASS",
    detail: bareLand
      ? `나대지 간주 (건물시가표준액 < 토지시가표준액 × 2%) → 종합합산 취급`
      : `일반 건축물 부속토지 (원 재산세 유형 유지: ${o.propertyTaxType})`,
    legalBasis: NBL.OTHER_LAND,
  });

  // ── Step 3-1: 재산세 종합합산이 아닌 토지 + 기간기준 ───────────────
  const isNonComprehensive = effectiveTaxType !== "comprehensive";
  const fullPeriod: DateInterval[] = [{ start: ownershipStart, end: input.transferDate }];

  // ── §168의11② 수입금액비율 (2호다목·10·11다·12호 특정 업종) ──────────
  let revenueTestDetail: RevenueTestResult | undefined;
  if (input.revenueTest && input.revenueTest.businessType !== "none") {
    revenueTestDetail = computeRevenueTest(input.revenueTest);
    steps.push({
      id: "other_revenue_test",
      label: "§168의11② 수입금액비율",
      status: revenueTestDetail.pass ? "PASS" : "FAIL",
      detail: revenueTestDetail.detail,
      legalBasis: NBL.REVENUE_TEST,
    });
    if (revenueTestDetail.pass) {
      appliedLaws.push(NBL.REVENUE_TEST);
      const r = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, input.transferDate, "other_land", rules, input.gracePeriods);
      return buildPass(`수입금액비율 충족 (${revenueTestDetail.businessType})`, steps, appliedLaws, warnings, {
        r, totalOwnershipDays, revenueTestDetail,
      });
    }
  }

  if (isNonComprehensive) {
    const r = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, input.transferDate, "other_land", rules, input.gracePeriods);
    if (r.meets) {
      steps.push({
        id: "other_tax_type_criteria",
        label: "Step 3-1 비종합합산(비과세·분리·별도) + 기간기준",
        status: "PASS",
        detail: `재산세 ${effectiveTaxType} + 기간기준 충족`,
        legalBasis: NBL.OTHER_LAND,
      });
      return buildPass(`재산세 ${effectiveTaxType} + 기간기준 충족`, steps, appliedLaws, warnings, {
        r, totalOwnershipDays, revenueTestDetail,
      });
    }
    steps.push({
      id: "other_tax_type_criteria",
      label: "Step 3-1 비종합합산(비과세·분리·별도) + 기간기준",
      status: "FAIL",
      detail: `재산세 ${effectiveTaxType}이나 기간기준 미충족 — ${r.detail}`,
      legalBasis: NBL.OTHER_LAND,
    });
  } else {
    steps.push({
      id: "other_tax_type_criteria",
      label: "Step 3-1 비종합합산 여부",
      status: "FAIL",
      detail: "재산세 종합합산과세대상 (원칙 비사업용)",
      legalBasis: NBL.OTHER_LAND,
    });
  }

  // ── Step 3-1-1: §168의11① 거주·사업관련 토지 (호별 면적기준) ──────────
  // relatedBusinessType(호) 우선, 미설정 시 legacy isRelatedToResidenceOrBusiness fallback.
  const relatedType = o.relatedBusinessType;
  const isRecognizedHo = relatedType !== undefined && relatedType !== "none";
  const isRelated = isRecognizedHo || o.isRelatedToResidenceOrBusiness;

  if (isRelated) {
    const r = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, input.transferDate, "other_land", rules, input.gracePeriods);
    const legalBasis = resolveAreaLegalBasis(relatedType);

    if (!r.meets) {
      steps.push({
        id: "other_residence_business",
        label: "Step 3-1-1 거주·사업관련 토지 + 기간기준",
        status: "FAIL",
        detail: `거주·사업관련이나 기간기준 미충족 — ${r.detail}`,
        legalBasis,
      });
      return buildFail("거주·사업관련 토지이나 기간기준 미충족", steps, appliedLaws, warnings, {
        r, totalOwnershipDays, revenueTestDetail,
      });
    }

    appliedLaws.push(legalBasis);

    // 호별 기준면적 해석 — 초과분 비사업용 면적 안분 (§168의11①)
    const areaLimit = resolveAreaLimit(o);
    if (areaLimit !== undefined && input.landArea > areaLimit) {
      const areaProportioning = computeAreaProportioning(input.landArea, areaLimit);
      steps.push({
        id: "other_area_limit",
        label: "Step 3-1-1 §168의11① 호별 기준면적",
        status: "FAIL",
        detail: `기준면적 ${areaLimit}㎡ 초과 → 초과분 ${areaProportioning.nonBusinessArea}㎡ 비사업용`,
        legalBasis,
      });
      return {
        isBusiness: false,
        reason: `기준면적 초과 — 초과분 ${areaProportioning.nonBusinessArea}㎡ 비사업용`,
        steps,
        appliedLaws,
        areaProportioning,
        totalOwnershipDays,
        effectiveBusinessDays: r.effectiveBusinessDays,
        gracePeriodDays: r.gracePeriodDays,
        businessUseRatio: areaProportioning.nonBusinessRatio,
        criteria: r.criteria,
        revenueTestDetail,
        warnings,
      };
    }

    // 기준면적 이내 또는 면적기준 없는 호(14호·legacy) → 전량 사업용
    steps.push({
      id: "other_residence_business",
      label: areaLimit !== undefined ? "Step 3-1-1 §168의11① 호별 기준면적" : "Step 3-1-1 거주·사업관련 토지 + 기간기준",
      status: "PASS",
      detail: areaLimit !== undefined
        ? `거주·사업관련(§168의11①) + 기준면적 ${areaLimit}㎡ 이내 + 기간기준 충족`
        : "거주·사업과 직접 관련 + 기간기준 충족",
      legalBasis,
    });
    return buildPass(
      areaLimit !== undefined ? "거주·사업관련 토지 + 기준면적 이내" : "거주·사업관련 토지 + 기간기준 충족",
      steps, appliedLaws, warnings, { r, totalOwnershipDays, revenueTestDetail },
    );
  }

  steps.push({
    id: "other_residence_business",
    label: "Step 3-1-1 거주·사업관련 토지",
    status: "NOT_APPLICABLE",
    detail: "거주·사업과 직접 관련 플래그 미설정",
    legalBasis: NBL.OTHER_LAND_BUSINESS,
  });
  const dummyR = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, input.transferDate, "other_land", rules, input.gracePeriods);
  return buildFail("종합합산 + 거주·사업관련 미해당 → 비사업용", steps, appliedLaws, warnings, {
    r: dummyR, totalOwnershipDays, revenueTestDetail,
  });
}

interface Ctx {
  r: PeriodCriteriaResult;
  totalOwnershipDays: number;
  revenueTestDetail?: RevenueTestResult;
}

function buildPass(
  reason: string,
  steps: JudgmentStep[],
  appliedLaws: string[],
  warnings: string[],
  ctx: Ctx,
): CategoryJudgeResult {
  return {
    isBusiness: true,
    reason,
    steps,
    appliedLaws,
    totalOwnershipDays: ctx.totalOwnershipDays,
    effectiveBusinessDays: ctx.r.effectiveBusinessDays,
    gracePeriodDays: ctx.r.gracePeriodDays,
    businessUseRatio: ctx.r.ratio,
    criteria: ctx.r.criteria,
    revenueTestDetail: ctx.revenueTestDetail,
    warnings,
  };
}

function buildFail(
  reason: string,
  steps: JudgmentStep[],
  appliedLaws: string[],
  warnings: string[],
  ctx: Ctx,
): CategoryJudgeResult {
  return {
    isBusiness: false,
    reason,
    steps,
    appliedLaws,
    totalOwnershipDays: ctx.totalOwnershipDays,
    effectiveBusinessDays: ctx.r.effectiveBusinessDays,
    gracePeriodDays: ctx.r.gracePeriodDays,
    businessUseRatio: ctx.r.ratio,
    criteria: ctx.r.criteria,
    revenueTestDetail: ctx.revenueTestDetail,
    warnings,
  };
}
