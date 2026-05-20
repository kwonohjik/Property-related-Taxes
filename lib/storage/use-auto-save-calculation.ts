"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  /**
   * 수정 모드 진입 시 원본 레코드 ID (sessionStorage 기반).
   * null이면 신규 계산 모드 (자동 저장).
   * non-null이면 사용자가 saveAsUpdate() / saveAsNew() 중 선택해야 함.
   */
  pendingEditId: string | null;
  /** 기존 레코드를 현재 결과로 덮어쓰기 */
  saveAsUpdate: () => void;
  /** 새 레코드로 저장 (수정 대기 상태 해제) */
  saveAsNew: () => void;
}

/**
 * 결과 화면 마운트 시 계산 이력을 자동 저장하는 훅.
 *
 * - resultData가 null이면 저장 skip.
 * - sessionStorage에 "editingCalculationId"가 없으면 신규 레코드 자동 저장.
 * - sessionStorage에 "editingCalculationId"가 있으면 자동 저장하지 않고
 *   pendingEditId를 반환. 호출자가 saveAsUpdate() 또는 saveAsNew()를 호출해야 함.
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
  // 마운트 시점에 sessionStorage를 1회 읽어 초기값 결정.
  // saveAsUpdate / saveAsNew에서만 명시적으로 null로 클리어.
  const [pendingEditId, setPendingEditId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(EDITING_KEY);
  });
  // 마지막으로 저장한 resultData 참조. boolean 락 대신 참조 비교로 변경(2026-05-20):
  // 같은 컴포넌트 생애 내 N회 계산이 모두 저장되도록 허용하면서, 같은 result로 useEffect가
  // 재실행(form 변경 등)되어도 중복 저장은 차단. setResult(data.result)는 매번 JSON.parse로
  // 생성된 새 객체이므로 참조 비교만으로 충분.
  const lastSavedResultRef = useRef<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!resultData) return;
    // 수정 모드는 자동 저장 skip — 사용자가 saveAsUpdate / saveAsNew 선택해야 함
    if (pendingEditId) return;
    if (lastSavedResultRef.current === resultData) return;

    const target = resultData;
    lastSavedResultRef.current = target;

    const now = new Date().toISOString();
    const title = generateTitle(taxType, inputData, now);
    calculationRepository
      .save({ taxType, title, inputData, resultData: target, taxLawVersion, linkedCalculationId: null, clientId })
      .then((id) => {
        setSavedId(id);
        if (clientId) clientRepository.touch(clientId);
      })
      .catch((err) => {
        // 실패 롤백 — target이 아직 최신일 때만 (race-safe)
        if (lastSavedResultRef.current === target) lastSavedResultRef.current = null;
        setError(err instanceof Error ? err.message : "저장 실패");
      });
  }, [taxType, inputData, resultData, taxLawVersion, clientId, pendingEditId]);

  const saveAsUpdate = useCallback(() => {
    if (!pendingEditId || !resultData) return;
    const now = new Date().toISOString();
    const title = generateTitle(taxType, inputData, now);
    sessionStorage.removeItem(EDITING_KEY);
    calculationRepository
      .update(pendingEditId, { taxType, title, inputData, resultData, taxLawVersion })
      .then(() => {
        setSavedId(pendingEditId);
        setPendingEditId(null);
        if (clientId) clientRepository.touch(clientId);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "저장 실패"));
  }, [pendingEditId, resultData, taxType, inputData, taxLawVersion, clientId]);

  const saveAsNew = useCallback(() => {
    if (!resultData) return;
    const now = new Date().toISOString();
    const title = generateTitle(taxType, inputData, now);
    sessionStorage.removeItem(EDITING_KEY);
    calculationRepository
      .save({ taxType, title, inputData, resultData, taxLawVersion, linkedCalculationId: null, clientId })
      .then((id) => {
        setSavedId(id);
        setPendingEditId(null);
        if (clientId) clientRepository.touch(clientId);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "저장 실패"));
  }, [resultData, taxType, inputData, taxLawVersion, clientId]);

  return { savedId, error, pendingEditId, saveAsUpdate, saveAsNew };
}
