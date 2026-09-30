/**
 * 취득세 — ⑧(`lib/calc/acquisition-tax-validate.ts`)과 ⑫(`lib/validators/acquisition-input.ts`)가
 * 같이 쓰는 필수 입력 술어(3중 패턴).
 */

export type TemporaryTwoHouseRegionKey = "previousHouseRegion" | "newHouseRegion";

/**
 * 일시적 2주택(「지방세법 시행령」 §28의5) 처분기한은 종전·신규 주택 지역(조정/비조정) 조합으로 정해진다.
 * 미입력이면 엔진이 둘 다 비조정으로 읽으므로 두 값을 요구한다. 빠진 키를 ⑧ 메시지 순서대로 돌려준다.
 */
export function missingTemporaryTwoHouseRegions(p: {
  isHousing: boolean;
  isTemporaryTwoHouse: boolean;
  previousHouseRegion: string | undefined;
  newHouseRegion: string | undefined;
}): TemporaryTwoHouseRegionKey[] {
  if (!p.isHousing || !p.isTemporaryTwoHouse) return [];
  const missing: TemporaryTwoHouseRegionKey[] = [];
  if (!p.previousHouseRegion) missing.push("previousHouseRegion");
  if (!p.newHouseRegion) missing.push("newHouseRegion");
  return missing;
}

export const TEMPORARY_TWO_HOUSE_REGION_MESSAGE: Record<TemporaryTwoHouseRegionKey, string> = {
  previousHouseRegion: "일시적 2주택 — 종전 주택 소재 지역(조정/비조정)을 선택하세요.",
  newHouseRegion: "일시적 2주택 — 신규 주택 소재 지역(조정/비조정)을 선택하세요.",
};
