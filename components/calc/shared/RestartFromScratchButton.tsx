"use client";

/**
 * RestartFromScratchButton — 결과 화면의 「처음부터 새로」 (전체 입력 폐기).
 *
 * ## 왜 「다시 계산하기」와 분리했나 (2026-09-05 · 코드리뷰 Q25)
 *
 * 규약(`components/calc/CLAUDE.md:13`)은 결과 화면의 「다시 계산하기」를 **마지막 입력 단계
 * 복귀**로 정한다. 그런데 결과뷰가 그 라벨에 `onReset`(전체 초기화)을 달아 두어,
 * 「다시 계산」인 줄 알고 누른 사용자의 입력이 **확인 없이** 통째로 사라졌다.
 *
 * ⇒ 라벨과 동작을 1:1로 되돌린다 — 복귀는 「다시 계산하기」, 폐기는 이 버튼.
 *   폐기는 되돌릴 수 없으므로(sessionStorage까지 갱신) `ConfirmDialog`를 반드시 거친다
 *   (window.confirm 금지 — 메모리 `feedback_dialog_data_discard_confirm`).
 */

import { useState } from "react";
import { CtaButton } from "@/components/calc/shared/WizardNav";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface Props {
  onReset: () => void;
  /** 확인 다이얼로그 본문 — 화면에 따라 무엇이 지워지는지 다르면 덮어쓴다 */
  description?: string;
}

export function RestartFromScratchButton({
  onReset,
  description = "지금까지 입력한 값이 모두 삭제되고 빈 폼으로 돌아갑니다. 이 동작은 되돌릴 수 없습니다.",
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <CtaButton tone="outline" onClick={() => setOpen(true)}>
        처음부터 새로
      </CtaButton>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="입력값을 모두 삭제할까요?"
        description={description}
        confirmLabel="삭제하고 처음부터"
        destructive
        onConfirm={onReset}
      />
    </>
  );
}
