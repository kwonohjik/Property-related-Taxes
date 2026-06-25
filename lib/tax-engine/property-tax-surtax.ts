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
  InstallmentInfo,
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
 * @param housingFireServiceTaxBase 주택 건물분 소방분 과세표준 (housing 전용 — 건물분 × FMR, §146④ 단서)
 * @param overrideUrbanTax 도시지역분 세부담상한 적용 후 값 (주택 부칙 §15 v2, §118 본문). 전달 시 taxBase×0.14% 대신 사용
 * @returns { surtax, totalSurtax, legalBasis }
 */
export function calcSurtax(
  determinedTax: number,
  taxBase: number,
  publishedPrice: number,
  objectType: PropertyTaxInput["objectType"],
  isUrbanArea: boolean,
  fireHazardClass?: FireHazardClass,
  housingFireServiceTaxBase?: number,
  overrideUrbanTax?: number,
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

  // 도시지역분 = 과세표준 × 0.14% (도시지역 한정).
  //   주택 부칙 §15 v2(§118 본문): 세부담상한 적용 후 값을 overrideUrbanTax로 주입받으면 그 값 사용.
  const urbanAreaTax = !isUrbanArea
    ? 0
    : overrideUrbanTax ?? applyRate(taxBase, PROPERTY_CONST.URBAN_AREA_TAX_RATE);

  // 지역자원시설세 — 건축물·선박(§146③1호 시가표준액)·주택(§146④ 단서 건물분) 분기
  //   §146④: 제3항 대상은 §104 2·3·5호 = 건축물·선박. 항공기는 비대상(0).
  const baseFireTax =
    objectType === "building" || objectType === "vessel"
      ? Math.max(0, calcRegionalResourceTax(publishedPrice))               // §146③1호: 건축물·선박 시가표준액 직접
      : objectType === "housing" && housingFireServiceTaxBase != null
        ? Math.max(0, calcRegionalResourceTax(housingFireServiceTaxBase))  // §146④ 단서: 주택 건물분 × FMR
        : 0;
  const fireHazardMultiplier =
    objectType === "building" ? resolveFireHazardMultiplier(fireHazardClass) : 1; // 화재위험 중과는 건축물만(§146③2호·2의2호) — 선박·주택 ×1
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
    // 주택 소방분 산출 시 과세표준 echo (§146④ 단서)
    ...(objectType === "housing" && housingFireServiceTaxBase != null && {
      housingFireServiceTaxBase,
    }),
  };

  const totalSurtax = localEducationTax + urbanAreaTax + regionalResourceTax;

  const legalBasis: string[] = [PROPERTY.LOCAL_EDUCATION_TAX];
  if (isUrbanArea) legalBasis.push(PROPERTY.URBAN_AREA_TAX);
  if (objectType === "building" || objectType === "vessel")
    legalBasis.push(PROPERTY.REGIONAL_RESOURCE_TAX); // §146③1호 — 건축물·선박
  if (objectType === "building" && fireHazardMultiplier > 1)
    legalBasis.push(PROPERTY.FIRE_HAZARD_SURCHARGE);
  // 주택 소방분 산출 시 근거 push (§146④ 단서 — building의 §146과 구분)
  if (objectType === "housing" && housingFireServiceTaxBase != null)
    legalBasis.push(PROPERTY.REGIONAL_RESOURCE_TAX_HOUSING);

  return { surtax, totalSurtax, legalBasis };
}

// ============================================================
// 분납 계산 (지방세법 §115) — property-tax.ts 에서 분리 (800줄 정책)
// ============================================================

export function calcInstallment(
  determinedTax: number,
  objectType: PropertyTaxInput["objectType"],
  totalSurtax = 0,
): InstallmentInfo {
  // 지방세법 §115①: 주택 20만원 초과, 토지·건축물 등 비주택 250만원 초과 시 분납 가능
  const threshold =
    objectType === "housing"
      ? PROPERTY_CONST.INSTALLMENT_THRESHOLD
      : PROPERTY_CONST.INSTALLMENT_THRESHOLD_NON_HOUSE;

  // 분납 판정은 재산세 본세(§115①3호 "부과·징수할 세액") 기준.
  const eligible = determinedTax > threshold;

  // 주택(§115①3호)은 본세를 7·9월 1/2씩 분할 고지하며, 도시지역분(§112)·지역자원시설세(§147)·
  // 지방교육세(§152)도 동일 납기로 함께 분할 고지된다 → 각 기분 실납부액 = 총 납부세액 ÷ 2.
  // 비주택(토지·건축물 등)은 본세만 기준(§118 분할납부).
  const installmentBase =
    objectType === "housing" ? determinedTax + totalSurtax : determinedTax;

  if (!eligible) {
    return { eligible: false, firstPayment: installmentBase, secondPayment: 0 };
  }
  // 균등 분납: 홀수 원은 1차에 포함
  const secondPayment = Math.floor(installmentBase / 2);
  const firstPayment = installmentBase - secondPayment;
  return { eligible: true, firstPayment, secondPayment };
}
