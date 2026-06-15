/**
 * 재산세 부가세 합산 (Pure Engine 헬퍼)
 *
 * property-tax.ts 에서 분리 (800줄 정책). 지방세법 §151(지방교육세)·§112(도시지역분)·
 * §146③1호(소방분 지역자원시설세 6구간 초과누진).
 */

import { applyRate } from "./tax-utils";
import { PROPERTY, PROPERTY_CONST } from "./legal-codes";
import type {
  PropertyTaxInput,
  PropertySurtaxDetail,
  FireHazardClass,
} from "./types/property.types";

/**
 * 화재위험 등급 → 소방분 중과 배율 (지방세법 §146③2호·2의2호, 시행령 §138).
 * 단일 진실 — UI·결과뷰는 이 헬퍼/배율을 import (dual-truth 차단).
 */
export function resolveFireHazardMultiplier(fireHazardClass?: FireHazardClass): number {
  switch (fireHazardClass) {
    case "large_fire_hazard":
      return PROPERTY_CONST.LARGE_FIRE_HAZARD_MULTIPLIER; // 3
    case "fire_hazard":
      return PROPERTY_CONST.FIRE_HAZARD_MULTIPLIER; // 2
    default:
      return 1; // none / undefined
  }
}

/** 소방분 지역자원시설세 초과누진 구간 */
interface ResourceTaxBracket {
  /** 구간 상한 (원). undefined = 최고 구간 */
  upTo?: number;
  /** 직전 구간까지의 누계세액 (법정 표 기재값) */
  base: number;
  /** 구간 초과금액에 적용하는 세율 분자 (10,000분의 N) */
  perTenThousand: number;
}

/**
 * 소방분 지역자원시설세 6구간 초과누진 (건축물 시가표준액 기준, 지방세법 §146③1호)
 *
 * 600만원 이하 4/10,000부터 6,400만원 초과 12/10,000까지.
 * base = 직전 구간 상한까지의 법정 누계세액 (예: 1,300만 초과 구간 5,900원).
 */
const REGIONAL_RESOURCE_BRACKETS: ResourceTaxBracket[] = [
  { upTo: 6_000_000,  base: 0,      perTenThousand: 4 },
  { upTo: 13_000_000, base: 2_400,  perTenThousand: 5 },
  { upTo: 26_000_000, base: 5_900,  perTenThousand: 6 },
  { upTo: 39_000_000, base: 13_700, perTenThousand: 8 },
  { upTo: 64_000_000, base: 24_100, perTenThousand: 10 },
  {                   base: 49_100, perTenThousand: 12 },
];

function calcRegionalResourceTax(standardPrice: number): number {
  let lowerBound = 0;
  for (const bracket of REGIONAL_RESOURCE_BRACKETS) {
    if (bracket.upTo === undefined || standardPrice <= bracket.upTo) {
      // "초과금액의 10,000분의 N" — 분수 정수 연산 (applyRate의 소수 곱은 1원 오차 발생)
      const excess = standardPrice - lowerBound;
      return bracket.base + Math.floor((excess * bracket.perTenThousand) / 10_000);
    }
    lowerBound = bracket.upTo;
  }
  /* istanbul ignore next — 마지막 구간 upTo가 undefined이므로 도달 불가 */
  return 0;
}

/**
 * 부가세 합산 계산 (지방세법 §151, §112, §146)
 *
 * @param determinedTax  확정 재산세 (세부담상한 적용 후)
 * @param taxBase        과세표준 (도시지역분 계산 기준)
 * @param publishedPrice 공시가격 (지역자원시설세 계산 기준 — 건축물)
 * @param objectType     물건 유형
 * @param isUrbanArea    도시지역 여부 (도시지역분 과세)
 * @param fireHazardClass 화재위험 등급 (building 전용 — 소방분 ×2/×3 중과, §146③2호·2의2호)
 * @returns { surtax, totalSurtax, legalBasis }
 */
export function calcSurtax(
  determinedTax: number,
  taxBase: number,
  publishedPrice: number,
  objectType: PropertyTaxInput["objectType"],
  isUrbanArea: boolean,
  fireHazardClass?: FireHazardClass,
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

  // 지역자원시설세 = §146③1호 base(건축물 시가표준액 누진) × 화재위험 중과 배율(§146③2호·2의2호)
  const baseFireTax =
    objectType === "building"
      ? Math.max(0, calcRegionalResourceTax(publishedPrice))
      : 0;
  const fireHazardMultiplier =
    objectType === "building" ? resolveFireHazardMultiplier(fireHazardClass) : 1;
  const regionalResourceTax = baseFireTax * fireHazardMultiplier; // 정수 곱 — floor 불요

  const surtax: PropertySurtaxDetail = {
    localEducationTax,
    urbanAreaTax,
    regionalResourceTax,
    // building + 중과(×2/×3) 시에만 echo 노출 (none·비건축물은 undefined → 결과 카드 게이트)
    ...(objectType === "building" && fireHazardMultiplier > 1 && {
      regionalResourceTaxBeforeSurcharge: baseFireTax,
      fireHazardMultiplier,
    }),
  };

  const totalSurtax = localEducationTax + urbanAreaTax + regionalResourceTax;

  const legalBasis: string[] = [PROPERTY.LOCAL_EDUCATION_TAX];
  if (isUrbanArea) legalBasis.push(PROPERTY.URBAN_AREA_TAX);
  if (objectType === "building") legalBasis.push(PROPERTY.REGIONAL_RESOURCE_TAX);
  if (objectType === "building" && fireHazardMultiplier > 1)
    legalBasis.push(PROPERTY.FIRE_HAZARD_SURCHARGE);

  return { surtax, totalSurtax, legalBasis };
}
