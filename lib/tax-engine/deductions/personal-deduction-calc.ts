/**
 * 상속세 인적공제 계산 (상증법 §20)
 *
 * 4종 인적공제:
 *   ① 자녀공제   — 1인당 5,000만원 (§20 ①1호)
 *   ② 미성년자공제 — (20세 - 연령) × 1,000만원 (§20 ①2호)
 *   ③ 연로자공제 — 65세 이상 1인당 5,000만원 (§20 ①3호)
 *   ④ 장애인공제 — 기대여명(년) × 1,000만원 (§20 ①4호)
 *
 * 중복 적용 가능 (§20 ②):
 *   자녀 + 미성년자, 연로자 + 장애인 등 중복 계산 허용.
 *   단, 동일인에 대해 같은 조항 중복 불가.
 */

import { differenceInYears } from "date-fns";
import { INH } from "../legal-codes";
import type { CalculationStep, Heir } from "../types/inheritance-gift.types";
import { calcMinorPersonalDeduction, calcDisabledPersonalDeduction } from "../tax-utils";

// ============================================================
// 단가 상수
// ============================================================

/** 자녀공제 1인당 (§20 ①1호): 5,000만원 */
const CHILD_DEDUCTION_PER_PERSON = 50_000_000;

/** 연로자공제 1인당 (§20 ①3호): 5,000만원 */
const ELDER_DEDUCTION_PER_PERSON = 50_000_000;

/** 연로자 기준 나이: 65세 이상 */
const ELDER_AGE_THRESHOLD = 65;

/** 미성년자·장애인 공제 단가 (§20 ①2호·4호): 1,000만원/년 */
const PER_YEAR_DEDUCTION = 10_000_000;

// ============================================================
// 2024 통계청 생명표 기반 기대여명 테이블 (만 나이 → 기대여명 년)
// 출처: 통계청 「2023년 생명표」(2024년 고시)
// ============================================================

const LIFE_EXPECTANCY_TABLE: Record<number, number> = {
  0: 84, 1: 83, 2: 82, 3: 81, 4: 80,
  5: 79, 6: 78, 7: 77, 8: 76, 9: 75,
  10: 74, 11: 73, 12: 72, 13: 71, 14: 70,
  15: 69, 16: 68, 17: 67, 18: 66, 19: 65,
  20: 64, 21: 63, 22: 62, 23: 61, 24: 60,
  25: 59, 26: 58, 27: 57, 28: 56, 29: 55,
  30: 54, 31: 53, 32: 52, 33: 51, 34: 50,
  35: 49, 36: 48, 37: 47, 38: 46, 39: 45,
  40: 44, 41: 43, 42: 42, 43: 41, 44: 40,
  45: 39, 46: 38, 47: 37, 48: 36, 49: 35,
  50: 34, 51: 33, 52: 32, 53: 31, 54: 30,
  55: 29, 56: 28, 57: 27, 58: 26, 59: 25,
  60: 24, 61: 23, 62: 22, 63: 21, 64: 20,
  65: 20, 66: 19, 67: 18, 68: 17, 69: 16,
  70: 16, 71: 15, 72: 14, 73: 13, 74: 13,
  75: 12, 76: 11, 77: 11, 78: 10, 79: 9,
  80: 9, 81: 8, 82: 8, 83: 7, 84: 6,
  85: 6, 86: 5, 87: 5, 88: 4, 89: 4,
  90: 4,
};

/**
 * 기대여명 조회 (통계청 생명표)
 * 90세 이상은 4년, 테이블 미존재 나이는 linear interpolation 대신 최근 값 사용
 */
export function getLifeExpectancy(ageAtDeath: number): number {
  const age = Math.max(0, Math.min(90, Math.floor(ageAtDeath)));
  return LIFE_EXPECTANCY_TABLE[age] ?? 4;
}

// ============================================================
// ① 자녀공제 (§20 ①1호)
// ============================================================

export interface ChildDeductionResult {
  count: number;
  totalDeduction: number;
  breakdown: CalculationStep[];
  appliedLaws: string[];
}

/**
 * 자녀공제: 1인당 5,000만원 × 자녀 수
 * 자녀 = 직계비속 (child) 관계 상속인
 */
export function calcChildrenDeduction(heirs: Heir[]): ChildDeductionResult {
  const children = heirs.filter((h) => h.relation === "child");
  const count = children.length;
  const totalDeduction = count * CHILD_DEDUCTION_PER_PERSON;

  return {
    count,
    totalDeduction,
    breakdown: [
      {
        label: `자녀공제 ${count}명 × 5,000만원`,
        amount: totalDeduction,
        lawRef: INH.PERSONAL_DEDUCTION,
      },
    ],
    appliedLaws: [INH.PERSONAL_DEDUCTION],
  };
}

// ============================================================
// ② 미성년자공제 (§20 ①2호)
// ============================================================

export interface MinorDeductionResult {
  perHeir: { heirId: string; age: number; deduction: number }[];
  totalDeduction: number;
  breakdown: CalculationStep[];
  appliedLaws: string[];
}

/**
 * 미성년자공제: (20 - 연령) × 1,000만원
 * 대상: 상속인 중 20세 미만인 자 (상속개시일 기준 만 나이)
 *
 * @param heirs 상속인 목록
 * @param baseDate 상속개시일 (YYYY-MM-DD)
 */
