/**
 * 취득세 부가세 정밀 계산 모듈 (Phase 4)
 *
 * [P4-1] 지방교육세 — 주택 유상거래 분기 (지방세법 §151①1나)
 * [P4-2] 중과세 시 지방교육세 매트릭스 (다주택 8%/12%, 사치성 단독·중복)
 * [P4-4] 농어촌특별세 — 읍·면 지역 100㎡ 이하 비과세 분기
 *
 * 800줄 정책 준수: acquisition-tax-rate.ts에서 분리.
 * acquisition-tax-rate.ts의 calcTaxWithAdditional은 이 모듈을 호출한다.
 */

import { ACQUISITION, ACQUISITION_CONST } from "./legal-codes";
import type { PropertyObjectType, AcquisitionCause } from "./types/acquisition.types";
import type { SurchargeDecision } from "./types/acquisition.types";

// ============================================================
// 유상취득 원인 판정 유틸
// ============================================================

/**
 * 주택 유상거래(매매·공매경매·교환·현물출자) 여부
 *
 * 지방세법 §151①1나 지방교육세 분기 기준:
 * "주택 유상취득세율 적용 대상" — 6억 이하 1%, 6~9억 선형보간, 9억 초과 3% 구간에 해당
 */
export function isOnerousPurchaseForEduTax(
  propertyType: PropertyObjectType,
  acquisitionCause: AcquisitionCause
): boolean {
  if (propertyType !== "housing") return false;
  return ["purchase", "exchange", "auction", "in_kind_investment"].includes(acquisitionCause);
}

// ============================================================
// [P4-1] 지방교육세 — 주택 유상거래 분기 (§151①1나)
// ============================================================

/**
 * 지방교육세 계산 (Phase 4 정밀화)
 *
 * [P4-1] 지방세법 §151①1나: 주택 유상거래 시
 *   지방교육세 = 취득세 본세 × 50% × 20% = 취득세 본세 × 10%
 *
 * [P4-2] 중과세 시 분기:
 *   - 다주택 8%/12%: 지방교육세 = 과세표준 × 2% × 20% = 0.4%
 *     (§151에서 "표준세율분"은 4%가 아닌 2% 기준이므로 중과세 세율 무관하게 동일)
 *   - 사치성 단독 (+8%p): 지방교육세 = 과세표준 × 2% × 20% = 0.4%
 *     단, §151①1나 주택 유상거래 분기이면 본세 × 50% × 20% 적용
 *   - 사치성 + 다주택 중복 (+8%p): 지방교육세 0.4%
 *
 * 그 외: 지방교육세 = 과세표준 × 표준세율 2% × 20% = 과세표준 × 0.4%
 *
 * @param taxBase          과세표준
 * @param acquisitionTax   취득세 본세
 * @param propertyType     물건 유형
 * @param acquisitionCause 취득 원인
 * @returns { localEducationTax: number; method: "housing_purchase" | "standard_rate_base" }
 */
export function calcLocalEducationTaxV2(
  taxBase: number,
  acquisitionTax: number,
  propertyType: PropertyObjectType,
  acquisitionCause: AcquisitionCause
): { localEducationTax: number; method: "housing_purchase" | "standard_rate_base" } {
  // [P4-1] 주택 유상거래 분기 (§151①1나)
  // 주택 유상취득세율(1%·선형보간·3%) 적용 대상에만 적용
  // 중과세가 적용된 경우(8%·12%)에도 유상거래이므로 이 분기 진입하나
  // 중과세 주택은 실질적으로 §151①1나 "주택 유상취득세율 적용 주택" 해당.
  // 단, 중과세 본세 기준으로 계산하면 금액이 커지므로 지법 해석상
  // §151①1나는 표준세율(1~3%) 기준 주택에만 적용되고
  // 중과세 주택은 일반 조항(§151①1가: 표준세율분×20%)으로 처리된다.
  // → 판단: isOnerousPurchaseForEduTax만으로는 중과 여부를 모름.
  //   acquisition-tax-additional.ts 수준에서는 호출 시점(메인 엔진)에서
  //   isSurcharged 정보를 넘겨받아 분기.
  // 현재 함수는 isSurcharged 없이 호출되는 경우를 처리(기본 분기).
  // 중과세 포함 완전 버전은 calcLocalEducationTaxFull에서 처리.

  if (isOnerousPurchaseForEduTax(propertyType, acquisitionCause)) {
    // §151①1나: 취득세 본세 × 50% × 20%
    const localEducationTax = Math.floor(acquisitionTax * 0.5 * 0.2);
    return { localEducationTax, method: "housing_purchase" };
  }

  // 그 외: 과세표준 × 표준세율 2% × 20% = 과세표준 × 0.4%
  const localEducationTax = Math.floor(taxBase * ACQUISITION_CONST.RURAL_STANDARD_RATE * ACQUISITION_CONST.EDU_RATE);
  return { localEducationTax, method: "standard_rate_base" };
}

