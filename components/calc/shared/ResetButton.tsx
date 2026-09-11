"use client";

/**
 * 세목 계산기 공통 초기화 버튼
 *
 * 첫 페이지(Step 1)에 배치하여 사용자 입력 전부를 초기값으로 되돌린다.
 *
 * ## `window.confirm` 을 쓰지 않는다 (2026-09-11)
 *
 * 규약(`components/calc/CLAUDE.md:14`)과 메모리 `feedback_dialog_data_discard_confirm` 은
 * **데이터 손실 위험 액션**에 native `confirm()` 을 금지한다 — Tailwind 토큰·다크모드·
 * focus-trap·키보드 Tab 순환을 전부 지원하지 않고, RTL·Playwright 에서도 별도 핸들러 없이는
 * 잡히지 않는다. 이 버튼은 **입력 전체를 지우므로** 정확히 그 범위에 있었는데,
 * 결과 화면 축(`RestartFromScratchButton`)만 2026-09-05 에 고쳐지고 여기는 남아 있었다.
 *
 * ⚠️ props 는 그대로 둔다 — 호출부 **8곳**(양도 단건·다건·상속·증여·취득·재산·종부·주식)을
 *    건드리지 않기 위해서다. 바뀐 것은 모달 구현뿐이다.
 */

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface ResetButtonProps {
  onReset: () => void;
  /** 다이얼로그 본문 커스터마이즈 */
  confirmMessage?: string;
  /** 버튼 라벨 (기본: "초기화") */
  label?: string;
  /** 추가 className */
  className?: string;
}

export function ResetButton({
  onReset,
  confirmMessage = "지금까지 입력한 값이 모두 삭제되고 빈 폼으로 돌아갑니다. 이 동작은 되돌릴 수 없습니다.",
  label = "초기화",
  className = "",
}: ResetButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          "inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
          className
        }
        aria-label="입력값 초기화"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        {label}
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="입력값을 모두 삭제할까요?"
        description={confirmMessage}
        confirmLabel="삭제하고 처음부터"
        destructive
        onConfirm={onReset}
      />
    </>
  );
}
