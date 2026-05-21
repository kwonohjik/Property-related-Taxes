"use client";

import {
  makeRunManualSave,
  formatSaveMessage,
  buildAutoSaveToast,
  useRecordCount,
  type ManualSaveOutcome,
} from "@/components/calc/shared/save-handler-builders";

interface TransferForm {
  transferDate?: string;
  filingDate?: string;
  contractTotalPrice?: string;
  assets?: unknown[];
  [k: string]: unknown;
}

interface AssetLike {
  transferPrice?: string;
  acquisitionDate?: string;
  fixedAcquisitionPrice?: string;
  [k: string]: unknown;
}

export function isTransferFormEmpty(form: TransferForm): boolean {
  const noDate = !form.transferDate || form.transferDate === "";
  const assets = (form.assets ?? []) as AssetLike[];
  const noAssets =
    assets.length === 0 ||
    assets.every(
      (a) => !a.transferPrice && !a.acquisitionDate && !a.fixedAcquisitionPrice,
    );
  return noDate && noAssets;
}

export const runTransferManualSave = makeRunManualSave<TransferForm>({
  taxType: "transfer",
  isFormEmpty: isTransferFormEmpty,
  getTaxLawVersion: (form) => form.transferDate || "",
});

export { formatSaveMessage as formatTransferSaveMessage } from "@/components/calc/shared/save-handler-builders";
export { buildAutoSaveToast as buildTransferAutoSaveToast } from "@/components/calc/shared/save-handler-builders";
export { useRecordCount };
export type { ManualSaveOutcome };
