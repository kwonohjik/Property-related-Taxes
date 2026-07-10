/**
 * tones.ts — 안내/섹션 카드용 시맨틱 톤 단일 소스 (canonical)
 *
 * 흩어진 톤 하드코딩(8,580회·371파일)의 신규 primitive용 canonical 소스.
 * 설계·근거: docs/02-design/features/ui-color-tone-tokenization.plan.md
 *
 * 정책: feedback_tailwind_static_tone_mapping — 모든 문자열 정적(dynamic `bg-${tone}` 금지).
 *   `Record<Tone, ToneSurface>` 타입이 톤 추가 시 표면 누락을 컴파일 타임에 catch.
 *
 * 의미(2축 — components/calc/CLAUDE.md 문서화):
 *   sky=면적·규모·일반정보 · emerald=양도/긍정·확정 · amber=취득/주의 ·
 *   violet=거주·자격 · rose=지역·지정 · slate=중립·기본
 *
 * 소비자: <ToneCard>(card/title/badge/chip) · CollapsibleHintCard(card 파생) ·
 *         ExpandToggleButton(toggle 파생, 6톤분). green/red/blue/fuchsia/indigo/공식서식 톤은
 *         비-대상(계획서 §2.2·§4.2) — 이 소스에 미포함.
 *
 * ⚠ card·toggle 문자열은 기존 HINT_CARD_TONE·EXPAND_TONE_CLASS와 **글자 그대로 1:1**
 *   (회귀 0). 변경 시 __tests__/components/tones.test.ts 가 잡는다.
 */

export type Tone = "sky" | "emerald" | "amber" | "violet" | "rose" | "slate";

export interface ToneSurface {
  /** 카드 외곽 (ToneCard·CollapsibleHintCard) = 기존 HINT_CARD_TONE */
  card: string;
  /** 섹션/안내 제목 텍스트 */
  title: string;
  /** 번호배지·상태 pill (bg-{t}-200 계열) */
  badge: string;
  /** 자동계산 결과박스·연한 상태칩 (bg-{t}-100 계열) */
  chip: string;
  /** 펼침 토글 버튼 = 기존 EXPAND_TONE_CLASS (blue 제외 6톤분) */
  toggle: string;
}

export const TONE: Record<Tone, ToneSurface> = {
  sky: {
    card: "border-sky-200 bg-sky-50/40 dark:border-sky-800 dark:bg-sky-900/15",
    title: "text-sky-700 dark:text-sky-300",
    badge: "bg-sky-200 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
    toggle:
      "border-sky-300 text-sky-700 hover:bg-sky-100 dark:border-sky-600 dark:text-sky-300 dark:hover:bg-sky-900/40",
  },
  emerald: {
    card: "border-emerald-200 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-900/15",
    title: "text-emerald-700 dark:text-emerald-300",
    badge: "bg-emerald-200 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    toggle:
      "border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-600 dark:text-emerald-300 dark:hover:bg-emerald-900/40",
  },
  amber: {
    card: "border-amber-200 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-900/15",
    title: "text-amber-700 dark:text-amber-300",
    badge: "bg-amber-200 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    toggle:
      "border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/40",
  },
  violet: {
    card: "border-violet-200 bg-violet-50/40 dark:border-violet-800 dark:bg-violet-900/15",
    title: "text-violet-700 dark:text-violet-300",
    badge: "bg-violet-200 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
    toggle:
      "border-violet-300 text-violet-700 hover:bg-violet-100 dark:border-violet-600 dark:text-violet-300 dark:hover:bg-violet-800/40",
  },
  rose: {
    card: "border-rose-200 bg-rose-50/40 dark:border-rose-800 dark:bg-rose-900/15",
    title: "text-rose-700 dark:text-rose-300",
    badge: "bg-rose-200 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
    toggle:
      "border-rose-300 text-rose-700 hover:bg-rose-100 dark:border-rose-600 dark:text-rose-300 dark:hover:bg-rose-900/40",
  },
  slate: {
    card: "border-slate-200 bg-slate-50/40 dark:border-slate-700 dark:bg-slate-800/20",
    title: "text-slate-700 dark:text-slate-300",
    badge: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-300",
    chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    toggle:
      "border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/40",
  },
};

/**
 * dark: 변형 제거 — dark 미대응 레거시 카드를 **회귀 0**으로 ToneCard에 태울 때 사용.
 * 예: 스톡양도 ForeignStock/ExitTax의 SectionBox는 원래 light 전용이라, dark를 새로 입히면
 *     내부 콘텐츠(light 전용)와 불일치 → `<ToneCard noDark>`로 원본 외관 그대로 보존.
 */
export function stripDark(surface: string): string {
  return surface
    .split(" ")
    .filter((c) => !c.startsWith("dark:"))
    .join(" ");
}
