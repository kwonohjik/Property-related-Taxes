"use client";

/**
 * HorizontalScrollContainer — 가로 스크롤바 항상 표시 공용 컨테이너
 *
 * 배경: macOS 시스템 설정 "스크롤 막대 표시: 자동/스크롤할 때"에서는
 * 네이티브 스크롤바가 사용자에게 보이지 않아 우측 콘텐츠 인지 실패 발생.
 *
 * 해결: 네이티브 가로 스크롤바를 `.no-native-scrollbar`로 완전 숨김 +
 * JS로 가짜 thumb/track div를 항상 렌더. OS 정책과 100% 무관.
 *
 * 보조 신호:
 * - 좌·우 화살표 버튼 (스크롤 가능 방향만 노출)
 * - 우측 fade gradient (콘텐츠가 더 있음을 시각 신호)
 * - 상단 안내 텍스트 (기본 "← → 좌우 스크롤")
 *
 * 인쇄 시: 모든 보조 UI는 `print:hidden`, 스크롤 컨테이너는 `print:overflow-visible`.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface HorizontalScrollContainerProps {
  children: ReactNode;
  /** 우측 fade gradient 시작 색상 (기본 흰색) — 부모 배경에 맞춤 */
  fadeColor?: string;
  /** 상단 안내 텍스트. null로 명시하면 숨김 */
  hint?: string | null;
  /** 추가 클래스 */
  className?: string;
  /** 스크롤 컨테이너 내부 padding (기본 p-4) */
  contentPadding?: string;
}

const STEP_PX = 320;

