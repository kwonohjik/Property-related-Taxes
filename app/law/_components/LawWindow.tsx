"use client";

import type React from "react";
import { useLawWindowStore, type LawWindow as LawWindowModel } from "@/lib/stores/law-window-store";
import { LawArticleContent } from "./LawArticleContent";
import { useDragResize } from "./useDragResize";

/**
 * 개별 플로팅 조문 창 — 헤더 드래그 이동·우하단 리사이즈·클릭 시 맨 앞·제자리 접기·닫기.
 * 백드롭 없음(페이지 인터랙티브 유지). 닫을 때까지 항상 위(z-index 스토어 관리).
 *
 * a11y: role="dialog" aria-modal="false"(비모달) — 기존 law E2E의 getByRole("dialog") 호환.
 * ESC=최상단 창 닫기는 LawWindowLayer가 전역 1회 처리(창마다 중복 리스너 방지).
 *
 * 모바일(mobile=true): 자유 플로팅 대신 전체폭 바텀시트, 드래그/리사이즈 비활성.
 * 설계 Ref: docs/01-plan/features/law-floating-windows.plan.md §2.3 FR-3
 */
export function LawWindow({ win, mobile = false }: { win: LawWindowModel; mobile?: boolean }) {
  const focus = useLawWindowStore((s) => s.focus);
  const close = useLawWindowStore((s) => s.close);
  const move = useLawWindowStore((s) => s.move);
  const resize = useLawWindowStore((s) => s.resize);
  const toggleMinimize = useLawWindowStore((s) => s.toggleMinimize);

  const { startDrag, startResize } = useDragResize(
    { x: win.x, y: win.y, w: win.w, h: win.h },
    (x, y) => move(win.id, x, y),
    (w, h) => resize(win.id, w, h),
  );

  const style: React.CSSProperties = mobile
    ? { zIndex: win.z }
    : {
        left: win.x,
        top: win.y,
        width: win.w,
        height: win.minimized ? undefined : win.h,
        zIndex: win.z,
      };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={`${win.lawName} ${win.articleNo}`}
      className={
        mobile
          ? "fixed inset-x-0 bottom-0 flex max-h-[82vh] flex-col rounded-t-xl border bg-background shadow-2xl"
          : "fixed flex flex-col overflow-hidden rounded-lg border bg-background shadow-2xl"
      }
      style={style}
      onPointerDown={() => focus(win.id)}
    >
      {/* 헤더(드래그 핸들) */}
      <div
        onPointerDown={mobile ? undefined : startDrag}
        className={
          "flex shrink-0 select-none items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2 " +
          (mobile ? "" : "cursor-move")
        }
      >
        <h3 className="truncate text-sm font-semibold" title={`${win.lawName} ${win.articleNo}`}>
          {win.lawName} {win.articleNo}
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={win.minimized ? "펼치기" : "접기"}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => toggleMinimize(win.id)}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {win.minimized ? "▢" : "▁"}
          </button>
          <button
            type="button"
            aria-label="닫기"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => close(win.id)}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 본문 — 최소화 시 숨김(제자리 접기) */}
      {!win.minimized && (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <LawArticleContent
            lawName={win.lawName}
            articleNo={win.articleNo}
            autoImpact={win.autoImpact}
          />
        </div>
      )}

      {/* 리사이즈 핸들(우하단) — 데스크톱 전용 */}
      {!mobile && !win.minimized && (
        <div
          aria-hidden
          onPointerDown={(e) => {
            focus(win.id);
            startResize(e);
          }}
          className="absolute bottom-0.5 right-0.5 h-3 w-3 cursor-se-resize border-b-2 border-r-2 border-muted-foreground/40"
        />
      )}
    </div>
  );
}
