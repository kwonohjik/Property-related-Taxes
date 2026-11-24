"use client";

/**
 * ④ 판정 결과 — 판정 호출 트리거를 이 단계가 갖는다 (1주택 판정 `Step4` 선례 · 계획서 `nbl-judgment-menu.ui.plan.md` §6 끝).
 *
 * 🔑 이 effect는 **fetch를 시작할 뿐 store를 미러링하지 않는다** — 결과는 비동기 핸들러(`handleJudge`)가 `setResult`한다. 1회 가드(`triggered`)로
 *    결과 단계 진입 1회만 호출하고, 오류 뒤 「다시 판정하기」가 가드를 풀어 재시도한다.
 */
import { useEffect, useRef } from "react";
import { NblJudgmentResultView } from "@/components/calc/results/NblJudgmentResultView";
import type { NonBusinessLandJudgmentResponse } from "@/app/api/calc/non-business-land-judgment/route";
import type { NblJudgmentFormData } from "@/lib/stores/nbl-judgment-form.types";

export function StepResult({
  result,
  form,
  error,
  isLoading,
  onJudge,
  onCalculateTax,
  remainingInputs,
}: {
  result: NonBusinessLandJudgmentResponse | null;
  form: NblJudgmentFormData;
  error: string | null;
  isLoading: boolean;
  onJudge: () => void;
  onCalculateTax?: () => void;
  remainingInputs?: readonly string[];
}) {
  const triggered = useRef(false);

  useEffect(() => {
    if (result || isLoading || error || triggered.current) return;
    triggered.current = true;
    onJudge();
  }, [result, isLoading, error, onJudge]);

  if (isLoading) return <p className="py-12 text-center text-sm text-muted-foreground">판정 중입니다…</p>;

  if (error) {
    return (
      <div className="space-y-3" data-testid="nbl-judgment-result-error">
        <div className="whitespace-pre-line rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>
        <button
          type="button"
          className="text-sm font-medium text-primary hover:underline"
          onClick={() => {
            triggered.current = false;
            onJudge();
          }}
        >
          다시 판정하기
        </button>
      </div>
    );
  }

  if (!result) return <p className="py-12 text-center text-sm text-muted-foreground">판정을 준비하고 있습니다…</p>;

  return <NblJudgmentResultView result={result} form={form} onCalculateTax={onCalculateTax} remainingInputs={remainingInputs} />;
}
