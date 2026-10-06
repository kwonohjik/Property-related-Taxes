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

/**
 * 과세 무상주의 취득가액은 **법정**이다 — 의제배당으로 과세된 금액 = 액면가액(소득세법 시행령
 * §27①1호 가목 · 무액면주식은 §27⑥). 실지거래가액을 확인할 수 없을 때 쓰는 추계(환산취득가·
 * 매매사례가액 — 법 §97①1호 나목)가 들어설 자리가 없으므로 실가 모드만 허용한다.
 *
 * 🔑 **예외 — 의제취득일 전 취득**(`isPreDeemed`): 소득세법 시행령 §176의2④가 의제취득일 현재 취득가액을
 *    「① 의제취득일 현재 매매사례가액·감정가액·환산가액」과 「② 취득 당시 실지거래가액 + 생산자물가상승분」
 *    중 **많은 것으로 한다**(강행). 액면가액은 ②의 실지거래가액이고, ①은 추계 모드에서만 산정된다 —
 *    여기서 막으면 ①·② 비교 자체가 사라진다(PR-3 #2001이 날짜와 무관하게 막았던 결함).
 *    그때 ②의 액면가액은 ⑧이 필수로 받는다(`isBonusTaxedPreDeemedFaceValueMissing`).
 *
 * ⑤ Step2 라디오 · ⑧ validate-step2 · ③ 복원 마이그레이션이 이 술어를 공유한다.
 * ⚠️ ⑫ Zod 는 막지 못한다 — ④가 원인을 「매매」로 매핑해 보내므로(엔진 enum 불변) 서버는 원인을 모른다.
 */
export function isBonusTaxedEstimationBlocked(
  cause: FormAcquisitionCause | undefined,
  acquisitionMode: string | undefined,
  isPreDeemed: boolean,
): boolean {
  return cause === "bonus_taxed" && (acquisitionMode || "actual") !== "actual" && !isPreDeemed;
}

/**
 * 의제취득일 전 과세 무상주를 추계 모드로 계산할 때 ②의 기준(취득 당시 1주당 액면가액)이 비었는가.
 * 매수는 「알면 입력」(선택)이지만 과세 무상주의 액면가액은 언제나 확인되는 법정 금액이라 비우면 ②가
 * 빠져 「많은 것」 비교가 ①만으로 끝난다 — 조용한 과소 취득가액이라 ⑧이 막는다.
 * 실가 모드는 입력한 1주당 액면가액이 곧 ②의 기준이라 해당 없다.
 */
export function isBonusTaxedPreDeemedFaceValueMissing(
  cause: FormAcquisitionCause | undefined,
  acquisitionMode: string | undefined,
  isPreDeemed: boolean,
  preDeemedActualPricePerShare: string | undefined,
): boolean {
  if (cause !== "bonus_taxed" || !isPreDeemed || (acquisitionMode || "actual") === "actual") return false;
  return !(parseFloat((preDeemedActualPricePerShare || "").replace(/,/g, "")) > 0);
}

export const BONUS_TAXED_PRE_DEEMED_FACE_VALUE_REQUIRED_MESSAGE =
  "의제취득일 전에 받은 과세 무상주는 ② 취득 당시 1주당 액면가액(의제배당 과세 금액)을 입력하세요 — " +
  "① 의제취득일 현재 가액과 ② 액면가액 + 생산자물가상승분 중 많은 것이 취득가액입니다 (소득세법 시행령 §176의2④)";

export const BONUS_TAXED_ACTUAL_ONLY_MESSAGE =
  "의제배당으로 과세된 무상주의 취득가액은 액면가액(의제배당 금액)으로 정해져 있어 환산취득가·매매사례가액을 쓸 수 없습니다(의제취득일 전에 받은 무상주는 예외) — " +
  "「실가」를 고르고 1주당 액면가액을 입력하세요 (소득세법 시행령 §27①1호 가목)";
