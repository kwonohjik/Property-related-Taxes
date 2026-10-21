"use client";

/**
 * 1세대1주택 AI 사실 추출 — 판정 메뉴의 「원문으로 채우기」 (하이브리드 AI 검토 도구 P4).
 *
 * 원문(질의·사실관계)을 붙여 넣으면 서버(`/api/one-house-ai/extract`)가 LLM으로 사실만 뽑는다.
 * 추출 결과(근거 인용·질문·메모)를 확인한 뒤 적용하면 **지금 입력을 통째로 바꾼다**(사용자 결정 2026-10-19) —
 * 기존 명부 행과 섞으면 「A주택 = 몇 번째 행」 규칙이 따로 필요하고, 섞인 폼은 원문과 다른 사실로 판정된다.
 *
 * 판정은 하지 않는다. 적용한 폼으로 판정 메뉴가 같은 엔진으로 판정한다. 원문에 없는 사실은 비워 두고 질문으로 남긴다.
 * 질문이 가리키는 칸이 특정되면 이 창에서 바로 답할 수 있고, 답은 추출값과 함께 적용된다(`draft`).
 * 로컬 개발 서버 전용 — 버튼 노출 여부는 서버 페이지가 정한다(`page.tsx`).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { mergeExtractedForm } from "@/lib/one-house-ai/merge-form";
import { hasJudgmentInput } from "@/lib/one-house-ai/judgment-ui";
import { ONE_HOUSE_AI_TEXT_MAX } from "@/lib/one-house-ai/text-limit";
import { answerTargetOf, readAnswer, writeAnswer } from "@/lib/one-house-ai/question-answer";
import { OneHouseAiAnswerField } from "./OneHouseAiAnswerField";
import { OneHouseAiUsageCost } from "./OneHouseAiUsageCost";
import type { OneHouseAiExtractData } from "@/app/api/one-house-ai/extract/route";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

/** 적용 뒤 화면에 남기는 검토 정보 — 원문은 참고 의견(`OneHouseAiOpinionPanel`)이 맥락으로 쓴다 */
export type OneHouseAiReview = Pick<OneHouseAiExtractData, "facts" | "questions" | "notes" | "issues"> & {
  sourceText: string;
};

type Props = {
  form: OneHouseJudgmentFormData;
  onApply: (form: OneHouseJudgmentFormData, review: OneHouseAiReview) => void;
};

export function factValueText(f: OneHouseAiExtractData["facts"][number]): string {
  if (f.valueLabel) return f.valueLabel;
  if (f.value === "true") return "예";
  if (f.value === "false") return "아니오";
  return f.value;
}

