"use client";

/**
 * ④ 결과 단계 (P4-2b-2)
 *
 * 🔑 **계산 트리거는 이 단계가 갖는다** — 컨테이너가 아니다(주식 마법사 `Step4.tsx:106` 선례).
 *    오케스트레이터의 「결과 보기」는 단계 전환만 하고, 실제 호출은 여기서 1회 가드와 함께 한다.
 */
import { useEffect, useRef } from "react";
import { OneHouseJudgmentResultView } from "@/components/calc/results/OneHouseJudgmentResultView";
import type { OneHouseExemptionResponse } from "@/app/api/calc/one-house-exemption/route";

type Props = {
  result: OneHouseExemptionResponse | null;
  error: string | null;
  isLoading: boolean;
  onJudge: () => void;
};

export function Step4({ result, error, isLoading, onJudge }: Props) {
  const triggered = useRef(false);

  useEffect(() => {
    if (result || isLoading || error || triggered.current) return;
    triggered.current = true;
    onJudge();
  }, [result, isLoading, error, onJudge]);

  if (isLoading) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">판정 중입니다…</p>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
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

  if (!result) {
    return <p className="py-12 text-center text-sm text-muted-foreground">판정을 준비하고 있습니다…</p>;
  }

  return <OneHouseJudgmentResultView result={result} />;
}
