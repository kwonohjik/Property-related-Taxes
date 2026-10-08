/**
 * §89①4호 입주권 양도 — **조특법이 소유주택으로 보지 않는 주택**을 가·나목 「다른 주택」에서 뺀다 (평가셋 G049·G050·G065).
 *
 * 사전-2018-법령해석재산-0143(§98의2①·§98의5① 미분양주택은 §89①4호 가목의 소유주택에서 제외) · 2016년 이전 양도분은
 * 입주권 비과세가 시행령 §155⑯⑰(「§154①의 1세대1주택으로 본다」) 경로라 조특법의 「소득세법 §89①3호를 적용할 때」 문언이
 * 그대로 닿는다(G049 · G050). 사용자 결정 2026-10-08 「해석례대로 전 기간 제외」.
 *
 * 🔑 빼는 것은 **해석례로 입주권 적용이 확인된 조문만**이다(`RIGHT_SALE_SPECIAL_EXCLUSION_ARTICLES` — 그중
 *    `runHouseCountExclusionStep`이 요건·시한을 충족한다고 판정한 행):
 *      · §98 미분양주택(조특령 §98②·⑥) — G049 회신
 *      · §98의2④ · §98의5② 미분양주택 — 사전-2018-법령해석재산-0143(G065)
 *      · §99② 신축주택 — G050 회신(감면주택 시한 2007.12.31. 양도분까지는 평가기가 본다)
 *    §99의4·§98의9는 효과 문언이 「일반주택을 양도하는 경우」로 한정되고 입주권 적용 해석례가 없어 빼지 않는다. 같은 계열의
 *    나머지 감면주택 조문(§97②·§97의2②·§98의3·§98의6·§98의7·§98의8·§99의2·§99의3)도 해석례 미확보라 빼지 않는다.
 *    §155②③ 상속주택 제외도 빼지 않는다 — 입주권 양도에 주택 특례를 유추 적용할 수 있는지가 양론이다(E094 — 조심-2021-서-1117).
 * 🔑 뺀 행은 명부(`houses`)에서도 지운다 — 혼인합가 leaf(`right-sale-marriage-merge.ts`)가 같은 행을 배우자 쪽으로 한 번 더
 *    빼지 않게(이중 차감 방지).
 */
import type { TransferTaxInput } from "../types/transfer.types";
import type { SpecialHouseExclusionArticle } from "../transfer-reductions/unsold-hybrid-p5";

/** 입주권 양도의 「다른 주택」에서 뺄 수 있는 조특법 조문 — 해석례로 입주권 적용이 확인된 것만(⑤④⑧·route 공용). */
export const RIGHT_SALE_SPECIAL_EXCLUSION_ARTICLES = [
  "unsold_98",
  "unsold_98_2",
  "unsold_98_5",
  "new_99",
] as const satisfies readonly SpecialHouseExclusionArticle[];

export function rightSaleSpecialExclusionApplies(article: string | undefined): boolean {
  return (RIGHT_SALE_SPECIAL_EXCLUSION_ARTICLES as readonly string[]).includes(article ?? "");
}

type Exclusion = {
  specialHouseExclusionDetail: {
    entries: ReadonlyArray<{ eligible: boolean; article: string; houseId?: string }>;
  };
};

export function oneRightInputAfterSpecialActExclusion(input: TransferTaxInput, exclusion: Exclusion): TransferTaxInput {
  const applied = exclusion.specialHouseExclusionDetail.entries.filter(
    (e) => e.eligible && rightSaleSpecialExclusionApplies(e.article),
  );
  const count = applied.length;
  if (count === 0) return input;
  const ids = new Set(applied.flatMap((e) => (e.houseId ? [e.houseId] : [])));
  return {
    ...input,
    householdHousingCount: Math.max(0, input.householdHousingCount - count),
    ...(input.houses ? { houses: input.houses.filter((h) => !ids.has(h.id)) } : {}),
  };
}
