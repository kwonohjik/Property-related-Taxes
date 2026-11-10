/**
 * 5년 후 기준시가 안분(령 §40① 준용)의 «5년간 발생분» 1단계 산식 문구 — 부호 케이스별 (US-79).
 * 하이브리드(§98의3·§98의5·§98의6·§98의7·§99의2)와 §98의8이 공유한다. 계산에는 쓰이지 않는 표시 전용.
 * 부호 정책 출처: 부동산거래관리과-136(분자 음수 → 0원) · 부동산거래관리과-525(분모 음수 → 양도소득금액 전체) · 분모 0 → 전액(US-36, 부동산납세과-412 요지 문언).
 */
import {
  ALLOCATION_DENOMINATOR_ZERO_FULL_NOTICE,
  ALLOCATION_NONPOSITIVE_DENOMINATOR_BELOW_FULL_RATE_NOTICE,
  type New993SignCase,
} from "./new-99-3";

export function describeAllocationFormula(args: {
  signCase: New993SignCase;
  transferIncome: number;
  stdAtAcq: number;
  stdAt5Y: number;
  stdAtTransfer: number;
  /** 감면·공제율 — 100% 미만이면 (+,−)·(+,0)에 «감면율 적용 후 상한 = 전액» 고지를 붙인다 */
  rate?: number;
}): string {
  const { signCase, transferIncome, stdAtAcq, stdAt5Y, stdAtTransfer } = args;
  const incomeText = transferIncome.toLocaleString();
  if ((signCase === "pos_neg" || signCase === "pos_zero") && (args.rate ?? 1) < 1) {
    const why = signCase === "pos_neg" ? "양도시 기준시가가 취득시 기준시가보다 낮아 분모가 음수" : "양도시 기준시가가 취득시 기준시가와 같아 분모가 0";
    return `${why}이므로 5년간 발생분을 양도소득금액 ${incomeText} 이상으로 보아 감면율 적용 후 양도소득금액 ${incomeText} 전액 공제 — ${ALLOCATION_NONPOSITIVE_DENOMINATOR_BELOW_FULL_RATE_NOTICE}`;
  }
  switch (signCase) {
    case "neg_pos":
      return "5년시점 기준시가가 취득시 기준시가보다 낮아 분자가 음수이므로 5년간 발생분은 0원 (부동산거래관리과-136)";
    case "pos_neg":
      return `양도시 기준시가가 취득시 기준시가보다 낮아 분모가 음수이므로 양도소득금액 ${incomeText} 전액을 5년간 발생분으로 봄 (부동산거래관리과-525)`;
    case "pos_zero":
      return `양도시 기준시가가 취득시 기준시가와 같아 분모가 0이므로 양도소득금액 ${incomeText} 전액을 5년간 발생분으로 봄 — ${ALLOCATION_DENOMINATOR_ZERO_FULL_NOTICE}`;
    case "all_negative":
      return "분자와 분모가 모두 음수이거나 0이어서 5년간 발생분은 0원으로 봄";
    default:
      return `양도소득금액 ${incomeText} × (5년시점 기준시가 ${stdAt5Y.toLocaleString()} − 취득시 기준시가 ${stdAtAcq.toLocaleString()}) ÷ (양도시 기준시가 ${stdAtTransfer.toLocaleString()} − 취득시 기준시가 ${stdAtAcq.toLocaleString()})`;
  }
}
