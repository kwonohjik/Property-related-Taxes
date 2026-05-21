"use client";

/**
 * 재산세 수동 저장 핸들러 v4.
 * 공통 헬퍼 사용 — isFormEmpty + taxLawVersion만 차별화.
 */

import {
  makeRunManualSave,
  formatSaveMessage,
  buildAutoSaveToast,
  useRecordCount,
  type ManualSaveOutcome,
} from "@/components/calc/shared/save-handler-builders";

interface PropertyForm {
  publishedPrice?: string;
  jibun?: string;
  road?: string;
  objectType?: string;
  [k: string]: unknown;
}

export function isPropertyFormEmpty(form: PropertyForm): boolean {
  // 공시가격·주소 어느 하나도 입력되지 않은 경우 빈 폼.
  const noPrice = !form.publishedPrice || form.publishedPrice === "";
  const noAddress = (!form.jibun || form.jibun === "") && (!form.road || form.road === "");
  return noPrice && noAddress;
}

export const runPropertyManualSave = makeRunManualSave<PropertyForm>({
  taxType: "property",
  isFormEmpty: isPropertyFormEmpty,
  getTaxLawVersion: () => `${new Date().getFullYear()}-06-01`,
});

export { formatSaveMessage as formatPropertySaveMessage } from "@/components/calc/shared/save-handler-builders";
export { buildAutoSaveToast as buildPropertyAutoSaveToast } from "@/components/calc/shared/save-handler-builders";
export { useRecordCount };
export type { ManualSaveOutcome };
