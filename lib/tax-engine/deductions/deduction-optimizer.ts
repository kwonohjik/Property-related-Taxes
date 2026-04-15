/**
 * 상속공제 일괄 vs 항목별 자동 선택 (상증법 §21)
 *
 * 일괄공제(§21): 5억원 정액
 * 항목별 공제: 기초공제(§18) 2억 + 인적공제(§20) 합계
 *
 * 자동선택 정책:
 *   항목별 > 일괄  → 항목별 선택
 *   항목별 ≤ 일괄  → 일괄 선택 (동률 포함)
 *
 * ※ 단, 가업상속공제(§18의3) 또는 영농상속공제(§18의2) 적용 시
 *   기초공제(2억)와 중복 적용 가능하나 일괄공제는 선택 불가.
 */

import { INH } from "../legal-codes";
import type { CalculationStep, Heir } from "../types/inheritance-gift.types";
import { calcPersonalDeductions } from "./personal-deduction-calc";

// ============================================================
// 상수
// ============================================================

const LUMP_SUM = 500_000_000;   // §21 일괄공제
const BASIC    = 200_000_000;   // §18 기초공제

// ============================================================
// 타입
// ============================================================

export interface DeductionComparisonResult {
  /** 선택된 방식 */
  chosenMethod: "lump_sum" | "itemized";
  /** 선택 방식의 공제액 (기초+인적 OR 일괄) */
  chosenAmount: number;
  /** 일괄공제 */
  lumpSumAmount: number;
  /** 기초공제 + 인적공제 합계 */
  itemizedAmount: number;
  /** 기초공제 */
  basicDeduction: number;
  /** 인적공제 합계 */
  personalDeductionTotal: number;
  /** 선택 사유 (UI 카드 표시용) */
  reason: string;
  breakdown: CalculationStep[];
  appliedLaws: string[];
}

// ============================================================
// 자동 최적화 함수
// ============================================================

/**
 * 일괄 vs 항목별 공제 자동 비교·선택
 *
 * @param heirs 상속인 목록
 * @param baseDate 상속개시일 (YYYY-MM-DD)
 * @param forceMethod 강제 선택 옵션 ('lump_sum' | 'itemized') — 납세자가 명시적으로 선택한 경우
 * @param hasSpecialDeduction 가업/영농상속공제 적용 여부 (true이면 일괄공제 선택 불가)
 */
export function optimizeDeductionMethod(
  heirs: Heir[],
  baseDate: string,
  forceMethod?: "lump_sum" | "itemized",
  hasSpecialDeduction = false,
): DeductionComparisonResult {
  const personalResult = calcPersonalDeductions(heirs, baseDate);
  const personalTotal = personalResult.total;
  const itemizedAmount = BASIC + personalTotal;
  const lumpSumAmount = LUMP_SUM;

  // 가업/영농 공제 시 일괄공제 선택 불가
  if (hasSpecialDeduction && forceMethod === "lump_sum") {
    forceMethod = "itemized"; // 강제 override
  }

  let chosenMethod: "lump_sum" | "itemized";
  let reason: string;

  if (hasSpecialDeduction) {
    // 가업/영농: 무조건 기초+인적
    chosenMethod = "itemized";
    reason = "가업·영농상속공제 적용 시 일괄공제 선택 불가 (기초+인적 적용)";
  } else if (forceMethod) {
    chosenMethod = forceMethod;
    reason =
      forceMethod === "lump_sum"
        ? "납세자 선택: 일괄공제"
        : "납세자 선택: 기초+인적 항목별 공제";
  } else if (itemizedAmount > lumpSumAmount) {
    chosenMethod = "itemized";
    reason = `항목별 공제(${itemizedAmount.toLocaleString()}원) > 일괄공제(${lumpSumAmount.toLocaleString()}원) — 항목별 선택`;
  } else {
    chosenMethod = "lump_sum";
    reason =
      itemizedAmount === lumpSumAmount
        ? "항목별 = 일괄 (동률) — 일괄공제 선택 (정책)"
        : `일괄공제(${lumpSumAmount.toLocaleString()}원) ≥ 항목별(${itemizedAmount.toLocaleString()}원) — 일괄 선택`;
  }

  const chosenAmount = chosenMethod === "lump_sum" ? lumpSumAmount : itemizedAmount;

  const breakdown: CalculationStep[] = [
    {
      label: "일괄공제 (§21)",
      amount: lumpSumAmount,
      lawRef: INH.LUMP_SUM,
    },
    {
      label: "기초공제 (§18)",
      amount: BASIC,
      lawRef: INH.BASIC_DEDUCTION,
    },
    ...personalResult.breakdown.filter((b) => b.amount > 0),
    {
      label: "항목별 소계 (기초 + 인적)",
      amount: itemizedAmount,
    },
    {
      label: `선택: ${chosenMethod === "lump_sum" ? "일괄공제" : "항목별 공제"}`,
      amount: chosenAmount,
      note: reason,
      lawRef: chosenMethod === "lump_sum" ? INH.LUMP_SUM : INH.BASIC_DEDUCTION,
    },
  ];

  return {
    chosenMethod,
    chosenAmount,
    lumpSumAmount,
    itemizedAmount,
    basicDeduction: chosenMethod === "itemized" ? BASIC : 0,
    personalDeductionTotal: chosenMethod === "itemized" ? personalTotal : 0,
    reason,
    breakdown,
    appliedLaws: [INH.BASIC_DEDUCTION, INH.PERSONAL_DEDUCTION, INH.LUMP_SUM],
  };
}
