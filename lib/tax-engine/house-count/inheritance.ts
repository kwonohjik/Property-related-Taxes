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

import { ACQUISITION, ACQUISITION_CONST, PERIOD_CALCULATION_LOCAL_23 } from "../legal-codes";
import { deadlineEndFrom, deadlineEndNote, isOnOrBeforeDay, isWithinDeadline } from "../civil-period";

// ============================================================
// 5년 미경과 제외 판정
// ============================================================

/** `assessInheritance5YearRule`의 판정 결과 — 모든 소비처(주택·입주권·분양권·오피스텔)가 공유하는 단일 leaf */
export interface Inheritance5YearAssessment {
  /** 상속개시일부터 5년 미경과 — true면 주택 수 제외 대상 */
  excluded: boolean;
  /**
   * 민법 §161 연장이 이 판정을 좌우했을 때(연장이 없었으면 산입됐을 날이 연장 덕에 제외됐을 때),
   * 또는 공휴일 표 밖·예정 공휴일(임시공휴일 미반영)이라 판정이 불확실할 때만 붙는 한 줄 안내. 그 외에는 `undefined`.
   */
  note?: string;
}

/**
 * [P3-8] 상속 5년 미경과 여부 판정 — 모든 소비처(주택·입주권·분양권·오피스텔 제외 판정,
 * 공동상속 소유자 판정)가 호출하는 **단일 leaf**.
 *
 * §28의4⑥3호: 「상속개시일부터 5년이 지나지 않은」 주택·입주권·분양권·오피스텔 → 주택 수 제외.
 *  - 기간 계산은 지방세기본법 §23 → 민법 §157(초일 불산입)·§160②(응당일)·§161(말일이 토요일·공휴일이면
 *    익일로 만료, 사용자 결정 2026-10-01). 만료일 = 5년 뒤 응당일이므로 응당일 **당일까지**(§161
 *    연장 시 그 익일까지) 「5년이 지나지 않은」 상태다(plan §1 B 유형 `isWithinDeadline`).
 *
 * 대통령령 제30939호(2020.8.12.) 부칙 제3조: 「이 영 시행 전에 상속을 원인으로 취득한 주택,
 * 조합원입주권, 주택분양권 또는 오피스텔에 대해서는 …이 영 시행 이후 5년 동안 주택 수 산정 시
 * 소유주택 수에서 제외한다.」 — 시행일(2020.8.12.) 0시부터 기산(민법 §157 단서) → 2025.8.11.까지.
 * 이 특례 기간은 2020.8.12. 전 상속분의 본칙 기간보다 항상 길거나 같다.
 * ⚠️ 말일 2025-08-11.은 **월요일**이라 민법 §161이 적용될 여지가 없다 — 이 날짜는 그대로
 *   둔다(사용자 결정 2026-10-01 · anchor로 고정, 변경 금지).
 *
 * @param inheritanceDate 상속개시일 (YYYY-MM-DD)
 * @param referenceDate 기준일 (주택 수 산정일, YYYY-MM-DD)
 */
export function assessInheritance5YearRule(
  inheritanceDate: string,
  referenceDate: string
): Inheritance5YearAssessment {
  if (
    inheritanceDate < ACQUISITION_CONST.HOUSE_COUNT_RIGHT_OFFICE_FROM &&
    referenceDate <= ACQUISITION_CONST.INHERITANCE_PRE_2020_EXCLUSION_END
  ) {
    return { excluded: true };
  }

  const start = new Date(inheritanceDate);
  const target = new Date(referenceDate);
  const years = ACQUISITION_CONST.INHERITANCE_EXCLUSION_YEARS;
  const excluded = isWithinDeadline(start, years, target);
  if (!excluded) return { excluded };

  const dl = deadlineEndFrom(start, years);
  if (dl.holidayTableUncovered || dl.holidayTableProvisional) {
    return { excluded, note: deadlineEndNote(dl, PERIOD_CALCULATION_LOCAL_23) };
  }
  // §161 연장이 없었어도(= 역상 말일까지) 이미 제외 대상이었으면 연장은 이 판정을 바꾸지 않았다 — 안내 생략.
  const excludedWithoutExtension = isOnOrBeforeDay(target, dl.calendarEnd);
  if (dl.extended && !excludedWithoutExtension) {
    return { excluded, note: deadlineEndNote(dl, PERIOD_CALCULATION_LOCAL_23) };
  }
  return { excluded };
}

/**
 * [P3-8] 상속 5년 미경과 여부 판정 — boolean만 필요한 호출부용 얇은 래퍼.
 * 정본은 `assessInheritance5YearRule`(설명문에 §161 연장 안내가 필요하면 그쪽을 쓴다).
 */
