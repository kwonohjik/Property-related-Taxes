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

  // 한도(집계) = floor(산출세액 × 영리법인 과세표준 / 상속세 과세표준)
  const limit = Math.floor(
    (totalComputedTax * corporateGiftTaxBase) / totalTaxBase,
  );

  // 영리법인 별 명세가 있으면 법인별 독립 면제(⑤_i = Min(법인 증여세, 법인별 한도))의
  //   합계를 집계 면제세액으로 사용한다 (P-5). 법인별 한도는 §3의2② 지분상당액의
  //   "상속세 상당액"과 동일하게 상속세 산출세액을 법인별 과세표준으로 안분한 값이다.
  //   ⚠ 이전 모델(집계 amount = Min(Σ증여세, 집계한도)을 taxBase 비율로 배분 + 잔액흡수)은
  //   한 법인의 면제를 다른 법인의 증여세 여력으로 정당화하여 저세율 법인에 ⑤를 과다배분
  //   → 주주 ⑪ 과세 불리·집계 과다면제(상속세 과소)를 유발했다. 집행기준 28-0-1의
  //   Min(한도, 산출세액) 캡을 단일법인 경로와 동일하게 법인별로 적용한다.
  let perCorporateBreakdown: PerCorporateExemptionDetail[] | undefined;
  let amount: number;
  if (opts.perCorporateInputs && opts.perCorporateInputs.length > 0) {
    perCorporateBreakdown = distributePerCorporate(
      opts.perCorporateInputs,
      totalComputedTax,
      totalTaxBase,
    );
    amount = perCorporateBreakdown.reduce((s, d) => s + d.exemptionAmount, 0);
  } else {
    // 법인별 명세 없음(doneeId 미매핑 등) — 집계 한도 캡만 적용 (best-effort).
    amount = Math.min(corporateGiftComputedTax, limit);
  }

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

  return { amount, limit, breakdown, perCorporateBreakdown };
}

// ────────────────────────────────────────────────────
// PR 2 — 다수 영리법인 안분 + 주주별 책임 환원
// ────────────────────────────────────────────────────

/**
 * 영리법인별 ⑤ 면제세액 + 주주별 ⑪ 면제분 납부세액 계산.
 *
 * ⑤ 법인별 면제세액 (§3의2② + 집행기준 28-0-1, 법인별 독립 적용):
 *   ⑤_i = Min(법인 증여세 산출세액, 법인별 한도)
 *   법인별 한도 = floor(상속세 산출세액 × 법인별 과세표준 / 상속세 과세표준)
 *   ⇒ 각 법인의 면제는 그 법인 자기 증여세 산출세액을 초과할 수 없다(단일법인 경로와 동일).
 *
 * 주주별 ⑪ (작성방법 6, KoreanLaw MCP 검증):
 *   ⑪ = (⑤ − ⑥) × 지분율  where ⑥ = ④ × 10%
 *   음수 가드 — (⑤ − ⑥) < 0이면 0
 */
function distributePerCorporate(
  inputs: PerCorporateInput[],
  totalComputedTax: number,
  totalTaxBase: number,
): PerCorporateExemptionDetail[] {
  if (totalTaxBase <= 0) return [];

  return inputs.map((inp) => {
    // 법인별 한도 = 상속세 산출세액을 법인 과세표준으로 안분(§3의2② "상속세 상당액").
    const perCorporateLimit = Math.floor(
      (totalComputedTax * inp.taxBase) / totalTaxBase,
    );
    const exemptionAmount = Math.min(inp.computedTax, perCorporateLimit);
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
