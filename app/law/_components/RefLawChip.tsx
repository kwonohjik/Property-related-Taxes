"use client";

import type { LawRef } from "@/lib/korean-law/types";
import { useLawWindowStore } from "@/lib/stores/law-window-store";

/**
 * 참조조문 칩 — 클릭 시 조문 본문을 플로팅 창으로 열어 자동 로드(여러 개 동시 가능).
 *
 * Design Ref: §5.3 RefLawChip / law-floating-windows.plan.md FR-6
 */
export function RefLawChip({ lawRef }: { lawRef: LawRef }) {
  const openLawWindow = useLawWindowStore((s) => s.open);

  const label = formatRefLabel(lawRef);
  const articleNo =
    lawRef.articleSubNo
      ? `제${lawRef.articleNo}조의${lawRef.articleSubNo}`
      : lawRef.articleNo
      ? `제${lawRef.articleNo}조`
      : null;

  const clickable = Boolean(lawRef.lawName && articleNo);

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => {
        if (clickable && articleNo) openLawWindow({ lawName: lawRef.lawName, articleNo });
      }}
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
