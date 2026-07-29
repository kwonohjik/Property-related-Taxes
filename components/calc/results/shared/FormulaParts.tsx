"use client";

/**
 * 결과 화면 산식 공용 파츠 (전 세목 결과뷰 공통).
 *
 * - `Frac`: `× (A ÷ B)` 한 줄 나열 대신 분자/분모 세로 분수 표기.
 * - `FLine`: `|` 같은 인라인 구분자 대신 줄바꿈 단락.
 *
 * 정책: 결과 산식은 한국어 풀어쓰기 + 분수·괄호로 구조 표현, 구분자는 줄바꿈
 * (2026-07-22 사용자 지시, MixedUseResultCard에서 시작해 전 결과뷰 공통화).
 */

export function Frac({ top, bottom }: { top: React.ReactNode; bottom: React.ReactNode }) {
  return (
    <span className="inline-flex flex-col items-center align-middle text-center leading-tight mx-0.5">
      <span className="px-1">{top}</span>
      <span className="px-1 border-t border-muted-foreground/40">{bottom}</span>
    </span>
  );
}

export function FLine({ children }: { children: React.ReactNode }) {
  return <span className="block">{children}</span>;
}