export function isExcludedBy5YearRule(
  inheritanceDate: string,
  referenceDate: string
): boolean {
  return assessInheritance5YearRule(inheritanceDate, referenceDate).excluded;
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
   * — 본인·다른 동순위 상속인이 모두 거주하면 「거주자 중」, 모두 비거주면 「동순위 상속인 중」 최연장자
   */
  isOldest: boolean;
  /**
   * 다른 동순위 상속인이 그 주택에 거주하는지 (§28의4⑤1호). 미지정 = 거주하지 않음.
   */
  isOtherTiedHeirResident?: boolean;
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
  const otherResides = input.isOtherTiedHeirResident ?? false;

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

  // 동순위 — 1호 「그 주택에 거주하는 사람」: 거주자가 본인뿐이면 본인, 다른 상속인뿐이면 그 상속인
  if (isResident && !otherResides) {
    return {
      isMainInheritor: true,
      reason: `동순위 상속인 중 본인만 거주 → 주된 상속자 → 카운트 포함`,
      legalBasis: ACQUISITION.HOUSE_COUNT_JOINT_INHERITANCE,
    };
  }
  if (!isResident && otherResides) {
    return {
      isMainInheritor: false,
      reason: `동순위 상속인 중 다른 상속인이 거주 → 그 상속인이 소유자 → 카운트 제외`,
      legalBasis: ACQUISITION.HOUSE_COUNT_JOINT_INHERITANCE,
    };
  }

  // 거주자가 둘 이상이거나 없음 — 2호 「나이가 가장 많은 사람」
  const pool = isResident ? "거주하는 동순위 상속인" : "동순위 상속인(거주자 없음)";
  if (isOldest) {
    return {
      isMainInheritor: true,
      reason: `${pool} 중 최연장자 → 주된 상속자 → 카운트 포함`,
      legalBasis: ACQUISITION.HOUSE_COUNT_JOINT_INHERITANCE,
    };
  }

  return {
    isMainInheritor: false,
    reason: `${pool} 중 최연장자 아님 → 주된 상속자 아님 → 카운트 제외`,
    legalBasis: ACQUISITION.HOUSE_COUNT_JOINT_INHERITANCE,
  };
}

// ============================================================
// 공동상속 자산 — 소유자 아님 판정 (주택·입주권·분양권·오피스텔 공통)
// ============================================================

/** §28의4⑤ 판정에 필요한 자산 칸 (주택·오피스텔은 거주 칸까지, 입주권·분양권은 거주 칸 없음) */
export interface JointInheritanceAsset {
  id?: string;
  inheritanceDate?: string;
  shareInInheritance?: number;
  maxShareInInheritors?: number;
  tieInMaxShare?: boolean;
  isResidentInInheritedHouse?: boolean;
  isOtherTiedHeirResident?: boolean;
  isOldestInheritor?: boolean;
}

/**
 * §28의4⑤ — 상속으로 여러 사람이 공동 소유하는 주택·조합원입주권·주택분양권·오피스텔은 지분이 가장 큰
 * 상속인의 소유로 본다(동순위면 1호 「그 주택 또는 오피스텔에 거주하는 사람」 → 2호 최연장자).
 * 5년 미경과(⑥3호)는 제외 판정에서 이미 빠졌으므로 여기서는 5년이 지난 상속 자산만 본다.
 * 지분 칸이 없으면(종전 기록) 판정하지 않는다 — 종전처럼 산입.
 *
 * @param hasResidenceTier 1호(거주)가 있는 자산인지 — 주택·오피스텔 true, 입주권·분양권 false
 * @returns 소유자로 보지 않으면 제외 항목, 소유자면 `{ owner: legalBasis }`, 판정 대상이 아니면 null
 */
export function judgeJointInheritanceOwnership(
  asset: JointInheritanceAsset,
  assetType: "house" | "right" | "office",
  referenceDate: string,
  hasResidenceTier: boolean
): { excluded?: { assetId?: string; assetType: "house" | "right" | "office"; reason: "joint_inheritance_not_owner"; legalBasis: string; description: string }; ownerBasis?: string } | null {
  if (!asset.inheritanceDate || isExcludedBy5YearRule(asset.inheritanceDate, referenceDate)) return null;
  if (asset.shareInInheritance === undefined || asset.maxShareInInheritors === undefined) return null;
  const result = assessMainInheritor({
    shareOfTaxpayer: asset.shareInInheritance,
    maxShareInInheritors: asset.maxShareInInheritors,
    tieInMaxShare: asset.tieInMaxShare ?? false,
    isResident: hasResidenceTier ? (asset.isResidentInInheritedHouse ?? false) : false,
    isOldest: asset.isOldestInheritor ?? false,
    isOtherTiedHeirResident: hasResidenceTier ? (asset.isOtherTiedHeirResident ?? false) : false,
  });
  if (result.isMainInheritor) return { ownerBasis: result.legalBasis };
  return {
    excluded: {
      assetId: asset.id,
      assetType,
      reason: "joint_inheritance_not_owner",
      legalBasis: result.legalBasis,
      description: result.reason,
    },
  };
}
