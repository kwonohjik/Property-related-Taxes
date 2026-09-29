"use client";

/**
 * ③ 보유 주택 — **어느 주택인지 지정되지 않은** 옛 조특법 주택 수 제외 선언 안내 (계획서 Q-2(a))
 *
 * 종전 화면은 §99의4·§98의9를 `assets[0].reductions`에, 보유 감면주택을 `form.specialHouseExclusions`에
 * 세대 단위로 받았다. 이제 정본은 명부 행(`HouseEntry.countExclusion`)이고, 옛 선언은 ④가 보내지 않으며
 * ⑧이 다시 판정할 때 막는다 — 종전처럼 1채를 빼 주면 명부에 없는 주택을 빼는 과소과세(P6)가 남는다.
 *
 * 🔑 이 카드의 「기존 선언 삭제」가 차단을 푸는 **유일한 경로**다. 없으면 입력 칸 없는 영구 차단이 된다.
 * 🔑 자동으로 행에 옮기지 않는다 — 어느 행인지 모르는 선언을 틀린 행에 붙이면 안 된다(D-6와 같다).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { isHouseCountExclusionReduction } from "@/lib/calc/one-house-judgment-section-scope";
import { REDUCTION_TYPE_LABELS } from "@/lib/tax-engine/transfer-reduction-type-labels";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

type Props = {
  form: OneHouseJudgmentFormData;
  onChange: (patch: Partial<OneHouseJudgmentFormData>) => void;
};

export function LegacyCountExclusionNotice({ form, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const reductions = (form.assets?.[0]?.reductions ?? []).filter(isHouseCountExclusionReduction);
  const specials = (form.specialHouseExclusions ?? []).filter((e) => e.article);
  if (reductions.length + specials.length === 0) return null;

  const lines = [
    ...reductions.map((r) => {
      const date = r.type === "unsold_98_9" ? r.unsoldHouseAcquisitionDate : r.ruralHouseAcquisitionDate;
      return `${REDUCTION_TYPE_LABELS[r.type]} — 취득일 ${date || "미입력"}`;
    }),
    ...specials.map((e) => `조특법 감면주택 (${e.article}) — 취득일 ${e.houseAcquisitionDate || "미입력"}`),
  ];

  const clear = () =>
    onChange({
      assets: form.assets.map((a, i) =>
        i === 0 ? { ...a, reductions: (a.reductions ?? []).filter((r) => !isHouseCountExclusionReduction(r)) } : a,
      ),
      specialHouseExclusions: [],
    });

  return (
    <div data-testid="one-house-legacy-count-exclusion">
      <ToneCard tone="amber" title="어느 주택인지 지정되지 않은 주택 수 제외 선언">
        <ul className="list-disc pl-5 text-xs">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="text-xs leading-relaxed">
          이 선언은 <b>판정에 쓰지 않습니다</b>. 보유 주택 목록에서 해당 주택의 <b>「편집」 → ⑥ 주택 수
          제외(조특법)</b>로 지정한 뒤 아래 버튼으로 기존 선언을 삭제하세요. 지정하지 않은 채 두면 판정할 수
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
        onConfirm={clear}
      />
    </div>
  );
}
