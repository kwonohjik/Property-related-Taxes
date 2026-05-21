"use client";

import {
  makeRunManualSave,
  formatSaveMessage,
  buildAutoSaveToast,
  useRecordCount,
  type ManualSaveOutcome,
} from "@/components/calc/shared/save-handler-builders";

interface InheritanceForm {
  deathDate?: string;
  assets?: unknown[];
  heirs?: unknown[];
  [k: string]: unknown;
}

export function isInheritanceFormEmpty(form: InheritanceForm): boolean {
  const noDate = !form.deathDate || form.deathDate === "";
  const noAssets = !form.assets || form.assets.length === 0;
  const noHeirs = !form.heirs || form.heirs.length === 0;
  return noDate && noAssets && noHeirs;
}

export const runInheritanceManualSave = makeRunManualSave<InheritanceForm>({
  taxType: "inheritance",
  isFormEmpty: isInheritanceFormEmpty,
  getTaxLawVersion: (form) => form.deathDate || "",
});

export { formatSaveMessage as formatInheritanceSaveMessage } from "@/components/calc/shared/save-handler-builders";
export { buildAutoSaveToast as buildInheritanceAutoSaveToast } from "@/components/calc/shared/save-handler-builders";
export { useRecordCount };
export type { ManualSaveOutcome };
