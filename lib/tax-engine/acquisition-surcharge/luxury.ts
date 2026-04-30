/**
 * 사치성 재산 중과세율 판정 모듈
 *
 * [P1-1] calcLuxurySurchargeRate — 3분기 (단독/다주택중복/대도시법인중복)
 * [v3] §13⑦ — 사치성 + 대도시 법인(§13②) 중복 분기
 *
 * 지방세법 §13⑤: 사치성 단독 — 표준세율 + 중과기준세율×400%(=8%p)
 * 지방세법 §13의2③: 사치성 + 다주택 중복 — §13의2① 세율 + 8%p
 * 지방세법 §13⑦: 사치성 + 대도시 법인 중복
 *   - 주택 외: 표준세율×300% + 중과기준세율×200% = 4%×3 + 4%p = 16%
 *   - 주택(§11①8): 해당 세율 + 중과기준세율×600% = basicRate + 12%p
 *
 * 사치성 재산 5종: 별장·골프장·고급주택·고급오락장·고급선박
 *
 * 별장 폐지 주의 (§13⑤ 한정):
 * - 2023.3.14 이후 잔금일: 별장 중과 자체 미적용
 * - §13의2 다주택 중과와는 **무관** (별장은 주택 아님 → 다주택 카운트 미포함)
 * - 코드 주석: "별장 폐지는 사치성 분기에만 영향 — 다주택 중과 분기에서는 별장 입력 자체가 의미 없음"
 */

import { ACQUISITION, ACQUISITION_CONST } from "../legal-codes";
import { SURCHARGE_RATES } from "./multi-house";

// ============================================================
// 사치성 재산 유형
// ============================================================

/** 사치성 재산 5종 (지방세법 §13⑤) */
export type LuxuryPropertyType =
  | "villa"                // 별장 (2023.3.14 이후 중과 폐지)
  | "golf_course"          // 골프장
  | "luxury_housing"       // 고급주택
  | "luxury_entertainment" // 고급오락장
  | "luxury_vessel";       // 고급선박

// ============================================================
// P1-1: 별장 중과 폐지 시점 판정
// ============================================================

/**
 * [P1-1] 별장 중과 적용 여부 (§13⑤ 한정)
 *
 * 별장 폐지는 사치성(§13⑤) 분기에만 영향.
 * §13의2 다주택 중과 분기에서는 별장 입력 자체가 의미 없음
 * (별장은 주택이 아니므로 다주택 카운트에 미포함).
 *
 * @param balanceDate 잔금일 (YYYY-MM-DD)
 * @returns true이면 별장 중과 여전히 적용, false이면 폐지됨
 */
export function isVillaLuxurySurchargeApplicable(balanceDate: string | undefined): boolean {
  if (!balanceDate) return true; // 날짜 미입력 시 보수적으로 적용
  // 2023.3.14 이후 잔금일: 별장 중과 폐지
  return balanceDate < "2023-03-14";
}

// ============================================================
// P1-1: 사치성 중과세율 3분기 계산
// ============================================================

/** 사치성 중과 컨텍스트 */
export interface LuxuryContext {
  /** 취득 주택의 다주택 중과세율 (해당 시, 예: 0.08, 0.12) */
  multiHouseRate?: number;
  /** 대도시 법인(§13②) 중과 해당 여부 (§13⑦ 분기용) */
  isCorpMetroSurcharge?: boolean;
  /** 주택 여부 (§13⑦ 주택/비주택 분기용) */
  isHousing?: boolean;
  /** 기본세율 (§13⑤ 및 §13⑦ 계산용) */
  basicRate: number;
  /** 사치성 재산 유형 */
  luxuryType?: LuxuryPropertyType;
  /** 잔금일 (별장 폐지 판단용) */
  balanceDate?: string;
}

/** 사치성 중과 판정 결과 */
export interface LuxurySurchargeResult {
  isSurcharged: boolean;
  surchargeRate?: number;
  appliedBranch: "luxury_solo" | "luxury_multi" | "luxury_corp" | "villa_abolished" | "none";
  reason: string;
  legalBasis: string[];
}

/**
 * [P1-1] 사치성 재산 중과세율 계산 — 3분기
 *
 * 분기 1 (단독 사치성, §13⑤): basicRate + 8%p
 * 분기 2 (사치성 + 다주택 중복, §13의2③): multiHouseRate + 8%p
 * 분기 3 (사치성 + 대도시 법인 중복, §13⑦):
 *   - 주택: basicRate + 12%p
 *   - 주택 외: basicRate × 3 + 4%p
 *
 * 예시 검산:
 * - 토지 매매 일반 4% → 사치성 단독: 4% + 8% = 12%
 * - 9억 초과 주택 매매 3% → 사치성 단독: 3% + 8% = 11%
 * - 6억 이하 주택 매매 1% → 사치성 단독: 1% + 8% = 9%
 * - 조정 2주택 8% + 고급주택: 8% + 8% = 16%
 * - 조정 3주택 12% + 고급주택: 12% + 8% = 20%
 * - 대도시 법인 + 사치성 토지 4%: 4%×3 + 4%p = 16%
 * - 대도시 법인 + 사치성 9억 초과 주택 3%: 3% + 12%p = 15%
 */
