"use client";

/**
 * GuideTableOfContents — 가이드 페이지 목차 사이드바 (T-10)
 *
 * - 데스크톱: sticky 사이드바로 표시
 * - 모바일: 접힘(details/summary) 처리
 * - IntersectionObserver로 현재 읽고 있는 섹션 하이라이트
 */

import { useEffect, useRef, useState } from "react";

export interface TocItem {
  id: string;
  label: string;
}

interface Props {
  items: TocItem[];
}

export function GuideTableOfContents({ items }: Props) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // 각 섹션의 가시성을 추적 — 화면 상단 20% 기준
    const targets = items
      .map((item) => document.getElementById(item.id))
      .filter(Boolean) as HTMLElement[];

    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        // 화면에 보이는 섹션 중 가장 위에 있는 것을 active로 설정
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "0px 0px -60% 0px", threshold: 0 },
    );

    targets.forEach((el) => observerRef.current!.observe(el));
    return () => observerRef.current?.disconnect();
  }, [items]);

  const handleClick = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      {/* ── 모바일: 접힘 처리 ── */}
      <details className="lg:hidden border rounded-lg bg-muted/40 mb-6">
        <summary className="px-4 py-3 text-sm font-semibold cursor-pointer select-none">
          목차 보기
        </summary>
        <nav className="px-4 pb-4 pt-1 space-y-1">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleClick(item.id)}
              className={`block w-full text-left text-sm py-1 px-2 rounded transition-colors ${
                activeId === item.id
                  ? "text-primary font-semibold bg-primary/10"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </details>

      {/* ── 데스크톱: sticky 사이드바 ── */}
      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-2">
            목차
          </p>
          <nav className="space-y-0.5">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleClick(item.id)}
                className={`block w-full text-left text-sm py-1.5 px-3 rounded-md transition-colors ${
                  activeId === item.id
                    ? "text-primary font-semibold bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </aside>
    </>
  );
}
