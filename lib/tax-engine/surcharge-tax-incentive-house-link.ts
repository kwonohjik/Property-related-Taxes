/**
 * 명부 행 ⑥ 「주택 수 제외(조특법 감면주택)」 선언 → 다주택 중과 「일반주택」 판정의 영 §167의3①**5호** 주택 (결정 #16 공백).
 *
 * ⑥ 선언(`specialHouseExclusions`)은 비과세(「소득세법」 §89①3호) 주택 수에서만 빼고, 중과 10호(영 §167의10①10호 ·
 * 3주택 이상은 §167의3①10호 — 「제1호부터 제8호까지 … 해당하는 주택을 제외하고 1개의 주택만」)는 행의 5호 표시
 * (`HouseInfo.isUnsoldHousing`)만 봤다. 판정 메뉴는 그 표시를 숨기고 ⑥이 유일한 입력이라, 같은 감면주택을 두고
 * 계산기(표시 켬)는 10호 배제, 판정 메뉴 → 계산기 넘김은 2주택 중과로 갈렸다.
 *
 * ## 법문 (영 §167의3① · 실독)
 *
 * - 5호 「「조세특례제한법」 제77조, 제98조의2, 제98조의3, 제98조의5부터 제98조의8까지, 제99조, 제99조의2 및
 *   제99조의3에 따라 양도소득세가 감면되는 주택」 — 현행 MST 290841 · 2021.7.1. 시행본 MST 231965 같은 문언.
 *   2018.4.1. 시행본(제28637호 · MST 202148)에서 §98의2~§99의2가 들어왔고(그 전은 §99·§99의3 「신축주택」뿐 —
 *   MST 202082), 그날은 법 §104⑦ 시행일과 같다. 그 전 양도분은 중과 자체가 없어(`transfer-tax-rate-calc.ts`) 연혁
 *   게이트를 따로 두지 않는다. §77(공익사업용 토지 등)은 ⑥ 선언 조문이 아니다.
 * - 3호 「「조세특례제한법」 제97조ㆍ제97조의2 및 제98조에 따라 양도소득세가 감면되는 임대주택으로서 **5년 이상
 *   임대한** 국민주택」 — ⑥ 선언은 「임대를 개시한 때부터」 소유주택 의제를 판정할 뿐(재산46014-259) 5년 임대·
 *   국민주택 사실을 받지 않는다 ⇒ **잇지 않는다**(모름 = 혜택 불성립). 결론을 가를 때만 확인 필요를 알린다.
 *
 * ## 「확인된」 선언만
 *
 * 그 주택이 해당 조문 **제1항 감면 요건**을 갖췄을 때만 잇는다(`meetsSpecialHouseReductionRequirements` — 취득기간·
 * 본 요건 확인). §99②·§99의3②의 「다른 주택을 2007.12.31.까지 양도하는 경우에만」은 §89①3호 의제에만 붙은 시한이라
 * 5호 판정에는 쓰지 않는다(조특법 §99 MST 284389 실독).
 *
 * 행 id가 없는 선언은 어느 주택인지 모르므로 잇지 않는다(계산기 ⑧이 막는 옛 선언과 같은 독법 —
 * `house-count-exclusion-rows.ts` Q-1). 같은 행에 5호 표시와 ⑥이 함께 있어도 boolean 하나라 한 번이다.
 *
 * 단건(`runMultiHouseSurchargeStep` — 다건·컴패니언·판정 메뉴 경유 포함)과 겸용(`calcMixedUseTransferTax`)이 이 함수를 부른다.
 */
import { MULTI_HOUSE } from "./legal-codes";
import {
  meetsSpecialHouseReductionRequirements,
  resolveSpecialHouseExclusions,
  type SpecialHouseExclusionArticle,
  type SpecialHouseExclusionInput,
} from "./transfer-reductions/unsold-hybrid-p5";
import type { HouseInfo, MultiHouseSurchargeResult } from "./types/multi-house-surcharge.types";

/** ⑥ 선언 조문 → 영 §167의3① 호. 키 누락은 컴파일러가 잡는다(`satisfies`). */
const ARTICLE_167_3_CLAUSE = {
  unsold_98: "3",
  rental_97: "3",
  rental_97_2: "3",
  unsold_98_2: "5",
  unsold_98_3: "5",
  unsold_98_5: "5",
  unsold_98_6: "5",
  unsold_98_7: "5",
  unsold_98_8: "5",
  unsold_99_2: "5",
  new_99: "5",
  new_99_3: "5",
} as const satisfies Record<SpecialHouseExclusionArticle, "3" | "5">;

