/**
 * 1세대1주택 AI 사실 추출 — 「원문 속 인용 대조」 목록(결정론). 원문은 사용자가 붙여 넣은 글이라 「환각」이라 부르지 않는다.
 */
import type { SourceCitation } from "@/lib/one-house-ai/source-citations";

const STATUS: Record<SourceCitation["status"], string> = { found: "확인됨", not_found: "찾지 못함", failed: "확인 불가" };

export function OneHouseAiSourceCitations({ items }: { items: readonly SourceCitation[] }) {
  if (items.length === 0) return null;
  return (
    <details className="text-sm" data-testid="one-house-ai-source-citations">
      <summary className="cursor-pointer text-xs text-muted-foreground">원문 속 인용 대조 {items.length}건</summary>
      <ul className="mt-2 space-y-1">
        {items.map((c, i) => (
          <li key={i} className="text-caption break-words">
            {c.url ? (
              <a href={c.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                {c.raw}
              </a>
            ) : (
              c.raw
            )}{" "}
            — <span className={c.status === "found" ? "" : "text-amber-700 dark:text-amber-400"}>{STATUS[c.status]}</span>
            {c.kind === "statute" && (c.basis === "transfer_date" ? " (양도일 시행본)" : " (현행 기준)")}
            {c.note && <span className="text-muted-foreground"> · {c.note}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
