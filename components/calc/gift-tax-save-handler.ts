/**
 * GiftTaxForm 수동 저장 핸들러 (sibling module — 800줄 정책 분리)
 *
 * - `buildGiftManualSaveHandler`: 결과 유무에 따라 saveOrUpdateByContent 호출
 *   미계산 시 sentinel error("NO_RESULT") throw → 호출자가 info 토스트 분기
 * - `formatGiftSaveMessage`: 저장 결과/에러를 SaveToastMessage 로 매핑
 */

import { calculationRepository } from "@/lib/storage/calculation-repository";
import { generateTitle } from "@/lib/storage/title-generator";
import type { SaveToastMessage } from "@/components/calc/shared/SaveToast";
import type { GiftTaxResult } from "@/lib/tax-engine/types/inheritance-gift.types";

interface BuildArgs {
  /** 폼 상태 (직렬화 가능한 객체) */
  form: Record<string, unknown> & { giftDate?: string };
  result: GiftTaxResult | null;
  clientId: string | null;
}

export const NO_RESULT_SENTINEL = "NO_RESULT";

export async function runGiftManualSave({
  form,
  result,
  clientId,
}: BuildArgs): Promise<{ id: string; created: boolean }> {
  if (!result) {
    throw new Error(NO_RESULT_SENTINEL);
  }
  const now = new Date().toISOString();
  const inputData = form as Record<string, unknown>;
  const resultData = result as unknown as Record<string, unknown>;
  const taxLawVersion = form.giftDate || now.split("T")[0];
  const title = generateTitle("gift", inputData, now);

  return calculationRepository.saveOrUpdateByContent({
    taxType: "gift",
    title,
    inputData,
    resultData,
    taxLawVersion,
    linkedCalculationId: null,
    clientId,
  });
}

export function formatGiftSaveMessage(
  outcome: { id: string; created: boolean } | Error
): SaveToastMessage {
  if (outcome instanceof Error) {
    if (outcome.message === NO_RESULT_SENTINEL) {
      return {
        kind: "info",
        text: "결과를 먼저 계산하시면 자동으로 이력에 저장됩니다.",
      };
    }
    return {
      kind: "error",
      text: `저장 실패: ${outcome.message}`,
    };
  }
  return {
    kind: "success",
    text: outcome.created
      ? `새 이력으로 저장되었습니다. (ID: ${outcome.id.slice(0, 8)})`
      : `현재 시점 스냅샷으로 갱신되었습니다. (ID: ${outcome.id.slice(0, 8)})`,
  };
}
