/**
 * 취득세 세율 결정 모듈
 *
 * 지방세법 §11 — 취득세 기본세율
 * - 주택 유상취득: 6억 이하 1%, 6억~9억 선형보간, 9억 초과 3%
 * - 농지 유상취득: 3%
 * - 토지·건물: 4%
 * - 상속: 주택 2.8%, 농지 2.3%
 * - 증여: 3.5%
 * - 원시취득: 2.8%
 * + 농어촌특별세 + 지방교육세 계산
 */

import { ACQUISITION, ACQUISITION_CONST } from "./legal-codes";
import type {
  AcquisitionTaxInput,
  TaxRateDecision,
  PropertyObjectType,
  AcquisitionCause,
} from "./types/acquisition.types";

// ============================================================
// 주택 선형보간 세율 (지방세법 §11①1의2)
// ============================================================

/**
 * 주택 6억 초과 9억 이하 선형보간 세율
 * 공식: 취득세율 = (취득가액 × 2 / 300,000,000 - 3) / 100
 *
 * BigInt로 정밀 계산 (소수점 5자리 유지)
 */
export function linearInterpolationRate(acquisitionValue: number): number {
  if (acquisitionValue <= ACQUISITION_CONST.HOUSING_BRACKET_LOW) return 0.01;
  if (acquisitionValue >= ACQUISITION_CONST.HOUSING_BRACKET_HIGH) return 0.03;

  // (value × 2 - 3 × 300,000,000) / (100 × 300,000,000)
  const numerator = BigInt(acquisitionValue) * BigInt(2) - BigInt(900_000_000);
  const denominator = BigInt(30_000_000_000);

  // 소수점 5자리 반올림: numerator × 100000 / denominator (반올림)
  const scaled = (numerator * BigInt(100_000) + denominator / BigInt(2)) / denominator;
  return Number(scaled) / 100_000;
}

/**
 * 선형보간 세율 구간에서의 취득세액
 */
export function calcLinearInterpolationTax(acquisitionValue: number): number {
  const rate = linearInterpolationRate(acquisitionValue);
  return Math.floor(acquisitionValue * rate);
}

// ============================================================
// 기본세율 결정 (지방세법 §11)
// ============================================================

/**
 * 물건종류 × 취득원인 조합으로 기본세율 결정
 *
 * @returns 기본세율 (소수, 예: 0.03 = 3%)
 */
