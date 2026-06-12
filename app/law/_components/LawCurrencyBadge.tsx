"use client";

/**
 * 법령 현행성 가드 배지 — upstream korean-law-mcp v4.4 [현행]/⚠️[연혁] 라벨 대응.
 *
 * getLawText/search-law는 법제처 target=law 기본으로 **현행 본문**을 반환하므로
 * 조문 표시 지점에 [현행]을 상시 노출해, 사용자가 과거 시점 본문으로 오인하지 않게 한다.
 * 과거 시점 본문은 ApplicableLawPanel(기준일 시점 조회)의 [연혁 …] 배지로 구분.
 */
export function CurrentLawBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="현재 시행 중인 본문입니다. 과거 시점 본문은 '기준일 시점 조회(행위시법)'를 사용하세요."
      className={
        "rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 " +
        className
      }
    >
      [현행]
    </span>
  );
}
