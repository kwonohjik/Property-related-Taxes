"use client";

/**
 * EstateItemAdvancedPanel — ⚙️ 고급 옵션 펼침 패널
 *
 * Plan §3.4 · Design D-O1·D-O2 (단일 인스턴스 정책):
 *   - 분류·분할·영농·가업 = 인라인 펼침 단일 위치 (본 패널 미렌더)
 *   - 본 패널 노출 항목:
 *     · EstimatedValuePreview (상세 우선순위 표)
 *     · hidden_expandable (§22·영농·가업 visibility=hidden_expandable인 경우)
 *     · §22 사용자 지정 시 "기본값으로 되돌리기" 경로 (FinancialDeductionChip)
 *     · §14 자동공제 보조 입력 (securedClaimIsFinancialDebt + 채권자명)
 *
 * 정책: useEffect → store 미러링 0
 *       inline 자동 펼침은 부모 Shell의 onUpdate 콜백에서 처리
 */

import { useState } from "react";
import { EstimatedValuePreview } from "@/components/calc/property-valuation-preview";
import {
  expandToggleClass,
  expandToggleLabel,
} from "@/components/calc/results/shared/ExpandToggleButton";
import { FinancialDeductionChip } from "@/components/calc/inheritance/FinancialDeductionChip";
import { FarmingCategorySection } from "@/components/calc/inheritance/FarmingCategorySection";
import { FamilyBusinessCategorySection } from "@/components/calc/inheritance/FamilyBusinessCategorySection";
import { CulturalHeritageSection } from "@/components/calc/inheritance/CulturalHeritageSection";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import {
  HintBadge,
  getFamilyBusinessHint,
  getFinancialDeductionHint,
} from "@/components/calc/inheritance/AssetToggleHints";
import {
  resolveAssetToggleVisibility,
  resolveCulturalHeritageVisibility,
} from "@/lib/calc/asset-toggle-visibility";
import { EstateValuationMetaSection } from "./EstateValuationMetaSection";
import type {
  EstateItem,
  AssetCategory,
} from "@/lib/tax-engine/types/inheritance-gift.types";

export interface EstateItemAdvancedPanelProps {
  itemId: string;
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
  /** 본체에 §14 ToggleCard가 있을 때, ⚙️ 안에는 보조 입력만 노출 */
  showSecuredClaimSubFields: boolean;
  /**
   * Phase 2 INT-8: 주식 자산 등에서 visibility.financialDeduction=hidden_permanent임에도
   * 사용자가 isFinancialAssetForDeduction 명시 override한 경우 FinancialDeductionChip 노출.
   * 기본 false — backwards-compat.
   */
  showSection22Override?: boolean;
  /**
   * D-4: 상속개시일 — FarmingCategorySection §16⑤1호 2년 요건 자동판정 배지용.
   * 미전달 시 수동 ToggleCard fallback.
   */
  deathDate?: string;
}

