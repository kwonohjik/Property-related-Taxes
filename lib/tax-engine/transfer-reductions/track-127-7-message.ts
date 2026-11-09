/**
 * 조특법 §127⑦ 트랙 교차 차단 문구 — ⑧ validate(`transfer-tax-validate-reductions.ts`)와 ⑫ Zod(`transfer-tax-schema-reduction-refines.ts`)가
 * 같은 문구를 쓰도록 한 곳에 둔다(NH-41 · 계획서 `track-127-7-cross-nh41.plan.md`). 판정은 `findTrack127_7Conflict`가 한다.
 */
import { REDUCTION_METADATA } from "./metadata";
import { track127_7EffectLabel, type Track127_7Conflict } from "./income-deduction-router";

export function track127_7ConflictMessage(conflict: Track127_7Conflict): string {
  const label = (t: string) => REDUCTION_METADATA[t as keyof typeof REDUCTION_METADATA]?.uiLabel ?? t;
  const { first, second } = conflict;
  return (
    `조특법 §127⑦ 중복배제: 「${label(first.type)}」(${track127_7EffectLabel(first.type, first.kind)})과(와) ` +
    `「${label(second.type)}」(${track127_7EffectLabel(second.type, second.kind)})은(는) 동시에 적용받을 수 없습니다. ` +
    "둘 중 하나만 선택하세요 — 어느 쪽이 유리한지는 각각 선택해 계산한 뒤 총 납부세액을 비교하면 됩니다."
  );
}
