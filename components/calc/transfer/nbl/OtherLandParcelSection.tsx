"use client";

/**
 * §168의11⑤ 연접 다필지 입력 (기타토지) — OtherLandDetailSection에서 분리(800줄 정책).
 *
 * 연접한 여러 필지를 하나의 용도로 일괄 사용 → 기준면적(§168의11① 호) 초과분을
 * 취득시기 늦은 필지부터 비사업용으로 귀속. 2호(건축물 有)는 바닥면적 제외.
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { NblParcelFormItem } from "@/lib/stores/calc-wizard-asset-nbl-other";

export interface OtherLandParcelSectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}

function newParcel(): NblParcelFormItem {
  return { id: crypto.randomUUID(), landArea: "", acquisitionDate: "", hasBuilding: false, buildingFootprintArea: "" };
}

export function OtherLandParcelSection({ asset, onAssetChange }: OtherLandParcelSectionProps) {
  const parcels = asset.nblOtherParcels ?? [];

  function updateParcel(i: number, patch: Partial<NblParcelFormItem>) {
    onAssetChange({ nblOtherParcels: parcels.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) });
  }
  function addParcel() {
    onAssetChange({ nblOtherParcels: [...parcels, newParcel()] });
  }
  function removeParcel(i: number) {
    onAssetChange({ nblOtherParcels: parcels.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/40 dark:bg-sky-950/20 dark:border-sky-800 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">§168의11⑤ 연접 다필지 (일괄용도)</p>
        <LawArticleModal legalBasis="소득세법 시행령 §168의11⑤" label="§168의11⑤" />
      </div>
      <ToggleCard
        tone="sky"
        title="연접 다필지로 입력"
        description="연접한 여러 필지를 하나의 용도로 일괄 사용하는 경우 — 위 §168의11① 호의 기준면적 초과분을 취득시기 늦은 필지부터 비사업용으로 귀속합니다. (건축물 있는 필지는 바닥면적 제외)"
        checked={asset.nblOtherUseParcels}
        onCheckedChange={(c) => onAssetChange({ nblOtherUseParcels: c })}
      />

      {asset.nblOtherUseParcels && (
        <div className="space-y-2">
          {parcels.length === 0 && (
            <p className="text-xs text-muted-foreground">등록된 필지가 없습니다. 필지를 추가하세요.</p>
          )}
          {parcels.map((p, i) => (
            <div
              key={p.id}
              data-testid={`nbl-other-parcel-${i}`}
              className="space-y-2 rounded-lg border border-sky-200/70 bg-sky-50/40 dark:border-sky-800/50 dark:bg-sky-950/20 px-3 py-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">필지 {i + 1}</span>
                <button
                  type="button"
                  data-testid={`nbl-other-parcel-remove-${i}`}
                  onClick={() => removeParcel(i)}
                  className="text-xs text-destructive hover:text-destructive/80 px-2 py-0.5 rounded border border-destructive/30 hover:bg-destructive/10 transition-colors"
                >
                  삭제
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FieldCard label="면적 (㎡)" unit="㎡">
                  <DecimalInput value={p.landArea} onChange={(v) => updateParcel(i, { landArea: v })} />
                </FieldCard>
                <div className="space-y-1">
                  <label className="block text-xs text-muted-foreground">취득일</label>
                  <DateInput value={p.acquisitionDate} onChange={(v) => updateParcel(i, { acquisitionDate: v })} />
                </div>
              </div>
              <ToggleCard
                variant="chip"
                tone="amber"
                title="이 필지에 건축물·시설물 있음"
                checked={p.hasBuilding}
                onCheckedChange={(c) => updateParcel(i, { hasBuilding: c })}
              />
              {p.hasBuilding && (
                <FieldCard label="건축물 바닥면적 (㎡)" unit="㎡" hint="§168의11⑤2호 — 바닥면적분은 사업용으로 유지(비사업용 귀속 후보에서 제외)">
                  <DecimalInput value={p.buildingFootprintArea} onChange={(v) => updateParcel(i, { buildingFootprintArea: v })} />
                </FieldCard>
              )}
            </div>
          ))}
          <button
            type="button"
            data-testid="nbl-other-parcel-add"
            onClick={addParcel}
            className="text-xs text-primary hover:text-primary/80 px-3 py-1.5 rounded border border-primary/30 hover:bg-primary/10 transition-colors"
          >
            + 필지 추가
          </button>
        </div>
      )}
    </div>
  );
}
