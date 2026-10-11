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
import { resolve1562Clause3Years, resolve1562DeadlineYears } from "./data/article-156-2-completion-era";
import { isOldSurchargeClauseEra } from "./data/surcharge-old-clauses-era";

/**
 * §156의2⑬ · §156의3⑩ **사후관리(추징) 신고·납부** — 고지(계산기·판정 메뉴)와 입력 카드가 같은 문구를 읽는 단일 소스(S15-8 · G5-7).
 *
 * 「소득세법 시행령」 §156의2⑬: 「그 사유가 발생한 날이 속하는 달의 말일부터 2개월 이내에 주택 양도당시 제4항 또는 제5항을
 * 적용받지 아니할 경우에 납부하였을 세액을 양도소득세로 신고ㆍ납부하여야 한다」(<개정 2013.2.15>). 분양권은 §156의3⑩.
 * 종전 입력 카드는 2013.2.15. 전 문언(「사유가 발생한 과세연도」)을 적고 사유도 「신축주택 양도」로 적어 틀렸다.
 */
export const POST_MANAGEMENT_CITATION = "「소득세법 시행령」 §156의2⑬(분양권은 §156의3⑩)";
export const POST_MANAGEMENT_FILING =
  "사유 발생일이 속하는 달의 말일부터 2개월 이내에 이 특례를 적용받지 않았을 경우의 세액을 신고·납부해야 합니다(추징)";

/**
 * 판정 메뉴·계산기가 **결론을 가르는지** 읽는 게이트 — 미선언·확인 필요 고지를 「그 사실이 결론을 가를 때만」 내려고 둔다(G5-8).
 *
 * @property coreWouldPass §89②를 무시했을 때 본체(§154①·§155 등) 판정이 비과세·부분과세였는가. 아니면 3년 경과 예외를
 *   선언해도 비과세가 바뀌지 않는다.
 * @property surchargeDeclarationMatters 선언이 **중과 배제**를 바꿀 수 있는가 — 구 §167의11①1호(「제156조의2제3항부터
 *   제5항까지 … 따라」, 2023.2.27. 이전 양도, E-14f)는 본체와 무관하게 의제를 받았고, 현행 13호는 §154① 요건을 요구한다.
 *   그래서 2023.2.28. 이후 양도이거나 중과 대상이 아니면 거짓이다. `surchargeDeclarationMatters()`가 정한다.
 */
export type Article89Clause2NoticeGate = { coreWouldPass: boolean; surchargeDeclarationMatters: boolean };

/** 구 §167의11①1호 시대 양도 + 중과 대상이면 3년 경과 예외 선언이 세액(중과 배제)을 바꿀 수 있다. */
export function surchargeDeclarationMatters(transferDate: Date, surchargeApplicable: boolean | undefined): boolean {
  return isOldSurchargeClauseEra(transferDate) && surchargeApplicable === true;
}

/**
 * §156의2⑬ · §156의3⑩ **사후관리(추징)** 고지 한 건 — 계산기 경고와 판정 메뉴 결과(`postManagementNotices`)가 같은 leaf를 읽는다(G5-7).
 *
 * 자기선언으로 인정한 예외는 요건이 깨지면 「사유가 발생한 날이 속하는 달의 말일부터 **2개월 이내**에 … 신고·납부」 대상이다.
 * ⑤는 선언만으로 `exception_met`이 되고 요건 판정은 E-5가 하므로 `settled`(비과세가 실제로 났는가)를 함께 본다.
 */
export function article89Clause2PostManagementNotice(
  clause2: Article89Clause2Result | undefined,
  settled: boolean,
  transferDate: Date,
): string | undefined {
  const exception = clause2?.exception;
  if (
    clause2?.status !== "exception_met" ||
    !settled ||
    !(
      exception === TRANSFER.RIGHT_3YR_EXCEPTION_156_2_4 ||
      exception === TRANSFER.PRESALE_3YR_EXCEPTION_156_3_3 ||
      exception === TRANSFER.REPLACEMENT_HOUSE_156_2_5
    )
  ) {
    return undefined;
  }
  /**
   * §156의2⑬은 「**제7항·제10항 또는 제11항의 규정에 따라** 제4항 또는 제5항을 적용받은
   * 1세대를 **포함한다**」라 준용 경로도 추징 대상이다 ⇒ 준용 근거를 함께 알린다.
   */
  const via = clause2.viaArticle;
  // 「완성 후 N년」은 양도일 연혁(OH-30 — 대통령령 제33267호 부칙 제8조, ④·⑤ 공통).
  return (
    `1세대1주택 비과세를 「${exception}${via ? ` (${via} 준용)` : ""}」의 자기선언 요건(신축주택 완성 후 ${resolve1562DeadlineYears(transferDate)}년 이내 ` +
    "세대전원 이사 + 1년 이상 계속 거주)으로 인정했습니다. 그 요건을 갖추지 못하게 되면 " +
    `${POST_MANAGEMENT_CITATION}에 따라 ${POST_MANAGEMENT_FILING}.`
  );
}

