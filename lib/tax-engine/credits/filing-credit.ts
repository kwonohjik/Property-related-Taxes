/**
 * 신고세액공제 (상증법 §69)
 *
 * 법정신고기한 내에 과세표준 신고를 한 경우
 * 산출세액의 3%를 공제.
 *
 * 신고기한:
 *   상속세 : 상속개시일이 속하는 달의 말일로부터 6개월 (비거주자 9개월)
 *   증여세 : 증여받은 날이 속하는 달의 말일로부터 3개월
 *
 * 공제 기준:
 *   (산출세액 - 증여세액공제 - 외국납부세액공제 - 단기재상속세액공제) × 3%
 *
 * 단, 조특법 §30의5·§30의6 특례 적용 시는 특례 세액에서 3% 공제.
 */

import { TAX_CREDIT } from "../legal-codes";
import { applyRate } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";

// ============================================================
// 신고세액공제율
// ============================================================

/** 신고세액공제율: 3% (§69) */
const FILING_CREDIT_RATE = 0.03;

// ============================================================
// 신고세액공제 계산
// ============================================================

export interface FilingCreditInput {
  /** 법정신고기한 내 신고 여부 */
  isFiledOnTime: boolean;
  /**
   * 공제 기준 산출세액
   * (산출세액 - 증여세액공제 - 외국납부공제 - 단기재상속공제)
   * 조특법 특례 적용 시: 특례 세액
   */
  taxBeforeFilingCredit: number;
}

export interface FilingCreditResult {
  creditAmount: number;
  breakdown: CalculationStep[];
}

/**
 * 신고세액공제 계산 (§69)
 *
 * @param input 신고세액공제 입력
 */
export function calcFilingCredit(input: FilingCreditInput): FilingCreditResult {
  const { isFiledOnTime, taxBeforeFilingCredit } = input;

  if (!isFiledOnTime || taxBeforeFilingCredit <= 0) {
    return {
      creditAmount: 0,
      breakdown: [
        {
          label: isFiledOnTime
            ? "신고세액공제 — 공제 기준세액 없음"
            : "신고세액공제 — 법정기한 내 미신고",
          amount: 0,
          lawRef: TAX_CREDIT.FILING_CREDIT,
        },
      ],
    };
  }

  const creditAmount = applyRate(taxBeforeFilingCredit, FILING_CREDIT_RATE);

  return {
    creditAmount,
    breakdown: [
      {
        label: "신고세액공제 기준세액",
        amount: taxBeforeFilingCredit,
        lawRef: TAX_CREDIT.FILING_CREDIT,
      },
      {
        label: `신고세액공제 (3%)`,
        amount: creditAmount,
        lawRef: TAX_CREDIT.FILING_CREDIT,
        note: "법정신고기한 내 신고",
      },
    ],
  };
}
