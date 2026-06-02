"use client";

/**
 * FbAutoCheckPreviewCard — 가업상속인 요건 자동판정 미리보기 카드 (~100줄)
 *
 * 4분기 정적 tone (feedback_tailwind_static_tone_mapping):
 *   emerald: 자동 충족
 *   rose:    자동 미충족
 *   amber:   입력 필요(null)
 *   sky:     자동 ≠ override 불일치
 *
 * 정책:
 *   - feedback_tailwind_static_tone_mapping (dynamic class 금지 → 정적 Record)
 *   - feedback_useeffect_store_mirror_forbidden (미리보기는 표시 전용)
 *   - feedback_result_view_korean_formula (산식 한국어)
 */

const TONE_STYLES: Record<"emerald" | "rose" | "amber" | "sky", {
  border: string;
  bg: string;
  text: string;
}> = {
  emerald: {
    border: "border-emerald-300",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    text: "text-emerald-800 dark:text-emerald-200",
  },
  rose: {
    border: "border-rose-300",
    bg: "bg-rose-50 dark:bg-rose-950/30",
    text: "text-rose-800 dark:text-rose-200",
  },
  amber: {
    border: "border-amber-300",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-800 dark:text-amber-200",
  },
  sky: {
    border: "border-sky-300",
    bg: "bg-sky-50 dark:bg-sky-950/30",
    text: "text-sky-800 dark:text-sky-200",
  },
};

interface Props {
  /** 자동판정 결과: true=충족 / false=미충족 / null=기초데이터 미입력 */
  autoMet: boolean | null;
  /** 수동 override 값 (undefined=자동 복귀) */
  override?: boolean;
  /** 산식·근거 설명 (한국어 풀어쓰기) */
  formula: string;
  /** 법령 조문 라벨 (예: "상증령 §15③2호 가") */
  lawLabel: string;
  /** 접근성 식별자 */
  testId?: string;
}

export function FbAutoCheckPreviewCard({ autoMet, override, formula, lawLabel, testId }: Props) {
  // 4분기 분류
  let tone: "emerald" | "rose" | "amber" | "sky";
  let icon: string;
  let message: string;

  if (autoMet === null) {
    tone = "amber";
    icon = "ℹ️";
    message = formula; // "종사시작일을 입력하면 자동판정" 등 안내 문구
  } else if (override !== undefined && override !== autoMet) {
    // 자동 ≠ override 불일치
    tone = "sky";
    icon = "⚠️";
    const autoLabel = autoMet ? "충족" : "미충족";
    const ovLabel = override ? "충족" : "미충족";
    message = `시스템 자동 ${autoLabel} → 수동 ${ovLabel}로 보정. 근거서류 보관 권장.`;
  } else if (autoMet) {
    tone = "emerald";
    icon = "✓";
    message = `충족 — ${formula}`;
  } else {
    tone = "rose";
    icon = "✗";
    message = `미충족 — ${formula}`;
  }

  const styles = TONE_STYLES[tone];

  return (
    <div
      data-testid={testId}
      className={`rounded-md border px-3 py-2 text-[11px] ${styles.border} ${styles.bg} ${styles.text}`}
    >
      <span className="font-semibold mr-1">{icon}</span>
      <span>{message}</span>
      <span className="ml-2 opacity-70 text-[10px]">{lawLabel}</span>
    </div>
  );
}
