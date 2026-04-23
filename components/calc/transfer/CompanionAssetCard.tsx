"use client";

import type { AssetForm, ParcelFormItem } from "@/lib/stores/calc-wizard-store";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { ParcelListInput } from "@/components/calc/inputs/ParcelListInput";
import { CompanionSaleModeBlock, type BundledSaleMode } from "./CompanionSaleModeBlock";
import { CompanionAcqPurchaseBlock } from "./CompanionAcqPurchaseBlock";
import { CompanionAcqInheritanceBlock } from "./CompanionAcqInheritanceBlock";
import { CompanionAcqGiftBlock } from "./CompanionAcqGiftBlock";

const ASSET_KIND_LABELS: Record<string, string> = {
  housing: "주택",
  land: "토지",
  building: "건물(토지 외)",
  right_to_move_in: "입주권",
  presale_right: "분양권",
};

const ASSET_KIND_OPTIONS = [
  { value: "housing", label: "주택" },
  { value: "land", label: "토지·농지" },
  { value: "building", label: "건물(토지 외)" },
  { value: "right_to_move_in", label: "입주권" },
  { value: "presale_right", label: "분양권" },
] as const;

const ACQUISITION_CAUSE_OPTIONS = [
  { value: "purchase", label: "매매" },
  { value: "inheritance", label: "상속" },
  { value: "gift", label: "증여" },
] as const;

interface Props {
  index: number;
  asset: AssetForm;
  bundledSaleMode: BundledSaleMode;
  onChange: (patch: Partial<AssetForm>) => void;
  /** undefined이면 삭제 버튼을 숨김 (1건일 때) */
  onRemove?: () => void;
  /** 단일 자산 모드: 양도가액 레이블·힌트를 §166⑥ 없이 단순화 */
  singleMode?: boolean;
  /** 양도일 (공시가격 기준연도 자동 계산용) */
  transferDate?: string;
}

