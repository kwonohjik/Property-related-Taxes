"use client";

import {
  makeRunManualSave,
  formatSaveMessage,
  buildAutoSaveToast,
  useRecordCount,
  type ManualSaveOutcome,
} from "@/components/calc/shared/save-handler-builders";

interface ComprehensiveForm {
  assessmentYear?: string;
  properties?: Array<{ assessedValue?: string }>;
  hasAggregateLand?: boolean;
  hasSeparateLand?: boolean;
  landAggregate?: { totalOfficialValue?: string };
  landSeparate?: Array<{ publicPrice?: string }>;
  [k: string]: unknown;
}

export function isComprehensiveFormEmpty(form: ComprehensiveForm): boolean {
  const noProperties =
    !form.properties ||
    form.properties.length === 0 ||
    form.properties.every((p) => !p.assessedValue);
  const noAggLand =
    !form.hasAggregateLand ||
    !form.landAggregate?.totalOfficialValue;
  const noSepLand =
    !form.hasSeparateLand ||
    !form.landSeparate ||
    form.landSeparate.length === 0 ||
    form.landSeparate.every((l) => !l.publicPrice);
  return noProperties && noAggLand && noSepLand;
}

export const runComprehensiveManualSave = makeRunManualSave<ComprehensiveForm>({
  taxType: "comprehensive_property",
  isFormEmpty: isComprehensiveFormEmpty,
  getTaxLawVersion: (form) =>
    `${form.assessmentYear || new Date().getFullYear()}-06-01`,
});

export { formatSaveMessage as formatComprehensiveSaveMessage } from "@/components/calc/shared/save-handler-builders";
export { buildAutoSaveToast as buildComprehensiveAutoSaveToast } from "@/components/calc/shared/save-handler-builders";
export { useRecordCount };
export type { ManualSaveOutcome };
