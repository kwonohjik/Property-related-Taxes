/**
 * 취득세 결과 조립 — 계산 과정(steps)·P2 상세·세율 유형·주택 수 상세
 *
 * `acquisition-tax.ts`(772줄 → 분리 트리거 800 근접)에서 결과 조립 블록을 옮겼다. 계산은 하지 않고
 * 이미 계산된 값을 화면용 구조로 모은다 — 본문은 원래 블록 그대로(무동작 분리).
 */

import { ACQUISITION, ACQUISITION_CONST } from "./legal-codes";
import { buildLocalEducationTaxFormula } from "./acquisition-tax-rate";
import type { AdditionalTaxInput, AdditionalTaxResult } from "./acquisition-tax-rate";
import type { determineTaxBase } from "./acquisition-tax-base";
import type { CorpSurchargeResult } from "./acquisition-corp-surcharge";
import type { assessSurcharge } from "./acquisition-tax-surcharge";
import { isCorporateHouseAcquirer } from "./acquisition-tax-surcharge";
import type { applySpecialRate } from "./acquisition-tax-rate-special";
import type { assessSelfCultivationReduction } from "./acquisition-self-cultivation-reduction";
import type { AcquisitionTaxInput, AcquisitionTaxResult, AcquisitionCalculationStep, TaxRateDecision } from "./types/acquisition.types";
import type { HouseCountResult } from "./house-count/types";

type SurchargeDecisionResult = ReturnType<typeof assessSurcharge>;
type SpecialRateResult = ReturnType<typeof applySpecialRate>;

/** 취득세 본세·부가세·감면 계산 과정 단계 */
export function buildMainTaxSteps(ctx: {
  input: AcquisitionTaxInput;
  effectiveInput: AcquisitionTaxInput;
  taxBaseResult: ReturnType<typeof determineTaxBase>;
  taxBase: number;
  basicRateDecision: TaxRateDecision;
  corpSurchargeResult: CorpSurchargeResult;
  surchargeDecision: SurchargeDecisionResult;
  specialRateResult: SpecialRateResult;
  shareRateBasis: number | undefined;
  finalRate: number;
  acquisitionTax: number;
  ruralSpecialTax: number;
  additional: AdditionalTaxResult;
  totalTax: number;
  surchargeTypeForEdu: AdditionalTaxInput["surchargeType"];
  reductionAmount: number;
  reductionType: "first_home" | "self_cultivation" | undefined;
  bestReduction: { label: string; legalBasis: string };
  totalTaxAfterReduction: number;
}): AcquisitionCalculationStep[] {
  const {
    input, effectiveInput, taxBaseResult, taxBase, basicRateDecision, corpSurchargeResult, surchargeDecision,
    specialRateResult, shareRateBasis, finalRate, acquisitionTax, ruralSpecialTax, additional, totalTax,
    surchargeTypeForEdu, reductionAmount, reductionType, bestReduction, totalTaxAfterReduction,
  } = ctx;
  const steps: AcquisitionCalculationStep[] = [];
  // 취득세 본세 세율 표현부(선두 "과세표준 × " 제외) — 과세표준값·결과값 인라인 조립용.
  const bonseRateExpr = corpSurchargeResult.isSurcharged
    ? `${corpSurchargeResult.surchargeType} 중과세율 ${(finalRate * 100).toFixed(1)}%`
    : surchargeDecision.isSurcharged
      ? `중과세율 ${(finalRate * 100).toFixed(1)}%`
      : specialRateResult.isApplied
        ? `§15 세율특례 ${(finalRate * 100).toFixed(4).replace(/\.?0+$/, "")}%`
        : basicRateDecision.rateType === "linear_interpolation"
          ? `선형보간세율 ${(basicRateDecision.appliedRate * 100).toFixed(4).replace(/\.?0+$/, "")}% (6~9억 구간${shareRateBasis !== undefined ? ` — 지분 취득: 전체 주택 ${shareRateBasis.toLocaleString()}원 기준` : ""}, ${ACQUISITION.LINEAR_RATE})`
          : `${(finalRate * 100).toFixed(1)}%`;
  steps.push(
    {
      label: "과세표준",
      formula: taxBaseResult.method === "actual_price" || taxBaseResult.method === "recognized_market"
        ? "신고가액 (원 단위 — 취득세 과세표준 절사 규정 없음)"
        : "시가표준액 (원 단위 — 취득세 과세표준 절사 규정 없음)",
      amount: taxBase,
      legalBasis: ACQUISITION.TAX_BASE,
    },
    {
      label: "취득세 본세",
      formula: `과세표준 ${taxBase.toLocaleString()} × ${bonseRateExpr} = ${acquisitionTax.toLocaleString()}`,
      amount: acquisitionTax,
      legalBasis: corpSurchargeResult.isSurcharged
        ? corpSurchargeResult.legalBasis[0]
        : surchargeDecision.isSurcharged
          ? ACQUISITION.SURCHARGE
          : specialRateResult.isApplied
            ? specialRateResult.legalBasis
            : basicRateDecision.rateType === "linear_interpolation"
              ? ACQUISITION.LINEAR_RATE
              : ACQUISITION.BASIC_RATE,
    },
  );
  if (ruralSpecialTax > 0) {
    steps.push({
      label: "농어촌특별세",
      formula: `(표준세율 2% + 중과분) × 과세표준 ${taxBase.toLocaleString()} × 10% = ${ruralSpecialTax.toLocaleString()} (${ACQUISITION.RURAL_SPECIAL_TAX})`,
      amount: ruralSpecialTax,
      legalBasis: ACQUISITION.RURAL_SPECIAL_TAX_RATE_BASIS,
    });
  }
  if (additional.localEducationTax > 0) {
    // [C-3] 지방교육세 표시 산식을 실제 분기(§151①1)에 맞춰 동적 생성 (하드코딩 0.4% 제거).
    steps.push({
      label: "지방교육세",
      formula: `${buildLocalEducationTaxFormula(surchargeTypeForEdu, input.propertyType, effectiveInput.acquisitionCause)} = ${additional.localEducationTax.toLocaleString()}`,
      amount: additional.localEducationTax,
      legalBasis: ACQUISITION.LOCAL_EDUCATION_TAX,
    });
  }
  steps.push({
    label: "합계 납부세액 (감면 전)",
    formula: `취득세 ${acquisitionTax.toLocaleString()} + 농특세 ${ruralSpecialTax.toLocaleString()} + 지방교육세 ${additional.localEducationTax.toLocaleString()} = ${totalTax.toLocaleString()}`,
    amount: totalTax,
  });
  if (reductionAmount > 0) {
    steps.push({
      label: bestReduction.label,
      formula: reductionType === "self_cultivation"
        ? `취득세 본세 ${acquisitionTax.toLocaleString()} × 50% = ${reductionAmount.toLocaleString()} (${ACQUISITION.SELF_CULTIVATION_REDUCTION})`
        : `취득세 본세 전액 감면 (한도 ${(input.isSmallHouseFirstHome
            ? ACQUISITION_CONST.FIRST_HOME_MAX_REDUCTION_SMALL
            : ACQUISITION_CONST.FIRST_HOME_MAX_REDUCTION).toLocaleString()}원) = ${reductionAmount.toLocaleString()}`,
      amount: -reductionAmount,
      legalBasis: bestReduction.legalBasis,
    });
    steps.push({
      label: "감면 후 최종 납부세액",
      formula: `합계 ${totalTax.toLocaleString()} − ${bestReduction.label} ${reductionAmount.toLocaleString()} = ${totalTaxAfterReduction.toLocaleString()}`,
      amount: totalTaxAfterReduction,
    });
  }
  return steps;
}

