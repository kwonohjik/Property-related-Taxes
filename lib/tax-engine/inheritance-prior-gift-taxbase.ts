/**
 * 사전증여 §53 증여재산공제 자동 도출 — 상속인별 배부(STEP 13) 직접배부 정정.
 *
 * 상속세 모드 UI(GiftRowEditor)는 giftTaxBase(증여 과세표준) 입력란이 없어
 * (증여세 모드 전용) priorGift.giftTaxBase가 항상 undefined. 그 결과
 * inheritance-allocation.ts:sumPriorGiftsByDonee의 `giftTaxBase ?? giftAmount`
 * fallback이 항상 작동 → 직접배부에 §53 공제 미반영(이미지 53: 배우자 760M, 정답 160M).
 *
 * 본 헬퍼는 doneeId 단위로 §53 관계공제를 자동 차감하여 giftTaxBase를 도출한다.
 *
 * 법령 (KoreanLaw 상증법 mst 276123 §53, 2026-06-01 검증):
 *   상증법 §53 — "수증자를 기준으로" 10년 통산 공제. 배우자 6억·직계존속 5천(미성년 2천)·
 *   직계비속 5천·6촌이내 혈족·4촌이내 인척 1천·그 외 0. → doneeId(수증자) 단위 합산 1회.
 *
 * 도출 우선순위:
 *   ① giftTaxBase 명시 → 그대로 (수동 override·증여세 이력 보존)
 *   ② doneeRelation → §53 관계공제
 *   ③ doneeId → heirs.relation 매핑 → §53 관계공제
 *   ④ 도출 불가(legatee·corporate·orphan·doneeId 無) → giftAmount 유지 (§53 대상 아님)
 *
 * Pure Engine. mutate 금지 — 새 배열 반환.
 */

import { calcRelationDeduction } from "./deductions/gift-deductions";
// 엔진→lib/calc import (선례: inheritance-farming-deduction.ts:20). derive는 types만 의존 → 순환 없음.
import { deriveDoneeRelationFromHeir } from "@/lib/calc/prior-gift-donee-derive";
import type {
  PriorGift,
  Heir,
  DonorRelation,
} from "./types/inheritance-gift.types";

/**
 * 사전증여 배열의 각 항목에 giftTaxBase(증여 과세표준 = giftAmount − §53 공제)를 도출하여 부여.
 *
 * @param gifts 사전증여 내역 (이미 §13 cutoff 필터된 집합 권장)
 * @param heirs 상속인·수유자·법인 (doneeId → relation 매핑용)
 * @returns giftTaxBase가 채워진 새 PriorGift 배열 (원본 불변)
 */
export function derivePriorGiftTaxBase(
  gifts: PriorGift[],
  heirs: Heir[],
): PriorGift[] {
  if (gifts.length === 0) return gifts;

  const relById = new Map<string, Heir["relation"]>(
    heirs.map((h) => [h.id, h.relation]),
  );

  // 관계 도출: ② doneeRelation 우선, ③ doneeId→relation. legatee·corporate·orphan → undefined.
  const resolveRel = (g: PriorGift): DonorRelation | undefined => {
    if (g.doneeRelation) return g.doneeRelation;
    if (!g.doneeId) return undefined;
    const r = relById.get(g.doneeId);
    return r ? deriveDoneeRelationFromHeir(r) : undefined;
  };

  // doneeId 단위 gross 합산 — giftTaxBase 미명시 & 관계 도출 가능 건만 (§53 통산 1회 대상).
  // doneeId 없고 doneeRelation만 있는 건: 인덱스를 가상 키로 사용(단건 처리).
  const resolveKey = (g: PriorGift, idx: number): string | undefined => {
    if (!resolveRel(g)) return undefined; // ④ 관계 도출 불가
    return g.doneeId ?? `__rel_${idx}__`; // doneeId 우선, 없으면 인덱스 기반 단건 키
  };

  const grossByDonee = new Map<string, number>();
  gifts.forEach((g, i) => {
    if (g.giftTaxBase !== undefined) return; // ① 명시 보존
    const key = resolveKey(g, i);
    if (!key) return; // ④ 도출 불가 제외
    grossByDonee.set(key, (grossByDonee.get(key) ?? 0) + g.giftAmount);
  });

  // 키 단위 §53 공제 1회 (관계별 한도).
  const dedByDonee = new Map<string, number>();
  gifts.forEach((g, i) => {
    if (g.giftTaxBase !== undefined) return;
    const key = resolveKey(g, i);
    if (!key || dedByDonee.has(key)) return; // 이미 처리된 키 건너뜀
    const rel = resolveRel(g);
    if (!rel) return;
    const gross = grossByDonee.get(key) ?? 0;
    dedByDonee.set(
      key,
      calcRelationDeduction({ donorRelation: rel, priorUsedDeduction: 0 }, gross)
        .relationDeduction,
    );
  });

  // 각 gift에 giftTaxBase 부여 — 공제를 키 내 건별 비례 배분, 마지막 건 잔액 흡수(Σ 보존).
  //   (다건이면 floor 잔차가 마지막 건에 흡수되어 Σ giftTaxBase == gross − 공제 정확 보존.)
  const runningDeductedByDonee = new Map<string, number>(); // 키별 누적 배분 공제
  const lastIndexByDonee = new Map<string, number>();
  gifts.forEach((g, i) => {
    const key = resolveKey(g, i);
    if (key && grossByDonee.has(key)) lastIndexByDonee.set(key, i);
  });

  return gifts.map((g, i) => {
    if (g.giftTaxBase !== undefined) return g; // ① 보존
    const key = resolveKey(g, i);
    if (!key || !grossByDonee.has(key)) return g; // ④ 도출 불가 — giftAmount 유지

    const gross = grossByDonee.get(key)!;
    const totalDed = dedByDonee.get(key) ?? 0;
    const isLast = lastIndexByDonee.get(key) === i;

    let allocatedDed: number;
    if (isLast) {
      // 마지막 건 — 잔액 흡수
      allocatedDed = totalDed - (runningDeductedByDonee.get(key) ?? 0);
    } else {
      allocatedDed = gross > 0 ? Math.floor((totalDed * g.giftAmount) / gross) : 0;
      runningDeductedByDonee.set(
        key,
        (runningDeductedByDonee.get(key) ?? 0) + allocatedDed,
      );
    }

    return { ...g, giftTaxBase: Math.max(0, g.giftAmount - allocatedDed) };
  });
}
