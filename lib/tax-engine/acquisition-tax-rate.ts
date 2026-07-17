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
    // 지방세법 §11①1: 상속으로 인한 부동산 취득 — 가. 농지 2.3% / 나. 농지 외의 것 2.8%
    // (4%는 §11①7나 '그 밖의 원인'=유상 기타 전용이므로 상속 부동산에는 적용 불가)
    const rate =
      propertyType === "land_farmland"
        ? 0.023  // 농지 상속(§11①1가): 2.3% — inheritance_farmland 원인과 동일 세율
        : propertyType === "housing" ||
            propertyType === "land" ||
            propertyType === "building"
          ? 0.028  // 농지 외 부동산 상속(§11①1나): 2.8% (주택·비농지 토지·건물)
          : 0.04;  // 부동산 외(차량·선박 등)는 §12 등 별도 — 종전 처리 유지
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
    // 개수(改修)로 인한 취득: 지방세법 §15②1호 — 중과기준세율(2%) 적용.
    // (면적이 증가하는 개수는 §11③에 따라 그 증가분만 원시취득(2.8%)으로 보나,
    //  현행 UI는 면적 증가 여부를 입력받지 않으므로 개수 본칙 2%를 적용한다.)
    return { rate: 0.02, isLinearInterpolation: false, legalBasis: ACQUISITION.DEEMED_ACQUISITION }; // 2%
  }
  if (acquisitionCause === "deemed_land_category" || acquisitionCause === "deemed_major_shareholder") {
    // 지목변경(§7④) 및 과점주주(§7⑤): 2% 적용
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
  appliedRate: number;     // 취득세 세율 (예: 0.03) — 중과 반영된 최종 세율
  acquisitionTax: number;  // 취득세 본세 (최종 세율 기준)
  areaSqm?: number;        // 전용면적 ㎡ (농특세 85㎡ 이하 면제 판단)
  propertyType: PropertyObjectType;
  // [P4-1] 주택 유상거래 분기
  acquisitionCause?: string;
  isSurcharged?: boolean;
  // [P4-2] 중과세 교육세 매트릭스
  surchargeType?: "multi_house_8" | "multi_house_12" | "luxury_solo" | "luxury_multi" | "corp_metro" | "gift_12";
  // [P4-4] 농특세 읍·면 지역 100㎡ 분기
  isRuralRegion?: boolean;
  /**
   * [R3-01/R3-02] 표준세율(중과 전 §11·§12 세율). 부가세 산정의 기준.
   * - 농특세(§5①6호): "표준세율을 2%로 적용한 취득세액×10%" → 표준세율 성분만 2%로 치환.
   * - 지방교육세(§151①1 본문): (표준세율−2%)×20% [§11①8 주택 유상은 표준율 본세×50%×20%].
   * 미전달 시 appliedRate로 폴백(비중과에서는 동일).
   */
  basicRate?: number;
}

export interface AdditionalTaxResult {
  ruralSpecialTax: number;   // 농어촌특별세
  localEducationTax: number; // 지방교육세
  ruralTaxBasis: string;     // 농특세 계산 근거
  eduTaxBasis: string;       // 지방교육세 계산 근거
}

/** §11①7호나목(부동산 유상승계) 표준세율 4% — §13의2 중과의 표준세율 기준 */
export const SURCHARGE_BASE_STANDARD_RATE = 0.04;

/**
 * 농특세 산정 기준율(표준세율)을 중과 유형별로 결정 (농특세법 §5①6호).
 *
 * §5①6호: "「지방세법」 §11·§12의 표준세율을 100분의2로 적용하여 산출한 취득세액 × 10%".
 * → 표준세율 성분만 2%로 치환하고 중과분은 보존한다. 부가세 기준율 = 2% + 중과분,
 *   중과분 = 적용세율 − (해당 중과가 사용한 표준세율).
 */
function resolveRuralStandardRate(input: AdditionalTaxInput, basicRate: number): number {
  if (!input.isSurcharged) return input.appliedRate; // 비중과: 중과분 0 → 기준율 2% → 0.2%
  switch (input.surchargeType) {
    // §13⑤ 사치성 단독: 물건 자체의 표준세율을 기준으로 함 (표준 + 중과기준세율×400%)
    case "luxury_solo":
      return basicRate;
    // §13의2(①②③): 표준세율 = §11①7호나목 4% (다주택·증여·법인주택·사치성중복 전부)
    case "multi_house_8":
    case "multi_house_12":
    case "gift_12":
    case "luxury_multi":
    case "corp_metro":
      return SURCHARGE_BASE_STANDARD_RATE;
    // 기타 중과(법인 §13② 비주택 등): 물건 표준세율 기준 (현행 동작 유지 — 법인 정밀화는 R3-05 별도)
    default:
      return basicRate;
  }
}