export function calcMinorDeduction(
  heirs: Heir[],
  baseDate: string,
): MinorDeductionResult {
  const perHeir: MinorDeductionResult["perHeir"] = [];

  for (const heir of heirs) {
    if (!heir.birthDate) continue;
    const deduction = calcMinorPersonalDeduction(heir.birthDate, baseDate);
    if (deduction > 0) {
      // differenceInYears: 생일 도달 여부를 반영한 정확한 만 나이 (공제액 산정과 동일 기준)
      const age = differenceInYears(new Date(baseDate), new Date(heir.birthDate));
      perHeir.push({ heirId: heir.id, age, deduction });
    }
  }

  const totalDeduction = perHeir.reduce((s, r) => s + r.deduction, 0);

  return {
    perHeir,
    totalDeduction,
    breakdown: perHeir.map((r) => ({
      label: `미성년자공제 (만${r.age}세): (20-${r.age}) × 1,000만원`,
      amount: r.deduction,
      lawRef: INH.PERSONAL_DEDUCTION,
    })),
    appliedLaws: [INH.PERSONAL_DEDUCTION],
  };
}

// ============================================================
// ③ 연로자공제 (§20 ①3호)
// ============================================================

export interface ElderDeductionResult {
  count: number;
  totalDeduction: number;
  breakdown: CalculationStep[];
  appliedLaws: string[];
}

/**
 * 연로자공제: 65세 이상 상속인 1인당 5,000만원
 *
 * @param heirs 상속인 목록
 * @param baseDate 상속개시일 (YYYY-MM-DD)
 */
export function calcElderDeduction(
  heirs: Heir[],
  baseDate: string,
): ElderDeductionResult {
  const base = new Date(baseDate);

  const elderHeirs = heirs.filter((h) => {
    if (!h.birthDate) return false;
    // differenceInYears: 생일 도달 여부를 반영한 정확한 만 나이
    const age = differenceInYears(base, new Date(h.birthDate));
    return age >= ELDER_AGE_THRESHOLD;
  });

  const count = elderHeirs.length;
  const totalDeduction = count * ELDER_DEDUCTION_PER_PERSON;

  return {
    count,
    totalDeduction,
    breakdown: [
      {
        label: `연로자공제 ${count}명 × 5,000만원 (65세 이상)`,
        amount: totalDeduction,
        lawRef: INH.PERSONAL_DEDUCTION,
      },
    ],
    appliedLaws: [INH.PERSONAL_DEDUCTION],
  };
}

// ============================================================
// ④ 장애인공제 (§20 ①4호)
// ============================================================

export interface DisabledDeductionResult {
  perHeir: { heirId: string; lifeExpectancy: number; deduction: number }[];
  totalDeduction: number;
  breakdown: CalculationStep[];
  appliedLaws: string[];
}

/**
 * 장애인공제: 기대여명(년) × 1,000만원
 * 기대여명: 통계청 생명표 기준 (getLifeExpectancy)
 *
 * @param heirs 상속인 목록
 * @param baseDate 상속개시일 (YYYY-MM-DD)
 */
export function calcDisabledDeduction(
  heirs: Heir[],
  baseDate: string,
): DisabledDeductionResult {
  const base = new Date(baseDate);
  const perHeir: DisabledDeductionResult["perHeir"] = [];

  for (const heir of heirs) {
    if (!heir.isDisabled) continue;

    let lifeExpectancy: number;
    if (heir.birthDate) {
      // differenceInYears: 생일 도달 여부를 반영한 정확한 만 나이
      const age = differenceInYears(base, new Date(heir.birthDate));
      lifeExpectancy = getLifeExpectancy(age);
    } else {
      // 생년월일 미입력 시 기대여명 0으로 처리
      lifeExpectancy = 0;
    }

    const deduction = lifeExpectancy * PER_YEAR_DEDUCTION;
    perHeir.push({ heirId: heir.id, lifeExpectancy, deduction });
  }

  const totalDeduction = perHeir.reduce((s, r) => s + r.deduction, 0);

  return {
    perHeir,
    totalDeduction,
    breakdown: perHeir.map((r) => ({
      label: `장애인공제: 기대여명 ${r.lifeExpectancy}년 × 1,000만원`,
      amount: r.deduction,
      lawRef: INH.PERSONAL_DEDUCTION,
    })),
    appliedLaws: [INH.PERSONAL_DEDUCTION],
  };
}

// ============================================================
// 인적공제 합계 (4종 합산)
// ============================================================

export interface PersonalDeductionSummary {
  childDeduction: number;
  minorDeduction: number;
  elderDeduction: number;
  disabledDeduction: number;
  total: number;
  breakdown: CalculationStep[];
  appliedLaws: string[];
}

export function calcPersonalDeductions(
  heirs: Heir[],
  baseDate: string,
): PersonalDeductionSummary {
  const child = calcChildrenDeduction(heirs);
  const minor = calcMinorDeduction(heirs, baseDate);
  const elder = calcElderDeduction(heirs, baseDate);
  const disabled = calcDisabledDeduction(heirs, baseDate);

  const total =
    child.totalDeduction +
    minor.totalDeduction +
    elder.totalDeduction +
    disabled.totalDeduction;

  return {
    childDeduction: child.totalDeduction,
    minorDeduction: minor.totalDeduction,
    elderDeduction: elder.totalDeduction,
    disabledDeduction: disabled.totalDeduction,
    total,
    breakdown: [
      ...child.breakdown,
      ...minor.breakdown,
      ...elder.breakdown,
      ...disabled.breakdown,
      { label: "인적공제 합계", amount: total, lawRef: INH.PERSONAL_DEDUCTION },
    ],
    appliedLaws: [INH.PERSONAL_DEDUCTION],
  };
}
