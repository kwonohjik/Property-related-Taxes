"use client";

/**
 * 1세대1주택 AI 참고 의견 — 판정 결과 아래 패널 (하이브리드 AI 검토 도구).
 *
 * 버튼을 누를 때만 호출한다(1회 비용). 판정 보류·미적용 특례·추출 메모가 있으면 버튼 옆에 그 수를 보여 준다 —
 * 의견이 가장 쓸모 있는 경우다. 의견은 판정이 아니다: 판정의 정본은 위 엔진 결론이다.
 *
 * 의견은 **그 의견을 만든 판정 결과**에만 붙는다 — 입력을 바꿔 결과가 새로 나오면 옛 의견을 보이지 않는다(렌더에서 파생).
 * 의견을 받으면 곧바로 원문 검증(`/api/one-house-ai/verify`)을 부른다 — 검증 결과도 그 검증을 낳은 의견에만 붙는다.
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { OneHouseExemptionResponse } from "@/app/api/calc/one-house-exemption/route";
import type { OneHouseAiOpinionData } from "@/app/api/one-house-ai/opinion/route";
import type { OneHouseAiVerifyData } from "@/lib/one-house-ai/verify/verify-schema";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { OneHouseAiOpinionView } from "./OneHouseAiOpinionView";

type Props = {
  form: OneHouseJudgmentFormData;
  result: OneHouseExemptionResponse;
  /** 원문으로 채운 경우의 원문·추출 메모 */
  sourceText?: string;
  notes?: readonly string[];
};

export function OneHouseAiOpinionPanel({ form, result, sourceText, notes }: Props) {
  const [state, setState] = useState<{ for: OneHouseExemptionResponse; data: OneHouseAiOpinionData } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = state?.for === result ? state.data : null;
  const [verify, setVerify] = useState<{ for: OneHouseAiOpinionData; data: OneHouseAiVerifyData | null; error: string | null } | null>(null);
  // 검증 중인 의견 — 의견을 다시 받으면 옛 검증의 응답·종료가 새 의견의 표시를 덮지 않게 의견 단위로 묶는다
  const [verifyingFor, setVerifyingFor] = useState<OneHouseAiOpinionData | null>(null);
  const latestOpinion = useRef<OneHouseAiOpinionData | null>(null);
  const verifyOf = data && verify?.for === data ? verify : null;

  const j = result.judgment;
  const signals = [
    j.undetermined.length > 0 && `판정 보류·확인 필요 ${j.undetermined.length}건`,
    j.unmetExceptions.length > 0 && `적용되지 않은 특례 ${j.unmetExceptions.length}건`,
    notes && notes.length > 0 && `폼으로 표현하지 못한 메모 ${notes.length}건`,
  ].filter(Boolean) as string[];

  const runVerify = async (d: OneHouseAiOpinionData) => {
    setVerifyingFor(d);
    try {
      const res = await fetch("/api/one-house-ai/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transferDate: /^\d{4}-\d{2}-\d{2}$/.test(form.transferDate ?? "") ? form.transferDate : undefined,
          opinion: d.opinion,
          citations: d.citations.map(({ docNo, origin, source, id }) => ({ docNo, origin, source, id })),
        }),
      });
      const body = await res.json().catch(() => null);
      if (latestOpinion.current !== d) return; // 그사이 의견을 다시 받았다 — 옛 검증은 버린다
      setVerify(
        !res.ok
          ? { for: d, data: null, error: body?.error?.message ?? `원문 검증을 받지 못했습니다(${res.status}).` }
          : body?.data // 200인데 본문을 읽지 못했으면 네트워크 탓이 아니다
            ? { for: d, data: body.data as OneHouseAiVerifyData, error: null }
            : { for: d, data: null, error: "원문 검증 응답을 읽지 못했습니다. 다시 시도하세요." },
      );
    } catch {
      if (latestOpinion.current === d) setVerify({ for: d, data: null, error: "원문 검증 요청을 보내지 못했습니다. 네트워크를 확인하세요." });
    } finally {
      setVerifyingFor((cur) => (cur === d ? null : cur));
    }
  };

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
      // 200인데 본문을 읽지 못했다 — 네트워크 탓이 아니다
      if (!body?.data) {
        setError("AI 참고 의견 응답을 읽지 못했습니다. 다시 시도하세요.");
        return;
      }
      const d = body.data as OneHouseAiOpinionData;
      latestOpinion.current = d;
      setState({ for: result, data: d });
      void runVerify(d);
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
      {data && (
        <OneHouseAiOpinionView
          data={data}
          verify={{ loading: verifyingFor === data && !verifyOf, data: verifyOf?.data ?? null, error: verifyOf?.error ?? null, onRetry: () => void runVerify(data) }}
        />
      )}
    </div>
  );
}
