/**
 * build-columns — 표 열 스펙 조립 (열 라벨 + 사업연도 입력 배선).
 *
 * 계획서: docs/00-pm/post-listing-statement-table-layout.plan.md §4.2.2 · §5
 *
 * 네 화면(PostListing NI/NA · EstimatedUnlisted NI/NA)이 같은 배선을 쓴다.
 * 사업연도 필드는 **순손익·순자산이 한 벌을 공유**하므로 여기가 단일 소스다.
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StatementColumn, StatementColumnSpec } from "./statement-table-types";

/** 열 → 사업연도 폼 키. ni/na 공용 — 쪼개면 두 계산서가 조용히 갈라진다(계획서 §5.1). */
export const FISCAL_YEAR_KEY: Record<StatementColumn, keyof StockTransferFormData> = {
  Listing: "fiscalYearListing",
  Acq: "fiscalYearAcq",
  EUTransfer: "fiscalYearEUTransfer",
  EUAcq: "fiscalYearEUAcq",
};

export function buildStatementColumns(
  form: StockTransferFormData,
  onChange: (patch: Partial<StockTransferFormData>) => void,
  cols: readonly { col: StatementColumn; label: string }[],
): StatementColumnSpec[] {
  return cols.map(({ col, label }) => {
    const key = FISCAL_YEAR_KEY[col];
    return {
      col,
      label,
      fiscalYear: (form[key] as string) ?? "",
      onFiscalYearChange: (v: string) =>
        onChange({ [key]: v } as Partial<StockTransferFormData>),
    };
  });
}
