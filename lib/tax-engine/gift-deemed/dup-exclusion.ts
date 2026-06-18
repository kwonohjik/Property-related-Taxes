/** (Phase 3) 증여세 과세특례 — 중복배제 §43① */
import type { DeemedGiftResult } from "./types";

/**
 * §43①: 하나의 증여에 §33~§45의5 중 둘 이상이 동시 적용되는 경우,
 * 이익이 가장 많게 계산되는 것 하나만 적용한다. (조특법 §127⑦의 '합산'과 방향 반대)
 * 후보 결과 배열에서 적용(applied) 중 deemedGiftValue가 최대인 1건을 선택.
 */
export function selectPrimaryDeemedGift(results: DeemedGiftResult[]): DeemedGiftResult | null {
  const applied = results.filter((r) => r.applied);
  if (applied.length === 0) return results[0] ?? null;
  return applied.reduce((best, cur) => (cur.deemedGiftValue > best.deemedGiftValue ? cur : best));
}
