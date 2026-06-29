"use client";

import { useEffect } from "react";

/**
 * 홈 카드의 `?new=1` 신호로 진입하면 마법사 상태를 초기화하는 훅.
 *
 * - 홈 카드 클릭(`/calc/...?new=1`) = 새 계산 → mount 시 1회 `onNew()` 호출(빈 폼).
 * - 작업 중 새로고침(param 없음) = 입력값 보존(reset 미발생).
 * - reset 후 `?new=1`을 URL에서 제거 → 새로고침·공유 시 재초기화 방지.
 *
 * 계획서: docs/00-pm/wizard-reset-on-home-entry.plan.md §4-2.
 * `useSearchParams`(Suspense 경계 요구) 대신 mount 후 `window.location.search` 직접 read.
 * mount 1회 명시적 초기화 — cross-field 미러링이 아니므로 무한루프 없음.
 */
export function useResetOnNewParam(onNew: () => void) {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("new") === "1"
    ) {
      onNew();
      window.history.replaceState(null, "", window.location.pathname);
    }
    // mount 1회만 — onNew는 호출 측에서 useCallback으로 안정화
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
