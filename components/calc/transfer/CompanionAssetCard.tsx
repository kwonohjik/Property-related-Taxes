"use client";

import type { AssetForm, ParcelFormItem } from "@/lib/stores/calc-wizard-store";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { ParcelListInput } from "@/components/calc/inputs/ParcelListInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { CompanionSaleModeBlock, type BundledSaleMode } from "./CompanionSaleModeBlock";
import { CompanionAcqPurchaseBlock } from "./CompanionAcqPurchaseBlock";
import { CompanionAcqInheritanceBlock } from "./CompanionAcqInheritanceBlock";
import { CompanionAcqGiftBlock } from "./CompanionAcqGiftBlock";
import { CarryoverGiftBlock } from "./CarryoverGiftBlock";
import { InheritedAcquisitionDeemedSection } from "./InheritedAcquisitionDeemedSection";
import { NblSectionContainer } from "./nbl/NblSectionContainer";
import { OwnershipRatioInput, isFractionalMode } from "./OwnershipRatioInput";
import { MixedUseToggleRow, MixedUseExpandedPanel } from "./MixedUseSection";
import { RentalHousingExceptionSection } from "./RentalHousingExceptionSection";
import { RENTAL_HOUSING_EXCEPTION_DEFAULTS } from "@/lib/stores/calc-wizard-asset-factory";

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
  { value: "carryover_gift", label: "이월과세(증여)" },
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
  /** 폼-수준 총 양도가액 — 지분 모드 시 ratio×total 자동 계산용 */
  contractTotalPrice?: string;
  /** 폼-수준 총 양도비 — 자산별 자동 안분 표시용 */
  totalTransferExpense?: string;
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
  contractTotalPrice,
  totalTransferExpense,
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

      {/* 검용주택 분리계산 토글 — 자산 종류가 주택일 때 상단에 노출.
         확장 패널은 자산 카드 하단(직접 귀속 필요경비 위)에 별도 배치. */}
      {asset.assetKind === "housing" && (
        <MixedUseToggleRow asset={asset} onChange={onChange} />
      )}

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
                placeholder="면적 입력"
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

      {/* 공유 지분율 — 단독 100/100 기본, 지분 단계취득 자산은 명시 입력 */}
      <OwnershipRatioInput
        numerator={asset.ownershipNumerator}
        denominator={asset.ownershipDenominator}
        onChange={(patch) =>
          onChange({
            ...(patch.numerator !== undefined ? { ownershipNumerator: patch.numerator } : {}),
            ...(patch.denominator !== undefined ? { ownershipDenominator: patch.denominator } : {}),
          })
        }
      />

      {/* 지분 모드 활성 시 100% 기준 입력 안내 (단독 소유는 미표시) */}
      {isFractionalMode(asset.ownershipNumerator, asset.ownershipDenominator) && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50/70 px-4 py-3 text-sm">
          <div className="flex items-start gap-2">
            <span aria-hidden className="text-amber-600 font-bold text-base leading-none mt-0.5">
              ⚠
            </span>
            <div className="space-y-1.5 flex-1">
              <p className="font-semibold text-amber-900">
                지분 모드 — 모든 금액을 <span className="underline">100% 기준</span>으로 입력하세요
              </p>
              <ul className="text-xs text-amber-800 space-y-0.5 leading-relaxed list-disc list-inside">
                <li>
                  <strong>양도가액·취득가액·필요경비</strong>는 물건 전체(100%) 기준으로 입력합니다.
                  시스템이 지분율(
                  {asset.ownershipNumerator}/{asset.ownershipDenominator})을 자동으로 적용합니다.
                </li>
                <li>
                  예: 60% 지분의 실제 매매가 600,000,000원 → 100% 기준{" "}
                  <strong>1,000,000,000원</strong>으로 입력 (600M ÷ 0.6).
                </li>
                <li>상속 보충적평가는 공동주택가격(100%)을 그대로 입력하면 됩니다.</li>
              </ul>
            </div>
          </div>
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
        ownershipNumerator={asset.ownershipNumerator}
        ownershipDenominator={asset.ownershipDenominator}
        contractTotalPrice={contractTotalPrice}
        standardPricePerSqmAtTransfer={asset.standardPricePerSqmAtTransfer}
        onStandardPricePerSqmAtTransferChange={(v) => onChange({ standardPricePerSqmAtTransfer: v })}
      />

      {/* 취득 원인 */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">취득 원인</label>
        <div className="grid grid-cols-4 gap-2">
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
            selfOwns={asset.selfOwns ?? "both"}
            onSelfOwnsChange={(v) => {
              onChange({
                selfOwns: v,
                hasSeperateLandAcquisitionDate: v !== "both" ? true : asset.hasSeperateLandAcquisitionDate,
              });
            }}
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
              // 의제 특례 섹션의 inheritanceStartDate와 자동 동기화
              // (한 번 입력으로 두 섹션의 상속개시일이 일치하도록)
              inheritanceStartDate: v,
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

        {/* 상속 취득가액 의제 특례 — 기존 보충적평가 블록 아래에 추가 */}
        {asset.acquisitionCause === "inheritance" && (
          <InheritedAcquisitionDeemedSection
            asset={asset}
            onChange={onChange}
            transferDate={transferDate}
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

        {asset.acquisitionCause === "carryover_gift" && (
          <CarryoverGiftBlock
            asset={asset}
            transferDate={transferDate ?? ""}
            onChange={onChange}
          />
        )}
      </div>

      {/* 다필지 토글 (토지 전용) */}
      {asset.assetKind === "land" && (
        <ToggleCard
          tone="sky"
          title="취득시기 상이 (환지·합병 등 다필지)"
          description="취득원인·취득일이 다른 2필지 이상인 경우 (소득세법 시행령 §162①6호)"
          checked={asset.parcelMode ?? false}
          onCheckedChange={(checked) => {
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
              capitalExpenditure: "0",
              transferExpense: "0",
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
        >
          <ParcelListInput
            parcels={asset.parcels ?? []}
            totalTransferPrice={parseAmount(asset.actualSalePrice || "0")}
            onChange={(parcels) => onChange({ parcels })}
          />
        </ToggleCard>
      )}

      {/* 검용주택 확장 패널 — 체크박스 ON 시 직접 귀속 필요경비 위에 노출.
         transferDate는 폼-전역 양도일을 사용 (PHD 양도시 시점 기준연도용). */}
      {asset.assetKind === "housing" && (
        <MixedUseExpandedPanel
          asset={asset}
          onChange={onChange}
          transferDate={transferDate}
          useEstimatedAcquisition={asset.useEstimatedAcquisition}
          jibun={asset.addressJibun || undefined}
        />
      )}

      {/* 필요경비 — 자본적지출 / 양도비 분리 입력 (소득세법 §97① 가목·나목)
          두 필드 합 > 환산취득가+개산공제 → §97② 단서 swap 발동 */}
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
        <p className="text-xs font-semibold text-foreground">
          필요경비 <span className="text-muted-foreground font-normal">(소득세법 §97①·②)</span>
        </p>
        <CurrencyInput
          label="자본적 지출액 (원) — §97① 가목"
          value={asset.capitalExpenditure}
          onChange={(v) => onChange({ capitalExpenditure: v })}
          hint={
            isFractionalMode(asset.ownershipNumerator, asset.ownershipDenominator)
              ? "자산 보유 중 발생한 인테리어·증축 등. 100% 기준 입력 — 시스템이 지분율 자동 적용"
              : "자산 보유 중 발생한 인테리어·증축 등 자본적 지출"
          }
        />
        {(() => {
          const formTotal = parseAmount(totalTransferExpense || "0");
          const num = parseFloat(asset.ownershipNumerator || "100");
          const den = parseFloat(asset.ownershipDenominator || "100");
          const fractional = isFractionalMode(asset.ownershipNumerator, asset.ownershipDenominator);
          const ratio = isFinite(num) && isFinite(den) && den > 0 ? Math.min(num / den, 1.0) : 1.0;
          const allocated = formTotal > 0 ? Math.floor(formTotal * ratio) : 0;
          const useFormLevel = formTotal > 0;
          return (
            <CurrencyInput
              label="양도비 (원) — §97① 나목"
              value={useFormLevel ? String(allocated) : asset.transferExpense}
              onChange={(v) => onChange({ transferExpense: v })}
              disabled={useFormLevel}
              hint={
                useFormLevel
                  ? fractional
                    ? `자동 안분 ${allocated.toLocaleString()} = 총 양도비 ${formTotal.toLocaleString()} × 지분 ${num}/${den}. 폼 상단 "총 양도비"를 비우면 직접 입력 가능`
                    : `자동 적용 ${allocated.toLocaleString()} (폼 상단 "총 양도비"). 비우면 직접 입력 가능`
                  : fractional
                    ? "양도 시 1회 발생 (중개수수료·인지대 등). 지분 모드는 폼 상단 \"총 양도비\"에서 일괄 입력 권장 (자동 안분)"
                    : "양도 시 발생한 중개수수료·인지대 등"
              }
            />
          );
        })()}
        <p className="text-[11px] text-muted-foreground">
          환산취득가/감정가액 모드에서 (자본+양도비) &gt; (환산+개산공제) 시 §97② 단서에 따라 자본+양도비를 필요경비로 적용합니다.
        </p>
      </div>

      {/* legacy 단일 필드 — backward-compat (sessionStorage 로드 시 표시).
          신규 입력은 위 분리 필드 사용. 둘 다 0이면 이 값이 합산으로 사용됨 (실가 모드만). */}
      {parseInt(asset.directExpenses || "0", 10) > 0
       && parseInt(asset.capitalExpenditure || "0", 10) === 0
       && parseInt(asset.transferExpense || "0", 10) === 0 && (
        <CurrencyInput
          label="직접 귀속 필요경비 (원) — legacy"
          value={asset.directExpenses}
          onChange={(v) => onChange({ directExpenses: v })}
        />
      )}

      {/* 비사업용 토지 정밀 판정 — "판정 도움" 모드일 때만 표시 */}
      {asset.assetKind === "land" && asset.isNonBusinessLand && asset.nblUseDetailedJudgment && (
        <div className="pt-2 border-t border-border/60">
          <NblSectionContainer asset={asset} onAssetChange={onChange} />
        </div>
      )}

      {/* 장기임대주택 보유자 거주주택 비과세 특례 — 주택 자산에만 표시 (소령 §155⑳) */}
      {(asset.assetKind === "housing" || asset.assetKind === "right_to_move_in") && (
        <div className="pt-2 border-t border-border/60">
          <RentalHousingExceptionSection
            rh={asset.rentalHousingException ?? { ...RENTAL_HOUSING_EXCEPTION_DEFAULTS }}
            acquisitionDate={asset.acquisitionDate}
            transferDate={transferDate ?? ""}
            residencePeriodMonthsAsset={asset.residencePeriodMonthsAsset}
            onChangeResidencePeriodMonths={(v) => onChange({ residencePeriodMonthsAsset: v })}
            onChange={(rh) => onChange({ rentalHousingException: rh })}
          />
        </div>
      )}

      {/* 감면은 Step 5(감면·공제)에서 자산별로 선택합니다 */}
    </div>
  );
}

import {
  ReplotReductionFields,
  ReplotIncreaseFields,
} from "./CompanionAssetCardReplot";

