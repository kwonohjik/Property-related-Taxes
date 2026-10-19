/**
 * 자산 단위 공동주택 — 「상속개시일·증여일 당시 국세청장이 고시한 공동주택 기준시가가 있었는가」 (영 §163⑨ 단서 2호).
 *
 * 계획서: docs/00-pm/transfer-163-9-apart-nts-price-question.plan.md (Q-1~Q-3 A — 2026-10-19 사용자 「권고대로」)
 * 근거: 영 §164⑥(국세청장 고시 공동주택가격이 고시되기 전 취득 — 「국세청장이 당해 자산에 대하여 최초로 고시한 기준시가」)·
 *       ⑦(국토교통부장관 공시 전) · 사전-2018-법령해석재산-0183(1992.1.1. 최초 고시 아파트 → ⑥) · 감사원-2011-감심-423.
 *
 * - 고시 가액이 **있었으면** 「건물의 기준시가가 고시되기 전」이 아니다 ⇒ 단서 2호 비교(②) 없이 본문 평가액(①).
 * - **없었으면** 단서 2호다. ②의 조문은 그 공동주택의 첫 가격이 국세청 고시면 ⑥, 국토교통부 공시면 ⑦(산식 모양 같음).
 * - 「모름」은 없다(사용자 지시). 답이 없으면 ②를 열지 않는다(모름 = 불성립) — 화면(⑧)·API(⑫)가 답을 필수로 받는다.
 *
 * ⚠️ 단독·다가구의 구간 끝(`houseDisclosureBoundary`)과 별개다 — 공동주택의 첫 가격 날짜는 2005.4.30. 전일 수 있다(1992.1.1. 등).
 * 엔진·⑫·④·⑧이 이 파일의 판정을 같이 쓴다.
 */
import { SEC_163_9_BUILDING_FIRST_DISCLOSURE } from "./transfer-split-part-cause";

/** 그 공동주택의 첫 가격을 낸 기관 — 국세청장 고시(영 §164⑥) / 국토교통부장관 공시(⑦). */
export type ApartFirstPriceAgency = "nts" | "molit";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 질문이 필요한 기준일인가 — 기준일 < 구간 끝. 구간 끝은 2005-04-30, 첫 가격 날짜가 그보다 뒤면 그 날(2005.4.30. 뒤에 처음 가격이 나온
 * 공동주택 — 계획서 Q-2). 생략·형식 오류 날짜는 2005-04-30.
 */
export function apartQuestionWindowEnd(firstPriceDate: string | undefined): string {
  const d = firstPriceDate?.slice(0, 10);
  return d && ISO.test(d) && d > SEC_163_9_BUILDING_FIRST_DISCLOSURE ? d : SEC_163_9_BUILDING_FIRST_DISCLOSURE;
}

/** 첫 가격 날짜 범위(계획서 Q-2) — 기준일 < 날짜 ≤ 양도일. 2005.4.30. 하한은 없다. ⑧·⑫가 같은 판정을 쓴다. */
export function apartFirstPriceDateInRange(
  firstPriceDate: string | undefined,
  baseDate: string | undefined,
  transferDate: string | undefined,
): boolean {
  const d = firstPriceDate?.slice(0, 10);
  if (!d || !ISO.test(d)) return false;
  const b = baseDate?.slice(0, 10);
  if (b && d <= b) return false;
  const t = transferDate?.slice(0, 10);
  return !t || d <= t;
}

/**
 * 단서 2호 비교(②)가 열리는가 — 「없었음」 ∧ 첫 가격 날짜가 기준일 뒤. 답이 없거나 「있었음」이면 닫힌다.
 * 기준일은 상속개시일·증여일(YYYY-MM-DD).
 */
export function apartSec164Open(existed: boolean | undefined, firstPriceDate: string | undefined, baseDate: string): boolean {
  if (existed !== false) return false;
  const d = firstPriceDate?.slice(0, 10);
  return !!d && ISO.test(d) && baseDate.slice(0, 10) < d;
}

/** ②의 조문 — 국세청 고시가 첫 가격이면 영 §164⑥, 국토교통부 공시면 ⑦. */
export function apartSec164Clause(agency: ApartFirstPriceAgency | undefined): "§164⑥" | "§164⑦" {
  return agency === "nts" ? "§164⑥" : "§164⑦";
}

export const APART_NTS_PRICE_REQUIRED_MESSAGE =
  "상속개시일·증여일 당시 이 공동주택에 국세청장이 고시한 공동주택 기준시가가 있었는지 고르세요 — 있었으면 「건물의 기준시가가 고시되기 전」이 "
  + "아니어서 평가액만으로, 없었으면 평가액과 「소득세법 시행령」 제164조 제6항·제7항 가액 중 많은 금액으로 계산합니다(같은 영 제163조 제9항 단서 제2호)";

export const APART_FIRST_PRICE_AGENCY_REQUIRED_MESSAGE =
  "이 공동주택에 처음 매겨진 가격이 국세청장 고시 기준시가인지 국토교통부장관 공시 공동주택가격인지 고르세요 — 국세청 고시면 「소득세법 시행령」 "
  + "제164조 제6항, 국토교통부 공시면 같은 조 제7항이 적용됩니다";

export const APART_FIRST_PRICE_DATE_RANGE_MESSAGE =
  "이 공동주택의 첫 가격 고시·공시일은 상속개시일·증여일 뒤부터 양도일까지의 날짜여야 합니다 — 상속·증여 당시 고시 가액이 없었다면 첫 가격은 그 뒤에 "
  + "나왔고, 양도일 뒤에 처음 나온 가격은 양도 당시 알 수 없어 계산하지 않습니다";

/** 「있었음」 근거 — 결과 산식에 붙는다. */
export const APART_NTS_PRICE_EXISTED_NOTE =
  "상속개시일·증여일 당시 국세청장이 고시한 공동주택 기준시가가 있었으므로 「건물의 기준시가가 고시되기 전」이 아닙니다 — "
  + "영 §163⑨ 단서 2호(같은 영 §164⑥·⑦ 가액과의 비교)를 적용하지 않고 평가액을 취득가액으로 합니다(영 §163⑨ 본문)";

/**
 * 의제취득일 전 상속·증여 공동주택의 확인 필요(계획서 Q-3) — 「없었음」인데 첫 가격이 의제취득일(1985.1.1.) 이전이면,
 * 1985.1.1. 현재(이 경우의 「취득당시」)에는 고시 가액이 이미 있었다. ② 산식은 그 가격이 없는 경우의 환산이다.
 */
export const APART_PRE_DEEMED_FIRST_PRICE_NOTE =
  "확인 필요: 이 공동주택의 첫 가격이 의제취득일(1985.1.1.) 이전에 나왔습니다. 1984.12.31. 이전 취득분은 1985.1.1.에 취득한 것으로 보므로"
  + "(「소득세법」 부칙 법률 제4803호 제8조) 그날 현재 고시된 가액이 있으면 그 가액이 취득당시 기준시가일 수 있습니다 — 영 §164⑥·⑦ 환산은 "
  + "고시 가액이 없는 경우의 산식입니다. 그 가액은 「의제취득일(1985.1.1.) 시점 주택가격 직접 입력」으로 넣을 수 있습니다";
