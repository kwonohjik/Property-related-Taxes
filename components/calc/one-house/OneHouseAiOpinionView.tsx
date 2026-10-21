/**
 * 1세대1주택 AI 참고 의견 — 결과 보기(패널 `OneHouseAiOpinionPanel`에서 분리).
 *
 * 인용은 카드(비공개 카드의 공개 서지) 또는 이번에 실시간으로 읽은 공개 원문이다(`origin`). 조문은 구조화 값을 화면 표기로 바꾼다.
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { OneHouseAiOpinionData } from "@/app/api/one-house-ai/opinion/route";
import { docKey } from "@/lib/korean-law/doc-key";
import { formatStatuteRef } from "@/lib/one-house-ai/statute-ref";
import type { OneHouseAiVerifyData } from "@/lib/one-house-ai/verify/verify-schema";
import { OneHouseAiLawLookups } from "./OneHouseAiLawLookups";
import { OneHouseAiUsageCost } from "./OneHouseAiUsageCost";
import { OneHouseAiVerifyBadge } from "./OneHouseAiVerifyBadge";

export type OneHouseAiVerifyState = { loading: boolean; data: OneHouseAiVerifyData | null; error: string | null; onRetry: () => void };

const AGREEMENT: Record<OneHouseAiOpinionData["opinion"]["engineAgreement"], { label: string; tone: "emerald" | "amber" | "slate" }> = {
  consistent: { label: "엔진 결론과 같은 방향", tone: "emerald" },
  possible_difference: { label: "결론이 달라질 수 있는 쟁점이 있음", tone: "amber" },
  insufficient_basis: { label: "근거가 부족해 의견을 내기 어려움", tone: "slate" },
};

export function OneHouseAiOpinionView({ data, verify }: { data: OneHouseAiOpinionData; verify?: OneHouseAiVerifyState }) {
  const { opinion, cards } = data;
  // 비용은 의견·검증 합산(같은 모델일 때 — 다르면 단가표가 달라 의견만)
  const v = verify?.data;
  const usage =
    v?.usage && v.model === data.model
      ? {
          input: data.usage.input + v.usage.input,
          cacheRead: data.usage.cacheRead + v.usage.cacheRead,
          cacheWrite: data.usage.cacheWrite + v.usage.cacheWrite,
          output: data.usage.output + v.usage.output,
        }
      : data.usage;
  const agreement = AGREEMENT[opinion.engineAgreement];
  const citationOf = new Map(data.citations.map((c) => [docKey(c.docNo), c]));
  return (
    <div className="space-y-3" data-testid="one-house-ai-opinion-view">
      <ToneCard tone={agreement.tone} title={`AI 참고 의견 — ${agreement.label}`}>
        <p className="text-caption text-muted-foreground">판정의 정본은 위 엔진 결론입니다. 이 의견은 참고용입니다.</p>
        <p className="text-sm">{opinion.summary}</p>
        {verify?.loading && <p className="text-caption text-muted-foreground" data-testid="one-house-ai-verify-status">원문 검증 중… 인용한 조문·해석례를 다시 받아 대조합니다</p>}
        {verify?.error && (
          <p className="text-caption text-rose-700 dark:text-rose-400" data-testid="one-house-ai-verify-status">
            원문 검증 실패 — {verify.error}{" "}
            <button type="button" className="underline underline-offset-2" onClick={verify.onRetry}>
              다시 검증
            </button>
          </p>
        )}
      </ToneCard>

      {opinion.points.length > 0 && (
        <ToneCard tone="violet" title={`쟁점별 의견 ${opinion.points.length}건`}>
          <ol className="list-decimal space-y-2 pl-4 text-sm">
            {opinion.points.map((p, i) => (
              <li key={i}>
                <p className="font-medium">{p.topic}</p>
                <p>{p.opinion}</p>
                {v && <OneHouseAiVerifyBadge index={i} verify={v} />}
                {(p.statutes.length > 0 || p.citedDocNos.length > 0) && (
                  <p className="text-caption break-words text-muted-foreground">
                    {p.statutes.map(formatStatuteRef).join(" · ")}
                    {p.statutes.length > 0 && p.citedDocNos.length > 0 && " · "}
                    {p.citedDocNos.map((d, n) => {
                      const c = citationOf.get(docKey(d));
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
                          {c?.origin === "live" && " [실시간]"}
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

      {data.liveDocs.length > 0 && (
        <details className="text-sm" data-testid="one-house-ai-live-docs">
          <summary className="cursor-pointer text-xs text-muted-foreground">실시간으로 읽은 문서 {data.liveDocs.length}건</summary>
          <ul className="mt-2 space-y-1">
            {data.liveDocs.map((d) => (
              <li key={`${d.source}:${d.id}`} className="text-caption break-words">
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {d.docNo}
                  </a>
                ) : (
                  d.docNo
                )}{" "}
                ({d.date}) {d.title}
              </li>
            ))}
          </ul>
        </details>
      )}

      <OneHouseAiLawLookups lookups={data.lawLookups} />

      <OneHouseAiUsageCost model={data.model} usage={usage} />
    </div>
  );
}
