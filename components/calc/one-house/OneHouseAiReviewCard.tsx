"use client";

/**
 * 1세대1주택 AI 사실 추출 — 적용 뒤 판정 메뉴 위에 남기는 검토 카드 (하이브리드 AI 검토 도구 P4).
 *
 * 원문에 없어 비워 둔 칸의 질문을 보여 주고, 답은 **기존 입력 칸에 직접** 넣게 한다(사용자 결정 2026-10-19) —
 * 질문마다 그 칸이 있는 단계로 데려간다. 추출 근거(원문 인용)는 접어 둔다.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { judgmentStepOfPath, type JudgmentInputStep } from "@/lib/one-house-ai/judgment-ui";
import { factValueText, NoteList, QuestionList, type OneHouseAiReview } from "./OneHouseAiExtractDialog";

type Props = {
  review: OneHouseAiReview;
  stepNames: readonly string[];
  onGoToStep: (step: JudgmentInputStep) => void;
  onDismiss: () => void;
};

export function OneHouseAiReviewCard({ review, stepNames, onGoToStep, onDismiss }: Props) {
  const [showFacts, setShowFacts] = useState(false);
  return (
    <div className="mb-6 space-y-3" data-testid="one-house-ai-review">
      <ToneCard
        tone="violet"
        title="원문에서 채운 입력입니다 — 확인 후 판정하세요"
        titleExtra={
          <button
            type="button"
            onClick={onDismiss}
            className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:underline"
            data-testid="one-house-ai-review-dismiss"
          >
            닫기
          </button>
        }
      >
        <p className="text-sm">
          AI가 원문에서 사실 {review.facts.length}칸을 채웠습니다. 값이 원문과 맞는지 각 단계에서 확인하세요.
          {review.issues.length > 0 && ` 형식이 맞지 않아 넣지 않은 값이 ${review.issues.length}건 있습니다.`}
        </p>
        <button
          type="button"
          onClick={() => setShowFacts((v) => !v)}
          className="text-xs font-medium text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
          data-testid="one-house-ai-review-facts-toggle"
        >
          {showFacts ? "추출 근거 접기" : "추출 근거 펼치기"}
        </button>
        {showFacts && (
          <ul className="space-y-1.5" data-testid="one-house-ai-review-facts">
            {review.facts.map((f) => (
              <li key={f.path} className="text-sm">
                <span className="font-medium">{f.label ?? f.path}</span> = <b>{factValueText(f)}</b>
                {f.evidence && <p className="text-caption text-muted-foreground">근거: 「{f.evidence}」</p>}
              </li>
            ))}
          </ul>
        )}
      </ToneCard>

      {review.questions.length > 0 && (
        <QuestionList
          questions={review.questions}
          renderAction={(q) => {
            const step = judgmentStepOfPath(q.path);
            return (
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="mt-1"
                onClick={() => onGoToStep(step)}
              >
                「{stepNames[step]}」 단계에서 입력
              </Button>
            );
          }}
        />
      )}

      {review.notes.length > 0 && <NoteList notes={review.notes} />}
    </div>
  );
}
