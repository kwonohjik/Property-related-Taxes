"use client";

import {
  makeRunManualSave,
  formatSaveMessage,
  buildAutoSaveToast,
  useRecordCount,
  type ManualSaveOutcome,
} from "@/components/calc/shared/save-handler-builders";
import { extractStockTransferDate } from "@/lib/storage/title-generator";

interface StockForm {
  /** 다종목 합산 표지 — 있으면 `items`가 신고서 전 종목이다 */
  __multiStock?: boolean;
  items?: unknown[];
  securityCode?: string;
  securityName?: string;
  transferDate?: string;
  transferLots?: unknown[];
  [k: string]: unknown;
}

export function isStockFormEmpty(form: StockForm): boolean {
  /**
   * 다종목 합산은 신고서 전체(`{ __multiStock: true, items: [...] }`)로 저장된다
   * (계획서 `stock-history-aggregate-filing.plan.md` §4.1). 그 형태에서는 종목 필드가
   * top-level에 없으므로 **대표 종목으로 판정**한다 — 그러지 않으면 종목을 다 채운 다종목
   * 신고서가 「빈 폼」으로 거부된다.
   */
  const items = form.__multiStock === true ? (form.items as StockForm[] | undefined) : undefined;
  const f = Array.isArray(items) && items.length > 0 ? items[0] : form;
  const noCode = !f.securityCode || f.securityCode === "";
  const noName = !f.securityName || f.securityName === "";
  const noDate = !f.transferDate || f.transferDate === "";
  const noLots = !f.transferLots || f.transferLots.length === 0;
  return noCode && noName && noDate && noLots;
}

export const runStockManualSave = makeRunManualSave<StockForm>({
  taxType: "stock_transfer",
  isFormEmpty: isStockFormEmpty,
  getTaxLawVersion: (form) =>
    extractStockTransferDate(form as Record<string, unknown>) ?? "",
});

export { formatSaveMessage as formatStockSaveMessage } from "@/components/calc/shared/save-handler-builders";
export { buildAutoSaveToast as buildStockAutoSaveToast } from "@/components/calc/shared/save-handler-builders";
export { useRecordCount };
export type { ManualSaveOutcome };
