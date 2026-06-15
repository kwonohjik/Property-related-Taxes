"use client";

/**
 * 가업상속 자산 분류 (FB-CAT)
 *
 * 법령: 상증법 §18의2 + 상증령 §15⑤
 *   ─ 1호: 가업에 직접 사용되는 사업장 소재 토지·건축물·기계장치·상품·제품·원재료·
 *           임차보증금·영업권·특허권·의장권 그 밖의 무형자산
 *   ─ 2호: businessType="corporate" 전용 — §15⑤2호 사업무관자산 차감 후 법인 주식
 *
 * KoreanLaw MCP 검증 2026-05-21:
 *   상증법 §18의2 mst=276123 / 상증령 §15 mst=283637
 *
 * 위치: PropertyValuationForm·StockValuationForm 카드 내부 (상속세 모드 전용).
 *
 * 호환 가드:
 *   - financial/cash/deposit: 미렌더
 *   - listed_stock / unlisted_stock: corporate_stock만 활성 (나머지 disabled)
 *   - real_estate_* / other: corporate_stock 비활성
 *
 * 정책:
 *   [[feedback_tailwind_static_tone_mapping]] — dynamic class 금지
 *   [[single-source-engine-helper]] — FamilyBusinessCategory 타입 엔진 import
 */

import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { AssetCategory, EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { FamilyBusinessCategory } from "@/lib/tax-engine/types/inheritance-family-business.types";

/**
 * 가업상속재산 분류 입력이 불가능한 자산 카테고리 (§15⑤ 미해당).
 * 예금·현금·예금성 채권은 가업용 사업자산이 아니므로 섹션·칩 모두 노출하지 않는다.
 * chip-config의 가업 칩 노출 조건과 본 섹션 렌더 가드의 단일 진실(single-source).
 */
export const FAMILY_BUSINESS_INELIGIBLE_CATEGORIES: readonly AssetCategory[] = [
  "financial",
  "cash",
  "deposit",
];

const FB_CATEGORY_OPTIONS: Array<{
  value: FamilyBusinessCategory;
  label: string;
  description: string;
}> = [
  { value: "business_real_estate", label: "가업용 부동산", description: "사업장·공장·창고·부속토지 (§15⑤1호)" },
  { value: "business_equipment", label: "가업용 기계·설비", description: "기계장치·설비 (§15⑤1호)" },
  { value: "intangible_asset", label: "가업 무형자산", description: "영업권·특허·의장권 등 (§15⑤1호)" },
  { value: "inventory", label: "재고자산", description: "상품·제품·원재료 (§15⑤1호)" },
  { value: "corporate_stock", label: "가업 법인 주식", description: "§15⑤2호 — businessType=corporate 한정. 사업무관자산 차감 후 가액 입력 권장" },
  { value: "other", label: "기타 가업용 자산", description: "임차보증금 등 §15⑤1호 기타" },
];

function getDefaultFamilyBusinessCategory(
  category: EstateItem["category"],
): FamilyBusinessCategory {
  if (category === "listed_stock" || category === "unlisted_stock") return "corporate_stock";
  return "business_real_estate";
}

export interface FamilyBusinessCategorySectionProps {
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
}

export function FamilyBusinessCategorySection({
  item,
  onUpdate,
}: FamilyBusinessCategorySectionProps) {
  // 금융·현금·예금: 가업 자산 불가 — 미렌더
  if (FAMILY_BUSINESS_INELIGIBLE_CATEGORIES.includes(item.category)) {
    return null;
  }

  const isActive = item.familyBusinessCategory !== undefined;

  const isStock =
    item.category === "listed_stock" || item.category === "unlisted_stock";
  const nonStockOptions: FamilyBusinessCategory[] = [
    "business_real_estate",
    "business_equipment",
    "intangible_asset",
    "inventory",
    "other",
  ];

  const options = FB_CATEGORY_OPTIONS.map((opt) => {
    let disabled = false;
    let hint: string = opt.description;
    if (isStock) {
      if (nonStockOptions.includes(opt.value)) {
        disabled = true;
        hint = "주식 자산은 corporate_stock 분류만 가능";
      }
    } else {
      if (opt.value === "corporate_stock") {
        disabled = true;
        hint = "법인 주식 자산만 선택 가능";
      }
    }
    return { ...opt, disabled, hint, description: opt.description };
  });

  return (
    <div className="space-y-2">
      <ToggleCard
        tone="amber"
        size="sm"
        title="가업상속 재산 (§18의2 + 상증령 §15⑤)"
        description={
          isActive
            ? "활성화됨 — 가업 자산 분류를 선택하세요."
            : "사업용 부동산·기계·재고·법인 주식 등 가업상속재산인 경우 체크"
        }
        checked={isActive}
        onCheckedChange={(v) => {
          if (v) {
            onUpdate({
              ...item,
              familyBusinessCategory: getDefaultFamilyBusinessCategory(item.category),
            });
          } else {
            // 토글 OFF 시 가업 관련 필드 일괄 reset (corporate_stock 차감 데이터 포함)
            onUpdate({
              ...item,
              familyBusinessCategory: undefined,
              corporateNonBusinessAssets: undefined,
              corporateTotalAssets: undefined,
            });
          }
        }}
      />
      {isActive && (
        <div className="rounded-md border border-amber-200 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-800 p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
            가업 자산 분류
          </p>
          <div className="flex flex-wrap gap-1.5">
            <LawArticleModal legalBasis="상증법 §18의2" label="§18의2 가업상속공제" />
            <LawArticleModal legalBasis="상증령 §15" label="상증령 §15 가업상속재산" />
          </div>
          <RadioCardGroup<FamilyBusinessCategory>
            name={`family-business-${item.id}`}
            layout="stack"
            tone="amber"
            value={item.familyBusinessCategory as FamilyBusinessCategory}
            options={options}
            onChange={(v) => onUpdate({ ...item, familyBusinessCategory: v })}
          />
          <p className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-900/30 rounded p-2">
            ⓘ {FB_CATEGORY_OPTIONS.find((o) => o.value === item.familyBusinessCategory)?.description}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * 자산 카테고리 변경 시 familyBusinessCategory 자동 reset.
 * PropertyValuationForm·StockValuationForm의 category onChange 핸들러에서 호출.
 */
export function reconcileFamilyBusinessCategoryOnCategoryChange(
  prev: FamilyBusinessCategory | undefined,
  newAssetCategory: EstateItem["category"],
): FamilyBusinessCategory | undefined {
  if (prev === undefined) return undefined;
  if (
    newAssetCategory === "financial" ||
    newAssetCategory === "cash" ||
    newAssetCategory === "deposit"
  ) {
    return undefined;
  }
  const isStockNew =
    newAssetCategory === "listed_stock" || newAssetCategory === "unlisted_stock";
  if (isStockNew) {
    return prev === "corporate_stock" ? "corporate_stock" : undefined;
  }
  // real_estate_* / other
  return prev === "corporate_stock" ? undefined : prev;
}
