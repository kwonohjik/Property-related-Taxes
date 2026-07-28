"use client";

/**
 * 취득 원인 선택 + 원인별 세부 입력 블록 (CompanionAssetCard 분리).
 * 800줄 정책에 따라 CompanionAssetCard.tsx에서 추출 (2026-05-07).
 */

import { cn } from "@/lib/utils";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { CompanionAcqPurchaseBlock } from "./CompanionAcqPurchaseBlock";
import { CompanionAcqNewConstructionBlock } from "./CompanionAcqNewConstructionBlock";
import { computeEarliestDate } from "./NewConstructionDateBlock";
import { CompanionAcqInheritanceBlock } from "./CompanionAcqInheritanceBlock";
import { CompanionAcqGiftBlock } from "./CompanionAcqGiftBlock";
import { CarryoverGiftBlock } from "./CarryoverGiftBlock";
import { NewConstructionDateBlock } from "./NewConstructionDateBlock";
import { GeneralBuildingAcquisitionCards } from "./GeneralBuildingAcquisitionCards";
import { FamilyBusinessInheritanceTransferSection } from "./FamilyBusinessInheritanceTransferSection";
import { deriveLegacyPartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";

const ACQUISITION_CAUSE_OPTIONS = [
  { value: "purchase", label: "매매" },
  { value: "inheritance", label: "상속" },
  { value: "gift", label: "증여" },
  { value: "carryover_gift", label: "이월과세(증여)" },
  { value: "newConstruction", label: "신축(자가건축)" },
] as const;

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  isNewConstruction: boolean;
}

