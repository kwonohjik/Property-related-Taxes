/**
 * §98·§98의2·§98의3·§98의5·§98의6·§98의7 취득 원인 게이트 — 공용 leaf (리뷰 US-07 · US-06, 사용자 결정 2026-11-06 「전 조문 차단」).
 *
 * 대상 주택은 모두 「사업주체(등)와 최초로 매매계약을 체결하고 취득」(§98의3①·§98의5①·§98의6①·§98의7①)하거나
 * 「주택건설사업자로부터 최초로 분양받은」(조특령 §98①2호) 미분양주택이다(§98의2는 조특령 §98의2①). 상속·증여로 받은 주택은
 * 그 취득자가 아니다.
 * - 완공 주택 상속: 국세청 부동산거래관리과-337(2011.04.19 — §98의2·§98의3 「상속 받아 양도하는 … 적용되지 않는 것」) ·
 *   조심 2017중1433(2017.08.08 — §98의3) · 대법원 2014두35126(2014.05.16 — 구 §99①2호 같은 문언 구조).
 * - 증여·이월과세 증여: 재산세과-686 · 재산세과-1625 · 법규과-434 · 서면-2022-부동산-0888(2022.10.14 — 분양권을 매매·증여 등으로
 *   승계받아 취득하는 주택은 적용되지 않는다). 이월과세는 양도차익 계산 특례(소득세법 §97의2①)일 뿐 수증자가 최초 계약자가 되지 않는다.
 *
 * 예외(같은 결정):
 * - 분양권을 상속받아 **상속인이 잔금을 내고 취득**한 주택 — §98의3은 기재부 조세법령운용과-1103(2021.12.23)이 적용으로 봤다.
 *   §98의5·§98의7은 같은 문언 구조로 유추한다. §98의2는 재산세과-1442(2009.07.15)대로 분양권 상속도 불적용, §98은 해석이 없어 불적용.
 *   답은 3-state다 — 「아니오」는 불성립, 「모름」·빈 값(직접 API·옛 이력)은 불성립 + 확인 필요(§99 계열 `new-99-acquisition-cause.ts`와 같은 정책).
 * - §98의6 2호(취득 후 5년 이상 임대) 상속 — 조특령 §98의5⑤2호가 「상속인이 … 피상속인의 임대주택을 취득하여 임대하는 경우에는
 *   피상속인의 임대기간을 상속인의 임대기간에 합산」해 상속인 적용을 전제한다. 1호(사업주체등 2년 임대 후 매수)는 불적용.
 *
 * 부담부증여(`burdened_gift`)는 양도 측 사건이라 막지 않는다. 신축(`newConstruction`)은 §98의3② 자기건설 갈래가 따로 판정한다.
 */
import type { TriStateAnswer } from "./new-99-luxury-house";
import { TRANSFER_REDUCTION_ARTICLE as ART } from "../legal-codes/transfer-house";

export type Unsold98AcquisitionCause =
  | "purchase"
  | "inheritance"
  | "gift"
  | "carryover_gift"
  | "newConstruction"
  | "burdened_gift";

const ARTICLE_OF: Record<string, string> = {
  unsold_98: ART.UNSOLD_98,
  unsold_98_2: ART.UNSOLD_98_2,
  unsold_98_3: ART.UNSOLD_98_3,
  unsold_98_5: ART.UNSOLD_98_5,
  unsold_98_6: ART.UNSOLD_98_6,
  unsold_98_7: ART.UNSOLD_98_7,
};

/** 분양권 상속 후 상속인 잔금 취득을 적용으로 보는 조문(§98의3 — 조세법령운용과-1103 · §98의5·§98의7 유추) */
const PRESALE_INHERITANCE_ALLOWED: ReadonlySet<string> = new Set(["unsold_98_3", "unsold_98_5", "unsold_98_7"]);

/** 화면에서 「상속 당시 분양권이었고 상속인이 잔금을 내고 취득했나요?」를 물어야 하는 조문인가 — ⑤·⑧·④ 공용 술어 */
export function asksInheritedPresaleQuestion(id: string, acquisitionCause: string | undefined): boolean {
  return acquisitionCause === "inheritance" && PRESALE_INHERITANCE_ALLOWED.has(id);
}

/**
 * 명부 행 ⑥ 감면주택 선언 중 취득 원인으로 갈리는 조문 — §98 시리즈 6조문 + §99·§99의3(US-06 후속, 사용자 결정 2026-11-06 「행에 증여 칸」).
 * 증여(이월과세 대상 증여 포함)로 받은 이 조문의 주택은 주택 수에서 빠지지 않는다. ⑤ 토글·⑬·엔진이 같은 술어를 쓴다.
 */
const ROW_CAUSE_GATED_ARTICLES: ReadonlySet<string> = new Set([
  "unsold_98", "unsold_98_2", "unsold_98_3", "unsold_98_5", "unsold_98_6", "unsold_98_7", "new_99", "new_99_3",
]);
export function asksRowGiftQuestion(article: string): boolean {
  return ROW_CAUSE_GATED_ARTICLES.has(article);
}

