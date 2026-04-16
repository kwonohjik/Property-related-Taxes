/**
 * 재산세 메인 통합 엔진 (Pure Engine)
 *
 * 2-레이어 아키텍처 Layer 2:
 *   DB 직접 호출 없음 — 세율 데이터는 매개변수로 전달
 *
 * 계산 순서:
 * 1. calcTaxBase()        — 공정시장가액비율 × 공시가격 → 천원 절사 (§110)
 * 2. calcHousingTax()     — 주택 누진세율 4구간 / 1세대1주택 특례 (§111①1, §111③)
 * 3. calcBuildingTax()    — 건축물 일반 0.25% / 골프·오락 4% (§111①2)
 * 4. applyTaxCap()        — 세부담상한 105·110·130% / 토지 150% (§122)
 * 5. calcSurtax()         — 지방교육세 20% + 도시지역분 0.14% + 지역자원시설세 (§151, §112, §146)
 * 6. calculatePropertyTax() — 메인 엔트리, 서브엔진 stub 포함
 *
 * ─── 종부세 연동 ───
 * export { PropertyTaxResult }
 *   taxBase       → 종부세 비율 안분 입력
 *   determinedTax → 종부세 재산세공제 입력
 */

import { applyRate, truncateToThousand } from "./tax-utils";
import { PROPERTY, PROPERTY_CONST, PROPERTY_CAL } from "./legal-codes";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import {
  calculateSeparateAggregateTax,
} from "./separate-aggregate-land";
import {
  calculateSeparateTax,
  isExcludedFromComprehensiveTax,
} from "./separate-taxation";
import {
  calculateComprehensiveAggregateTax,
  applyBurdenCap,
} from "./property-tax-comprehensive-aggregate";
import type {
  PropertyTaxInput,
  PropertyTaxResult,
  PropertySurtaxDetail,
  InstallmentInfo,
} from "./types/property.types";
import type { TaxRatesMap } from "@/lib/db/tax-rates";

// ============================================================
// DB 세율 조회 헬퍼 — 공정시장가액비율 (정부 매년 고시)
// ============================================================

/**
 * DB rates에서 공정시장가액비율 추출.
 * rates 미전달 또는 해당 키 없을 때는 내부 상수 fallback.
 */
function getFairMarketRatio(
  rates: TaxRatesMap | undefined,
  subCategory: "housing" | "land_building",
): number {
  if (!rates) return subCategory === "housing"
    ? PROPERTY_CONST.FAIR_MARKET_RATIO_HOUSING
    : PROPERTY_CONST.FAIR_MARKET_RATIO_LAND_BUILDING;

  const key = `property:fair_market_ratio:${subCategory}` as Parameters<TaxRatesMap["get"]>[0];
  const record = rates.get(key);
  const ratio = (record?.rateTable as Record<string, number> | undefined)?.ratio;

  return typeof ratio === "number"
    ? ratio
    : subCategory === "housing"
      ? PROPERTY_CONST.FAIR_MARKET_RATIO_HOUSING
      : PROPERTY_CONST.FAIR_MARKET_RATIO_LAND_BUILDING;
}

// ============================================================
// P1-04: calcTaxBase — 공정시장가액비율 적용 + 천원 절사
// ============================================================

/**
 * 재산세 과세표준 계산 (지방세법 §110)
 *
 * - 주택: 공시가격 × 60%
 * - 토지·건축물: 공시가격 × 70%
 * - 결과는 천원 미만 절사
 */
