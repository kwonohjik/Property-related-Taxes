/**
 * 증여세 — 엔진이 읽는데 비우면 조용히 다른 세액이 되는 입력의 **공용 게이트** (⑧·⑫ 단일 소스).
 *
 * ⑧ `components/calc/gift-tax-form-validate.ts`와 ⑫ `lib/validators/inheritance-gift-required-refines.ts`가
 * 같은 술어를 부른다. 조건을 두 곳에 따로 적으면 한쪽만 바뀌어 「UI 통과 ↔ API 400」 모순이 생긴다.
 *
 * 2026-09-30 Zod↔엔진 필수 점검 2차(#16·#17·#18 + §4.3 동일인 합산 회차 존재 요구).
 */
import { isSameDonorGroup } from "@/lib/tax-engine/gift-prior-aggregation";
import type { GiftDonorRelation } from "@/lib/tax-engine/types/inheritance-gift.types";

/** 사전증여 회차에서 누락을 판정하는 필드 — 반환 순서가 ⑧ 메시지 우선순위다. */
export type PriorRoundRequiredField =
  | "donor"
  | "farmlandReductionAmount"
  | "giftTaxBase"
  | "computedTax"
  | "additionalGenerationSkipSurcharge";

interface PriorRoundLike {
  giftAmount: number;
  donor?: GiftDonorRelation;
  specialTreatmentType?: "startup" | "family_business";
  giftTaxBase?: number;
  computedTax?: number;
  wasGenerationSkip?: boolean;
  additionalGenerationSkipSurcharge?: number;
  farmlandReductionApplied?: boolean;
  farmlandReductionAmount?: number;
}

/**
 * 사전증여(§47② 합산) 회차의 누락 필수 입력.
 *
 * - 증여자 — 없으면 합산 그룹을 정할 수 없어 합산에서 빠진다.
 * - §71 농지 감면 회차의 감면세액 — 없으면 조세특례제한법 §133④ 5년간 1억원 한도 누계가 0으로
 *   읽혀 금번 감면이 커진다.
 *   「감면 적용」 회차의 감면세액은 정의상 0보다 크다(`> 0`).
 * - 동일인 합산 회차(비특례)의 과세표준 ⑤·산출세액 ⑦·(세대생략 회차) 추가 할증세액 ⑫ —
 *   상속세 및 증여세법 §58①·② 납부세액공제·한도와 §57 할증 산식에 쓰인다. **값의 존재만** 요구한다:
 *   공제 범위 안의 회차는 과세표준·산출세액·할증세액이 실제로 0이다.
 */
export function missingPriorRoundInputs(
  p: PriorRoundLike,
  currentDonor: GiftDonorRelation | "" | undefined,
): PriorRoundRequiredField[] {
  if (!(p.giftAmount > 0)) return [];
  if (!p.donor) return ["donor"];
  const missing: PriorRoundRequiredField[] = [];
  if (p.farmlandReductionApplied && !((p.farmlandReductionAmount ?? 0) > 0)) {
    missing.push("farmlandReductionAmount");
  }
  if (currentDonor && isSameDonorGroup(p.donor, currentDonor) && !p.specialTreatmentType) {
    if (p.giftTaxBase == null) missing.push("giftTaxBase");
    if (p.computedTax == null) missing.push("computedTax");
    if (p.wasGenerationSkip && p.additionalGenerationSkipSurcharge == null) {
      missing.push("additionalGenerationSkipSurcharge");
    }
  }
  return missing;
}

/**
 * 상속세 및 증여세법 §59 외국납부세액공제 — 외국납부세액이 있으면 국외 증여재산 과세표준
 * (같은 법 시행령 §48이 준용하는 §21① 한도 산식의 분자)이
 * 필요하다. 없으면 엔진이 한도를 적용하지 않아 외국납부세액 전액을 공제한다.
 */
export function foreignGiftTaxBaseMissing(
  foreignTaxPaid: number | undefined,
  foreignGiftTaxBase: number | undefined,
): boolean {
  return (foreignTaxPaid ?? 0) > 0 && !((foreignGiftTaxBase ?? 0) > 0);
}
