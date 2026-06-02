"use client";

/**
 * TransferTaxResultView 보조 헬퍼·소형 컴포넌트
 *
 * TransferTaxResultView.tsx의 800줄 정책 준수를 위해
 * Row 컴포넌트·printScoped·formatRate 등을 sibling으로 분리.
 */

import { cn } from "@/lib/utils";

// ── 인쇄 헬퍼 ──────────────────────────────────────────────────
// (PR-F4) printScoped 정의 제거 — 양도세 4 결과뷰(단일/다중/주식/겸용)가 PrintSelectionPanel로
//   전면 통일되어 호출처 0(dead code). globals.css의 data-print-scope CSS 규칙도 함께 제거.

/** 선택 항목 서버 PDF 다운로드 (PR-F1 PrintSelectionPanel onPrintPdf 위임). savedId 없거나 0건이면 no-op. */
export async function downloadSelectedPdf(
  savedId: string | undefined,
  pdfSections: string[],
  setBusy: (b: boolean) => void,
) {
  if (!savedId || pdfSections.length === 0) return;
  setBusy(true);
  try {
    const res = await fetch(`/api/pdf/result/${savedId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections: pdfSections }),
    });
    if (!res.ok) throw new Error("PDF 생성 실패");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `양도소득세_계산결과_${savedId.slice(0, 8)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    alert("PDF 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  } finally {
    setBusy(false);
  }
}

// ── 포맷 ───────────────────────────────────────────────────────

export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

// ── Row 헬퍼 ──────────────────────────────────────────────────

/** 결과 표의 단일 행 (label + value 2-cell) */
export function Row({
  label,
  value,
  sub = false,
  highlight = false,
}: {
  label: string;
  value: string;
  sub?: boolean;
  highlight?: boolean;
}) {
  return (
    <tr className={cn(highlight && "bg-muted/50 font-semibold")}>
      <td className={cn(
        "px-4 py-2.5 whitespace-nowrap",
        sub && "pl-7 text-xs text-muted-foreground",
        highlight && "bg-muted/50",
      )}>
        {label}
      </td>
      <td className={cn(
        "px-4 py-2.5 text-right font-mono whitespace-nowrap",
        sub && "text-xs text-muted-foreground",
        highlight && "bg-muted/50",
      )}>
        {value}
      </td>
    </tr>
  );
}
