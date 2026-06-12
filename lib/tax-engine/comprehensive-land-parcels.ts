/**
 * 토지 필지별 재산세 자동계산 (종부세 "납부할세액의 계산" 카드 ②ⓐ)
 *
 * 지자체 관내 합산(지방세법 §113) → 재산세 과표(×70%) → 표준세율 누진(§111)
 *   → 세부담상한 Min(직전 표준세율 재산세상당 × 150%, §122).
 * 종합합산(사례10)·별도합산(사례11) 공용. 재산세 누진은 기존 함수 재사용(세율표 복제 금지).
 *
 * Design: docs/02-design/features/comprehensive-land-payable-calc.engine.design.md §3
 */

import { PROPERTY_CONST, PROPERTY_SEPARATE_CONST } from "./legal-codes";
import { calcComprehensiveAggregateLandStdTax } from "./comprehensive-land-aggregate";
import { calcSeparateAggregateLandStdTax } from "./comprehensive-separate-land";
import type {
  LandParcelInput,
  LandJurisdictionPropertyTax,
} from "./types/comprehensive.types";

export type LandKind = "aggregate" | "separate";

/** 재산세 토지 공정시장가액비율 (지방세법 §110② — 70%) */
const LAND_PROPERTY_FMR = PROPERTY_SEPARATE_CONST.FAIR_MARKET_RATIO; // 0.70
/** 토지 재산세 세부담상한율 (지방세법 §122 — 단일 150%, 주택만 105/110/130 단서) */
const LAND_TAX_CAP_RATE = PROPERTY_CONST.TAX_CAP_RATE_LAND; // 1.50

/**
 * 재산세 토지 표준세율 적용 구간(세율·누진공제) — 카드 산식 표시용 single-source.
 * UI 세율 하드코딩 금지 (`feedback_ui_engine_dual_truth_avoidance`).
 */
export function getLandStandardRateBracket(
  kind: LandKind,
  propertyTaxBase: number,
): { rate: number; deduction: number } {
  if (kind === "aggregate") {
    if (propertyTaxBase <= PROPERTY_CONST.COMPREHENSIVE_BRACKET_1)
      return { rate: PROPERTY_CONST.COMPREHENSIVE_RATE_1, deduction: 0 };
    if (propertyTaxBase <= PROPERTY_CONST.COMPREHENSIVE_BRACKET_2)
      return { rate: PROPERTY_CONST.COMPREHENSIVE_RATE_2, deduction: PROPERTY_CONST.COMPREHENSIVE_DEDUCTION_2 };
    return { rate: PROPERTY_CONST.COMPREHENSIVE_RATE_3, deduction: PROPERTY_CONST.COMPREHENSIVE_DEDUCTION_3 };
  }
  if (propertyTaxBase <= PROPERTY_SEPARATE_CONST.BRACKET_1)
    return { rate: PROPERTY_SEPARATE_CONST.RATE_1, deduction: 0 };
  if (propertyTaxBase <= PROPERTY_SEPARATE_CONST.BRACKET_2)
    return { rate: PROPERTY_SEPARATE_CONST.RATE_2, deduction: PROPERTY_SEPARATE_CONST.DEDUCTION_2 };
  return { rate: PROPERTY_SEPARATE_CONST.RATE_3, deduction: PROPERTY_SEPARATE_CONST.DEDUCTION_3 };
}

/** 재산세 토지 표준세율 산출세액 (kind별 기존 함수 재사용) */
export function calcLandStandardPropertyTax(kind: LandKind, propertyTaxBase: number): number {
  return kind === "aggregate"
    ? calcComprehensiveAggregateLandStdTax(propertyTaxBase)
    : calcSeparateAggregateLandStdTax(propertyTaxBase);
}

/** 필지 공시가격 = floor(면적 × 지분율 × ㎡당 공시지가) — 소수 곱 floor 1회 */
function parcelOfficialValue(area: number, shareRatio: number, pricePerSqm: number): number {
  return Math.floor(area * shareRatio * pricePerSqm);
}

/** 그룹 재산세 과표 = floor(공시합산 × 70%) — 분수 정수 */
function landPropertyTaxBase(officialValueSum: number): number {
  return Math.floor((officialValueSum * Math.round(LAND_PROPERTY_FMR * 100)) / 100);
}

export interface ParcelsPropertyTaxResult {
  perJurisdiction: LandJurisdictionPropertyTax[];
  imposedSum: number; // ②ⓐ 합산 (Σ Min)
  officialValueSum: number; // 전체 공시 합산
}

/**
 * 필지 → 지자체 그룹 → 재산세 (당해연도, §122 Min 옵션).
 * @param usePrior true면 priorOfficialPricePerSqm로 직전 표준세율 재산세 재계산 → §122 상한 Min 적용
 */
export function calcLandParcelsPropertyTax(
  parcels: LandParcelInput[],
  kind: LandKind,
  usePrior: boolean,
): ParcelsPropertyTaxResult {
  const groups = new Map<string, LandParcelInput[]>();
  for (const p of parcels) {
    const key = p.jurisdiction.trim();
    const arr = groups.get(key);
    if (arr) arr.push(p);
    else groups.set(key, [p]);
  }

  const perJurisdiction: LandJurisdictionPropertyTax[] = [];
  let imposedSum = 0;
  let officialValueSum = 0;

  for (const [jurisdiction, group] of groups) {
    const parcelEchos = group.map((p) => ({
      parcelId: p.parcelId,
      name: p.name,
      area: p.area,
      shareRatio: p.shareRatio,
      pricePerSqm: p.officialPricePerSqm,
      officialValue: parcelOfficialValue(p.area, p.shareRatio, p.officialPricePerSqm),
    }));
    const groupOfficial = parcelEchos.reduce((s, e) => s + e.officialValue, 0);
    const propertyTaxBase = landPropertyTaxBase(groupOfficial);
    const bracket = getLandStandardRateBracket(kind, propertyTaxBase);
    const standardTax = calcLandStandardPropertyTax(kind, propertyTaxBase);

    let priorStandardTax: number | undefined;
    let capAmount: number | undefined;
    let imposedTax = standardTax;
    if (usePrior) {
      const priorOfficial = group.reduce(
        (s, p) => s + parcelOfficialValue(p.area, p.shareRatio, p.priorOfficialPricePerSqm ?? 0),
        0,
      );
      priorStandardTax = calcLandStandardPropertyTax(kind, landPropertyTaxBase(priorOfficial));
      capAmount = Math.floor((priorStandardTax * Math.round(LAND_TAX_CAP_RATE * 100)) / 100);
      imposedTax = Math.min(standardTax, capAmount);
    }

    perJurisdiction.push({
      jurisdiction,
      parcels: parcelEchos,
      officialValueSum: groupOfficial,
      propertyTaxBase,
      appliedRate: bracket.rate,
      progressiveDeduction: bracket.deduction,
      standardTax,
      priorStandardTax,
      capAmount,
      imposedTax,
    });
    imposedSum += imposedTax;
    officialValueSum += groupOfficial;
  }

  return { perJurisdiction, imposedSum, officialValueSum };
}

/** 자동계산(직전연도 상당액) 활성 조건 — 전 필지 직전 공시지가 존재 */
export function isLandPriorAutoActive(parcels: LandParcelInput[] | undefined): boolean {
  return (
    !!parcels &&
    parcels.length > 0 &&
    parcels.every((p) => p.priorOfficialPricePerSqm !== undefined && p.priorOfficialPricePerSqm > 0)
  );
}
