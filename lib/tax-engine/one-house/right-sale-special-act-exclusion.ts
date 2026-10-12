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
 *    §71의2① 인구감소지역주택은 선언이 아니라 명부에서 도출해 함께 뺀다 — 법률이 4호를 직접 적는다(결정 #42 · 아래 `RIGHT_SALE_DERIVED_ARTICLES`).
 * 🔑 뺀 행은 명부(`houses`)에서도 지운다 — 혼인합가 leaf(`right-sale-marriage-merge.ts`)가 같은 행을 배우자 쪽으로 한 번 더
 *    빼지 않게(이중 차감 방지).
 *
 * ## 판정 메뉴와 계산기가 같은 함수를 부른다 (결정 #2 · 2026-10-11)
 *
 * 종전에는 이 제외가 판정 메뉴 route 전처리에만 있어, 같은 사실을 넘겨받은 계산기는 그 주택을 「다른 주택」으로 세어
 * 경고 없이 과세했다(G049-current 245,751,000 · G065-era 138,160,000). 이제 판정 route(`judgment-pipeline.ts`)와 계산기
 * §166 분기(`transfer-tax-redevelopment-steps.ts`)가 `oneRightInputAfterSpecialActExclusionOf` 하나를 부른다.
 * 해석례 원문 확인(2026-10-11, 국세청 taxlaw): 사전-2018-법령해석재산-0143(§98의2·§98의5) · 서면-2021-부동산-6375
 * (2022.4.6. — §98의3) · 사전-2019-법령해석재산-0238(2019.5.31.)·서면-2020-법규재산-3142(2022.3.23.) — §99의2.
 * 모두 「소유주택에서 제외하여 판단」으로 제외 쪽이다. 다만 §98의3·§99의2는 **이번 결정의 4개 조문에 없어** 넣지 않았다
 * (별도 결정 대기 — 아래 목록).
 *
 * ⚠️ 이 제외는 **입주권 비과세 요건(가·나목의 「다른 주택」)에만** 쓴다. 호출부가 돌려받은 복사본은 그 판정에만 넘기고,
 *    표2(장기보유특별공제)·12억 안분 같은 세대 주택 수 축(`isOneHouseSingle`)은 원본 `householdHousingCount`를 그대로 본다 —
 *    12억 초과 입주권의 공제율 표 결정(G3-7)이 나기 전에 세액이 늘지 않게 한다.
 */
import type { TransferTaxInput } from "../types/transfer.types";
import {
  resolveSpecialHouseExclusions,
  type SpecialHouseExclusionArticle,
  type SpecialHouseExclusionResolution,
} from "../transfer-reductions/unsold-hybrid-p5";
import {
  POP_DECLINE_71_2_ARTICLE,
  popDeclineUnconfirmedNotice,
  resolvePopulationDecline71_2FromInput,
} from "../transfer-reductions/population-decline-71-2";
import { pickOneRightExemptionFacts, resolveOneRightExemptionClause } from "../transfer-tax-redevelopment-transforms";

/** 입주권 양도의 「다른 주택」에서 뺄 수 있는 조특법 조문 — 해석례로 입주권 적용이 확인된 것만(⑤④⑧·route 공용). */
export const RIGHT_SALE_SPECIAL_EXCLUSION_ARTICLES = [
  "unsold_98",
  "unsold_98_2",
  "unsold_98_5",
  "new_99",
] as const satisfies readonly SpecialHouseExclusionArticle[];

/**
 * 조특법 §71의2① 인구감소지역주택(결정 #42) — **법률이 4호를 직접 적는다**(「…「소득세법」 제89조제1항제3호 또는 제4호를 적용한다」)라
 * 해석례 없이도 입주권 양도의 「다른 주택」에서 뺀다. 위 해석례 확인 조문 목록(2026-10-08 결정)과 취지가 다르지 않다 — 명문이 있다.
 * 선언이 아니라 명부에서 도출하는 의제라 `SpecialHouseExclusionArticle`이 아닌 별도 상수다.
 */
const RIGHT_SALE_DERIVED_ARTICLES: readonly string[] = ["pop_decline_71_2"];

export function rightSaleSpecialExclusionApplies(article: string | undefined): boolean {
  return (
    (RIGHT_SALE_SPECIAL_EXCLUSION_ARTICLES as readonly string[]).includes(article ?? "") ||
    RIGHT_SALE_DERIVED_ARTICLES.includes(article ?? "")
  );
}

type Exclusion = {
  specialHouseExclusionDetail: {
    entries: ReadonlyArray<{ eligible: boolean; article: string; houseId?: string }>;
  };
};

export function oneRightInputAfterSpecialActExclusion(input: TransferTaxInput, exclusion: Exclusion): TransferTaxInput {
  // 명부 행에 연결된 선언만 뺀다 — 어느 주택인지 모르는 선언은 명부 밖 주택을 빼 주는 과소과세가 된다(결정 #2 조건).
  const rowIds = new Set((input.houses ?? []).map((h) => h.id));
  const applied = exclusion.specialHouseExclusionDetail.entries.filter(
    (e) => e.eligible && rightSaleSpecialExclusionApplies(e.article) && !!e.houseId && rowIds.has(e.houseId),
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

/**
 * 입주권 양도에서 「다른 주택」에서 뺄 주택 판정 — `RIGHT_SALE_SPECIAL_EXCLUSION_ARTICLES` 4개 조문의 선언과
 * 명부에서 도출하는 §71의2①(결정 #42) 항목을 함께 싣는다.
 * 그 밖의 조문 선언(§98의3 등)은 요건을 갖춰도 entries에 싣지 않는다(결과 카드·명세가 쓰지 않는 제외를 보이지 않게).
 *
 * §71의2는 주택 양도 STEP 0.9와 **같은 평가기**(`resolvePopulationDecline71_2FromInput`)로 본다. 다른 점은 「이미 빠진 것」뿐이다 —
 * 입주권 양도는 위 4개 조문 선언만 「다른 주택」에서 빼므로 그것만 이중 차감·겹침 판정 재료로 넘긴다.
 */
export function resolveRightSaleSpecialExclusion(input: TransferTaxInput): SpecialHouseExclusionResolution {
  const declared = resolveSpecialHouseExclusions(input.specialHouseExclusions, input.transferDate).entries.filter((e) =>
    rightSaleSpecialExclusionApplies(e.article),
  );
  const declaredEligible = declared.filter((e) => e.eligible);
  const popDecline = resolvePopulationDecline71_2FromInput(input, {
    ids: new Set(declaredEligible.flatMap((e) => (e.houseId ? [e.houseId] : []))),
    count: declaredEligible.length,
  });
  return {
    entries: [...declared, ...popDecline.entries],
    excludedCount: declaredEligible.length + popDecline.excludedCount,
  };
}

/** 입력 자체에서 제외를 평가해 입주권 가·나목 판정용 복사본을 만든다 — 판정 route와 계산기 §166 분기가 함께 쓴다. */
export function oneRightInputAfterSpecialActExclusionOf(input: TransferTaxInput): TransferTaxInput {
  return oneRightInputAfterSpecialActExclusion(input, { specialHouseExclusionDetail: resolveRightSaleSpecialExclusion(input) });
}

/**
 * §71의2① 후보가 모름·미답·해석 미확보로 불성립해 「다른 주택」에 남았고, **그 후보 한 채를 뺐다면 가·나목이 성립할 때만**
 * 확인 필요 문장을 돌려준다(결정 #42 「모르면 불성립 + 확인 필요 — 결론을 가를 때만」). 주택 양도의 `popDeclineDecides`
 * (`era-notice-relevance.ts` — 후보 한 채를 뺀 본체 판정)와 같은 모양이다. 판정 메뉴(`judgment-pipeline.ts`)와 계산기
 * (`transfer-tax-redevelopment-apt-exemption.ts` 경고)가 이 함수 하나를 부른다.
 */
export function rightSalePopDeclineUnconfirmedNotice(input: TransferTaxInput): string | undefined {
  const resolution = resolveRightSaleSpecialExclusion(input);
  const unconfirmed = resolution.entries.filter(
    (e) => e.article === POP_DECLINE_71_2_ARTICLE && !e.eligible && e.unconfirmed === true,
  );
  if (unconfirmed.length === 0) return undefined;
  const clauseOf = (i: TransferTaxInput) => {
    const facts = pickOneRightExemptionFacts(i);
    return facts ? resolveOneRightExemptionClause(facts, i) : undefined;
  };
  const current = oneRightInputAfterSpecialActExclusion(input, { specialHouseExclusionDetail: resolution });
  if (clauseOf(current)) return undefined; // 이미 성립 — 결론을 가르지 않는다
  const counterfactual = oneRightInputAfterSpecialActExclusion(current, {
    specialHouseExclusionDetail: { entries: [{ ...unconfirmed[0], eligible: true }] },
  });
  if (!clauseOf(counterfactual)) return undefined;
  return popDeclineUnconfirmedNotice(unconfirmed.map((e) => e.reason ?? ""));
}
