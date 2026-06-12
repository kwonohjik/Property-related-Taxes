"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { clampToViewport, MIN_W, MIN_H } from "@/lib/stores/law-window-store";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 플로팅 창 드래그 이동 / 우하단 리사이즈 — 포인터 이벤트 직접 구현(외부 라이브러리 없음).
 *
 * - window 리스너 방식: 빠른 이동·포인터가 창 밖으로 나가도 끊김 없이 추적, pointerup에서 정리.
 * - 이동: clampToViewport(스토어 순수 헬퍼)로 뷰포트 밖 완전 이탈 방지(헤더 최소 노출).
 * - 리사이즈: MIN_W/MIN_H 하한 + 뷰포트 우/하단 상한 clamp.
 * - 드래그 중 본문 텍스트 선택 방지(user-select: none).
 *
 * 설계 Ref: docs/01-plan/features/law-floating-windows.plan.md §2.4 FR-4
 */
export function useDragResize(
  rect: Rect,
  onMove: (x: number, y: number) => void,
  onResize: (w: number, h: number) => void,
) {
  const [active, setActive] = useState(false);
  // 드래그 시작 시점의 rect를 캡처하기 위해 최신 props를 ref로 유지(클로저 신선도).
  // render 중 ref 갱신 금지(react-hooks/refs) → effect로 동기화.
  const rectRef = useRef(rect);
  useEffect(() => {
    rectRef.current = rect;
    // 원시값 deps 의도(rect는 매 렌더 새 객체) — ref 동기화만 수행.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect.x, rect.y, rect.w, rect.h]);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      // 버튼(최소화·닫기)에서 시작한 드래그는 호스트가 막음 — 여기서는 헤더 기준.
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const { x: ox, y: oy, w, h } = rectRef.current;
      setActive(true);
      document.body.style.userSelect = "none";

      function onPointerMove(ev: PointerEvent) {
        const c = clampToViewport(
          ox + (ev.clientX - startX),
          oy + (ev.clientY - startY),
          w,
          h,
          window.innerWidth,
          window.innerHeight,
        );
        onMove(c.x, c.y);
      }
      function onPointerUp() {
        setActive(false);
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      }
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [onMove],
  );

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation(); // 모서리 핸들은 포커스/드래그와 분리
      const startX = e.clientX;
      const startY = e.clientY;
      const { x, y, w: ow, h: oh } = rectRef.current;
      setActive(true);
      document.body.style.userSelect = "none";

      function onPointerMove(ev: PointerEvent) {
        const maxW = window.innerWidth - x;
        const maxH = window.innerHeight - y;
        const nw = Math.min(Math.max(ow + (ev.clientX - startX), MIN_W), maxW);
        const nh = Math.min(Math.max(oh + (ev.clientY - startY), MIN_H), maxH);
        onResize(nw, nh);
      }
      function onPointerUp() {
        setActive(false);
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      }
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [onResize],
  );

  return { startDrag, startResize, active };
}
