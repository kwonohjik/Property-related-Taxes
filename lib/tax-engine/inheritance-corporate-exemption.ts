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
  PerCorporateExemptionDetail,
  ShareholderPaymentDetail,
  ShareholderInfo,
} from "./types/inheritance-gift.types";

// ────────────────────────────────────────────────────
// PR 2 (2026-05-22) — 영리법인 별 분배 입력 타입
// ────────────────────────────────────────────────────

export interface PerCorporateInput {
  /** Heir.id */
  corporateId: string;
  /** 영리법인이 받았거나 받을 재산가액 (사전증여 또는 유증) */
  inheritedAmount: number;
  /** 영리법인 과세표준 (안분 분자 — corporateGiftTaxBase 와 동일 의미) */
  taxBase: number;
  /** 영리법인 증여세 산출세액 상당액 */
  computedTax: number;
  /** 상속인·직계비속 주주 명세 (없으면 빈 배열) */
  shareholders: ShareholderInfo[];
}

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
  opts: { perCorporateInputs?: PerCorporateInput[] } = {},
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

  // PR 2 (2026-05-22) — 영리법인 별 분배 명세 (부표 5)
  let perCorporateBreakdown: PerCorporateExemptionDetail[] | undefined;
  if (opts.perCorporateInputs && opts.perCorporateInputs.length > 0) {
    perCorporateBreakdown = distributePerCorporate(
      opts.perCorporateInputs,
      amount,
      corporateGiftTaxBase,
    );
  }

  return { amount, limit, breakdown, perCorporateBreakdown };
}

// ────────────────────────────────────────────────────
// PR 2 — 다수 영리법인 안분 + 주주별 책임 환원
// ────────────────────────────────────────────────────

/**
 * 영리법인별 ⑤ 면제세액 안분 + 주주별 ⑪ 면제분 납부세액 계산.
 *
 * 안분 산식 (시행령 §3의2 본문 인용 후 v3 확정 — 가정 산식):
 *   각 영리법인 ⑤ = totalExemption × (해당 영리법인 과세표준 / 영리법인 합계 과세표준)
 *
 * 주주별 ⑪ (작성방법 6, KoreanLaw MCP 검증):
 *   ⑪ = (⑤ − ⑥) × 지분율  where ⑥ = ④ × 10%
 *   음수 가드 — (⑤ − ⑥) < 0이면 0
 */
function distributePerCorporate(
  inputs: PerCorporateInput[],
  totalExemption: number,
  totalTaxBase: number,
): PerCorporateExemptionDetail[] {
  if (totalTaxBase <= 0) return [];

  // floor 안분 잔액 흡수 ([[feedback_floor_residual_absorption]]): 앞 법인은 floor,
  //   마지막 법인이 (totalExemption − 앞 법인 합)을 흡수 → Σ exemptionAmount == totalExemption.
  let allocated = 0;
  return inputs.map((inp, idx) => {
    const isLast = idx === inputs.length - 1;
    const exemptionAmount =
      inputs.length === 1
        ? totalExemption
        : isLast
          ? totalExemption - allocated // 마지막 법인 잔액 흡수
          : Math.floor((totalExemption * inp.taxBase) / totalTaxBase);
    allocated += exemptionAmount;
    const tenPercentBaseline = Math.floor(inp.inheritedAmount * 0.1);
    const residualForShareholders = Math.max(
      0,
      exemptionAmount - tenPercentBaseline,
    );

    const shareholderPayments: ShareholderPaymentDetail[] = inp.shareholders.map(
      (sh) => ({
        shareholderId: sh.id,
        shareRatio: sh.shareRatio,
        paymentAmount: Math.floor(residualForShareholders * sh.shareRatio),
      }),
    );

    return {
      corporateId: inp.corporateId,
      inheritedAmount: inp.inheritedAmount,
      exemptionAmount,
      tenPercentBaseline,
      shareholderPayments,
    };
  });
}
