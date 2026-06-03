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
import { applyRate, safeMultiplyThenDivide } from "../tax-utils";
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
  /** 이전 상속세 납부세액 (§30①의 "전의 상속세가 부과된" 납부액) */
  priorTaxPaid: number;
  /** 경과 연수 (정수, calcShortTermReinheritYears() 결과) */
  elapsedYears: number;
  /**
   * 당해 상속세 산출세액 (§30② 한도 적용용)
   * — 공제액이 이 금액을 초과하지 않도록 방어
   */
  currentComputedTax: number;
  /**
   * 재상속분의 재산가액 — §30②1호 안분 분수의 분자.
   * 전(前) 상속재산 중 이번 상속에서 다시 상속되는 재산의 가액.
   *
   * 법령근거: 상증법 §30②1호
   *   「전의 상속세산출세액 × 재상속분의 재산가액 × (전의 상속세 과세가액 / 전의 상속재산가액)
   *    ÷ 전의 상속세 과세가액」
   * → 대수적 약분: 전의 과세가액 상쇄 →
   *   「전의 산출세액 × (재상속분 재산가액 / 전의 상속재산가액)」
   *
   * optional: 미입력 시 전부 재상속(분수=1) 가정으로 fallback.
   */
  shortTermReinheritAssetValue?: number;
  /**
   * 전의 상속재산가액 — §30②1호 안분 분수의 분모.
   * 이전 상속 시 전체 상속재산의 가액(과세가액이 아닌 상속재산가액).
   *
   * 법령근거: 상증법 §30②1호 (대수적 약분 후 최종 분모).
   *
   * optional: 미입력 또는 0 시 안분 미적용(전부재상속 fallback).
   */
  shortTermReinheritPriorEstateValue?: number;
}

export interface ShortTermReinheritResult {
  creditAmount: number;
  creditRate: number;
  breakdown: CalculationStep[];
  /**
   * 안분 분수 적용 여부 — UI 결과 카드 표시용.
   * true: shortTermReinheritAssetValue / shortTermReinheritPriorEstateValue 안분 적용됨.
   * false: 신규 필드 미입력 또는 분모=0 → 전부재상속 가정(분수=1) 적용.
   */
  prorationApplied: boolean;
  /**
   * 안분 분수 분자 — UI echo용 (재상속분 재산가액).
   * prorationApplied=true 시에만 의미 있음.
   */
  prorationNumerator?: number;
  /**
   * 안분 분수 분모 — UI echo용 (전의 상속재산가액).
   * prorationApplied=true 시에만 의미 있음.
   */
  prorationDenominator?: number;
  /**
   * 안분 후 기준 세액 (전의 산출세액 × 재상속분/전의상속재산가액, floor 전).
   * = safeMultiplyThenDivide(priorTaxPaid, 분자, 분모)
   * UI echo용 — 안분 적용 시에만 의미 있음.
   */
  proratedBaseTax?: number;
}

/**
 * 단기재상속세액공제 계산 (§30)
 *
 * 상증법 §30②1호 산식:
 *   공제기준액 = 전의 산출세액 × (재상속분의 재산가액 × 전의 과세가액 / 전의 상속재산가액)
 *               ÷ 전의 과세가액
 * 대수적 약분 (전의 과세가액 상쇄):
 *   공제기준액 = 전의 산출세액 × (재상속분 재산가액 / 전의 상속재산가액)
 * 공제액 = floor(공제기준액) × §30②2호 공제율
 *
 * shortTermReinheritAssetValue / shortTermReinheritPriorEstateValue 미입력 시
 * 분수=1 (전부 재상속 가정) fallback — 하위호환.
 *
 * @param input 단기재상속 입력
 * @returns 공제세액 + 산식 내역 + echo 필드
 */
