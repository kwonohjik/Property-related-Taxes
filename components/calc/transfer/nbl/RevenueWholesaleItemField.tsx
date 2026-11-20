"use client";

/**
 * 12호 도소매업 품목 — 소득세법 시행규칙 §83조의4⑭ 열거 품목만 12호다 (NBL2611-V7-S · Q-6 (다)).
 * 농산물·수산물·축산물은 「유통산업발전법」에 따른 시장과 그 밖에 이와 유사한 장소에서 운영하는 경우에 한한다.
 * 품목 표·술어는 엔진 `revenue-wholesale-item.ts`가 단일 소스 — ⑧·⑫·엔진이 같은 것을 쓴다.
 */
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import {
  WHOLESALE_ITEMS,
  WHOLESALE_ITEM_VALUES,
  wholesaleItemIssue,
} from "@/lib/tax-engine/non-business-land/revenue-wholesale-item";

export interface RevenueWholesaleItemFieldProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}

export function RevenueWholesaleItemField({ asset, onAssetChange }: RevenueWholesaleItemFieldProps) {
  const item = asset.nblRevenueWholesaleItem;
  const marketLimited = item ? WHOLESALE_ITEMS[item].marketLimited : false;
  // 시장 요건 불충족 — 엔진이 12호를 인정하지 않는 사실을 계산 전에 알린다(같은 술어).
  const notInMarket = wholesaleItemIssue({
    businessType: "wholesale_retail",
    wholesaleItem: item,
    wholesaleInMarket: asset.nblRevenueWholesaleInMarket,
  })?.kind === "not_in_market";

  return (
    <>
      <FieldCard
        field="nblRevenueWholesaleItem"
        label="도소매 취급 품목"
        hint="소득세법 시행규칙 제83조의4 제14항이 정한 품목의 도매업·소매업용 토지만 12호입니다. 목록에 없는 품목은 12호가 아닙니다."
        trailing={<LawArticleModal legalBasis="소득세법 시행규칙 §83의4⑭" label="§83의4⑭" />}
      >
        <Select
          value={item || "__none"}
          onValueChange={(v) =>
            onAssetChange({
              nblRevenueWholesaleItem: v && v !== "__none" ? (v as AssetForm["nblRevenueWholesaleItem"]) : "",
              nblRevenueWholesaleInMarket: false,
            })
          }
        >
          <SelectTrigger data-testid="nbl-revenue-wholesale-item">
            <SelectValue>{item ? WHOLESALE_ITEMS[item].label : "품목 선택"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">품목 선택</SelectItem>
            {WHOLESALE_ITEM_VALUES.map((v) => (
              <SelectItem key={v} value={v}>
                {WHOLESALE_ITEMS[v].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldCard>
      {marketLimited && (
        <ToggleCard
          tone="amber"
          title="「유통산업발전법」에 따른 시장 또는 이와 유사한 장소에서 운영"
          description="농산물·수산물·축산물 도소매업은 시장과 그 밖에 이와 유사한 장소에서 운영하는 경우에 한합니다. 꺼 두면 12호로 인정하지 않습니다."
          checked={asset.nblRevenueWholesaleInMarket}
          onCheckedChange={(c) => onAssetChange({ nblRevenueWholesaleInMarket: c })}
        />
      )}
      {notInMarket && (
        <p className="text-caption text-amber-700 dark:text-amber-300" data-testid="nbl-revenue-wholesale-not-in-market">
          시장·유사 장소가 아니면 12호로 인정하지 않습니다(수입금액비율을 충족해도 사업용으로 보지 않습니다).
        </p>
      )}
    </>
  );
}
