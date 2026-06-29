"use client";

/**
 * ③ 취득정보 — 취득원인 세부·신축 부수토지·세율 오버라이드·다필지·겸용 확장·상업용/일반건물/재개발 블록.
 * CompanionAssetCard L535–640 JSX를 그대로 이동.
 */
import type { AssetForm, ParcelFormItem } from "@/lib/stores/calc-wizard-store";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ParcelListInput } from "@/components/calc/inputs/ParcelListInput";
import { MixedUseExpandedPanel } from "../MixedUseSection";
import {
  CompanionLandRateOverrideToggle,
  NewConstructionPrimarySection,
} from "../CompanionAssetCardNewConstruction";
import { CompanionAcquisitionCauseSection } from "../CompanionAcquisitionCauseSection";
import { CommercialBuildingBlock } from "../CommercialBuildingBlock";
import { GeneralBuildingBlock } from "../GeneralBuildingBlock";
import { RedevelopmentBlock } from "../RedevelopmentBlock";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  isNewConstruction: boolean;
  isPrimary: boolean;
  isOneHouseSingle?: boolean;
}

export function AssetSectionAcquisition({
  asset,
  onChange,
  transferDate,
  isNewConstruction,
  isPrimary,
  isOneHouseSingle,
}: Props) {
  return (
    <>
      {/* 취득 원인 + 원인별 세부 입력 (별도 파일로 분리 — 800줄 정책) */}
      <CompanionAcquisitionCauseSection
        asset={asset}
        onChange={onChange}
        transferDate={transferDate}
        isNewConstruction={isNewConstruction}
      />

      {/* 신축주택 — 부수토지 한도 산정 섹션 (영 §154⑦) */}
      {isNewConstruction && asset.assetKind === "housing" && (
        <NewConstructionPrimarySection
          asset={asset}
          onChange={onChange}
        />
      )}

      {/* companion 토지 — 수동 세율 오버라이드 토글 (부수토지 일체과세 §89·영§154⑦) */}
      {asset.assetKind === "land" && !isPrimary && (
        <CompanionLandRateOverrideToggle
          asset={asset}
          onChange={onChange}
        />
      )}

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

      {/* 겸용주택 확장 패널 — 체크박스 ON 시 직접 귀속 필요경비 위에 노출. */}
      {asset.assetKind === "housing" && (
        <MixedUseExpandedPanel
          asset={asset}
          onChange={onChange}
          transferDate={transferDate}
          useEstimatedAcquisition={asset.useEstimatedAcquisition}
          jibun={asset.addressJibun || undefined}
        />
      )}

      {/* 상업용건물·오피스텔 환산취득가 입력 (assetKind === "commercial_building" 시만 표시) */}
      {asset.assetKind === "commercial_building" && (
        <CommercialBuildingBlock
          asset={asset}
          onChange={onChange}
          transferDate={transferDate}
        />
      )}

      {/* 일반건물(토지+건물 일괄) — 취득방법 무관 항상 마운트 (2026-05-10 실거래가 모드 지원) */}
      {asset.assetKind === "general_building" && (
        <GeneralBuildingBlock
          asset={asset}
          onChange={onChange}
          transferDate={transferDate}
        />
      )}

      {/* 재개발/재건축 (시행령 §166) — assetKind === "redevelopment_apt" 시만 표시 (사례 44) */}
      {asset.assetKind === "redevelopment_apt" && (
        <RedevelopmentBlock asset={asset} onChange={onChange} isOneHouseSingle={isOneHouseSingle} />
      )}
    </>
  );
}