export function HorizontalScrollContainer({
  children,
  fadeColor = "#ffffff",
  hint = "← → 좌우 스크롤",
  className = "",
  contentPadding = "p-4",
}: HorizontalScrollContainerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [thumbLeftPct, setThumbLeftPct] = useState(0);
  const [thumbWidthPct, setThumbWidthPct] = useState(100);

  const syncThumb = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const maxScroll = scrollWidth - clientWidth;
    setCanScrollLeft(scrollLeft > 2);
    setCanScrollRight(scrollLeft < maxScroll - 2);
    if (scrollWidth > 0 && clientWidth > 0) {
      const wPct = Math.min(100, Math.max(8, (clientWidth / scrollWidth) * 100));
      setThumbWidthPct(wPct);
      const lPct =
        maxScroll > 0
          ? Math.min(100 - wPct, (scrollLeft / scrollWidth) * 100)
          : 0;
      setThumbLeftPct(lPct);
    } else {
      setThumbWidthPct(100);
      setThumbLeftPct(0);
    }
  }, []);

  // 초기 측정 + ResizeObserver
  useEffect(() => {
    syncThumb();
    const el = scrollRef.current;
    if (!el) return;
    // RAF로 layout 안정 후 재측정
    const raf = requestAnimationFrame(syncThumb);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => syncThumb());
      ro.observe(el);
      Array.from(el.children).forEach((c) => ro!.observe(c as Element));
    }
    const onResize = () => syncThumb();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [syncThumb]);

  const scrollByDelta = useCallback((delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  }, []);

  const onTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // thumb 자체 클릭 시 드래그 핸들러 사용 → 점프 금지
    if (e.target === thumbRef.current) return;
    const track = trackRef.current;
    const scroll = scrollRef.current;
    if (!track || !scroll) return;
    const rect = track.getBoundingClientRect();
    const clickRatio = (e.clientX - rect.left) / rect.width;
    const target = clickRatio * scroll.scrollWidth - scroll.clientWidth / 2;
    scroll.scrollTo({ left: target, behavior: "smooth" });
  }, []);

  const onThumbPointerDown = useCallback(
    (clientXStart: number, kind: "mouse" | "touch") => {
      const scroll = scrollRef.current;
      const track = trackRef.current;
      if (!scroll || !track) return;
      const startScrollLeft = scroll.scrollLeft;
      const trackWidth = track.getBoundingClientRect().width;
      const ratio = scroll.scrollWidth / Math.max(1, trackWidth);

      if (kind === "mouse") {
        const onMove = (ev: MouseEvent) => {
          scroll.scrollLeft =
            startScrollLeft + (ev.clientX - clientXStart) * ratio;
        };
        const onUp = () => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      } else {
        const onMove = (ev: TouchEvent) => {
          if (!ev.touches[0]) return;
          scroll.scrollLeft =
            startScrollLeft + (ev.touches[0].clientX - clientXStart) * ratio;
        };
        const onEnd = () => {
          document.removeEventListener("touchmove", onMove);
          document.removeEventListener("touchend", onEnd);
          document.removeEventListener("touchcancel", onEnd);
        };
        document.addEventListener("touchmove", onMove, { passive: true });
        document.addEventListener("touchend", onEnd);
        document.addEventListener("touchcancel", onEnd);
      }
    },
    [],
  );

  return (
    <div className={`relative ${className}`} data-testid="hsc-root">
      {hint && (
        <p className="px-4 pt-2 text-micro text-gray-500 text-right print:hidden">
          {hint}
        </p>
      )}

      {/* 좌측 화살표 */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByDelta(-STEP_PX)}
          aria-label="좌로 스크롤"
          data-testid="hsc-arrow-left"
          className="absolute left-1 top-1/2 -translate-y-1/2 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 bg-white/95 text-gray-700 shadow hover:bg-white hover:text-gray-900 dark:border-gray-600 dark:bg-gray-800/95 dark:text-gray-200 print:hidden"
        >
          ←
        </button>
      )}

      {/* 우측 화살표 */}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByDelta(STEP_PX)}
          aria-label="우로 스크롤"
          data-testid="hsc-arrow-right"
          className="absolute right-1 top-1/2 -translate-y-1/2 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 bg-white/95 text-gray-700 shadow hover:bg-white hover:text-gray-900 dark:border-gray-600 dark:bg-gray-800/95 dark:text-gray-200 print:hidden"
        >
          →
        </button>
      )}

      {/* 우측 fade gradient (스크롤 가능 시) */}
      {canScrollRight && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-0 bottom-8 z-10 w-6 print:hidden"
          style={{
            background: `linear-gradient(to left, ${fadeColor}, transparent)`,
          }}
        />
      )}

      {/* 실제 스크롤 컨테이너 — 네이티브 스크롤바 완전 숨김 */}
      <div
        ref={scrollRef}
        tabIndex={0}
        onScroll={syncThumb}
        data-testid="hsc-scroll"
        className={`no-native-scrollbar overflow-x-auto overflow-y-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 print:overflow-visible ${contentPadding}`}
      >
        {children}
      </div>

      {/* JS 가짜 스크롤바 — 항상 표시 */}
      <div className="px-3 pb-2 print:hidden" data-testid="hsc-fake-scrollbar">
        <div
          ref={trackRef}
          onClick={onTrackClick}
          role="presentation"
          aria-hidden="true"
          className="relative h-3 cursor-pointer rounded-full bg-gray-200 dark:bg-gray-700"
        >
          <div
            ref={thumbRef}
            onMouseDown={(e) => {
              e.preventDefault();
              onThumbPointerDown(e.clientX, "mouse");
            }}
            onTouchStart={(e) => {
              if (!e.touches[0]) return;
              onThumbPointerDown(e.touches[0].clientX, "touch");
            }}
            data-testid="hsc-thumb"
            className="absolute top-0 h-3 cursor-grab rounded-full bg-gray-500 transition-colors hover:bg-gray-700 active:cursor-grabbing dark:bg-gray-400 dark:hover:bg-gray-200"
            style={{
              left: `${thumbLeftPct}%`,
              width: `${thumbWidthPct}%`,
              touchAction: "none",
            }}
          />
        </div>
      </div>
    </div>
  );
}
