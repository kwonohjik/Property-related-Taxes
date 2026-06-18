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
  /**
   * 홈 이동 직전 콜백 (확인 통과 후). 메모리 상태 정리용 —
   * zustand 스토어는 클라이언트 내비게이션에서 유지되므로, 결과 화면 등에서
   * 재진입 시 stale 화면을 막으려면 여기서 step/result를 정리한다.
   */
  onBeforeNavigate?: () => void;
}

export function HomeButton({
  confirmMessage,
  label = "홈으로",
  className = "",
  onBeforeNavigate,
}: HomeButtonProps) {
  const router = useRouter();

  const baseClass =
    "inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
    className;

  if (confirmMessage) {
    function handleClick() {
      if (typeof window !== "undefined" && window.confirm(confirmMessage)) {
        onBeforeNavigate?.();
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
    <Link
      href="/"
      onClick={() => onBeforeNavigate?.()}
      className={baseClass}
      aria-label="홈으로 이동"
    >
      <Home className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}
