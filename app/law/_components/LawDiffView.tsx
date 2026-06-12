"use client";

import type { ArticleDiff } from "@/lib/korean-law/types";

/**
 * 조문 신구대조 뷰 — 추가(emerald)·삭제(rose)·유지(기본) 라인 단위 렌더.
 * amendment_track 체인의 "diff" 섹션에서 사용.
 */
export function LawDiffView({ diff }: { diff: ArticleDiff }) {
  const { before, after, identical } = diff;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {before && <span>이전 [시행 {fmtYmd(before.version.efYd)}]</span>}
        <span>→</span>
        {after && (
          <span>
            현행 [시행 {fmtYmd(after.version.efYd)}] · {after.version.rrCls} · 공포 제
            {after.version.ancNo}호
          </span>
        )}
      </div>

      {!before || !after ? (
        <p className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-900/10 dark:text-yellow-200">
          {!before && !after
            ? "두 시점 모두 조문 본문을 찾지 못했습니다."
            : !before
            ? "이전 시점에는 해당 조문이 없습니다 (신설 가능)."
            : "현행 시점에는 해당 조문이 없습니다 (삭제·이동 가능)."}
        </p>
      ) : identical ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/10 dark:text-emerald-200">
          ✅ 두 시점 본문이 동일합니다 (이 조문은 개정되지 않음).
        </p>
      ) : (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border bg-card p-3 text-sm leading-relaxed">
          {diff.diff.map((line, i) => (
            <DiffLineRow key={i} kind={line.kind} text={line.text} />
          ))}
        </pre>
      )}
    </div>
  );
}

function DiffLineRow({ kind, text }: { kind: "add" | "remove" | "keep"; text: string }) {
  if (kind === "add") {
    return (
      <div className="bg-emerald-50 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200">
        <span className="select-none text-emerald-600">＋ </span>
        {text}
      </div>
    );
  }
  if (kind === "remove") {
    return (
      <div className="bg-rose-50 text-rose-900 line-through decoration-rose-400/60 dark:bg-rose-900/20 dark:text-rose-200">
        <span className="select-none text-rose-600 no-underline">－ </span>
        {text}
      </div>
    );
  }
  return (
    <div className="text-muted-foreground">
      <span className="select-none">　 </span>
      {text}
    </div>
  );
}

function fmtYmd(ymd: string): string {
  if (!/^\d{8}$/.test(ymd)) return ymd;
  return `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}`;
}
