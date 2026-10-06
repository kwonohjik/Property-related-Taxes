/**
 * 주식 취득원인 — 폼 전용 값(유상증자·무상증자) ↔ 엔진 값 매핑 단일 소스
 *
 * 계획서 `docs/00-pm/stock-split-lots-ui-bugfix.plan.md` F-1 (PR-2, 사용자 결정 A안 · 단건 모드 포함)
 *
 * | 폼 값            | 의미                                            | 엔진 값      | 근거 |
 * |------------------|-------------------------------------------------|--------------|------|
 * | `rights_issue`   | 유상증자로 인수한 신주                          | `purchase`   | 납입한 인수가액이 실지거래가액(소득세법 §97①1호 가목), 취득시기는 대금청산일(§98) — §104② 특례 없음 |
 * | `bonus_taxed`    | 무상증자 — 의제배당으로 **과세된** 무상주       | `purchase`   | 취득가액 = 액면가액(소득세법 시행령 §27①1호 가목 · 서일46014-11217), 그 무상주 취득일부터 기산 |
 * | `bonus_untaxed`  | 무상증자 — 의제배당 **비과세**(자본준비금 전입) | (전송 안 함) | 취득일 = 원주 취득일 · 취득가액 0(서면-2019-자본거래-1671 · 서면-2022-자본거래-3177) ⇒ 매수 건이 아니라 자본조정 비율로 입력 |
 *
 * 🔑 엔진·Zod enum 은 바꾸지 않는다 — 두 원인 모두 엔진 계산상 「매매」와 같다(보유기간은 그날부터,
 *    취득가액은 입력값). ④가 이 함수로 매핑하고, ⑤⑧의 원인 술어(의제취득일 매수 판정 등)도 같은
 *    함수를 거쳐야 ④·엔진과 갈리지 않는다.
 *
 * `bonus_untaxed`를 lot 으로 받지 않는 이유: 원가 0 lot 을 원주 취득일로 넣으면 선입선출이 원주와
 * 별개 순번으로 소비해 매칭이 틀어진다. 원주 lot 의 총원가를 보존하며 1주당 단가를 희석하는
 * 자본조정(소득세법 시행령 §27②)이 정본이다. ⑧이 막고, ⑫ Zod enum 이 방어선이다.
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

export type FormAcquisitionCause = NonNullable<StockTransferFormData["acquisitionCause"]>;

/** ③ 복원 허용 목록 — 단건·lot 공용 (없는 값은 `purchase`로 떨어진다) */
export const FORM_ACQUISITION_CAUSES = [
  "purchase",
  "rights_issue",
  "bonus_taxed",
  "bonus_untaxed",
  "inheritance",
  "gift",
  "carryover_gift",
  "merger_split",
] as const satisfies readonly FormAcquisitionCause[];

type EngineAcquisitionCause = Exclude<FormAcquisitionCause, "rights_issue" | "bonus_taxed">;

/** ④·⑤·⑧ 공용 — 엔진이 받는 원인으로 바꾼다. 유상증자·과세 무상주는 「매매」 */
export function toEngineAcquisitionCause(cause: FormAcquisitionCause): EngineAcquisitionCause {
  return cause === "rights_issue" || cause === "bonus_taxed" ? "purchase" : cause;
}

export const BONUS_UNTAXED_BLOCK_MESSAGE =
  "의제배당으로 과세되지 않은 무상주(자본준비금 전입)는 매수 건으로 입력하지 않습니다 — " +
  "원주 취득 건으로 입력하고, 무상증자는 2단계 「무상증자·무상감자 (자본조정)」에 비율로 입력하세요 " +
  "(취득일은 원주 취득일·취득가액 0 — 국세청 서면-2019-자본거래-1671)";
