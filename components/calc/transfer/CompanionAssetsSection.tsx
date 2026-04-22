"use client";

import { type AssetForm, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { Button } from "@/components/ui/button";
import { CompanionAssetCard } from "./CompanionAssetCard";
import type { BundledSaleMode } from "./CompanionSaleModeBlock";

interface Props {
  assets: AssetForm[];
  bundledSaleMode: BundledSaleMode;
  onChange: (assets: AssetForm[]) => void;
}

export function CompanionAssetsSection({ assets, bundledSaleMode, onChange }: Props) {
  function addAsset() {
    onChange([...assets, makeDefaultAsset(assets.length + 1)]);
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
          // 자산이 2건 이상일 때만 삭제 버튼 노출
          onRemove={assets.length > 1 ? () => removeAsset(idx) : undefined}
        />
      ))}

      {assets.length > 1 && (
        <Button type="button" variant="outline" onClick={addAsset} className="w-full">
          + 자산 추가
        </Button>
      )}
    </div>
  );
}
