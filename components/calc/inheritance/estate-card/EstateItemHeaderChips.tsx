"use client";

/**
 * EstateItemHeaderChips — 자산 카드 헤더 칩 영역
 *
 * Plan: docs/01-plan/estate-item-card-compaction.plan.md (v4)
 * UI Visual: docs/02-design/features/estate-item-card-compaction.ui.visual.md
 *
 * 정책:
 *   - 칩 클릭 분기 (Plan §3.5 · D2-C2):
 *     · isExpandable=true → accordion (key 동일 시 닫힘)
 *     · isToggle=true     → 즉시 토글 (§22는 3-state 순환)
 *   - tone 정적 매핑 ([[feedback_tailwind_static_tone_mapping]])
 *   - useEffect 미러링 0 ([[feedback_useeffect_store_mirror_forbidden]])
 */

import { Check, ChevronDown, X } from "lucide-react";
import {
  CHIP_TONE_CLASSES,
  type ChipKey,
  type ChipState,
} from "./chip-config";

export interface EstateItemHeaderChipsProps {
  itemId: string;
  chips: ChipState[];
  /** 현재 인라인 펼친 칩 키 (없으면 null) */
  expandedKey: ChipKey | null;
  /** 칩 클릭 — Expandable이면 accordion, Toggle이면 토글 콜백 */
  onChipClick: (chip: ChipState) => void;
}

export function EstateItemHeaderChips({
  itemId,
  chips,
  expandedKey,
  onChipClick,
}: EstateItemHeaderChipsProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      data-testid={`estate-card-chips-${itemId}`}
    >
      {chips.map((chip) => {
        const isExpanded = chip.isExpandable && expandedKey === chip.key;
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => onChipClick(chip)}
            disabled={chip.key === "estimated-value"}
            aria-expanded={chip.isExpandable ? isExpanded : undefined}
            aria-pressed={chip.isToggle ? chip.mark === "on" : undefined}
            aria-controls={
              chip.isExpandable
                ? `estate-inline-expand-${chip.key}-${itemId}`
                : undefined
            }
            data-testid={`estate-chip-${chip.key}-${itemId}`}
            title={chip.tooltip}
            className={[
              "inline-flex items-center gap-1 rounded-full",
              "px-2.5 py-0.5 text-[11px] font-medium",
              "border transition-all duration-150",
              CHIP_TONE_CLASSES[chip.tone],
              chip.isUserOverride
                ? "ring-1 ring-violet-400 dark:ring-violet-500"
                : "",
              chip.key === "estimated-value"
                ? "cursor-default"
                : "hover:brightness-95 cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-indigo-400",
            ].join(" ")}
          >
            {chip.key === "estimated-value" && (
              <span className="text-[10px]" aria-hidden>
                ⓘ
              </span>
            )}
            <span>{chip.label}</span>
            {chip.mark === "on" && (
              <Check className="h-3.5 w-3.5" strokeWidth={3.5} aria-hidden />
            )}
            {chip.mark === "off" && (
              <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
            )}
            {chip.isExpandable && (
              <ChevronDown
                className={`h-3 w-3 transition-transform duration-150 ${
                  isExpanded ? "rotate-180" : ""
                }`}
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
