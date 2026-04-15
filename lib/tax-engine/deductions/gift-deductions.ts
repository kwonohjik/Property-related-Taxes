/**
 * 증여재산공제 (상증법 §53·§53의2)
 *
 * 관계별 한도 (10년 통산):
 *   배우자              : 600,000,000원
 *   직계존속 (성년)     : 50,000,000원
 *   직계존속 (미성년)   : 20,000,000원
 *   직계비속            : 50,000,000원
 *   기타친족            : 10,000,000원
 *
 * 혼인·출산 증여재산공제 (§53의2):
 *   혼인·출산일 전후 2년 이내 부모로부터 받은 증여 합산 최대 1억원
 *   (기존 직계존속 10년 한도와 별도 적용)
 *
 * 공제 계산:
 *   잔여공제 = max(0, 관계별한도 - 10년내기사용공제)
 *   실제 공제 = min(잔여공제, 증여재산가액)
 *
 * 단, 증여세 과세표준이 50만원 미만이면 증여세 부과 안 함 (§55 단서).
 */

import { GIFT } from "../legal-codes";
import type {
  CalculationStep,
  DonorRelation,
  GiftDeductionInput,
  GiftDeductionResult,
} from "../types/inheritance-gift.types";

// ============================================================
// 관계별 공제 한도 (10년 통산)
// ============================================================

const GIFT_DEDUCTION_LIMIT: Record<DonorRelation, number> = {
  spouse:                   600_000_000,
  lineal_ascendant_adult:    50_000_000,
  lineal_ascendant_minor:    20_000_000,
  lineal_descendant:         50_000_000,
  other_relative:            10_000_000,
};

/** 혼인·출산 공제 최대 한도 (§53의2): 1억원 */
const MARRIAGE_BIRTH_MAX = 100_000_000;

/** 증여세 과세표준 면세 하한 (§55): 50만원 */
const TAX_BASE_MIN = 500_000;

// ============================================================
// 관계별 공제 계산
// ============================================================

/**
 * 관계별 기본 공제 (§53)
 *
 * @param input 증여공제 입력
 * @param grossGiftValue 증여재산가액 (평가 후 총액)
 */
export function calcRelationDeduction(
  input: GiftDeductionInput,
  grossGiftValue: number,
): { relationDeduction: number; breakdown: CalculationStep[] } {
  const limit = GIFT_DEDUCTION_LIMIT[input.donorRelation];
  const priorUsed = input.priorUsedDeduction ?? 0;

  // 잔여 공제 가능액
  const remaining = Math.max(0, limit - priorUsed);

  // 실제 공제액 = min(잔여, 증여재산가액)
  const relationDeduction = Math.min(remaining, grossGiftValue);

  const breakdown: CalculationStep[] = [
    {
      label: `증여재산공제 한도 (${getDonorRelationLabel(input.donorRelation)})`,
      amount: limit,
      lawRef: GIFT.GIFT_DEDUCTION,
    },
    {
      label: "10년 내 기사용 공제",
      amount: -priorUsed,
      note: "동일 관계 그룹 합산",
    },
    { label: "잔여 공제 가능액", amount: remaining },
    {
      label: "증여재산공제 적용액",
      amount: relationDeduction,
      lawRef: GIFT.GIFT_DEDUCTION,
    },
  ];

  return { relationDeduction, breakdown };
}

/**
 * 혼인·출산 증여재산공제 (§53의2)
 * 기존 관계별 공제와 합산 시 최대 1억원 (별도 한도)
 *
 * @param marriageExemption 혼인공제 금액 (≤ 1억)
 * @param birthExemption 출산공제 금액 (≤ 1억)
 */
export function calcMarriageBirthDeduction(
  marriageExemption?: number,
  birthExemption?: number,
): { deduction: number; breakdown: CalculationStep[] } {
  const marriage = Math.max(0, Math.min(marriageExemption ?? 0, MARRIAGE_BIRTH_MAX));
  const birth = Math.max(0, Math.min(birthExemption ?? 0, MARRIAGE_BIRTH_MAX));

  // 혼인 + 출산 합산 최대 1억
  const deduction = Math.min(marriage + birth, MARRIAGE_BIRTH_MAX);

  if (deduction <= 0) {
    return { deduction: 0, breakdown: [] };
  }

  return {
    deduction,
    breakdown: [
      ...(marriage > 0
        ? [{ label: "혼인 증여재산공제", amount: marriage, lawRef: GIFT.MARRIAGE_DEDUCTION }]
        : []),
      ...(birth > 0
        ? [{ label: "출산 증여재산공제", amount: birth, lawRef: GIFT.MARRIAGE_DEDUCTION }]
        : []),
      {
        label: "혼인·출산 공제 합계 (최대 1억)",
        amount: deduction,
        lawRef: GIFT.MARRIAGE_DEDUCTION,
      },
    ],
  };
}

// ============================================================
// 과세표준 50만원 미만 면세 판정 (§55)
// ============================================================

/**
 * 증여세 과세표준이 50만원 미만이면 과세 제외 (§55 단서)
 * @returns true이면 과세 제외
 */
export function isBelowMinTaxBase(taxBase: number): boolean {
  return taxBase > 0 && taxBase < TAX_BASE_MIN;
}

// ============================================================
// 통합 증여공제 계산
// ============================================================

/**
 * 증여재산공제 전체 계산 (§53 + §53의2)
 *
 * @param input 증여공제 입력
 * @param grossGiftValue 증여재산가액 (비과세 차감 전 평가 합계)
 */
export function calcGiftDeductions(
  input: GiftDeductionInput,
  grossGiftValue: number,
): GiftDeductionResult {
  const { relationDeduction, breakdown: relBreakdown } = calcRelationDeduction(
    input,
    grossGiftValue,
  );

  const { deduction: marriageBirthDeduction, breakdown: mbBreakdown } =
    calcMarriageBirthDeduction(input.marriageExemption, input.birthExemption);

  const totalDeduction = relationDeduction + marriageBirthDeduction;

  return {
    relationDeduction,
    marriageBirthDeduction,
    totalDeduction,
    breakdown: [
      ...relBreakdown,
      ...mbBreakdown,
      { label: "증여재산공제 합계", amount: totalDeduction, lawRef: GIFT.GIFT_DEDUCTION },
    ],
    appliedLaws: [GIFT.GIFT_DEDUCTION, GIFT.MARRIAGE_DEDUCTION],
  };
}

// ============================================================
// 10년 합산 증여가액 계산 (§47)
// ============================================================

/**
 * 동일인(같은 관계 그룹)으로부터 10년 이내 증여받은 재산가액 합산 (§47)
 * 현재 증여액 + 과거 증여액을 합산하여 과세표준 기준으로 사용.
 *
 * @param currentGiftValue 현재 증여재산가액
 * @param priorGiftAmounts 10년 이내 과거 증여가액 목록
 */
export function aggregateGiftWithin10Years(
  currentGiftValue: number,
  priorGiftAmounts: number[],
): number {
  const priorTotal = priorGiftAmounts.reduce((s, a) => s + a, 0);
  return currentGiftValue + priorTotal;
}

// ============================================================
// 내부 헬퍼
// ============================================================

function getDonorRelationLabel(relation: DonorRelation): string {
  const labels: Record<DonorRelation, string> = {
    spouse: "배우자",
    lineal_ascendant_adult: "직계존속(성년)",
    lineal_ascendant_minor: "직계존속(미성년)",
    lineal_descendant: "직계비속",
    other_relative: "기타친족",
  };
  return labels[relation];
}
