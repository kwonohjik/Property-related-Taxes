/**
 * 사전증여 기납부 증여세 자동계산 — single-source (donee-phase2)
 *
 * 단순 1건 독립 산식: (증여재산가액 − §53 관계별 증여재산공제) × §56 누진세율.
 *   동일인 10년 합산·§57 세대생략 할증·§69 신고세액공제는 미반영 (인터뷰 Q1: 단순 1건 독립).
 *
 * 라우팅:
 *   - 자연인(상속인·수유자)·비영리법인 → giftTaxPaid 제안 (§28 증여세액공제용)
 *   - 영리법인 → corporateGiftComputedTax(§3의2② 산출세액 상당액) 대체
 *
 * 검증(실측): 배우자 760m → 22,000,000 / 영리법인 700m(공제 0) → 150,000,000.
 *
 * Plan:   docs/00-pm/inheritance-prior-gift-donee-phase2.plan.md
 * Design: docs/02-design/features/inheritance-prior-gift-donee-phase2.design.md
 */

import { calcRelationDeduction } from "@/lib/tax-engine/deductions/gift-deductions";
import { calcInheritanceGiftTax } from "@/lib/tax-engine/inheritance-gift-common";
import type { DonorRelation } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 사전증여 1건의 증여세 산출세액 자동계산 (단순 1건 독립).
 *
 * @param giftAmount 증여재산가액 (원)
 * @param doneeRelation §53 관계별 공제 결정용. undefined(영리법인·비친족 수유자) → 공제 0.
 * @returns 산출세액 (원, 정수). giftAmount ≤ 0 또는 과세표준 < 50만원(§55 단서) → 0.
 */
export function autoComputePriorGiftTax(
  giftAmount: number,
  doneeRelation: DonorRelation | undefined,
): number {
  if (giftAmount <= 0) return 0;
  // §53 관계별 증여재산공제 (10년 통산 한도, 단건이므로 priorUsedDeduction=0).
  // doneeRelation 없으면 공제 0 (영리법인·관계 미지정).
  const deduction = doneeRelation
    ? calcRelationDeduction(
        { donorRelation: doneeRelation, priorUsedDeduction: 0 },
        giftAmount,
      ).relationDeduction
    : 0;
  const taxBase = Math.max(0, giftAmount - deduction);
  if (taxBase < 500_000) return 0; // §55 단서 — 과세표준 50만원 미만 비과세
  return calcInheritanceGiftTax(taxBase); // §56 누진세율 (brackets 기본값)
}
