/** (Phase 3) 증여세 과세특례 — 중복배제 §43① */
import type { DeemedGiftResult } from "./types";

/**
 * §43①: 하나의 증여에 아래 조문이 **둘 이상 동시 적용**되는 경우 이익이 가장 많게
 * 계산되는 것 하나만 적용한다. (조특법 §127⑦의 '합산'과 방향 반대)
 *
 * 법 §43① 열거 verbatim — 「제33조부터 제39조까지, 제39조의2, 제39조의3, 제40조,
 * 제41조의2부터 제41조의5까지, 제42조, 제42조의2, 제42조의3, 제44조, 제45조 및
 * 제45조의3부터 제45조의5까지」.
 * ⚠️ 「§33~§45의5」로 뭉뚱그리면 틀린다 — **§45의2(명의신탁)는 열거에 없고**,
 *    §41·§41의2 앞 구간도 빠져 있다(§41의2부터). §44는 들어 있다.
 *
 * 후보 결과 배열에서 적용(applied) 중 deemedGiftValue가 최대인 1건을 선택.
 *
 * ⚠️ **프로덕션 호출처 0건**(테스트만 참조) — `router.ts`가 유형 단건만 계산하므로
 *    동시 적용 자체가 발생하지 않는다. 배선 전까지는 미사용 구현이다.
 */
export function selectPrimaryDeemedGift(results: DeemedGiftResult[]): DeemedGiftResult | null {
  const applied = results.filter((r) => r.applied);
  if (applied.length === 0) return results[0] ?? null;
  return applied.reduce((best, cur) => (cur.deemedGiftValue > best.deemedGiftValue ? cur : best));
}
