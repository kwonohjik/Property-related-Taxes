"use client";

import type { PrecedentRef } from "@/lib/korean-law/types";

/**
 * 참조판례 칩 — 법제처 원문 링크로 이동 (본문 모달은 별도 도메인 ID 필요).
 *
 * Design Ref: §5.3 RefPrecedentChip / Plan FR-04
 */
export function RefPrecedentChip({ precRef }: { precRef: PrecedentRef }) {
  const label = [precRef.court, precRef.date, precRef.caseNo, precRef.judgmentType]
    .filter(Boolean)
    .join(" ");
  // 사건번호로 법제처 검색 URL 생성 (대법원 판례 기본)
  const url = `https://www.law.go.kr/LSW/lsScListR.do?query=${encodeURIComponent(precRef.caseNo)}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-primary hover:bg-primary/10"
      title="법제처에서 판례 검색"
    >
      {label}
      <span className="ml-1">↗</span>
    </a>
  );
}