export function calcTaxBase(
  publishedPrice: number,
  objectType: PropertyTaxInput["objectType"],
  rates?: TaxRatesMap,
): { taxBase: number; fairMarketRatio: number; legalBasis: string } {
  if (publishedPrice < 0) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "공시가격은 0원 이상이어야 합니다.",
    );
  }

  const isHousing = objectType === "housing";
  // DB rates 우선, fallback → 내부 상수 (정부 매년 고시 대응)
  const fairMarketRatio = getFairMarketRatio(
    rates,
    isHousing ? "housing" : "land_building",
  );

  const legalBasis = isHousing
    ? PROPERTY.FAIR_MARKET_RATIO_HOUSING
    : PROPERTY.FAIR_MARKET_RATIO_LAND;

  const taxBase = truncateToThousand(applyRate(publishedPrice, fairMarketRatio));

  return { taxBase, fairMarketRatio, legalBasis };
}

// ============================================================
// P1-05: calcHousingTax — 주택 누진세율 (일반 / 1세대1주택 특례)
// ============================================================

/** 주택 세율 구간 */
interface HousingBracket {
  max?: number;
  rate: number;
  deduction: number;
}

/** 일반 주택 세율 4구간 (지방세법 §111①1) */
const HOUSING_GENERAL_BRACKETS: HousingBracket[] = [
  { max: 60_000_000,   rate: 0.001,  deduction: 0 },
  { max: 150_000_000,  rate: 0.0015, deduction: 30_000 },
  { max: 300_000_000,  rate: 0.0025, deduction: 180_000 },
  {                    rate: 0.004,  deduction: 630_000 },
];

/** 1세대1주택 특례 세율 4구간 (지방세법 §111③, 공시가격 9억 이하) */
const HOUSING_SPECIAL_BRACKETS: HousingBracket[] = [
  { max: 60_000_000,   rate: 0.0005, deduction: 0 },
  { max: 150_000_000,  rate: 0.001,  deduction: 30_000 },
  { max: 300_000_000,  rate: 0.002,  deduction: 180_000 },
  {                    rate: 0.0035, deduction: 630_000 },
];

function calcProgressiveHousingTax(taxBase: number, brackets: HousingBracket[]): number {
  for (const bracket of brackets) {
    if (bracket.max === undefined || taxBase <= bracket.max) {
      return applyRate(taxBase, bracket.rate) - bracket.deduction;
    }
  }
  const last = brackets[brackets.length - 1];
  return applyRate(taxBase, last.rate) - last.deduction;
}

/**
 * 주택 재산세 산출세액 계산
 *
 * @param taxBase      과세표준 (원)
 * @param publishedPrice 공시가격 — 특례 적용 여부 판정에 사용
 * @param isOneHousehold 1세대1주택 특례 신청 여부
 * @returns { tax, appliedRate, oneHouseSpecialApplied, legalBasis }
 */
export function calcHousingTax(
  taxBase: number,
  publishedPrice: number,
  isOneHousehold: boolean,
): {
  tax: number;
  appliedRate: number;
  oneHouseSpecialApplied: boolean;
  legalBasis: string;
} {
  // 특례 적용 조건: 1세대1주택 + 공시가격 9억 이하
  const canApplySpecial =
    isOneHousehold &&
    publishedPrice <= PROPERTY_CONST.ONE_HOUSE_SPECIAL_THRESHOLD;

  const brackets = canApplySpecial
    ? HOUSING_SPECIAL_BRACKETS
    : HOUSING_GENERAL_BRACKETS;

  const tax = calcProgressiveHousingTax(taxBase, brackets);

  // 적용 세율: 해당 과세표준 구간의 marginal rate
  let appliedRate = brackets[brackets.length - 1].rate;
  for (const bracket of brackets) {
    if (bracket.max === undefined || taxBase <= bracket.max) {
      appliedRate = bracket.rate;
      break;
    }
  }

  const legalBasis = canApplySpecial
    ? PROPERTY.ONE_HOUSE_SPECIAL
    : PROPERTY.TAX_RATE;

  return { tax, appliedRate, oneHouseSpecialApplied: canApplySpecial, legalBasis };
}

// ============================================================
// P1-06: calcBuildingTax — 건축물 세율
// ============================================================

