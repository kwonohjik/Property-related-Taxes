"use client";

/**
 * EstateChipInlineExpand — 칩 인라인 펼침 패널
 *
 * Plan: docs/01-plan/estate-item-card-compaction.plan.md (v4)
 * Design D-O1: 분류·분할·영농·가업의 입력 컴포넌트 유일한 렌더 위치
 *               (⚙️ 패널에서는 미노출하여 단일 인스턴스 보장)
 */

import { X } from "lucide-react";
import { DeemedCategorySection } from "@/components/calc/inheritance/DeemedCategorySection";
import { FarmingCategorySection } from "@/components/calc/inheritance/FarmingCategorySection";
import { FamilyBusinessCategorySection } from "@/components/calc/inheritance/FamilyBusinessCategorySection";
import { HeirAllocationToggleSection } from "@/components/calc/inheritance/HeirAllocationToggleSection";
import { computeEffectiveValuation } from "@/lib/calc/estate-item-valuation";
import { resolveAssetToggleVisibility } from "@/lib/calc/asset-toggle-visibility";
import type {
  EstateItem,
  Heir,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import {
  INLINE_PANEL_TONE_CLASSES,
  INLINE_PANEL_TITLE_CLASSES,
  type ChipKey,
  type ChipTone,
} from "./chip-config";

export interface EstateChipInlineExpandProps {
  expandedKey: ChipKey | null;
  itemId: string;
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
  heirs?: Heir[];
  onClose: () => void;
  /**
   * Phase 2 INT-2: 호출자(주식 카드 등)에서 자체 평가액(평균가×주식수 등) 전달.
   * 미전달 시 computeEffectiveValuation(item) fallback (현재 동작 — backwards-compat).
   */
  effectiveValuation?: number;
  /**
   * D-4: 상속개시일 — FarmingCategorySection §16⑤1호 2년 요건 자동판정 배지용.
   * 미전달 시 수동 ToggleCard fallback.
   */
  deathDate?: string;
}

const PANEL_TITLE: Record<ChipKey, string> = {
  "estimated-value": "",
  classification: "간주상속재산 분류 (§8·§9·§10)",
  section22: "",
  "heir-allocation": "상속인·수유자별 협의분할",
  farming: "영농상속 자산 분류 (§16⑤)",
  "family-business": "가업상속 자산 분류 (§15⑤)",
  "secured-claim-14": "",
  "major-shareholder": "",  // PR-B FU-2 — 즉시 토글, 패널 미렌더
};

const PANEL_TONE: Record<ChipKey, ChipTone> = {
  "estimated-value": "gray",
  classification: "violet",
  section22: "gray",
  "heir-allocation": "sky",
  farming: "violet",
  "family-business": "violet",
  "secured-claim-14": "amber",
  "major-shareholder": "rose",  // PR-B FU-2
};

export function EstateChipInlineExpand({
  expandedKey,
  itemId,
  item,
  onUpdate,
  heirs,
  onClose,
  effectiveValuation,
  deathDate,
}: EstateChipInlineExpandProps) {
  if (!expandedKey) return null;
  if (
    expandedKey === "estimated-value" ||
    expandedKey === "section22" ||
    expandedKey === "secured-claim-14" ||
    expandedKey === "major-shareholder"  // PR-B 즉시 토글 — 패널 미렌더
  ) {
    return null;
  }

  const tone = PANEL_TONE[expandedKey];
  const title = PANEL_TITLE[expandedKey];

  return (
    <div
      id={`estate-inline-expand-${expandedKey}-${itemId}`}
      data-testid={`estate-inline-expand-${expandedKey}-${itemId}`}
      className={[
        "mt-2 rounded-md p-3 space-y-2",
        INLINE_PANEL_TONE_CLASSES[tone],
        "animate-in fade-in slide-in-from-top-2 duration-200",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <p className={`text-xs font-semibold ${INLINE_PANEL_TITLE_CLASSES[tone]}`}>
          {title}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="패널 닫기"
          className="text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 px-1.5 py-0.5 rounded hover:bg-white/50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div>
        {expandedKey === "classification" && (
          <DeemedCategorySection
            item={item}
            onUpdate={onUpdate}
            retirementOptionVisibility={resolveAssetToggleVisibility(item).deemedRetirementOption}
          />
        )}
        {expandedKey === "heir-allocation" && heirs && (
          <HeirAllocationToggleSection
            item={item}
            heirs={heirs}
            effectiveValuation={effectiveValuation ?? computeEffectiveValuation(item)}
            onChange={(patch) => onUpdate({ ...item, ...patch })}
          />
        )}
        {expandedKey === "farming" && (
          <FarmingCategorySection item={item} onUpdate={onUpdate} deathDate={deathDate} />
        )}
        {expandedKey === "family-business" && (
          <FamilyBusinessCategorySection item={item} onUpdate={onUpdate} />
        )}
      </div>
    </div>
  );
}
