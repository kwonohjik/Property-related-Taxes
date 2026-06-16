/**
 * 재산세 메인 통합 엔진 (Pure Engine)
 *
 * 2-레이어 아키텍처 Layer 2:
 *   DB 직접 호출 없음 — 세율 데이터는 매개변수로 전달
 *
 * 계산 순서:
 * 1. calcTaxBase()        — 공정시장가액비율 × 공시가격 (§110, 시행령 §109 — 2026 1세대1주택 43~45%)
 * 2. calcHousingTax()     — 주택 누진세율 4구간 / 1세대1주택 특례 (§111①1, §111③)
 * 3. calcBuildingTax()    — 건축물 일반 0.25% / 골프·오락 4% (§111①2)
 * 4. applyTaxCap()        — 세부담상한 150% (주택 미적용 — §122 단서)
 * 5. calcSurtax()         — 지방교육세 20% + 도시지역분 0.14% + 지역자원시설세 (§151, §112, §146③)
 * 6. calculatePropertyTax() — 메인 엔트리, 서브엔진 stub 포함
 *
 * ─── 종부세 연동 ───
 * export { PropertyTaxResult }
 *   taxBase       → 종부세 비율 안분 입력
 *   determinedTax → 종부세 재산세공제 입력
 */

import { applyRate } from "./tax-utils";
import { calcSurtax, calcInstallment } from "./property-tax-surtax";
import { PROPERTY, PROPERTY_CONST, PROPERTY_CAL, COMPREHENSIVE_LAND } from "./legal-codes";
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
import { resolveTaxpayer, buildTaxpayerOutcome, selectTaxpayerOutcome } from "./property-taxpayer";
import type {
  PropertyTaxInput,
  PropertyTaxResult,
} from "./types/property.types";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import { getCurrentPropertyRateSet } from "./data/property-rate-history";
import { getPropertyRateSet } from "./data/property-rate-history";
import type { PropertyRateSet } from "./data/property-rate-history";
import { resolveBasisTax } from "./property-tax-recompute";
import { buildCapEcho } from "./property-tax-cap-echo";

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
 * 재산세 과세표준 계산 (지방세법 §110, 시행령 §109)
 *
 * - 주택: 공시가격 × 60%
 *   · 2026년 과세 1세대1주택: 공시가격 구간별 43%(3억 이하)·44%(6억 이하)·45%(6억 초과)
 *     — 시행령 §109①2호 단서. 공시가격 9억 초과 주택 포함 (특례세율 §111의2와 별개)
 * - 토지·건축물: 공시가격 × 70%
 * - 지방세법상 과세표준 절사 규정 없음 — 원 단위
 */
export function calcTaxBase(
  publishedPrice: number,
  objectType: PropertyTaxInput["objectType"],
  rates?: TaxRatesMap,
  opts?: { isOneHousehold?: boolean; taxYear?: number },
): { taxBase: number; fairMarketRatio: number; legalBasis: string } {
  if (publishedPrice < 0) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "공시가격은 0원 이상이어야 합니다.",
    );
  }

  const isHousing = objectType === "housing";

  // 시행령 §109①2호 단서 — 2022년 납세의무 성립 1세대1주택 단일 비율 45% (제32747호, 9억 초과 포함)
  if (
    isHousing &&
    opts?.isOneHousehold === true &&
    opts.taxYear === PROPERTY_CONST.ONE_HOUSE_FMR_2022_YEAR
  ) {
    const fairMarketRatio = PROPERTY_CONST.ONE_HOUSE_FMR_2022_RATIO;
    return {
      taxBase: applyRate(publishedPrice, fairMarketRatio),
      fairMarketRatio,
      legalBasis: PROPERTY.FAIR_MARKET_RATIO_ONE_HOUSE,
    };
  }

  // 시행령 §109①2호 단서 — 2026년 납세의무 성립 1세대1주택 구간별 비율 (법령 명시값, DB보다 우선)
  if (
    isHousing &&
    opts?.isOneHousehold === true &&
    opts.taxYear === PROPERTY_CONST.ONE_HOUSE_FMR_YEAR
  ) {
    const fairMarketRatio =
      publishedPrice <= PROPERTY_CONST.ONE_HOUSE_FMR_BRACKET_1
        ? PROPERTY_CONST.ONE_HOUSE_FMR_RATIO_1
        : publishedPrice <= PROPERTY_CONST.ONE_HOUSE_FMR_BRACKET_2
          ? PROPERTY_CONST.ONE_HOUSE_FMR_RATIO_2
          : PROPERTY_CONST.ONE_HOUSE_FMR_RATIO_3;
    return {
      taxBase: applyRate(publishedPrice, fairMarketRatio),
      fairMarketRatio,
      legalBasis: PROPERTY.FAIR_MARKET_RATIO_ONE_HOUSE,
    };
  }

  // DB rates 우선, fallback → 내부 상수 (정부 매년 고시 대응)
  const fairMarketRatio = getFairMarketRatio(
    rates,
    isHousing ? "housing" : "land_building",
  );

  const legalBasis = isHousing
    ? PROPERTY.FAIR_MARKET_RATIO_HOUSING
    : PROPERTY.FAIR_MARKET_RATIO_LAND;

  const taxBase = applyRate(publishedPrice, fairMarketRatio);

  return { taxBase, fairMarketRatio, legalBasis };
}