export function calcLuxurySurchargeRate(ctx: LuxuryContext): LuxurySurchargeResult {
  const { basicRate, multiHouseRate, isCorpMetroSurcharge, isHousing, luxuryType, balanceDate } = ctx;

  // 별장 중과 폐지 확인 (§13⑤ 한정)
  if (luxuryType === "villa") {
    if (!isVillaLuxurySurchargeApplicable(balanceDate)) {
      return {
        isSurcharged: false,
        appliedBranch: "villa_abolished",
        reason: "별장 중과세율은 2023년 3월 14일 이후 폐지되었습니다 (지방세법 §13⑤ 개정). 기본세율 적용.",
        legalBasis: [ACQUISITION.LUXURY_SURCHARGE],
      };
    }
  }

  // 분기 3: 사치성 + 대도시 법인 중복 (§13⑦)
  if (isCorpMetroSurcharge) {
    if (isHousing) {
      // §13⑦ 단서: 주택(§11①8) → 해당 세율 + 중과기준세율×600%(=12%p)
      const rate = basicRate + ACQUISITION_CONST.LUXURY_CORP_METRO_HOUSING_ADDITION;
      return {
        isSurcharged: true,
        surchargeRate: rate,
        appliedBranch: "luxury_corp",
        reason: `사치성 + 대도시 법인 중복(§13⑦ 단서) 주택: ${(basicRate * 100).toFixed(4)}% + 12%p = ${(rate * 100).toFixed(4)}%`,
        legalBasis: [ACQUISITION.LUXURY_AND_CORP_METRO, ACQUISITION.LUXURY_SURCHARGE],
      };
    } else {
      // §13⑦ 본문: 주택 외 → 표준세율×300% + 중과기준세율×200%(=4%p)
      // 표준세율(§11①7나) = 4%이므로: 4%×3 + 4%p = 16%
      const rate = basicRate * ACQUISITION_CONST.LUXURY_CORP_METRO_STANDARD_MULTIPLIER
        + ACQUISITION_CONST.LUXURY_CORP_METRO_ADDITION;
      return {
        isSurcharged: true,
        surchargeRate: rate,
        appliedBranch: "luxury_corp",
        reason: `사치성 + 대도시 법인 중복(§13⑦ 본문) 비주택: ${(basicRate * 100).toFixed(4)}%×3 + 4%p = ${(rate * 100).toFixed(4)}%`,
        legalBasis: [ACQUISITION.LUXURY_AND_CORP_METRO, ACQUISITION.LUXURY_SURCHARGE],
      };
    }
  }

  // 분기 2: 사치성 + 다주택 중과 중복 (§13의2③)
  // 다주택 중과가 적용되는 경우: §13의2① 세율(8% 또는 12%)에 8%p 가산
  if (multiHouseRate !== undefined && multiHouseRate > 0) {
    const rate = multiHouseRate + ACQUISITION_CONST.LUXURY_SURCHARGE_ADDITION;
    return {
      isSurcharged: true,
      surchargeRate: rate,
      appliedBranch: "luxury_multi",
      reason: `사치성 + 다주택 중과 중복(§13의2③): ${(multiHouseRate * 100).toFixed(0)}% + 8%p = ${(rate * 100).toFixed(0)}%`,
      legalBasis: [ACQUISITION.LUXURY_AND_MULTI_HOUSE, ACQUISITION.LUXURY_SURCHARGE],
    };
  }

  // 분기 1: 단독 사치성 (§13⑤) — 표준세율 + 중과기준세율×400%(=8%p)
  const rate = basicRate + ACQUISITION_CONST.LUXURY_SURCHARGE_ADDITION;
  return {
    isSurcharged: true,
    surchargeRate: rate,
    appliedBranch: "luxury_solo",
    reason: `사치성 재산 단독 중과(§13⑤): ${(basicRate * 100).toFixed(4).replace(/\.?0+$/, "")}% + 8%p = ${(rate * 100).toFixed(4).replace(/\.?0+$/, "")}%`,
    legalBasis: [ACQUISITION.LUXURY_SURCHARGE],
  };
}

// ============================================================
// 사치성 + 다주택 중복 적용 여부 판단
// ============================================================

/**
 * 사치성 + 다주택 중과 중복 적용 여부 확인
 *
 * 고급주택이면서 다주택 중과에도 해당하는지 판단.
 * 해당 시 calcLuxurySurchargeRate에 multiHouseRate 전달.
 */
export function getLuxuryWithMultiHouseRate(
  multiHouseRate: number | undefined,
  isLuxuryHousing: boolean
): number | undefined {
  if (!isLuxuryHousing) return undefined;
  // 다주택 중과에 해당하면서 고급주택인 경우: 다주택 중과율 전달
  return multiHouseRate;
}

export const LUXURY_LEGAL_BASIS = [
  ACQUISITION.LUXURY_SURCHARGE,
  ACQUISITION.LUXURY_AND_MULTI_HOUSE,
  ACQUISITION.LUXURY_AND_CORP_METRO,
] as const;

// 재수출 (index.ts에서 활용)
export { SURCHARGE_RATES };
