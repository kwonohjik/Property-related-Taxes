"use client";

/**
 * 1세대1주택 AI 참고 의견 — 판정 결과 아래 패널 (하이브리드 AI 검토 도구).
 *
 * 버튼을 누를 때만 호출한다(1회 비용). 판정 보류·미적용 특례·추출 메모가 있으면 버튼 옆에 그 수를 보여 준다 —
 * 의견이 가장 쓸모 있는 경우다. 의견은 판정이 아니다: 판정의 정본은 위 엔진 결론이다.
 *
 * 의견은 **그 의견을 만든 판정 결과**에만 붙는다 — 입력을 바꿔 결과가 새로 나오면 옛 의견을 보이지 않는다(렌더에서 파생).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { OneHouseExemptionResponse } from "@/app/api/calc/one-house-exemption/route";
import type { OneHouseAiOpinionData } from "@/app/api/one-house-ai/opinion/route";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

type Props = {
  form: OneHouseJudgmentFormData;
  result: OneHouseExemptionResponse;
  /** 원문으로 채운 경우의 원문·추출 메모 */
  sourceText?: string;
  notes?: readonly string[];
};

const AGREEMENT: Record<OneHouseAiOpinionData["opinion"]["engineAgreement"], { label: string; tone: "emerald" | "amber" | "slate" }> = {
  consistent: { label: "엔진 결론과 같은 방향", tone: "emerald" },
  possible_difference: { label: "결론이 달라질 수 있는 쟁점이 있음", tone: "amber" },
  insufficient_basis: { label: "근거가 부족해 의견을 내기 어려움", tone: "slate" },
};

export function OneHouseAiOpinionPanel({ form, result, sourceText, notes }: Props) {
  const [state, setState] = useState<{ for: OneHouseExemptionResponse; data: OneHouseAiOpinionData } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = state?.for === result ? state.data : null;

  const j = result.judgment;
  const signals = [
    j.undetermined.length > 0 && `판정 보류·확인 필요 ${j.undetermined.length}건`,
    j.unmetExceptions.length > 0 && `적용되지 않은 특례 ${j.unmetExceptions.length}건`,
    notes && notes.length > 0 && `폼으로 표현하지 못한 메모 ${notes.length}건`,
  ].filter(Boolean) as string[];

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/one-house-ai/opinion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form, result, sourceText, notes }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error?.message ?? `AI 참고 의견을 받지 못했습니다(${res.status}).`);
        return;
      }
      setState({ for: result, data: body.data as OneHouseAiOpinionData });
    } catch {
      setError("AI 참고 의견 요청을 보내지 못했습니다. 네트워크를 확인하세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 space-y-3" data-testid="one-house-ai-opinion">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="modalLauncher"
          size="sm"
          data-testid="one-house-ai-opinion-run"
          disabled={loading}
          onClick={() => void run()}
        >
          {data ? "AI 참고 의견 다시 받기" : "AI 참고 의견"}
        </Button>
        {signals.length > 0 && !data && (
          <span className="text-xs text-muted-foreground" data-testid="one-house-ai-opinion-signals">
            {signals.join(" · ")} — 참고 의견이 도움이 될 수 있습니다
          </span>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">해석례를 대조해 의견을 만들고 있습니다… (보통 30~60초)</p>}
      {error && (
        <p role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </p>
      )}
      {data && <OpinionView data={data} />}
    </div>
  );
}

function OpinionView({ data }: { data: OneHouseAiOpinionData }) {
  const { opinion, cards } = data;
  const agreement = AGREEMENT[opinion.engineAgreement];
  const cardOf = new Map(cards.map((c) => [c.docNo, c]));
  return (
    <div className="space-y-3" data-testid="one-house-ai-opinion-view">
      <ToneCard tone={agreement.tone} title={`AI 참고 의견 — ${agreement.label}`}>
        <p className="text-caption text-muted-foreground">판정의 정본은 위 엔진 결론입니다. 이 의견은 참고용입니다.</p>
        <p className="text-sm">{opinion.summary}</p>
      </ToneCard>

      {opinion.points.length > 0 && (
        <ToneCard tone="violet" title={`쟁점별 의견 ${opinion.points.length}건`}>
          <ol className="list-decimal space-y-2 pl-4 text-sm">
            {opinion.points.map((p, i) => (
              <li key={i}>
                <p className="font-medium">{p.topic}</p>
                <p>{p.opinion}</p>
                {(p.statutes.length > 0 || p.citedDocNos.length > 0) && (
                  <p className="text-caption text-muted-foreground">
                    {p.statutes.join(" · ")}
                    {p.statutes.length > 0 && p.citedDocNos.length > 0 && " · "}
                    {p.citedDocNos.map((d, n) => {
                      const c = cardOf.get(d);
                      return (
                        <span key={d}>
                          {n > 0 && " · "}
                          {c?.url ? (
                            <a href={c.url} target="_blank" rel="noreferrer" title={c.title} className="underline underline-offset-2">
                              {d}
                            </a>
                          ) : (
                            d
                          )}
                        </span>
                      );
                    })}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </ToneCard>
      )}

      {opinion.factsToConfirm.length > 0 && (
        <ToneCard tone="amber" title={`확인할 사실 ${opinion.factsToConfirm.length}건`}>
          <ul className="list-disc space-y-1 pl-4 text-sm">
            {opinion.factsToConfirm.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </ToneCard>
      )}

      {(opinion.caveats.length > 0 || data.droppedCitations.length > 0) && (
        <ToneCard tone="slate" title="주의">
          <ul className="list-disc space-y-1 pl-4 text-sm">
            {opinion.caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
            {data.droppedCitations.length > 0 && (
              <li>참고 자료에 없는 문서번호 인용 {data.droppedCitations.length}건을 지웠습니다({data.droppedCitations.join(", ")}).</li>
            )}
          </ul>
        </ToneCard>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground">대조한 해석례 {cards.length}건</summary>
        <ul className="mt-2 space-y-1">
          {cards.map((c) => (
            <li key={c.docNo} className="text-caption">
              <a href={c.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                {c.docNo}
              </a>{" "}
              ({c.kind} · {c.date}) {c.title}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
