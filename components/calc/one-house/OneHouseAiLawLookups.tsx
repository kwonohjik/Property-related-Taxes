/**
 * 1세대1주택 AI — 「AI가 조회한 법령·해석례」 목록. 실패도 그대로 보여 준다(성공만 보이면 실패 사유가 사라진다).
 * 참고 의견 결과·사실 추출 대화창이 함께 쓴다.
 */
import type { LawLookup } from "@/lib/one-house-ai/law-tools";

const TOOL_LABEL: Record<LawLookup["tool"], string> = {
  lookup_statute: "조문",
  search_interpretations: "검색",
  read_interpretation: "본문",
};

export function OneHouseAiLawLookups({ lookups }: { lookups: readonly LawLookup[] }) {
  if (lookups.length === 0) return null;
  const failed = lookups.filter((l) => !l.ok).length;
  return (
    <details className="text-sm" data-testid="one-house-ai-law-lookups">
      <summary className="cursor-pointer text-xs text-muted-foreground">
        AI가 조회한 법령·해석례 {lookups.length}건{failed > 0 ? ` (실패 ${failed}건)` : ""}
      </summary>
      <ul className="mt-2 space-y-1">
        {lookups.map((l, i) => (
          <li key={i} className="text-caption break-words">
            <span className="text-muted-foreground">[{TOOL_LABEL[l.tool]}]</span>{" "}
            {l.ok ? (
              l.url ? (
                <a href={l.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  {l.summary}
                </a>
              ) : (
                l.summary
              )
            ) : (
              <span className="text-rose-700 dark:text-rose-400">
                실패 — {String(l.input.query ?? l.input.id ?? l.input.article ?? "")} · {l.error}
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