export function CompanionAssetCard({
  index,
  asset,
  bundledSaleMode,
  onChange,
  onRemove,
  singleMode,
  transferDate,
}: Props) {
  const isMultiBundled = !singleMode && bundledSaleMode !== undefined;
  const isPrimary = asset.isPrimaryForHouseholdFlags;
  const kindLabel = ASSET_KIND_LABELS[asset.assetKind] ?? asset.assetKind;

  return (
    <div className={cn(
      "border rounded-lg p-4 space-y-4",
      isPrimary ? "bg-background border-primary/30" : "bg-muted/30",
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">
            자산 {index + 1} — {kindLabel}
          </span>
          {isPrimary && (
            <span className="inline-flex rounded bg-primary/10 px-2 py-0.5 text-[10px] text-primary font-medium">
              주 자산
            </span>
          )}
          {bundledSaleMode === "actual" && (
            <span className="inline-flex rounded bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
              계약서 가액
            </span>
          )}
        </div>
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={onRemove}
          >
            삭제
          </Button>
        )}
      </div>

      {/* 자산 종류 */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">자산 종류</label>
        <div className="flex gap-2 flex-wrap">
          {ASSET_KIND_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ assetKind: opt.value })}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm border transition-colors",
                asset.assetKind === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 소재지 검색 */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">소재지</label>
        <AddressSearch
          value={{
            road: asset.addressRoad,
            jibun: asset.addressJibun,
            building: asset.buildingName ?? "",
            detail: asset.addressDetail ?? "",
            lng: asset.longitude ?? null,
            lat: asset.latitude ?? null,
          } satisfies AddressValue}
          onChange={(v) =>
            onChange({
              addressRoad: v.road,
              addressJibun: v.jibun,
              buildingName: v.building,
              addressDetail: v.detail,
              longitude: v.lng,
              latitude: v.lat,
            })
          }
        />
        <p className="text-xs text-muted-foreground">
          ※ 조정대상지역 여부·공시가격 조회에 사용됩니다.
        </p>
      </div>

      {/* 입주권 승계조합원 */}
      {asset.assetKind === "right_to_move_in" && (
        <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-3">
          <label className="block text-sm font-medium">조합원 유형</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: false, label: "원조합원", desc: "조합원자격을 직접 취득" },
              { value: true, label: "승계조합원", desc: "입주권을 양수(승계취득)" },
            ].map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => onChange({ isSuccessorRightToMoveIn: opt.value })}
                className={cn(
                  "rounded-md border-2 p-2 text-left transition-all",
                  asset.isSuccessorRightToMoveIn === opt.value
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
                )}
              >
                <div className="text-sm font-semibold">{opt.label}</div>
                <div className="text-[11px] text-muted-foreground">{opt.desc}</div>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            ※ 승계조합원은 장기보유특별공제 미적용 (소득세법 §95② 단서)
          </p>
        </div>
      )}

      {/* 자산 명칭 (1건 초과 시만 표시) */}
      {isMultiBundled && (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">자산 명칭</label>
          <input
            type="text"
            value={asset.assetLabel}
            onChange={(e) => onChange({ assetLabel: e.target.value })}
            placeholder="예: 아파트, 농지(밭)"
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          />
        </div>
      )}

      {/* 토지 면적 — 양도시 기준시가 자동계산 + 상속 보충적평가액에 공통 사용 */}
      {asset.assetKind === "land" && (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">토지 면적 (㎡)</label>
          <input
            type="number"
            value={asset.landAreaM2}
            onChange={(e) => onChange({ landAreaM2: e.target.value })}
            min={0}
            placeholder="예: 793"
            className="w-48 border rounded-md px-3 py-2 text-sm bg-background"
          />
        </div>
      )}

      {/* 양도가액 */}
      <CompanionSaleModeBlock
        bundledSaleMode={singleMode ? "actual" : bundledSaleMode}
        assetKind={asset.assetKind}
        actualSalePrice={asset.actualSalePrice}
        onActualSalePriceChange={(v) => onChange({ actualSalePrice: v })}
        standardPriceAtTransfer={asset.standardPriceAtTransfer}
        onStandardPriceAtTransferChange={(v) => onChange({ standardPriceAtTransfer: v })}
        singleMode={singleMode}
        jibun={asset.addressJibun || undefined}
        transferDate={transferDate}
        landAreaM2={asset.assetKind === "land" ? asset.landAreaM2 : undefined}
        onLandAreaM2Change={asset.assetKind === "land" ? (v) => onChange({ landAreaM2: v }) : undefined}
      />

      {/* 취득 원인 */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">취득 원인</label>
        <div className="grid grid-cols-3 gap-2">
          {ACQUISITION_CAUSE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ acquisitionCause: opt.value })}
              className={cn(
                "rounded-md border-2 p-2 text-center transition-all",
                asset.acquisitionCause === opt.value
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
              )}
            >
              <div className="text-sm font-semibold">{opt.label}</div>
            </button>
          ))}
        </div>

        {asset.acquisitionCause === "purchase" && (
          <CompanionAcqPurchaseBlock
            acquisitionDate={asset.acquisitionDate}
            onAcquisitionDateChange={(v) => onChange({ acquisitionDate: v })}
            useEstimatedAcquisition={asset.useEstimatedAcquisition}
            onUseEstimatedChange={(v) => onChange({ useEstimatedAcquisition: v })}
            fixedAcquisitionPrice={asset.fixedAcquisitionPrice}
            onFixedAcquisitionPriceChange={(v) => onChange({ fixedAcquisitionPrice: v })}
            standardPriceAtAcq={asset.standardPriceAtAcq}
            onStandardPriceAtAcqChange={(v) => onChange({ standardPriceAtAcq: v })}
            standardPriceAtTransfer={asset.standardPriceAtTransfer}
            onStandardPriceAtTransferChange={(v) => onChange({ standardPriceAtTransfer: v })}
            transferDate={transferDate}
            jibun={asset.addressJibun || undefined}
            assetKind={asset.assetKind}
            landAreaM2={asset.assetKind === "land" ? asset.landAreaM2 : undefined}
            pre1990Form={{
              pre1990Enabled: asset.pre1990Enabled,
              pre1990AreaSqm: asset.pre1990AreaSqm,
              pre1990PricePerSqm_1990: asset.pre1990PricePerSqm_1990,
              pre1990PricePerSqm_atTransfer: asset.pre1990PricePerSqm_atTransfer,
              pre1990Grade_current: asset.pre1990Grade_current,
              pre1990Grade_prev: asset.pre1990Grade_prev,
              pre1990Grade_atAcq: asset.pre1990Grade_atAcq,
              pre1990GradeMode: asset.pre1990GradeMode,
            }}
            onPre1990Change={(patch) => onChange(patch)}
          />
        )}

        {asset.acquisitionCause === "inheritance" && (
          <CompanionAcqInheritanceBlock
            assetId={asset.assetId}
            acquisitionDate={asset.acquisitionDate}
            onAcquisitionDateChange={(v) => onChange({
              acquisitionDate: v,
              // auto 모드일 때 보충적평가용 inheritanceDate를 하나의 patch로 동기화
              // (두 번 연속 onChange를 호출하면 stale 클로저로 두 번째가 첫 번째를 덮어씀)
              ...(asset.inheritanceValuationMode === "auto" ? { inheritanceDate: v } : {}),
            })}
            decedentAcquisitionDate={asset.decedentAcquisitionDate}
            onDecedentAcquisitionDateChange={(v) => onChange({ decedentAcquisitionDate: v })}
            valuationMode={asset.inheritanceValuationMode}
            onValuationModeChange={(mode) => onChange({ inheritanceValuationMode: mode })}
            inheritanceAssetKind={asset.inheritanceAssetKind}
            onInheritanceAssetKindChange={(v) => onChange({ inheritanceAssetKind: v })}
            inheritanceDate={asset.inheritanceDate}
            onInheritanceDateChange={(v) => onChange({ inheritanceDate: v })}
            landAreaM2={asset.landAreaM2}
            publishedValueAtInheritance={asset.publishedValueAtInheritance}
            onPublishedValueAtInheritanceChange={(v) =>
              onChange({ publishedValueAtInheritance: v })
            }
            fixedAcquisitionPrice={asset.fixedAcquisitionPrice}
            onFixedAcquisitionPriceChange={(v) => onChange({ fixedAcquisitionPrice: v })}
            jibun={asset.addressJibun || undefined}
          />
        )}

        {asset.acquisitionCause === "gift" && (
          <CompanionAcqGiftBlock
            acquisitionDate={asset.acquisitionDate}
            onAcquisitionDateChange={(v) => onChange({ acquisitionDate: v })}
            donorAcquisitionDate={asset.donorAcquisitionDate}
            onDonorAcquisitionDateChange={(v) => onChange({ donorAcquisitionDate: v })}
            fixedAcquisitionPrice={asset.fixedAcquisitionPrice}
            onFixedAcquisitionPriceChange={(v) => onChange({ fixedAcquisitionPrice: v })}
          />
        )}
      </div>

      {/* 다필지 토글 (토지 전용) */}
      {asset.assetKind === "land" && (
        <div className="space-y-2 rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`parcel-mode-${asset.assetId}`}
              checked={asset.parcelMode ?? false}
              onChange={(e) => {
                const checked = e.target.checked;
                const defaultParcel: ParcelFormItem = {
                  id: `parcel-${Date.now()}-0`,
                  acquisitionDate: "",
                  acquisitionMethod: "estimated",
                  acquisitionPrice: "",
                  acquisitionArea: "",
                  transferArea: "",
                  standardPricePerSqmAtAcq: "",
                  standardPricePerSqmAtTransfer: "",
                  expenses: "0",
                  useDayAfterReplotting: false,
                  replottingConfirmDate: "",
                  useExchangeLandReduction: false,
                  entitlementArea: "",
                  allocatedArea: "",
                  priorLandArea: "",
                };
                onChange({
                  parcelMode: checked,
                  parcels: checked && (!asset.parcels || asset.parcels.length === 0)
                    ? [defaultParcel]
                    : asset.parcels,
                });
              }}
              className="h-4 w-4"
            />
            <label htmlFor={`parcel-mode-${asset.assetId}`} className="text-sm font-medium cursor-pointer">
              취득시기 상이 (환지·합병 등 다필지)
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            취득원인·취득일이 다른 2필지 이상인 경우 (소득세법 시행령 §162①6호)
          </p>
          {asset.parcelMode && (
            <ParcelListInput
              parcels={asset.parcels ?? []}
              totalTransferPrice={parseAmount(asset.actualSalePrice || "0")}
              onChange={(parcels) => onChange({ parcels })}
            />
          )}
        </div>
      )}

      {/* 직접 필요경비 */}
      <CurrencyInput
        label="직접 귀속 필요경비 (원)"
        value={asset.directExpenses}
        onChange={(v) => onChange({ directExpenses: v })}
      />

      {/* 감면은 Step 5(감면·공제)에서 자산별로 선택합니다 */}
    </div>
  );
}
