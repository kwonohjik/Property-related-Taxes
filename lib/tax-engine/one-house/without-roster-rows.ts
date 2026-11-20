/**
 * 명부에서 행을 빼고 세대 주택 수를 다시 도출한 판정 입력 — 그 행에 **연결된** 조특 제외 선언(`specialHouseExclusions`)·
 * 감면 주택 수 제외(`reductions`의 `houseId`)도 함께 걷어낸다(2026-11 리뷰 D-59).
 *
 * 종전(판정 메뉴 단계 6.55 · `judgment-pipeline.ts`)에는 행만 빼고 그 행에 연결된 §99의2·§99의4 선언을 남겨, 빼낸 주택을 주택 수에서
 * 한 번 더 뺐다(⑳ 「요건 충족」인데 「3채 중 0채」 → 과세). 「조세특례제한법」 §99의2② 「…소유주택으로 보지 아니한다」와
 * 「소득세법 시행령」 §155⑳ 어느 쪽으로 빼도 같은 주택은 한 번만 빠진다. 행 id가 없는 선언(양도 자산 자신의 감면 등)은 그대로 둔다.
 * 양론 반대 입장 입력(`contested-issues.ts` — D-87)도 이 함수를 쓰도록 올렸다.
 */
import type { TransferTaxInput } from "../types/transfer.types";
import { deriveHouseholdHousingCount } from "./house-count";

export function withoutRosterRows(input: TransferTaxInput, ids: readonly string[], countSellingHouse: boolean): TransferTaxInput {
  const drop = new Set(ids);
  const linked = (x: unknown) => {
    const id = (x as { houseId?: string } | undefined)?.houseId;
    return id !== undefined && drop.has(id);
  };
  const houses = (input.houses ?? []).filter((h) => !drop.has(h.id));
  return {
    ...input,
    houses,
    householdHousingCount: deriveHouseholdHousingCount(houses, countSellingHouse),
    ...(input.specialHouseExclusions ? { specialHouseExclusions: input.specialHouseExclusions.filter((e) => !linked(e)) } : {}),
    ...(input.reductions ? { reductions: input.reductions.filter((r) => !linked(r)) } : {}),
  };
}