/**
 * 건축물 재산세 산출세액 계산 (지방세법 §111①2)
 *
 * - 일반: 0.25%
 * - 골프장·고급오락장: 4%
 * - 공장 (도시지역 내): 0.5%
 */
export function calcBuildingTax(
  taxBase: number,
  buildingType: PropertyTaxInput["buildingType"] = "general",
): {
  tax: number;
  appliedRate: number;
  legalBasis: string;
} {
  let rate: number;
  let legalBasis: string;

  switch (buildingType) {
    case "golf_course":
    case "luxury":
      rate = PROPERTY_CONST.BUILDING_LUXURY_RATE;
      legalBasis = PROPERTY.TAX_RATE + " §111①2나 (골프장·고급오락장)";
      break;
    case "factory":
      rate = 0.005;
      legalBasis = PROPERTY.TAX_RATE + " §111①2다 (공장)";
      break;
    default:
      rate = PROPERTY_CONST.BUILDING_GENERAL_RATE;
      legalBasis = PROPERTY.TAX_RATE + " §111①2가 (일반)";
  }

  const tax = applyRate(taxBase, rate);
  return { tax, appliedRate: rate, legalBasis };
}

// ============================================================
// P1-07: applyTaxCap — 세부담상한
// ============================================================

/**
 * 세부담상한 적용 (지방세법 §122)
 *
 * - 주택: 공시가격 기준 3억/6억 구간별 105·110·130%
 * - 토지·건축물: 150%
 * - 전년도 세액 미입력 시: 상한 미적용 + warnings 추가
 *
 * @returns { determinedTax, capRate, warnings }
 */
export function applyTaxCap(
  calculatedTax: number,
  publishedPrice: number,
  objectType: PropertyTaxInput["objectType"],
  previousYearTax?: number,
): {
  determinedTax: number;
  taxCapRate: number;
  warnings: string[];
  legalBasis: string;
} {
  const warnings: string[] = [];

  if (previousYearTax === undefined || previousYearTax <= 0) {
    warnings.push(
      "전년도 납부세액 미입력으로 세부담상한(지방세법 §122)을 적용하지 않습니다. " +
      "정확한 계산을 위해 전년도 재산세 납부액을 입력하세요.",
    );
    return {
      determinedTax: calculatedTax,
      taxCapRate: 1,
      warnings,
      legalBasis: PROPERTY.TAX_CAP,
    };
  }

  let capRate: number;

  if (objectType === "housing") {
    if (publishedPrice <= PROPERTY_CONST.TAX_CAP_BRACKET_1) {
      capRate = PROPERTY_CONST.TAX_CAP_RATE_1;  // 105%
    } else if (publishedPrice <= PROPERTY_CONST.TAX_CAP_BRACKET_2) {
      capRate = PROPERTY_CONST.TAX_CAP_RATE_2;  // 110%
    } else {
      capRate = PROPERTY_CONST.TAX_CAP_RATE_3;  // 130%
    }
  } else {
    capRate = PROPERTY_CONST.TAX_CAP_RATE_LAND;  // 150%
  }

  const capLimit = Math.floor(previousYearTax * capRate);
  const determinedTax = Math.min(calculatedTax, capLimit);

  return { determinedTax, taxCapRate: capRate, warnings, legalBasis: PROPERTY.TAX_CAP };
}

// ============================================================
// P1-08: calcSurtax — 부가세 합산
// ============================================================

/** 지역자원시설세 누진 구간 (건축물 시가표준액 기준, 지방세법 §146②) */
const REGIONAL_RESOURCE_BRACKETS = [
  { max: 600_000_000,     rate: 0.00004, deduction: 0 },
  { max: 1_300_000_000,   rate: 0.00005, deduction: 6_000 },
  { max: 2_600_000_000,   rate: 0.00006, deduction: 19_000 },
  {                       rate: 0.00007, deduction: 45_000 },
];

