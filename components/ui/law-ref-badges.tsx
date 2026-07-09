"use client";

/**
 * LawRefBadges — 카드/모달 제목·설명에서 추출한 조문 인용을 클릭 가능한 배지 줄로.
 *
 * 입력 텍스트의 §평문은 그대로 두고, 이 배지가 각 조문 본문 팝업(LawArticleModal)을 연다.
 * refs는 `extractInlineLawRefs(text, defaultLaw)`(lib/utils/law-url.ts) 산출물.
 * label에 항(項) 마커(①…)가 포함되어 LawArticleModal 항 하이라이트가 동작한다.
 */

import { LawArticleModal } from "@/components/ui/law-article-modal";

export interface LawRefBadge {
  label: string;
  legalBasis: string;
}

const BADGE_CLASS =
  "inline-flex items-center text-caption leading-none text-blue-700/90 border border-blue-200 bg-blue-50/60 rounded px-1.5 py-0.5 hover:bg-blue-100 hover:border-blue-300 hover:text-blue-800 transition-colors cursor-pointer dark:text-blue-300/90 dark:border-blue-900/50 dark:bg-blue-950/30";

export function LawRefBadges({
  refs,
  className,
}: {
  refs: LawRefBadge[];
  className?: string;
}) {
  if (!refs.length) return null;
  return (
    // ToggleCard/RadioCard <label> 내부에 위치 — 배지 클릭이 토글/라디오를 활성화하지
    // 않도록 전파 차단(클릭은 LawArticleModal 버튼이 먼저 처리).
    <span
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex flex-wrap items-center gap-1 ${className ?? ""}`}
    >
      {refs.map((r, i) => (
        <LawArticleModal
          key={`${r.legalBasis}-${i}`}
          legalBasis={r.legalBasis}
          label={r.label}
          className={BADGE_CLASS}
        />
      ))}
    </span>
  );
}
