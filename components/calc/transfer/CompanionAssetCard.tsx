"use client";

import { useState } from "react";
import type { AssetForm, ParcelFormItem } from "@/lib/stores/calc-wizard-store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { ParcelListInput } from "@/components/calc/inputs/ParcelListInput";
import { CompanionSaleModeBlock, type BundledSaleMode } from "./CompanionSaleModeBlock";
import { CompanionAcqPurchaseBlock } from "./CompanionAcqPurchaseBlock";
import { CompanionAcqInheritanceBlock } from "./CompanionAcqInheritanceBlock";
import { CompanionAcqGiftBlock } from "./CompanionAcqGiftBlock";
import { NblSectionContainer } from "./nbl/NblSectionContainer";

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
  /** 증환지 증가분 등 자산 자동 추가 콜백 */
  onAddAsset?: (patch: Partial<AssetForm>) => void;
}

export function CompanionAssetCard({
  index,
  asset,
  bundledSaleMode,
  onChange,
  onRemove,
  singleMode,
  transferDate,
  onAddAsset,
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

      {/* 면적 정보 — 토지 자산만 표시 */}
      {asset.assetKind === "land" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">면적 입력 방식</label>
            <Select
              value={asset.areaScenario ?? "same"}
              onValueChange={(v) => {
                const next = v as AssetForm["areaScenario"];
                if (next === "same") {
                  const val = asset.transferArea || asset.acquisitionArea || "";
                  onChange({ areaScenario: next, acquisitionArea: val, transferArea: val,
                    replottingConfirmDate: "", entitlementArea: "", allocatedArea: "", priorLandArea: "" });
                } else if (next === "reduction" || next === "increase") {
                  onChange({ areaScenario: next,
                    replottingConfirmDate: "", entitlementArea: "", allocatedArea: "", priorLandArea: "" });
                } else {
                  onChange({ areaScenario: next });
                }
              }}
            >
              <SelectTrigger className="h-9 w-full">
                <span className="text-left">
                  {asset.areaScenario === "partial"
                    ? "일부 양도 — 취득 토지 중 일부만 양도"
                    : asset.areaScenario === "reduction"
                      ? "환지처분 (감환지) — 교부면적 < 권리면적"
                      : asset.areaScenario === "increase"
                        ? "환지처분 (증환지) — 교부면적 > 권리면적"
                        : "취득면적 = 양도면적 (일반)"}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="same">취득면적 = 양도면적 (일반)</SelectItem>
                <SelectItem value="partial">일부 양도 — 취득 토지 중 일부만 양도</SelectItem>
                <SelectItem value="reduction">환지처분 (감환지) — 교부면적 &lt; 권리면적</SelectItem>
                <SelectItem value="increase">환지처분 (증환지) — 교부면적 &gt; 권리면적</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* same: 단일 면적 입력 */}
          {(asset.areaScenario ?? "same") === "same" && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                취득·양도 당시 면적 (㎡)
                <span
                  title="취득·양도 기준시가 = ㎡ 단가 × 이 면적. 공시가격 자동 조회 및 환산취득가 계산에 사용됩니다."
                  className="ml-1 cursor-help"
                >ⓘ</span>
              </label>
              <input
                type="number"
                value={asset.transferArea}
                onChange={(e) =>
                  onChange({ acquisitionArea: e.target.value, transferArea: e.target.value })
                }
                min={0}
                placeholder="예: 793"
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              />
            </div>
          )}

          {/* partial: 취득·양도 분리 입력 */}
          {asset.areaScenario === "partial" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                취득 당시 면적 (㎡)
                <span title="처음 취득 시 보유한 전체 면적. 취득 기준시가 = ㎡ 단가 × 이 면적." className="ml-1 cursor-help">ⓘ</span>
              </label>
                <input
                  type="number"
                  value={asset.acquisitionArea}
                  onChange={(e) => onChange({ acquisitionArea: e.target.value })}
                  min={0}
                  placeholder="전체 취득한 면적"
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                양도 당시 면적 (㎡)
                <span title="이번 양도 계약에서 매매하는 면적. 양도 기준시가 = ㎡ 단가 × 이 면적." className="ml-1 cursor-help">ⓘ</span>
              </label>
                <input
                  type="number"
                  value={asset.transferArea}
                  onChange={(e) => onChange({ transferArea: e.target.value })}
                  min={0}
                  placeholder="이번에 파는 면적"
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                />
              </div>
            </div>
          )}

          {/* reduction: 환지처분 (감환지) — 의제취득면적 자동계산 */}
          {asset.areaScenario === "reduction" && (
            <ReplotReductionFields asset={asset} onChange={onChange} />
          )}

          {/* increase: 환지처분 (증환지) — 경고 + 직접 입력 + 증가분 자동 추가 */}
          {asset.areaScenario === "increase" && (
            <ReplotIncreaseFields asset={asset} onChange={onChange} onAddAsset={onAddAsset} />
          )}
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
        transferArea={asset.assetKind === "land" ? asset.transferArea : undefined}
        onTransferAreaChange={asset.assetKind === "land" ? (v) => onChange({ transferArea: v }) : undefined}
        standardPricePerSqmAtTransfer={asset.standardPricePerSqmAtTransfer}
        onStandardPricePerSqmAtTransferChange={(v) => onChange({ standardPricePerSqmAtTransfer: v })}
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
            isAppraisalAcquisition={asset.isAppraisalAcquisition}
            onIsAppraisalAcquisitionChange={(v) => onChange({ isAppraisalAcquisition: v })}
            fixedAcquisitionPrice={asset.fixedAcquisitionPrice}
            onFixedAcquisitionPriceChange={(v) => onChange({ fixedAcquisitionPrice: v })}
            standardPriceAtAcq={asset.standardPriceAtAcq}
            onStandardPriceAtAcqChange={(v) => onChange({ standardPriceAtAcq: v })}
            standardPriceAtTransfer={asset.standardPriceAtTransfer}
            onStandardPriceAtTransferChange={(v) => onChange({ standardPriceAtTransfer: v })}
            transferDate={transferDate}
            jibun={asset.addressJibun || undefined}
            assetKind={asset.assetKind}
            acquisitionArea={asset.acquisitionArea || undefined}
            transferArea={asset.transferArea || undefined}
            standardPricePerSqmAtAcq={asset.standardPricePerSqmAtAcq}
            onStandardPricePerSqmAtAcqChange={(v) => onChange({ standardPricePerSqmAtAcq: v })}
            standardPricePerSqmAtTransfer={asset.standardPricePerSqmAtTransfer}
            onStandardPricePerSqmAtTransferChange={(v) => onChange({ standardPricePerSqmAtTransfer: v })}
            pre1990Form={{
              pre1990Enabled: asset.pre1990Enabled,
              pre1990PricePerSqm_1990: asset.pre1990PricePerSqm_1990,
              pre1990PricePerSqm_atTransfer: asset.pre1990PricePerSqm_atTransfer,
              pre1990Grade_current: asset.pre1990Grade_current,
              pre1990Grade_prev: asset.pre1990Grade_prev,
              pre1990Grade_atAcq: asset.pre1990Grade_atAcq,
              pre1990GradeMode: asset.pre1990GradeMode,
            }}
            onPre1990Change={(patch) => onChange(patch)}
            isSelfBuilt={asset.isSelfBuilt}
            onIsSelfBuiltChange={(v) => onChange({ isSelfBuilt: v })}
            buildingType={asset.buildingType}
            onBuildingTypeChange={(v) => onChange({ buildingType: v })}
            constructionDate={asset.constructionDate}
            onConstructionDateChange={(v) => onChange({ constructionDate: v })}
            extensionFloorArea={asset.extensionFloorArea}
            onExtensionFloorAreaChange={(v) => onChange({ extensionFloorArea: v })}
            hasSeperateLandAcquisitionDate={asset.hasSeperateLandAcquisitionDate}
            onHasSeperateLandAcquisitionDateChange={(v) =>
              onChange({ hasSeperateLandAcquisitionDate: v })
            }
            landAcquisitionDate={asset.landAcquisitionDate}
            onLandAcquisitionDateChange={(v) => onChange({ landAcquisitionDate: v })}
            landSplitMode={asset.landSplitMode}
            onLandSplitModeChange={(v) => onChange({ landSplitMode: v })}
            landTransferPrice={asset.landTransferPrice}
            onLandTransferPriceChange={(v) => onChange({ landTransferPrice: v })}
            buildingTransferPrice={asset.buildingTransferPrice}
            onBuildingTransferPriceChange={(v) => onChange({ buildingTransferPrice: v })}
            landAcquisitionPrice={asset.landAcquisitionPrice}
            onLandAcquisitionPriceChange={(v) => onChange({ landAcquisitionPrice: v })}
            buildingAcquisitionPrice={asset.buildingAcquisitionPrice}
            onBuildingAcquisitionPriceChange={(v) => onChange({ buildingAcquisitionPrice: v })}
            landDirectExpenses={asset.landDirectExpenses}
            onLandDirectExpensesChange={(v) => onChange({ landDirectExpenses: v })}
            buildingDirectExpenses={asset.buildingDirectExpenses}
            onBuildingDirectExpensesChange={(v) => onChange({ buildingDirectExpenses: v })}
            landStandardPriceAtTransfer={asset.landStandardPriceAtTransfer}
            onLandStandardPriceAtTransferChange={(v) =>
              onChange({ landStandardPriceAtTransfer: v })
            }
            buildingStandardPriceAtTransfer={asset.buildingStandardPriceAtTransfer}
            onBuildingStandardPriceAtTransferChange={(v) =>
              onChange({ buildingStandardPriceAtTransfer: v })
            }
            asset={asset}
            onAssetChange={onChange}
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
            landAreaM2={asset.acquisitionArea}
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
                  areaScenario: "same",
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

      {/* 비사업용 토지 정밀 판정 — "판정 도움" 모드일 때만 표시 */}
      {asset.assetKind === "land" && asset.isNonBusinessLand && asset.nblUseDetailedJudgment && (
        <div className="pt-2 border-t border-border/60">
          <NblSectionContainer asset={asset} onAssetChange={onChange} />
        </div>
      )}

      {/* 감면은 Step 5(감면·공제)에서 자산별로 선택합니다 */}
    </div>
  );
}

