"use client";

/**
 * CollapsibleHintCard — 장황한 설명형 도움말을 기본 접힘으로 노출하는 공용 카드.
 *
 * 입력 폼이 안내문으로 빽빽해 정작 중요한 메시지(검증 오류·차단)가 묻히는 문제를
 * 완화하기 위해, "왜·어떻게"류 서술 설명을 기본 접힘 + 토글로 강등한다.
 *
 * 설계 원칙 (계획서 docs/00-pm/inheritance-gift-help-declutter.plan.md):
 *  - 기본 접힘(defaultOpen=false). 요약 한 줄(summary)만 항상 노출.
 *  - 표준 토글(ExpandToggleButton — expandToggleClass/Label)로 모양 통일.
 *  - 인쇄 시 본문 자동 노출: 접힌 본문은 `hidden print:block`(print-only-css-toggle 정책).
 *    → 화면에선 접혀도 PDF에는 법적 설명이 남는다(GR-1 법적 정보 숨김 방지).
 *  - 상태는 로컬 useState — useEffect→store 미러링 금지(feedback_useeffect_store_mirror_forbidden).
 *  - tone은 정적 Record 매핑(feedback_tailwind_static_tone_mapping — dynamic bg-${tone} 금지).
 *
 * ⚠️ 검증 오류·차단 경고·법정 한도 수치는 이 카드에 넣지 말 것(접기 대상 아님).
 *    서술형 설명·요건 해설·적용범위 안내에만 사용한다.
 */

import { useState, type ReactNode } from "react";
import {
  expandToggleClass,
  expandToggleLabel,
  type ExpandTone,
} from "@/components/calc/results/shared/ExpandToggleButton";
import { TONE } from "@/components/calc/shared/tones";
import type { Tone } from "@/components/calc/shared/tones";

// 톤은 tones.ts canonical 소스에서만 (feedback_tailwind_static_tone_mapping)
export type HintCardTone = Tone;

export function CollapsibleHintCard({
  tone = "slate",
  summary,
  defaultOpen = false,
  children,
}: {
  tone?: HintCardTone;
  /** 항상 노출되는 요약 한 줄 (토글 라벨 뒤에 표시) */
  summary: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`rounded-lg border p-3 text-xs ${TONE[tone].card}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={expandToggleClass(tone as ExpandTone)}
      >
        {expandToggleLabel(open)} · {summary}
      </button>
      {/* 접혀도 인쇄 시 자동 노출 (print-only-css-toggle) */}
      <div className={open ? "mt-2" : "mt-2 hidden print:block"}>{children}</div>
    </div>
  );
}
