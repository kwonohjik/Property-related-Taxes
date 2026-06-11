"use client";

import {
  makeRunManualSave,
  useRecordCount,
  type ManualSaveOutcome,
} from "@/components/calc/shared/save-handler-builders";
import type { FormState } from "@/components/calc/acquisition/shared";

/**
 * FormState에서 Pick으로 파생 — 폼 키가 변경/삭제되면 여기서 tsc가 실패한다.
 * (2026-06 리뷰 R1: 존재하지 않는 `acquisitionPrice` 키 참조로 빈 폼 오판 →
 *  취득가액만 입력한 폼의 수동 저장이 거부되던 버그의 재발 방지 가드)
 */
export type AcquisitionForm = Partial<
  Pick<
    FormState,
    "reportedPrice" | "standardValue" | "balancePaymentDate" | "registrationDate" | "contractDate"
  >
> &
  Record<string, unknown>;

export function isAcquisitionFormEmpty(form: AcquisitionForm): boolean {
  const noPrice = !form.reportedPrice || form.reportedPrice === "";
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
