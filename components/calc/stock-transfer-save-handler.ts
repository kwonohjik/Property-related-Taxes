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
  securityCode?: string;
  securityName?: string;
  transferDate?: string;
  transferLots?: unknown[];
  [k: string]: unknown;
}

export function isStockFormEmpty(form: StockForm): boolean {
  const noCode = !form.securityCode || form.securityCode === "";
  const noName = !form.securityName || form.securityName === "";
  const noDate = !form.transferDate || form.transferDate === "";
  const noLots = !form.transferLots || form.transferLots.length === 0;
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
