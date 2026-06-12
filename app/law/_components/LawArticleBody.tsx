"use client";

import { useMemo } from "react";
import { parseArticleBody } from "@/lib/korean-law/article-body-parser";

/**
 * 조문 본문 렌더 — 박스 드로잉 표는 HTML <table>로, 나머지는 <pre> 텍스트로.
 * 법제처 세율표 등이 비례 글꼴에서 정렬 깨지는 문제 해결.
 */
export function LawArticleBody({ text }: { text: string }) {
  const segments = useMemo(() => parseArticleBody(text), [text]);

  return (
    <div className="space-y-3">
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <pre key={i} className="whitespace-pre-wrap text-sm leading-relaxed">
            {seg.content}
          </pre>
        ) : (
          <LawTable key={i} headers={seg.headers} rows={seg.rows} />
        ),
      )}
    </div>
  );
}

function LawTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="border border-border bg-muted/40 px-3 py-1.5 text-left font-medium align-top"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} className="border border-border px-3 py-1.5 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