// ============================================================
// [P4-2] 중과세 포함 지방교육세 완전 계산
// ============================================================

/**
 * 중과세 분기 유형
 *
 * appliedBranch가 SurchargeDecision에 있으나 이 모듈에서는
 * 직접 분기 유형을 받아 지방교육세 산출 방식 결정.
 */
export type SurchargeBranchForEdu =
  | "luxury_solo"     // 사치성 단독 (+8%p)
  | "luxury_multi"    // 사치성 + 다주택 중복 (+8%p on top)
  | "luxury_corp"     // 사치성 + 대도시 법인 중복
  | "corp_housing"    // 법인 주택 12%
  | "multi_house_8"   // 조정 2주택 / 비조정 3주택 (8%)
  | "multi_house_12"  // 조정 3주택+ / 비조정 4주택+ (12%)
  | "gift_12"         // 무상취득 조정지역 3억+ (12%)
  | "basic";          // 기본세율 (중과 없음)

/**
 * 중과세 포함 지방교육세 완전 계산 (Phase 4)
 *
 * [P4-2] 중과세 분기별 지방교육세 매트릭스:
 *
 * | 분기              | 지방교육세 산출식                          | 실효율        |
 * |-------------------|--------------------------------------------|---------------|
 * | basic (1%~3%)     | 본세 × 50% × 20% (주택 유상거래)          | 본세 × 10%    |
 * | basic (기타)      | 과세표준 × 2% × 20%                       | 과세표준 × 0.4% |
 * | multi_house_8 (8%)| 과세표준 × 2% × 20%                       | 과세표준 × 0.4% |
 * | multi_house_12(12%)| 과세표준 × 2% × 20%                      | 과세표준 × 0.4% |
 * | corp_housing (12%)| 과세표준 × 2% × 20%                       | 과세표준 × 0.4% |
 * | gift_12 (12%)     | 과세표준 × 2% × 20%                       | 과세표준 × 0.4% |
 * | luxury_solo       | 과세표준 × 2% × 20% (기본 교육세 유지)    | 과세표준 × 0.4% |
 *
 * ※ §151 해석 주의:
 *   - 지방교육세는 "취득세 표준세율분" 기준 계산이 원칙.
 *   - 주택 유상거래의 경우 §151①1나에서 특별히 "취득세 × 50%"로 규정.
 *   - 중과세율이 적용된 경우 §151①1나의 "주택 유상취득세율 적용" 범위에서
 *     벗어나므로 일반 §151 규정(표준세율분 × 20%)으로 환원.
 *
 * @param taxBase           과세표준
 * @param acquisitionTax    취득세 본세 (중과 포함)
 * @param propertyType      물건 유형
 * @param acquisitionCause  취득 원인
 * @param surchargeBranch   적용된 중과 분기 (SurchargeDecision.appliedBranch)
 * @returns { localEducationTax, method }
 */
export function calcLocalEducationTaxFull(
  taxBase: number,
  acquisitionTax: number,
  propertyType: PropertyObjectType,
  acquisitionCause: AcquisitionCause,
  surchargeBranch: SurchargeBranchForEdu
): { localEducationTax: number; method: "housing_purchase" | "standard_rate_base" } {
  // 중과세 적용 시 — 모든 중과 분기는 표준세율 2% 기준 교육세 적용
  if (surchargeBranch !== "basic") {
    const localEducationTax = Math.floor(
      taxBase * ACQUISITION_CONST.RURAL_STANDARD_RATE * ACQUISITION_CONST.EDU_RATE
    );
    return { localEducationTax, method: "standard_rate_base" };
  }

  // 중과 없음 — P4-1 분기 적용
  return calcLocalEducationTaxV2(taxBase, acquisitionTax, propertyType, acquisitionCause);
}

// ============================================================
// [P4-4] 농어촌특별세 — 읍·면 지역 100㎡ 비과세 분기
// ============================================================

/**
 * 주택의 농어촌특별세 면적 면제 기준 결정 (Phase 4)
 *
 * [P4-4] 농어촌특별세법 §4②6호:
 *   - 수도권 외 도시지역 외 읍·면 지역: 100㎡ 이하 비과세
 *   - 그 외(일반): 85㎡ 이하 비과세
 *
 * @param isRuralRegion 읍·면 지역 여부 (농어촌특별세법 §4②6호 적용 여부)
 * @returns 면제 기준 면적 ㎡
 */
export function getRuralSpecialTaxExemptArea(isRuralRegion: boolean): number {
  return isRuralRegion
    ? ACQUISITION_CONST.RURAL_EXEMPT_AREA_SQM_RURAL_REGION  // 100㎡
    : ACQUISITION_CONST.RURAL_EXEMPT_AREA_SQM;               // 85㎡
}