function calcRegionalResourceTax(standardPrice: number): number {
  for (const bracket of REGIONAL_RESOURCE_BRACKETS) {
    if (bracket.max === undefined || standardPrice <= bracket.max) {
      return applyRate(standardPrice, bracket.rate) - bracket.deduction;
    }
  }
  const last = REGIONAL_RESOURCE_BRACKETS[REGIONAL_RESOURCE_BRACKETS.length - 1];
  return applyRate(standardPrice, last.rate) - last.deduction;
}

/**
 * 부가세 합산 계산 (지방세법 §151, §112, §146)
 *
 * @param determinedTax  확정 재산세 (세부담상한 적용 후)
 * @param taxBase        과세표준 (도시지역분 계산 기준)
 * @param publishedPrice 공시가격 (지역자원시설세 계산 기준 — 건축물)
 * @param objectType     물건 유형
 * @param isUrbanArea    도시지역 여부 (도시지역분 과세)
 * @returns { surtax, totalSurtax, legalBasis }
 */
export function calcSurtax(
  determinedTax: number,
  taxBase: number,
  publishedPrice: number,
  objectType: PropertyTaxInput["objectType"],
  isUrbanArea: boolean,
): {
  surtax: PropertySurtaxDetail;
  totalSurtax: number;
  legalBasis: string[];
} {
  // 지방교육세 = 재산세 × 20%
  const localEducationTax = applyRate(
    determinedTax,
    PROPERTY_CONST.LOCAL_EDUCATION_TAX_RATE,
  );

  // 도시지역분 = 과세표준 × 0.14% (도시지역 한정)
  const urbanAreaTax = isUrbanArea
    ? applyRate(taxBase, PROPERTY_CONST.URBAN_AREA_TAX_RATE)
    : 0;

  // 지역자원시설세 = 건축물 시가표준액 기준 누진 (건축물만 해당)
  const regionalResourceTax =
    objectType === "building"
      ? Math.max(0, calcRegionalResourceTax(publishedPrice))
      : 0;

  const surtax: PropertySurtaxDetail = {
    localEducationTax,
    urbanAreaTax,
    regionalResourceTax,
  };

  const totalSurtax = localEducationTax + urbanAreaTax + regionalResourceTax;

  const legalBasis: string[] = [PROPERTY.LOCAL_EDUCATION_TAX];
  if (isUrbanArea) legalBasis.push(PROPERTY.URBAN_AREA_TAX);
  if (objectType === "building") legalBasis.push(PROPERTY.REGIONAL_RESOURCE_TAX);

  return { surtax, totalSurtax, legalBasis };
}

// ============================================================
// P1-09: calculatePropertyTax — 메인 엔트리
// ============================================================

/**
 * 재산세 종합 계산 (Layer 2 Pure Engine)
 *
 * 서브엔진(과세대상 판정·토지분류·주택범위)은 Phase P2~P5에서 구현됩니다.
 * 현재는 objectType을 직접 입력받아 계산합니다.
 *
 * ─── 종부세 연동 ───
 * 반환값의 taxBase, determinedTax를 종부세 엔진에 전달합니다.
 *
 * @param input  재산세 계산 입력
 * @returns PropertyTaxResult (taxBase, determinedTax 포함)
 */