// ============================================================
// P1-04b: applyHousingTaxBaseCap — 주택 과세표준상한제 (§110③)
// ============================================================

/**
 * 주택 과세표준상한제 (지방세법 §110③, 시행령 §109의2)
 *
 * 과세표준상한액 = 직전연도 과세표준 상당액 + (당해 과세표준 × 과세표준상한율 5%)
 *   · 직전연도 과세표준 상당액 = 직전 시가표준액 × 당해 공정시장가액비율 (시행령 §109의2①)
 *   · 직전 시가표준액 없으면 당해 과세표준 동치 → 상한 미작동 (시행령 §109의2① 단서)
 * 주택의 당해 과세표준이 상한액보다 크면 상한액으로 한다.
 *
 * @param taxBase                 당해연도 과세표준 (calcTaxBase 산정값)
 * @param fairMarketRatio         당해 공정시장가액비율 (calcTaxBase 반환값 — 동일 비율 재사용)
 * @param priorYearPublishedPrice 직전연도 시가표준액 (미입력/음수 시 상한 미작동)
 */
export function applyHousingTaxBaseCap(
  taxBase: number,
  fairMarketRatio: number,
  priorYearPublishedPrice?: number,
): {
  cappedTaxBase: number;
  taxBaseBeforeCap: number;
  taxBaseCapApplied: boolean;
  taxBaseCapLimit: number;
  priorYearTaxBaseEquivalent: number;
  taxBaseCapRate: number;
} {
  const priorYearTaxBaseEquivalent =
    priorYearPublishedPrice != null && priorYearPublishedPrice >= 0
      ? applyRate(priorYearPublishedPrice, fairMarketRatio)
      : taxBase; // 직전 미입력 → 당해값 동치 (상한 미작동)

  const capIncrement = applyRate(taxBase, PROPERTY_CONST.TAX_BASE_CAP_RATE);
  const taxBaseCapLimit = priorYearTaxBaseEquivalent + capIncrement;
  const cappedTaxBase = Math.min(taxBase, taxBaseCapLimit);

  return {
    cappedTaxBase,
    taxBaseBeforeCap: taxBase,
    taxBaseCapApplied: cappedTaxBase < taxBase,
    taxBaseCapLimit,
    priorYearTaxBaseEquivalent,
    taxBaseCapRate: PROPERTY_CONST.TAX_BASE_CAP_RATE,
  };
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
 * 주택 일반 표준세율 적용 구간(세율·누진공제) 조회 — 종부세 카드 산식 표시용(single-source).
 * 종부세 §4의3 재산세 안분은 표준세율(일반) 기준이므로 일반 구간만 노출한다.
 * UI는 이 헬퍼로 "과표 × 세율 − 누진공제" 라벨을 표시(dual-truth 차단 — 세율 하드코딩 금지).
 */
export function getHousingStandardRateBracket(
  taxBase: number,
): { rate: number; deduction: number } {
  for (const bracket of HOUSING_GENERAL_BRACKETS) {
    if (bracket.max === undefined || taxBase <= bracket.max) {
      return { rate: bracket.rate, deduction: bracket.deduction };
    }
  }
  const last = HOUSING_GENERAL_BRACKETS[HOUSING_GENERAL_BRACKETS.length - 1];
  return { rate: last.rate, deduction: last.deduction };
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
  rateSet: PropertyRateSet = getCurrentPropertyRateSet(),
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
      rate = rateSet.buildingLuxury;
      legalBasis = PROPERTY.BUILDING_LUXURY_RATE;
      break;
    case "factory":
      rate = rateSet.buildingFactory;
      legalBasis = PROPERTY.BUILDING_FACTORY_RATE;
      break;
    default:
      rate = rateSet.buildingGeneral;
      legalBasis = PROPERTY.BUILDING_GENERAL_RATE;
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
 * - 토지·건축물·선박·항공기: 직전 연도 재산세액 상당액의 150%
 * - 주택: 적용하지 아니함 (§122 단서 — 주택 세부담상한 폐지, 과세표준상한제 §110의2로 대체)
 * - 전년도 세액 미입력 시 (비주택): 상한 미적용 + warnings 추가
 *
 * @returns { determinedTax, taxCapRate, warnings }
 */
export function applyTaxCap(
  calculatedTax: number,
  objectType: PropertyTaxInput["objectType"],
  previousYearTax?: number,
): {
  determinedTax: number;
  taxCapRate: number;
  warnings: string[];
  legalBasis: string;
} {
  const warnings: string[] = [];

  // §122 단서: 주택은 세부담상한 적용 배제
  if (objectType === "housing") {
    if (previousYearTax !== undefined && previousYearTax > 0) {
      warnings.push(
        `주택은 세부담상한이 적용되지 않습니다 (${PROPERTY.TAX_CAP} 단서). ` +
        "입력한 전년도 납부세액은 계산에 사용되지 않습니다.",
      );
    }
    return {
      determinedTax: calculatedTax,
      taxCapRate: 1,
      warnings,
      legalBasis: PROPERTY.TAX_CAP,
    };
  }

  if (previousYearTax === undefined || previousYearTax <= 0) {
    warnings.push(
      `전년도 납부세액 미입력으로 세부담상한(${PROPERTY.TAX_CAP})을 적용하지 않습니다. ` +
      "정확한 계산을 위해 전년도 재산세 납부액을 입력하세요.",
    );
    return {
      determinedTax: calculatedTax,
      taxCapRate: 1,
      warnings,
      legalBasis: PROPERTY.TAX_CAP,
    };
  }

  const capRate = PROPERTY_CONST.TAX_CAP_RATE_LAND; // 150%
  const capLimit = applyRate(previousYearTax, capRate);
  const determinedTax = Math.min(calculatedTax, capLimit);

  return { determinedTax, taxCapRate: capRate, warnings, legalBasis: PROPERTY.TAX_CAP };
}

// ============================================================
// P1-08: calcSurtax — 부가세 합산 (property-tax-surtax.ts 로 분리)
// ============================================================

export { calcSurtax }; // property-tax-surtax.ts 에서 import — 하위 호환 re-export

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
  // 미입력 시 과세기준일 6월 1일(지방세법 §114) — 현재 연도 기준.
  //   taxYear는 연도만 사용하므로 FMR 등 계산은 불변, 표시·기준일만 정확화.
  const targetDate =
    input.targetDate ?? `${new Date().getFullYear()}-06-01`;
  const taxYear = parseInt(targetDate.slice(0, 4), 10);

  // ── Step 0: 납세의무자 판정 (지방세법 §107) — taxpayerInfo 입력 시에만 (미입력 시 계산 100% 불변) ──
  const taxpayerResult = resolveTaxpayer(input);
  const coShares = input.taxpayerInfo?.coOwnershipShares;

  // ── Step 1: 과세표준 계산 (DB rates 전달 → 공정시장가액비율 DB 우선,
  //            2026 1세대1주택은 시행령 §109①2호 단서 구간별 비율 우선) ──
  const { taxBase, fairMarketRatio, legalBasis: taxBaseLegal } =
    calcTaxBase(input.publishedPrice, input.objectType, rates, {
      isOneHousehold: input.isOneHousehold,
      taxYear,
    });
  legalBasis.push(taxBaseLegal);

  // ── Step 1.5: 주택 과세표준상한제 (지방세법 §110③) — housing 전용 ──
  //   세율 과표·도시지역분·결과 taxBase·종부세 export 모두 effectiveTaxBase(상한 적용 후)로 일관.
  //   단, 9억 특례 판정용 publishedPrice는 원본 유지(calcHousingTax 2번째 인자).
  let effectiveTaxBase = taxBase;
  let taxBaseCap: ReturnType<typeof applyHousingTaxBaseCap> | undefined;
  if (input.objectType === "housing") {
    taxBaseCap = applyHousingTaxBaseCap(
      taxBase,
      fairMarketRatio,
      input.priorYearPublishedPrice,
    );
    effectiveTaxBase = taxBaseCap.cappedTaxBase;
    if (taxBaseCap.taxBaseCapApplied) legalBasis.push(PROPERTY.TAX_BASE_CAP);
  }

  // ── Step 2: 세율 적용 ──
  let calculatedTax: number;
  let appliedRate: number;
  let oneHouseSpecialApplied = false;

  switch (input.objectType) {
    case "housing": {
      const housingResult = calcHousingTax(
        effectiveTaxBase,
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
          ...buildCapEcho(input, input.previousYearTax, taxYear - 1),
          ...buildTaxpayerOutcome(taxpayerResult, coShares, determinedTaxSep, totalPayableSep),
        };
      }

      // ── P5 연결: 분리과세대상 (지방세법 §106①3호) ──
      if (input.landTaxType === "separated") {
        const sepInput = {
          assessedValue: input.publishedPrice,
          ...(input.separateTaxationItem ?? {}),
        };
        const sepResult = calculateSeparateTax(sepInput, getPropertyRateSet(taxYear));

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
            `분리과세 대상 토지는 종합부동산세 과세 대상에서 제외됩니다 (${COMPREHENSIVE_LAND.AGGREGATE_TAXPAYER}).`,
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
          ...buildCapEcho(input, input.previousYearTax, taxYear - 1),
          ...buildTaxpayerOutcome(taxpayerResult, coShares, capResult.determinedTax, totalPayableSep),
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
        const basisComp = resolveBasisTax(input, taxYear - 1);
        const { taxAfterCap: determinedTaxComp, appliedCapRate: capRateComp } = applyBurdenCap(
          grossTaxComp,
          basisComp,
        );

        legalBasis.push(PROPERTY_CAL.RATE_COMPREHENSIVE);
        if (capRateComp !== undefined) {
          warnings.push(
            `세부담상한(150%) 적용: 산출세액 ${grossTaxComp.toLocaleString()} → ${determinedTaxComp.toLocaleString()}`,
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
          ...buildCapEcho(input, basisComp, taxYear - 1),
          ...buildTaxpayerOutcome(taxpayerResult, coShares, determinedTaxComp, totalPayableComp),
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
      // 선박·항공기: 시가표준액 × 0.3% (지방세법 §111①4호 — 역사 세율표)
      const vesselRate = getCurrentPropertyRateSet().vesselAircraft;
      calculatedTax = applyRate(taxBase, vesselRate);
      appliedRate = vesselRate;
      legalBasis.push(PROPERTY.VESSEL_AIRCRAFT_RATE);
      break;
    }

    default: {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        `지원하지 않는 물건 유형입니다: ${input.objectType}`,
      );
    }
  }

  // ── Step 3: 세부담상한 (주택은 §122 단서로 미적용) ──
  const basisMain = resolveBasisTax(input, taxYear - 1);
  const capResult = applyTaxCap(
    calculatedTax,
    input.objectType,
    basisMain,
  );
  warnings.push(...capResult.warnings);
  legalBasis.push(capResult.legalBasis);

  const calculatedTaxBeforeCap = calculatedTax;
  const determinedTax = capResult.determinedTax;

  // 주택 건물분 소방분 과세표준 = 건물분가액 × FMR (§146④ 단서).
  //   fairMarketRatio는 calcTaxBase(Step 1) 반환값 — §110③ 상한과 무관(ratio 자체 불변).
  const housingFireServiceTaxBase =
    input.objectType === "housing" && input.housingBuildingValue != null
      ? applyRate(input.housingBuildingValue, fairMarketRatio)
      : undefined;

  // ── Step 4: 부가세 합산 (도시지역분은 상한 적용 후 effectiveTaxBase 기준) ──
  const surtaxResult = calcSurtax(
    determinedTax,
    effectiveTaxBase,
    input.publishedPrice,
    input.objectType,
    input.isUrbanArea ?? false,
    input.fireHazardClass, // 화재위험 중과 (building 외에는 calcSurtax 내부 게이트로 무영향)
    housingFireServiceTaxBase, // 주택 건물분 소방분 과세표준 (§146④ 단서)
  );
  legalBasis.push(...surtaxResult.legalBasis);

  // ── Step 5: 분납 안내 ──
  const installment = calcInstallment(determinedTax, input.objectType);

  // ── Step 6: 최종 합산 ──
  const totalPayable = determinedTax + surtaxResult.totalSurtax;

  return {
    publishedPrice: input.publishedPrice,
    fairMarketRatio,
    taxBase: effectiveTaxBase,
    ...(taxBaseCap && {
      taxBaseBeforeCap: taxBaseCap.taxBaseBeforeCap,
      taxBaseCapApplied: taxBaseCap.taxBaseCapApplied,
      taxBaseCapLimit: taxBaseCap.taxBaseCapLimit,
      priorYearTaxBaseEquivalent: taxBaseCap.priorYearTaxBaseEquivalent,
      taxBaseCapRate: taxBaseCap.taxBaseCapRate,
    }),
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
    ...buildCapEcho(input, basisMain, taxYear - 1),
    ...selectTaxpayerOutcome(taxpayerResult, input, coShares, determinedTax, totalPayable),
  };
}
