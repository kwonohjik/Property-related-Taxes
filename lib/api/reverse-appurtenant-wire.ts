/**
 * G1 — 사례 28 역방향(첫 자산이 주택부수토지 · 주택은 함께 양도) 구성의 **짝 주택**(와이어 본문 기준) — route·⑫ 공용 술어.
 *
 * route `resolveReverseAppurtenantUnit`(`app/api/calc/transfer/bundled-reverse-appurtenant.ts`)이 역방향 단위를 만드는 조건과 같다:
 * 첫 자산이 토지 · `landNature: "appurtenant_to_housing"` · 주택 계열 컴패니언(주택·겸용·재개발 완공주택)이 **일반 주택 1건뿐** ·
 * 그 주택의 취득일이 있고 건물 정착면적(카드 값, 없으면 주 자산 값)이 0보다 크다. 하나라도 어긋나면 route는 단위를 만들지 않는다(종전 계산).
 *
 * ⑫는 이 술어로 「부수토지(첫 자산 토지 · 부수토지 컴패니언)의 토지 보유기간 중 거주 개월」(`landHoldingResidenceMonths`)의 짝 주택을 정한다 —
 * 단위가 안 만들어지는 본문에서 키를 받으면 엔진이 읽지 않아 조용히 버려지므로 같은 조건이어야 한다.
 * 화면은 이 구성을 ⑧이 막는다(`lib/calc/reverse-appurtenant-house.ts`) — API 직접 호출만 닿는다.
 */

/** 주택 계열 컴패니언 — 이 중 하나라도 일반 주택이 아니거나 2건 이상이면 짝 주택을 정하지 않는다. */
const HOUSE_LIKE_KINDS: ReadonlySet<string> = new Set(["housing", "mixed_use_house", "redevelopment_apt"]);

export function reverseAppurtenantWireHouse<C extends { assetKind?: string; acquisitionDate?: unknown; buildingFootprintArea?: number }>(
  primary: { propertyType?: string; landNature?: string },
  companions: readonly C[],
  /** 주 자산 본문의 정착면적 — 주택 카드에 없을 때 route가 쓰는 값(`resolveHousingContextFromCompanion`) */
  fallbackBuildingFootprintArea: number | undefined,
): C | undefined {
  if (primary.propertyType !== "land" || primary.landNature !== "appurtenant_to_housing") return undefined;
  const houseLike = companions.filter((c) => HOUSE_LIKE_KINDS.has(c.assetKind ?? ""));
  if (houseLike.length !== 1 || houseLike[0].assetKind !== "housing") return undefined;
  const [house] = houseLike;
  const footprint = house.buildingFootprintArea ?? fallbackBuildingFootprintArea;
  if (!house.acquisitionDate || footprint === undefined || !(footprint > 0)) return undefined;
  return house;
}
