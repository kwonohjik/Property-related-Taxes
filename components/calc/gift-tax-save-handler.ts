"use client";

/**
 * 증여세 저장 핸들러 — 6세목 공통 표준(`shared/save-handler-builders`)에 위임.
 *
 * ## 왜 바뀌었나 (IG-162 · IG-163)
 *
 * 7개 `{tax}-save-handler.ts` 중 **증여세만** 공통 헬퍼를 안 쓰고 자체 구현이었다.
 * 그래서 두 가지가 빠져 있었다:
 *
 * 1. **미결(임시) 저장 불가** — 결과가 없으면 `NO_RESULT` sentinel을 던져 저장 자체를
 *    거부했다. 다른 6세목은 결과 전에도 draft로 저장하고, 계산 후 final로 승격한다
 *    (`saveOrUpdateByBusinessKey` + `deleteDraftsByInput`). 증여세만 입력 도중 이탈하면
 *    아무것도 남지 않았다.
 * 2. **이력 한도 경고 없음** — 190건 경고 라인(`HISTORY_WARNING_THRESHOLD`)이 공통
 *    `formatSaveMessage`에만 있어 증여세 토스트에는 붙지 않았다.
 *
 * 차별화는 다른 6세목과 같은 두 지점뿐이다 — `isFormEmpty`와 `getTaxLawVersion`.
 */

import {
  makeRunManualSave,
  formatSaveMessage,
  buildAutoSaveToast,
  useRecordCount,
  type ManualSaveOutcome,
} from "@/components/calc/shared/save-handler-builders";

interface GiftForm {
  giftDate?: string;
  giftItems?: unknown[];
  stockItems?: unknown[];
  [k: string]: unknown;
}

/**
 * 빈 폼 판정 — 증여일도 재산도 없으면 저장할 것이 없다.
 * (증여자·관계는 `INITIAL_FORM`에 기본값이 있어 «사용자가 넣은 값»의 근거가 못 된다.)
 */
export function isGiftFormEmpty(form: GiftForm): boolean {
  const noDate = !form.giftDate || form.giftDate === "";
  const noItems = !form.giftItems || form.giftItems.length === 0;
  const noStocks = !form.stockItems || form.stockItems.length === 0;
  return noDate && noItems && noStocks;
}

export const runGiftManualSave = makeRunManualSave<GiftForm>({
  taxType: "gift",
  isFormEmpty: isGiftFormEmpty,
  getTaxLawVersion: (form) => form.giftDate || "",
});

export { formatSaveMessage as formatGiftSaveMessage } from "@/components/calc/shared/save-handler-builders";
export { buildAutoSaveToast as buildGiftAutoSaveToast } from "@/components/calc/shared/save-handler-builders";
export { useRecordCount };
export type { ManualSaveOutcome };
