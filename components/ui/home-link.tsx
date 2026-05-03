"use client";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/**
 * 홈으로 이동 — 페이지 헤더 링크 스타일.
 * 마법사 하단 버튼은 별도 버튼 컴포넌트 사용.
 */
export function HomeLink({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={[
        "inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <ChevronLeft className="w-3.5 h-3.5" />
      홈으로
    </Link>
  );
}

/**
 * 홈으로 이동 — 마법사·결과 화면 하단 버튼 스타일.
 * Link이지만 버튼처럼 보임 (flex-1 레이아웃에 사용).
 */
export function HomeLinkButton({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={[
        "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-muted/40 transition-colors",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <ChevronLeft className="w-4 h-4" />
      홈으로
    </Link>
  );
}

/**
 * 홈으로 이동 — 마법사 하단 버튼 스타일 (onClick 기반, router.push("/")).
 * Link를 쓸 수 없는 onClick 핸들러 내부에서 사용.
 */
export function HomeLinkButtonAsButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-muted/40 transition-colors",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <ChevronLeft className="w-4 h-4" />
      홈으로
    </button>
  );
}
