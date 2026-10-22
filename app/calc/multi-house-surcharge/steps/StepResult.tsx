"use client";

/**
 * ④ 결과 단계 — 판정 트리거는 이 단계가 갖는다(1주택 메뉴 `Step4`와 같은 1회 가드).
 *
 * P6b는 **최소 표시**다: 판정 범위 밖 사유 · 결론(설명문 단계 ①~⑥) · 확인 필요 · 고지. 교재식 표·세율 영향·비과세 요약·
 * 계산기 넘기기는 결과 뷰(P7 `MultiHouseSurchargeResultView`)가 맡는다. 화면은 문장을 만들지 않고 응답의 설명문을 그대로 그린다(T5).
 */
import { useEffect, useRef } from "react";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type {
  MultiHouseSurchargeJudgmentResponse,
  SurchargeJudgmentScopeReason,
} from "@/app/api/calc/multi-house-surcharge-judgment/route";

const SCOPE_REASON_TEXT: Record<SurchargeJudgmentScopeReason, string> = {
  before_2018_04_01: "2018년 4월 1일 전 양도는 다주택 중과(소득세법 §104⑦) 시행 전이라 판정하지 않습니다.",
  rules_not_loaded: "주택 수 산정 규칙을 불러오지 못해 판정하지 않았습니다. 잠시 뒤 다시 판정해 주세요.",
  non_housing_sale: "양도 대상이 조합원입주권·분양권입니다 — 다주택 중과는 주택을 양도할 때 적용하므로 중과 대상이 아닙니다.",
  no_house_roster: "보유 주택 정보가 없어 판정하지 않았습니다.",
};

type Props = {
  result: MultiHouseSurchargeJudgmentResponse | null;
  error: string | null;
  isLoading: boolean;
  onJudge: () => void;
};

export function StepResult({ result, error, isLoading, onJudge }: Props) {
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

  return (
    <div className="space-y-4" data-testid="surcharge-result">
      {result.notices.map((n) => (
        <ToneCard key={n} tone="sky">
          <p className="text-sm leading-relaxed">{n}</p>
        </ToneCard>
      ))}

      {!result.scope.supported ? (
        <div data-testid="surcharge-scope-unsupported">
          <ToneCard tone="amber" title="판정 범위 밖">
            <p className="text-sm leading-relaxed">{SCOPE_REASON_TEXT[result.scope.reason]}</p>
          </ToneCard>
        </div>
      ) : (
        result.headline && (
          <div data-testid="surcharge-narrative">
            <ToneCard tone="violet" title="양도 예정 주택 판정">
              <ol className="space-y-3">
                {result.headline.narrative.steps.map((step) => (
                  <li key={step.id} data-testid={`surcharge-step-${step.id}`}>
                    <p className="text-sm font-semibold">
                      {step.title} — {step.verdict}
                    </p>
                    {step.sentences.map((s) => (
                      <p key={s} className="text-sm leading-relaxed text-muted-foreground">
                        {s}
                      </p>
                    ))}
                  </li>
                ))}
              </ol>
            </ToneCard>
          </div>
        )
      )}

      {result.headline && result.headline.narrative.checks.length > 0 && (
        <div data-testid="surcharge-checks">
          <ToneCard tone="rose" title="확인이 필요합니다">
            <ul className="list-disc space-y-1 pl-5">
              {result.headline.narrative.checks.map((c) => (
                <li key={c} className="text-sm leading-relaxed">
                  {c}
                </li>
              ))}
            </ul>
          </ToneCard>
        </div>
      )}
    </div>
  );
}
