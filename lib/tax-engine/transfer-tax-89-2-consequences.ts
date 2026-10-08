/**
 * 「소득세법」 §89② 판정 결과(`resolveArticle89Clause2`)의 **후속 효과** — 단건 주택 경로와 겸용 경로 공용 leaf (E-7).
 *
 * 판정 자체는 `transfer-tax-89-2-exclusion.ts` 하나가 한다. 여기 있는 것은 그 결과를 읽어
 *   ① 결과 경고(판정 보류 고지 · §156의2⑬ 사후관리 고지)
 *   ② 영 §167의10①15호 등 중과 배제 ① 요소(§156의2·§156의3 의제)
 * 로 옮기는 규칙이다. 종전에는 ①이 `transfer-tax.ts`, ②가 `transfer-tax-judgment-steps.ts`에만 있어
 * 겸용 단건 엔진은 §89②를 아예 보지 않았다(E-7). 두 경로가 같은 함수를 부르도록 여기로 옮겼다 — 문구·규칙 불변.
 */
import type { Article89Clause2Input, Article89Clause2Result } from "./transfer-tax-89-2-exclusion";
import type { TransferTaxInput } from "./types/transfer.types";
import type { DeemedOneHouseBasis } from "./types/multi-house-surcharge.types";
import { TRANSFER } from "./legal-codes";
import { resolve1562DeadlineYears } from "./data/article-156-2-completion-era";

/**
 * §89② 결과 경고 — 호출 순서대로 push한다(단건 `transfer-tax.ts` STEP 1 직후의 종전 순서).
 *
 * @param settled 1세대1주택 비과세(전액·부분)가 실제로 적용됐는가 — 사후관리(추징) 리스크는 그때만 있다.
 */
export function article89Clause2Notices(
  clause2: Article89Clause2Result | undefined,
  settled: boolean,
  transferDate: Date,
): string[] {
  const notices: string[] = [];
  /**
   * §156의2⑬ · §156의3⑩ **사후관리(추징)** — 자기선언으로 인정한 예외는 요건이 깨지면
   * 「사유가 발생한 날이 속하는 달의 말일부터 **2개월 이내**에 … 신고·납부」 대상이다.
   * ⑤는 선언만으로 `exception_met`이 되고 요건 판정은 E-5가 하므로 `settled`를 함께 본다.
   */
  const exception = clause2?.exception;
  if (
    clause2?.status === "exception_met" &&
    settled &&
    (exception === TRANSFER.RIGHT_3YR_EXCEPTION_156_2_4 ||
      exception === TRANSFER.PRESALE_3YR_EXCEPTION_156_3_3 ||
      exception === TRANSFER.REPLACEMENT_HOUSE_156_2_5)
  ) {
    /**
     * §156의2⑬은 「**제7항·제10항 또는 제11항의 규정에 따라** 제4항 또는 제5항을 적용받은
     * 1세대를 **포함한다**」라 준용 경로도 추징 대상이다 ⇒ 준용 근거를 함께 알린다.
     */
    const via = clause2.viaArticle;
    // 「완성 후 N년」은 양도일 연혁(OH-30 — 대통령령 제33267호 부칙 제8조, ④·⑤ 공통).
    notices.push(
      `1세대1주택 비과세를 「${exception}${via ? ` (${via} 준용)` : ""}」의 자기선언 요건(신축주택 완성 후 ${resolve1562DeadlineYears(transferDate)}년 이내 ` +
        "세대전원 이사 + 1년 이상 계속 거주)으로 인정했습니다. 그 요건을 갖추지 못하게 되면 " +
        "「소득세법 시행령」 §156의2⑬(분양권은 §156의3⑩)에 따라 사유 발생일이 속하는 달의 " +
        "말일부터 2개월 이내에 이 특례를 적용받지 않았을 경우의 세액을 신고·납부해야 합니다(추징).",
    );
  }

  /**
   * 판정 보류 — 단서의 예외(시행령 §156의2③~⑪ · §156의3②~⑧) 중 **판정에 필요한 사실을 입력받을 경로가 없는 항**이
   * 남아 있다. 배제를 켜면 그 예외에 해당하는 세대가 법 근거 없이 불리해지므로 종전 동작을 유지하고 어느 항을 직접
   * 확인해야 하는지 알린다(자동 판정 대신 **판정 불가 고지**).
   */
  // 3년 경과 예외 미선언 → 배제(모름=불리). 해당하면 판정 메뉴에서 선언하도록 알린다(확인 필요).
  if (clause2?.status === "excluded" && clause2.undeclaredArticles?.length) {
    notices.push(
      `조합원입주권·분양권 취득일부터 3년이 지나 주택을 양도했고, 그 예외(${clause2.undeclaredArticles.join(" · ")}) ` +
        "해당 여부를 선언하지 않아 「소득세법」 §89② 배제를 적용했습니다(확인 필요). 해당하면 1세대1주택 판정 메뉴의 " +
        "「3년 경과 예외」에서 선언하세요.",
    );
  }

  if (clause2?.status === "undetermined") {
    notices.push(
      "세대가 주택과 조합원입주권·분양권을 함께 보유한 상태에서 그 주택을 양도했습니다. " +
        "「소득세법」 §89②은 이 경우 1세대1주택 비과세(§89①3호)를 적용하지 않되, 시행령이 정하는 " +
        "예외에 해당하면 그대로 적용합니다. 아래 조문의 요건 충족 여부를 직접 확인하세요 — " +
        "이 계산에는 §89② 배제를 적용하지 않았습니다: " +
        (clause2.openArticles ?? []).join(" · "),
    );
  }
  return notices;
}

