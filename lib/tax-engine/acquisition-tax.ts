/**
 * 취득세 계산 메인 통합 엔진
 *
 * 2-레이어 아키텍처:
 *   Layer 2 (Pure Engine) — DB 직접 호출 없음
 *   모든 외부 데이터는 매개변수로 전달
 *
 * 호출 순서:
 * 1. 과세 대상 판정 (acquisition-object.ts)
 * 2. 간주취득 판정 (acquisition-deemed.ts)
 * 3. 취득 시기 확정 (acquisition-timing.ts)
 * 4. 과세표준 결정 (acquisition-tax-base.ts)
 * 5. 세율 결정 (acquisition-tax-rate.ts)
 * 6. 중과세 판정 (acquisition-tax-surcharge.ts)
 * 7. 최종 세액 계산 (취득세 + 농특세 + 지방교육세)
 * 8. 감면 적용 (생애최초)
 */

import { determineTaxableObject } from "./acquisition-object";
import { assessDeemedAcquisition } from "./acquisition-deemed";
import { determineAcquisitionTiming } from "./acquisition-timing";
import { determineTaxBase } from "./acquisition-tax-base";
import {
  decideTaxRate,
  calcLinearInterpolationTax,
  calcTaxWithAdditional,
  calcBurdenedGiftTax,
  linearInterpolationRate,
} from "./acquisition-tax-rate";
import { assessSurcharge, resolveFinalRate } from "./acquisition-tax-surcharge";
import { ACQUISITION_CONST } from "./legal-codes";
import type {
  AcquisitionTaxInput,
  AcquisitionTaxResult,
  AcquisitionCalculationStep,
  BurdenedGiftBreakdown,
} from "./types/acquisition.types";

// ============================================================
// 메인 계산 함수
// ============================================================

/**
 * 취득세 종합 계산
 *
 * @param input 취득세 계산 입력 데이터
 * @returns 취득세 계산 결과 (취득세 본세 + 농특세 + 지방교육세 + 감면)
 */