export function CompanionAcquisitionCauseSection({
  asset,
  onChange,
  transferDate,
  isNewConstruction,
}: Props) {
  // 일반건물(토지+건물 일괄) — 토지/건물 2카드로 분리 표시
  if (asset.assetKind === "general_building") {
    return (
      <GeneralBuildingAcquisitionCards
        asset={asset}
        onChange={onChange}
        transferDate={transferDate}
      />
    );
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">취득 원인</label>
      <div className="grid grid-cols-5 gap-1.5">
        {ACQUISITION_CAUSE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange({ acquisitionCause: opt.value })}
            className={cn(
              "rounded-md border-2 px-1 py-2 text-center transition-all",
              asset.acquisitionCause === opt.value
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
            )}
          >
            <div className="text-sm font-semibold whitespace-nowrap">{opt.label}</div>
          </button>
        ))}
      </div>

      {/* 신축(자가건축) — 사용승인일 4-시점 입력 블록 (영 §162①4호, G-5) */}
      {isNewConstruction && (
        <NewConstructionDateBlock
          occupancyApprovalDate={asset.occupancyApprovalDate ?? ""}
          onOccupancyApprovalDateChange={(v) =>
            onChange({
              occupancyApprovalDate: v,
              acquisitionDate:
                computeEarliestDate(v, asset.approvalCertificateDate ?? "", asset.temporaryApprovalDate ?? "", asset.actualUseDate ?? "") ?? "",
            })
          }
          approvalCertificateDate={asset.approvalCertificateDate ?? ""}
          onApprovalCertificateDateChange={(v) =>
            onChange({
              approvalCertificateDate: v,
              acquisitionDate:
                computeEarliestDate(asset.occupancyApprovalDate ?? "", v, asset.temporaryApprovalDate ?? "", asset.actualUseDate ?? "") ?? "",
            })
          }
          temporaryApprovalDate={asset.temporaryApprovalDate ?? ""}
          onTemporaryApprovalDateChange={(v) =>
            onChange({
              temporaryApprovalDate: v,
              acquisitionDate:
                computeEarliestDate(asset.occupancyApprovalDate ?? "", asset.approvalCertificateDate ?? "", v, asset.actualUseDate ?? "") ?? "",
            })
          }
          actualUseDate={asset.actualUseDate ?? ""}
          onActualUseDateChange={(v) =>
            onChange({
              actualUseDate: v,
              acquisitionDate:
                computeEarliestDate(asset.occupancyApprovalDate ?? "", asset.approvalCertificateDate ?? "", asset.temporaryApprovalDate ?? "", v) ?? "",
            })
          }
        />
      )}

      {/* 신축(자가건축) — 신축비용(취득가액) 입력 블록 */}
      {isNewConstruction && (
        <CompanionAcqNewConstructionBlock
          fixedAcquisitionPrice={asset.fixedAcquisitionPrice}
          onFixedAcquisitionPriceChange={(v) => onChange({ fixedAcquisitionPrice: v })}
        />
      )}

      {asset.acquisitionCause === "purchase" && (
        <CompanionAcqPurchaseBlock
          acquisitionDate={asset.acquisitionDate}
          onAcquisitionDateChange={(v) => onChange({ acquisitionDate: v })}
          isSalesCaseAcquisition={asset.isSalesCaseAcquisition}
          onIsSalesCaseAcquisitionChange={(v) => onChange({ isSalesCaseAcquisition: v })}
          similarSalesValue={asset.similarSalesValue}
          onSimilarSalesValueChange={(v) => onChange({ similarSalesValue: v })}
          similarSalesSource={asset.similarSalesSource}
          onSimilarSalesSourceChange={(v) => onChange({ similarSalesSource: v })}
          acquisitionSigunguCode={asset.acquisitionSigunguCode}
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
          dong={asset.addressDong || undefined}
          ho={asset.addressHo || undefined}
          assetKind={asset.assetKind}
          acquisitionArea={asset.acquisitionArea || undefined}
          onAcquisitionAreaChange={(v) => onChange({ acquisitionArea: v })}
          acqAreaLabel={asset.areaScenario === "increase" ? "종전토지 면적 (㎡)" : undefined}
          transferArea={asset.transferArea || undefined}
          onTransferAreaChange={(v) => onChange({ transferArea: v })}
          transferAreaLabel={asset.areaScenario === "increase" ? "권리면적 (㎡)" : undefined}
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
          extensionStdPriceAtAcquisition={asset.extensionStdPriceAtAcquisition}
          onExtensionStdPriceAtAcquisitionChange={(v) => onChange({ extensionStdPriceAtAcquisition: v })}
          selfOwns={asset.selfOwns ?? "both"}
          onSelfOwnsChange={(v) => {
            onChange({
              selfOwns: v,
              hasSeperateLandAcquisitionDate: v !== "both" ? true : asset.hasSeperateLandAcquisitionDate,
            });
          }}
          hasSeperateLandAcquisitionDate={asset.hasSeperateLandAcquisitionDate}
          onHasSeperateLandAcquisitionDateChange={(v) =>
            // 분리 진입 시 파트 모드를 자산 전체 레거시 플래그에서 파생해 기록한다.
            // "actual" 하드코딩 금지 — 상단에서 이미 환산·감정을 고른 사용자의 선택이
            // 조용히 실거래가로 바뀐다. 상단 라디오는 별개 취득에서 숨겨지므로 복구도 불가능하다.
            // 다중 키를 한 번에 바꾸므로 **단일 배치 onChange**로 처리
            // (feedback_multikey_patch_stale_spread_overwrite — 분리 호출 시 stale spread 덮어쓰기).
            onChange({
              hasSeperateLandAcquisitionDate: v,
              ...(v
                ? {
                    landAcqMode: asset.landAcqMode || deriveLegacyPartAcqMode(asset),
                    buildingAcqMode: asset.buildingAcqMode || deriveLegacyPartAcqMode(asset),
                  }
                : {}),
            })
          }
          landAcquisitionDate={asset.landAcquisitionDate}
          onLandAcquisitionDateChange={(v) => onChange({ landAcquisitionDate: v })}
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
          asset={asset}
          onChange={onChange}
          transferDate={transferDate}
        />
      )}

      {/* 가업상속공제 §97의2④ 의제 취득가액 — 상속 취득원인 시만 표시 */}
      {asset.acquisitionCause === "inheritance" && (
        <FamilyBusinessInheritanceTransferSection
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
  );
}
