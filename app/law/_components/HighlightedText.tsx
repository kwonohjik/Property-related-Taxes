"use client";

import { useMemo } from "react";

/**
 * 쿼리에 매칭된 부분을 `<mark>`로 감싸서 하이라이트.
 *
 * Design Ref: §5.3 HighlightedText / Plan FR-12
 *
 * - regex-escape 처리로 사용자 입력 안전 (XSS 방지)
 * - 공백으로 분리된 여러 단어 모두 매칭
 * - 최소 2자 이상 단어만 하이라이트
 */
export function HighlightedText({
  text,
  query,
  className,
}: {
  text: string;
  query: string;
  className?: string;
}) {
  const parts = useMemo(() => splitByHighlight(text, query), [text, query]);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.highlight ? (
          <mark key={i} className="rounded bg-yellow-200/70 px-0.5 text-inherit dark:bg-yellow-500/30">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </span>
  );
}

function splitByHighlight(
  text: string,
  query: string
): Array<{ text: string; highlight: boolean }> {
  if (!text || !query) return [{ text, highlight: false }];
  const words = query
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
  if (words.length === 0) return [{ text, highlight: false }];

  const pattern = words.map(escapeRegex).join("|");
  const re = new RegExp(`(${pattern})`, "gi");
  const parts: Array<{ text: string; highlight: boolean }> = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, m.index), highlight: false });
    }
    parts.push({ text: m[0], highlight: true });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), highlight: false });
  }
  return parts.length > 0 ? parts : [{ text, highlight: false }];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
