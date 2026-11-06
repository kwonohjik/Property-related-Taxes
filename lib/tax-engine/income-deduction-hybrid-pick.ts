/**
 * 소득금액차감(§90②)으로 적용된 하이브리드 감면 detail 고르기 — 순수 leaf.
 *
 * 합산 엔진(`transfer-tax-aggregate-pickers.ts` `incomeDeductionReducibleOf`)과 결과 카드(`ReductionDetailCards` — NH-64)가 같은 detail을 고르도록
 * 한 곳에 둔다. ⚠️ 서버 의존(세율 로더·Supabase) 모듈을 import하지 않는다 — 클라이언트 결과 화면이 이 파일을 직접 불러온다.
 */
import type { TransferTaxResult } from "./types/transfer-result.types";

type HybridDetails = Pick<
  TransferTaxResult,
  | "unsold987Detail" | "unsold992Detail" | "unsold983Detail" | "unsold985Detail"
  | "unsold986Detail" | "unsold982Detail" | "unsold984Detail" | "unsold98Detail"
>;

/** effectCategory === "income_deduction"인 하이브리드 detail 탐색(§98의3·§98의5·§98의6·§98의7 등 5년후). */
export function activeIncomeDeductionHybrid(r: HybridDetails) {
  return [
    r.unsold987Detail, r.unsold992Detail, r.unsold983Detail, r.unsold985Detail,
    r.unsold986Detail, r.unsold982Detail, r.unsold984Detail, r.unsold98Detail,
  ].find((d) => d?.isEligible && d.effectCategory === "income_deduction");
}
