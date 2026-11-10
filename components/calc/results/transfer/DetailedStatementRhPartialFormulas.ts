/**
 * 상세명세서 자산별 행 — §155⑳ 특례 × 12억 초과(부분과세) 자산의 표시 근거.
 *
 * §155⑳ 경로(`transfer-tax-rental-housing-step.ts`)는 장기보유특별공제를 **전체 양도차익** 기준으로 산정하고(1,200,000,000 × 56% = 672,000,000),
 * 12억 초과분 비율(§161)은 그 다음 **양도소득금액 단계**에서 곱한다. 일반 경로는 장특을 **과세분** 기준으로 산정한다(240,000,000 × 56%).
 * 자산별 행은 둘 다 «과세대상 = min(차익, 양도소득금액 + 장특)»으로 역산하므로 특례 경로에서는 「과세대상양도차익 777,600,000 × 86.4%」처럼
 * 법정 공제율에 없는 숫자가 찍혔다. 표시 전용 — 값(`longTermHoldingDeduction`·`income`·`assetTaxableGain`)과 세액은 바꾸지 않는다.
 *
 * 비과세 양도소득금액 = (전체 차익 − 장특) − 양도소득금액 — 단건 §155⑳ 행(`nontaxableGainAmount`)과 같은 정의다.
 */
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { fmt } from "./DetailedStatementGbFormulas";
import { effectiveGrossGain } from "./exempt-gross-gain";

export interface RhPartialBasis {
  /** 전체(12억 안분 전) 양도차익 */
  gross: number;
  /** 비과세 양도소득금액 — 12억 초과분 외 몫 */
  nontaxableIncome: number;
}

/**
 * §155⑳ 특례가 적용되고, 장특 이후 소득이 일부만 과세되는 자산이면 기준값을 돌려준다. 그 밖(전액 비과세·전액 과세·토지·건물 분리·구 이력)은 null —
 * 종전 문구를 그대로 쓴다. `splitDetail`이 있으면 장특 기준이 파트별이라 대상에서 뺀다.
 */
export function rhPartialBasis(p: PerPropertyBreakdown): RhPartialBasis | null {
  if (!p.rentalHousingApplied || p.isExempt || p.splitDetail) return null;
  const gross = effectiveGrossGain(p);
  const nontaxableIncome = gross - p.longTermHoldingDeduction - p.income;
  return gross > 0 && p.income >= 0 && nontaxableIncome > 0 ? { gross, nontaxableIncome } : null;
}

/** 과세대상 양도차익 = 전체 양도차익 − 비과세 양도소득금액 (값은 `assetTaxableGain`과 같다) */
export function rhPartialTaxableGainFormula(b: RhPartialBasis, taxable: number): string {
  return `전체 양도차익 ${fmt(b.gross)} − 비과세 양도소득금액 ${fmt(b.nontaxableIncome)} = ${fmt(taxable)}`;
}

/** 장특공제 = 전체 양도차익 × 율 */
export function rhPartialLthFormula(b: RhPartialBasis, lth: number): string {
  const ratePct = ((lth / b.gross) * 100).toFixed(1).replace(/\.0$/, "");
  return `전체 양도차익 ${fmt(b.gross)} × ${ratePct}% = ${fmt(lth)}`;
}

/** 양도소득금액 = 전체 양도차익 − 장특공제 − 비과세 양도소득금액 */
export function rhPartialIncomeFormula(b: RhPartialBasis, lth: number, income: number): string {
  return `${fmt(b.gross)} - ${fmt(lth)} - ${fmt(b.nontaxableIncome)}(비과세 양도소득금액) = ${fmt(income)}`;
}