export function OneHouseAiExtractDialog({ form, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OneHouseAiExtractData | null>(null);
  /** 적용할 폼 — 추출값 위에 질문에 바로 답한 값을 더한다 */
  const [draft, setDraft] = useState<OneHouseJudgmentFormData | null>(null);

  // 서버와 같은 기준(앞뒤 공백 제외)으로 센다
  const length = text.trim().length;
  const overLimit = length > ONE_HOUSE_AI_TEXT_MAX;
  const replacesInput = hasJudgmentInput(form);

  const extract = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    setDraft(null);
    try {
      const res = await fetch("/api/one-house-ai/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error?.message ?? `AI 사실 추출에 실패했습니다(${res.status}).`);
        return;
      }
      const extracted = body.data as OneHouseAiExtractData;
      setData(extracted);
      setDraft(mergeExtractedForm(extracted.form));
    } catch {
      setError("AI 사실 추출 요청을 보내지 못했습니다. 네트워크를 확인하세요.");
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (!data || !draft) return;
    onApply(draft, {
      facts: data.facts,
      questions: data.questions,
      notes: data.notes,
      issues: data.issues,
      sourceText: text.trim(),
    });
    setOpen(false);
    setData(null);
    setDraft(null);
  };

  return (
    <>
      <Button
        type="button"
        variant="modalLauncher"
        size="sm"
        data-testid="one-house-ai-extract-open"
        title="해석례·질의 원문에서 사실을 뽑아 판정 메뉴 입력을 채웁니다(로컬 개발 서버 전용)"
        onClick={() => setOpen(true)}
      >
        원문으로 채우기 (AI)
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl" data-testid="one-house-ai-extract-dialog">
          <DialogHeader>
            <DialogTitle>원문으로 채우기 (AI 사실 추출)</DialogTitle>
            <DialogDescription>
              질의·사실관계 원문을 붙여 넣으세요. AI는 사실만 뽑고 판정은 하지 않습니다. 원문에 없는 사실은 비워 두고
              질문으로 남깁니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1">
            <textarea
              data-testid="one-house-ai-extract-text"
              aria-label="원문"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className={`text-right text-xs ${overLimit ? "text-rose-700 dark:text-rose-400" : "text-muted-foreground"}`}>
              {length.toLocaleString()} / {ONE_HOUSE_AI_TEXT_MAX.toLocaleString()}자
            </p>
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </p>
          )}

          {loading && (
            <p className="text-sm text-muted-foreground" data-testid="one-house-ai-extract-loading">
              사실을 추출하고 있습니다… (보통 20~45초)
            </p>
          )}

          {data && draft && <ExtractionPreview data={data} draft={draft} onDraftChange={setDraft} />}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center">
            {data && replacesInput && (
              <p className="text-xs text-rose-700 sm:mr-auto dark:text-rose-400">적용하면 지금 입력한 값은 모두 지워집니다.</p>
            )}
            <Button
              type="button"
              variant="outline"
              data-testid="one-house-ai-extract-run"
              disabled={loading || length === 0 || overLimit}
              onClick={() => void extract()}
            >
              {data ? "다시 추출" : "사실 추출"}
            </Button>
            {data && (
              <Button type="button" data-testid="one-house-ai-extract-apply" onClick={apply}>
                {replacesInput ? "지금 입력을 지우고 적용" : "판정 메뉴에 적용"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ExtractionPreview({
  data,
  draft,
  onDraftChange,
}: {
  data: OneHouseAiExtractData;
  draft: OneHouseJudgmentFormData;
  onDraftChange: (form: OneHouseJudgmentFormData) => void;
}) {
  return (
    <div className="space-y-3" data-testid="one-house-ai-extract-preview">
      <ToneCard tone="sky" title={`추출한 사실 ${data.facts.length}칸`}>
        {data.facts.length === 0 ? (
          <p className="text-sm">원문에서 뽑은 사실이 없습니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.facts.map((f) => (
              <li key={f.path} className="text-sm">
                <span className="font-medium">{f.label ?? f.path}</span>
                {f.label && <span className="text-caption text-muted-foreground"> ({f.path})</span>}
                {" = "}
                <b>{factValueText(f)}</b>
                {f.evidence && <p className="text-caption text-muted-foreground">근거: 「{f.evidence}」</p>}
              </li>
            ))}
          </ul>
        )}
      </ToneCard>

      {data.questions.length > 0 && (
        <QuestionList
          questions={data.questions}
          renderAction={(q) => {
            const target = answerTargetOf(q.path, q.field, draft);
            return target ? (
              <OneHouseAiAnswerField
                target={target}
                value={readAnswer(draft, target)}
                onChange={(v) => onDraftChange(writeAnswer(draft, target, v))}
              />
            ) : (
              <p className="text-caption text-muted-foreground">적용한 뒤 판정 화면의 검토 카드에서 해당 단계로 이동해 입력합니다.</p>
            );
          }}
        />
      )}

      {data.issues.length > 0 && (
        <ToneCard tone="amber" title={`넣지 않은 값 ${data.issues.length}건`}>
          <ul className="list-disc space-y-1 pl-4 text-sm">
            {data.issues.map((i, n) => (
              <li key={`${i.path}-${n}`}>
                <span className="font-mono text-xs">{i.path}</span> — {i.message}
              </li>
            ))}
          </ul>
        </ToneCard>
      )}

      {data.notes.length > 0 && <NoteList notes={data.notes} />}

      <OneHouseAiUsageCost model={data.model} usage={data.usage} />
    </div>
  );
}

export function QuestionList({
  questions,
  renderAction,
}: {
  questions: OneHouseAiExtractData["questions"];
  renderAction?: (q: OneHouseAiExtractData["questions"][number]) => React.ReactNode;
}) {
  return (
    <ToneCard tone="amber" title={`원문에 없어 확인할 사실 ${questions.length}건`}>
      <ol className="list-decimal space-y-1.5 pl-4 text-sm">
        {questions.map((q, n) => (
          <li key={`${q.path}-${n}`}>
            <span>{q.question}</span>
            {q.why && <p className="text-caption text-muted-foreground">{q.why}</p>}
            {q.label && <p className="text-caption text-muted-foreground">입력 칸: 「{q.label}」</p>}
            {renderAction && <div>{renderAction(q)}</div>}
          </li>
        ))}
      </ol>
    </ToneCard>
  );
}

export function NoteList({ notes }: { notes: string[] }) {
  return (
    <ToneCard tone="slate" title="AI 메모 (참고용 — 판정은 판정 메뉴가 합니다)">
      <ul className="list-disc space-y-1 pl-4 text-sm">
        {notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </ToneCard>
  );
}
