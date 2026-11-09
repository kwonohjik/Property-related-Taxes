/**
 * 양도소득분 지방소득세 가산세(지방세기본법 §53~§55) 표시 — 상세 명세서 행·산식 문구의 **단일 소스** (US-29).
 *
 * 값은 엔진 `localIncomePenalty.total`을 그대로 읽는다(다시 계산하지 않는다). 산식은 엔진 산출근거 단계(`steps`)가 쓰는
 * 한국어 문구와 같은 정보를 풀어 적는다.
 */
import type { StatementItem } from "./DetailedStatementHelpers";
import type { LocalIncomePenaltyDetail } from "@/lib/tax-engine/transfer-tax-local-income-penalty";

const won = (n: number): string => n.toLocaleString();

/** 지방소득세 가산세 한 줄 산식 — 무신고/과소신고 + 납부지연 */
export function localIncomePenaltyFormula(d: LocalIncomePenaltyDetail): string {
  const parts: string[] = [];
  if (d.filing && d.filing.penalty > 0) {
    const f = d.filing;
    const name = f.kind === "non_filing" ? "무신고가산세" : "과소신고가산세";
    const reduction = f.reductionRate > 0 ? ` − 감면 ${Math.round(f.reductionRate * 100)}% ${won(f.reductionAmount)}` : "";
    parts.push(`${name} ${won(f.grossPenalty)}${reduction} = ${won(f.penalty)}`);
  }
  if (d.delayed && d.delayed.penalty > 0) {
    const x = d.delayed;
    parts.push(
      `납부지연가산세 (지방 법정납부기한 ${x.localDeadline} 다음 날부터 자진납부일 ${x.paymentDate}까지 ${x.days}일) = ${won(x.penalty)}`,
    );
  }
  return `${parts.join(" + ")} — 지방소득세를 국세와 같은 날 신고·납부한 것으로 본 가정 (확인 필요)`;
}

/** 상세 명세서 「지방소득세 가산세」 행. 가산세가 없으면 undefined(행을 내지 않는다). */
export function localIncomePenaltyStatementItem(
  d: LocalIncomePenaltyDetail | undefined,
): StatementItem | undefined {
  if (!d || d.total <= 0) return undefined;
  return {
    label: "지방소득세 가산세",
    value: d.total,
    formula: localIncomePenaltyFormula(d),
    legalBasis: "지방세법 §103의2 3호 · 지방세기본법 §53~§55 · §57②",
    summaryOnly: true,
  };
}