/**
 * §89② 결과 경고 — 호출 순서대로 push한다(단건 `transfer-tax.ts` STEP 1 직후의 종전 순서).
 *
 * @param settled 1세대1주택 비과세(전액·부분)가 실제로 적용됐는가 — 사후관리(추징) 리스크는 그때만 있다.
 * @param gate 미선언·확인 필요 고지(결론을 가를 때만)의 게이트 — 판정 보류(`undetermined`)·사후관리 고지는 게이트와 무관하다.
 */
export function article89Clause2Notices(
  clause2: Article89Clause2Result | undefined,
  settled: boolean,
  transferDate: Date,
  gate: Article89Clause2NoticeGate,
): string[] {
  const notices: string[] = [];
  const postManagement = article89Clause2PostManagementNotice(clause2, settled, transferDate);
  if (postManagement) notices.push(postManagement);

  /**
   * 판정 보류 — 단서의 예외(시행령 §156의2③~⑪ · §156의3②~⑧) 중 **판정에 필요한 사실을 입력받을 경로가 없는 항**이
   * 남아 있다. 배제를 켜면 그 예외에 해당하는 세대가 법 근거 없이 불리해지므로 종전 동작을 유지하고 어느 항을 직접
   * 확인해야 하는지 알린다(자동 판정 대신 **판정 불가 고지**).
   */
  // 3년 경과 예외 미선언 → 배제(모름=불리). 해당하면 판정 메뉴에서 선언하도록 알린다(확인 필요).
  // 선언이 결론(비과세·중과 배제)을 가를 때만 낸다(G5-8) — 어차피 과세인 사안에 「선언하면 달라질 수 있다」를 붙이지 않는다.
  const declarationDecides = gate.coreWouldPass || gate.surchargeDeclarationMatters;
  if (declarationDecides && clause2?.status === "excluded" && clause2.undeclaredArticles?.length) {
    notices.push(
      // 「권리 취득일부터 N년이 지나」의 N은 양도일 연혁(1·2·3년) — 판정이 쓰는 leaf와 같은 값이다(X2-4).
      `조합원입주권·분양권 취득일부터 ${resolve1562Clause3Years(transferDate)}년이 지나 주택을 양도했고, 그 예외(${clause2.undeclaredArticles.join(" · ")}) ` +
        "해당 여부를 선언하지 않아 「소득세법」 §89② 배제를 적용했습니다(확인 필요). 해당하면 1세대1주택 판정 메뉴의 " +
        "「3년 경과 예외」에서 선언하세요.",
    );
  }

  // 합가(혼인) 전 보유 구성 미선택 → 불성립(모름=불리, 결정 #7). 결론을 가를 때만 낸다(위와 같은 게이트). 문구는 중립.
  if (declarationDecides && clause2?.status === "excluded" && clause2.undeclaredMergeArticles?.length) {
    notices.push(
      `합가(혼인) 전 보유 구성을 선택하지 않아 그 예외(${clause2.undeclaredMergeArticles.join(" · ")})를 적용하지 않고 「소득세법」 §89② 배제를 ` +
        "적용했습니다(확인 필요). 합가 전 최초양도주택을 소유하던 사람이 실제로 무엇을 갖고 있었는지 1세대1주택 판정 메뉴의 " +
        "「합가 전 보유 구성」에서 사실대로 선택하면 판정합니다.",
    );
  }

  // 날짜로 확정된 사실(상속개시 뒤 취득 등) 때문에 상속 예외를 적용하지 않았다 — 종전 조문 지목 카드가 사라지므로 이유를 남긴다(결정 #8).
  if (declarationDecides && clause2?.status === "excluded") {
    for (const reason of clause2.exclusionReasons ?? []) {
      notices.push(`「소득세법」 §89② 배제를 적용했습니다 — ${reason}`);
    }
  }

  // 모르는 사실 때문에 특례를 적용하지 않았다(원조합원·승계취득 미입력 등) — 확인 필요.
  if (declarationDecides && clause2?.status === "excluded") {
    for (const note of clause2.confirmNotes ?? []) {
      notices.push(`「소득세법」 §89② 배제를 적용했습니다 — ${note}`);
    }
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
  // 원조합원 §155① — §167의11①13호는 「제156조의2, 제156조의3 또는」 조특법 의제만 받고 제155조를 인용하지 않는다.
  if (clause2.exception === TRANSFER.ORIGINAL_MEMBER_RIGHT_TEMP_TWO_HOUSE) return undefined;
  // 합가 의제는 `exception`이 항상 §156의2⑧·⑨라 권리 종류를 따로 받는다(S05-8). 나머지는 조문이 권리 종류를 말한다.
  const presale = clause2.rightKind !== undefined ? clause2.rightKind === "presale_right" : clause2.exception.includes("§156의3");
  return {
    basis: presale ? "house_with_presale_right" : "house_with_redevelopment_right",
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
