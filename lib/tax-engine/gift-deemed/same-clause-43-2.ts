/**
 * 「상증법」§43② · 「상증령」§32의4 소급 1년 합산 — 금액기준 판정용 공용 헬퍼.
 *
 * 영 §32의4 두문: 「…해당 이익별로 합산하여 각각의 **금액기준**을 계산한다」. 합산 단위는 호마다 다르다 —
 * 3호 §38은 「합병에 따른 이익」 전체, 4~7호 §39·§39의2·§39의3·§40은 「같은 항 **각 호의 이익별로 구분된**
 * 이익」이다. 어느 선행 건이 같은 단위인지는 입력하는 사람이 가린다(표 안내문이 단위를 말한다).
 *
 * - 합산은 **금액기준(3억·1억) 판정**에만 쓴다. 과세하는 증여재산가액은 당해 건 이익 그대로다(#19 설계서 §3 Q1 —
 *   사용자 결정 (a)). 합산 효과를 정한 유권해석을 찾지 못했고, 윈도 합계를 과세하면 이미 과세된 선행 건이 이중으로 잡힌다.
 * - 「100분의 30」 비율기준은 합산 대상이 아니다(두문은 「금액기준」만 말한다) — 호출부가 건별로 판정한다.
 *   `min(비율 금액, 3억)` 형 기준금액은 「비율 leg(건별) OR 금액 leg(합산)」으로 풀어 쓴다.
 * - 윈도 = 증여일 − 1년 ~ 증여일(양끝 포함). 형제 §45의5(`specific-corp.ts`)와 같은 해석이다.
 *   증여일이 없으면 윈도를 정할 수 없으므로 **합산하지 않는다**(⑧이 증여일을 강제한다).
 * - 설계: `docs/00-pm/gift39-19-43-2-aggregation.plan.md`(§39) · `docs/00-pm/gift43-2-capital-axes.plan.md`(자본거래 4축).
 */
import { addYears, format, parseISO } from "date-fns";
import { GIFT } from "../legal-codes";
import type { CalculationStep } from "../types/inheritance-gift.types";

export interface SameClauseGainItem {
  /** 선행 건의 증여일 (YYYY-MM-DD) */
  date: string;
  /** 그 건으로 얻은 이익 */
  gain: number;
  label?: string;
}

export interface SameClauseAggregate {
  /** 윈도 안 선행 이익 합계 — 없으면 0 */
  priorTotal: number;
  /** 윈도 밖이라 합산하지 않은 건수 */
  excludedCount: number;
}

export function sameClausePriorTotal(
  giftDate: Date | undefined,
  priors: SameClauseGainItem[] | undefined,
): SameClauseAggregate {
  if (!priors?.length || giftDate == null || isNaN(giftDate.getTime())) return { priorTotal: 0, excludedCount: 0 };
  const ref = giftDate.toISOString().slice(0, 10);
  const windowFrom = format(addYears(parseISO(ref), -1), "yyyy-MM-dd");
  const inWindow = priors.filter((p) => {
    const d = p.date.slice(0, 10);
    return d >= windowFrom && d <= ref;
  });
  return {
    priorTotal: inWindow.reduce((a, p) => a + p.gain, 0),
    excludedCount: priors.length - inWindow.length,
  };
}

/** 금액기준·합산 단위 표기 — 산출근거 문구용 */
export interface SameClauseLabels {
  /** 「3억」·「1억」 */
  amount: string;
  /** 「같은 호」·「합병」 */
  unit: string;
}

const DEFAULT_LABELS: SameClauseLabels = { amount: "3억", unit: "같은 호" };

/** 결과 산출근거 1행 — 합산이 있었을 때만 */
export function sameClauseAggregateNote(
  current: number,
  agg: SameClauseAggregate,
  labels: SameClauseLabels = DEFAULT_LABELS,
): string {
  const excluded = agg.excludedCount > 0 ? ` · 1년 밖 ${agg.excludedCount}건 제외` : "";
  return `당해 ${current.toLocaleString()} + 1년 이내 ${labels.unit} 선행 ${agg.priorTotal.toLocaleString()}${excluded} — 금액기준(${labels.amount}) 판정에만 합산, 과세는 당해 건`;
}

/**
 * 금액기준 판정용 합계와 산출근거 1행. 합산이 없으면 `total = current`이고 행도 없다.
 * 과세 금액은 바꾸지 않는다 — 호출부는 `total`을 금액 leg 비교에만 쓴다.
 */
export function sameClauseAggregate(
  giftDate: Date | undefined,
  priors: SameClauseGainItem[] | undefined,
  current: number,
  labels: SameClauseLabels = DEFAULT_LABELS,
): { total: number; row?: CalculationStep } {
  const agg = sameClausePriorTotal(giftDate, priors);
  if (agg.priorTotal <= 0) return { total: current };
  const total = current + agg.priorTotal;
  return {
    total,
    row: { label: "§43② 1년 합산 금액기준", amount: total, lawRef: GIFT.DUP_EXCLUSION_ANNUAL, note: sameClauseAggregateNote(current, agg, labels) },
  };
}
