"use client";

/**
 * PrecedentArticleModal — 예규·판례·해석례 표시 모달
 *
 * `LawArticleModal`(소득세법 등 법령 조문 단위)과 별개로
 * `/api/law/article` 검색 대상이 아닌 다음 유형을 표시:
 *
 *  - 국세청 예규 (사전법규재산 2022-684 등)
 *  - 사전법령해석재산 (2021-939 등)
 *  - 행정법원 판결 (서울행법 2012구단26961 등)
 *  - 집행기준 (양도소득세 집행기준 99-164-10 등)
 *
 * 동작:
 *  - 본 컴포넌트는 외부 API 조회 없이 사용자 제공 텍스트(`content` prop)를 그대로 표시
 *  - 외부 검색 링크(국가법령정보센터 또는 국세법령정보시스템) 버튼 제공
 *  - 후속: bkit MCP `chain_decision_*` 통합 가능 (현재는 정적 표시)
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export interface PrecedentArticleModalProps {
  /** 인용 문자열 (예: "사전법규재산 2022-684", "서울행법 2012구단26961 (2013.04.24)"). */
  citation: string;
  /** 짧은 라벨 (배지 버튼 표시용). 미설정 시 citation 전체. */
  label?: string;
  /** 모달 내부에 표시할 요약·결정 요지 텍스트. 미설정 시 외부 링크 안내만 표시. */
  summary?: string;
  /**
   * 분류 (외부 검색 URL 결정용):
   *  - "ruling": 국세청 예규·사전법령해석 → 국세법령정보시스템 검색
   *  - "court":  행정법원 판결 → 법원 종합법률정보 검색
   *  - "interpretation": 집행기준·통칙 → 국세청 사이트
   */
  kind?: "ruling" | "court" | "interpretation";
  className?: string;
}

const EXTERNAL_SEARCH_BASE: Record<NonNullable<PrecedentArticleModalProps["kind"]>, string> = {
  ruling: "https://taxlaw.nts.go.kr/qt/USEQTA001M.do?ntstDcmId=&searchTitleAndContent=",
  court: "https://glaw.scourt.go.kr/wsjo/intesrch/sjo022.do?q=",
  interpretation: "https://taxlaw.nts.go.kr/pd/USEPDA001P.do?searchTitleAndContent=",
};

export function PrecedentArticleModal({
  citation,
  label,
  summary,
  kind = "ruling",
  className,
}: PrecedentArticleModalProps) {
  const [open, setOpen] = useState(false);
  const externalUrl = EXTERNAL_SEARCH_BASE[kind] + encodeURIComponent(citation);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "inline-block mt-1 text-[10px] text-muted-foreground/70 border border-border/60 rounded px-1.5 py-0.5 hover:text-primary hover:border-primary/50 transition-colors cursor-pointer"
        }
      >
        {label ?? citation} ↗
      </button>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base">{citation}</DialogTitle>
        </DialogHeader>

        <div className="mt-2 min-h-[80px] space-y-2">
          {summary ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed bg-muted/50 rounded-md p-3">
              {summary}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground">
              본 인용은 예규·판례·집행기준으로 법령 본문 조회 대상이 아닙니다.
              아래 외부 링크에서 원문을 확인하세요.
            </p>
          )}
        </div>

        <DialogFooter className="border-t-0 bg-transparent pt-2">
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            {kind === "court" ? "법원 종합법률정보에서 검색" : "국세법령정보시스템에서 검색"} ↗
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