/**
 * 농어촌특별세 계산 (농특세법 §5①6호·§5⑤)
 *
 * 농특세 = (표준세율을 2%로 적용하여 산출한 취득세액) × 10%
 *        = (2% + 중과분) × 과세표준 × 10%   [중과분 = 적용세율 − 기준표준세율]
 *   · 비중과: 과세표준 × 0.2% (표준율 1%·2.8%·3%·3.5% 무관하게 flat)
 *   · §13의2 8/12%(기준 4%): 0.6% / 1.0%
 *   · 사치성 단독(기준 = 물건 표준율): 항상 1.0%
 *
 * 면제(농특세법 §4):
 * - 전용면적 85㎡ 이하 주택 (전면 면제)
 * - [P4-4] 수도권 외 도시지역 외 읍·면 지역 100㎡ 이하 주택 (§4②, 지방세법 시행령 §92②)
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

  // [R3-02] 표준세율 2% 치환 + 중과분 보존. 10만분율(5자리) 정수 연산(선형보간 세율의
  // 0.5bps 초과분 보존 + 부동소수 오차 방지).
  const RATE_SCALE = 100_000;
  const basicRate = input.basicRate ?? input.appliedRate;
  const stdRate = resolveRuralStandardRate(input, basicRate); // 중과가 사용한 표준세율
  const appliedPts = Math.round(input.appliedRate * RATE_SCALE);
  const stdPts = Math.round(stdRate * RATE_SCALE);
  const surchargePts = Math.max(0, appliedPts - stdPts); // 중과분 (10만분율)
  const baseRatePts = Math.round(ACQUISITION_CONST.RURAL_STANDARD_RATE * RATE_SCALE); // 2% = 2,000
  const ruralRatePts = baseRatePts + surchargePts; // 농특세 기준율 = 2% + 중과분

  const ruralBase = Math.floor((input.taxBase * ruralRatePts) / RATE_SCALE); // 표준2% 치환 취득세액
  return Math.floor(ruralBase * ACQUISITION_CONST.RURAL_SURCHARGE_RATE); // × 10%
}

/**
 * 지방교육세 계산 (지방세법 §151①1)
 *
 * 본문: (표준세율 − 중과기준세율 2%) × 20% [§11①8 주택 유상은 표준율 본세 × 50% × 20%]
 * 가목: §13②③⑥⑦ → 본문액 × 300% (법인 §11①8 주택은 나목)
 * 나목: §13의2(①②③) → (§11①7나 4% − 2%) × 20% = 0.4% 고정
 *
 * [R3-01] 사치성재산(§13⑤)은 가목(§13②③⑥⑦)·나목(§13의2)에 없어 **본문**이 적용된다.
 *   → 중과분(8%p)을 교육세에 반영하지 않고 물건 표준세율 기준으로 산출. 종전 1.4%/1.8%
 *     하드코딩(중과분 반영)은 법 근거 없는 과다과세였다.
 */