export interface Unsold98AcquisitionCauseReason {
  code: "ACQUIRED_BY_GIFT" | "ACQUIRED_BY_INHERITANCE" | "INHERITED_PRESALE_UNCONFIRMED";
  message: string;
  legalBasis: string;
  /** 「모름」·빈 값 — 불성립 + 확인 필요 */
  unconfirmed?: boolean;
}

export function unsold98AcquisitionCauseReason(
  id: string,
  acquisitionCause: string | undefined,
  opts: { inheritedPresaleCompletedByHeir?: TriStateAnswer | ""; hoType986?: string } = {},
): Unsold98AcquisitionCauseReason | undefined {
  const legalBasis = ARTICLE_OF[id];
  if (!legalBasis) return undefined;
  if (acquisitionCause === "gift" || acquisitionCause === "carryover_gift") {
    const causeLabel = acquisitionCause === "carryover_gift" ? "증여(이월과세 대상 증여)로" : "증여로";
    return {
      code: "ACQUIRED_BY_GIFT",
      message:
        `${causeLabel} 취득한 주택은 사업주체(등)와 최초로 매매계약을 체결하고 취득한 미분양주택이 아니라 적용되지 않습니다 ` +
        `(${legalBasis} · 재산세과-686 · 서면-2022-부동산-0888 — 분양권을 증여 등으로 승계받아 취득한 주택 불적용).`,
      legalBasis,
    };
  }
  if (acquisitionCause !== "inheritance") return undefined;
  // §98의6 2호 — 조특령 §98의5⑤2호(상속인 임대기간 합산)가 상속인 적용을 전제한다.
  if (id === "unsold_98_6" && opts.hoType986 === "buyer_rented") return undefined;
  if (PRESALE_INHERITANCE_ALLOWED.has(id)) {
    const a = opts.inheritedPresaleCompletedByHeir;
    if (a === "yes") return undefined;
    if (a === "no") {
      return {
        code: "ACQUIRED_BY_INHERITANCE",
        message:
          "완공된 주택을 상속받으면 적용되지 않습니다 — 상속인은 사업주체와 최초로 매매계약을 체결하고 취득한 자가 아닙니다 " +
          `(${legalBasis} · 부동산거래관리과-337 · 조심 2017중1433 · 대법원 2014두35126).`,
        legalBasis,
      };
    }
    return {
      code: "INHERITED_PRESALE_UNCONFIRMED",
      message:
        `확인 필요: 상속 당시 분양권이었고 상속인이 잔금을 내고 취득했는지 확인되지 않아 적용하지 않았습니다(${legalBasis}). ` +
        "그런 경우라면 「분양권 상속 후 잔금 취득」을 「예」로 선택하고 다시 계산하세요(기획재정부 조세법령운용과-1103).",
      legalBasis,
      unconfirmed: true,
    };
  }
  const detail =
    id === "unsold_98_6"
      ? "§98의6①1호(사업주체등이 임대한 주택을 최초로 매매계약해 취득)는 상속인에게 적용되지 않습니다 — 상속인 임대기간 합산(조특령 §98의5⑤2호)은 ①2호 갈래입니다."
      : id === "unsold_98_2"
        ? "분양권을 상속받아 잔금을 낸 경우도 같습니다(재산세과-1442)."
        : "";
  return {
    code: "ACQUIRED_BY_INHERITANCE",
    message:
      "상속받은 주택은 적용되지 않습니다 — 상속인은 해당 미분양주택의 최초 취득자가 아닙니다 " +
      `(${legalBasis} · 부동산거래관리과-337 · 대법원 2014두35126).${detail ? ` ${detail}` : ""}`,
    legalBasis,
  };
}

/**
 * 엔진 진입 방어 — 취득 원인 게이트에 걸린 §98 시리즈 감면을 걷어 내고 고지한다(`stripAssetKindGatedReductions`와 같은 자리·같은 이유:
 * 감면 효과와 감면주택 중과 배제(STEP 0.45)가 모두 이 선택을 근거로 한다).
 */
export function stripAcquisitionCauseGatedReductions<T extends { type: string }>(
  reductions: readonly T[] | undefined,
  acquisitionCause: string | undefined,
  inheritedPresaleCompletedByHeir: TriStateAnswer | "" | undefined,
): { reductions: T[] | undefined; notices: string[] } {
  if (!reductions) return { reductions, notices: [] };
  const kept: T[] = [];
  const notices: string[] = [];
  for (const r of reductions) {
    const reason = unsold98AcquisitionCauseReason(r.type, acquisitionCause, {
      inheritedPresaleCompletedByHeir,
      hoType986: (r as { hoType986?: string }).hoType986,
    });
    if (!reason) kept.push(r);
    else if (!notices.includes(reason.message)) notices.push(reason.message);
  }
  return { reductions: kept, notices };
}
