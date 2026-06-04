/**
 * 증여세 신고서 양식 표 행 빌더 (12행 사례 1 / 18행 사례 2)
 *
 * Phase A — 결과 카드 `GiftTaxFilingFormTable` 가 사용.
 * 단독 신고 (priorGifts=0) 시 산식 무의미 행은 display="dash" 로 마킹.
 */

import { GIFT } from "./legal-codes";
import type {
  FilingFormRow,
  GenerationSkipSurchargeDetail,
  PriorGiftCreditDetail,
  CalculationStep,
} from "./types/inheritance-gift.types";

export interface FilingFormRowsInput {
  grossGiftValue: number;             // ①
  debtAmount: number;                 // ②
  priorTotal: number;                 // ③
  totalDeduction: number;             // ④
  taxBase: number;                    // ⑤
  bracketRateLabel: string;           // ⑥
  computedTax: number;                // ⑦
  generationSkipDetail: GenerationSkipSurchargeDetail | null;
  priorGiftCreditDetail: PriorGiftCreditDetail | null;
  reportingCredit: number;            // ⑪ or ⑰
  finalTax: number;                   // ⑫ or ⑱
  hasPriorGifts: boolean;
  /**
   * 신고세액공제 산정 기준 금액 (§69).
   * = 산출세액합계 − §58 기납부세액공제 − §59 외국납부세액공제 − 특례 공제.
   * formula 표시에서 "신고세액공제 대상금액 × 3%"의 기준으로 사용.
   * 미전달 시 종전 formula(⑬−⑯ 또는 ⑦−⑩) 유지.
   */
  filingCreditBase?: number;
  /**
   * §59 외국납부세액공제액.
   * filingCreditBase가 전달된 경우 formula에 반영.
   */
  foreignTaxCredit?: number;
}

