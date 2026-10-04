/**
 * ⑦ 조특법 주택 수 제외 결과 카드 — 「어느 주택」 표시(`transfer-calc-count-exclusion-row-link.plan.md` Q-6).
 *
 * 엔진 결과(`new994Detail`·`unsold989Detail`·감면주택 `entries`)는 명부 행에서 온 선언이면 **행 id**를
 * 그대로 싣는다(`evaluateNew994Declarations` 등). 결과 화면이 가진 명부로 그 id를 「보유 주택 N」으로
 * 바꾼다 — 행 id는 내부 값이라 그대로 노출하지 않는다. 명부를 모르는 화면(일괄 하위 카드)이나
 * 행 id가 없는 옛 결과는 표시를 생략한다.
 */
export type HouseRefRow = { id: string; acquisitionDate?: string };

/** 결과 detail에 실려 온 행 id — 결과 타입(union)에는 선언돼 있지 않다(런타임 필드). */
export function detailHouseId(detail: object | undefined): string | undefined {
  if (!detail || !("houseId" in detail)) return undefined;
  const v = (detail as { houseId?: unknown }).houseId;
  return typeof v === "string" && v ? v : undefined;
}

/** 「보유 주택 N (YYYY-MM-DD 취득)」 — 판정 메뉴 결과뷰의 표기와 같다. */
export function countExclusionHouseRef(
  houses: readonly HouseRefRow[] | undefined,
  houseId: string | undefined,
): string | undefined {
  if (!houses || !houseId) return undefined;
  const i = houses.findIndex((h) => h.id === houseId);
  if (i < 0) return undefined;
  const date = houses[i].acquisitionDate;
  return `보유 주택 ${i + 1}${date ? ` (${date} 취득)` : ""}`;
}