export function getBasicRate(
  propertyType: PropertyObjectType,
  acquisitionCause: AcquisitionCause,
  acquisitionValue: number
): {
  rate: number;
  isLinearInterpolation: boolean;
  legalBasis: string;
} {
  // ── 상속 ──
  if (acquisitionCause === "inheritance") {
    const rate = propertyType === "housing" ? 0.028 : 0.04; // 주택 2.8%, 그 외 4%
    return { rate, isLinearInterpolation: false, legalBasis: ACQUISITION.BASIC_RATE };
  }
  if (acquisitionCause === "inheritance_farmland") {
    return { rate: 0.023, isLinearInterpolation: false, legalBasis: ACQUISITION.BASIC_RATE }; // 농지 상속 2.3%
  }

  // ── 증여·기부 ──
  if (acquisitionCause === "gift" || acquisitionCause === "donation") {
    const rate = propertyType === "housing" ? 0.035 : 0.035; // 3.5%
    return { rate, isLinearInterpolation: false, legalBasis: ACQUISITION.BASIC_RATE };
  }

  // ── 원시취득 ──
  if (["new_construction", "extension", "reconstruction", "reclamation"].includes(acquisitionCause)) {
    return { rate: 0.028, isLinearInterpolation: false, legalBasis: ACQUISITION.BASIC_RATE }; // 2.8%
  }

  // ── 간주취득 ──
  if (["deemed_major_shareholder", "deemed_land_category", "deemed_renovation"].includes(acquisitionCause)) {
    return { rate: 0.02, isLinearInterpolation: false, legalBasis: ACQUISITION.DEEMED_ACQUISITION }; // 2%
  }

  // ── 유상취득 (매매·공매경매·교환·현물출자·부담부증여 유상분) ──
  // 물건별 세율 분기
  switch (propertyType) {
    case "housing": {
      // 주택 6~9억 선형보간
      if (
        acquisitionValue > ACQUISITION_CONST.HOUSING_BRACKET_LOW &&
        acquisitionValue < ACQUISITION_CONST.HOUSING_BRACKET_HIGH
      ) {
        const rate = linearInterpolationRate(acquisitionValue);
        return { rate, isLinearInterpolation: true, legalBasis: ACQUISITION.LINEAR_RATE };
      }
      const rate = acquisitionValue <= ACQUISITION_CONST.HOUSING_BRACKET_LOW ? 0.01 : 0.03;
      return { rate, isLinearInterpolation: false, legalBasis: ACQUISITION.BASIC_RATE };
    }

    case "land_farmland":
      return { rate: 0.03, isLinearInterpolation: false, legalBasis: ACQUISITION.BASIC_RATE }; // 농지 3%

    case "land":
    case "building":
    case "vehicle":
    case "machinery":
    case "aircraft":
    case "vessel":
    case "mining_right":
    case "fishing_right":
    case "membership":
    case "standing_tree":
      return { rate: 0.04, isLinearInterpolation: false, legalBasis: ACQUISITION.BASIC_RATE }; // 4%

    default:
      return { rate: 0.04, isLinearInterpolation: false, legalBasis: ACQUISITION.BASIC_RATE };
  }
}

// ============================================================
// 세율 결정 메인 함수
// ============================================================

interface RateDecisionInput {
  propertyType: PropertyObjectType;
  acquisitionCause: AcquisitionCause;
  acquisitionValue: number;   // 과세표준 (천원 미만 절사 완료)
  isSurcharged?: boolean;
  surchargeRate?: number;
}

/**
 * 취득세 기본세율 결정 (중과세 제외)
 *
 * 중과세 판정은 acquisition-tax-surcharge.ts에서 별도 처리
 */
export function decideTaxRate(input: RateDecisionInput): TaxRateDecision {
  const { propertyType, acquisitionCause, acquisitionValue } = input;
  const warnings: string[] = [];

  if (input.isSurcharged && input.surchargeRate) {
    // 중과세율이 전달된 경우 (surcharge 모듈에서 호출)
    return {
      appliedRate: input.surchargeRate,
      rateType: "surcharge_regulated",
      isSurcharged: true,
      surchargeReason: "중과세율 적용",
      legalBasis: ACQUISITION.SURCHARGE,
      warnings,
    };
  }

  const { rate, isLinearInterpolation, legalBasis } = getBasicRate(
    propertyType,
    acquisitionCause,
    acquisitionValue
  );

  return {
    appliedRate: rate,
    rateType: isLinearInterpolation ? "linear_interpolation" : "basic",
    isSurcharged: false,
    legalBasis,
    warnings,
  };
}

// ============================================================
// 부가세 계산 (농어촌특별세 + 지방교육세)
// ============================================================

interface AdditionalTaxInput {
  taxBase: number;         // 과세표준
  appliedRate: number;     // 취득세 세율 (예: 0.03)
  acquisitionTax: number;  // 취득세 본세
  areaSqm?: number;        // 전용면적 ㎡ (농특세 85㎡ 이하 면제 판단)
  propertyType: PropertyObjectType;
}

export interface AdditionalTaxResult {
  ruralSpecialTax: number;   // 농어촌특별세
  localEducationTax: number; // 지방교육세
  ruralTaxBasis: string;     // 농특세 계산 근거
  eduTaxBasis: string;       // 지방교육세 계산 근거
}

