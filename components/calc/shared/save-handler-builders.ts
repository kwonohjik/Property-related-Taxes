"use client";

/**
 * 6세목 공통 저장 헬퍼 (v4 §3 표준 통합).
 *
 * 세목별 `{tax}-save-handler.ts`는 이 모듈을 import하여
 * `isFormEmpty(form)` 헬퍼와 `taxLawVersion(form)` 도출만 차별화한다.
 *
 * 동일 동작 (세목 무관):
 * - draft/final 분기 호출
 * - 5분기 토스트 포맷팅
 * - 자동저장 토스트 변환 (승격 분기 포함)
 * - 190 경고 라인
 * - record count 추적 훅
 */

import { useEffect, useState } from "react";
import { calculationRepository } from "@/lib/storage/calculation-repository";
import { generateTitle } from "@/lib/storage/title-generator";
import {
  HISTORY_WARNING_THRESHOLD,
  MAX_CALCULATIONS_PER_USER,
  type LocalTaxType,
} from "@/lib/storage/types";
import type { SaveToastMessage } from "./SaveToast";

export const EMPTY_FORM_SENTINEL = "EMPTY_FORM";

export interface ManualSaveOutcome {
  id: string;
  created: boolean;
  isDraft: boolean;
}

interface BuildArgs<F> {
  form: F;
  result: unknown | null;
  clientId: string | null;
}

interface MakeArgs<F> {
  taxType: LocalTaxType;
  /** 본 form이 빈 폼인지 판정 — 세목별 §1.4 매트릭스 */
  isFormEmpty: (form: F) => boolean;
  /** form에서 taxLawVersion 문자열 도출 */
  getTaxLawVersion: (form: F) => string;
}

/**
 * 세목별 `runManualSave` 함수를 생성한다.
 * draft/final 분기 + draft→final 승격(deleteDraftsByInput) 처리.
 */
export function makeRunManualSave<F extends Record<string, unknown>>({
  taxType,
  isFormEmpty,
  getTaxLawVersion,
}: MakeArgs<F>) {
  return async function runManualSave({
    form,
    result,
    clientId,
  }: BuildArgs<F>): Promise<ManualSaveOutcome> {
    if (isFormEmpty(form)) {
      throw new Error(EMPTY_FORM_SENTINEL);
    }

    const now = new Date().toISOString();
    const inputData = form as Record<string, unknown>;
    const taxLawVersion = getTaxLawVersion(form) || now.split("T")[0];
    const title = generateTitle(taxType, inputData, now);

    // 비즈니스 키 dedup — 키 있으면(상속·양도 등) 같은 대상 1건 update,
    // 없으면(증여·종부) 내부에서 draft/content 폴백 + draft→final 승격(deleteDraftsByInput).
    if (!result) {
      const { id, created } = await calculationRepository.saveOrUpdateByBusinessKey({
        taxType,
        title,
        inputData,
        resultData: {},
        taxLawVersion,
        linkedCalculationId: null,
        clientId,
      });
      return { id, created, isDraft: true };
    }

    const { id, created } = await calculationRepository.saveOrUpdateByBusinessKey({
      taxType,
      title,
      inputData,
      resultData: result as Record<string, unknown>,
      taxLawVersion,
      linkedCalculationId: null,
      clientId,
    });
    return { id, created, isDraft: false };
  };
}

/** 5분기 수동저장 토스트 + 190 경고 라인 (세목 무관). */
export function formatSaveMessage(
  outcome: ManualSaveOutcome | Error,
  count?: number,
): SaveToastMessage {
  let msg: SaveToastMessage;

  if (outcome instanceof Error) {
    if (outcome.message === EMPTY_FORM_SENTINEL) {
      msg = {
        kind: "info",
        text: "저장할 입력이 없습니다.\n한 가지 이상 입력 후 저장해주세요. (기존 미결 이력은 보존됩니다)",
      };
    } else {
      msg = { kind: "error", text: `저장 실패: ${outcome.message}` };
    }
  } else if (outcome.isDraft) {
    msg = {
      kind: "info",
      text: outcome.created
        ? `📝 임시저장되었습니다 — '미결' 이력으로 등록 (ID: ${outcome.id.slice(0, 8)})`
        : `📝 미결 이력이 갱신되었습니다 (ID: ${outcome.id.slice(0, 8)})`,
    };
  } else {
    msg = {
      kind: "success",
      text: outcome.created
        ? `새 이력으로 저장되었습니다. (ID: ${outcome.id.slice(0, 8)})`
        : `현재 시점 스냅샷으로 갱신되었습니다. (ID: ${outcome.id.slice(0, 8)})`,
    };
  }

  if (count !== undefined && count >= HISTORY_WARNING_THRESHOLD) {
    msg.text += `\n⚠️ 저장 한도 ${count}/${MAX_CALCULATIONS_PER_USER}건 — 한도 도달 시 오래된 이력부터 자동 삭제됩니다.`;
  }
  return msg;
}

/** 자동저장 토스트 — 승격 분기 포함 (세목 무관). */
export function buildAutoSaveToast(args: {
  status: "idle" | "saving" | "saved" | "error";
  savedId: string | null;
  created: boolean | null;
  promotedDraftCount: number;
  count?: number;
}): SaveToastMessage | null {
  if (args.status === "saved" && args.savedId && args.created !== null) {
    const idShort = args.savedId.slice(0, 8);
    let text: string;
    if (args.promotedDraftCount > 0) {
      text = `✓ 미결 이력 ${args.promotedDraftCount}건이 최종 이력으로 승격되었습니다 (ID: ${idShort})`;
    } else if (args.created) {
      text = `✓ 이력에 자동 저장되었습니다 (ID: ${idShort})`;
    } else {
      text = `✓ 동일 입력의 기존 이력이 갱신되었습니다 (ID: ${idShort})`;
    }
    const msg: SaveToastMessage = { kind: "success", text };
    if (args.count !== undefined && args.count >= HISTORY_WARNING_THRESHOLD) {
      msg.text += `\n⚠️ 저장 한도 ${args.count}/${MAX_CALCULATIONS_PER_USER}건 — 한도 도달 시 오래된 이력부터 자동 삭제됩니다.`;
    }
    return msg;
  }
  if (args.status === "error") {
    return {
      kind: "error",
      text: "자동 저장 실패 — 우상단 저장하기 버튼으로 재시도하세요.",
    };
  }
  return null;
}

/** 사용자 record 총수 추적 — trigger 변경 시 재조회. */
export function useRecordCount(trigger: unknown): number | undefined {
  const [count, setCount] = useState<number | undefined>(undefined);
  useEffect(() => {
    calculationRepository.count().then(setCount).catch(() => undefined);
  }, [trigger]);
  return count;
}
