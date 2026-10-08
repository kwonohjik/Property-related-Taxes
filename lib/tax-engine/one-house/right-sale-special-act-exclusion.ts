/**
 * §89①4호 입주권 양도 — **조특법이 소유주택으로 보지 않는 주택**을 가·나목 「다른 주택」에서 뺀다 (평가셋 G049·G050·G065).
 *
 * 사전-2018-법령해석재산-0143(§98의2①·§98의5① 미분양주택은 §89①4호 가목의 소유주택에서 제외) · 2016년 이전 양도분은
 * 입주권 비과세가 시행령 §155⑯⑰(「§154①의 1세대1주택으로 본다」) 경로라 조특법의 「소득세법 §89①3호를 적용할 때」 문언이
 * 그대로 닿는다(G049 · G050). 사용자 결정 2026-10-08 「해석례대로 전 기간 제외」.
 *
 * 🔑 빼는 것은 **조특법 제외만**(§99의4·§98의9 + 보유 감면주택 — `runHouseCountExclusionStep`이 이미 판정한 값)이다.
 *    §155②③ 상속주택 제외는 빼지 않는다 — 입주권 양도에 주택 특례를 유추 적용할 수 있는지가 양론이다(E094 — 조심-2021-서-1117).
 * 🔑 뺀 행은 명부(`houses`)에서도 지운다 — 혼인합가 leaf(`right-sale-marriage-merge.ts`)가 같은 행을 배우자 쪽으로 한 번 더
 *    빼지 않게(이중 차감 방지).
 */
import type { TransferTaxInput } from "../types/transfer.types";

type Exclusion = {
  houseCountExclusion: { appliedList: ReadonlyArray<{ houseId?: string }> };
  specialHouseExclusionDetail: { excludedCount: number; entries: ReadonlyArray<{ eligible: boolean; houseId?: string }> };
};

export function oneRightInputAfterSpecialActExclusion(input: TransferTaxInput, exclusion: Exclusion): TransferTaxInput {
  const count = exclusion.houseCountExclusion.appliedList.length + exclusion.specialHouseExclusionDetail.excludedCount;
  if (count === 0) return input;
  const ids = new Set([
    ...exclusion.houseCountExclusion.appliedList.flatMap((a) => (a.houseId ? [a.houseId] : [])),
    ...exclusion.specialHouseExclusionDetail.entries.flatMap((e) => (e.eligible && e.houseId ? [e.houseId] : [])),
  ]);
  return {
    ...input,
    householdHousingCount: Math.max(0, input.householdHousingCount - count),
    ...(input.houses ? { houses: input.houses.filter((h) => !ids.has(h.id)) } : {}),
  };
}