/**
 * 농어촌특별세 계산 (농특세법 §4)
 *
 * 농특세 = (취득세율 - 기준세율 2%) × 과세표준 × 10%
 *
 * 면제:
 * - 전용면적 85㎡ 이하 주택 (전면 면제)
 * - 취득세율 ≤ 2% (기준세율 미초과)
 */
export function calcRuralSpecialTax(input: AdditionalTaxInput): number {
  // 주택 85㎡ 이하 면제
  if (
    input.propertyType === "housing" &&
    input.areaSqm !== undefined &&
    input.areaSqm <= ACQUISITION_CONST.RURAL_EXEMPT_AREA_SQM
  ) {
    return 0;
  }

  // 세율 2% 이하 → 0원 (정수 비교 — 부동소수점 오차 방지)
  const ratePoints = Math.round(input.appliedRate * 10000); // 만분율(bps) 정수
  const standardRatePoints = 200; // 2% = 200 bps

  if (ratePoints <= standardRatePoints) {
    return 0;
  }

  // 농특세 = (적용세율 - 2%) × 과세표준 × 10%
  // bps 정수 연산으로 부동소수점 오차 방지
  const excessRatePoints = ratePoints - standardRatePoints; // 초과분 bps
  const excessTax = Math.floor(input.taxBase * excessRatePoints / 10000);
  const ruralTax = Math.floor(excessTax * ACQUISITION_CONST.RURAL_SURCHARGE_RATE);
  return ruralTax;
}

/**
 * 지방교육세 계산 (지방세법 §151)
 *
 * 지방교육세 = 과세표준 × 표준세율 2% × 20%
 *           = 과세표준 × 0.4%
 *
 * 중과세가 적용되더라도 표준세율 2% 기준 취득세액에만 20% 적용
 */
export function calcLocalEducationTax(taxBase: number): number {
  return Math.floor(taxBase * ACQUISITION_CONST.RURAL_STANDARD_RATE * ACQUISITION_CONST.EDU_RATE);
}

/**
 * 취득세 본세 + 부가세 통합 계산
 */
export function calcTaxWithAdditional(
  taxBase: number,
  appliedRate: number,
  acquisitionTax: number,
  propertyType: PropertyObjectType,
  areaSqm?: number
): AdditionalTaxResult {
  const input: AdditionalTaxInput = {
    taxBase,
    appliedRate,
    acquisitionTax,
    areaSqm,
    propertyType,
  };

  const ruralSpecialTax = calcRuralSpecialTax(input);
  const localEducationTax = calcLocalEducationTax(taxBase);

  return {
    ruralSpecialTax,
    localEducationTax,
    ruralTaxBasis: ACQUISITION.RURAL_SPECIAL_TAX,
    eduTaxBasis: ACQUISITION.LOCAL_EDUCATION_TAX,
  };
}

// ============================================================
// 부담부증여 분리 세액 계산
// ============================================================

/**
 * 부담부증여: 유상 부분과 무상 부분 세액을 각각 계산
 *
 * 유상 부분(채무액) → 매매세율 적용
 * 무상 부분(초과분) → 증여세율(3.5%) 적용
 */
export function calcBurdenedGiftTax(
  onerousTaxBase: number,
  gratuitousTaxBase: number,
  propertyType: PropertyObjectType,
  acquisitionValue: number
): {
  onerousTax: number;
  gratuitousTax: number;
} {
  // 유상 부분: 매매세율 — 세율 구간 판정은 전체 취득가액 기준 (지방세법 § 취득가액 기준 세율 결정)
  const { rate: onerousRate } = getBasicRate(propertyType, "purchase", acquisitionValue);
  const onerousTax = Math.floor(onerousTaxBase * onerousRate);

  // 무상 부분: 증여세율 3.5%
  const gratuitousTax = Math.floor(gratuitousTaxBase * 0.035);

  return { onerousTax, gratuitousTax };
}
