"use client";

/**
 * ① 추징 사유 — 시행령 §10③ 추징하지 않는 경우에 해당하는가. 사유를 고르면 그 호의 사실 칸이 이어진다.
 * 사유 전환은 onChange에서 `switchReason`으로 다른 호의 칸을 비운다(`useEffect` 미러링 금지).
 */
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { ReasonFacts } from "./ReasonFacts";
import { REASON_OPTIONS, switchReason, type RecaptureFormState, type RecaptureReasonKey } from "./shared";

export function ReasonSection({
  form,
  onPatch,
  onReplace,
}: {
  form: RecaptureFormState;
  onPatch: (patch: Partial<RecaptureFormState>) => void;
  onReplace: (next: RecaptureFormState) => void;
}) {
  return (
    <div className="space-y-3">
      <ToneCard tone="rose" sectionNum={1} title="추징하지 않는 경우에 해당하는가 (시행령 §10③)">
        <RadioCardGroup<RecaptureReasonKey>
          name="rc-reason"
          layout="stack"
          tone="rose"
          value={form.reason}
          options={REASON_OPTIONS.map((o) => ({ ...o, testId: `rc-reason-${o.value}` }))}
          onChange={(v) => onReplace(switchReason(form, v))}
          data-testid="rc-reason-group"
        />
      </ToneCard>
      <ReasonFacts form={form} onPatch={onPatch} onReplace={onReplace} />
    </div>
  );
}
