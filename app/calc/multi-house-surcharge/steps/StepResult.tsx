"use client";

/**
 * ④ 결과 단계 — 판정 트리거는 이 단계가 갖는다(1주택 메뉴 `Step4`와 같은 1회 가드). 결과는 `MultiHouseSurchargeResultView`가 그린다.
 */
import { useEffect, useRef, type ComponentProps } from "react";
import { MultiHouseSurchargeResultView } from "@/components/calc/results/MultiHouseSurchargeResultView";
import type { MultiHouseSurchargeJudgmentResponse } from "@/app/api/calc/multi-house-surcharge-judgment/route";

type Props = Omit<ComponentProps<typeof MultiHouseSurchargeResultView>, "result"> & {
  result: MultiHouseSurchargeJudgmentResponse | null;
  error: string | null;
  isLoading: boolean;
  onJudge: () => void;
};

export function StepResult({ result, error, isLoading, onJudge, ...view }: Props) {
  const triggered = useRef(false);

  useEffect(() => {
    if (result || isLoading || error || triggered.current) return;
    triggered.current = true;
    onJudge();
  }, [result, isLoading, error, onJudge]);

  if (isLoading) return <p className="py-12 text-center text-sm text-muted-foreground">판정 중입니다…</p>;

  if (error) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
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

  return <MultiHouseSurchargeResultView result={result} {...view} />;
}
