"use client";

/**
 * 세목 계산기 공통 "홈으로" 버튼
 *
 * 헤더의 ResetButton 좌측에 배치하여 홈("/")으로 이동.
 * 입력 도중 클릭 시 confirm() 다이얼로그로 우발적 이동 방지.
 */

import { Home } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface HomeButtonProps {
  /** 다이얼로그 문구 커스터마이즈. 미제공 시 다이얼로그 없이 즉시 이동 */
  confirmMessage?: string;
  /** 버튼 라벨 (기본: "홈으로") */
  label?: string;
  className?: string;
}

export function HomeButton({
  confirmMessage,
  label = "홈으로",
  className = "",
}: HomeButtonProps) {
  const router = useRouter();

  const baseClass =
    "inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
    className;

  if (confirmMessage) {
    function handleClick() {
      if (typeof window !== "undefined" && window.confirm(confirmMessage)) {
        router.push("/");
      }
    }
    return (
      <button type="button" onClick={handleClick} className={baseClass} aria-label="홈으로 이동">
        <Home className="h-3.5 w-3.5" />
        {label}
      </button>
    );
  }

  return (
    <Link href="/" className={baseClass} aria-label="홈으로 이동">
      <Home className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}
