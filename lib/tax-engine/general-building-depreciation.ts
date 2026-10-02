/**
 * 일반건물(토지+건물 일괄) — 「소득세법」 §97③ 감가상각비를 **건물 카드**에 싣는 단일 leaf.
 *
 * 감가상각비는 건물분에 귀속된다(조심2013서4988). 일반건물은 토지·건물(·증축건물)이 **카드**로 엔진에 들어가므로
 * 원건물 카드에만 싣고, 공제는 카드 → 단건 엔진(`calcTransferGain`)이 한 번만 한다.
 * §97②2호 단서(swap) 비교의 가목은 공제 **후** 값이다(`cardDepreciation`) — 두 판정 지점
 * (`general-building-swap.ts` 자산총액·파트)과 표시 지점(`buildApportionment`)이 이 leaf를 공유한다.
 */
import type { AssetCardForAggregate } from "./types/general-building.types";
import { baseCardId } from "./general-building-share-id";

/** 원건물 카드인가 — 토지·증축건물(`building2`)은 아니다. 지분 접미사(`building#0`)는 벗기고 본다. */
function isOriginalBuildingCard(card: AssetCardForAggregate): boolean {
  return card.propertyType === "general_building_unit" && baseCardId(card.propertyId) !== "building2";
}

/** 원건물 카드에 감가상각비를 싣는다. 입력이 0·음수·미지정이면 카드를 그대로 돌려준다(회귀 0). */
export function attachBuildingDepreciation(
  cards: AssetCardForAggregate[],
  depreciationAmount: number | undefined,
): AssetCardForAggregate[] {
  const dep = Math.max(0, depreciationAmount ?? 0);
  if (dep <= 0) return cards;
  return cards.map((c) => (isOriginalBuildingCard(c) ? { ...c, depreciationAmount: dep } : c));
}

/** 카드의 취득가액에서 실제로 공제되는 감가상각비 — 취득가액까지로 절삭한다(`calcTransferGain`과 같은 규칙). */
export function cardDepreciation(card: Pick<AssetCardForAggregate, "depreciationAmount" | "acquisitionPrice">): number {
  return Math.min(Math.max(0, card.depreciationAmount ?? 0), Math.max(0, card.acquisitionPrice));
}
