"use client";

import { useEffect, useRef, useState } from "react";
import { calculationRepository } from "./calculation-repository";
import { clientRepository } from "./client-repository";
import { generateTitle } from "./title-generator";
import type { LocalTaxType } from "./types";

const EDITING_KEY = "editingCalculationId";

interface Params {
  taxType: LocalTaxType;
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown> | null;
  taxLawVersion: string;
  clientId?: string | null;
}

interface Return {
  savedId: string | null;
  error: string | null;
}

/**
 * 결과 화면 마운트 시 계산 이력을 자동 저장하는 훅.
 *
 * - resultData가 null이면 저장 skip.
 * - sessionStorage에 "editingCalculationId"가 있으면 해당 레코드를 덮어쓰기(update).
 *   없으면 새 레코드 생성(save). 덮어쓰기 후 키 삭제.
 * - 동일 컴포넌트 생애 내 1회만 실행 (savedRef 플래그).
 */
export function useAutoSaveCalculation({
  taxType,
  inputData,
  resultData,
  taxLawVersion,
  clientId = null,
}: Params): Return {
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const savedRef = useRef(false);

  useEffect(() => {
    if (savedRef.current) return;
    if (!resultData) return;

    savedRef.current = true;

    const now = new Date().toISOString();
    const editingId = typeof window !== "undefined"
      ? sessionStorage.getItem(EDITING_KEY)
      : null;

    if (editingId) {
      // 수정 모드 — 기존 레코드 덮어쓰기
      const title = generateTitle(taxType, inputData, now);
      sessionStorage.removeItem(EDITING_KEY);
      calculationRepository
        .update(editingId, { taxType, title, inputData, resultData, taxLawVersion })
        .then(() => {
          setSavedId(editingId);
          if (clientId) clientRepository.touch(clientId);
        })
        .catch((err) => {
          savedRef.current = false;
          setError(err instanceof Error ? err.message : "저장 실패");
        });
    } else {
      // 신규 저장
      const title = generateTitle(taxType, inputData, now);
      calculationRepository
        .save({ taxType, title, inputData, resultData, taxLawVersion, linkedCalculationId: null, clientId })
        .then((id) => {
          setSavedId(id);
          if (clientId) clientRepository.touch(clientId);
        })
        .catch((err) => {
          savedRef.current = false;
          setError(err instanceof Error ? err.message : "저장 실패");
        });
    }
  }, [taxType, inputData, resultData, taxLawVersion, clientId]);

  return { savedId, error };
}
