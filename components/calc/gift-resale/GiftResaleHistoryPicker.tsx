"use client";

/**
 * 결정세액 칸 아래에 붙는 «이력에서 불러오기» 런처 + 모달 + 출처 배지 (P4)
 *
 * 출처(`source`)는 화면 로컬 state다 — 칸 값을 직접 고치면 부모(`GiftResaleClient.patch`)가 지운다(onChange 핸들러 — effect 아님).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GiftResaleHistoryModal } from "./GiftResaleHistoryModal";
import type { GiftResaleHistoryField, GiftResaleHistoryProps } from "./shared";

export function GiftResaleHistoryPicker({
  field,
  modalTitle,
  testIdPrefix,
  historySources,
  onPickHistory,
}: GiftResaleHistoryProps & { field: GiftResaleHistoryField; modalTitle: string; testIdPrefix: string }) {
  const [open, setOpen] = useState(false);
  const source = historySources[field];
  return (
    <div className="mt-2 space-y-1">
      <Button
        type="button"
        size="sm"
        variant="modalLauncher"
        onClick={() => setOpen(true)}
        data-testid={`${testIdPrefix}-history-launch`}
      >
        이력에서 불러오기
      </Button>
      {source && (
        <p className="text-caption text-muted-foreground" data-testid={`${testIdPrefix}-history-badge`}>
          이력에서 불러옴: {source.title}
        </p>
      )}
      <GiftResaleHistoryModal
        open={open}
        onOpenChange={setOpen}
        title={modalTitle}
        onSelect={(c) => {
          onPickHistory(field, { id: c.record.id, title: c.record.title }, c.determinedTax);
          setOpen(false);
        }}
      />
    </div>
  );
}
