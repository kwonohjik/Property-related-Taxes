/**
 * 상세명세서 자산별 행 — §155⑳ 특례 × 12억 초과(부분과세) 자산의 표시 근거.
 *
 * §155⑳ 경로(`transfer-tax-rental-housing-step.ts`)는 장기보유특별공제를 **전체 양도차익** 기준으로 산정하고(1,200,000,000 × 56% = 672,000,000),
 * 12억 초과분 비율(§161)은 그 다음 **양도소득금액 단계**에서 곱한다. 일반 경로는 장특을 **과세분** 기준으로 산정한다(240,000,000 × 56%).
 * 자산별 행은 둘 다 «과세대상 = min(차익, 양도소득금액 + 장특)»으로 역산하므로 특례 경로에서는 「과세대상양도차익 777,600,000 × 86.4%」처럼
 * 법정 공제율에 없는 숫자가 찍혔다. 표시 전용 — 값(`longTermHoldingDeduction`·`income`·`assetTaxableGain`)과 세액은 바꾸지 않는다.
 *
 * 비과세 양도소득금액 = (전체 차익 − 장특) − 양도소득금액 — 단건 §155⑳ 행(`nontaxableGainAmount`)과 같은 정의다.
 *
 * R-c06-04(사용자 결정 2026-11-22 a) — 합산 신고서·명세서 자산 열도 **단건 신고서 규약**(`FilingFormTableHelpers` `isRH` 분기)으로 적는다:
 *   비과세 양도차익 0 · 과세대상 양도차익 = 전체 양도차익 · 양도소득금액 = 전체 양도차익 − 장특 · 비과세 양도소득금액 = 위 정의.
 *   종전 합산 표는 비과세분을 양도차익 단계(비과세 양도차익 422,400,000 · 과세대상 777,600,000)에 싣고 비과세 양도소득금액을 0으로 고정해
 *   같은 자산을 단건 표와 다른 단계에 적었다. 표시 전용 — `income`·`longTermHoldingDeduction`·세액은 그대로다.
 */
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { fmt } from "./DetailedStatementGbFormulas";
import { effectiveGrossGain } from "./exempt-gross-gain";
import { assetExemptGain } from "./exempt-gross-gain";
import { assetTaxableGain } from "./exempt-gross-gain";
import { nontaxableIncomeLabel } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/display-labels";

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

/** 자산 열 「비과세 양도차익」 — §155⑳ 부분과세 자산은 0(비과세분은 양도소득금액 단계), 그 밖은 `assetExemptGain`. */
export function filingExemptGainOf(p: PerPropertyBreakdown): number {
  return rhPartialBasis(p) ? 0 : assetExemptGain(p);
}

/** 자산 열 「과세대상 양도차익」 — §155⑳ 부분과세 자산은 전체 양도차익, 그 밖은 `assetTaxableGain`. */
export function filingTaxableGainOf(p: PerPropertyBreakdown): number {
  return rhPartialBasis(p)?.gross ?? assetTaxableGain(p);
}

/** 자산 열 「비과세 양도소득금액」 — §155⑳ 부분과세 자산만 값이 있다(그 밖은 0). 양도소득금액 칸은 이 값을 빼기 **전**(`income` + 이 값)이다. */
export function filingNontaxableIncomeOf(p: PerPropertyBreakdown): number {
  return rhPartialBasis(p)?.nontaxableIncome ?? 0;
}

/**
 * 합산 표 「비과세 양도소득금액」 행 라벨 — 단건과 같은 `nontaxableIncomeLabel`(「(소령 §161①)」은 B에만 · A는 §155⑳ 전단 → §154①).
 * 값이 있는 자산이 없으면 종전 라벨, 시나리오가 둘 이상 섞이면 조문 없는 라벨이다.
 */
export function aggregateNontaxableIncomeLabel(properties: readonly PerPropertyBreakdown[]): string {
  const labels = new Set(properties.filter((p) => rhPartialBasis(p)).map((p) => nontaxableIncomeLabel(p.rentalHousingScenarioId)));
  if (labels.size === 0) return "비과세 양도소득금액 (소령 §161①)";
  return labels.size === 1 ? [...labels][0] : nontaxableIncomeLabel(undefined);
}

/** 과세대상 양도차익 = 전체 양도차익 (단건 명세서 §155⑳ 문구와 같다) */
export function rhPartialTaxableGainFormula(b: RhPartialBasis): string {
  return `전체 양도차익 ${fmt(b.gross)} (비과세분은 양도소득금액 단계에서 가른다)`;
}

/** 장특공제 = 전체 양도차익 × 율 */
export function rhPartialLthFormula(b: RhPartialBasis, lth: number): string {
  const ratePct = ((lth / b.gross) * 100).toFixed(1).replace(/\.0$/, "");
  return `전체 양도차익 ${fmt(b.gross)} × ${ratePct}% = ${fmt(lth)}`;
}

/** 양도소득금액(비과세 양도소득금액 차감 전) = 전체 양도차익 − 장특공제 */
export function rhPartialIncomeFormula(b: RhPartialBasis, lth: number): string {
  return `${fmt(b.gross)} - ${fmt(lth)} = ${fmt(b.gross - lth)}`;
}
