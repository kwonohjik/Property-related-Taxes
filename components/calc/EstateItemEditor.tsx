"use client";

/**
 * EstateItemEditor — 자산 1건 편집 폼 (테이블 행 클릭 시 Dialog 모달 내용물)
 *
 * estate-asset-table-view.plan.md §5 · ui.design.md §5.
 * 기존 PropertyValuationForm.ItemEditor body에서 카드 외곽(EstateItemCardShell)·collapse를
 * 벗긴 것. 헤더 칩(인터랙티브)·VariantBody·ChipInlineExpand·AdvancedPanel·CategoryChangeDialog
 * 그대로 재사용. 모달이 곧 펼침 상태이므로 forceExpandKey(collapse 자동해제 신호)는 제거.
 *
 * 헤더 타이틀부(카테고리+번호)는 hideTitle=true로 숨김 — DialogTitle과 중복 제거(ui.design §5.3).
 */

import { useMemo, useState } from "react";
import { EstateItemHeader } from "@/components/calc/inheritance/estate-card/EstateItemHeader";
import { EstateChipInlineExpand } from "@/components/calc/inheritance/estate-card/EstateChipInlineExpand";
import { EstateItemAdvancedPanel } from "@/components/calc/inheritance/estate-card/EstateItemAdvancedPanel";
import { createChipClickHandler } from "@/components/calc/inheritance/estate-card/handleChipClick";
import { CategoryChangeDialog } from "@/components/calc/inheritance/estate-card/CategoryChangeDialog";
import {
  EstateBodySimple,
  EstateBodyRealEstate,
  EstateBodyDeposit,
} from "@/components/calc/inheritance/estate-card/variants";
import type {
  SupportedCategory as VariantSupportedCategory,
  VariantBodyProps,
} from "@/components/calc/inheritance/estate-card/variants/types";
import {
  countNonDefaultOptions,
  resolveChips,
  type ChipKey,
  type ChipState,
} from "@/components/calc/inheritance/estate-card/chip-config";
import { CorporateNonBusinessAssetsSection } from "@/components/calc/inheritance/CorporateNonBusinessAssetsSection";
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  type SupportedCategory,
} from "@/components/calc/inheritance/estate-card/estate-category-meta";
import type { EstateItem, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

/** variant body 호출 래퍼 — switch 분기로 컴포넌트 직접 렌더 (static-components lint 준수) */
function VariantBody(props: VariantBodyProps) {
  const cat = props.item.category as VariantSupportedCategory;
  switch (cat) {
    case "real_estate_land":
    case "real_estate_building":
    case "real_estate_apartment":
      return <EstateBodyRealEstate {...props} />;
    case "deposit":
      return <EstateBodyDeposit {...props} />;
    case "cash":
    case "financial":
    case "other":
      return <EstateBodySimple {...props} />;
  }
}

export interface EstateItemEditorProps {
  item: EstateItem;
  index: number;
  onUpdate: (updated: EstateItem) => void;
  onRemove: () => void;
  /** 상속세 모드에서 협의분할 토글·고급옵션 노출 — gift 모드는 미렌더 */
  mode: "inheritance" | "gift";
  /** 협의분할 분배 후보 — inheritance 모드에서만 의미 */
  heirs?: Heir[];
  /** 평가기준일 (상속개시일·증여일) — 기준시가 공시연도 기본값 계산용 */
  valuationDate?: string;
}

export function EstateItemEditor({
  item,
  index,
  onUpdate,
  onRemove,
  mode,
  heirs,
  valuationDate,
}: EstateItemEditorProps) {
  const cat = item.category as SupportedCategory;

  // 인라인 펼침 칩 키 + ⚙️ 패널 펼침 (accordion 단일). collapse 제거로 forceExpandKey 불필요.
  const [inlineExpandedKey, setInlineExpandedKey] = useState<ChipKey | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);

  // 헤더 칩 도출 (mode·heirs 의존)
  const chips: ChipState[] = useMemo(
    () => resolveChips({ item, mode, heirsCount: heirs?.length ?? 0 }),
    [item, mode, heirs],
  );
  const advancedBadgeCount = useMemo(
    () => countNonDefaultOptions(item, mode),
    [item, mode],
  );

  /**
   * 담보채무 §14 자동공제 토글 노출 조건:
   *   real_estate_land·apartment·building·deposit 카테고리
   *   AND (mortgageAmount > 0 OR leaseDeposit > 0)
   */
  const securedClaimTotal = (item.mortgageAmount ?? 0) + (item.leaseDeposit ?? 0);
  const showCollateralDeductToggle =
    mode === "inheritance" &&
    (cat === "real_estate_land" ||
      cat === "real_estate_apartment" ||
      cat === "real_estate_building" ||
      cat === "deposit") &&
    securedClaimTotal > 0;

  // §23의2 동거주택 체크 활성 조건 — 동거 자녀 존재 여부
  const hasCohabitantChild =
    mode === "inheritance" &&
    (heirs?.some((h) => h.relation === "child" && h.isCohabitant === true) ?? false);

  // 칩 클릭 핸들러 — createChipClickHandler 공통 helper
  const handleChipClick = useMemo(
    () =>
      createChipClickHandler({
        item,
        onUpdate,
        setInlineExpandedKey,
        heirs,
        currentExpandedKey: inlineExpandedKey,
      }),
    [item, onUpdate, heirs, inlineExpandedKey],
  );

  return (
    <>
      <div className="space-y-3">
        <EstateItemHeader
          itemId={item.id}
          icon={CATEGORY_ICONS[cat]}
          categoryLabel={CATEGORY_LABELS[cat]}
          index={index}
          chips={chips}
          expandedKey={inlineExpandedKey}
          onChipClick={handleChipClick}
          advancedOpen={advancedOpen}
          onToggleAdvanced={() => setAdvancedOpen((v) => !v)}
          advancedBadgeCount={advancedBadgeCount}
          onRemove={onRemove}
          onChangeCategory={() => setCategoryDialogOpen(true)}
          hideTitle
        />

        <VariantBody
          item={item}
          onUpdate={onUpdate}
          valuationDate={valuationDate}
          showCollateralDeductToggle={showCollateralDeductToggle}
          hasCohabitantChild={hasCohabitantChild}
          mode={mode}
        />

        {/* 법인 사업무관자산 차감 (§15⑤2호 + §16⑤2호) */}
        {mode === "inheritance" && (
          <CorporateNonBusinessAssetsSection item={item} onUpdate={onUpdate} deathDate={valuationDate} />
        )}

        {/* 헤더 칩 인라인 펼침 (분류·분할·영농·가업) */}
        <EstateChipInlineExpand
          expandedKey={inlineExpandedKey}
          itemId={item.id}
          item={item}
          onUpdate={onUpdate}
          heirs={heirs}
          onClose={() => setInlineExpandedKey(null)}
          deathDate={valuationDate}
        />

        {/* ⚙️ 고급 옵션 패널 */}
        {advancedOpen && mode === "inheritance" && (
          <EstateItemAdvancedPanel
            itemId={item.id}
            item={item}
            onUpdate={onUpdate}
            showSecuredClaimSubFields={showCollateralDeductToggle}
            deathDate={valuationDate}
          />
        )}
      </div>

      {/* 카테고리 변경 Dialog (편집 모달 내 중첩 Dialog — ui.design §5.4) */}
      <CategoryChangeDialog
        open={categoryDialogOpen}
        item={item}
        mode={mode}
        onConfirm={(preserved) => {
          onUpdate({ ...item, ...preserved } as EstateItem);
          setCategoryDialogOpen(false);
        }}
        onCancel={() => setCategoryDialogOpen(false)}
      />
    </>
  );
}
