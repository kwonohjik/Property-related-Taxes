"use client";

/**
 * TransferTaxResultView 보조 헬퍼·소형 컴포넌트
 *
 * TransferTaxResultView.tsx의 800줄 정책 준수를 위해
 * Row 컴포넌트·printScoped·formatRate 등을 sibling으로 분리.
 */

import { cn } from "@/lib/utils";
import { generateResultPdf } from "@/lib/pdf/generate-result-pdf";
import { formatIsoStamp } from "@/lib/utils/file-download";

// ── 인쇄 헬퍼 ──────────────────────────────────────────────────
// (PR-F4) printScoped 정의 제거 — 양도세 4 결과뷰(단일/다중/주식/겸용)가 PrintSelectionPanel로
//   전면 통일되어 호출처 0(dead code). globals.css의 data-print-scope CSS 규칙도 함께 제거.

/**
 * 선택 항목 PDF 다운로드 — 클라이언트 react-pdf 생성(로컬 result). 0건이면 no-op.
 * 서버 라우트(getCalculation Supabase 의존) 대신 로컬 데이터로 직접 렌더 — 로컬 일원화.
 */
export async function downloadSelectedPdf(
  args: {
    taxType: string;
    taxTypeLabel: string;
    resultData: Record<string, unknown>;
    inputData?: Record<string, unknown>;
    filenamePrefix: string;
  },
  pdfSections: string[],
  setBusy: (b: boolean) => void,
) {
  if (pdfSections.length === 0) return;
  setBusy(true);
  try {
    await generateResultPdf({
      taxType: args.taxType,
      taxTypeLabel: args.taxTypeLabel,
      resultData: args.resultData,
      inputData: args.inputData,
      selectedSectionIds: pdfSections,
      filename: `${args.filenamePrefix}_${formatIsoStamp()}.pdf`,
    });
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
      {/* 금액 열은 sub 여부와 무관하게 표에서 크기를 상속받는다 — 같은 열에 12px·14px가
          섞이면 자릿수가 세로로 어긋난다. sub 구분은 라벨 열의 들여쓰기·색상이 담당. */}
      <td className={cn(
        "px-4 py-2.5 text-right font-mono tabular-nums whitespace-nowrap",
        sub && "text-muted-foreground",
        highlight && "bg-muted/50",
      )}>
        {value}
      </td>
    </tr>
  );
}