/**
 * 중과 배제 ① 요소(「제154조제1항이 적용되는 주택」)를 §89②가 막는가.
 *
 * 「소득세법」 §89② — 주택과 조합원입주권·분양권을 함께 보유하면 §89①3호(§154①)를 적용하지 않는다(단서 예외는
 * 영 §156의2·§156의3). 그러면 §155 의제가 서도 「제154조제1항이 적용되는 주택」이 아니다. 판정 보류(`undetermined`)는
 * 비과세가 종전 동작(적용)을 유지하고 경고하지만, 중과 배제까지 그 가정에 기대지 않는다(확인 필요 — 종전 동작).
 */
export function clause2BlocksSurchargeDeeming(clause2: Article89Clause2Result): boolean {
  return clause2.status === "excluded" || clause2.status === "undetermined";
}

/**
 * §156의2·§156의3 예외 충족 → 중과 배제 ① 요소 의제(`house_with_*_right`, E-14c).
 * 어느 호가 받는지(§167의11①13호 · §167의4③7호 · 구 §167의11①1호)는 중과 엔진이 주택·권리 수로 정한다.
 *
 * §156의2⑤(대체주택)는 선언만으로 `exception_met`이고 요건은 E-5가 판정한다 — 여기서는 받지 않는다(확인 필요).
 * `citedByOldClause1` — 구 §167의11①1호(「제156조의2제3항부터 제5항까지 또는 제156조의3제2항ㆍ제3항에 따라」)의
 * 인용 범위: ③④·②③ **직접** 경로(준용 없음)만(E-14f).
 */
export function clause2SurchargeDeemed(
  clause2: Article89Clause2Result,
): { basis: DeemedOneHouseBasis; source: string; citedByOldClause1: boolean } | undefined {
  if (clause2.status !== "exception_met" || !clause2.exception) return undefined;
  if (clause2.exception === TRANSFER.REPLACEMENT_HOUSE_156_2_5) return undefined;
  return {
    basis: clause2.exception.includes("§156의3") ? "house_with_presale_right" : "house_with_redevelopment_right",
    source: clause2.viaArticle ? `${clause2.exception}(${clause2.viaArticle} 준용)` : clause2.exception,
    citedByOldClause1: clause2.byTimingClause === true && clause2.viaArticle === undefined,
  };
}

/**
 * §89② 판정에 쓰는 **세대 사실** — 양도 자산 자체의 값(자산 종류·취득일·양도일·주택 수·§154① 요건 입력)을 뺀 나머지.
 *
 * 겸용 엔진 입력(`MixedUseAssetInput.article89Clause2Facts`)이 이 모양으로 받는다. 키를 **필수**로 둔 매핑 타입이라
 * 호출부(route 단건 겸용 · 겸용 파트 카드)가 하나라도 빠뜨리면 컴파일이 실패한다(값은 undefined 가능).
 */
export const ARTICLE_89_2_FACT_KEYS = [
  "presaleRights",
  "marriageMerge",
  "parentalCareMerge",
  "ruralHouse",
  "replacementHouse",
  "rightThreeYearException",
  "generalHouseHeldAtInheritance",
  "inheritedRightChoiceWhenBothHeld",
  "generalHouseGiftedFromDecedentWithin2yr",
  "generalHouseGiftDate",
  "generalHouseRightAtInheritance",
  "mergedHouseholdFirstHouse",
  "isFirstTransferredInMerge",
  "culturalHeritageHouse",
  "houses",
  "sellingHouseId",
] as const satisfies readonly (keyof Article89Clause2Input)[];

export type Article89Clause2FactKey = (typeof ARTICLE_89_2_FACT_KEYS)[number];
export type Article89Clause2HouseholdFacts = { [K in Article89Clause2FactKey]: TransferTaxInput[K] };

/**
 * 세대 사실만 골라낸다 — 단건 엔진 입력(`engineInput`)·파트 카드 item(`TransferTaxItemInput`) 어느 쪽에서든.
 * ⚠️ 날짜를 가진 값(`presaleRights[].acquisitionDate` 등)은 **Date 변환본**을 넘길 것(route `engineInput`).
 */
export function pickArticle89Clause2Facts(
  src: Pick<TransferTaxInput, Article89Clause2FactKey>,
): Article89Clause2HouseholdFacts {
  const out = {} as Record<Article89Clause2FactKey, unknown>;
  for (const k of ARTICLE_89_2_FACT_KEYS) out[k] = src[k];
  return out as Article89Clause2HouseholdFacts;
}
