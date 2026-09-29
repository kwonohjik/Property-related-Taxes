"use client";

/**
 * **어느 주택인지 지정되지 않은** 옛 조특법 주택 수 제외 선언 안내 — 판정 메뉴 ③ · 계산기 ② 공용.
 *
 * 입력의 정본은 명부 행 ⑥(`HouseEntry.countExclusion`)이다. 옛 선언은 명부와 무관하게 1채를 빼 주므로
 * 명부에 없는 주택을 빼는 과소과세가 남는다 ⇒ 각 화면의 ⑧이 다시 계산할 때 막는다.
 *
 * 🔑 「기존 선언 삭제」가 차단을 푸는 **유일한 경로**다. 없으면 입력 칸 없는 영구 차단이 된다.
 * 🔑 자동으로 행에 옮기지 않는다 — 어느 행인지 모르는 선언을 틀린 행에 붙이면 안 된다.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ToneCard } from "@/components/calc/shared/ToneCard";

type Props = {
  /** 선언 한 줄씩 — 「조문 — 취득일」 */
  lines: string[];
  onClear: () => void;
  /** 이 선언을 쓰지 않는 단계 이름 — 「판정」·「계산」 */
  actionLabel: string;
};

export function CountExclusionLegacyNotice({ lines, onClear, actionLabel }: Props) {
  const [open, setOpen] = useState(false);
  if (lines.length === 0) return null;

  // 🔑 testid는 바깥 div에 — `ToneCard`는 `data-testid`를 전달하지 않는다.
  return (
    <div data-testid="one-house-legacy-count-exclusion">
      <ToneCard tone="amber" title="어느 주택인지 지정되지 않은 주택 수 제외 선언">
        <ul className="list-disc pl-5 text-xs">
          {lines.map((l, i) => (
            <li key={`${i}-${l}`}>{l}</li>
          ))}
        </ul>
        <p className="text-xs leading-relaxed">
          이 선언은 <b>{actionLabel}에 쓰지 않습니다</b>. 보유 주택 목록에서 해당 주택의 <b>「편집」 → ⑥ 주택 수
          제외(조특법)</b>로 지정한 뒤 아래 버튼으로 기존 선언을 삭제하세요. 지정하지 않은 채 두면 {actionLabel}할 수
          없습니다.
        </p>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => setOpen(true)}
          data-testid="one-house-legacy-count-exclusion-clear"
        >
          기존 선언 삭제
        </Button>
      </ToneCard>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="기존 주택 수 제외 선언을 삭제할까요?"
        description="삭제한 선언은 되돌릴 수 없습니다. 명부 행에 지정하지 않았다면 먼저 지정하세요."
        confirmLabel="삭제"
        destructive
        onConfirm={onClear}
      />
    </div>
  );
}
