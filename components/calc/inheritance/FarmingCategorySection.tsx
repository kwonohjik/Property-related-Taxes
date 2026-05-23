"use client";

/**
 * 영농상속 자산 분류 (F-4)
 *
 * 법령: 상증법 §18의3 + 시행령 §16⑤ 1호 가~사 + 2호 (KoreanLaw MCP 검증 2026-05-21)
 *
 * 위치: PropertyValuationForm·StockValuationForm 카드 내부 (상속세 모드 전용).
 * 카테고리 호환 가드:
 *   - financial/cash/deposit: 컴포넌트 자체 미렌더
 *   - real_estate_* / other: corporate_stock만 disabled
 *   - listed_stock / unlisted_stock: corporate_stock만 활성 (나머지 disabled)
 */

import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

type FarmingCategory = NonNullable<EstateItem["farmingCategory"]>;

const FARMING_CATEGORY_OPTIONS: Array<{
  value: FarmingCategory;
  label: string;
  description: string;
}> = [
  { value: "farmland", label: "농지", description: "농지법 §2①가 농지" },
  { value: "pasture", label: "초지", description: "초지법 §5 초지조성허가 초지" },
  { value: "forest_land", label: "산림지", description: "보전산지 + 산림경영계획 인가 + 5년 이상 조림" },
  { value: "fishing_vessel", label: "어선", description: "어선법 §2① 어선" },
  { value: "fishing_right", label: "어업권·양식업권", description: "마을어업·협동양식업 면허 제외" },
  { value: "agricultural_building", label: "농업용 건축물", description: "농·임·축·어업용 — 건폐율 환산 면적 한정" },
  { value: "salt_field", label: "염전", description: "소금산업진흥법 §2③" },
  { value: "corporate_stock", label: "법인 영농 주식", description: "§16⑤2호 — §15⑤2호 사업무관자산 차감 후 가액 입력 권장" },
];

/** 토글 OFF 시 farmingCategory를 undefined로 reset. 자산 유형별 default 카테고리 도출. */
function getDefaultFarmingCategory(
  category: EstateItem["category"],
): FarmingCategory {
  if (category === "listed_stock" || category === "unlisted_stock") return "corporate_stock";
  return "farmland";
}

export interface FarmingCategorySectionProps {
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
}

export function FarmingCategorySection({
  item,
  onUpdate,
}: FarmingCategorySectionProps) {
  // FC-11: 금융·현금은 영농 자산 불가 — 컴포넌트 자체 미렌더
  if (
    item.category === "financial" ||
    item.category === "cash" ||
    item.category === "deposit"
  ) {
    return null;
  }

  const isActive = item.farmingCategory !== undefined;

  // 카테고리별 호환 가드
  const isStock =
    item.category === "listed_stock" || item.category === "unlisted_stock";
  const stockOnly: FarmingCategory[] = ["farmland", "pasture", "forest_land",
    "fishing_vessel", "fishing_right", "agricultural_building", "salt_field"];

  const options = FARMING_CATEGORY_OPTIONS.map((opt) => {
    let disabled = false;
    let hint: string = opt.description;
    if (isStock) {
      if (stockOnly.includes(opt.value)) {
        disabled = true;
        hint = "법인 주식은 corporate_stock 분류만 가능";
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
        tone="emerald"
        size="sm"
        title="영농상속 재산 (§18의3 + 시행령 §16⑤)"
        description={
          isActive
            ? "활성화됨 — 영농 자산 분류를 선택하세요."
            : "농지·초지·산림지·어선·법인 영농주식 등 영농상속재산인 경우 체크"
        }
        checked={isActive}
        onCheckedChange={(v) => {
          if (v) {
            onUpdate({ ...item, farmingCategory: getDefaultFarmingCategory(item.category) });
          } else {
            onUpdate({ ...item, farmingCategory: undefined });
          }
        }}
      />
      {isActive && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-800 p-3 space-y-2">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
            영농 자산 분류
          </p>
          <RadioCardGroup<FarmingCategory>
            name={`farming-${item.id}`}
            layout="stack"
            tone="emerald"
            value={item.farmingCategory as FarmingCategory}
            options={options}
            onChange={(v) => onUpdate({ ...item, farmingCategory: v })}
          />
          <p className="text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-100/60 dark:bg-emerald-900/30 rounded p-2">
            ⓘ {FARMING_CATEGORY_OPTIONS.find((o) => o.value === item.farmingCategory)?.description}
          </p>
          {item.farmingCategory === "fishing_right" && (
            <ToggleCard
              tone="rose"
              size="sm"
              title="마을어업·협동양식업 면허 (영농상속 제외)"
              description="시행령 §16⑤마목 단서 — 「수산업법」 §8 마을어업 면허, 「양식산업발전법」 §10① 협동양식업 면허는 영농상속재산가액에서 제외"
              checked={item.fishingLicenseExcluded === true}
              onCheckedChange={(v) =>
                onUpdate({ ...item, fishingLicenseExcluded: v ? true : undefined })
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 자산 카테고리 변경 시 farmingCategory 자동 reset.
 * PropertyValuationForm·StockValuationForm의 category onChange 핸들러에서 호출.
 *
 * @returns 새로운 farmingCategory 값 (undefined이면 reset)
 */
export function reconcileFarmingCategoryOnCategoryChange(
  prevFarmingCategory: FarmingCategory | undefined,
  newAssetCategory: EstateItem["category"],
): FarmingCategory | undefined {
  if (prevFarmingCategory === undefined) return undefined;
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
    return prevFarmingCategory === "corporate_stock" ? "corporate_stock" : undefined;
  }
  // real_estate_* / other
  return prevFarmingCategory === "corporate_stock" ? undefined : prevFarmingCategory;
}