export function calcLocalEducationTax(input: AdditionalTaxInput): number {
  const { taxBase, acquisitionTax, propertyType, acquisitionCause, isSurcharged, surchargeType } = input;
  const basicRate = input.basicRate ?? input.appliedRate; // 표준세율(중과 전)

  // [M3] §151①1 본문 괄호: §15②에 해당(개수·§7④ 지목변경·§7⑤ 과점주주 간주취득)은
  // 지방교육세 과세대상 제외 → 0원.
  const isDeemedAcquisition =
    acquisitionCause === "deemed_renovation" ||
    acquisitionCause === "deemed_land_category" ||
    acquisitionCause === "deemed_major_shareholder";
  if (isDeemedAcquisition) {
    return 0;
  }

  // [R3-01] 나목 §13의2(①②③): (§11①7나 4% − 2%) × 20% = 0.4% 고정.
  //   다주택 8/12%·증여 12%·법인주택 12%(§13의2①1호, §151①1가 단서로 나목)·
  //   사치성+다주택 중복 §13의2③(luxury_multi) 전부 해당.
  const isSection13of2 =
    surchargeType === "multi_house_8" ||
    surchargeType === "multi_house_12" ||
    surchargeType === "gift_12" ||
    surchargeType === "luxury_multi" ||
    surchargeType === "corp_metro";
  if (isSection13of2) {
    return Math.floor(taxBase * ACQUISITION_CONST.RURAL_STANDARD_RATE * ACQUISITION_CONST.EDU_RATE); // 0.4%
  }

  // [R3-01] 본문(표준세율 기준) — 사치성 단독(§13⑤)·비중과·법인 §13② 비주택 등.
  //   ★ 사치성은 중과분을 교육세에 반영하지 않는다. 표준세율(basicRate)로 산출.
  const isHousingOnerous =
    propertyType === "housing" &&
    ["purchase", "exchange", "auction", "in_kind_investment"].includes(acquisitionCause ?? "");

  if (isHousingOnerous) {
    // §151①1 본문 괄호: §11①8 표준세율(1~3%) 적용 취득세액 × 50% × 20%.
    // 사치성이면 표준본세 = taxBase×basicRate. 비중과면 acquisitionTax가 곧 표준본세
    // (6~9억 선형보간 BigInt 정밀도 보존).
    const standardTax = isSurcharged ? Math.floor(taxBase * basicRate) : acquisitionTax;
    return Math.floor(standardTax * 0.5 * ACQUISITION_CONST.EDU_RATE);
  }

  // 본문 그 외(상속·증여·원시·비주택 유상·사치성 비주택): (표준세율 − 2%) × 20%.
  // 부동소수 오차 방지: 10만분율 정수 연산.
  const RATE_SCALE = 100_000;
  const ratePoints = Math.round(basicRate * RATE_SCALE);
  const standardRatePoints = Math.round(ACQUISITION_CONST.RURAL_STANDARD_RATE * RATE_SCALE);
  const excessRatePoints = Math.max(0, ratePoints - standardRatePoints);
  const eduBaseAmount = Math.floor((taxBase * excessRatePoints) / RATE_SCALE); // (표준−2%)×과세표준
  return Math.floor(eduBaseAmount * ACQUISITION_CONST.EDU_RATE); // × 20%
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
    basicRate?: number;
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
    basicRate: options?.basicRate,
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
  acquisitionValue: number,
  surchargeRates?: {
    /** 유상분 §13의2① 다주택 중과세율 (해당 시). 없으면 매매 표준세율(6~9억 선형보간 포함) */
    onerousRate?: number;
    /** 무상분 §13의2② 증여 중과세율 (해당 시). 없으면 증여 3.5% */
    gratuitousRate?: number;
  }
): {
  onerousTax: number;
  gratuitousTax: number;
  onerousRate: number;
  gratuitousRate: number;
} {
  // 유상 부분: 다주택 중과세율이 있으면 그 세율(flat), 없으면 매매세율
  // (세율 구간 판정은 전체 취득가액 기준 — 지방세법 §11①8 취득당시가액 기준)
  let onerousTax: number;
  let onerousRate: number;
  if (surchargeRates?.onerousRate !== undefined) {
    onerousRate = surchargeRates.onerousRate;
    onerousTax = Math.floor(onerousTaxBase * onerousRate);
  } else {
    const basic = getBasicRate(propertyType, "purchase", acquisitionValue);
    onerousRate = basic.rate;
    if (basic.isLinearInterpolation) {
      // 6~9억 선형보간 구간: 유상분 × 전체기준 보간세율을 BigInt로 정밀 계산.
      // isLinearInterpolation=true ⇒ 6억<acquisitionValue<9억 ⇒ (전체×2−9억)>3억>0 (음수 없음).
      const numerator = BigInt(onerousTaxBase) * (BigInt(acquisitionValue) * 2n - 900_000_000n);
      onerousTax = Number(numerator / 30_000_000_000n);
    } else {
      onerousTax = Math.floor(onerousTaxBase * onerousRate);
    }
  }

  // 무상 부분: 증여 중과세율(§13의2②)이 있으면 그 세율, 없으면 증여 3.5%
  const gratuitousRate = surchargeRates?.gratuitousRate ?? 0.035;
  const gratuitousTax = Math.floor(gratuitousTaxBase * gratuitousRate);

  return { onerousTax, gratuitousTax, onerousRate, gratuitousRate };
}
