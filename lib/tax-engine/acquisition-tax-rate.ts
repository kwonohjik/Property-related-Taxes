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
 *
 * calcTaxWithAdditional은 calcRuralSpecialTax·calcLocalEducationTax를 직접 호출한다
 * (농특세·지방교육세 산식은 이 파일 내 정의).
 */

import { ACQUISITION, ACQUISITION_CONST } from "./legal-codes";
import type {
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
 *
 * rate를 부동소수점으로 반올림한 뒤 곱하면 최대 ~3,000원 오차 발생.
 * BigInt로 세액을 직접 계산해 정확한 원 미만 절사를 보장한다.
 *
 * 공식: floor(value × (value×2 − 900,000,000) / 30,000,000,000)
 *   = floor(value × (value×2/300,000,000 − 3) / 100)
 */
export function calcLinearInterpolationTax(acquisitionValue: number): number {
  if (acquisitionValue <= ACQUISITION_CONST.HOUSING_BRACKET_LOW) {
    return Math.floor(acquisitionValue * 0.01);
  }
  if (acquisitionValue >= ACQUISITION_CONST.HOUSING_BRACKET_HIGH) {
    return Math.floor(acquisitionValue * 0.03);
  }
  const v = BigInt(acquisitionValue);
  const tax = (v * (v * 2n - 900_000_000n)) / 30_000_000_000n;
  return Number(tax);
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
    // 주택 2.8% (§11①5), 농지 2.3% (§11①5 단서), 그 외 4% (§11①7)
    const rate = propertyType === "housing"
      ? 0.028
      : propertyType === "land_farmland"
        ? 0.023  // 농지 상속: 2.3% (§11①5 단서) — inheritance_farmland 원인과 동일 세율
        : 0.04;
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
  if (acquisitionCause === "deemed_renovation") {
    // 건물 개수(改修)는 원시취득에 해당 (지방세법 §11①2호 가목 — 건축물의 건축·개수)
    // 원시취득 기본세율 2.8% 적용
    return { rate: 0.028, isLinearInterpolation: false, legalBasis: ACQUISITION.BASIC_RATE };
  }
  if (acquisitionCause === "deemed_land_category" || acquisitionCause === "deemed_major_shareholder") {
    // 지목변경(§7의2②) 및 과점주주(§7의2①): 2% 적용
    // 과점주주는 법인 보유 자산 종류별 표준세율 적용이 원칙이나,
    // 현행 UI가 단일 자산가치를 입력받으므로 임시 2% 적용.
    // (TODO: 자산 종류별 입력 구현 후 종류별 세율로 개선)
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

export interface AdditionalTaxInput {
  taxBase: number;         // 과세표준
  appliedRate: number;     // 취득세 세율 (예: 0.03)
  acquisitionTax: number;  // 취득세 본세
  areaSqm?: number;        // 전용면적 ㎡ (농특세 85㎡ 이하 면제 판단)
  propertyType: PropertyObjectType;
  // [P4-1] 주택 유상거래 분기
  acquisitionCause?: string;
  isSurcharged?: boolean;
  // [P4-2] 중과세 교육세 매트릭스
  surchargeType?: "multi_house_8" | "multi_house_12" | "luxury_solo" | "luxury_multi" | "corp_metro" | "gift_12";
  // [P4-4] 농특세 읍·면 지역 100㎡ 분기
  isRuralRegion?: boolean;
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
 * - [P4-4] 수도권 외 도시지역 외 읍·면 지역 100㎡ 이하 주택 (농특세법 §4②, 지방세법 시행령 §92②)
 * - 취득세율 ≤ 2% (기준세율 미초과)
 */
export function calcRuralSpecialTax(input: AdditionalTaxInput): number {
  // [P4-4] 읍·면 지역: 100㎡ 이하 면제 (isRuralRegion = true)
  const exemptLimitSqm = input.isRuralRegion
    ? ACQUISITION_CONST.RURAL_RURAL_EXEMPT_AREA_SQM  // 100㎡
    : ACQUISITION_CONST.RURAL_EXEMPT_AREA_SQM;        // 85㎡

  // 주택 면제 기준 이하
  if (
    input.propertyType === "housing" &&
    input.areaSqm !== undefined &&
    input.areaSqm <= exemptLimitSqm
  ) {
    return 0;
  }

  // 세율 2% 이하 → 0원 (정수 비교 — 부동소수점 오차 방지)
  // 10만분율(5자리) 사용: 선형보간 세율(소수점 5자리)의 2% 초과분이 0.5bps처럼
  // 1bps 미만일 수 있어, 만분율(4자리)로 반올림하면 초과분이 통째로 누락된다
  // (예: 0.02005 → 만분율 200 = 2% 판정 오류 → 농특세 0원). 10만분율은 2005로 보존.
  const RATE_SCALE = 100_000;
  const ratePoints = Math.round(input.appliedRate * RATE_SCALE); // 10만분율 정수
  const standardRatePoints = Math.round(ACQUISITION_CONST.RURAL_STANDARD_RATE * RATE_SCALE); // 2% = 2,000

  if (ratePoints <= standardRatePoints) {
    return 0;
  }

  // 농특세 = (적용세율 - 2%) × 과세표준 × 10%
  // 10만분율 정수 연산으로 부동소수점 오차 방지
  const excessRatePoints = ratePoints - standardRatePoints; // 초과분 (10만분율)
  const excessTax = Math.floor(input.taxBase * excessRatePoints / RATE_SCALE);
  const ruralTax = Math.floor(excessTax * ACQUISITION_CONST.RURAL_SURCHARGE_RATE);
  return ruralTax;
}

/**
 * 지방교육세 계산 (지방세법 §151)
 *
 * [P4-1] 주택 유상거래(§151①1나): 취득세 본세 × 50% × 20% (표준세율 1~3% 적용분의 10%)
 * [P4-2] 중과세 사치성: 과세표준 × 1.4%(단독) / 1.8%(다주택중복) 별도 매트릭스
 * 그 외: 과세표준 × 2% × 20% = 과세표준 × 0.4%
 */
export function calcLocalEducationTax(input: AdditionalTaxInput): number {
  const { taxBase, acquisitionTax, propertyType, acquisitionCause, isSurcharged, surchargeType } = input;

  // [P4-2] 사치성 중과세 매트릭스 (지방세법 §151④ — 사치성 부분 별도 가산)
  if (surchargeType === "luxury_solo") {
    // 사치성 단독: 과세표준 × 1.4% (표준 0.4% + 사치성 1.0%)
    return Math.floor(taxBase * 0.014);
  }
  if (surchargeType === "luxury_multi") {
    // 사치성 + 다주택 중복: 과세표준 × 1.8%
    return Math.floor(taxBase * 0.018);
  }

  // [P4-1] 주택 유상거래 + 비중과: 본세 × 50% × 20% = 본세 × 10%
  // 지방세법 §151①1나: §11①8 가목 세율(1~3%) 적용 취득세액의 50%의 20%
  const isHousingOnerous =
    propertyType === "housing" &&
    ["purchase", "exchange", "auction", "in_kind_investment"].includes(acquisitionCause ?? "");

  if (isHousingOnerous && !isSurcharged) {
    return Math.floor(acquisitionTax * 0.5 * 0.2);
  }

  // 그 외 (무상취득·비주택·중과세): 표준세율분 × 20%
  return Math.floor(taxBase * ACQUISITION_CONST.RURAL_STANDARD_RATE * ACQUISITION_CONST.EDU_RATE);
}

/** 하위 호환 래퍼 — taxBase만 전달 시 구 동작 유지 */
export function calcLocalEducationTaxSimple(taxBase: number): number {
  return Math.floor(taxBase * ACQUISITION_CONST.RURAL_STANDARD_RATE * ACQUISITION_CONST.EDU_RATE);
}

/**
 * 취득세 본세 + 부가세 통합 계산
 * [P4-1] acquisitionCause / isSurcharged 추가 — 주택 유상거래 교육세 분기
 * [P4-2] surchargeType 추가 — 사치성 교육세 매트릭스
 * [P4-4] isRuralRegion 추가 — 읍·면 지역 농특세 100㎡ 기준
 */
export function calcTaxWithAdditional(
  taxBase: number,
  appliedRate: number,
  acquisitionTax: number,
  propertyType: PropertyObjectType,
  areaSqm?: number,
  options?: {
    acquisitionCause?: string;
    isSurcharged?: boolean;
    surchargeType?: AdditionalTaxInput["surchargeType"];
    isRuralRegion?: boolean;
  }
): AdditionalTaxResult {
  const input: AdditionalTaxInput = {
    taxBase,
    appliedRate,
    acquisitionTax,
    areaSqm,
    propertyType,
    acquisitionCause: options?.acquisitionCause,
    isSurcharged: options?.isSurcharged,
    surchargeType: options?.surchargeType,
    isRuralRegion: options?.isRuralRegion,
  };

  const ruralSpecialTax = calcRuralSpecialTax(input);
  const localEducationTax = calcLocalEducationTax(input);

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
  const { rate: onerousRate, isLinearInterpolation } = getBasicRate(propertyType, "purchase", acquisitionValue);

  let onerousTax: number;
  if (isLinearInterpolation) {
    // 6~9억 선형보간 구간: 세율 = (전체×2 − 9억)/300억. 이를 5자리 float로 반올림해
    // 곱하면 유상분에서 최대 ~2,300원 과소(납세자 유리하나 법령 불일치).
    // 유상분 × 전체기준 보간세율을 BigInt로 정밀 계산 (linearInterpolationRate와 동일 분수).
    // isLinearInterpolation=true ⇒ 6억<acquisitionValue<9억 ⇒ (전체×2−9억)>3억>0 (음수 없음).
    const numerator = BigInt(onerousTaxBase) * (BigInt(acquisitionValue) * 2n - 900_000_000n);
    onerousTax = Number(numerator / 30_000_000_000n);
  } else {
    onerousTax = Math.floor(onerousTaxBase * onerousRate);
  }

  // 무상 부분: 증여세율 3.5%
  const gratuitousTax = Math.floor(gratuitousTaxBase * 0.035);

  return { onerousTax, gratuitousTax };
}
