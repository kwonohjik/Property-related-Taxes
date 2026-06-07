/**
 * 상속세 사전증여 §53/§53의2 공제 perspective 변환 — single-source.
 *
 * Plan:   docs/00-pm/inheritance-prior-gift-followup-3items.plan.md (항목 C)
 * Design: docs/02-design/features/inheritance-prior-gift-followup-3items.engine.design.md
 *
 * ⚠️ 관점(perspective) 분리 — 상속세 사전증여 도메인:
 *   - 증여인 = 항상 피상속인 / 수증인 = 상속인(Heir).
 *   - PriorGift.doneeRelation은 **피상속인 관점** 라벨(deriveDoneeRelationFromHeir):
 *       자녀 상속인 → "lineal_descendant"(피상속인의 직계비속). 신고서 표시·§13 분류에 사용.
 *   - §53(증여재산공제)·§53의2(혼인·출산)는 **수증자 관점**(증여자가 수증자의 무엇인가)이 필요:
 *       자녀가 피상속인(=자녀의 직계존속)으로부터 받음 → §53 직계존속 5천(수증자 미성년 2천).
 *   - 본 헬퍼가 doneeRelation(피상속인 관점) → §53/§53의2 공제 관계(수증자 관점)로 변환한다.
 *
 * ⚠️ doneeRelation 자체는 **절대 덮지 않음** — 신고서 표시(InheritanceFilingFormTable RELATION_LABEL)가
 *    수증자 관점으로 바뀌면 표시가 깨짐. 변환값은 §53/§53의2 계산에만 사용.
 */
import { differenceInYears } from "date-fns";
import type { DonorRelation } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 피상속인 관점 doneeRelation → 수증자 관점 §53/§53의2 공제 관계.
 * @param doneeRelation     피상속인 관점 라벨 (deriveDoneeRelationFromHeir 산출)
 * @param isDoneeMinorAtGift 증여 당시 수증자(상속인)가 만 19세 미만이었는지 (직계비속→직계존속 변환 시만 영향)
 */
export function toGiftDeductionDonorRelation(
  doneeRelation: DonorRelation,
  isDoneeMinorAtGift: boolean,
): DonorRelation {
  switch (doneeRelation) {
    case "lineal_descendant":
      // 수증자=피상속인 직계비속(자녀) → 피상속인은 수증자의 직계존속
      return isDoneeMinorAtGift ? "lineal_ascendant_minor" : "lineal_ascendant_adult";
    case "lineal_ascendant_adult":
    case "lineal_ascendant_minor":
      // 수증자=피상속인 직계존속(부모) → 피상속인은 수증자의 직계비속
      return "lineal_descendant";
    case "spouse":
      return "spouse";
    case "other_relative":
      return "other_relative";
  }
}

/**
 * 증여 당시 수증자 미성년 여부 — birthDate + giftDate 도출 우선, 미입력 시 명시 토글 fallback.
 * 민법 §4: 만 19세 미만. (§20 미성년자공제·§27 isMinorOverride와 동일 differenceInYears 산식)
 */
export function isDoneeMinorAtGift(args: {
  giftDate?: string;
  birthDate?: string;
  doneeWasMinorAtGift?: boolean;
}): boolean {
  const { giftDate, birthDate, doneeWasMinorAtGift } = args;
  if (birthDate && giftDate) {
    return differenceInYears(new Date(giftDate), new Date(birthDate)) < 19;
  }
  return doneeWasMinorAtGift === true;
}
