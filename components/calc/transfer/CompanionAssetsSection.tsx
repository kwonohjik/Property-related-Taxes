"use client";

import { useRef } from "react";
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
  // 연속된 onChange 호출에서 stale closure를 피하기 위해
  // 최신 assets를 ref로 동기 추적 (렌더링 중 동기화)
  const assetsRef = useRef(assets);
  if (assetsRef.current !== assets) {
    assetsRef.current = assets;
  }

  function commitAssets(next: AssetForm[]) {
    assetsRef.current = next;
    onChange(next);
  }

  function addAsset(patch?: Partial<AssetForm>) {
    const base = makeDefaultAsset(assetsRef.current.length + 1);
    commitAssets([...assetsRef.current, patch ? { ...base, ...patch } : base]);
  }

  function removeAsset(idx: number) {
    commitAssets(assetsRef.current.filter((_, i) => i !== idx));
  }

  function updateAsset(idx: number, patch: Partial<AssetForm>) {
    commitAssets(
      assetsRef.current.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    );
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
