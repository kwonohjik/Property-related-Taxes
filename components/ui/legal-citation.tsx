"use client";

import { parseLegalCitation } from "@/lib/law/citation-link";

interface LegalCitationProps {
  /** 법령 인용 문자열 (예: "소득세법 §94 ①") */
  citation: string;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * 법령 인용 문자열을 국가법령정보시스템 링크로 렌더링하는 컴포넌트
 *
 * - URL 생성 가능: <a href="https://www.law.go.kr/..."> 링크로 표시
 * - URL 생성 불가: 일반 <span>으로 폴백 렌더링
 *
 * @example
 * <LegalCitation citation="소득세법 §94 ①" />
 * // → <a href="https://www.law.go.kr/lsEfInfoR.do?lsiSeq=276127" target="_blank">소득세법 §94 ①</a>
 */
export function LegalCitation({ citation, className }: LegalCitationProps) {
  const parsed = parseLegalCitation(citation);

  if (parsed?.url) {
    return (
      <a
        href={parsed.url}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        title={`국가법령정보시스템에서 ${parsed.lawName} 보기`}
      >
        {citation}
      </a>
    );
  }

  return <span className={className}>{citation}</span>;
}

interface LegalCitationListProps {
  /** 법령 인용 문자열 배열 */
  citations: string[];
  /** 구분자 (기본값: ", ") */
  separator?: string;
  /** 추가 CSS 클래스 (각 항목에 적용) */
  itemClassName?: string;
}

/**
 * 여러 법령 인용 문자열을 한 줄에 렌더링
 *
 * @example
 * <LegalCitationList citations={["소득세법 §94 ①", "조특법 §97의3"]} />
 */
export function LegalCitationList({
  citations,
  separator = ", ",
  itemClassName,
}: LegalCitationListProps) {
  return (
    <>
      {citations.map((citation, index) => (
        <span key={citation}>
          <LegalCitation citation={citation} className={itemClassName} />
          {index < citations.length - 1 && separator}
        </span>
      ))}
    </>
  );
}