export function calcAcquisitionTax(input: AcquisitionTaxInput): AcquisitionTaxResult {
  const warnings: string[] = [];
  const legalBasis: string[] = [];
  const steps: AcquisitionCalculationStep[] = [];
  const targetDate = input.targetDate ?? new Date().toISOString().slice(0, 10);

  // ── Step 1: 과세 대상 판정 ──
  const taxableResult = determineTaxableObject({
    propertyType: input.propertyType,
    acquisitionCause: input.acquisitionCause,
    acquiredBy: input.acquiredBy,
    isCemetery: false,
    isTrustReturn: false,
    isTemporaryBuilding: false,
    isSelfCultivatedFarmland: false,
    isReligiousNonprofit: false,
  });

  if (!taxableResult.isSubjectToTax) {
    return buildZeroResult(input, targetDate, taxableResult.warnings, "열거주의 과세 대상 아님");
  }

  if (taxableResult.isExempt) {
    return buildZeroResult(
      input,
      targetDate,
      taxableResult.warnings,
      undefined,
      taxableResult.exemptionType
    );
  }

  legalBasis.push(taxableResult.legalBasis);

  // ── Step 2: 간주취득 판정 ──
  let effectiveInput = { ...input };

  const isDeemedCause = [
    "deemed_major_shareholder",
    "deemed_land_category",
    "deemed_renovation",
  ].includes(input.acquisitionCause);

  if (isDeemedCause && input.deemedInput) {
    const deemedResult = assessDeemedAcquisition(input.deemedInput);
    warnings.push(...deemedResult.warnings);
    legalBasis.push(deemedResult.legalBasis);

    if (!deemedResult.isSubjectToTax) {
      return buildZeroResult(input, targetDate, warnings, "간주취득 과세 요건 미충족");
    }

    // 간주취득 과세표준을 reportedPrice로 주입 (acquisition-tax-base.ts에서 사용)
    effectiveInput = { ...input, reportedPrice: deemedResult.deemedTaxBase };
  }

  // ── Step 3: 취득 시기 확정 ──
  const timingResult = determineAcquisitionTiming({
    acquisitionCause: input.acquisitionCause,
    balancePaymentDate: input.balancePaymentDate,
    registrationDate: input.registrationDate,
    contractDate: input.contractDate,
    usageApprovalDate: input.usageApprovalDate,
    actualUsageDate: input.actualUsageDate,
    deemedAcquisitionDate: input.balancePaymentDate, // 간주취득은 해당 완료일 사용
  });

  warnings.push(...timingResult.warnings);
  legalBasis.push(timingResult.legalBasis);

  // ── Step 4: 과세표준 결정 ──
  const taxBaseResult = determineTaxBase(effectiveInput);
  warnings.push(...taxBaseResult.warnings);
  legalBasis.push(taxBaseResult.legalBasis);

  const taxBase = taxBaseResult.taxBase;

  // ── Step 5~6: 세율 결정 + 중과세 판정 ──
  const basicRateDecision = decideTaxRate({
    propertyType: input.propertyType,
    acquisitionCause: input.acquisitionCause,
    acquisitionValue: taxBase,
  });

  const surchargeDecision = assessSurcharge({
    propertyType: input.propertyType,
    acquisitionCause: input.acquisitionCause,
    acquisitionValue: taxBase,
    acquiredBy: input.acquiredBy,
    houseCountAfter: input.houseCountAfter,
    isRegulatedArea: input.isRegulatedArea,
    isLuxuryProperty: input.isLuxuryProperty,
    basicRate: basicRateDecision.appliedRate,
    isFirstHome: input.isFirstHome,
    isMetropolitan: input.isMetropolitan,
  });

  warnings.push(...surchargeDecision.warnings);
  legalBasis.push(...surchargeDecision.legalBasis);

  const finalRate = resolveFinalRate(basicRateDecision.appliedRate, surchargeDecision);

  // ── Step 7: 세액 계산 ──
  let acquisitionTax: number;
  let burdenedGiftBreakdown: BurdenedGiftBreakdown | undefined;

  if (input.acquisitionCause === "burdened_gift" && taxBaseResult.breakdown) {
    // 부담부증여: 유상/무상 분리 계산
    const { onerousTaxBase = 0, gratuitousTaxBase = 0 } = taxBaseResult.breakdown;
    const { onerousTax, gratuitousTax } = calcBurdenedGiftTax(
      onerousTaxBase,
      gratuitousTaxBase,
      input.propertyType,
      taxBase
    );
    acquisitionTax = onerousTax + gratuitousTax;
    burdenedGiftBreakdown = {
      onerousTaxBase,
      onerousTax,
      gratuitousTaxBase,
      gratuitousTax,
    };
  } else if (basicRateDecision.rateType === "linear_interpolation" && !surchargeDecision.isSurcharged) {
    // 선형보간 구간 세액 (BigInt 계산)
    acquisitionTax = calcLinearInterpolationTax(taxBase);
  } else {
    // 일반 세액: 과세표준 × 세율 (원 미만 절사)
    acquisitionTax = Math.floor(taxBase * finalRate);
  }

  // ── 부가세 계산 ──
  const additional = calcTaxWithAdditional(
    taxBase,
    finalRate,
    acquisitionTax,
    input.propertyType,
    input.areaSqm
  );

  const totalTax = acquisitionTax + additional.ruralSpecialTax + additional.localEducationTax;

  // ── Step 8: 감면 적용 ──
  // 첫 번째 assessSurcharge의 isEligible 판정을 재사용, 취득세 본세 기준 감면액만 새로 계산
  const firstHomeInfo = surchargeDecision.firstHomeReduction;
  const reductionAmount = firstHomeInfo?.isEligible
    ? Math.min(acquisitionTax, ACQUISITION_CONST.FIRST_HOME_MAX_REDUCTION)
    : 0;
  const totalTaxAfterReduction = Math.max(0, totalTax - reductionAmount);

  // ── 계산 과정 정리 (결과 UI 상세 표시용) ──
  steps.push(
    {
      label: "과세표준",
      formula: taxBaseResult.method === "actual_price" || taxBaseResult.method === "recognized_market"
        ? "신고가액 (천원 미만 절사)"
        : "시가표준액 (천원 미만 절사)",
      amount: taxBase,
      legalBasis: "지방세법 §10",
    },
    {
      label: "취득세 본세",
      formula: surchargeDecision.isSurcharged
        ? `과세표준 × 중과세율 ${(finalRate * 100).toFixed(1)}%`
        : basicRateDecision.rateType === "linear_interpolation"
          ? `과세표준 × 선형보간세율 ${(basicRateDecision.appliedRate * 100).toFixed(4).replace(/\.?0+$/, "")}% (6~9억 구간, 지방세법 §11①8)`
          : `과세표준 × ${(finalRate * 100).toFixed(1)}%`,
      amount: acquisitionTax,
      legalBasis: surchargeDecision.isSurcharged ? "지방세법 §13" : "지방세법 §11",
    },
  );
  if (additional.ruralSpecialTax > 0) {
    steps.push({
      label: "농어촌특별세",
      formula: "취득세 본세 × 10% (85㎡ 초과 또는 중과 대상)",
      amount: additional.ruralSpecialTax,
      legalBasis: "농어촌특별세법 §5①",
    });
  }
  if (additional.localEducationTax > 0) {
    steps.push({
      label: "지방교육세",
      formula: "취득세 본세 × 20%",
      amount: additional.localEducationTax,
      legalBasis: "지방세법 §151",
    });
  }
  steps.push({
    label: "합계 납부세액 (감면 전)",
    formula: "취득세 + 농특세 + 지방교육세",
    amount: totalTax,
  });
  if (reductionAmount > 0) {
    steps.push({
      label: "생애최초 감면",
      formula: `취득세 본세 × 100% (한도 ${ACQUISITION_CONST.FIRST_HOME_MAX_REDUCTION.toLocaleString()}원)`,
      amount: -reductionAmount,
      legalBasis: "지방세특례제한법 §36의3",
    });
    steps.push({
      label: "감면 후 최종 납부세액",
      formula: "합계 − 생애최초 감면액",
      amount: totalTaxAfterReduction,
    });
  }

  return {
    propertyType: input.propertyType,
    acquisitionCause: input.acquisitionCause,
    acquisitionValue: taxBase,

    taxBase,
    taxBaseMethod: taxBaseResult.method,

    appliedRate: finalRate,
    rateType: surchargeDecision.isSurcharged
      ? (input.isLuxuryProperty ? "surcharge_luxury"
        : input.acquiredBy === "corporation" ? "surcharge_corporate"
        : "surcharge_regulated")
      : basicRateDecision.rateType,
    isSurcharged: surchargeDecision.isSurcharged,
    surchargeReason: surchargeDecision.surchargeReason,

    acquisitionTax,
    ruralSpecialTax: additional.ruralSpecialTax,
    localEducationTax: additional.localEducationTax,
    totalTax,

    reductionType: reductionAmount > 0 ? "first_home" : undefined,
    reductionAmount,
    totalTaxAfterReduction,

    burdenedGiftBreakdown,

    acquisitionDate: timingResult.acquisitionDate,
    filingDeadline: timingResult.filingDeadline,

    isExempt: false,

    steps,

    appliedLawDate: targetDate,
    warnings: [...new Set(warnings)], // 중복 제거
    legalBasis: [...new Set(legalBasis)],
  };
}

