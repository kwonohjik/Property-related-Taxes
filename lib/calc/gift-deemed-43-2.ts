/**
 * 「상증법」§43② 소급 1년 합산 — 선행 이익 표의 **활성 조건·변환·검증** 단일 출처.
 *
 * 표는 금액기준(3억·1억)이 있는 경로에서만 뜻이 있다(`lib/tax-engine/gift-deemed/same-clause-43-2.ts`).
 * ⑤(표 노출)·④(전송)·⑧(검증)이 **같은 술어**를 부르게 해 한쪽만 고쳐지는 일을 막는다 — 종전 #19는
 * 세 곳에 `ciSubType === "no_realloc"`을 따로 적었다.
 *
 * 명부·매트릭스 경로(합병 매트릭스·감자 멀티·현물출자 고가 명부·증자 cap-table)는 표가 아니라 행마다
 * 「선행 이익 합계」 칸을 쓴다 — 수증자별로 금액기준을 따로 판정하기 때문이다.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { toOptionalDate } from "@/lib/api/date-coerce";
import type { DeemedFormState } from "@/components/calc/deemed-gift/deemed-form-state";
import type { ScPriorTxRow } from "@/components/calc/deemed-gift/deemed-form-rows";
import type { SameClauseGainItem } from "@/lib/tax-engine/gift-deemed/same-clause-43-2";

export type SameClauseRowsKey =
  | "ciPriorSameClauseRows"
  | "mrgPriorSameClauseRows"
  | "cdPriorSameClauseRows"
  | "conPriorSameClauseRows"
  | "cbPriorSameClauseRows"
  | "freePriorSameClauseRows"
  | "psuPriorSameClauseRows";

/** ⑧ 오류 문구의 명사 — 「선행 합병 1의 증여일을 입력하세요」 */
export const SAME_CLAUSE_ITEM: Record<SameClauseRowsKey, string> = {
  ciPriorSameClauseRows: "선행 증자",
  mrgPriorSameClauseRows: "선행 합병",
  cdPriorSameClauseRows: "선행 감자",
  conPriorSameClauseRows: "선행 현물출자",
  cbPriorSameClauseRows: "선행 전환사채등 거래",
  freePriorSameClauseRows: "선행 부동산 무상사용·담보",
  psuPriorSameClauseRows: "선행 재산사용·용역",
};

/**
 * 지금 폼에서 선행 이익 표가 활성인 칸. 없으면 null.
 * - §39 증자: 나목(실권주 미배정)만 3억 금액기준이 있다(#19).
 * - §38 합병: 단일 경로(주식교부 단일·주식 외 재산) — 매트릭스는 행 칸.
 * - §39의2 감자: 단일 경로 — 멀티는 행 칸.
 * - §39의3 현물출자: 고가(2호) + 명부 없음 — 저가(1호)는 금액기준이 없다(영 §29의3②).
 * - §40 전환사채: 라목(conversion_reverse) 외 — 라목은 기준 0원(영 §30②3).
 * - §37 부동산 무상사용·담보: 전부(영 §27④ 1억·⑥ 1천만원) — 다기간이면 첫 기간(당해 증여) 판정에만 닿는다.
 * - §42 재산사용·용역: 무상만(영 §32②1호 1천만원) — 저가·고가는 시가 30% 상당액뿐이라 정책 (a)상 없음.
 */
export function activeSameClauseRowsKey(form: DeemedFormState): SameClauseRowsKey | null {
  switch (form.type) {
    case "capital_increase":
      return form.ciSubType === "no_realloc" ? "ciPriorSameClauseRows" : null;
    case "merger":
      return form.mrgCaseType === "non_stock" || !form.mrgUseShareholders ? "mrgPriorSameClauseRows" : null;
    case "capital_decrease":
      return form.cdMode !== "multi" ? "cdPriorSameClauseRows" : null;
    case "contribution":
      return form.conCaseType === "high" && form.conParties === undefined ? "conPriorSameClauseRows" : null;
    case "convertible_bond":
      return form.cbCaseType !== "conversion_reverse" ? "cbPriorSameClauseRows" : null;
    case "free_realestate":
      return "freePriorSameClauseRows";
    case "property_service_use":
      return form.psuSubType === "free_use" ? "psuPriorSameClauseRows" : null;
    default:
      return null;
  }
}

/** ④ — 활성인 칸이면 행을 엔진 입력으로, 아니면 undefined(남아 있는 행을 보내지 않는다) */
export function sameClauseGainsFor(form: DeemedFormState, key: SameClauseRowsKey): SameClauseGainItem[] | undefined {
  const rows = form[key] ?? [];
  if (activeSameClauseRowsKey(form) !== key || rows.length === 0) return undefined;
  return rows.map((r) => ({
    date: r.date,
    gain: parseAmount(r.benefit),
    ...(r.label.trim() ? { label: r.label.trim() } : {}),
  }));
}

/**
 * ④ — 단일 경로의 선행 이익 표가 활성이고 행이 있으면 증여일(윈도 기준)과 함께 싣는다.
 * 활성 조건은 ⑤·⑧과 같은 술어다. 윈도 판정은 엔진이 한다.
 */
export function sameClauseFields(form: DeemedFormState, key: SameClauseRowsKey) {
  const priorSameClauseGains = sameClauseGainsFor(form, key);
  return priorSameClauseGains ? { giftDate: toOptionalDate(form.giftDate || undefined), priorSameClauseGains } : {};
}

/** ④ — 명부·매트릭스 행의 「선행 이익 합계」 칸. 0·빈 칸은 보내지 않는다 */
export function rowPriorSameClauseGain(v: string | undefined): number | undefined {
  const n = parseAmount(v ?? "");
  return n > 0 ? n : undefined;
}

/**
 * 소급 1년 이내 같은 호 선행 행 검증.
 *
 * 증여일(=거래한 날)이 없으면 엔진은 1년 윈도를 정할 수 없어 합산을 건너뛴다. 그 상태는
 * 이미 `validateDeemedInput`의 공통 가드(「증여일을 입력하세요」)가 **이 함수보다 앞에서** 막으므로 여기서
 * 다시 검사하지 않는다 — 도달 불가 분기를 두면 안전망이 있다고 착각하게 된다.
 */
export function validatePriorSameClauseRows(
  rows: ScPriorTxRow[] | undefined,
  giftDate: string,
  noun: { item: string; date: string },
): string | null {
  const list = rows ?? [];
  if (list.length === 0 || !giftDate) return null;
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (!r.date.trim()) return `${noun.item} ${i + 1}의 ${noun.date}을 입력하세요`;
    if (r.date > giftDate)
      return `${noun.item} ${i + 1}의 ${noun.date}이 증여일보다 뒤입니다 — 합산 대상은 «소급» 1년 이내입니다 (§43²)`;
    if (parseAmount(r.benefit) <= 0) return `${noun.item} ${i + 1}의 이익을 입력하세요`;
  }
  return null;
}

/** ⑧ — 활성인 표만 검증한다(④와 같은 조건). 빈 행·증여일 뒤 행은 합산을 조용히 틀리게 한다 */
export function validateActiveSameClauseRows(form: DeemedFormState): string | null {
  const key = activeSameClauseRowsKey(form);
  if (!key) return null;
  return validatePriorSameClauseRows(form[key], form.giftDate, { item: SAME_CLAUSE_ITEM[key], date: "증여일" });
}
