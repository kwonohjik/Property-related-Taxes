"use client";

/**
 * TaxHelp — 세금 입력 도움말 컴포넌트
 *
 * 라벨 옆 ⓘ 아이콘 배치:
 *  - 클릭 시 Dialog 모달 (상세 내용)
 *  - 간단 요약은 title 속성 (기본 브라우저 툴팁)
 *
 * props:
 *  - title: 도움말 제목 (1줄)
 *  - summary: 한 줄 요약 (모달 없이 읽을 수 있는 핵심)
 *  - details: 마크다운 형식 본문 (줄바꿈 \n 지원)
 *  - legalBasis?: 조문 코드 (LawArticleModal 자동 연결)
 *  - triggerLabel?: 지정 시 ⓘ 아이콘 대신 텍스트 버튼으로 렌더 (예: "특수관계인 범위 조회")
 *  - size?: "sm" | "md" (기본 "md")
 *  - className?: 추가 클래스
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LawArticleModal } from "@/components/ui/law-article-modal";

interface TaxHelpProps {
  title: string;
  summary: string;
  details: string;
  legalBasis?: string | string[];
  /** 지정 시 ⓘ 아이콘 대신 텍스트 버튼으로 트리거를 렌더 */
  triggerLabel?: string;
  size?: "sm" | "md";
  className?: string;
}

/**
 * details 문자열을 렌더링 — 줄바꿈, 볼드(**텍스트**), 목록(- )을 처리
 */
function renderDetails(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={i} className="h-2" />;

    // 목록 항목
    if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      const content = trimmed.slice(2);
      return (
        <div key={i} className="flex gap-1.5 text-xs leading-relaxed text-muted-foreground">
          <span className="mt-0.5 shrink-0 text-foreground/50">•</span>
          <span dangerouslySetInnerHTML={{ __html: applyBold(content) }} />
        </div>
      );
    }

    // 헤더 항목 (## 또는 ### )
    if (trimmed.startsWith("##")) {
      const content = trimmed.replace(/^#+\s*/, "");
      return (
        <p key={i} className="text-sm font-semibold text-foreground mt-3 mb-1 first:mt-0">
          {content}
        </p>
      );
    }

    // 일반 텍스트
    return (
      <p key={i} className="text-xs leading-relaxed text-muted-foreground"
        dangerouslySetInnerHTML={{ __html: applyBold(trimmed) }} />
    );
  });
}

function applyBold(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

export function TaxHelp({
  title,
  summary,
  details,
  legalBasis,
  triggerLabel,
  size = "md",
  className,
}: TaxHelpProps) {
  const [open, setOpen] = useState(false);
  const bases = legalBasis
    ? Array.isArray(legalBasis) ? legalBasis : [legalBasis]
    : [];

  const iconSize = size === "sm" ? "h-3.5 w-3.5 text-micro" : "h-4 w-4 text-xs";

  return (
    <>
      {triggerLabel ? (
        <button
          type="button"
          title={summary}
          aria-label={`도움말: ${title}`}
          onClick={() => setOpen(true)}
          className={`inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50/70 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 hover:text-blue-800 transition-colors select-none ${className ?? ""}`}
        >
          <span aria-hidden className="text-caption">ⓘ</span>
          {triggerLabel}
        </button>
      ) : (
        <button
          type="button"
          title={summary}
          aria-label={`도움말: ${title}`}
          onClick={() => setOpen(true)}
          className={`inline-flex items-center justify-center rounded-full bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors select-none ${iconSize} ${className ?? ""}`}
        >
          ⓘ
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">{title}</DialogTitle>
          </DialogHeader>

          {/* 한 줄 요약 */}
          <div className="rounded-md bg-blue-50/60 border border-blue-200 px-3 py-2 text-xs text-blue-800 font-medium">
            {summary}
          </div>

          {/* 상세 내용 */}
          <div className="space-y-1 max-h-[50vh] overflow-y-auto pr-1">
            {renderDetails(details)}
          </div>

          {/* 법령 조문 링크 */}
          {bases.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center border-t pt-3 mt-1">
              <span className="text-xs text-muted-foreground font-medium">관련 조문:</span>
              {bases.map((b, i) => (
                <LawArticleModal key={i} legalBasis={b} />
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
