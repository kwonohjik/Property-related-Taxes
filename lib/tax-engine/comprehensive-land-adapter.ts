/**
 * 토지 필지 모드 어댑터 — 필지 입력 → 기존 토지 엔진 호출 + 분해 echo 부착.
 *
 * 기존 calculateAggregateLandTax / calculateSeparateAggregateLandTax는 **시그니처 무변경**.
 * 필지 → 지자체 합산 재산세(§122 Min) + 직전연도 종부세상당액(§15) 산출 후 입력으로 변환,
 * 반환 result에 perJurisdiction·previousYearEquivalent echo를 부착한다.
 *
 * Design: comprehensive-land-payable-calc.engine.design.md §5
 */

import { calcLandParcelsPropertyTax, isLandPriorAutoActive } from "./comprehensive-land-parcels";
import { calcLandPreviousYearEquivalent } from "./comprehensive-land-prior-year";
import { calculateAggregateLandTax } from "./comprehensive-land-aggregate";
import { calculateSeparateAggregateLandTax } from "./comprehensive-separate-land";
import { PROPERTY_SEPARATE_CONST } from "./legal-codes";
import type {
  LandParcelInput,
  AggregateLandTaxResult,
  SeparateAggregateLandTaxResult,
} from "./types/comprehensive.types";

/** 직전연도 자동계산 지원 하한 연도 (historical 2020 엔트리 부재 — L-09·D-6) */
const LAND_PRIOR_AUTO_MIN_YEAR = 2022;
/** 재산세 토지 공정시장가액비율 (70%) — ⓒ 분모 과표 산정 */
const LAND_PROPERTY_FMR = PROPERTY_SEPARATE_CONST.FAIR_MARKET_RATIO;

/** ⓒ 분모 입력 = 전체 공시합산 × 70% **단일 floor** (지자체별 floor 합 금지 — D1-1) */
function denominatorPropertyTaxBase(officialValueSum: number): number {
  return Math.floor((officialValueSum * Math.round(LAND_PROPERTY_FMR * 100)) / 100);
}

/** 직전연도 자동계산 활성 여부 (전 필지 직전 공시지가 + 2022+ 귀속) */
function resolvePriorAuto(parcels: LandParcelInput[], currentYear: number): boolean {
  return isLandPriorAutoActive(parcels) && currentYear >= LAND_PRIOR_AUTO_MIN_YEAR;
}

export function buildAggregateLandFromParcels(
  parcels: LandParcelInput[],
  currentYear: number,
  fairMarketRatio: number,
  directPreviousYearTotalTax?: number,
): AggregateLandTaxResult {
  const usePrior = resolvePriorAuto(parcels, currentYear);
  const pt = calcLandParcelsPropertyTax(parcels, "aggregate", usePrior);
  const prior = usePrior
    ? calcLandPreviousYearEquivalent(parcels, "aggregate", currentYear)
    : undefined;

  const result = calculateAggregateLandTax(
    {
      totalOfficialValue: pt.officialValueSum,
      propertyTaxBase: denominatorPropertyTaxBase(pt.officialValueSum), // ⓒ 분모
      propertyTaxAmount: pt.imposedSum, // ②ⓐ
      // 자동(prior.total) 우선, 없으면 직접입력(direct 서브모드)
      previousYearTotalTax: prior?.total ?? directPreviousYearTotalTax,
    },
    fairMarketRatio,
  );
  result.perJurisdiction = pt.perJurisdiction;
  result.previousYearEquivalent = prior;
  return result;
}

export function buildSeparateLandFromParcels(
  parcels: LandParcelInput[],
  currentYear: number,
  fairMarketRatio: number,
  directPreviousYearTotalTax: number | undefined,
): SeparateAggregateLandTaxResult {
  const usePrior = resolvePriorAuto(parcels, currentYear);
  const pt = calcLandParcelsPropertyTax(parcels, "separate", usePrior);
  const prior = usePrior
    ? calcLandPreviousYearEquivalent(parcels, "separate", currentYear)
    : undefined;

  // 직전연도 총세액: 자동(prior.total) 우선, 없으면 직접입력(direct 서브모드)
  const previousYearTotalTax = prior?.total ?? directPreviousYearTotalTax;

  // 별도합산 엔진은 lands를 Σ하여 totalPublicPrice·totalPropertyTaxBase·totalPropertyTaxAmount 산정.
  // ⓒ 분모는 전체 공시합산 단일 floor(D1-1), ②ⓐ는 §122 Min 합산이므로 **단일 합성 land**로 전달
  // (per-land 분해는 perJurisdiction echo가 담당).
  const synthetic = [
    {
      landId: "_synthetic",
      publicPrice: pt.officialValueSum,
      propertyTaxBase: denominatorPropertyTaxBase(pt.officialValueSum), // ⓒ 분모
      propertyTaxAmount: pt.imposedSum, // ②ⓐ
    },
  ];

  const result = calculateSeparateAggregateLandTax(synthetic, fairMarketRatio, previousYearTotalTax);
  result.perJurisdiction = pt.perJurisdiction;
  result.previousYearEquivalent = prior;
  return result;
}
