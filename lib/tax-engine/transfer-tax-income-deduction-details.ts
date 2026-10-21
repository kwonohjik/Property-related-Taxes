/**
 * 감면 상세(detail) **확정** — 정상 경로(`transfer-tax-finalize.ts`)와 재개발·재건축 §166 경로(`transfer-tax-redevelopment.ts`)의 단일 소스.
 *
 * 두 경로 모두 `resolveIncomeDeduction`이 만든 **preliminary** 상세(농특세 필드 0)를 받는다. 결과 객체에 싣기 전에
 *   · STEP 7.5 — 차감형(§99의3·§99·§98의8 + 하이브리드 5년 후) 활성 상세에 농특세 2-pass 값을 채우고
 *   · STEP 8.7 — 하이브리드 5년 이내 세액감면 상세에 감면액·농특세를 합친다(농특세령 §4⑦1호 비과세 판정 포함).
 *
 * 🔴 종전에는 §166 경로가 이 확정을 하지 않고 상세도 싣지 않았다(계획서 `docs/00-pm/redev-income-deduction-detail-echo.plan.md`).
 *    함께 양도 합산은 상세에서 차감액을 읽으므로(`transfer-tax-aggregate-pickers.ts` `incomeDeductionReducibleOf`)
 *    §166 자산의 차감형 감면이 0이 됐고(220,703,333 대 179,698,889), 5년 이내 §98의3 세액감면에 비과세 판정 없이
 *    농특세 20%가 붙었다(30,880,000 — 정상 경로 0).
 *
 * 감면 전·후 산출세액은 경로마다 구하는 방식이 달라(정상 = split 인식 `resolveSplitAwareTax`, §166 = `calcTax`) 인자로 받는다.
 * 단계(steps) 문구는 호출부가 넣는다.
 */

import { applyRate } from "./tax-utils";
import { HYBRID_ARTICLE } from "./transfer-tax-rural-surtax";
import type { New993Result } from "./transfer-reductions/new-99-3";
import type { New99Result } from "./transfer-reductions/new-99";
import type { Unsold988Result } from "./transfer-reductions/unsold-98-8";
import type { UnsoldHybridResult } from "./transfer-reductions/unsold-hybrid";

/** 결과 객체(`TransferTaxResult`)와 같은 키 — 확정 후 그대로 펼쳐 싣는다. */
export interface IncomeDeductionDetails {
  new993Detail?: New993Result;
  new99Detail?: New99Result;
  unsold988Detail?: Unsold988Result;
  unsold987Detail?: UnsoldHybridResult;
  unsold992Detail?: UnsoldHybridResult;
  unsold983Detail?: UnsoldHybridResult;
  unsold985Detail?: UnsoldHybridResult;
  unsold986Detail?: UnsoldHybridResult;
  unsold982Detail?: UnsoldHybridResult;
  unsold984Detail?: UnsoldHybridResult;
  unsold98Detail?: UnsoldHybridResult;
}

/** 11종 키만 골라 담는다 — `resolveIncomeDeduction` 결과처럼 다른 필드가 섞인 객체에서 쓴다. */
export function pickIncomeDeductionDetails(src: IncomeDeductionDetails): IncomeDeductionDetails {
  return {
    new993Detail: src.new993Detail,
    new99Detail: src.new99Detail,
    unsold988Detail: src.unsold988Detail,
    unsold987Detail: src.unsold987Detail,
    unsold992Detail: src.unsold992Detail,
    unsold983Detail: src.unsold983Detail,
    unsold985Detail: src.unsold985Detail,
    unsold986Detail: src.unsold986Detail,
    unsold982Detail: src.unsold982Detail,
    unsold984Detail: src.unsold984Detail,
    unsold98Detail: src.unsold98Detail,
  };
}

type IncomeDeductionKey =
  | "new993Detail" | "new99Detail" | "unsold988Detail"
  | "unsold987Detail" | "unsold992Detail" | "unsold983Detail" | "unsold985Detail" | "unsold986Detail";

const ARTICLE_LABEL: Record<IncomeDeductionKey, string> = {
  new993Detail: "§99의3",
  new99Detail: "§99",
  unsold988Detail: "§98의8",
  unsold987Detail: "§98의7",
  unsold992Detail: "§99의2",
  unsold983Detail: "§98의3",
  unsold985Detail: "§98의5",
  unsold986Detail: "§98의6",
};

/** 하이브리드는 5년 후(income_deduction)만 2-pass — 5년 내(tax_amount)는 STEP 8.7 */
const HYBRID_INCOME_KEYS = ["unsold987Detail", "unsold992Detail", "unsold983Detail", "unsold985Detail", "unsold986Detail"] as const;

export interface ActiveIncomeDeduction {
  key: IncomeDeductionKey;
  articleLabel: string;
  /** 농특세 비과세 (농특세령 §4⑦1호 — §98의3·§98의5): 차감 효과는 유지, 농특세만 0 */
  isExempt: boolean;
}

/** STEP 7.5 — 농특세 2-pass 대상(적격 차감형 감면 1건). 없으면 undefined. */
export function selectActiveIncomeDeduction(d: IncomeDeductionDetails): ActiveIncomeDeduction | undefined {
  const candidates: IncomeDeductionKey[] = [
    "new993Detail", "new99Detail", "unsold988Detail",
    ...HYBRID_INCOME_KEYS.filter((k) => d[k]?.isEligible && d[k]?.effectCategory === "income_deduction"),
  ];
  const key = candidates.find((k) => d[k]?.isEligible);
  if (!key) return undefined;
  const detail = d[key]!;
  const isExempt = "ruralSurtaxExempt" in detail && (detail as UnsoldHybridResult).ruralSurtaxExempt === true;
  return { key, articleLabel: ARTICLE_LABEL[key], isExempt };
}

