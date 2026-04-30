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
 * 5a. [P2-1] §15 세율특례 적용
 * 5b. [P2-2] §13①② 법인·공장 중과 적용
 * 6. 중과세 판정 (acquisition-tax-surcharge.ts)
 * 7. 최종 세액 계산 (취득세 + 농특세 + 지방교육세)
 * 8. 감면 적용 — 생애최초 + [P2-5] 자경농지 50% 감면 (중복배제 패턴)
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
import {
  applySpecialRate,
  isValidSpecialRateType,
} from "./acquisition-tax-rate-special";
import {
  assessCorpSurcharge,
} from "./acquisition-corp-surcharge";
import {
  assessSelfCultivationReduction,
} from "./acquisition-self-cultivation-reduction";
import { ACQUISITION, ACQUISITION_CONST } from "./legal-codes";
import { resolveHouseCount } from "./house-count/index";
import type {
  AcquisitionTaxInput,
  AcquisitionTaxResult,
  AcquisitionCalculationStep,
  BurdenedGiftBreakdown,
  DeemedAcquisitionInput,
  DeemedMajorShareholderResult,
} from "./types/acquisition.types";
import type {
  DeemedLandCategoryResult,
  DeemedRenovationResult,
} from "./acquisition-deemed";
import type { ExtendedSurchargeDecision } from "./acquisition-surcharge/index";
import type { HouseCountResult } from "./house-count/types";

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

  // [P1-6] 부담부증여 — 배우자·직계존비속 간 채무인수는 전체 무상으로 처리 (지법 §7④)
  // 후속 단계(과세표준·세율·중과)가 일반 gift 흐름을 따르도록 cause 자체를 변환.
  if (input.acquisitionCause === "burdened_gift" && input.giftRelation === "spouse_or_lineal") {
    effectiveInput = { ...effectiveInput, acquisitionCause: "gift" };
    warnings.push(
      "배우자·직계존비속 간 부담부증여는 채무액 인수 부분도 증여로 간주되어 전체 무상 처리됩니다 (지방세법 §7④).",
    );
    legalBasis.push("지방세법 §7④");
  }

  const isDeemedCause = [
    "deemed_major_shareholder",
    "deemed_land_category",
    "deemed_renovation",
  ].includes(input.acquisitionCause);

  // 간주취득 원인이지만 상세 입력(deemedInput)이 없는 경우 — 경고 후 0원 결과 반환
  if (isDeemedCause && !input.deemedInput) {
    return buildZeroResult(
      input,
      targetDate,
      [`간주취득(${input.acquisitionCause}) 계산에 필요한 상세 입력이 없습니다. deemedInput을 제공해주세요.`],
      undefined,
    );
  }

  let deemedDetailResult: AcquisitionTaxResult["deemedDetail"] | undefined;

  if (isDeemedCause && input.deemedInput) {
    const deemedResult = assessDeemedAcquisition(input.deemedInput);
    warnings.push(...deemedResult.warnings);
    legalBasis.push(deemedResult.legalBasis);

    // deemedDetail 구성 — 타입별로 필드 분기 매핑
    if (deemedResult.type !== null) {
      const base: AcquisitionTaxResult["deemedDetail"] = {
        type: deemedResult.type,
        isSubjectToTax: deemedResult.isSubjectToTax,
        deemedTaxBase: deemedResult.deemedTaxBase,
        legalBasis: deemedResult.legalBasis,
        warnings: deemedResult.warnings,
      };
      if (deemedResult.type === "major_shareholder" && deemedResult.detail) {
        const d = deemedResult.detail as DeemedMajorShareholderResult;
        base.prevShareRatio = d.prevShareRatio;
        base.newShareRatio = d.newShareRatio;
        base.taxableRatio = d.taxableRatio;
      } else if (deemedResult.detail) {
        const d = deemedResult.detail as DeemedLandCategoryResult | DeemedRenovationResult;
        base.prevStandardValue = d.prevStandardValue;
        base.newStandardValue = d.newStandardValue;
      }
      deemedDetailResult = base;
    }

    if (!deemedResult.isSubjectToTax) {
      return {
        ...buildZeroResult(input, targetDate, warnings, "간주취득 과세 요건 미충족"),
        deemedDetail: deemedDetailResult,
      };
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
    installments: input.installments,               // 연부취득 회차별 신고기한 계산용
  });

  warnings.push(...timingResult.warnings);
  legalBasis.push(timingResult.legalBasis);

  // ── Step 4: 과세표준 결정 ──
  const taxBaseResult = determineTaxBase(effectiveInput);
  warnings.push(...taxBaseResult.warnings);
  legalBasis.push(taxBaseResult.legalBasis);

  const taxBase = taxBaseResult.taxBase;

  // ── Step 4.5: [P3] 주택 수 자동 산정 ──
  // houseCountInput 제공 시 6차원 매트릭스로 자동 산정 후 houseCountAfter를 대체.
  // 미제공 시 기존 houseCountAfter 직접 입력 값 사용.
  let houseCountDetail: HouseCountResult | undefined;
  let resolvedHouseCount = input.houseCountAfter ?? 0;

  if (input.houseCountInput) {
    const houseCountRes = resolveHouseCount(input.houseCountInput as Parameters<typeof resolveHouseCount>[0], input.houseCountAfter);
    resolvedHouseCount = houseCountRes.effectiveCount;
    houseCountDetail = houseCountRes.detail;

    if (houseCountDetail) {
      warnings.push(...houseCountDetail.warnings);
      legalBasis.push(...houseCountDetail.legalBasis);
    }
  }

  // ── Step 5: 기본세율 결정 ──
  // P1-6 적용 시 effectiveInput.acquisitionCause = "gift"로 fallback되어 일반 무상취득 흐름.
  const basicRateDecision = decideTaxRate({
    propertyType: effectiveInput.propertyType,
    acquisitionCause: effectiveInput.acquisitionCause,
    acquisitionValue: taxBase,
  });

  // ── Step 5a: [P2-2] §13①② 법인·공장 중과 판정 ──
  // §13①②는 §13의2(다주택 중과)와 별개의 중과 체계.
  // corp-surcharge 결과가 있으면 surchargeDecision 전 finalRate 결정에 우선 반영.
  const corpSurchargeResult = assessCorpSurcharge({
    basicRate: basicRateDecision.appliedRate,
    acquiredBy: input.acquiredBy,
    isMetropolitanCongestion: input.isMetropolitanCongestion,
    isHeadquarterNewBuild: input.isHeadquarterNewBuild,
    isNonUrbanFactory: input.isNonUrbanFactory,
    factoryComponent: input.factoryComponent,
    isWithin5YearsOfEstablishment: input.isWithin5YearsOfEstablishment,
    excludedBusinessType: input.excludedBusinessType,
    isDormantCorpAcquisition: input.isDormantCorpAcquisition,
    propertyType: effectiveInput.propertyType,
  });

  if (corpSurchargeResult.warnings.length > 0) {
    warnings.push(...corpSurchargeResult.warnings);
  }

  // §13① 적용 시: isCorpMetroSurcharge는 §13② 기준이므로 별도 판단
  // corpSurchargeResult.isCorpMetroContext가 true이면 §15 특례 시 (basicRate - 2%) × 3 산식
  const effectiveCorpMetro = input.isCorpMetroSurcharge || corpSurchargeResult.isCorpMetroContext;
  const effectiveHqSurcharge = corpSurchargeResult.excludesSpecialRate;

  // ── Step 5b: [P2-1] §15 세율특례 적용 ──
  // §13①(본점·공장) 중과 대상이면 §15 배제.
  // §13②(대도시 법인) + §15 동시 적용 시 (basicRate - 2%) × 3.
  const specialRateType = isValidSpecialRateType(input.specialRateType)
    ? input.specialRateType
    : undefined;

  const specialRateResult = applySpecialRate(
    basicRateDecision.appliedRate,
    specialRateType,
    {
      isCorpMetro: effectiveCorpMetro,
      isHeadquarterOrFactorySurcharge: effectiveHqSurcharge,
    }
  );

  if (specialRateResult.isApplied) {
    legalBasis.push(specialRateResult.legalBasis);
    warnings.push(specialRateResult.message);
  }

  // §15 세율특례가 적용된 경우 basicRate 보정
  // 단, §13①② 법인 중과가 이미 적용된 경우 corp 세율을 우선
  const effectiveBasicRate = (() => {
    if (corpSurchargeResult.isSurcharged && corpSurchargeResult.surchargeRate !== undefined) {
      // §13①② 중과가 있으면 corp 세율 우선 (§15 특례보다 중과 세율이 높음)
      return corpSurchargeResult.surchargeRate;
    }
    if (specialRateResult.isApplied) {
      return specialRateResult.appliedRate;
    }
    return basicRateDecision.appliedRate;
  })();

  // ── Step 6: 중과세 판정 (§13의2 다주택·사치성 등) ──
  // §13①② 법인 중과가 이미 적용된 경우 §13의2 다주택 중과는 중복 적용 안 됨.
  // 사치성 재산 중과(§13⑤⑥⑦)는 corpSurchargeResult와 별도로 luxury.ts에서 처리됨.
  const surchargeDecision = assessSurcharge({
    propertyType: effectiveInput.propertyType,
    acquisitionCause: effectiveInput.acquisitionCause,
    acquisitionValue: taxBase,
    acquiredBy: input.acquiredBy,
    // [P3] 자동 산정 결과 우선, 없으면 직접 입력값 사용
    houseCountAfter: resolvedHouseCount,
    isRegulatedArea: input.isRegulatedArea,
    isLuxuryProperty: input.isLuxuryProperty,
    luxuryType: input.luxuryType,
    basicRate: effectiveBasicRate,
    isFirstHome: input.isFirstHome,
    isMetropolitan: input.isMetropolitan,
    // [P1-0] 별장 폐지 판단용 잔금일
    balanceDate: input.balancePaymentDate,
    // [P1-3 v4 M4] 무상취득 단서
    giftorRelation: input.giftorRelation,
    giftorIs1HHHolder: input.giftorIs1HHHolder,
    // [P1-4] 시가표준액 1억/2억 이중 기준 + 정비구역
    wholeHouseStandardValue: input.wholeHouseStandardValue,
    isMetropolitanRegion: input.isMetropolitanRegion,
    isUrbanRegenerationArea: input.isUrbanRegenerationArea,
    // [P1-5] 일시적 2주택
    isTemporaryTwoHouse: input.isTemporaryTwoHouse,
    previousHouseRegion: input.previousHouseRegion,
    newHouseRegion: input.newHouseRegion,
    // [P1-6] 부담부증여 배우자·직계존비속 배제 (지법 §7④)
    giftRelation: input.giftRelation,
    // [P1-6.5] §13의2④ 지정 전 매매계약 보호
    contractDateBeforeRegulation: input.contractDateBeforeRegulation,
    hasContractDepositProof: input.hasContractDepositProof,
    // [§13⑦] 사치성 + 대도시 법인 중복
    isCorpMetroSurcharge: effectiveCorpMetro,
    // [P2-1] 세율특례 사유 (무상취득 단서 배제 판단에 사용)
    specialRateType: input.specialRateType,
  });

  warnings.push(...surchargeDecision.warnings);
  legalBasis.push(...surchargeDecision.legalBasis);

  // §13①② 법인·공장 중과가 있으면 그 세율을 최종 세율로 우선 사용
  // (§13의2 다주택 중과와 §13①② 중과는 중복 적용 안 되며 높은 것이 적용됨)
  const finalRate = (() => {
    if (corpSurchargeResult.isSurcharged && corpSurchargeResult.surchargeRate !== undefined) {
      // §13의2 다주택 중과보다 법인·공장 중과를 우선
      return corpSurchargeResult.surchargeRate;
    }
    return resolveFinalRate(effectiveBasicRate, surchargeDecision);
  })();

  // ── Step 7: 세액 계산 ──
  let acquisitionTax: number;
  let burdenedGiftBreakdown: BurdenedGiftBreakdown | undefined;

  // P1-6 적용 시 effectiveInput.acquisitionCause === "gift"로 변환되어 분기 미진입.
  if (effectiveInput.acquisitionCause === "burdened_gift" && taxBaseResult.breakdown) {
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
  } else if (
    basicRateDecision.rateType === "linear_interpolation" &&
    !surchargeDecision.isSurcharged &&
    !specialRateResult.isApplied &&
    !corpSurchargeResult.isSurcharged
  ) {
    // 선형보간 구간 세액 (BigInt 계산) — 세율특례·법인중과 미적용 시에만
    acquisitionTax = calcLinearInterpolationTax(taxBase);
  } else {
    // 일반 세액: 과세표준 × 세율 (원 미만 절사)
    acquisitionTax = Math.floor(taxBase * finalRate);
  }

  // ── 부가세 계산 ──
  // [P4-2] 사치성 교육세 매트릭스 분기 — surchargeDecision의 appliedBranch 사용
  const surchargeTypeForEdu = ((): import("./acquisition-tax-rate").AdditionalTaxInput["surchargeType"] => {
    if (!surchargeDecision.isSurcharged) return undefined;
    const branch = (surchargeDecision as { appliedBranch?: string }).appliedBranch;
    if (branch === "luxury_solo") return "luxury_solo";
    if (branch === "luxury_multi") return "luxury_multi";
    if (branch === "corp_housing") return "corp_metro";
    if (branch === "multi_house_8") return "multi_house_8";
    if (branch === "multi_house_12") return "multi_house_12";
    if (branch === "gift_12") return "gift_12";
    return undefined;
  })();

  const additional = calcTaxWithAdditional(
    taxBase,
    finalRate,
    acquisitionTax,
    input.propertyType,
    input.areaSqm,
    {
      acquisitionCause: effectiveInput.acquisitionCause,
      isSurcharged: surchargeDecision.isSurcharged,
      surchargeType: surchargeTypeForEdu,
      isRuralRegion: input.isRuralRegion,
    }
  );

  const totalTax = acquisitionTax + additional.ruralSpecialTax + additional.localEducationTax;

  // ── Step 8: 감면 적용 — 중복배제 패턴 (조특법 §127②) ──
  // 후보 감면 배열에 각 감면을 독립 계산 후 푸시 → 납세자 유리 1건 선택

  interface ReductionCandidate {
    amount: number;
    type: "first_home" | "self_cultivation";
    legalBasis: string;
    label: string;
  }
  const reductionCandidates: ReductionCandidate[] = [];

  // 후보 1: 생애최초 감면 (§36의3)
  // [P4-3] 소형주택(isSmallHouseFirstHome) 시 한도 300만 / 일반 시 200만
  const firstHomeInfo = surchargeDecision.firstHomeReduction;
  if (firstHomeInfo?.isEligible) {
    const maxReduction = input.isSmallHouseFirstHome
      ? ACQUISITION_CONST.FIRST_HOME_MAX_REDUCTION_SMALL  // 300만 (§36의3①1호)
      : ACQUISITION_CONST.FIRST_HOME_MAX_REDUCTION;        // 200만 (§36의3①2호)
    const amount = Math.min(acquisitionTax, maxReduction);
    reductionCandidates.push({
      amount,
      type: "first_home",
      legalBasis: ACQUISITION.FIRST_HOME_REDUCTION,
      label: input.isSmallHouseFirstHome ? "생애최초 감면 (소형주택 300만 한도)" : "생애최초 감면",
    });
  }

  // 후보 2: [P2-5] 자경농지 50% 감면 (지특법 §6)
  const selfCultivResult = assessSelfCultivationReduction({
    isSelfCultivatedFarmer: input.isSelfCultivatedFarmer,
    farmingYears: input.farmingYears,
    farmlandArea: input.farmlandArea,
    farmlandLocationDistance: input.farmlandLocationDistance,
    acquisitionTax,
    propertyType: effectiveInput.propertyType,
    acquisitionCause: effectiveInput.acquisitionCause,
  });

  if (selfCultivResult.isEligible) {
    reductionCandidates.push({
      amount: selfCultivResult.reductionAmount,
      type: "self_cultivation",
      legalBasis: ACQUISITION.SELF_CULTIVATION_REDUCTION,
      label: "자경농지 감면 (50%)",
    });
  }

  // 납세자 유리 1건 선택 (조특법 §127②)
  const bestReduction = reductionCandidates.reduce(
    (best, c) => (c.amount >= best.amount ? c : best),
    { amount: 0, type: "first_home" as "first_home" | "self_cultivation", legalBasis: "", label: "" }
  );

  const reductionAmount = bestReduction.amount;
  const reductionType = reductionAmount > 0 ? bestReduction.type : undefined;
  const totalTaxAfterReduction = Math.max(0, totalTax - reductionAmount);

  // 자경농지 감면 경고 반영
  if (selfCultivResult.isEligible) {
    warnings.push(...selfCultivResult.warnings);
  }

  // ── 계산 과정 정리 (결과 UI 상세 표시용) ──
  steps.push(
    {
      label: "과세표준",
      formula: taxBaseResult.method === "actual_price" || taxBaseResult.method === "recognized_market"
        ? "신고가액 (천원 미만 절사)"
        : "시가표준액 (천원 미만 절사)",
      amount: taxBase,
      legalBasis: ACQUISITION.TAX_BASE,
    },
    {
      label: "취득세 본세",
      formula: corpSurchargeResult.isSurcharged
        ? `과세표준 × ${corpSurchargeResult.surchargeType} 중과세율 ${(finalRate * 100).toFixed(1)}%`
        : surchargeDecision.isSurcharged
          ? `과세표준 × 중과세율 ${(finalRate * 100).toFixed(1)}%`
          : specialRateResult.isApplied
            ? `과세표준 × §15 세율특례 ${(finalRate * 100).toFixed(4).replace(/\.?0+$/, "")}%`
            : basicRateDecision.rateType === "linear_interpolation"
              ? `과세표준 × 선형보간세율 ${(basicRateDecision.appliedRate * 100).toFixed(4).replace(/\.?0+$/, "")}% (6~9억 구간, 지방세법 §11①8)`
              : `과세표준 × ${(finalRate * 100).toFixed(1)}%`,
      amount: acquisitionTax,
      legalBasis: corpSurchargeResult.isSurcharged
        ? corpSurchargeResult.legalBasis[0]
        : surchargeDecision.isSurcharged
          ? ACQUISITION.SURCHARGE
          : specialRateResult.isApplied
            ? specialRateResult.legalBasis
            : ACQUISITION.BASIC_RATE,
    },
  );
  if (additional.ruralSpecialTax > 0) {
    steps.push({
      label: "농어촌특별세",
      formula: `(적용세율 - 표준세율 2%) × 과세표준 × 10% (${ACQUISITION.RURAL_SPECIAL_TAX})`,
      amount: additional.ruralSpecialTax,
      legalBasis: ACQUISITION.RURAL_SPECIAL_TAX_RATE_BASIS,
    });
  }
  if (additional.localEducationTax > 0) {
    steps.push({
      label: "지방교육세",
      formula: "과세표준 × 표준세율 2% × 20% = 과세표준 × 0.4%",
      amount: additional.localEducationTax,
      legalBasis: ACQUISITION.LOCAL_EDUCATION_TAX,
    });
  }
  steps.push({
    label: "합계 납부세액 (감면 전)",
    formula: "취득세 + 농특세 + 지방교육세",
    amount: totalTax,
  });
  if (reductionAmount > 0) {
    steps.push({
      label: bestReduction.label,
      formula: reductionType === "self_cultivation"
        ? `취득세 본세 × 50% (${ACQUISITION.SELF_CULTIVATION_REDUCTION})`
        : `취득세 본세 × 100% (한도 ${ACQUISITION_CONST.FIRST_HOME_MAX_REDUCTION.toLocaleString()}원)`,
      amount: -reductionAmount,
      legalBasis: bestReduction.legalBasis,
    });
    steps.push({
      label: "감면 후 최종 납부세액",
      formula: `합계 − ${bestReduction.label}`,
      amount: totalTaxAfterReduction,
    });
  }

  // ── P2 상세 결과 구성 ──
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

  return {
    propertyType: input.propertyType,
    acquisitionCause: input.acquisitionCause,
    acquisitionValue: taxBase,

    taxBase,
    taxBaseMethod: taxBaseResult.method,

    appliedRate: finalRate,
    rateType: (() => {
      if (corpSurchargeResult.isSurcharged) return "surcharge_corporate";
      if (surchargeDecision.isSurcharged) {
        if (input.isLuxuryProperty) return "surcharge_luxury";
        if (input.acquiredBy === "corporation") return "surcharge_corporate";
        return "surcharge_regulated";
      }
      return basicRateDecision.rateType;
    })(),
    isSurcharged: corpSurchargeResult.isSurcharged || surchargeDecision.isSurcharged,
    surchargeReason: corpSurchargeResult.isSurcharged
      ? corpSurchargeResult.reason
      : surchargeDecision.surchargeReason,

    acquisitionTax,
    ruralSpecialTax: additional.ruralSpecialTax,
    localEducationTax: additional.localEducationTax,
    totalTax,

    reductionType,
    reductionAmount,
    totalTaxAfterReduction,

    // P1 중과 판정 상세 결과
    surchargeDetail: buildSurchargeDetail(surchargeDecision, resolvedHouseCount),

    // P2 상세 결과
    specialRateDetail,
    corpSurchargeDetail,
    selfCultivationReductionDetail,

    // 간주취득 판정 상세
    deemedDetail: deemedDetailResult,

    // P3 주택 수 자동 산정 결과
    houseCountDetail: houseCountDetail ? {
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
    } : undefined,

    burdenedGiftBreakdown,

    installmentFilingSchedule: timingResult.filingSchedule,

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
// 중과 판정 상세 빌더
// ============================================================

/**
 * 중과 판정 상세 결과를 AcquisitionTaxResult.surchargeDetail 형식으로 변환
 *
 * ExtendedSurchargeDecision의 내부 필드를 결과 타입의 surchargeDetail로 매핑.
 * giftExclusionReason은 문자열 패턴으로 enum 값을 추론:
 *   - "1세대 1주택자" 포함 → "one_house_household"
 *   - "이혼 재산분할" 포함 → "divorce_division"
 */
function buildSurchargeDetail(
  surchargeDecision: ExtendedSurchargeDecision,
  resolvedHouseCount: number,
): AcquisitionTaxResult["surchargeDetail"] {
  // 일시적 2주택 처분기한 연수: number를 1|2|3 union으로 변환
  const deadlineYears = surchargeDecision.temporaryTwoHouseDeadlineYears;
  const deadlineYearsTyped: 1 | 2 | 3 | undefined =
    deadlineYears === 1 || deadlineYears === 2 || deadlineYears === 3
      ? deadlineYears
      : undefined;

  // giftExclusionReason: 문자열 패턴 → enum 변환
  const rawGiftExclusion = surchargeDecision.giftExclusionReason;
  let giftExclusionReasonEnum: "one_house_household" | "divorce_division" | undefined;
  if (rawGiftExclusion) {
    if (rawGiftExclusion.includes("이혼 재산분할")) {
      giftExclusionReasonEnum = "divorce_division";
    } else if (rawGiftExclusion.includes("1세대 1주택자") || rawGiftExclusion.includes("1주택")) {
      giftExclusionReasonEnum = "one_house_household";
    }
  }

  // 모든 필드가 undefined이면 surchargeDetail 자체를 undefined로 반환
  const exceptions = surchargeDecision.exceptions ?? [];
  const hasAnyDetail =
    surchargeDecision.temporaryTwoHouseDeadlineDate !== undefined ||
    deadlineYearsTyped !== undefined ||
    surchargeDecision.preRegulationContractApplied !== undefined ||
    giftExclusionReasonEnum !== undefined ||
    exceptions.length > 0 ||
    resolvedHouseCount > 0;

  if (!hasAnyDetail) return undefined;

  return {
    temporaryTwoHouseDeadlineDate: surchargeDecision.temporaryTwoHouseDeadlineDate,
    temporaryTwoHouseDeadlineYears: deadlineYearsTyped,
    preRegulationContractApplied: surchargeDecision.preRegulationContractApplied,
    giftExclusionReason: giftExclusionReasonEnum,
    surchargeExceptions: exceptions.length > 0 ? exceptions : undefined,
    effectiveHouseCount: resolvedHouseCount > 0 ? resolvedHouseCount : undefined,
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
