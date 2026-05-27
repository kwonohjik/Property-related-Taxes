"use client";

/**
 * EstateCommonAttributesSection — 자산 카드 공통속성 4블록
 *
 * 상장주식·비상장주식(간편/정식 모드 무관) 모두 평가 방식과 무관하게
 * 상속세 모드에서 카드 하단에 단일 노출.
 *
 * 포함 블록:
 *   1. 영농상속 자산 분류 (FarmingCategorySection)
 *   2. 가업상속 자산 분류 (FamilyBusinessCategorySection)
 *   3. 법인 사업무관자산 차감 (CorporateNonBusinessAssetsSection)
 *   4. §22 금융재산공제 (FinancialDeductionChip)
 *   5. hidden_expandable 펼침 영역
 *   6. 협의분할 (HeirAllocationToggleSection) — heirs 있을 때만
 *
 * 사용처:
 *   - StockValuationForm.tsx: ListedStockEditor, UnlistedStockCard
 *
 * 공용화 제약:
 *   - mode === "gift" 또는 heirs 없으면 협의분할 비노출 (C-6/C-7)
 *   - visibility는 resolveAssetToggleVisibility(item)으로 내부에서 도출
 *   - hidden_expandable 패턴은 기존 ListedStockEditor 로직 그대로 보존
 *
 * 정책:
 *   [[feedback_tailwind_static_tone_mapping]] — dynamic class 금지
 *   [[feedback_three_state_optional_mode_toggle]] — 공통속성은 모드와 무관하게 단일 노출
 */

import { useMemo, useState } from "react";
import { FarmingCategorySection } from "@/components/calc/inheritance/FarmingCategorySection";
import { FamilyBusinessCategorySection } from "@/components/calc/inheritance/FamilyBusinessCategorySection";
import { CorporateNonBusinessAssetsSection } from "@/components/calc/inheritance/CorporateNonBusinessAssetsSection";
import { FinancialDeductionChip } from "@/components/calc/inheritance/FinancialDeductionChip";
import { HeirAllocationToggleSection } from "@/components/calc/inheritance/HeirAllocationToggleSection";
import { MajorShareholderStockToggle } from "@/components/calc/inheritance/unlisted-stock-v2/MajorShareholderStockToggle";
import {
  HintBadge,
  getFamilyBusinessHint,
  getFinancialDeductionHint,
} from "@/components/calc/inheritance/AssetToggleHints";
import {
  countHiddenExpandable,
  resolveAssetToggleVisibility,
} from "@/lib/calc/asset-toggle-visibility";
import { resolveUnlistedDisplayMode } from "@/lib/calc/stock-valuation";
import type { EstateItem, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// Props
// ============================================================

export interface EstateCommonAttributesSectionProps {
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
  /** "inheritance" 시 4블록 전체 노출. "gift" 시 전체 비노출 (C-6/C-7) */
  mode: "inheritance" | "gift";
  /** 협의분할 후보 상속인 목록 — 없으면 협의분할 섹션 비노출 */
  heirs?: Heir[];
  /**
   * 협의분할 effectiveValuation — 선택 모드에 따른 현재 평가액
   * (상장: 평균가×주식수, 비상장 간편: perShareFinalValue×ownedShares,
   *  비상장 정식: evaluateUnlistedStockV2().totalValuation)
   */
  effectiveValuation: number;
}

// ============================================================
// 컴포넌트
// ============================================================

export function EstateCommonAttributesSection({
  item,
  onUpdate,
  mode,
  heirs,
  effectiveValuation,
}: EstateCommonAttributesSectionProps) {
  // gift 모드이면 전체 비노출 (C-6/C-7)
  if (mode !== "inheritance") return null;

  return (
    <EstateCommonAttributesSectionInner
      item={item}
      onUpdate={onUpdate}
      heirs={heirs}
      effectiveValuation={effectiveValuation}
    />
  );
}

// 내부 컴포넌트 (hooks 사용을 위해 조건부 early return 분리)
interface InnerProps {
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
  heirs?: Heir[];
  effectiveValuation: number;
}

function EstateCommonAttributesSectionInner({
  item,
  onUpdate,
  heirs,
  effectiveValuation,
}: InnerProps) {
  const visibility = useMemo(() => resolveAssetToggleVisibility(item), [item]);
  const hiddenExpandableCount = countHiddenExpandable(visibility);
  const [showExpanded, setShowExpanded] = useState(false);

  /**
   * §22② 최대주주 토글 표시 조건 (D-3, F-1):
   *   - 상장주식: 항상 표시
   *   - 비상장주식 simple(V1): 표시
   *   - 비상장주식 formal(V2): skip — UnlistedStockV2Card 내부 토글이 담당 (S-4 중복 방지)
   */
  const showSection22Toggle =
    item.category === "listed_stock" ||
    (item.category === "unlisted_stock" && resolveUnlistedDisplayMode(item) === "simple");

  return (
    <>
      {/* 영농상속 자산 분류 — 카테고리별 자동 노출 */}
      {visibility.farming === "default" && (
        <FarmingCategorySection item={item} onUpdate={onUpdate} />
      )}

      {/* 가업상속 자산 분류 — 카테고리별 자동 노출 */}
      {visibility.familyBusiness === "default" && (
        <FamilyBusinessCategorySection item={item} onUpdate={onUpdate} />
      )}

      {/* 법인 사업무관자산 차감 (§15⑤2호 + §16⑤2호) */}
      <CorporateNonBusinessAssetsSection item={item} onUpdate={onUpdate} />

      {/* §22 금융재산공제 — 카테고리별 자동 노출 */}
      {visibility.financialDeduction === "default" && (
        <FinancialDeductionChip item={item} onUpdate={onUpdate} />
      )}

      {/* hidden_expandable 펼침 영역 */}
      {hiddenExpandableCount > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowExpanded((v) => !v)}
            aria-expanded={showExpanded}
            aria-controls={`expandable-common-${item.id}`}
            className="text-xs text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-300 py-1"
          >
            {showExpanded
              ? "▲ 적용 옵션 접기"
              : `▼ 더 많은 적용 옵션 보기 (${hiddenExpandableCount}개)`}
          </button>
          {showExpanded && (
            <div id={`expandable-common-${item.id}`} className="space-y-2">
              {visibility.familyBusiness === "hidden_expandable" && (
                <div>
                  <HintBadge tone="amber">{getFamilyBusinessHint(item.category)}</HintBadge>
                  <FamilyBusinessCategorySection item={item} onUpdate={onUpdate} />
                </div>
              )}
              {visibility.financialDeduction === "hidden_expandable" && (
                <div>
                  <HintBadge tone="emerald">{getFinancialDeductionHint(item.category)}</HintBadge>
                  <FinancialDeductionChip item={item} onUpdate={onUpdate} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* §22② 최대주주 보유주식 금융재산공제 배제 토글 (D-3, F-1) */}
      {/* 상장·비상장V1(simple)에서만 렌더. 비상장V2(formal)는 UnlistedStockV2Card 내부 담당(S-4). */}
      {showSection22Toggle && (
        <MajorShareholderStockToggle
          checked={item.isSection22MajorShareholder ?? false}
          onCheckedChange={(v) => onUpdate({ ...item, isSection22MajorShareholder: v })}
        />
      )}

      {/* 협의분할 (heirs 있을 때만) */}
      {heirs && (
        <HeirAllocationToggleSection
          item={item}
          heirs={heirs}
          effectiveValuation={effectiveValuation}
          onChange={(patch) => onUpdate({ ...item, ...patch })}
        />
      )}
    </>
  );
}
