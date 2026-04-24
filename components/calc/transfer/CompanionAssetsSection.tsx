"use client";

import { type AssetForm, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { Button } from "@/components/ui/button";
import { CompanionAssetCard } from "./CompanionAssetCard";
import type { BundledSaleMode } from "./CompanionSaleModeBlock";

interface Props {
  assets: AssetForm[];
  bundledSaleMode: BundledSaleMode;
  onChange: (assets: AssetForm[]) => void;
  /** 단일 자산 모드: 첫 번째 카드에 singleMode를 전달 */
  singleMode?: boolean;
  /** 양도일 (공시가격 기준연도 자동 계산용) */
  transferDate?: string;
}

export function CompanionAssetsSection({ assets, bundledSaleMode, onChange, singleMode, transferDate }: Props) {
  function addAsset(patch?: Partial<AssetForm>) {
    const base = makeDefaultAsset(assets.length + 1);
    onChange([...assets, patch ? { ...base, ...patch } : base]);
  }

  function removeAsset(idx: number) {
    onChange(assets.filter((_, i) => i !== idx));
  }

  function updateAsset(idx: number, patch: Partial<AssetForm>) {
    onChange(assets.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }

  return (
    <div className="space-y-4">
      {assets.map((asset, idx) => (
        <CompanionAssetCard
          key={asset.assetId}
          index={idx}
          asset={asset}
          bundledSaleMode={bundledSaleMode}
          onChange={(patch) => updateAsset(idx, patch)}
          onRemove={assets.length > 1 ? () => removeAsset(idx) : undefined}
          singleMode={singleMode && assets.length === 1}
          transferDate={transferDate}
          onAddAsset={(patch) => addAsset(patch)}
        />
      ))}

      {assets.length > 1 && (
        <Button type="button" variant="outline" onClick={() => addAsset()} className="w-full">
          + 자산 추가
        </Button>
      )}
    </div>
  );
}
