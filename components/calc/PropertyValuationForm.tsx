"use client";

/**
 * PropertyValuationForm — 부동산·금융·보증금 자산 평가 입력 폼
 * 상속세·증여세 계산 마법사에서 EstateItem[] 입력에 사용
 *
 * 지원 카테고리: real_estate_land, real_estate_building,
 *   real_estate_apartment, financial, deposit, other
 * 주식(listed_stock, unlisted_stock)은 StockValuationForm을 사용
 */

import { useMemo, useState } from "react";
import { EstateItemHeader } from "@/components/calc/inheritance/estate-card/EstateItemHeader";
import { EstateChipInlineExpand } from "@/components/calc/inheritance/estate-card/EstateChipInlineExpand";
import { EstateItemAdvancedPanel } from "@/components/calc/inheritance/estate-card/EstateItemAdvancedPanel";
import { EstateItemCardShell } from "@/components/calc/inheritance/estate-card/EstateItemCardShell";
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

/** PR-D variant body 호출 래퍼 — switch 분기로 컴포넌트 직접 렌더 (static-components lint 준수) */
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
import {
  countNonDefaultOptions,
  resolveChips,
  type ChipKey,
  type ChipState,
} from "@/components/calc/inheritance/estate-card/chip-config";
import { TotalEstimatedValue } from "@/components/calc/property-valuation-preview";
import { CorporateNonBusinessAssetsSection } from "@/components/calc/inheritance/CorporateNonBusinessAssetsSection";
import type { EstateItem, AssetCategory, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 자산 카드별 "효과 평가액" 우선순위 — 시가 > 감정가 > 기준시가 > 보증금(deposit).
 * 본 export는 backwards-compat re-export. 본체는 lib/calc/estate-item-valuation.ts.
 */
export { computeEffectiveValuation } from "@/lib/calc/estate-item-valuation";

// ============================================================
// 카테고리 메타
// ============================================================

type SupportedCategory = Exclude<AssetCategory, "listed_stock" | "unlisted_stock">;

const CATEGORY_LABELS: Record<SupportedCategory, string> = {
  real_estate_land: "토지",
  real_estate_building: "건물 (단독주택·상업용)",
  real_estate_apartment: "아파트·공동주택",
  cash: "현금",
  financial: "예금·펀드·채권·공제금",
  deposit: "전세보증금 반환채권",
  other: "기타 재산",
};

const CATEGORY_ICONS: Record<SupportedCategory, string> = {
  real_estate_land: "🏔",
  real_estate_building: "🏠",
  real_estate_apartment: "🏢",
  cash: "💵",
  financial: "🏦",
  deposit: "🔑",
  other: "📦",
};

// VALUATION_PRIORITY_HINT는 PR-D variant 분리 후 EstateBodySimple·RealEstate·Deposit 내부로 이관됨.

/** 증여세 폼에서 노출할 카테고리 (deposit 제외) */
const GIFT_CATEGORIES: SupportedCategory[] = [
  "real_estate_apartment",
  "real_estate_building",
  "real_estate_land",
  "cash",
  "financial",
  "other",
];

// INHERITANCE_CATEGORIES는 deemed-category-policy.ts로 이관됨 (DEEMED_ALLOWED_CATEGORIES.none이 동일 매핑).

/**
 * 간주상속재산 분류별 허용 카테고리는 lib/calc/deemed-category-policy.ts로 분리.
 * Phase 2 INT-4 — PR-F category-change-policy가 의존하므로 lib 격상.
 * 기존 사용 사이트는 본 파일에서 re-export 받음 (backwards-compat).
 */
import {
  DEEMED_ALLOWED_CATEGORIES,
  DEEMED_FILTER_NOTE,
} from "@/lib/calc/deemed-category-policy";

export { DEEMED_ALLOWED_CATEGORIES, DEEMED_FILTER_NOTE };

// ============================================================
// 개별 자산 항목 Form
// ============================================================

interface ItemEditorProps {
  item: EstateItem;
  index: number;
  onUpdate: (updated: EstateItem) => void;
  onRemove: () => void;
  /** 상속세 모드에서 협의분할 토글 노출 — gift 모드는 미렌더 */
  mode: "inheritance" | "gift";
  /** 협의분할 분배 후보 — inheritance 모드에서만 의미 */
  heirs?: Heir[];
  /** 평가기준일 (상속개시일·증여일) — 기준시가 공시연도 기본값 계산용 */
  valuationDate?: string;
  /** PR-C FU-3: 자산 총 개수 — 5 이상이면 카드 collapse 토글 노출 */
  totalAssetCount: number;
}

function ItemEditor({ item, index, onUpdate, onRemove, mode, heirs, valuationDate, totalAssetCount }: ItemEditorProps) {
  const cat = item.category as SupportedCategory;

  // 카드 압축 v4: 인라인 펼침 칩 키 + ⚙️ 패널 펼침 (자산별 로컬, accordion 단일)
  const [inlineExpandedKey, setInlineExpandedKey] = useState<ChipKey | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // PR-D RM-6: collapse 자동 해제 신호 (incrementing key) — ⚙️ 클릭 시 Shell에 전달
  const [forceExpandKey, setForceExpandKey] = useState(0);
  // PR-F FU-6: 카테고리 변경 Dialog 펼침 상태
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
   * VariantBody(EstateBodyRealEstate·Deposit)에 prop으로 전달.
   */
  const securedClaimTotal =
    (item.mortgageAmount ?? 0) + (item.leaseDeposit ?? 0);
  const showCollateralDeductToggle =
    mode === "inheritance" &&
    (cat === "real_estate_land" ||
      cat === "real_estate_apartment" ||
      cat === "real_estate_building" ||
      cat === "deposit") &&
    securedClaimTotal > 0;

  // §23의2 동거주택 체크 활성 조건 — 동거 자녀 존재 여부 (EstateItem엔 heirs 없어 ItemEditor에서 도출)
  const hasCohabitantChild =
    mode === "inheritance" &&
    (heirs?.some((h) => h.relation === "child" && h.isCohabitant === true) ??
      false);

  // 칩 클릭 핸들러 — Phase 2 INT-1: createChipClickHandler 공통 helper 사용
  // (EstateCommonAttributesSection도 동일 helper 사용 예정 — PR-E)
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

  function handleToggleAdvanced() {
    // PR-D RM-6: collapse 자동 해제 신호 + advancedOpen 토글
    setForceExpandKey((k) => k + 1);
    setAdvancedOpen((v) => !v);
  }

  return (
    <>
    <EstateItemCardShell
      itemId={item.id}
      collapseEnabled={totalAssetCount >= 5}
      forceExpand={forceExpandKey}
      header={
        <EstateItemHeader
          itemId={item.id}
          icon={CATEGORY_ICONS[cat]}
          categoryLabel={CATEGORY_LABELS[cat]}
          index={index}
          chips={chips}
          expandedKey={inlineExpandedKey}
          onChipClick={handleChipClick}
          advancedOpen={advancedOpen}
          onToggleAdvanced={handleToggleAdvanced}
          advancedBadgeCount={advancedBadgeCount}
          onRemove={onRemove}
          onChangeCategory={() => setCategoryDialogOpen(true)}
        />
      }
      body={
    <div className="space-y-3">
      <VariantBody
        item={item}
        onUpdate={onUpdate}
        valuationDate={valuationDate}
        showCollateralDeductToggle={showCollateralDeductToggle}
        hasCohabitantChild={hasCohabitantChild}
        mode={mode}
      />

      {/* 법인 사업무관자산 차감 (§15⑤2호 + §16⑤2호) — corporate_stock 자산만 (PropertyValuationForm은 주식 미처리이나 안전상 보존) */}
      {mode === "inheritance" && (
        <CorporateNonBusinessAssetsSection item={item} onUpdate={onUpdate} />
      )}

      {/* ─────────────────────────────────────────────────────────
       * 헤더 칩 인라인 펼침 (분류·분할·영농·가업)
       * — Plan §3.5 · Design D-O1 단일 인스턴스 정책
       * ───────────────────────────────────────────────────────── */}
      <EstateChipInlineExpand
        expandedKey={inlineExpandedKey}
        itemId={item.id}
        item={item}
        onUpdate={onUpdate}
        heirs={heirs}
        onClose={() => setInlineExpandedKey(null)}
      />

      {/* ─────────────────────────────────────────────────────────
       * ⚙️ 고급 옵션 패널
       * — Plan §3.4 · Design D-O1·D-O2
       * ───────────────────────────────────────────────────────── */}
      {advancedOpen && mode === "inheritance" && (
        <EstateItemAdvancedPanel
          itemId={item.id}
          item={item}
          onUpdate={onUpdate}
          showSecuredClaimSubFields={showCollateralDeductToggle}
        />
      )}
    </div>
      }
    />
    {/* PR-F FU-6: 카테고리 변경 Dialog */}
    <CategoryChangeDialog
      open={categoryDialogOpen}
      item={item}
      mode={mode}
      onConfirm={(preserved) => {
        // pickPreservedFields 결과를 onUpdate에 전달 — 손실 필드는 undefined로 자동 처리
        onUpdate({ ...item, ...preserved } as EstateItem);
        setCategoryDialogOpen(false);
      }}
      onCancel={() => setCategoryDialogOpen(false)}
    />
    </>
  );
}

// ============================================================
// 카테고리 선택 버튼
// ============================================================

interface CategoryButtonProps {
  category: SupportedCategory;
  onAdd: (cat: SupportedCategory) => void;
}

function CategoryButton({ category, onAdd }: CategoryButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onAdd(category)}
      className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors text-xs"
    >
      <span className="text-xl">{CATEGORY_ICONS[category]}</span>
      <span className="text-gray-600 dark:text-gray-300 text-center leading-tight">
        {CATEGORY_LABELS[category]}
      </span>
    </button>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export interface PropertyValuationFormProps {
  /** 현재 자산 목록 (주식 제외) */
  items: EstateItem[];
  onChange: (items: EstateItem[]) => void;
  /** "상속" 또는 "증여" — 안내 문구 조정 + 협의분할 노출 분기 */
  mode?: "inheritance" | "gift";
  /** 협의분할 분배 후보 — inheritance 모드에서 필수 */
  heirs?: Heir[];
  /** 평가기준일 (상속개시일·증여일) — 기준시가 공시연도 기본값 계산용 */
  valuationDate?: string;
}

let _nextId = 1;
function generateId() {
  return `prop-${Date.now()}-${_nextId++}`;
}


export function PropertyValuationForm({
  items,
  onChange,
  mode = "inheritance",
  heirs,
  valuationDate,
}: PropertyValuationFormProps) {
  const [showAddPanel, setShowAddPanel] = useState(false);
  // 자산 추가 시 미리 선택할 간주상속재산 분류 (상속세 모드 전용)
  const [pendingDeemed, setPendingDeemed] = useState<
    "none" | "insurance" | "trust" | "retirement"
  >("none");

  const handleAdd = (category: SupportedCategory) => {
    const newItem: EstateItem = {
      id: generateId(),
      category,
      name: "",
      // 상속세 모드에서 간주상속재산 분류가 선택되어 있으면 prefilled
      ...(mode === "inheritance" && pendingDeemed !== "none"
        ? { deemedCategory: pendingDeemed }
        : {}),
    };
    onChange([...items, newItem]);
    setShowAddPanel(false);
    setPendingDeemed("none");
  };

  const handleUpdate = (index: number, updated: EstateItem) => {
    let next = [...items];
    next[index] = updated;
    // §23의2 동거주택 단일선택 — 한 주택을 동거주택으로 지정하면 다른 주택은 자동 해제(1세대 1주택)
    if (updated.isCohabitantHouse === true) {
      next = next.map((it, i) =>
        i !== index && it.isCohabitantHouse
          ? { ...it, isCohabitantHouse: undefined }
          : it,
      );
    }
    onChange(next);
  };

  const handleRemove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const modeLabel = mode === "inheritance" ? "상속" : "증여";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {modeLabel}재산 목록
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            주식·지분은 아래 <span className="text-indigo-600 dark:text-indigo-400">주식평가</span> 섹션에 별도 입력
          </p>
        </div>
        {items.length > 0 && (
          <span className="text-xs text-gray-400">{items.length}개 입력됨</span>
        )}
      </div>

      {/* 자산 목록 */}
      {items.length > 0 && (
        <div className="space-y-3">
          {items.map((item, i) => (
            <ItemEditor
              key={item.id}
              item={item}
              index={i}
              onUpdate={(updated) => handleUpdate(i, updated)}
              onRemove={() => handleRemove(i)}
              mode={mode}
              heirs={heirs}
              valuationDate={valuationDate}
              totalAssetCount={items.length}
            />
          ))}
        </div>
      )}

      {/* 자산 추가 패널 */}
      {showAddPanel ? (
        <div className="border border-dashed border-indigo-300 dark:border-indigo-700 rounded-lg p-4 space-y-3">
          {/* 상속세 모드 전용: 간주상속재산 분류 사전 선택 → 카드 필터링 */}
          {mode === "inheritance" && (
            <div className="rounded-md border border-violet-200 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-950/20 p-2.5 space-y-1.5">
              <p className="text-[11px] font-semibold text-violet-800 dark:text-violet-200">
                간주상속재산 분류 (§8·§9·§10) — 선택하면 해당 분류에 맞는 재산 종류만 표시됩니다
              </p>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {([
                  { v: "none", label: "일반 상속재산" },
                  { v: "insurance", label: "보험금 (§8)" },
                  { v: "trust", label: "신탁재산 (§9)" },
                  { v: "retirement", label: "퇴직금 등 (§10)" },
                ] as const).map((opt) => {
                  const active = pendingDeemed === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setPendingDeemed(opt.v)}
                      className={
                        "px-2.5 py-1 rounded border transition-colors " +
                        (active
                          ? "border-violet-400 bg-violet-200/70 dark:bg-violet-800/40 text-violet-900 dark:text-violet-100 font-medium"
                          : "border-violet-200/70 dark:border-violet-800/70 bg-white/40 dark:bg-violet-950/10 text-violet-700 dark:text-violet-300 hover:bg-violet-100/60")
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {pendingDeemed !== "none" && (
                <p className="text-[11px] text-violet-700 dark:text-violet-300 pt-0.5">
                  ⓘ {DEEMED_FILTER_NOTE[pendingDeemed]}
                </p>
              )}
            </div>
          )}

          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
            추가할 재산 종류 선택
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(mode === "gift"
              ? GIFT_CATEGORIES
              : DEEMED_ALLOWED_CATEGORIES[pendingDeemed]
            ).map((cat) => (
              <CategoryButton key={cat} category={cat} onAdd={handleAdd} />
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setShowAddPanel(false);
              setPendingDeemed("none");
            }}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            취소
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddPanel(true)}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 py-3 text-sm text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
        >
          <span className="text-lg">+</span>
          {modeLabel}재산 추가
        </button>
      )}

      {/* 합계 */}
      <TotalEstimatedValue items={items} />
    </div>
  );
}
