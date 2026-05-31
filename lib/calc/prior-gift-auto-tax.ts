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
import type {
  DonorRelation,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";

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

/**
 * 영리법인 사전증여 §3의2② 산출세액 상당액 진입 fallback (phase2-후속).
 *
 * 기존 데이터·진입 시점(onChange 트리거 없음)에 corporateGiftComputedTax가 미설정(undefined)이고
 * 증여재산가액이 있으면 autoComputePriorGiftTax로 채워 계산 정합을 보장.
 *   - corporateGiftComputedTax === undefined → 미계산 → fallback
 *   - === 0 (사용자 명시) 또는 > 0 (계산값) → 존중 (덮어쓰지 않음)
 *
 * UI 표시 fallback(GiftRowEditor)과 동일 산식 — mirror 3중(표시·API) single-source.
 * store(폼 state)는 변경하지 않음 — 엔진 전달용 정제만.
 *
 * @param gifts 사전증여 배열
 * @returns corporate 미계산 항목만 cgct 채운 새 배열 (그 외 동일 참조)
 */
export function applyCorporateGiftTaxFallback(gifts: PriorGift[]): PriorGift[] {
  return gifts.map((g) =>
    g.beneficiaryType === "corporate" &&
    g.corporateGiftComputedTax === undefined &&
    (g.giftAmount ?? 0) > 0
      ? {
          ...g,
          corporateGiftComputedTax: autoComputePriorGiftTax(
            g.giftAmount,
            g.doneeRelation,
          ),
        }
      : g,
  );
}