/** P2 상세 결과 — 세율특례·법인 중과·자경농지 감면 */
export function buildDetailResults(ctx: {
  input: AcquisitionTaxInput;
  specialRateType: string | undefined;
  specialRateResult: SpecialRateResult;
  basicRateDecision: TaxRateDecision;
  corpSurchargeResult: CorpSurchargeResult;
  selfCultivResult: ReturnType<typeof assessSelfCultivationReduction>;
}) {
  const { input, specialRateType, specialRateResult, basicRateDecision, corpSurchargeResult, selfCultivResult } = ctx;
  const specialRateDetail = specialRateResult.isApplied
    ? {
        type: specialRateType ?? "",
        basicRate: specialRateResult.basicRate,
        appliedRate: specialRateResult.appliedRate,
        legalBasis: specialRateResult.legalBasis,
        message: specialRateResult.message,
      }
    : undefined;

  const corpSurchargeDetail = corpSurchargeResult.isSurcharged && corpSurchargeResult.surchargeRate !== undefined
    ? {
        surchargeType: corpSurchargeResult.surchargeType,
        basicRate: basicRateDecision.appliedRate,
        surchargeRate: corpSurchargeResult.surchargeRate,
        reason: corpSurchargeResult.reason,
        legalBasis: corpSurchargeResult.legalBasis,
      }
    : undefined;

  const selfCultivationReductionDetail = (input.isSelfCultivatedFarmer)
    ? {
        isEligible: selfCultivResult.isEligible,
        reductionAmount: selfCultivResult.reductionAmount,
        ineligibleReasons: selfCultivResult.ineligibleReasons,
        warnings: selfCultivResult.warnings,
      }
    : undefined;

  return { specialRateDetail, corpSurchargeDetail, selfCultivationReductionDetail };
}

/** 결과 세율 유형 */
export function resolveResultRateType(ctx: {
  input: AcquisitionTaxInput;
  basicRateDecision: TaxRateDecision;
  corpSurchargeResult: CorpSurchargeResult;
  surchargeDecision: SurchargeDecisionResult;
}): AcquisitionTaxResult["rateType"] {
  const { input, basicRateDecision, corpSurchargeResult, surchargeDecision } = ctx;
  if (corpSurchargeResult.isSurcharged) return "surcharge_corporate";
  if (surchargeDecision.isSurcharged) {
    if (input.isLuxuryProperty) return "surcharge_luxury";
    if (isCorporateHouseAcquirer(input.acquiredBy)) return "surcharge_corporate";
    return "surcharge_regulated";
  }
  return basicRateDecision.rateType;
}

/** P3 주택 수 자동 산정 결과 → 결과 상세 */
export function toHouseCountDetailResult(
  houseCountDetail: HouseCountResult | undefined
): AcquisitionTaxResult["houseCountDetail"] {
  return houseCountDetail ? {
    totalCount: houseCountDetail.totalCount,
    effectiveCount: houseCountDetail.effectiveCount,
    pendingAcquisitionIncluded: houseCountDetail.pendingAcquisitionIncluded,
    excludedDetails: houseCountDetail.excludedDetails,
    referenceDate: houseCountDetail.referenceDate,
    separateHousehold: houseCountDetail.separateHousehold,
    temporaryTwoHouseWarning: houseCountDetail.temporaryTwoHouseWarning,
    trustedHouseCount: houseCountDetail.trustedHouseCount,
    warnings: houseCountDetail.warnings,
    legalBasis: houseCountDetail.legalBasis,
  } : undefined;
}
