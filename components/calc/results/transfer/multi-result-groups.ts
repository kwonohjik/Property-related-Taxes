/**
 * 다건 합산 결과 행 ↔ 폼 항목 연결.
 *
 * 다건 route는 일반건물 1건을 토지·건물 카드로 펼쳐 합산한다(`app/api/calc/transfer/multi-gb-expansion.ts`).
 * 카드 id는 `land#<폼 항목 id>`·`building#<폼 항목 id>`라 결과 행의 `propertyId`로는 폼을 찾을 수 없다 —
 * 접미사(`cardSuffixOf`)가 폼 항목 id다. (`baseCardId`는 카드 종류 `land`를 돌려주므로 쓰면 안 된다.)
 *
 * 화면은 일반건물을 **자산 1행 + 펼치면 토지·건물 카드**로 보인다(계획서 multi-building-valuation-support Q-2 a).
 */
import { cardSuffixOf } from "@/lib/tax-engine/general-building-share-id";
import { shareIndexOf } from "@/lib/tax-engine/general-building-share-id";
import { purchasedPartParentIdOf } from "@/lib/tax-engine/general-building-share-id";

/** 결과 행 id → 그 행을 만든 폼 항목 id. 접미사가 없으면(일반건물 외) 그대로. */
export function multiFormPropertyIdOf(resultPropertyId: string): string {
  // 이월과세 × 채무 인수분 매입분 꼬리 카드(`p1__purchased`)는 그 자산의 조각이다 — 부모 자산 id로 돌린다(트랙 CO-DEBT).
  return cardSuffixOf(resultPropertyId) ?? purchasedPartParentIdOf(resultPropertyId);
}

/**
 * 결과 행 id → 그 행의 폼 자산. 일반건물 지분 카드(`land#<폼 항목 id>.<지분번호>` · 트랙 GS Q-2 a)는 그 지분의 자산이고, 그 밖은 첫 자산이다.
 * 종전처럼 `assets[0]`만 읽으면 둘째 지분 카드의 취득일·구분 기재 선택이 첫 지분 것으로 바뀐다.
 */
export function multiFormAssetOf<A>(form: { assets: A[] } | undefined, resultPropertyId: string): A | undefined {
  if (!form) return undefined;
  return form.assets[shareIndexOf(resultPropertyId) ?? 0] ?? form.assets[0];
}

export interface MultiResultGroup<T> {
  /** 폼 항목 id */
  formPropertyId: string;
  /** 그 항목의 결과 행 — 일반건물이면 카드 여러 장 */
  rows: T[];
  /** 일반건물 카드 묶음인가(행 id에 접미사가 있다) */
  isCardGroup: boolean;
}

/** 결과 행을 폼 항목 단위로 묶는다 — 첫 등장 순서를 지킨다(엔진이 카드를 연속으로 낸다). */
export function groupMultiResultRows<T extends { propertyId: string }>(rows: readonly T[]): MultiResultGroup<T>[] {
  const groups: MultiResultGroup<T>[] = [];
  const byId = new Map<string, MultiResultGroup<T>>();
  for (const row of rows) {
    const formPropertyId = multiFormPropertyIdOf(row.propertyId);
    let g = byId.get(formPropertyId);
    if (!g) {
      g = { formPropertyId, rows: [], isCardGroup: row.propertyId !== formPropertyId };
      byId.set(formPropertyId, g);
      groups.push(g);
    }
    g.rows.push(row);
  }
  return groups;
}