const AREA_INPUT_CLASS = "w-full border rounded-md px-3 py-2 text-sm bg-background";

function calcDayAfter(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

function calcEffectiveArea(prior: string, allocated: string, entitlement: string): string {
  const p = parseFloat(prior);
  const a = parseFloat(allocated);
  const e = parseFloat(entitlement);
  if (p > 0 && a > 0 && e > 0) return String((p * a / e).toFixed(4));
  return "";
}

/** 환지처분 (감환지) 입력 섹션 */
function ReplotReductionFields({
  asset,
  onChange,
}: {
  asset: AssetForm;
  onChange: (d: Partial<AssetForm>) => void;
}) {
  const effArea = calcEffectiveArea(asset.priorLandArea, asset.allocatedArea, asset.entitlementArea);
  const ent = parseFloat(asset.entitlementArea ?? "");
  const alloc = parseFloat(asset.allocatedArea ?? "");
  const isIncrease = ent > 0 && alloc > 0 && ent < alloc;

  return (
    <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/40 p-3">
      <p className="text-xs text-amber-800">
        권리면적·교부면적·종전면적을 입력하면 의제 취득면적이 자동 계산됩니다.
        <span className="ml-1 text-muted-foreground">(소득령 §162의2)</span>
      </p>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">환지처분확정일</label>
        <DateInput
          value={asset.replottingConfirmDate}
          onChange={(v) => {
            const acqDate = v ? calcDayAfter(v) : "";
            onChange({ replottingConfirmDate: v, acquisitionDate: acqDate });
          }}
        />
        {asset.replottingConfirmDate && (
          <p className="text-xs text-blue-600">
            취득일 = {asset.replottingConfirmDate} 다음날 자동 적용
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            권리면적 (㎡)
            <span title="환지예정지 지정 시 받기로 한 면적" className="ml-1 cursor-help text-muted-foreground">ⓘ</span>
          </label>
          <input type="number" step="0.01" className={AREA_INPUT_CLASS}
            value={asset.entitlementArea}
            onChange={(e) => {
              const eff = calcEffectiveArea(asset.priorLandArea, asset.allocatedArea, e.target.value);
              onChange({ entitlementArea: e.target.value, acquisitionArea: eff });
            }}
            placeholder="0.00" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            교부면적 (㎡)
            <span title="환지처분 확정 후 실제 교부받은 면적. 양도면적으로 자동 적용됩니다." className="ml-1 cursor-help text-muted-foreground">ⓘ</span>
          </label>
          <input type="number" step="0.01" className={AREA_INPUT_CLASS}
            value={asset.allocatedArea}
            onChange={(e) => {
              const eff = calcEffectiveArea(asset.priorLandArea, e.target.value, asset.entitlementArea);
              onChange({ allocatedArea: e.target.value, transferArea: e.target.value, acquisitionArea: eff });
            }}
            placeholder="0.00" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            종전면적 (㎡)
            <span title="환지 전 보유했던 원래 면적. 의제취득면적 = 종전×(교부÷권리)" className="ml-1 cursor-help text-muted-foreground">ⓘ</span>
          </label>
          <input type="number" step="0.01" className={AREA_INPUT_CLASS}
            value={asset.priorLandArea}
            onChange={(e) => {
              const eff = calcEffectiveArea(e.target.value, asset.allocatedArea, asset.entitlementArea);
              onChange({ priorLandArea: e.target.value, acquisitionArea: eff });
            }}
            placeholder="0.00" />
        </div>
      </div>

      {isIncrease ? (
        <p className="text-xs text-orange-700">
          ⚠ 증환지(권리 {ent}㎡ &lt; 교부 {alloc}㎡) — 증환지는 아래 옵션을 선택하세요.
        </p>
      ) : effArea ? (
        <div className="rounded bg-amber-100 px-3 py-2 text-xs text-amber-800 space-y-0.5">
          <div>
            의제 취득면적:{" "}
            <strong>
              {asset.priorLandArea}㎡ × ({asset.allocatedArea}㎡ ÷ {asset.entitlementArea}㎡) = {effArea}㎡
            </strong>{" "}(자동 적용)
          </div>
          <div>양도면적: <strong>{asset.allocatedArea}㎡</strong> (= 교부면적)</div>
        </div>
      ) : null}
    </div>
  );
}

/** 환지처분 (증환지) 입력 섹션 */
function ReplotIncreaseFields({
  asset,
  onChange,
  onAddAsset,
}: {
  asset: AssetForm;
  onChange: (d: Partial<AssetForm>) => void;
  onAddAsset?: (patch: Partial<AssetForm>) => void;
}) {
  const [increaseAdded, setIncreaseAdded] = useState(false);

  const alloc = parseFloat(asset.allocatedArea ?? "");
  const ent = parseFloat(asset.entitlementArea ?? "");
  const increaseM2 = alloc > 0 && ent > 0 && alloc > ent ? alloc - ent : null;

  function handleAddIncrease() {
    if (!increaseM2 || !onAddAsset) return;
    onAddAsset({
      assetLabel: "증환지 증가분",
      assetKind: "land",
      acquisitionDate: asset.acquisitionDate, // 환지처분확정일 익일 (이미 세팅됨)
      acquisitionArea: increaseM2.toFixed(4),
      transferArea: increaseM2.toFixed(4),
      areaScenario: "same",
      acquisitionCause: "purchase",
      isPrimaryForHouseholdFlags: false,
    });
    setIncreaseAdded(true);
  }

  return (
    <div className="space-y-3 rounded-md border border-orange-200 bg-orange-50/40 p-3">
      <p className="text-xs text-orange-800">
        증환지: 권리면적 초과분은 환지처분확정일 익일에 별도 취득한 것으로 봅니다.
        이 자산에는 <strong>원래 토지분</strong>만 입력하고,
        증가분 자산을 자동 추가하여 취득가액을 별도 입력하세요.
      </p>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">환지처분확정일</label>
        <DateInput
          value={asset.replottingConfirmDate}
          onChange={(v) => {
            const acqDate = v ? calcDayAfter(v) : "";
            onChange({ replottingConfirmDate: v, acquisitionDate: acqDate });
          }}
        />
        {asset.replottingConfirmDate && (
          <p className="text-xs text-blue-600">
            취득일 = {asset.replottingConfirmDate} 다음날 자동 적용
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            취득 당시 면적 (㎡)
            <span title="환지처분 전 원래 보유 면적 (권리면적 기준)" className="ml-1 cursor-help text-muted-foreground">ⓘ</span>
          </label>
          <input type="number" step="0.01" className={AREA_INPUT_CLASS}
            value={asset.acquisitionArea}
            onChange={(e) => onChange({ acquisitionArea: e.target.value, entitlementArea: e.target.value })}
            placeholder="권리면적 기준" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            양도 당시 면적 (㎡)
            <span title="이번 양도 면적 (증가분 제외, 권리면적 기준)" className="ml-1 cursor-help text-muted-foreground">ⓘ</span>
          </label>
          <input type="number" step="0.01" className={AREA_INPUT_CLASS}
            value={asset.transferArea}
            onChange={(e) => onChange({ transferArea: e.target.value, allocatedArea: e.target.value })}
            placeholder="이번에 파는 면적" />
        </div>
      </div>

      {increaseM2 !== null && (
        increaseAdded ? (
          <div className="rounded bg-green-100 px-3 py-2 text-xs text-green-800 flex items-center gap-1.5">
            <span>✓</span>
            <span>
              증가분 자산 <strong>{increaseM2.toFixed(2)}㎡</strong>이 추가되었습니다.
              아래 카드에서 취득가액을 입력하세요.
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="rounded bg-orange-100 px-3 py-2 text-xs text-orange-800">
              증가분 <strong>{increaseM2.toFixed(2)}㎡</strong> (= 교부 {alloc}㎡ − 권리 {ent}㎡) 별도 취득
            </div>
            {onAddAsset && (
              <button
                type="button"
                onClick={handleAddIncrease}
                className="w-full rounded-md border border-orange-300 bg-white px-3 py-2 text-sm text-orange-700 hover:bg-orange-50 transition-colors"
              >
                + 증가분 {increaseM2.toFixed(2)}㎡ 자산 자동 추가
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}
