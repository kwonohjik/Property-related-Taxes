"use client";

/**
 * 다건 합산 결과 — **일반건물 1건 = 자산 1행**, 펼치면 그 건의 일반건물 블록 + 토지·건물 카드
 * (계획서 `docs/00-pm/multi-building-valuation-support.plan.md` Q-2 a).
 *
 * 다건 route는 일반건물을 토지·건물 카드로 펼쳐 합산한다(`multi-gb-expansion.ts`). 카드마다 행을 그리면 화면의 자산 번호와
 * 결과 행이 어긋나므로 한 행으로 묶는다. 카드 본문은 다른 자산과 같은 아코디언(`PropertyBreakdownAccordion`)을 쓰고,
 * 일반건물 블록(구분 기재 판정·의제 전 취득가액·증축 3-way 등)은 함께 양도와 같은 뷰 leaf(`gbAssetBlockView`)를 쓴다.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { expandToggleClass, expandToggleLabel } from "./shared/ExpandToggleButton";
import { PropertyBreakdownAccordion, formatKRW } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import { GbResultBlocks } from "@/components/calc/results/transfer/GbResultBlocks";
import { GeneralBuilding3WayTable } from "@/components/calc/results/transfer/GeneralBuilding3WayTable";
import { gbAssetBlockView } from "@/components/calc/results/transfer/gb-result-block-views";
import { BurdenedGiftDetailCard } from "@/components/calc/results/transfer/BurdenedGiftDetailCard";
import { GbBurdenedGiftCarryoverCard } from "@/components/calc/results/transfer/GbBurdenedGiftCarryoverCard";
import { cardSuffixOf } from "@/lib/tax-engine/general-building-share-id";
import type { AggregateTransferResult, PerPropertyBreakdown } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";

export function MultiGbAssetGroup({
  result,
  formPropertyId,
  cards,
  property,
}: {
  result: AggregateTransferResult;
  formPropertyId: string;
  cards: PerPropertyBreakdown[];
  property?: PropertyItem;
}) {
  const [open, setOpen] = useState(false);
  const label = property?.propertyLabel ?? formPropertyId;
  const hasDetail = !!result.generalBuildingDetailsByAsset?.[formPropertyId];
  const view = hasDetail ? gbAssetBlockView(result, formPropertyId, label, property?.form?.assets[0]) : undefined;
  const bgBreakdown = result.generalBuildingDetailsByAsset?.[formPropertyId]?.burdenedGiftBreakdown;
  // 부담부증여 × 이월과세 [A]/[B] 비교 — 키는 자산 id, 지분은 복합 접미사(`<자산id>.<지분번호>`). 자산 부분으로 이 물건 것만 고른다.
  const carryoverUnits = Object.entries(result.burdenedGiftCarryoverUnits ?? {}).filter(([key]) => cardSuffixOf(`#${key}`) === formPropertyId);
  const taxBaseShare = cards.reduce((s, c) => s + (c.isExempt ? 0 : c.taxBaseShare), 0);

  return (
    <Card data-testid={`multi-gb-group-${formPropertyId}`}>
      <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">일반건물 · 토지·건물 나눠 계산</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">{formatKRW(taxBaseShare)}</span>
          <span className={expandToggleClass("slate")}>{expandToggleLabel(open)}</span>
        </div>
      </div>
      {/* 인쇄 펼침은 CSS-only(skill `print-only-css-toggle`) — 접힌 채 인쇄해도 본문이 빠지지 않는다. */}
      <CardContent className={cn("pt-0 border-t space-y-2", open ? "block" : "hidden print:block")}>
        {view && (
          <div className="pt-3 space-y-2">
            <GbResultBlocks view={{ ...view, label: undefined }} />
            <GeneralBuilding3WayTable aggregated={result} view={view} />
          </div>
        )}
        {/* 일반건물 부담부증여 §159·증여세 명세 — 다건 펼침이 자산 상세에 1회 옮긴 값(단건 `transferBurdenedGiftBreakdown`과 같다 · 트랙 BG). */}
        {bgBreakdown && (
          <div className="pt-3">
            <BurdenedGiftDetailCard breakdown={bgBreakdown} propertyType="general_building" />
          </div>
        )}
        {/* 연간 합산은 그 해 전체 결정세액으로 비교한다(§97의2②3호) — 함께 부담부증여 묶음과 같은 자산별 카드(신고 전체 A·B). */}
        {carryoverUnits.map(([key, unit]) => (
          <div key={key} className="pt-3">
            <GbBurdenedGiftCarryoverCard detail={unit} assetLabel={unit.assetLabel} />
          </div>
        ))}
        <div className="pt-3 space-y-2">
          {cards.map((c) => (
            <PropertyBreakdownAccordion key={c.propertyId} breakdown={c} property={property} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
