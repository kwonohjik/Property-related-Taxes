/**
 * 1세대1주택 AI 사실 추출 — 「원문 속 인용 대조」 목록(결정론). 원문은 사용자가 붙여 넣은 글이라 「환각」이라 부르지 않는다.
 * 확인 상한을 넘은 인용은 버리지 않고 따로 보여 준다 — 사용자가 링크·번호로 직접 확인한다.
 */
import type { SourceCitation } from "@/lib/one-house-ai/source-citations";

const STATUS: Record<Exclude<SourceCitation["status"], "unchecked">, string> = { found: "확인됨", not_found: "찾지 못함", failed: "확인 불가" };
const BASIS: Record<NonNullable<SourceCitation["basis"]>, string> = {
  transfer_date: " (양도일 시행본)",
  current: " (현행 기준)",
  cited_era: " (인용된 옛 시행본)",
};

function Label({ c }: { c: SourceCitation }) {
  return c.url ? (
    <a href={c.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
      {c.raw}
    </a>
  ) : (
    <>{c.raw}</>
  );
}

export function OneHouseAiSourceCitations({ items }: { items: readonly SourceCitation[] }) {
  if (items.length === 0) return null;
  const checked = items.filter((c) => c.status !== "unchecked");
  const unchecked = items.filter((c) => c.status === "unchecked");
  return (
    <details className="text-sm" data-testid="one-house-ai-source-citations">
      <summary className="cursor-pointer text-xs text-muted-foreground">
        원문 속 인용 대조 {checked.length}건{unchecked.length > 0 && ` · 직접 확인할 인용 ${unchecked.length}건`}
      </summary>
      <ul className="mt-2 space-y-1">
        {checked.map((c, i) => (
          <li key={i} className="text-caption break-words">
            <Label c={c} />{" "}
            — <span className={c.status === "found" ? "" : "text-amber-700 dark:text-amber-400"}>{STATUS[c.status as keyof typeof STATUS]}</span>
            {c.kind === "statute" && BASIS[c.basis ?? "current"]}
            {c.note && <span className="text-muted-foreground"> · {c.note}</span>}
          </li>
        ))}
      </ul>
      {unchecked.length > 0 && (
        <div className="mt-2" data-testid="one-house-ai-source-citations-unchecked">
          <p className="text-caption text-amber-700 dark:text-amber-400">
            한 번에 대조하는 건수를 넘어 확인하지 않은 인용입니다 — 링크나 문서번호로 직접 확인하세요.
          </p>
          <ul className="mt-1 space-y-1">
            {unchecked.map((c, i) => (
              <li key={i} className="text-caption break-words">
                <Label c={c} />
                {c.note && <span className="text-muted-foreground"> · {c.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}