const clauseOf = (article: string): "3" | "5" | undefined =>
  (ARTICLE_167_3_CLAUSE as Record<string, "3" | "5" | undefined>)[article];

/** 5호로 잇는 행 id — 행 id가 있고 감면 요건을 갖춘 선언만. 양도 주택 행은 ⑥의 대상이 아니다. */
function linked5hoIds(
  declarations: SpecialHouseExclusionInput[] | undefined,
  transferDate: Date,
  sellingHouseId: string,
): Set<string> {
  const ids = new Set<string>();
  for (const d of declarations ?? []) {
    if (!d.houseId || d.houseId === sellingHouseId || clauseOf(d.article) !== "5") continue;
    if (meetsSpecialHouseReductionRequirements(d, transferDate)) ids.add(d.houseId);
  }
  return ids;
}

/** 명부에 ⑥의 확인된 5호 조문을 5호 표시로 싣는다. 바뀐 행이 없으면 **같은 배열**을 돌려준다. */
export function linkTaxIncentiveHouse5ho(
  houses: HouseInfo[],
  declarations: SpecialHouseExclusionInput[] | undefined,
  transferDate: Date,
  sellingHouseId: string,
): HouseInfo[] {
  const ids = linked5hoIds(declarations, transferDate, sellingHouseId);
  if (ids.size === 0 || !houses.some((h) => ids.has(h.id) && !h.isUnsoldHousing)) return houses;
  return houses.map((h) => (ids.has(h.id) && !h.isUnsoldHousing ? { ...h, isUnsoldHousing: true } : h));
}

export const TAX_INCENTIVE_RENTAL_3HO_UNCONFIRMED_NOTICE =
  `주택 수 제외로 선언한 조세특례제한법 §97·§97의2·§98 감면 임대주택이 ${MULTI_HOUSE.TAX_INCENTIVE_RENTAL_3_BASIS}` +
  "(5년 이상 임대한 국민주택 — 의무임대기간 전이면 같은 조 ④)에 해당하는지는 그 선언으로 판정하지 않았습니다. " +
  `해당하면 ${MULTI_HOUSE.TWO_HOUSE_ONLY_GENERAL}(3주택 이상은 ${MULTI_HOUSE.THREE_HOUSE_EXCLUSION_SOLE})로 중과가 배제될 수 있어 확인이 필요합니다 — ` +
  "계산기 명부 행의 「조특법 감면 임대주택(3호)」에 임대 사실을 입력하면 판정합니다.";

/**
 * 3호 조문 ⑥ 선언(§89①3호 의제가 선 것)이 있는 행 중 3호·5호 표시가 없는 행을 3호 주택으로 본다면 중과가 꺼지는가 —
 * 그때만 확인 필요를 싣는다. 반사실은 그 행을 「일반주택」 판정에서 빼는 효과만 같으면 되므로 5호 표시로 세운다
 * (`isGroupExcludable`에서 둘 다 무조건 배제다).
 */
export function withTaxIncentiveRental3hoNotice(
  result: MultiHouseSurchargeResult,
  houses: HouseInfo[],
  declarations: SpecialHouseExclusionInput[] | undefined,
  transferDate: Date,
  sellingHouseId: string,
  judge: (houses: HouseInfo[]) => MultiHouseSurchargeResult,
): MultiHouseSurchargeResult {
  if (!result.surchargeApplicable) return result;
  const ids = new Set(
    resolveSpecialHouseExclusions(
      (declarations ?? []).filter((d) => d.houseId && d.houseId !== sellingHouseId && clauseOf(d.article) === "3"),
      transferDate,
    )
      .entries.filter((e) => e.eligible && e.houseId)
      .map((e) => e.houseId!),
  );
  const targets = houses.filter((h) => ids.has(h.id) && !h.isUnsoldHousing && !h.isTaxIncentiveRental);
  if (targets.length === 0) return result;
  const alt = judge(houses.map((h) => (targets.includes(h) ? { ...h, isUnsoldHousing: true } : h)));
  if (alt.surchargeApplicable) return result;
  return { ...result, warnings: [...result.warnings, TAX_INCENTIVE_RENTAL_3HO_UNCONFIRMED_NOTICE] };
}