/**
 * §99의3 2-pass 후 formulaSteps의 농특세 관련 두 step(preliminary 세액 0)을 확정값으로 교체.
 * computeNew993는 preliminary 호출 시 calculatedTaxBefore/After=0으로 push → 확정 단계에서 실값 반영.
 */
function patchNew993SurtaxSteps(
  steps: New993Result["formulaSteps"],
  taxBefore: number,
  taxAfter: number,
  reduction: number,
  ruralSurtax: number,
): New993Result["formulaSteps"] {
  return steps.map((s) => {
    if (s.label === "양도세 감면세액 (농특세 기준)") {
      return {
        ...s,
        value: reduction,
        formula: `감면 전 산출세액 ${taxBefore.toLocaleString()} − 감면 후 산출세액 ${taxAfter.toLocaleString()} = ${reduction.toLocaleString()}`,
      };
    }
    if (s.label === "농어촌특별세 (20%)") {
      return {
        ...s,
        value: ruralSurtax,
        formula: `감면세액 ${reduction.toLocaleString()} × 20% = ${ruralSurtax.toLocaleString()}`,
      };
    }
    return s;
  });
}

/**
 * STEP 7.5 — 활성 차감형 상세에 농특세 2-pass 값을 채운다.
 * 농특세법 §2①1호 "소득공제" 해당 — 감면 전후 산출세액 차 × 20%.
 */
export function applyIncomeDeductionSurtax(
  d: IncomeDeductionDetails,
  active: ActiveIncomeDeduction,
  tax: { before: number; after: number },
): { details: IncomeDeductionDetails; taxReduction: number; ruralSurtax: number } {
  const taxReduction = Math.max(0, tax.before - tax.after);
  const ruralSurtax = active.isExempt ? 0 : applyRate(taxReduction, 0.2);
  const surtaxFields = { taxReductionForRuralSurtax: taxReduction, ruralSurtax };
  const details = { ...d };
  if (active.key === "new993Detail") {
    details.new993Detail = {
      ...d.new993Detail!,
      ...surtaxFields,
      // preliminary formulaSteps의 농특세 관련 두 step은 세액 0(2-pass 前) → 확정값으로 교체.
      formulaSteps: patchNew993SurtaxSteps(d.new993Detail!.formulaSteps, tax.before, tax.after, taxReduction, ruralSurtax),
    };
  } else {
    // 키마다 detail 타입이 달라 한 줄 대입으로는 좁혀지지 않는다 — 농특세 두 필드만 덧붙인다.
    (details as Record<string, unknown>)[active.key] = { ...d[active.key]!, ...surtaxFields };
  }
  return { details, taxReduction, ruralSurtax };
}

/**
 * STEP 8.7 — 하이브리드 5년 이내 세액감면: 농특세(감면세액 × 20%, §98의3·§98의5는 농특세령 §4⑦1호 비과세)와 상세 합치기.
 * 농특세법 §2①1호 "조특법에 따라 감면받는 세액". `applies`가 false면 하이브리드 세액감면이 아니다(호출부가 다른 농특세 판정을 한다).
 */
export function mergeHybridTaxDetail(
  d: IncomeDeductionDetails,
  hybrid: { reductionTypeApplied?: string; cappedReductionAmount: number; hybridTaxDetail?: UnsoldHybridResult },
): { applies: boolean; details: IncomeDeductionDetails; ruralSurtax: number; isExempt: boolean; articleLabel?: string } {
  const { reductionTypeApplied, cappedReductionAmount, hybridTaxDetail } = hybrid;
  if (reductionTypeApplied === undefined || HYBRID_ARTICLE[reductionTypeApplied] === undefined || cappedReductionAmount <= 0) {
    return { applies: false, details: d, ruralSurtax: 0, isExempt: false };
  }
  // 농특세 비과세 (농특세령 §4⑦1호): §98의3·§98의5 — evaluator의 exempt 플래그 단일 진실
  const isExempt = hybridTaxDetail?.ruralSurtaxExempt === true;
  const ruralSurtax = isExempt ? 0 : applyRate(cappedReductionAmount, 0.2);
  const details = { ...d };
  // 최종 detail에 감면액·농특세 echo (calcReductions 평가본 우선 — reductionAmount 보유)
  if (hybridTaxDetail && hybridTaxDetail.id === reductionTypeApplied) {
    const merged: UnsoldHybridResult = {
      ...hybridTaxDetail,
      reductionAmount: cappedReductionAmount,
      taxReductionForRuralSurtax: isExempt ? 0 : cappedReductionAmount,
      ruralSurtax,
    };
    if (merged.id === "unsold_98_7") details.unsold987Detail = merged;
    else if (merged.id === "unsold_99_2") details.unsold992Detail = merged;
    else if (merged.id === "unsold_98_3") details.unsold983Detail = merged;
    else if (merged.id === "unsold_98_5") details.unsold985Detail = merged;
    else if (merged.id === "unsold_98_4") details.unsold984Detail = merged;
    else details.unsold986Detail = merged;
  }
  return { applies: true, details, ruralSurtax, isExempt, articleLabel: HYBRID_ARTICLE[reductionTypeApplied] };
}
