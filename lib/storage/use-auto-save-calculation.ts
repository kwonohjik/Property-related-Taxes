"use client";

import { useEffect, useRef, useState } from "react";
import { calculationRepository } from "./calculation-repository";
import { clientRepository } from "./client-repository";
import { generateTitle } from "./title-generator";
import type { LocalTaxType } from "./types";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

interface Params {
  taxType: LocalTaxType;
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown> | null;
  taxLawVersion: string;
  clientId?: string | null;
}

interface Return {
  /** 저장된 record ID (자동저장 성공 시) */
  savedId: string | null;
  /** 이번 저장이 신규 record(true)였는지 갱신(false)이었는지 */
  created: boolean | null;
  status: AutoSaveStatus;
  error: string | null;
  /** v4 draft 자동 승격 — final 저장 직전 삭제한 draft 수 (별도 작업자 구현 대기) */
  promotedDraftCount?: number;
}

/**
 * 결과 화면 마운트 시 계산 이력을 자동 저장하는 훅 (v2 — contentHash dedup).
 *
 * - resultData가 null/empty이면 저장 skip (미계산 상태 §2.4).
 * - 동일 입력+결과+의뢰인 조합은 항상 단일 record 1건 유지 (saveOrUpdateByContent).
 * - 같은 컴포넌트 생애 내 같은 resultData 객체 참조의 중복 실행은 차단.
 * - 호출자(결과 화면)는 `status`를 보고 토스트 노출 여부 결정.
 *
 * Breaking change vs v1:
 * - `pendingEditId`·`saveAsUpdate`·`saveAsNew` 제거 (`editingCalculationId` sessionStorage 플래그 폐기)
 * - history "수정"은 prefill만 수행 — 동일 contentHash면 자동 갱신, 다르면 신규
 */
export function useAutoSaveCalculation({
  taxType,
  inputData,
  resultData,
  taxLawVersion,
  clientId = null,
}: Params): Return {
  const [savedId, setSavedId] = useState<string | null>(null);
  const [created, setCreated] = useState<boolean | null>(null);
  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const lastSavedResultRef = useRef<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!resultData) return;
    // 빈 객체({})는 미계산으로 간주 → skip
    if (Object.keys(resultData).length === 0) return;
    if (lastSavedResultRef.current === resultData) return;

    const target = resultData;
    lastSavedResultRef.current = target;
    // 외부 시스템(IndexedDB) 동기화용 — set-state-in-effect 의도된 사용
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus("saving");
     
    setError(null);

    const now = new Date().toISOString();
    const title = generateTitle(taxType, inputData, now);
    calculationRepository
      .saveOrUpdateByBusinessKey({
        taxType,
        title,
        inputData,
        resultData: target,
        taxLawVersion,
        linkedCalculationId: null,
        clientId: clientId ?? null,
      })
      .then(({ id, created: c }) => {
        setSavedId(id);
        setCreated(c);
        setStatus("saved");
        if (clientId) clientRepository.touch(clientId);
      })
      .catch((err) => {
        if (lastSavedResultRef.current === target) lastSavedResultRef.current = null;
        setStatus("error");
        setError(err instanceof Error ? err.message : "저장 실패");
      });
  }, [taxType, inputData, resultData, taxLawVersion, clientId]);

  return { savedId, created, status, error };
}
