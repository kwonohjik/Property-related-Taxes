/**
 * 단기재상속세액공제 (상증법 §30)
 *
 * 상속 개시 후 10년 이내에 다시 상속이 발생한 경우
 * 전 상속 때 납부한 세액의 일정 비율을 공제.
 *
 * 경과 연수별 공제율:
 *   1년 이내  : 100%
 *   1 ~ 2년   :  90%
 *   2 ~ 3년   :  80%
 *   3 ~ 4년   :  70%
 *   4 ~ 5년   :  60%
 *   5 ~ 6년   :  50%
 *   6 ~ 7년   :  40%
 *   7 ~ 8년   :  30%
 *   8 ~ 9년   :  20%
 *   9 ~ 10년  :  10%
 *   10년 초과 :   공제 없음
 */

import { TAX_CREDIT } from "../legal-codes";
import { applyRate } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";

// ============================================================
// 경과 연수별 공제율 테이블 (§30 ①)
// ============================================================

/** 단기재상속 공제율 (경과 연수 → 비율, 0.0 ~ 1.0) */
const SHORT_TERM_CREDIT_RATES: { maxYears: number; rate: number }[] = [
  { maxYears: 1, rate: 1.0 },
  { maxYears: 2, rate: 0.9 },
  { maxYears: 3, rate: 0.8 },
  { maxYears: 4, rate: 0.7 },
  { maxYears: 5, rate: 0.6 },
  { maxYears: 6, rate: 0.5 },
  { maxYears: 7, rate: 0.4 },
  { maxYears: 8, rate: 0.3 },
  { maxYears: 9, rate: 0.2 },
  { maxYears: 10, rate: 0.1 },
];

// ============================================================
// 공제율 조회
// ============================================================

/**
 * 경과 연수에 해당하는 단기재상속 공제율 반환.
 * 10년 초과이면 0 반환.
 *
 * @param elapsedYears 이전 상속개시일 ~ 현재 상속개시일 경과 연수 (정수, 버림)
 */
export function getShortTermReinheritRate(elapsedYears: number): number {
  if (elapsedYears <= 0) return 1.0; // 동일 연도: 100%
  for (const { maxYears, rate } of SHORT_TERM_CREDIT_RATES) {
    if (elapsedYears <= maxYears) return rate;
  }
  return 0; // 10년 초과
}

// ============================================================
// 세액공제 계산
// ============================================================

export interface ShortTermReinheritInput {
  /** 이전 상속세 납부세액 */
  priorTaxPaid: number;
  /** 경과 연수 (정수, calcShortTermReinheritYears() 결과) */
  elapsedYears: number;
  /**
   * 당해 상속세 산출세액 (§30 ② 한도 적용용)
   * — 공제액이 이 금액을 초과하지 않도록 방어
   */
  currentComputedTax: number;
}

export interface ShortTermReinheritResult {
  creditAmount: number;
  creditRate: number;
  breakdown: CalculationStep[];
}

/**
 * 단기재상속세액공제 계산 (§30)
 *
 * @param input 단기재상속 입력
 * @returns 공제세액 + 산식 내역
 */
export function calcShortTermReinheritCredit(
  input: ShortTermReinheritInput,
): ShortTermReinheritResult {
  const { priorTaxPaid, elapsedYears, currentComputedTax } = input;

  const creditRate = getShortTermReinheritRate(elapsedYears);
  if (creditRate === 0 || priorTaxPaid <= 0) {
    return {
      creditAmount: 0,
      creditRate: 0,
      breakdown: [
        {
          label: "단기재상속세액공제 — 해당 없음 (10년 초과 또는 전 납부세액 없음)",
          amount: 0,
          lawRef: TAX_CREDIT.SHORT_TERM_REINH,
        },
      ],
    };
  }

  // 공제 기본액 = 전 납부세액 × 공제율
  const rawCredit = applyRate(priorTaxPaid, creditRate);

  // 한도: 당해 산출세액을 초과할 수 없음 (§30 ②)
  const creditAmount = Math.min(rawCredit, currentComputedTax);

  const breakdown: CalculationStep[] = [
    {
      label: `이전 상속세 납부세액`,
      amount: priorTaxPaid,
      lawRef: TAX_CREDIT.SHORT_TERM_REINH,
    },
    {
      label: `단기재상속 공제율 (경과 ${elapsedYears}년 → ${creditRate * 100}%)`,
      amount: rawCredit,
      lawRef: TAX_CREDIT.SHORT_TERM_REINH,
    },
  ];

  if (rawCredit > currentComputedTax) {
    breakdown.push({
      label: "당해 산출세액 한도 적용",
      amount: creditAmount,
      note: `원래 공제액 ${rawCredit.toLocaleString()}원 → 한도 초과로 ${currentComputedTax.toLocaleString()}원 적용`,
    });
  }

  return { creditAmount, creditRate, breakdown };
}