// ============================================================
// 부가세 통합 계산 (Phase 4 — 완전 버전)
// ============================================================

export interface AdditionalTaxFullInput {
  taxBase: number;
  appliedRate: number;
  acquisitionTax: number;
  propertyType: PropertyObjectType;
  acquisitionCause: AcquisitionCause;
  /** 전용면적 ㎡ (농특세 면제 판단) */
  areaSqm?: number;
  /** [P4-4] 읍·면 지역 여부 (100㎡ 면제 분기) */
  isRuralRegion?: boolean;
  /**
   * 적용된 중과 분기 (SurchargeDecision.appliedBranch)
   * 없으면 "basic" 처리
   */
  surchargeBranch?: SurchargeBranchForEdu;
}

export interface AdditionalTaxFullResult {
  ruralSpecialTax: number;
  localEducationTax: number;
  /** 지방교육세 산출 방식 */
  eduTaxMethod: "housing_purchase" | "standard_rate_base";
  /** 주택 유상거래 §151①1나 적용 여부 (P4-1) */
  isHousingPurchaseEduRule: boolean;
  /** 농특세 읍·면 지역 100㎡ 면제 적용 여부 (P4-4) */
  isRuralExemption: boolean;
  /** 농특세 근거 조문 */
  ruralTaxBasis: string;
  /** 지방교육세 근거 조문 */
  eduTaxBasis: string;
}

/**
 * 농어촌특별세 계산 (Phase 4 정밀화)
 *
 * [P4-4] 읍·면 지역 100㎡ 분기 + 기존 85㎡ 분기 통합
 */
function calcRuralSpecialTaxV2(
  taxBase: number,
  appliedRate: number,
  propertyType: PropertyObjectType,
  areaSqm: number | undefined,
  isRuralRegion: boolean
): { ruralSpecialTax: number; isRuralExemption: boolean } {
  if (propertyType === "housing" && areaSqm !== undefined) {
    const exemptLimit = getRuralSpecialTaxExemptArea(isRuralRegion);
    if (areaSqm <= exemptLimit) {
      return {
        ruralSpecialTax: 0,
        isRuralExemption: isRuralRegion && areaSqm > ACQUISITION_CONST.RURAL_EXEMPT_AREA_SQM,
      };
    }
  }

  // 세율 2% 이하 → 0원 (bps 정수 비교 — 부동소수점 오차 방지)
  const ratePoints = Math.round(appliedRate * 10000);
  const standardRatePoints = 200; // 2% = 200 bps

  if (ratePoints <= standardRatePoints) {
    return { ruralSpecialTax: 0, isRuralExemption: false };
  }

  // 농특세 = (적용세율 - 2%) × 과세표준 × 10%
  const excessRatePoints = ratePoints - standardRatePoints;
  const excessTax = Math.floor(taxBase * excessRatePoints / 10000);
  const ruralSpecialTax = Math.floor(excessTax * ACQUISITION_CONST.RURAL_SURCHARGE_RATE);

  return { ruralSpecialTax, isRuralExemption: false };
}

/**
 * 취득세 부가세 통합 계산 (Phase 4 완전 버전)
 *
 * P4-1/P4-2/P4-4를 모두 반영한 최종 부가세 계산.
 * 기존 calcTaxWithAdditional을 대체하여 메인 엔진에서 호출.
 */
export function calcAdditionalTaxesFull(
  input: AdditionalTaxFullInput
): AdditionalTaxFullResult {
  const branch = input.surchargeBranch ?? "basic";
  const isRuralRegion = input.isRuralRegion ?? false;

  // ── 농어촌특별세 (P4-4 분기 포함) ──
  const { ruralSpecialTax, isRuralExemption } = calcRuralSpecialTaxV2(
    input.taxBase,
    input.appliedRate,
    input.propertyType,
    input.areaSqm,
    isRuralRegion
  );

  // ── 지방교육세 (P4-1/P4-2 분기) ──
  const { localEducationTax, method: eduTaxMethod } = calcLocalEducationTaxFull(
    input.taxBase,
    input.acquisitionTax,
    input.propertyType,
    input.acquisitionCause,
    branch
  );

  const isHousingPurchaseEduRule = eduTaxMethod === "housing_purchase";

  return {
    ruralSpecialTax,
    localEducationTax,
    eduTaxMethod,
    isHousingPurchaseEduRule,
    isRuralExemption,
    ruralTaxBasis: isRuralRegion
      ? ACQUISITION.RURAL_RURAL_REGION_EXEMPT
      : ACQUISITION.RURAL_SPECIAL_TAX,
    eduTaxBasis: isHousingPurchaseEduRule
      ? ACQUISITION.LOCAL_EDU_HOUSING_PURCHASE
      : ACQUISITION.LOCAL_EDUCATION_TAX,
  };
}