export function EstateItemAdvancedPanel({
  itemId,
  item,
  onUpdate,
  showSecuredClaimSubFields,
  showSection22Override = false,
  deathDate,
}: EstateItemAdvancedPanelProps) {
  const cat = item.category as AssetCategory;
  const visibility = resolveAssetToggleVisibility(item);
  const chVisibility = resolveCulturalHeritageVisibility(item);
  const [showHiddenExpandable, setShowHiddenExpandable] = useState(false);

  const set = (patch: Partial<EstateItem>) => onUpdate({ ...item, ...patch });

  const hiddenItems: Array<"financialDeduction" | "farming" | "familyBusiness"> = [];
  if (visibility.financialDeduction === "hidden_expandable") hiddenItems.push("financialDeduction");
  if (visibility.farming === "hidden_expandable") hiddenItems.push("farming");
  if (visibility.familyBusiness === "hidden_expandable") hiddenItems.push("familyBusiness");

  return (
    <div
      id={`estate-advanced-panel-${itemId}`}
      data-testid={`estate-advanced-panel-${itemId}`}
      className={[
        "mt-3 rounded-md p-4 space-y-3",
        "border border-slate-200 bg-slate-50/40",
        "dark:border-slate-700 dark:bg-slate-900/40",
        "animate-in fade-in slide-in-from-top-2 duration-200",
        "print:block",
      ].join(" ")}
    >
      {/* 예상 평가 우선순위 (재사용) */}
      <div>
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
          예상 평가 우선순위
        </p>
        <EstimatedValuePreview item={item} />
      </div>

      {/* 상속개시자료 요약 4표 — Table A 비고/수량 (2026-05-28) */}
      <EstateValuationMetaSection item={item} onUpdate={onUpdate} />

      {/* §74 지정문화유산 등 징수유예 (상증법 §74) — 부동산·기타 노출, 주식·금융 제외 */}
      {chVisibility !== "hidden_permanent" && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-2">
          <CulturalHeritageSection item={item} onUpdate={onUpdate} />
        </div>
      )}

      {/* §22 기본값 되돌리기 (사용자 지정 상태일 때 — visibility=default)
       *  Phase 2 INT-8: showSection22Override=true 시 hidden_permanent에서도 노출 */}
      {((visibility.financialDeduction === "default" &&
        item.isFinancialAssetForDeduction !== undefined) ||
        (showSection22Override &&
          visibility.financialDeduction === "hidden_permanent" &&
          item.isFinancialAssetForDeduction !== undefined)) && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-2">
          <FinancialDeductionChip item={item} onUpdate={onUpdate} />
        </div>
      )}

      {/* hidden_expandable 펼침 */}
      {hiddenItems.length > 0 && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-2 space-y-2">
          <button
            type="button"
            onClick={() => setShowHiddenExpandable((v) => !v)}
            aria-expanded={showHiddenExpandable}
            className={expandToggleClass("slate")}
          >
            {expandToggleLabel(showHiddenExpandable)} · 추가 옵션 ({hiddenItems.length}개)
          </button>
          {showHiddenExpandable && (
            <div className="space-y-2">
              {hiddenItems.includes("financialDeduction") && (
                <div>
                  <HintBadge tone="emerald">{getFinancialDeductionHint(cat)}</HintBadge>
                  <FinancialDeductionChip item={item} onUpdate={onUpdate} />
                </div>
              )}
              {hiddenItems.includes("farming") && (
                <div>
                  <HintBadge tone="amber">영농상속 자산 (시행령 §16⑤)</HintBadge>
                  <FarmingCategorySection item={item} onUpdate={onUpdate} deathDate={deathDate} />
                </div>
              )}
              {hiddenItems.includes("familyBusiness") && (
                <div>
                  <HintBadge tone="amber">{getFamilyBusinessHint(cat)}</HintBadge>
                  <FamilyBusinessCategorySection item={item} onUpdate={onUpdate} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* §14 보조 입력 (저당채무 ON 상태일 때만) */}
      {showSecuredClaimSubFields && item.deductSecuredClaimAsDebt && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-2 space-y-2">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
            §14 담보채무 자동공제 — 보조 입력
          </p>
          <ToggleCard
            lawLinks="상증법"
            tone="rose"
            size="sm"
            title="저당채무가 금융회사 채무 (§22 순금융 차감)"
            description="은행 등 §10①1호 입증 금융회사 저당이면 ON. 임대보증금은 §22 대상 아님(자동 제외)."
            checked={item.securedClaimIsFinancialDebt ?? false}
            onCheckedChange={(v) =>
              set({ securedClaimIsFinancialDebt: v || undefined })
            }
            disabled={(item.mortgageAmount ?? 0) === 0}
            disabledReason="저당채권액이 없으면 §22 금융채무 차감 무관"
          />
          <div className="pt-1">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              채권자명 (선택)
            </label>
            <input
              type="text"
              value={item.securedClaimCreditorName ?? ""}
              onChange={(e) =>
                set({ securedClaimCreditorName: e.target.value || undefined })
              }
              placeholder="채권자·내용 (미입력 시 자산명 담보채무)"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
      )}
    </div>
  );
}
