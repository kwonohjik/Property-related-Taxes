"use client";

/**
 * 재산세 별도합산 순차 노출의 안내 두 가지 (PSA-SU · 계획서 `property-separate-demolished-sequential.ui.plan.md` §2.1-5 · §2.5).
 *  - `SettledNotice` — 앞 답이 결과를 확정했을 때(엔진 `chain.resolved` · `buildingChain.resolvedFold`) «나머지 칸은 묻지 않는다»는 안내. 사유 문장은 엔진이 낸 `notice`를 그대로 쓴다(UI가 법률 문장을 짓지 않는다).
 *  - `PrevAnswerMark` — 숨었다가 답 변경으로 다시 나타난 칸이 저장값을 가진 채 보일 때 «이전에 고른 답» 표식(색만이 아닌 텍스트).
 * `useEffect → store` 미러링 없음 — 둘 다 렌더 파생이고, 확인 집합은 `Step2SeparateAggregate`의 핸들러만 갱신한다.
 */
import { Button } from "@/components/ui/button";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { settledLeadOf } from "./separate-sequence";
import { settledTail } from "./separate-sequence";
import type { SequenceField, Settled } from "./separate-sequence";

export function SettledNotice({ settled }: { settled: Settled }) {
  return (
    <ToneCard tone="slate" title="이 답으로 종합합산 이관이 확정되었습니다" bodyClassName="space-y-1">
      <div data-testid="pt-sa-seq-settled" data-reason={settled.reason} className="space-y-1 text-caption leading-snug">
        <p>{settledLeadOf(settled)}</p>
        <p>{settled.notice}</p>
        <p>{settledTail(settled)}</p>
      </div>
    </ToneCard>
  );
}

interface MarkProps {
  field: SequenceField;
  /** 사용자가 이 칸의 답을 «그대로 맞다»고 확인했다 — 라디오를 다른 값으로 바꾸면 `onChange`가 같은 일을 한다 */
  onConfirm: (field: SequenceField) => void;
}

/**
 * 이미 선택된 라디오를 다시 눌러도 `onChange`가 나지 않아(같은 값) 그 답을 «맞다»고 확인할 길이 없다 — 그래서 표식에 확인 버튼을 함께 둔다.
 */
export function PrevAnswerMark({ field, onConfirm }: MarkProps) {
  return (
    <div data-testid={`pt-sa-prev-answer-${field}`} className="flex flex-wrap items-center gap-2 text-caption leading-snug text-muted-foreground">
      <span>이전에 고른 답입니다 — 맞는지 확인하세요.</span>
      <Button type="button" variant="outline" size="xs" onClick={() => onConfirm(field)}>
        이 답 그대로 확인
      </Button>
    </div>
  );
}
