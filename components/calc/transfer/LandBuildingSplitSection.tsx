"use client";

/**
 * 토지/건물 가액 분리 입력 섹션 (실제 모드 전용)
 *
 * hasSeperateLandAcquisitionDate === true 이고 landSplitMode === "actual" 시 렌더.
 * 미입력 항목은 엔진에서 기준시가 비율로 자동 안분 (fallback).
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";

interface Props {
  useEstimatedAcquisition: boolean;
  landTransferPrice: string;
  onLandTransferPriceChange: (v: string) => void;
  buildingTransferPrice: string;
  onBuildingTransferPriceChange: (v: string) => void;
  landAcquisitionPrice: string;
  onLandAcquisitionPriceChange: (v: string) => void;
  buildingAcquisitionPrice: string;
  onBuildingAcquisitionPriceChange: (v: string) => void;
  landStandardPriceAtTransfer: string;
  onLandStandardPriceAtTransferChange: (v: string) => void;
  buildingStandardPriceAtTransfer: string;
  onBuildingStandardPriceAtTransferChange: (v: string) => void;
  landDirectExpenses: string;
  onLandDirectExpensesChange: (v: string) => void;
  buildingDirectExpenses: string;
  onBuildingDirectExpensesChange: (v: string) => void;
}

export function LandBuildingSplitSection(props: Props) {
  return (
    <div className="space-y-3 rounded-md border border-dashed border-border bg-muted/20 p-3">
      <p className="text-xs font-semibold text-muted-foreground">
        토지 / 건물 각 가액 직접 입력 (미입력 시 기준시가 비율로 자동 안분)
      </p>

      <div className="grid grid-cols-2 gap-2">
        <FieldCard label="토지 양도가액" hint="소득령 §166⑥">
          <CurrencyInput label="" value={props.landTransferPrice} onChange={props.onLandTransferPriceChange} placeholder="미입력 시 자동 안분" />
        </FieldCard>
        <FieldCard label="건물 양도가액">
          <CurrencyInput label="" value={props.buildingTransferPrice} onChange={props.onBuildingTransferPriceChange} placeholder="미입력 시 자동 안분" />
        </FieldCard>
      </div>

      {!props.useEstimatedAcquisition && (
        <div className="grid grid-cols-2 gap-2">
          <FieldCard label="토지 취득가액">
            <CurrencyInput label="" value={props.landAcquisitionPrice} onChange={props.onLandAcquisitionPriceChange} placeholder="미입력 시 자동 안분" />
          </FieldCard>
          <FieldCard label="건물 취득가액">
            <CurrencyInput label="" value={props.buildingAcquisitionPrice} onChange={props.onBuildingAcquisitionPriceChange} placeholder="미입력 시 자동 안분" />
          </FieldCard>
        </div>
      )}

      {props.useEstimatedAcquisition && (
        <div className="grid grid-cols-2 gap-2">
          <FieldCard label="토지 양도시 기준시가" hint="환산취득가 분리 계산용">
            <CurrencyInput label="" value={props.landStandardPriceAtTransfer} onChange={props.onLandStandardPriceAtTransferChange} placeholder="미입력 시 안분 추정" />
          </FieldCard>
          <FieldCard label="건물 양도시 기준시가">
            <CurrencyInput label="" value={props.buildingStandardPriceAtTransfer} onChange={props.onBuildingStandardPriceAtTransferChange} placeholder="미입력 시 안분 추정" />
          </FieldCard>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <FieldCard label="토지 자본적지출">
          <CurrencyInput label="" value={props.landDirectExpenses} onChange={props.onLandDirectExpensesChange} placeholder="미입력 시 자동 안분" />
        </FieldCard>
        <FieldCard label="건물 자본적지출">
          <CurrencyInput label="" value={props.buildingDirectExpenses} onChange={props.onBuildingDirectExpensesChange} placeholder="미입력 시 자동 안분" />
        </FieldCard>
      </div>
    </div>
  );
}
