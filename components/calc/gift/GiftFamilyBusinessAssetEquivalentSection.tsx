"use client";

/**
 * GiftFamilyBusinessAssetEquivalentSection — 가업승계 증여세 과세특례 주식의 가업자산상당액 입력 (U-17 ⑤)
 *
 * 조특법 §30의6①의 특례·한도는 「가업자산상당액」(조특령 §27의6⑩ → 상증령 §15⑤2호 준용, 기준일=증여일)에만 걸린다.
 * 엔진과 같은 집합(합산배제 제외 + partitionGiftItems의 특례 귀속 주식)마다 법인 총자산·사업무관자산을 받는다.
 * 총자산 미입력은 ⑧·⑩이 같은 술어로 막는다(자동 fallback 없음).
 *
 * 동시증여 추가 건은 SimultaneousGiftCard가 GiftCreditChecklist를 중첩 렌더하므로 그 건의 form·giftDate로 같이 렌더된다.
 * useEffect → store 미러링 없음 — onUpdate가 원래 배열(giftItems/stockItems)의 그 항목만 바꾼다.
 */

import type { FormState } from "@/components/calc/gift-tax-form-shared";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { CorporateNonBusinessAssetsSection } from "@/components/calc/inheritance/CorporateNonBusinessAssetsSection";
import { partitionGiftItems } from "@/lib/tax-engine/gift-special-stream";
import { isSpecialTreatmentEligibleCategory } from "@/lib/tax-engine/gift-special-stream";

type Props = {
  form: Pick<FormState, "giftItems" | "stockItems" | "giftDate">;
  set: (patch: Partial<Pick<FormState, "giftItems" | "stockItems">>) => void;
};

export function GiftFamilyBusinessAssetEquivalentSection({ form, set }: Props) {
  const twoStreamItems = [...form.giftItems, ...form.stockItems].filter(
    (i) => !i.isAggregationExcludedGift,
  );
  // 재산 종류 부적격(부동산 등)은 SpecialTreatmentAssetSelector·⑧이 따로 막는다 — 여기서는 주식만 받는다.
  const items = partitionGiftItems(twoStreamItems).specialItems.filter((i) =>
    isSpecialTreatmentEligibleCategory(i.category, "family_business"),
  );
  if (items.length === 0) return null;

  const update = (original: EstateItem, updated: EstateItem) => {
    const gi = form.giftItems.indexOf(original);
    if (gi >= 0) {
      set({ giftItems: form.giftItems.map((it, i) => (i === gi ? updated : it)) });
      return;
    }
    const si = form.stockItems.indexOf(original);
    if (si >= 0) set({ stockItems: form.stockItems.map((it, i) => (i === si ? updated : it)) });
  };

  return (
    <div className="space-y-2" data-testid="gift-fb-asset-equivalent">
      {items.map((item, idx) => (
        <div key={item.id ?? idx} className="space-y-1">
          {items.length > 1 && (
            <p className="text-xs font-medium text-muted-foreground">
              {item.name?.trim() || `가업승계 특례 주식 ${idx + 1}`}
            </p>
          )}
          <CorporateNonBusinessAssetsSection
            item={item}
            onUpdate={(updated) => update(item, updated)}
            deathDate={form.giftDate || undefined}
            enabled
            context="gift_family_business"
          />
        </div>
      ))}
    </div>
  );
}
