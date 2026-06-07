/**
 * §53의2③ 수증자별 합산 1억 캡 — stateful accumulator (single-source).
 *
 * Plan:   docs/00-pm/inheritance-prior-gift-followup-3items.plan.md (항목 A)
 * Design: docs/02-design/features/inheritance-prior-gift-followup-3items.engine.design.md
 *
 * 상증법 §53의2③: 제1항(혼인)·제2항(출산) 공제는 **합하여 1억원**을 한도 — 수증자(doneeId)별 통합.
 *
 * 현행 3 위치(§24 분자 `computePriorGiftDeductionForLimit`·§19 배우자 `spouseGiftTaxBase`·
 * 자동도출 `derivePriorGiftTaxBase`)는 모두 per-gift `min(x,1억)`만 적용 → 동일 수증자 다건이면
 * 합산 1억 초과 가능(과대공제). 본 capper로 doneeId 기반 합산 캡을 통일한다.
 *
 * ⚠️ 3 위치는 서로 다른 배열·필터를 순회하므로 인덱스 공유 불가 → 각 호출처가 자기 순회 시작 시
 *    makeMarriageBirthCapper()를 1회 생성하고 gift당 1회 take(g)를 호출한다.
 *    캡은 doneeId별 독립 누적이므로 호출처마다 별도 인스턴스라도 동일 doneeId 합산 결과는 같다.
 *
 * v1 한계: doneeId 없는 수동 경로 다건은 동일 수증자 식별 불가 → solo 키로 각 per-gift 1억
 *          (합산 캡 미보장). 수증자 선택(doneeId) 경로는 정상 합산.
 */

/** §53의2 통합 한도 (혼인+출산) */
const MARRIAGE_BIRTH_MAX = 100_000_000;

export interface MarriageBirthCapper {
  /**
   * gift의 §53의2 공제액에 수증자별 합산 1억 캡을 적용한 유효액 반환.
   * 동일 doneeId 누적이 1억 도달 시 이후 0(경계 건은 잔여만). doneeId 없으면 단건(per-gift 1억).
   */
  take(gift: { doneeId?: string; marriageBirthDeduction?: number }): number;
}

export function makeMarriageBirthCapper(): MarriageBirthCapper {
  const used = new Map<string, number>();
  let solo = 0;
  return {
    take(gift) {
      const raw = Math.min(gift.marriageBirthDeduction ?? 0, MARRIAGE_BIRTH_MAX);
      if (raw <= 0) return 0;
      const key = gift.doneeId ?? `__mb_solo_${solo++}__`;
      const remaining = Math.max(0, MARRIAGE_BIRTH_MAX - (used.get(key) ?? 0));
      const effective = Math.min(raw, remaining);
      used.set(key, (used.get(key) ?? 0) + effective);
      return effective;
    },
  };
}