export function calcShortTermReinheritCredit(
  input: ShortTermReinheritInput,
): ShortTermReinheritResult {
  const {
    priorTaxPaid,
    elapsedYears,
    currentComputedTax,
    shortTermReinheritAssetValue,
    shortTermReinheritPriorEstateValue,
  } = input;

  const creditRate = getShortTermReinheritRate(elapsedYears);
  if (creditRate === 0 || priorTaxPaid <= 0) {
    return {
      creditAmount: 0,
      creditRate: 0,
      prorationApplied: false,
      breakdown: [
        {
          label: "단기재상속세액공제 — 해당 없음 (10년 초과 또는 전 납부세액 없음)",
          amount: 0,
          lawRef: TAX_CREDIT.SHORT_TERM_REINH,
        },
      ],
    };
  }

  // ── §30②1호 안분 분수 적용 ──────────────────────────────────────
  // 신규 입력 2개가 모두 있고, 분모(전의 상속재산가액) > 0 인 경우에만 안분 적용.
  // 분모=0 또는 미입력 → 전부 재상속 가정(분수=1) fallback.
  const hasPriorEstate =
    shortTermReinheritPriorEstateValue !== undefined &&
    shortTermReinheritPriorEstateValue > 0;
  const hasAssetValue =
    shortTermReinheritAssetValue !== undefined &&
    shortTermReinheritAssetValue > 0;

  const prorationApplied = hasPriorEstate && hasAssetValue;

  let baseTaxForRate: number; // 공제율을 곱하기 직전의 금액
  let proratedBaseTax: number | undefined;

  if (prorationApplied) {
    // §30②1호 약분 후: 전의 산출세액 × (재상속분 / 전의 상속재산가액)
    // safeMultiplyThenDivide: 분자×분모 > MAX_SAFE_INTEGER 시 BigInt fallback, 결과 floor
    const numerator = shortTermReinheritAssetValue!;
    const denominator = shortTermReinheritPriorEstateValue!;
    baseTaxForRate = safeMultiplyThenDivide(priorTaxPaid, numerator, denominator);
    proratedBaseTax = baseTaxForRate;
  } else {
    // 분수=1: 전부 재상속 가정 (기존 동작)
    baseTaxForRate = priorTaxPaid;
  }

  // 공제 기본액 = 안분 기준 세액 × 공제율 (floor)
  const rawCredit = applyRate(baseTaxForRate, creditRate);

  // §30② 한도: 당해 산출세액을 초과할 수 없음
  const creditAmount = Math.min(rawCredit, currentComputedTax);

  // ── breakdown ─────────────────────────────────────────────────
  const breakdown: CalculationStep[] = [
    {
      label: "이전 상속세 납부세액",
      amount: priorTaxPaid,
      lawRef: TAX_CREDIT.SHORT_TERM_REINH,
    },
  ];

  if (prorationApplied) {
    breakdown.push({
      label: `재상속분 안분 (${shortTermReinheritAssetValue!.toLocaleString()} ÷ ${shortTermReinheritPriorEstateValue!.toLocaleString()}) — §30②1호`,
      amount: baseTaxForRate,
      lawRef: TAX_CREDIT.SHORT_TERM_REINH,
    });
  }

  breakdown.push({
    label: `단기재상속 공제율 (경과 ${elapsedYears}년 → ${creditRate * 100}%)`,
    amount: rawCredit,
    lawRef: TAX_CREDIT.SHORT_TERM_REINH,
  });

  if (rawCredit > currentComputedTax) {
    breakdown.push({
      label: "당해 산출세액 한도 적용 (§30②)",
      amount: creditAmount,
      note: `원래 공제액 ${rawCredit.toLocaleString()} → 한도 초과로 ${currentComputedTax.toLocaleString()} 적용`,
    });
  }

  return {
    creditAmount,
    creditRate,
    prorationApplied,
    prorationNumerator: prorationApplied ? shortTermReinheritAssetValue : undefined,
    prorationDenominator: prorationApplied ? shortTermReinheritPriorEstateValue : undefined,
    proratedBaseTax,
    breakdown,
  };
}