export function calculatePropertyTax(
  input: PropertyTaxInput,
  rates?: TaxRatesMap,
): PropertyTaxResult {
  const warnings: string[] = [];
  const legalBasis: string[] = [PROPERTY.TAX_BASE, PROPERTY.TAX_BASE_DATE];
  const targetDate =
    input.targetDate ?? new Date().toISOString().slice(0, 10);

  // ── Step 1: 과세표준 계산 (DB rates 전달 → 공정시장가액비율 DB 우선) ──
  const { taxBase, fairMarketRatio, legalBasis: taxBaseLegal } =
    calcTaxBase(input.publishedPrice, input.objectType, rates);
  legalBasis.push(taxBaseLegal);

  // ── Step 2: 세율 적용 ──
  let calculatedTax: number;
  let appliedRate: number;
  let oneHouseSpecialApplied = false;

  switch (input.objectType) {
    case "housing": {
      const housingResult = calcHousingTax(
        taxBase,
        input.publishedPrice,
        input.isOneHousehold ?? false,
      );
      calculatedTax = housingResult.tax;
      appliedRate = housingResult.appliedRate;
      oneHouseSpecialApplied = housingResult.oneHouseSpecialApplied;
      legalBasis.push(housingResult.legalBasis);
      break;
    }

    case "building": {
      if (!input.buildingType) {
        warnings.push(
          "건축물 유형(buildingType)이 입력되지 않아 일반 세율(0.25%)을 적용합니다.",
        );
      }
      const buildingResult = calcBuildingTax(taxBase, input.buildingType);
      calculatedTax = buildingResult.tax;
      appliedRate = buildingResult.appliedRate;
      legalBasis.push(buildingResult.legalBasis);
      break;
    }

    case "land": {
      // ── P4 연결: 별도합산과세대상 (지방세법 §106①2호) ──
      if (input.landTaxType === "separate_aggregate") {
        if (!input.separateAggregateItem) {
          throw new TaxCalculationError(
            TaxErrorCode.INVALID_INPUT,
            "별도합산(separate_aggregate) 계산 시 separateAggregateItem이 필요합니다.",
          );
        }
        // 단일 필지 → calculateSeparateAggregateTax로 위임
        const sepResult = calculateSeparateAggregateTax({
          taxpayerId: "single",
          targetYear: new Date(targetDate).getFullYear(),
          landList: [{ ...input.separateAggregateItem, taxBaseDate: targetDate }],
          previousYearTax: input.previousYearTax,
        });

        warnings.push(...sepResult.warnings);
        legalBasis.push(...sepResult.legalBasis);

        // 초과분이 있으면 종합합산 이관 경고
        if (sepResult.totalExcessOfficialValue > 0) {
          warnings.push(
            `기준면적 초과분 공시지가 ${sepResult.totalExcessOfficialValue.toLocaleString()}원은 ` +
            "종합합산과세대상으로 이관됩니다. 인별 합산 계산 시 별도 처리가 필요합니다.",
          );
        }

        calculatedTax = sepResult.grossTax;
        appliedRate = 0; // 누진세율이므로 단일 세율 없음
        const determinedTaxSep = sepResult.taxAfterCap;
        const capRateSep = sepResult.appliedCapRate ?? 1;

        // 부가세
        const surtaxSep = calcSurtax(
          determinedTaxSep,
          sepResult.taxBase,
          input.publishedPrice,
          input.objectType,
          input.isUrbanArea ?? false,
        );
        legalBasis.push(...surtaxSep.legalBasis);
        const installmentSep = calcInstallment(determinedTaxSep, input.objectType);
        const totalPayableSep = determinedTaxSep + surtaxSep.totalSurtax;

        return {
          publishedPrice: input.publishedPrice,
          fairMarketRatio: sepResult.fairMarketValueRatio,
          taxBase: sepResult.taxBase,
          appliedRate,
          calculatedTax,
          calculatedTaxBeforeCap: sepResult.grossTax,
          taxCapRate: capRateSep,
          determinedTax: determinedTaxSep,
          surtax: surtaxSep.surtax,
          totalSurtax: surtaxSep.totalSurtax,
          totalPayable: totalPayableSep,
          installment: installmentSep,
          oneHouseSpecialApplied: false,
          legalBasis: [...new Set(legalBasis)],
          warnings,
          targetDate,
        };
      }

      // ── P5 연결: 분리과세대상 (지방세법 §106①3호) ──
      if (input.landTaxType === "separated") {
        const sepInput = {
          assessedValue: input.publishedPrice,
          ...(input.separateTaxationItem ?? {}),
        };
        const sepResult = calculateSeparateTax(sepInput);

        warnings.push(...sepResult.warnings);
        if (sepResult.reasoning.legalBasis) {
          legalBasis.push(sepResult.reasoning.legalBasis);
        }
        legalBasis.push(PROPERTY.SEPARATE.EXCLUDE_COMPREHENSIVE);

        if (!sepResult.isApplicable) {
          throw new TaxCalculationError(
            TaxErrorCode.INVALID_INPUT,
            "분리과세 대상 요건을 충족하지 않습니다. " +
            "종합합산 또는 별도합산 과세 유형으로 재입력하세요.",
          );
        }

        const separatedTaxBase = sepResult.taxBase ?? 0;
        const separatedTax = sepResult.calculatedTax ?? 0;
        const isExcluded = isExcludedFromComprehensiveTax(sepResult);

        // 세부담상한 (150%)
        const capResult = applyTaxCap(
          separatedTax,
          input.publishedPrice,
          input.objectType,
          input.previousYearTax,
        );
        warnings.push(...capResult.warnings);
        legalBasis.push(capResult.legalBasis);

        // 부가세
        const surtaxSep = calcSurtax(
          capResult.determinedTax,
          separatedTaxBase,
          input.publishedPrice,
          input.objectType,
          input.isUrbanArea ?? false,
        );
        legalBasis.push(...surtaxSep.legalBasis);
        const installmentSep = calcInstallment(capResult.determinedTax, input.objectType);
        const totalPayableSep = capResult.determinedTax + surtaxSep.totalSurtax;

        if (isExcluded) {
          warnings.push(
            "분리과세 대상 토지는 종합부동산세 과세 대상에서 제외됩니다 (종부세법 §11).",
          );
        }

        return {
          publishedPrice: input.publishedPrice,
          fairMarketRatio: sepResult.fairMarketRatio ?? 0.70,
          taxBase: separatedTaxBase,
          appliedRate: sepResult.appliedRate ?? 0,
          calculatedTax: separatedTax,
          calculatedTaxBeforeCap: separatedTax,
          taxCapRate: capResult.taxCapRate,
          determinedTax: capResult.determinedTax,
          surtax: surtaxSep.surtax,
          totalSurtax: surtaxSep.totalSurtax,
          totalPayable: totalPayableSep,
          installment: installmentSep,
          oneHouseSpecialApplied: false,
          legalBasis: [...new Set(legalBasis)],
          warnings,
          targetDate,
        };
      }

      // ── P3 연결: 종합합산과세대상 (지방세법 §106①1호) ──
      if (input.landTaxType === "comprehensive_aggregate") {
        // 공시지가 × 70% → 천원 절사 (§110, §113 인별 전국합산 단일 필지 기준)
        const {
          taxBase: comprehensiveTaxBase,
          fairMarketRatio,
          legalBasis: taxBaseLegal,
        } = calcTaxBase(input.publishedPrice, "land", rates);
        legalBasis.push(taxBaseLegal);
        const grossTaxComp = calculateComprehensiveAggregateTax(comprehensiveTaxBase);
        const { taxAfterCap: determinedTaxComp, appliedCapRate: capRateComp } = applyBurdenCap(
          grossTaxComp,
          input.previousYearTax,
        );

        legalBasis.push(PROPERTY_CAL.RATE_COMPREHENSIVE);
        if (capRateComp !== undefined) {
          warnings.push(
            `세부담상한(150%) 적용: 산출세액 ${grossTaxComp.toLocaleString()}원 → ${determinedTaxComp.toLocaleString()}원`,
          );
        }

        const surtaxComp = calcSurtax(
          determinedTaxComp,
          comprehensiveTaxBase,
          input.publishedPrice,
          input.objectType,
          input.isUrbanArea ?? false,
        );
        legalBasis.push(...surtaxComp.legalBasis);
        const installmentComp = calcInstallment(determinedTaxComp, input.objectType);
        const totalPayableComp = determinedTaxComp + surtaxComp.totalSurtax;

        return {
          publishedPrice: input.publishedPrice,
          fairMarketRatio,
          taxBase: comprehensiveTaxBase,
          appliedRate: 0, // 누진세율이므로 단일 세율 없음
          calculatedTax: grossTaxComp,
          calculatedTaxBeforeCap: grossTaxComp,
          taxCapRate: capRateComp ?? 1,
          determinedTax: determinedTaxComp,
          surtax: surtaxComp.surtax,
          totalSurtax: surtaxComp.totalSurtax,
          totalPayable: totalPayableComp,
          installment: installmentComp,
          oneHouseSpecialApplied: false,
          legalBasis: [...new Set(legalBasis)],
          warnings,
          targetDate,
        };
      }

      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        "토지 재산세 계산 시 landTaxType을 지정해야 합니다: " +
        "'comprehensive_aggregate'(종합합산) | 'separate_aggregate'(별도합산) | 'separated'(분리과세)",
      );
    }

    case "vessel":
    case "aircraft": {
      // 선박·항공기: 시가표준액 × 0.3% (지방세법 §111①4)
      calculatedTax = applyRate(taxBase, 0.003);
      appliedRate = 0.003;
      legalBasis.push(PROPERTY.TAX_RATE + " §111①4 (선박·항공기)");
      break;
    }

    default: {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        `지원하지 않는 물건 유형입니다: ${input.objectType}`,
      );
    }
  }

  // ── Step 3: 세부담상한 ──
  const capResult = applyTaxCap(
    calculatedTax,
    input.publishedPrice,
    input.objectType,
    input.previousYearTax,
  );
  warnings.push(...capResult.warnings);
  legalBasis.push(capResult.legalBasis);

  const calculatedTaxBeforeCap = calculatedTax;
  const determinedTax = capResult.determinedTax;

  // ── Step 4: 부가세 합산 ──
  const surtaxResult = calcSurtax(
    determinedTax,
    taxBase,
    input.publishedPrice,
    input.objectType,
    input.isUrbanArea ?? false,
  );
  legalBasis.push(...surtaxResult.legalBasis);

  // ── Step 5: 분납 안내 ──
  const installment = calcInstallment(determinedTax, input.objectType);

  // ── Step 6: 최종 합산 ──
  const totalPayable = determinedTax + surtaxResult.totalSurtax;

  return {
    publishedPrice: input.publishedPrice,
    fairMarketRatio,
    taxBase,
    appliedRate,
    calculatedTax,
    calculatedTaxBeforeCap,
    taxCapRate: capResult.taxCapRate,
    determinedTax,
    surtax: surtaxResult.surtax,
    totalSurtax: surtaxResult.totalSurtax,
    totalPayable,
    installment,
    oneHouseSpecialApplied,
    legalBasis: [...new Set(legalBasis)],
    warnings,
    targetDate,
  };
}

// ============================================================
// 내부 유틸 — 분납 계산 (지방세법 §115)
// ============================================================

function calcInstallment(
  determinedTax: number,
  objectType: PropertyTaxInput["objectType"],
): InstallmentInfo {
  // 지방세법 §115①: 주택 20만원 초과, 토지·건축물 등 비주택 250만원 초과 시 분납 가능
  const threshold =
    objectType === "housing"
      ? PROPERTY_CONST.INSTALLMENT_THRESHOLD
      : PROPERTY_CONST.INSTALLMENT_THRESHOLD_NON_HOUSE;

  const eligible = determinedTax > threshold;
  if (!eligible) {
    return { eligible: false, firstPayment: determinedTax, secondPayment: 0 };
  }
  // 균등 분납: 홀수 원은 1차에 포함
  const secondPayment = Math.floor(determinedTax / 2);
  const firstPayment = determinedTax - secondPayment;
  return { eligible: true, firstPayment, secondPayment };
}
