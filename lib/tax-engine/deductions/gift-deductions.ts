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
 * §53의2 적용 대상 관계 판정
 *
 * §53의2①②는 "직계존속으로부터" 증여받은 경우에만 적용.
 * 배우자·직계비속·기타친족 증여는 비적격.
 */
export function isMarriageBirthEligibleRelation(relation: DonorRelation): boolean {
  return relation === "lineal_ascendant_adult" || relation === "lineal_ascendant_minor";
}

/**
 * 혼인·출산 증여재산공제 (§53의2)
 *
 * 적용 요건:
 *   - 증여자가 직계존속이어야 함 (§53의2① "직계존속으로부터" 명문)
 *   - 혼인·출산 합산 통합한도 1억원 (§53의2③)
 *   - §53 관계공제와 별도 적용 (별개 한도)
 *   - §53의2③ 수증자 통산 기공제액 차감: 잔여 = max(0, 1억 − priorUsedMarriageBirthDeduction)
 *
 * @param donorRelation   증여자-수증자 관계 — 직계존속일 때만 적용
 * @param grossGiftValue  합산 증여재산가액 (과세가액 상한 캡 적용용)
 * @param marriageExemption 혼인공제 금액 (≤ 1억)
 * @param birthExemption    출산공제 금액 (≤ 1억)
 * @param priorUsedMarriageBirthDeduction §53의2③ 기공제 누계액 — 미입력 시 0 (기존 동작 보존)
 */
export function calcMarriageBirthDeduction(
  donorRelation: DonorRelation,
  grossGiftValue: number,
  marriageExemption?: number,
  birthExemption?: number,
  priorUsedMarriageBirthDeduction?: number,
): { deduction: number; breakdown: CalculationStep[] } {
  // §53의2 게이트: 직계존속 증여가 아니면 공제 불가
  if (!isMarriageBirthEligibleRelation(donorRelation)) {
    return { deduction: 0, breakdown: [] };
  }

  const marriage = Math.max(0, Math.min(marriageExemption ?? 0, MARRIAGE_BIRTH_MAX));
  const birth = Math.max(0, Math.min(birthExemption ?? 0, MARRIAGE_BIRTH_MAX));

  // §53의2③ 수증자 통산 기공제 차감
  const priorUsedMB = priorUsedMarriageBirthDeduction ?? 0;
  // 잔여 한도: max(0, 1억 − min(기공제, 1억)) — 기공제가 1억 초과해도 음수 방지
  const remainingMBLimit = Math.max(0, MARRIAGE_BIRTH_MAX - Math.min(priorUsedMB, MARRIAGE_BIRTH_MAX));

  // 혼인 + 출산 합산 후 잔여 한도 적용 (§53의2③)
  const combinedMax = Math.min(marriage + birth, remainingMBLimit);

  // 합산 증여재산가액 상한 캡 — totalDeduction이 과세가액 초과 방지
  const deduction = Math.min(combinedMax, Math.max(0, grossGiftValue));

  if (deduction <= 0) {
    return { deduction: 0, breakdown: [] };
  }

  const breakdown: CalculationStep[] = [];

  if (marriage > 0) {
    breakdown.push({ label: "혼인 증여재산공제", amount: marriage, lawRef: GIFT.MARRIAGE_DEDUCTION });
  }
  if (birth > 0) {
    breakdown.push({ label: "출산 증여재산공제", amount: birth, lawRef: GIFT.MARRIAGE_DEDUCTION });
  }
  // 기공제 차감이 있는 경우에만 breakdown에 명시 표시
  if (priorUsedMB > 0) {
    breakdown.push({
      label: "§53의2③ 기사용 공제 (수증자 통산)",
      amount: -priorUsedMB,
      lawRef: GIFT.MARRIAGE_CUMULATIVE_LIMIT,
    });
    breakdown.push({
      label: "잔여 공제 가능액",
      amount: remainingMBLimit,
      lawRef: GIFT.MARRIAGE_CUMULATIVE_LIMIT,
    });
  }
  breakdown.push({
    label: "혼인·출산 공제 합계 (최대 1억, 직계존속 한정)",
    amount: deduction,
    lawRef: GIFT.MARRIAGE_DEDUCTION,
  });

  return { deduction, breakdown };
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
    calcMarriageBirthDeduction(
      input.donorRelation,
      grossGiftValue,
      input.marriageExemption,
      input.birthExemption,
      input.priorUsedMarriageBirthDeduction,
    );

  // 합계가 합산 증여재산가액을 초과하지 않도록 캡 적용
  // (관계공제 + 혼인·출산공제 각각 캡이 있어도, 합산 시 초과 가능)
  const rawTotal = relationDeduction + marriageBirthDeduction;
  const totalDeduction = Math.min(rawTotal, Math.max(0, grossGiftValue));

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
    lineal_ascendant_adult: "직계존속(성년 수증자)",
    lineal_ascendant_minor: "직계존속(미성년 수증자)",
    lineal_descendant: "직계비속(성년 수증자)",
    other_relative: "기타친족",
  };
  return labels[relation];
}
