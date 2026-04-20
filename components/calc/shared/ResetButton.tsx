"use client";

/**
 * 세목 계산기 공통 초기화 버튼
 *
 * 첫 페이지(Step 1)에 배치하여 사용자 입력 전부를 초기값으로 되돌린다.
 * confirm() 다이얼로그로 우발적 클릭을 방지한다.
 *
 * 사용 예:
 *   <ResetButton onReset={() => { reset(); setResult(null); setError(null); }} />
 */

import { RotateCcw } from "lucide-react";

interface ResetButtonProps {
  onReset: () => void;
  /** 다이얼로그 문구 커스터마이즈 (기본: 현재 입력값을 모두 삭제합니다.) */
  confirmMessage?: string;
  /** 버튼 라벨 (기본: "초기화") */
  label?: string;
  /** 추가 className */
  className?: string;
}

export function ResetButton({
  onReset,
  confirmMessage = "지금까지 입력한 모든 값을 삭제하고 처음부터 다시 시작합니다.\n계속하시겠습니까?",
  label = "초기화",
  className = "",
}: ResetButtonProps) {
  function handleClick() {
    if (typeof window !== "undefined" && window.confirm(confirmMessage)) {
      onReset();
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
        className
      }
      aria-label="입력값 초기화"
    >
      <RotateCcw className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
