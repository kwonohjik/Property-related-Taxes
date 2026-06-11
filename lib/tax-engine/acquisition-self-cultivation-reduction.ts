/**
 * 자경농지 취득세 감면 — 지방세특례제한법 §6
 *
 * [P2-5] 2년 이상 직접 경작 농민의 농지 취득세 50% 감면 (지특법 §6①, 2026.12.31까지)
 *
 * 감면 요건:
 *   - 본문(§6①): 2년 이상 영농 종사 + 직접 경작 목적 농지 취득 → 50% 경감
 *   - 시행령(지특법 시행령 §3): 거주·거리·면적 등 세부 기준
 *     · 농지 소재지로부터 30km 이내 거주 (시행령 §3①2호·§3②2호 — 귀농인 §6④ 본문과 동일)
 *     · 취득 농지 면적 한도 (시행령 기준)
 *
 * 감면액: 취득세 본세 × 50%
 *
 * 감면 중복배제 (지방세특례제한법 §180):
 *   생애최초 감면(지특법 §36의3)과 동시 해당 시 감면되는 세액이 큰 1건만 적용
 *   (취득세는 조특법 §127이 아닌 지특법 §180이 근거 — KoreanLaw 2026-06-11 확인)
 */

import { ACQUISITION, ACQUISITION_CONST } from "./legal-codes";

// ============================================================
// 자경농지 감면 입력 타입
// ============================================================

export interface SelfCultivationInput {
  /** 취득자가 2년 이상 영농 종사자 여부 */
  isSelfCultivatedFarmer?: boolean;
  /** 영농 종사 연수 */
  farmingYears?: number;
  /** 취득 농지 면적 (㎡) */
  farmlandArea?: number;
  /** 농지 소재지에서 거주지까지 거리 (km) */
  farmlandLocationDistance?: number;
  /** 취득세 본세 (감면 계산 기준) */
  acquisitionTax: number;
  /** 물건 유형 (농지 여부 확인) */
  propertyType: string;
  /** 취득 원인 (유상취득 여부 확인) */
  acquisitionCause: string;
}

// ============================================================
// 자경농지 감면 결과 타입
// ============================================================

export interface SelfCultivationReductionResult {
  /** 감면 요건 충족 여부 */
  isEligible: boolean;
  /** 감면액 (원) */
  reductionAmount: number;
  /** 미충족 요건 */
  ineligibleReasons: string[];
  /** 법적 근거 */
  legalBasis: string;
  /** 경고·안내 메시지 */
  warnings: string[];
}

// ============================================================
// 메인 함수: assessSelfCultivationReduction
// ============================================================

/**
 * 자경농지 취득세 50% 감면 적용 판정
 *
 * 순수 함수 — DB 직접 호출 없음.
 *
 * @param input 자경농지 감면 입력
 * @returns 감면 적용 여부 + 감면액
 *
 * @example
 * // 농지 매매 3%, 취득세 본세 1,500만원
 * assessSelfCultivationReduction({
 *   isSelfCultivatedFarmer: true,
 *   farmingYears: 5,
 *   farmlandArea: 3000,
 *   farmlandLocationDistance: 15,
 *   acquisitionTax: 15_000_000,
 *   propertyType: "land_farmland",
 *   acquisitionCause: "purchase",
 * })
 * // → reductionAmount: 7_500_000 (50%)
 */
export function assessSelfCultivationReduction(
  input: SelfCultivationInput
): SelfCultivationReductionResult {
  const warnings: string[] = [];
  const ineligibleReasons: string[] = [];

  // 기본 확인: 자경농지 감면 여부 플래그가 없으면 미신청
  if (!input.isSelfCultivatedFarmer) {
    return {
      isEligible: false,
      reductionAmount: 0,
      ineligibleReasons: ["자경농지 감면 미신청"],
      legalBasis: ACQUISITION.SELF_CULTIVATION_REDUCTION,
      warnings,
    };
  }

  // 물건 유형 확인: 농지여야 적용 (land_farmland)
  if (input.propertyType !== "land_farmland") {
    ineligibleReasons.push(
      `취득 물건이 농지(land_farmland)가 아님 (현재: ${input.propertyType})`
    );
  }

  // 취득 원인 확인: 유상취득만 해당 (매매·공매경매 등)
  const onerousCauses = ["purchase", "exchange", "auction", "in_kind_investment"];
  if (!onerousCauses.includes(input.acquisitionCause)) {
    ineligibleReasons.push(
      `자경농지 감면은 유상취득(매매·공매경매 등)에만 적용 (현재 원인: ${input.acquisitionCause})`
    );
  }

  // 요건 1: 2년 이상 영농 종사
  const farmingYears = input.farmingYears ?? 0;
  if (farmingYears < ACQUISITION_CONST.SELF_CULTIVATION_MIN_YEARS) {
    ineligibleReasons.push(
      `영농 종사 연수 부족 (현재 ${farmingYears}년, 요건 ${ACQUISITION_CONST.SELF_CULTIVATION_MIN_YEARS}년 이상)`
    );
  }

  // 요건 2: 거리 요건 — 농지 소재지에서 거주지까지 30km 이내 (지특법 시행령 §3①2호·§3②2호)
  const distanceKm = input.farmlandLocationDistance;
  if (distanceKm !== undefined && distanceKm > ACQUISITION_CONST.SELF_CULTIVATION_MAX_DISTANCE_KM) {
    ineligibleReasons.push(
      `거주지-농지 거리 초과 (현재 ${distanceKm}km, 요건 ${ACQUISITION_CONST.SELF_CULTIVATION_MAX_DISTANCE_KM}km 이내)`
    );
  }

  // 요건 3: 면적 요건 — 20,000㎡ 이하
  const farmlandArea = input.farmlandArea;
  if (farmlandArea !== undefined && farmlandArea > ACQUISITION_CONST.SELF_CULTIVATION_MAX_AREA) {
    ineligibleReasons.push(
      `취득 농지 면적 초과 (현재 ${farmlandArea.toLocaleString()}㎡, 요건 ${ACQUISITION_CONST.SELF_CULTIVATION_MAX_AREA.toLocaleString()}㎡ 이하)`
    );
    warnings.push(
      `면적 초과분(${(farmlandArea - ACQUISITION_CONST.SELF_CULTIVATION_MAX_AREA).toLocaleString()}㎡)은 감면 제외. ` +
      `부분 감면이 가능한지 여부는 세무사 확인 권장.`
    );
  }

  // 요건 불충족 시 감면 불가
  if (ineligibleReasons.length > 0) {
    return {
      isEligible: false,
      reductionAmount: 0,
      ineligibleReasons,
      legalBasis: ACQUISITION.SELF_CULTIVATION_REDUCTION,
      warnings,
    };
  }

  // 감면액 계산: 취득세 본세 × 50%
  const reductionAmount = Math.floor(
    input.acquisitionTax * ACQUISITION_CONST.SELF_CULTIVATION_REDUCTION_RATE
  );

  // 사후 관리 안내 (추징 사유)
  warnings.push(
    `자경농지 감면 적용 — ${ACQUISITION.SELF_CULTIVATION_REDUCTION}. ` +
    "취득일로부터 3년 내 농업 외 용도 변경·매도 시 감면세액 추징됩니다."
  );

  return {
    isEligible: true,
    reductionAmount,
    ineligibleReasons: [],
    legalBasis: ACQUISITION.SELF_CULTIVATION_REDUCTION,
    warnings,
  };
}
