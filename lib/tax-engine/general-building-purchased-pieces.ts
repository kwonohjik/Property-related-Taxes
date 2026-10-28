/**
 * 일반건물 결과 소비자가 **채무 부분(매입분) 꼬리 카드**를 만났을 때의 처리 — 두 부류로 갈린다 (UI 설계서 `carryover-gift-debt-purchased-part-parts.ui.design.md` §3.6.2).
 *
 * 엔진은 채무가 있는 카드마다 증여분(= 부모 카드 id)과 매입분(꼬리 `base__purchased#N`) 두 장으로 집계해 `aggregated.properties`에만 꼬리를 싣는다
 * (`generalBuildingValuationDetail.assetCards`·안분 행에는 없다). 꼬리 id는 `baseCardId`로 벗겨지지 않아(`#` 앞이 `land__purchased`) 정확 비교(`=== "land"`)에 걸리지 않는다.
 *
 *  - (가) **카드 산식·환산 근거를 찾는** 곳(상세명세서 산식 · 신고서 열 메타 · 취득 방식 문구): 꼬리를 **부모로 풀거나 건너뛴다**. 꼬리의 취득가액은 인수한 채무 그대로이며 환산 산식 대상이 아니다
 *    — 근거는 부모 카드 echo(`purchasedPartSplit`)가 대신한다. → `purchasedPartParentIdOf`(leaf)로 부모 id를 얻는다.
 *  - (나) **합계를 보이는** 곳(3-자산 요약 표의 카드 수 판정 · 파트 취득가액 블록): 꼬리를 **부모에 합친다**. 합치지 않으면 카드가 4장이 되어 표가 사라지거나(침묵 소실) 파트 값이 증여분뿐이다. → 이 파일.
 *
 * 순수 함수 — `use client` 컴포넌트도 부른다.
 */
import { isPurchasedPieceId, purchasedPartParentIdOf } from "./general-building-share-id";

/**
 * 꼬리 카드를 모두 뺀다 — 부모(증여분) 카드와 꼬리 없는 카드만 남는다. 카드를 **세는** 판정(`length === 3`)이 쓴다.
 */
export function withoutPurchasedPieces<T extends { propertyId: string }>(rows: readonly T[]): T[] {
  return rows.filter((r) => !isPurchasedPieceId(r.propertyId));
}

/**
 * 꼬리 카드의 지정한 수치 필드를 부모 카드에 합치고 꼬리를 뺀다. 부모를 못 찾는 꼬리(방어)는 그대로 남긴다 — 값을 버리지 않는다.
 * 입력은 바꾸지 않는다(부모는 복사본).
 */
export function foldPurchasedPieces<T extends { propertyId: string }>(rows: readonly T[], sumKeys: ReadonlyArray<keyof T & string>): T[] {
  const folded = new Map<string, T>();
  for (const r of rows) if (!isPurchasedPieceId(r.propertyId)) folded.set(r.propertyId, { ...r });
  const orphans: T[] = [];
  for (const r of rows) {
    if (!isPurchasedPieceId(r.propertyId)) continue;
    const parent = folded.get(purchasedPartParentIdOf(r.propertyId));
    if (!parent) {
      orphans.push(r);
      continue;
    }
    const target = parent as Record<string, unknown>;
    for (const k of sumKeys) {
      const add = (r as Record<string, unknown>)[k];
      if (typeof add === "number") target[k] = ((target[k] as number | undefined) ?? 0) + add;
    }
  }
  // 입력 순서를 보존한다 — 부모(복사본)는 원래 자리, 방어용 고아 꼬리는 원래 자리.
  return rows.flatMap((r) => (isPurchasedPieceId(r.propertyId) ? (orphans.includes(r) ? [r] : []) : [folded.get(r.propertyId)!]));
}

/** 카드 한 장의 취득가액 = 그 카드 + 그 카드의 꼬리(있으면). 파트 취득가액 블록이 읽는다. */
export function cardAcquisitionPriceWithPieces(
  properties: ReadonlyArray<{ propertyId: string; acquisitionPrice: number }>,
  propertyId: string,
): number | undefined {
  const self = properties.find((p) => p.propertyId === propertyId);
  if (!self) return undefined;
  const tails = properties.filter((p) => isPurchasedPieceId(p.propertyId) && purchasedPartParentIdOf(p.propertyId) === propertyId);
  return tails.reduce((s, t) => s + t.acquisitionPrice, self.acquisitionPrice);
}
