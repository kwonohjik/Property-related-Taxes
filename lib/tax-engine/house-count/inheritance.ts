/**
 * 공동상속 주택 수 산정 모듈 (P3-8)
 *
 * 지방세법 시행령 §28의4⑤ — 공동상속 주택 소유자 판정:
 *   공동 소유 주택은 지분이 가장 큰 상속인의 소유로 봄.
 *   동순위 시: 거주자 우선 → 최연장자 우선.
 *
 * 지방세법 시행령 §28의4⑥3호 — 상속 5년 미경과 제외:
 *   상속개시일부터 5년 미경과 주택·입주권·분양권·오피스텔 → 주택 수에서 제외.
 *
 * 5년 경과 후에는 주된 상속자만 카운트.
 * 주된 상속자가 아니면 카운트에서 제외.
 */

import { ACQUISITION } from "../legal-codes";
import { differenceInYears } from "date-fns";

// ============================================================
// 5년 미경과 제외 판정
// ============================================================

/**
 * [P3-8] 상속 5년 미경과 여부 판정
 *
 * §28의4⑥3호: 상속개시일부터 5년 미경과 주택·입주권·분양권·오피스텔 → 주택 수 제외
 *
 * @param inheritanceDate 상속개시일 (YYYY-MM-DD)
 * @param referenceDate 기준일 (주택 수 산정일, YYYY-MM-DD)
 * @returns 5년 미경과 여부 (true = 제외 대상)
 */
export function isExcludedBy5YearRule(
  inheritanceDate: string,
  referenceDate: string
): boolean {
  const inheritedAt = new Date(inheritanceDate);
  const refDate = new Date(referenceDate);
  const years = differenceInYears(refDate, inheritedAt);
  return years < 5;
}

// ============================================================
// 주된 상속자 판정
// ============================================================

export interface MainInheritorInput {
  /** 납세자(본인)의 상속 지분율 (0~1) */
  shareOfTaxpayer: number;
  /** 상속인 중 최대 지분율 (다른 상속인 포함, 비교 기준) */
  maxShareInInheritors: number;
  /**
   * 동순위 여부
   * shareOfTaxpayer == maxShareInInheritors 이면 동순위
   */
  tieInMaxShare: boolean;
  /**
   * 납세자가 상속 주택 거주자인지 (동순위 시 거주자 우선)
   * §28의4⑤: 거주자 우선 → 최연장자 우선 순서
   */
  isResident: boolean;
  /**
   * 납세자가 상속인 중 최연장자인지 (거주자 동순위 시 최연장자 우선)
   */
  isOldest: boolean;
}

export interface MainInheritorResult {
  /** 납세자가 주된 상속자인지 여부 */
  isMainInheritor: boolean;
  /** 판정 사유 설명 */
  reason: string;
  /** 법적 근거 */
  legalBasis: string;
}

/**
 * [P3-8] 공동상속 주된 상속자 판정
 *
 * §28의4⑤ — 공동소유 주택은 지분이 가장 큰 상속인 소유로 봄.
 * 동순위 시: 거주자 → 최연장자 순서.
 *
 * 주된 상속자이면 주택 수에 포함 (1주택).
 * 주된 상속자가 아니면 주택 수에서 제외.
 */
export function assessMainInheritor(input: MainInheritorInput): MainInheritorResult {
  const { shareOfTaxpayer, maxShareInInheritors, tieInMaxShare, isResident, isOldest } = input;

  // 지분이 최대가 아닌 경우 → 주된 상속자 아님
  if (shareOfTaxpayer < maxShareInInheritors) {
    return {
      isMainInheritor: false,
      reason: `납세자 지분(${(shareOfTaxpayer * 100).toFixed(1)}%) < 최대 지분(${(maxShareInInheritors * 100).toFixed(1)}%) → 주된 상속자 아님 → 카운트 제외`,
      legalBasis: ACQUISITION.HOUSE_COUNT_JOINT_INHERITANCE,
    };
  }

  // 단독 최대 지분 (동순위 아닌 경우) → 주된 상속자
  if (!tieInMaxShare) {
    return {
      isMainInheritor: true,
      reason: `납세자 지분(${(shareOfTaxpayer * 100).toFixed(1)}%)이 최대 → 주된 상속자 → 카운트 포함`,
      legalBasis: ACQUISITION.HOUSE_COUNT_JOINT_INHERITANCE,
    };
  }

  // 동순위 — 거주자 우선 판정 (§28의4⑤ 거주자 우선)
  if (isResident) {
    return {
      isMainInheritor: true,
      reason: `동순위 상속인 중 거주자 우선 → 주된 상속자 → 카운트 포함`,
      legalBasis: ACQUISITION.HOUSE_COUNT_JOINT_INHERITANCE,
    };
  }

  // 동순위 거주자 없는 경우 — 최연장자 우선
  if (isOldest) {
    return {
      isMainInheritor: true,
      reason: `동순위 + 비거주자 중 최연장자 우선 → 주된 상속자 → 카운트 포함`,
      legalBasis: ACQUISITION.HOUSE_COUNT_JOINT_INHERITANCE,
    };
  }

  // 동순위, 비거주자, 최연장자 아닌 경우 → 주된 상속자 아님
  return {
    isMainInheritor: false,
    reason: `동순위 + 비거주자 + 최연장자 아님 → 주된 상속자 아님 → 카운트 제외`,
    legalBasis: ACQUISITION.HOUSE_COUNT_JOINT_INHERITANCE,
  };
}
