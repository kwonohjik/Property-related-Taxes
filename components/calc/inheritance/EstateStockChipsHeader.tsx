"use client";

/**
 * EstateStockChipsHeader — 주식 자산 카드 상단 헤더 칩 + ⚙️ 옵션
 *
 * Plan estate-card-followup-phase2 §FU-2·PR-E
 *
 * 정책:
 *   - 기존 EstateCommonAttributesSection 직렬 5섹션과 병행 노출 (호환 우선)
 *   - chip-major-shareholder만 추가 — 빠른 토글 진입점
 *   - ⚙️ 옵션 펼침 시 EstateItemAdvancedPanel 노출 (stock §22 override)
 *   - V1(상장·simple) 시 노출 / V2(formal)는 카드 내부 자체 토글 → 본 헤더 미노출
 *   - 기존 MajorShareholderStockToggle은 그대로 유지 (e2e 텍스트 셀렉터 보존)
 */

import { useMemo, useState } from "react";
import { EstateItemHeader } from "@/components/calc/inheritance/estate-card/EstateItemHeader";
import { EstateChipInlineExpand } from "@/components/calc/inheritance/estate-card/EstateChipInlineExpand";
import { EstateItemAdvancedPanel } from "@/components/calc/inheritance/estate-card/EstateItemAdvancedPanel";
import { createChipClickHandler } from "@/components/calc/inheritance/estate-card/handleChipClick";
import {
  countNonDefaultOptions,
  resolveChips,
  type ChipKey,
  type ChipState,
} from "@/components/calc/inheritance/estate-card/chip-config";
import { resolveAssetToggleVisibility } from "@/lib/calc/asset-toggle-visibility";
import type {
  EstateItem,
  Heir,
} from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * EstateCommonAttributesSection이 직렬 섹션(FarmingCategorySection·FamilyBusinessCategorySection·
 * HeirAllocationToggleSection)으로도 렌더하는 칩 — 주식 헤더에서는 제외해 인라인 패널 ↔ 직렬 중복 방지(D-O1).
 * 주식 헤더의 의도된 칩 집합은 estimated-value·classification·section22·major-shareholder·secured-claim
 * (estate-stock-chips-header.test 기준). 부동산은 자체 헤더라 무관.
 */
const SERIAL_RENDERED_CHIPS: ReadonlySet<ChipKey> = new Set<ChipKey>([
  "farming",
  "family-business",
  "heir-allocation",
]);

export interface EstateStockChipsHeaderProps {
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
  heirs?: Heir[];
  /** stock 카드별 평가액 (평균가×주식수 또는 V1·V2 모드 결과) — 협의분할 인라인 패널에 전달 */
  effectiveValuation: number;
  /** V1(상장·simple) 시 chip-major-shareholder 노출. V2(formal)는 false (카드 내부 자체 토글 중복 방지) */
  showMajorShareholderChip: boolean;
  /** PropertyValuationForm.ItemEditor 동일 패턴 — 카드 카테고리 라벨 */
  icon: string;
  categoryLabel: string;
  index: number;
}

export function EstateStockChipsHeader({
  item,
  onUpdate,
  heirs,
  effectiveValuation,
  showMajorShareholderChip,
  icon,
  categoryLabel,
  index,
}: EstateStockChipsHeaderProps) {
  const [inlineExpandedKey, setInlineExpandedKey] = useState<ChipKey | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const visibility = resolveAssetToggleVisibility(item);
  const heirsCount = heirs?.length ?? 0;

  const chips: ChipState[] = useMemo(
    () =>
      resolveChips({
        item,
        mode: "inheritance",
        heirsCount,
        showMajorShareholderChip,
      }).filter((c) => !SERIAL_RENDERED_CHIPS.has(c.key)),
    [item, heirsCount, showMajorShareholderChip],
  );

  const advancedBadgeCount = useMemo(
    () => countNonDefaultOptions(item, "inheritance"),
    [item],
  );

  const handleChipClick = useMemo(
    () =>
      createChipClickHandler({
        item,
        onUpdate,
        setInlineExpandedKey,
        heirs,
        effectiveValuation,
        currentExpandedKey: inlineExpandedKey,
      }),
    [item, onUpdate, heirs, effectiveValuation, inlineExpandedKey],
  );

  // PR-E INT-8: stock visibility=hidden_permanent + 사용자 §22 명시 시 ⚙️ 패널에 FinancialDeductionChip 노출
  const showSection22Override =
    visibility.financialDeduction === "hidden_permanent" &&
    item.isFinancialAssetForDeduction !== undefined;

  return (
    <div className="space-y-2" data-testid={`estate-stock-chips-header-${item.id}`}>
      <EstateItemHeader
        itemId={item.id}
        icon={icon}
        categoryLabel={categoryLabel}
        index={index}
        chips={chips}
        expandedKey={inlineExpandedKey}
        onChipClick={handleChipClick}
        advancedOpen={advancedOpen}
        onToggleAdvanced={() => setAdvancedOpen((v) => !v)}
        advancedBadgeCount={advancedBadgeCount}
        onRemove={() => {
          // 주식 카드 자체 삭제는 호출자(StockValuationForm)가 담당 — 본 헤더는 삭제 미노출
          // EstateItemHeader 시그니처 호환 위해 noop
        }}
      />
      <EstateChipInlineExpand
        expandedKey={inlineExpandedKey}
        itemId={item.id}
        item={item}
        onUpdate={onUpdate}
        heirs={heirs}
        effectiveValuation={effectiveValuation}
        onClose={() => setInlineExpandedKey(null)}
      />
      {advancedOpen && (
        <EstateItemAdvancedPanel
          itemId={item.id}
          item={item}
          onUpdate={onUpdate}
          showSecuredClaimSubFields={false}
          showSection22Override={showSection22Override}
        />
      )}
    </div>
  );
}
