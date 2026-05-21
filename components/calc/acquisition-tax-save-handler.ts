"use client";

import {
  makeRunManualSave,
  formatSaveMessage,
  buildAutoSaveToast,
  useRecordCount,
  type ManualSaveOutcome,
} from "@/components/calc/shared/save-handler-builders";

interface AcquisitionForm {
  acquisitionPrice?: string;
  standardValue?: string;
  balancePaymentDate?: string;
  registrationDate?: string;
  contractDate?: string;
  [k: string]: unknown;
}

export function isAcquisitionFormEmpty(form: AcquisitionForm): boolean {
  const noPrice = !form.acquisitionPrice || form.acquisitionPrice === "";
  const noStdValue = !form.standardValue || form.standardValue === "";
  const noDate =
    (!form.balancePaymentDate || form.balancePaymentDate === "") &&
    (!form.registrationDate || form.registrationDate === "") &&
    (!form.contractDate || form.contractDate === "");
  return noPrice && noStdValue && noDate;
}

export const runAcquisitionManualSave = makeRunManualSave<AcquisitionForm>({
  taxType: "acquisition",
  isFormEmpty: isAcquisitionFormEmpty,
  getTaxLawVersion: (form) =>
    form.balancePaymentDate || form.registrationDate || form.contractDate || "",
});

export { formatSaveMessage as formatAcquisitionSaveMessage } from "@/components/calc/shared/save-handler-builders";
export { buildAutoSaveToast as buildAcquisitionAutoSaveToast } from "@/components/calc/shared/save-handler-builders";
export { useRecordCount };
export type { ManualSaveOutcome };