export function buildFilingFormRows(input: FilingFormRowsInput): FilingFormRow[] {
  const {
    grossGiftValue,
    debtAmount,
    priorTotal,
    totalDeduction,
    taxBase,
    bracketRateLabel,
    computedTax,
    generationSkipDetail,
    priorGiftCreditDetail,
    reportingCredit,
    finalTax,
    hasPriorGifts,
    filingCreditBase,
    foreignTaxCredit,
  } = input;

  // §69 신고세액공제 formula 문자열 빌드.
  // filingCreditBase가 전달된 경우: "신고세액공제 대상금액 × 3%" 풀어쓰기로 base를 echo.
  // 외국납부세액 > 0 이면 차감 단계를 formula에 포함 (표시 정합 — feedback_detailed_statement_formula_sync).
  function buildFilingCreditFormula(baseRow: string): string {
    if (filingCreditBase !== undefined) {
      const hasForeign = (foreignTaxCredit ?? 0) > 0;
      if (hasForeign) {
        return `(${baseRow} − §59 외국납부세액) × 3%`;
      }
      return `${baseRow} × 3%`;
    }
    // filingCreditBase 미전달 시 종전 formula
    return baseRow;
  }

  const rows: FilingFormRow[] = [];
  const useEighteen = generationSkipDetail !== null;

  // ①~⑥ 공통
  rows.push({
    number: "①",
    label: "증여재산가액",
    amount: grossGiftValue,
    display: "amount",
    lawRef: GIFT.TAXABLE_VALUE,
  });
  rows.push({
    number: "②",
    label: "채무",
    amount: debtAmount,
    display: "amount",
  });
  rows.push({
    number: "③",
    label: "증여재산가산액",
    amount: priorTotal,
    display: "amount",
    lawRef: GIFT.AGGREGATION_SAME_PERSON,
  });
  rows.push({
    number: "④",
    label: "증여재산공제",
    amount: totalDeduction,
    display: "amount",
    lawRef: GIFT.GIFT_DEDUCTION,
  });
  rows.push({
    number: "⑤",
    label: "합산과세표준",
    amount: taxBase,
    display: "amount",
    formula: "① + ③ − ④",
    lawRef: GIFT.TAX_BASE,
  });
  rows.push({
    number: "⑥",
    label: "세율",
    amount: 0, // placeholder; 표시는 bracketRateLabel
    display: "rate",
    formula: bracketRateLabel,
    lawRef: GIFT.TAX_RATE,
  });
  rows.push({
    number: "⑦",
    label: "산출세액",
    amount: computedTax,
    display: "amount",
    formula: "§55 누진세율(⑤)",
    lawRef: GIFT.TAX_RATE,
  });

  if (useEighteen) {
    // ⑧~⑬ 할증 행
    const d = generationSkipDetail!;
    rows.push({
      number: "⑧",
      label: "할증과세",
      amount: d.surchargeBase,
      display: "amount",
      formula: `⑦ × ${(d.nonParentLinealRatio * 100).toFixed(0)}% × ${(d.surchargeRate * 100).toFixed(0)}%`,
      lawRef: GIFT.GENERATION_SKIP,
    });
    rows.push({
      number: "⑨",
      label: "누적 기할증과세액",
      amount: d.priorAdditionalCumulative,
      display: "amount", // priorGifts=0 이면 0 표기 (옵션 A)
      formula: "Σ ⑫_prior",
    });
    rows.push({
      number: "⑩",
      label: "공제한도",
      amount: d.surchargeCreditLimit,
      display: hasPriorGifts ? "amount" : "dash",
      formula: "⑦ × ⑤_prior / ⑤ × 할증율",
      lawRef: GIFT.GENERATION_SKIP_LIMIT_FORMULA,
    });
    rows.push({
      number: "⑪",
      label: "차감 기할증과세액",
      amount: d.priorSurchargeCredit,
      display: hasPriorGifts ? "amount" : "dash",
      formula: "Min(⑨, ⑩)",
    });
    rows.push({
      number: "⑫",
      label: "추가 할증세액",
      amount: d.additionalSurcharge,
      display: "amount",
      formula: "⑧ − ⑪",
      lawRef: GIFT.GENERATION_SKIP,
    });
    rows.push({
      number: "⑬",
      label: "산출세액합계",
      amount: d.totalComputedTaxWithSurcharge,
      display: "amount",
      formula: "⑦ + ⑫",
    });

    // ⑭~⑱
    rows.push({
      number: "⑭",
      label: "가산 증여재산 산출세액",
      amount: priorGiftCreditDetail?.priorComputedTax ?? 0,
      display: hasPriorGifts ? "amount" : "dash",
    });
    rows.push({
      number: "⑮",
      label: "한도",
      amount: priorGiftCreditDetail?.creditLimit ?? 0,
      display: hasPriorGifts ? "amount" : "dash",
      formula: "⑦ × ⑤_prior / ⑤",
      lawRef: GIFT.PRIOR_TAX_CREDIT_LIMIT_FORMULA,
    });
    rows.push({
      number: "⑯",
      label: "공제액",
      amount: priorGiftCreditDetail?.priorPaidCredit ?? 0,
      display: "amount", // 0 표기 옵션 A
      formula: "Min(⑭, ⑮)",
      lawRef: GIFT.PRIOR_TAX_CREDIT,
    });
    rows.push({
      number: "⑰",
      label: "신고세액공제",
      amount: reportingCredit,
      display: "amount",
      // §69 formula: 외국납부(§59) 차감 후 남은 세액의 3%.
      // filingCreditBase echo 시 "신고세액공제 대상금액 × 3%"로 풀어쓰기.
      // 외국납부 > 0이면 차감 단계 명시 (§59 표시 정합).
      formula: buildFilingCreditFormula("⑬ − ⑯"),
    });
    rows.push({
      number: "⑱",
      label: "차가감자진납부세액",
      amount: finalTax,
      display: "amount",
      formula: "⑬ − ⑯ − ⑰",
    });
  } else {
    // 12행 매핑: ⑧~⑫ (사례 1)
    rows.push({
      number: "⑧",
      label: "가산 증여재산 산출세액",
      amount: priorGiftCreditDetail?.priorComputedTax ?? 0,
      display: hasPriorGifts ? "amount" : "dash",
    });
    rows.push({
      number: "⑨",
      label: "한도",
      amount: priorGiftCreditDetail?.creditLimit ?? 0,
      display: hasPriorGifts ? "amount" : "dash",
      formula: "⑦ × ⑤_prior / ⑤",
      lawRef: GIFT.PRIOR_TAX_CREDIT_LIMIT_FORMULA,
    });
    rows.push({
      number: "⑩",
      label: "공제액",
      amount: priorGiftCreditDetail?.priorPaidCredit ?? 0,
      display: hasPriorGifts ? "amount" : "dash",
      formula: "Min(⑧, ⑨)",
      lawRef: GIFT.PRIOR_TAX_CREDIT,
    });
    rows.push({
      number: "⑪",
      label: "신고세액공제",
      amount: reportingCredit,
      display: "amount",
      // §69 formula: 외국납부(§59) 차감 후 남은 세액의 3%.
      formula: buildFilingCreditFormula("⑦ − ⑩"),
    });
    rows.push({
      number: "⑫",
      label: "차가감자진납부세액",
      amount: finalTax,
      display: "amount",
      formula: "⑦ − ⑩ − ⑪",
    });
  }

  return rows;
}

/** breakdown 형태로 변환 (legacy 호출자 호환) */
export function rowsToBreakdown(rows: FilingFormRow[]): CalculationStep[] {
  return rows.map((r) => ({
    label: `${r.number} ${r.label}`,
    amount: r.amount,
    lawRef: r.lawRef,
    note: r.formula,
  }));
}
