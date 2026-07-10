/**
 * anchor: 톤 canonical 소스(tones.ts) 회귀 0 동결.
 *
 * card·toggle 표면은 리팩터 전 HINT_CARD_TONE·EXPAND_TONE_CLASS 문자열과 **글자 그대로 1:1**.
 * 이 값이 바뀌면 기존 카드/토글 색이 바뀐 것 → 실패시켜 시각 회귀를 차단한다.
 *
 * 계획서: docs/02-design/features/ui-color-tone-tokenization.plan.md §8
 */
import { describe, it, expect } from "vitest";
import { TONE, stripDark, type Tone } from "@/components/calc/shared/tones";
import { expandToggleClass } from "@/components/calc/results/shared/ExpandToggleButton";

const TONES: Tone[] = ["sky", "emerald", "amber", "violet", "rose", "slate"];

// 리팩터 전 HINT_CARD_TONE (카드 외곽) 동결
const FROZEN_CARD: Record<Tone, string> = {
  sky: "border-sky-200 bg-sky-50/40 dark:border-sky-800 dark:bg-sky-900/15",
  emerald: "border-emerald-200 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-900/15",
  amber: "border-amber-200 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-900/15",
  violet: "border-violet-200 bg-violet-50/40 dark:border-violet-800 dark:bg-violet-900/15",
  rose: "border-rose-200 bg-rose-50/40 dark:border-rose-800 dark:bg-rose-900/15",
  slate: "border-slate-200 bg-slate-50/40 dark:border-slate-700 dark:bg-slate-800/20",
};

// 리팩터 전 EXPAND_TONE_CLASS (펼침 토글, blue 제외 6톤) 동결
const FROZEN_TOGGLE: Record<Tone, string> = {
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
};

describe("TONE canonical 톤 소스", () => {
  it("정확히 6톤(카드 축)만 정의 — blue/green/red 등 비대상 제외", () => {
    expect(Object.keys(TONE).sort()).toEqual([...TONES].sort());
  });

  it.each(TONES)("card 표면이 기존 HINT_CARD_TONE와 1:1 (회귀 0) — %s", (t) => {
    expect(TONE[t].card).toBe(FROZEN_CARD[t]);
  });

  it.each(TONES)("toggle 표면이 기존 EXPAND_TONE_CLASS와 1:1 (회귀 0) — %s", (t) => {
    expect(TONE[t].toggle).toBe(FROZEN_TOGGLE[t]);
  });

  it.each(TONES)("모든 표면이 정적 문자열(동적 보간 없음) — %s", (t) => {
    for (const surf of Object.values(TONE[t])) {
      expect(surf).not.toContain("${");
      expect(surf.length).toBeGreaterThan(0);
    }
  });
});

describe("ExpandToggleButton 파생 (회귀 0)", () => {
  it.each(TONES)("expandToggleClass(t) 가 TONE[t].toggle 포함 — %s", (t) => {
    expect(expandToggleClass(t)).toContain(TONE[t].toggle);
  });

  it("blue 는 리터럴 유지로 계속 동작", () => {
    expect(expandToggleClass("blue")).toContain("text-blue-700");
  });
});

describe("stripDark (dark 미대응 레거시 카드 회귀 0 전환용)", () => {
  it("dark: 세그먼트만 제거하고 light 클래스는 보존", () => {
    expect(stripDark(TONE.rose.card)).toBe("border-rose-200 bg-rose-50/40");
    expect(stripDark(TONE.amber.badge)).toBe("bg-amber-200 text-amber-800");
    expect(stripDark(TONE.sky.title)).toBe("text-sky-700");
  });
  it.each(["sky", "emerald", "amber", "violet", "rose", "slate"] as Tone[])(
    "stripDark 결과에 dark: 없음 — %s",
    (t) => {
      expect(stripDark(TONE[t].card)).not.toContain("dark:");
      expect(stripDark(TONE[t].badge)).not.toContain("dark:");
    },
  );
});
