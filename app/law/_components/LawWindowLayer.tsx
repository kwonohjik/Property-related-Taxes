"use client";

import { useEffect, useState } from "react";
import { HorizontalScrollContainer } from "@/components/calc/shared/HorizontalScrollContainer";
import { useLawWindowStore } from "@/lib/stores/law-window-store";
import { LawWindow } from "./LawWindow";

/** 모바일(<sm) 여부 — 마운트 후 보정(SSR=데스크톱 가정, /law는 비크리티컬 hydration). */
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

/**
 * 열린 조문 창 전체를 렌더하는 레이어 + 관리 도크 + 모바일 폴백 + ESC 전역 처리.
 * LawResearchClient에 1회 마운트(zustand 전역이라 Provider 불필요).
 *
 * - 데스크톱(>=sm): 모든 창을 플로팅. 하단 중앙 도크(개수 + 모두 닫기).
 * - 모바일(<sm): 최상단(z 최대) 창 1개만 전체폭 바텀시트. 2개 이상이면 상단 창 전환 탭 스트립.
 * - ESC: 최상단 창 닫기(창마다 중복 리스너 방지 — 레이어에서 1회).
 *
 * 설계 Ref: docs/01-plan/features/law-floating-windows.plan.md §2.5, §2.6 FR-5
 */
export function LawWindowLayer() {
  const windows = useLawWindowStore((s) => s.windows);
  const closeAll = useLawWindowStore((s) => s.closeAll);
  const close = useLawWindowStore((s) => s.close);
  const focus = useLawWindowStore((s) => s.focus);
  const mobile = useIsMobile();

  // ESC → 최상단(z 최대) 창 닫기.
  useEffect(() => {
    if (windows.length === 0) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const top = windows.reduce((a, b) => (b.z > a.z ? b : a));
      close(top.id);
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [windows, close]);

  if (windows.length === 0) return null;

  const topWin = windows.reduce((a, b) => (b.z > a.z ? b : a));

  if (mobile) {
    return (
      <>
        {windows.length > 1 && (
          <div className="fixed inset-x-0 top-0 z-[9999] border-b bg-background/95 px-2 py-1.5 shadow-sm backdrop-blur">
            <HorizontalScrollContainer>
              <div className="flex items-center gap-1.5">
                {windows.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => focus(w.id)}
                    className={
                      "shrink-0 rounded-full border px-2.5 py-1 text-xs transition " +
                      (w.id === topWin.id
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-muted bg-muted/30 text-muted-foreground")
                    }
                  >
                    {w.lawName} {w.articleNo}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={closeAll}
                  className="shrink-0 rounded-full border border-rose-300 px-2.5 py-1 text-xs text-rose-700 dark:border-rose-900/40 dark:text-rose-300"
                >
                  모두 닫기
                </button>
              </div>
            </HorizontalScrollContainer>
          </div>
        )}
        <LawWindow win={topWin} mobile />
      </>
    );
  }

  return (
    <>
      {windows.map((w) => (
        <LawWindow key={w.id} win={w} />
      ))}
      <div className="fixed bottom-3 left-1/2 z-[9999] flex -translate-x-1/2 items-center gap-3 rounded-full border bg-background/95 px-4 py-1.5 text-xs shadow-lg backdrop-blur">
        <span className="text-muted-foreground">조문 창 {windows.length}개</span>
        <button
          type="button"
          onClick={closeAll}
          className="rounded-full px-2 py-0.5 font-medium text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-900/20"
        >
          모두 닫기
        </button>
      </div>
    </>
  );
}
