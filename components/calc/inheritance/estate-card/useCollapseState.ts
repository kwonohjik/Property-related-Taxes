"use client";

/**
 * useCollapseState — 자산 카드 collapse 상태 (localStorage per item)
 *
 * Plan estate-card-followup §FU-3 · Design §5.2 · Q3-1=(b) localStorage
 *
 * 정책 [D6 SSR rehydration]:
 *   - 서버/hydration 1회: 항상 false (collapse OFF)
 *   - 클라이언트 hydration 후 useEffect 1회만 localStorage 읽기 → 미스매치 0
 *   - useEffect → store 미러링 금지 정책의 예외 (one-time read, store 아님)
 *
 * 정책 [useEffect 미러링 회피]:
 *   - setCollapsed 호출 시 localStorage 즉시 동기 갱신 (콜백 안, useEffect 아님)
 */

import { useCallback, useEffect, useState } from "react";

export function useCollapseState(
  itemId: string,
): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const key = `estate-card-collapsed-${itemId}`;
  const [collapsed, setCollapsedState] = useState<boolean>(false); // SSR/hydration: 항상 false

  // 클라이언트 hydration 후 1회만 localStorage 읽기.
  // microtask 지연으로 cascading render lint 회피 (queueMicrotask).
  useEffect(() => {
    if (typeof window === "undefined") return;
    queueMicrotask(() => {
      try {
        const stored = localStorage.getItem(key);
        if (stored === "true") setCollapsedState(true);
      } catch {
        /* silent */
      }
    });
  }, [key]);

  const setCollapsed = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      setCollapsedState((prev) => {
        const next = typeof v === "function" ? v(prev) : v;
        try {
          if (typeof window !== "undefined") {
            localStorage.setItem(key, String(next));
          }
        } catch {
          /* silent */
        }
        return next;
      });
    },
    [key],
  );

  return [collapsed, setCollapsed];
}