// ============================================================
// 결과 빌더 (비과세·면제 시)
// ============================================================

function buildZeroResult(
  input: AcquisitionTaxInput,
  targetDate: string,
  warnings: string[],
  reason?: string,
  exemptionType?: AcquisitionTaxResult["exemptionType"]
): AcquisitionTaxResult {
  const today = new Date().toISOString().slice(0, 10);
  const addDays = (d: string, days: number) => {
    const dt = new Date(d);
    dt.setDate(dt.getDate() + days);
    return dt.toISOString().slice(0, 10);
  };

  if (reason) {
    warnings.push(reason);
  }

  // 취득일: 잔금지급일 > 등기일 > 계약일 > 오늘 순으로 사용
  const acquisitionDate =
    input.balancePaymentDate ?? input.registrationDate ?? input.contractDate ?? today;

  return {
    propertyType: input.propertyType,
    acquisitionCause: input.acquisitionCause,
    acquisitionValue: 0,

    taxBase: 0,
    taxBaseMethod: "standard_value",

    appliedRate: 0,
    rateType: "basic",
    isSurcharged: false,

    acquisitionTax: 0,
    ruralSpecialTax: 0,
    localEducationTax: 0,
    totalTax: 0,

    reductionAmount: 0,
    totalTaxAfterReduction: 0,

    acquisitionDate,
    filingDeadline: addDays(acquisitionDate, 60),

    isExempt: !!exemptionType,
    exemptionType,

    steps: [],

    appliedLawDate: targetDate,
    warnings,
    legalBasis: [],
  };
}
