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
 *
 * D-4 (2026-06-04):
 *   - farmingUseStartDate DateInput 추가 (§16⑤1호 2년 요건 자동판정)
 *   - twoYearsBefore() 사용, deathDate prop으로 자동판정 배지 노출
 *   - farmingUseStartDate 입력 시 farmingUsedTwoYears ToggleCard 대체 (하위호환 유지)
 */

import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { twoYearsBefore } from "@/lib/calc/inheritance-deduction-suggest";
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
  /**
   * 상속개시일 (YYYY-MM-DD) — farmingUseStartDate 입력 시 §16⑤1호 2년 요건 자동판정 배지에 사용.
   * 미전달 시 자동판정 배지 표시 불가 → 수동 토글(farmingUsedTwoYears)만 노출.
   */
  deathDate?: string;
}

export function FarmingCategorySection({
  item,
  onUpdate,
  deathDate,
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
        lawLinks="상증법"
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
          <div className="flex flex-wrap gap-1.5">
            <LawArticleModal legalBasis="상증법 §18의3" label="§18의3 영농상속공제" />
            <LawArticleModal legalBasis="상증령 §16" label="상증령 §16 영농상속재산" />
          </div>
          <RadioCardGroup<FarmingCategory>
            name={`farming-${item.id}`}
            layout="stack"
            tone="emerald"
            value={item.farmingCategory as FarmingCategory}
            options={options}
            onChange={(v) => onUpdate({ ...item, farmingCategory: v })}
          />
          <p className="text-micro text-emerald-700 dark:text-emerald-300 bg-emerald-100/60 dark:bg-emerald-900/30 rounded p-2">
            ⓘ {FARMING_CATEGORY_OPTIONS.find((o) => o.value === item.farmingCategory)?.description}
          </p>
          {/* D-4: §16⑤1호 영농 사용 개시일 + 자동판정 배지 */}
          <FieldCard
            label="영농 사용 개시일 (§16⑤1호)"
            hint="취득일이 아닌 실제 영농 사용 시작일. 입력 시 상속개시일 2년 요건 자동 판정"
          >
            <DateInput
              value={item.farmingUseStartDate ?? ""}
              onChange={(v) =>
                onUpdate({ ...item, farmingUseStartDate: v || undefined })
              }
            />
          </FieldCard>
          {/* 자동판정 배지 — farmingUseStartDate 입력 시 표시 */}
          {item.farmingUseStartDate ? (
            deathDate ? (
              item.farmingUseStartDate <= twoYearsBefore(deathDate) ? (
                <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-2">
                  <p className="text-caption font-semibold text-emerald-800 dark:text-emerald-200">
                    ✓ 2년 요건 충족 — 본 자산은 영농상속재산가액에 포함됩니다 (§16⑤1호)
                  </p>
                </div>
              ) : (
                <div className="rounded-md border border-rose-300 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-800 p-2">
                  <p className="text-caption font-semibold text-rose-800 dark:text-rose-200">
                    ✗ 2년 미충족 — 본 자산은 영농상속재산가액에서 제외됩니다 (§16⑤1호)
                  </p>
                  <p className="text-micro text-rose-700 dark:text-rose-300 mt-0.5">
                    상속개시일 2년 전({twoYearsBefore(deathDate)}) 이후 영농 사용 시작
                  </p>
                </div>
              )
            ) : (
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-2">
                <p className="text-caption font-semibold text-amber-800 dark:text-amber-200">
                  ⓘ 상속개시일(Step0)을 입력하면 2년 요건 자동 판정됩니다
                </p>
              </div>
            )
          ) : (
            /* farmingUseStartDate 미입력 시 수동 ToggleCard fallback (하위호환) */
            <ToggleCard
              lawLinks="상증법"
              tone={item.farmingUsedTwoYears === false ? "rose" : "emerald"}
              size="sm"
              title="상속개시일 2년 전부터 영농 사용 (§16⑤1호) — 수동 설정"
              description={
                item.farmingUsedTwoYears === false
                  ? "미충족 — 본 자산은 영농상속재산가액에서 제외됩니다. 영농 사용 개시일 입력 시 자동 판정으로 전환됩니다."
                  : "피상속인이 상속개시일 2년 전부터 영농에 사용한 자산만 영농상속재산. 끄면 제외. 영농 사용 개시일 입력 시 자동 판정으로 전환됩니다."
              }
              checked={item.farmingUsedTwoYears !== false}
              onCheckedChange={(v) =>
                onUpdate({ ...item, farmingUsedTwoYears: v ? undefined : false })
              }
            />
          )}
          {item.farmingCategory === "fishing_right" && (
            <ToggleCard
              lawLinks="상증법"
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
          {(item.farmingCategory === "agricultural_building" ||
            item.farmingCategory === "salt_field") && (
            <div
              data-testid="farming-residence-or-non-target-notice"
              className="rounded-md border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 p-2.5 space-y-1.5"
            >
              <p className="text-caption font-semibold text-amber-800 dark:text-amber-200">
                ⓘ 거주지 OR 자동 검증 비대상 (§16②1호나)
              </p>
              <p className="text-micro text-amber-700 dark:text-amber-300 leading-relaxed">
                시행령 §16②1호나 거주지 30km 자동 검증은 <strong>농지·초지·산림지 3종</strong>
                {item.farmingCategory === "agricultural_building"
                  ? " 한정입니다. 농업용 건축물은 §16⑤바목 영농상속재산이지만 거주지 요건의 \"농지등\"에 포함되지 않으므로 자산 좌표를 입력해도 자동 검증에 반영되지 않습니다."
                  : " 한정입니다. 염전은 §16⑤사목 영농상속재산이지만 거주지 요건의 \"농지등\"에 포함되지 않으므로 자산 좌표를 입력해도 자동 검증에 반영되지 않습니다."}
              </p>
              <p className="text-micro text-amber-700 dark:text-amber-300">
                좌표 입력은 <strong>선택 사항</strong>입니다 (소재지 식별·표시 용도). 거주지 30km
                요건 충족 여부는 같이 보유한 농지·초지·산림지 자산 기준으로 평가됩니다.
              </p>
            </div>
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
