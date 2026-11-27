"use client";

import {
  makeRunManualSave,
  useRecordCount,
  type ManualSaveOutcome,
} from "@/components/calc/shared/save-handler-builders";
import { foreignTaxLawVersion } from "@/lib/storage/foreign-history";
import { hasForeignInput } from "@/lib/storage/foreign-history";
import { isForeignRealEstateForm } from "@/lib/calc/transfer-foreign-scope";

interface TransferForm {
  assetLocation?: "domestic" | "foreign";
  foreignResidenceYears?: string;
  foreignAssets?: unknown;
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

/** 이력의 세율 기준일 — 국외는 자산별 양도일(가장 늦은 날), 국내는 폼 양도일. 자동·수동 저장이 같은 규칙을 쓴다. */
export function transferTaxLawVersion(form: {
  transferDate?: string;
  assetLocation?: "domestic" | "foreign";
  foreignAssets?: unknown;
}): string {
  return isForeignRealEstateForm(form)
    ? foreignTaxLawVersion(form)
    : (form.transferDate ?? "");
}

export function isTransferFormEmpty(form: TransferForm): boolean {
  // 국외 폼은 폼 전역 양도일·국내 자산을 쓰지 않는다 — 국내 규칙으로 읽으면 국외 입력만 있는 폼이 «빈 폼»이 된다(수동 저장 차단)
  if (isForeignRealEstateForm(form)) return !hasForeignInput(form);
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
  getTaxLawVersion: transferTaxLawVersion,
});

export { formatSaveMessage as formatTransferSaveMessage } from "@/components/calc/shared/save-handler-builders";
export { buildAutoSaveToast as buildTransferAutoSaveToast } from "@/components/calc/shared/save-handler-builders";
export { useRecordCount };
export type { ManualSaveOutcome };
