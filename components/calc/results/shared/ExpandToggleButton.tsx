"use client";

/**
 * ExpandToggleButton — 결과 화면 펼침/접힘 토글 버튼 (공용 · 모양 통일)
 *
 * 모든 결과 카드의 펼치기 버튼 크기·모양을 단일 출처로 통일.
 * 라벨은 "▼ 펼치기" / "▲ 접기" 고정 (장식 문구 없음).
 * print-only-css-toggle 패턴과 함께 사용 — 버튼은 print:hidden, 본문은 hidden print:block.
 *
 * 헤더 전체가 클릭 영역인 카드(SourceDataSummarySection)는 중첩 button 금지로
 * expandToggleClass()/expandToggleLabel()를 span에 적용 (시각만 통일).
 *
 * 정책: feedback_tailwind_static_tone_mapping — tone은 정적 Record 매핑 (JIT purge 회피).
 */

export type ExpandTone =
  | "sky"
  | "violet"
  | "slate"
  | "rose"
  | "emerald"
  | "amber"
  | "blue";

const EXPAND_TONE_CLASS: Record<ExpandTone, string> = {
  sky: "border-sky-300 text-sky-700 hover:bg-sky-100 dark:border-sky-600 dark:text-sky-300 dark:hover:bg-sky-900/40",
  violet:
    "border-violet-300 text-violet-700 hover:bg-violet-100 dark:border-violet-600 dark:text-violet-300 dark:hover:bg-violet-800/40",
  slate:
    "border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/40",
  rose: "border-rose-300 text-rose-700 hover:bg-rose-100 dark:border-rose-600 dark:text-rose-300 dark:hover:bg-rose-900/40",
  emerald:
    "border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-600 dark:text-emerald-300 dark:hover:bg-emerald-900/40",
  amber:
    "border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/40",
  blue: "border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-600 dark:text-blue-300 dark:hover:bg-blue-900/40",
};

const EXPAND_BASE =
  "shrink-0 inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors print:hidden";

/** 버튼/배지 공용 클래스 (헤더 전체 클릭 카드의 span 등에 직접 적용) */
export function expandToggleClass(tone: ExpandTone = "slate"): string {
  return `${EXPAND_BASE} ${EXPAND_TONE_CLASS[tone]}`;
}

/** 통일 라벨 — "▼ 펼치기" / "▲ 접기" */
export function expandToggleLabel(open: boolean): string {
  return open ? "▲ 접기" : "▼ 펼치기";
}

export function ExpandToggleButton({
  open,
  onClick,
  tone = "slate",
}: {
  open: boolean;
  onClick: () => void;
  tone?: ExpandTone;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-expanded={open}
      className={expandToggleClass(tone)}
    >
      {expandToggleLabel(open)}
    </button>
  );
}
