/**
 * 영리법인 상속세 면제 (§3의2 ②, 집행기준 28-0-1)
 *
 * §13 ②에 따라 가산된 영리법인 사전증여재산에 대해서는 상속세 면제.
 * 단, 영리법인이 부담한 증여세(법인세) 산출세액 한도 내에서만 면제.
 *
 * 면제 한도 산식 (§28 ① 안분 한도와 동일 구조):
 *   한도 = floor(상속세 산출세액 × 영리법인 증여 과세표준 / 상속세 과세표준)
 *   면제 = Min(영리법인 증여세 산출세액, 한도)
 *
 * @example PDF 종합사례 (책 1866 ⑩)
 *   영리법인 증여세 산출세액 = 150,000,000
 *   한도 = floor(1,627,500,000 × 700,000,000 / 4,175,000,000) = 272,874,251
 *   면제세액 = Min(150,000,000, 272,874,251) = 150,000,000
 *
 * Pure Engine — DB 호출 없음, 순수 함수.
 */

import { INH } from "./legal-codes";
import type {
  CorporateExemptionResult,
  CalculationStep,
} from "./types/inheritance-gift.types";

// ────────────────────────────────────────────────────
// 입력 타입
// ────────────────────────────────────────────────────

export interface CorporateExemptionInput {
  /** 영리법인이 납부할 증여세 산출세액 (§3의2② 면제 한도용) */
  corporateGiftComputedTax: number;
  /** 영리법인 사전증여 과세표준 (한도 산식 분자) */
  corporateGiftTaxBase: number;
  /** 상속세 산출세액 (§26 누진 + §27 할증 포함 여부는 호출 측 결정 — PDF는 할증 미포함) */
  totalComputedTax: number;
  /** 상속세 과세표준 (한도 산식 분모) */
  totalTaxBase: number;
}

// ────────────────────────────────────────────────────
// 영리법인 면제세액 계산
// ────────────────────────────────────────────────────

/**
 * §3의2 ② 영리법인 면제세액 계산.
 *
 * 한도가 영리법인 증여세 산출세액보다 큰 경우 → 면제세액 = 증여세 산출세액 전액
 * 한도가 영리법인 증여세 산출세액보다 작은 경우 → 면제세액 = 한도
 * 영리법인 증여세 산출세액·과세표준 등이 0이면 면제 0.
 */
export function calcCorporateExemption(
  input: CorporateExemptionInput,
): CorporateExemptionResult {
  const {
    corporateGiftComputedTax,
    corporateGiftTaxBase,
    totalComputedTax,
    totalTaxBase,
  } = input;

  // 0 또는 음수 방어
  if (
    corporateGiftComputedTax <= 0 ||
    corporateGiftTaxBase <= 0 ||
    totalTaxBase <= 0
  ) {
    return {
      amount: 0,
      limit: 0,
      breakdown: [
        {
          label: "영리법인 면제 — 미적용 (영리법인 사전증여 없음 또는 과세표준 0)",
          amount: 0,
          lawRef: INH.TAXPAYER,
        },
      ],
    };
  }

  // 한도 = floor(산출세액 × 영리법인 과세표준 / 상속세 과세표준)
  const limit = Math.floor(
    (totalComputedTax * corporateGiftTaxBase) / totalTaxBase,
  );
  const amount = Math.min(corporateGiftComputedTax, limit);

  const breakdown: CalculationStep[] = [
    {
      label: "영리법인 증여세 산출세액",
      amount: corporateGiftComputedTax,
      lawRef: INH.TAXPAYER,
    },
    {
      label: "면제 한도 — 산출세액 × 영리법인 과세표준 ÷ 상속세 과세표준",
      amount: limit,
      lawRef: INH.TAXPAYER,
      note: `${totalComputedTax.toLocaleString()} × ${corporateGiftTaxBase.toLocaleString()} ÷ ${totalTaxBase.toLocaleString()}`,
    },
    {
      label: "영리법인 면제세액 Min(증여세 산출세액, 한도)",
      amount,
      lawRef: INH.TAXPAYER,
    },
  ];

  return { amount, limit, breakdown };
}
