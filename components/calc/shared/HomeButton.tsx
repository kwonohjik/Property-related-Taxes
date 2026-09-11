"use client";

/**
 * 세목 계산기 공통 "홈으로" 버튼
 *
 * 헤더의 ResetButton 좌측에 배치하여 홈("/")으로 이동.
 * 입력 도중 클릭 시 확인 다이얼로그로 우발적 이동 방지.
 *
 * ## 왜 `window.confirm` 에서 옮겼나 (2026-09-11)
 *
 * 호출부 11곳 중 **9곳은 「값이 유지된 채 페이지를 떠납니다」** — 데이터 손실이 아니므로
 * `feedback_dialog_data_discard_confirm` 의 문언 범위(「데이터 손실 위험 액션」) **밖**이다.
 * 그러나 나머지 **2곳**(`StockValuationTool`·`building-standard-price`)은 「값이 **사라집니다**」로
 * 명백히 범위 안이고, 그 둘만 고치려 해도 **모달 구현은 이 컴포넌트 한 곳**에 있다.
 * 공용 컴포넌트가 호출부에 따라 모달 기술을 바꿀 수는 없으므로 전부 `ConfirmDialog` 로 옮긴다.
 *
 * ⚠️ `destructive` 는 쓰지 않는다 — 대다수 호출부에서 이 동작은 **파괴적이지 않다**(값 유지).
 *    rose 강조는 실제 폐기 액션(`ResetButton`·`RestartFromScratchButton`) 전용이다.
 */

import { useState } from "react";
import { Home } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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
  /**
   * pill(기본) — 이미지7 표준 pill(rounded-full). 헤더·breadcrumb용.
   * block — 전체폭 rounded-lg 버튼. flex-1 레이아웃(결과·에러 화면)에서 className으로 flex-1 전달.
   */
  variant?: "pill" | "block";
}

export function HomeButton({
  confirmMessage,
  label = "홈으로",
  className = "",
  onBeforeNavigate,
  variant = "pill",
}: HomeButtonProps) {
  const router = useRouter();
  // 🔑 hook 은 `confirmMessage` 분기 **앞**에서 부른다 — 분기 안에 두면 호출 순서가 흔들린다.
  const [confirmOpen, setConfirmOpen] = useState(false);

  const baseClass =
    (variant === "block"
      ? "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring "
      : "inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ") +
    className;

  const iconClass = variant === "block" ? "h-4 w-4" : "h-3.5 w-3.5";

  if (confirmMessage) {
    return (
      <>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className={baseClass}
          aria-label="홈으로 이동"
        >
          <Home className={iconClass} />
          {label}
        </button>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="홈으로 이동할까요?"
          description={confirmMessage}
          confirmLabel="홈으로 이동"
          onConfirm={() => {
            onBeforeNavigate?.();
            router.push("/");
          }}
        />
      </>
    );
  }

  return (
    <Link
      href="/"
      onClick={() => onBeforeNavigate?.()}
      className={baseClass}
      aria-label="홈으로 이동"
    >
      <Home className={iconClass} />
      {label}
    </Link>
  );
}
