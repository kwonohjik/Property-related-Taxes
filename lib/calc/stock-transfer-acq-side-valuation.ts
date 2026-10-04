/**
 * 취득측 전용 §165④ 보충평가 경로 — 「평가액 계산」(full) 적용 여부의 단일 술어
 *
 * 취득 당시 기준시가만 보충평가로 구하는 두 화면이 있다(양도 당시 기준시가는 다른 방법이다):
 *   - 매매사례가액 취득(sale_case) · 비상장/기타자산 — 개산공제 기준(소득세법 시행령 §163⑥4호·§165④)
 *   - 상장(코스닥·코넥스) 환산 · 취득일 거래정지(halt_acquisition) — 소득세법 시행령 §165③·§165④
 *
 * 두 화면은 `EstimatedUnlistedBlock acquisitionSideOnly`로 결산서의 **취득 열(EUAcq)만** 보여 준다.
 * ④(body)·⑧(검증)이 각자 조건을 적으면 «화면엔 결산서가 있는데 body엔 안 실리는» 결함이 생긴다 —
 * **이 함수 하나**를 쓴다. 계획서 docs/00-pm/stock-transfer-acq-side-unlisted-full-mode.plan.md §4.2
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { usesUnlistedSupplementaryValuation } from "@/lib/tax-engine/stock-transfer/supplementary-valuation-market";
import { isTradingHaltMarketScopeViolation } from "@/lib/tax-engine/stock-transfer/trading-halt-market-scope";

type Fields = Pick<
  StockTransferFormData,
  "acquisitionMode" | "marketType" | "acquisitionStdMode" | "unlistedValuationMode"
>;

/** 취득측 전용 보충평가 경로인가 */
export function isAcquisitionSideOnlyValuationForm(form: Fields): boolean {
  const mode = form.acquisitionMode || "actual";
  if (mode === "sale_case") return usesUnlistedSupplementaryValuation(form.marketType);
  // 비상장에 남은 stale halt_acquisition은 제외한다 — 비상장 환산은 양도·취득 두 열을 다 쓴다.
  return (
    mode === "estimated" &&
    form.acquisitionStdMode === "halt_acquisition" &&
    !usesUnlistedSupplementaryValuation(form.marketType) &&
    !isTradingHaltMarketScopeViolation(form.marketType)
  );
}

/** 취득측 전용 경로에서 「평가액 계산」(결산서 취득 열)을 쓰는가 — 3중 패턴 default "simple" */
export function isAcquisitionSideFullValuationForm(form: Fields): boolean {
  return (
    isAcquisitionSideOnlyValuationForm(form) &&
    (form.unlistedValuationMode || "simple") === "full"
  );
}
