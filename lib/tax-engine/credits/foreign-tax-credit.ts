/**
 * 외국납부세액공제
 *
 * 상속세 §29: 국외재산에 대한 외국 상속세액 공제
 * 증여세 §59: 국외재산에 대한 외국 증여세액 공제
 *
 * 공제 한도:
 *   산출세액 × (국외 상속·증여 재산가액 / 상속·증여 재산가액 총액)
 *
 * 단순화: 호출 측에서 이미 한도 계산을 완료한 금액을 foreignTaxPaid로 전달.
 *         최종 방어: min(foreignTaxPaid, computedTax)
 */

import { TAX_CREDIT } from "../legal-codes";
import { applyRate } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";

// ============================================================
// 외국납부세액공제 계산
// ============================================================

export interface ForeignTaxCreditInput {
  /** 외국에서 납부한 상속·증여세액 */
  foreignTaxPaid: number;
  /** 당해 산출세액 (한도 계산용) */
  computedTax: number;
  /**
   * 국외 재산가액 / 전체 재산가액 비율 (0.0 ~ 1.0)
   * 미입력 시 한도 비율 적용 생략 (foreignTaxPaid 전액 인정, computedTax 한도)
   */
  foreignPropertyRatio?: number;
  /** 'inheritance' = §29, 'gift' = §59 */
  mode: "inheritance" | "gift";
}

export interface ForeignTaxCreditResult {
  creditAmount: number;
  breakdown: CalculationStep[];
}

/**
 * 외국납부세액공제 계산 (§29 / §59)
 *
 * @param input 외국납부세액공제 입력
 */
export function calcForeignTaxCredit(
  input: ForeignTaxCreditInput,
): ForeignTaxCreditResult {
  const { foreignTaxPaid, computedTax, foreignPropertyRatio, mode } = input;

  const lawRef =
    mode === "inheritance" ? TAX_CREDIT.INH_FOREIGN : TAX_CREDIT.GIFT_FOREIGN;

  if (!foreignTaxPaid || foreignTaxPaid <= 0) {
    return {
      creditAmount: 0,
      breakdown: [
        {
          label: "외국납부세액공제 — 해당 없음",
          amount: 0,
          lawRef,
        },
      ],
    };
  }

  // 한도 계산
  let limit = computedTax;
  const breakdown: CalculationStep[] = [
    {
      label: "외국에서 납부한 상속·증여세액",
      amount: foreignTaxPaid,
      lawRef,
    },
  ];

  if (foreignPropertyRatio !== undefined && foreignPropertyRatio > 0) {
    // 정확한 한도: 산출세액 × (국외재산 / 전체재산) — applyRate() 사용 (P0-2 원칙)
    limit = applyRate(computedTax, Math.min(foreignPropertyRatio, 1.0));
    breakdown.push({
      label: `공제 한도 (산출세액 × 국외재산 비율 ${(foreignPropertyRatio * 100).toFixed(1)}%)`,
      amount: limit,
      lawRef,
    });
  } else {
    breakdown.push({
      label: "공제 한도 (산출세액 전액 — 국외재산 비율 미입력)",
      amount: limit,
      lawRef,
    });
  }

  const creditAmount = Math.min(foreignTaxPaid, limit);

  if (foreignTaxPaid > limit) {
    breakdown.push({
      label: "공제 한도 적용 후 외국납부세액공제",
      amount: creditAmount,
      note: `초과액 ${(foreignTaxPaid - limit).toLocaleString()}원은 공제 불가`,
    });
  }

  return { creditAmount, breakdown };
}
