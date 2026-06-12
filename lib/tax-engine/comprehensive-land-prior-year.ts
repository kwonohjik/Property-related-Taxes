/**
 * 토지 직전연도 종합부동산세상당액 계산 (세부담상한 — 종부세법 §15·시행령 §6(종합합산)·§7(별도합산))
 *
 * 교재 사례10·11 ④나 재현. 직전연도 공시지가로 직전 세법(FMR·세율·공제)을 적용해
 *   ① 직전 재산세상당액(지자체 합산, §122 Min 미적용 — 시행령 §6②1호·§7②1호 §122 제외)
 *   ② 직전 종부세상당액(ⓐ 산출세액 − ⓑ 공제할 재산세액)
 * 을 산출한다. 종합합산·별도합산 공용.
 *
 * Design: docs/02-design/features/comprehensive-land-payable-calc.engine.design.md §4
 */

import { truncateToTenThousand, safeMultiplyThenDivide } from "./tax-utils";
import { COMPREHENSIVE_LAND_CONST, PROPERTY_SEPARATE_CONST } from "./legal-codes";
import { getComprehensiveParams } from "./data/comprehensive-historical";
import { calcAggregateLandTaxBase, calcAggregateLandTaxAmount } from "./comprehensive-land-aggregate";
import { applySeparateAggregateLandRate } from "./comprehensive-separate-land";
import {
  calcLandStandardPropertyTax,
  getLandStandardRateBracket,
  type LandKind,
} from "./comprehensive-land-parcels";
import type {
  LandParcelInput,
  LandPreviousYearEquivalent,
  LandPriorJurisdictionTax,
} from "./types/comprehensive.types";

/** 재산세 토지 공정시장가액비율 (지방세법 §110② — 70%) */
const LAND_PROPERTY_FMR = PROPERTY_SEPARATE_CONST.FAIR_MARKET_RATIO; // 0.70

function landPropertyTaxBase(officialValueSum: number): number {
  return Math.floor((officialValueSum * Math.round(LAND_PROPERTY_FMR * 100)) / 100);
}

/**
 * 토지 직전연도 종합부동산세상당액.
 * @param parcels     직전 공시지가(priorOfficialPricePerSqm)가 전 필지 입력된 상태 (호출 전 검증)
 * @param kind        "aggregate" | "separate"
 * @param currentYear 당해 귀속연도 (직전연도 = currentYear − 1)
 */
export function calcLandPreviousYearEquivalent(
  parcels: LandParcelInput[],
  kind: LandKind,
  currentYear: number,
): LandPreviousYearEquivalent {
  const py = currentYear - 1;
  const fairMarketRatio = getComprehensiveParams(py).fairMarketRatioLand;
  const basicDeduction =
    kind === "aggregate"
      ? COMPREHENSIVE_LAND_CONST.AGGREGATE_DEDUCTION_AMOUNT
      : COMPREHENSIVE_LAND_CONST.SEPARATE_DEDUCTION_AMOUNT;

  // ── 나① 직전연도 재산세상당액 — 지자체 그룹(직전 공시지가, §122 Min 미적용) ──
  const groups = new Map<string, LandParcelInput[]>();
  for (const p of parcels) {
    const key = p.jurisdiction.trim();
    const arr = groups.get(key);
    if (arr) arr.push(p);
    else groups.set(key, [p]);
  }

  const perJurisdiction: LandPriorJurisdictionTax[] = [];
  let propertyTaxEquiv = 0;
  let officialValueSum = 0;
  for (const [jurisdiction, group] of groups) {
    const parcelEchos = group.map((p) => ({
      parcelId: p.parcelId,
      name: p.name,
      area: p.area,
      shareRatio: p.shareRatio,
      pricePerSqm: p.priorOfficialPricePerSqm ?? 0,
      officialValue: Math.floor(p.area * p.shareRatio * (p.priorOfficialPricePerSqm ?? 0)),
    }));
    const groupOfficial = parcelEchos.reduce((s, e) => s + e.officialValue, 0);
    const propertyTaxBase = landPropertyTaxBase(groupOfficial);
    const bracket = getLandStandardRateBracket(kind, propertyTaxBase);
    const standardTax = calcLandStandardPropertyTax(kind, propertyTaxBase);
    perJurisdiction.push({
      jurisdiction,
      parcels: parcelEchos,
      officialValueSum: groupOfficial,
      propertyTaxBase,
      appliedRate: bracket.rate,
      progressiveDeduction: bracket.deduction,
      standardTax,
    });
    propertyTaxEquiv += standardTax;
    officialValueSum += groupOfficial;
  }

  // ── 나②ⓐ 직전 종부세 산출세액 (직전 공시 합산 × 직전 FMR → 누진) ──
  const taxBase =
    kind === "aggregate"
      ? calcAggregateLandTaxBase(officialValueSum, fairMarketRatio)
      : truncateToTenThousand(
          Math.floor(Math.max(officialValueSum - basicDeduction, 0) * fairMarketRatio),
        );
  const rateResult =
    kind === "aggregate" ? calcAggregateLandTaxAmount(taxBase) : applySeparateAggregateLandRate(taxBase);
  const { calculatedTax, appliedRate, progressiveDeduction } = rateResult;

  // ── 나②ⓑ 공제할 재산세액 = propertyTaxEquiv × (분자 / 분모) ──
  //   분자 = floor(종부 과표 × 70% × 재산세 최고세율)  [누진공제 없음]
  //   분모 = 직전 전체 재산세 과표 표준세율 산출세액
  const topRate = getLandStandardRateBracket(kind, Number.MAX_SAFE_INTEGER).rate; // 0.005 / 0.004
  const stdTaxNumerator = Math.floor(
    (taxBase * Math.round(LAND_PROPERTY_FMR * 100) * Math.round(topRate * 1000)) / 100_000,
  );
  const stdTaxDenominator = calcLandStandardPropertyTax(kind, landPropertyTaxBase(officialValueSum));
  const creditAmount =
    stdTaxDenominator > 0
      ? Math.floor(safeMultiplyThenDivide(propertyTaxEquiv, stdTaxNumerator, stdTaxDenominator))
      : 0;

  const comprehensiveTaxEquiv = Math.max(calculatedTax - creditAmount, 0);

  return {
    propertyTaxEquiv,
    comprehensiveTaxEquiv,
    total: propertyTaxEquiv + comprehensiveTaxEquiv,
    detail: {
      officialValueSum,
      basicDeduction,
      fairMarketRatio,
      taxBase,
      appliedRate,
      progressiveDeduction,
      calculatedTax,
      stdTaxNumerator,
      stdTaxDenominator,
      creditAmount,
      perJurisdiction,
    },
  };
}
