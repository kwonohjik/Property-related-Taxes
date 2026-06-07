/**
 * §53의2 혼인·출산 증여재산공제 — 사전증여 입력 검증 단일진실 규칙
 *
 * client validatePriorGift(⑧)와 server Zod priorGiftSchema.superRefine(⑨)가 공용.
 * checkCorporateGiftRule(prior-gift-corporate-rule.ts) 패턴 미러 (single-source).
 *
 * 법령: 상증법 §53의2 — 직계존속으로부터 혼인·출산 증여, 합산 1억 한도.
 *
 * ⚠️ 관점(perspective) 주의 — 상속세 사전증여 도메인:
 *   - 증여인 = 항상 피상속인, 수증인 = 상속인(Heir).
 *   - PriorGift.doneeRelation은 **피상속인 관점** 라벨(deriveDoneeRelationFromHeir):
 *       자녀 상속인 → "lineal_descendant"(피상속인의 직계비속), 신고서 표시·§13 분류에 사용.
 *   - §53의2 적격 = "수증자가 직계존속으로부터 받음" = 피상속인이 수증자의 직계존속
 *     = 수증자(상속인)가 피상속인의 **직계비속** = doneeRelation === "lineal_descendant".
 *   - 따라서 gift-deductions의 isMarriageBirthEligibleRelation(수증자 관점, lineal_ascendant)이
 *     아니라 본 파일의 inheritance 전용 predicate를 사용한다.
 *     (deriveDoneeRelationFromHeir swap은 신고서 표시·§13을 깨뜨리므로 채택하지 않음.)
 */
import type { DonorRelation } from "@/lib/tax-engine/types/inheritance-gift.types";

/** §53의2 한도 (혼인+출산 합산) */
const MARRIAGE_BIRTH_MAX = 100_000_000;

/**
 * 상속세 사전증여에서 §53의2 적격 수증자 관계 판정 (피상속인 관점).
 * 수증자(상속인)가 피상속인의 직계비속(자녀 등) → 피상속인이 그의 직계존속 → §53의2 적격.
 */
export function isInheritancePriorGiftMarriageBirthEligible(
  doneeRelation: DonorRelation | undefined,
): boolean {
  return doneeRelation === "lineal_descendant";
}

/**
 * §53의2 사전증여 검증. 위반 시 오류 메시지, 정상 시 null.
 * @param gift marriageBirthDeduction·doneeRelation 보유 객체 (PriorGift 또는 Zod data)
 */
export function checkMarriageBirthGiftRule(gift: {
  marriageBirthDeduction?: number;
  doneeRelation?: DonorRelation;
}): string | null {
  if (gift.marriageBirthDeduction == null) return null;
  // (a) 1억 한도 초과 차단
  if (gift.marriageBirthDeduction > MARRIAGE_BIRTH_MAX) {
    return "§53의2 혼인·출산 증여재산공제는 합산 최대 1억원입니다.";
  }
  // (b) 비적격 수증자 차단 — 피상속인의 직계비속(자녀 등)이 받은 증여에만 적용
  if (!isInheritancePriorGiftMarriageBirthEligible(gift.doneeRelation)) {
    return "§53의2는 피상속인의 직계비속(자녀 등)이 받은 사전증여에만 적용됩니다.";
  }
  // (c) giftTaxBase 동시 입력은 차단 아님 — UI 안내로 갈음 (엔진이 이미 무시)
  return null;
}
