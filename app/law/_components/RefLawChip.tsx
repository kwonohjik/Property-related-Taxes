"use client";

import { useState } from "react";
import type { LawRef } from "@/lib/korean-law/types";
import { ArticleModal } from "./ArticleModal";

/**
 * 참조조문 칩 — 클릭 시 ArticleModal을 열어 조문 본문 자동 로드.
 *
 * Design Ref: §5.3 RefLawChip / Plan FR-04, FR-11
 */
export function RefLawChip({ lawRef }: { lawRef: LawRef }) {
  const [open, setOpen] = useState(false);

  const label = formatRefLabel(lawRef);
  const articleNo =
    lawRef.articleSubNo
      ? `제${lawRef.articleNo}조의${lawRef.articleSubNo}`
      : lawRef.articleNo
      ? `제${lawRef.articleNo}조`
      : null;

  const clickable = Boolean(lawRef.lawName && articleNo);

  return (
    <>
      <button
        type="button"
        disabled={!clickable}
        onClick={() => clickable && setOpen(true)}
        className={
          "rounded-full border px-2.5 py-1 text-xs transition " +
          (clickable
            ? "cursor-pointer border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
            : "cursor-not-allowed border-muted bg-muted/30 text-muted-foreground")
        }
        title={clickable ? "클릭하여 조문 본문 조회" : "조문번호를 식별하지 못해 조회할 수 없습니다"}
      >
        {label}
      </button>
      {open && articleNo && (
        <ArticleModal
          lawName={lawRef.lawName}
          articleNo={articleNo}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function formatRefLabel(r: LawRef): string {
  const parts: string[] = [];
  if (r.isPrior) parts.push("구");
  if (r.lawName) parts.push(r.lawName);
  if (r.articleNo) {
    parts.push(r.articleSubNo ? `제${r.articleNo}조의${r.articleSubNo}` : `제${r.articleNo}조`);
  }
  if (r.hangNo) parts.push(`제${r.hangNo}항`);
  if (r.hoNo) parts.push(`제${r.hoNo}호`);
  if (r.mokNo) parts.push(`${r.mokNo}목`);
  return parts.join(" ");
}
