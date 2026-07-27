"use client";

/**
 * 토지/건물 취득·양도가액 독립 산정 섹션 (소득세법 시행령 §166⑥·§168②)
 *
 * `hasSeperateLandAcquisitionDate === true` 시 항상 렌더(토지·건물 취득일이 다른 자산).
 *
 * 취득 축: 토지·건물 각각 4방식(실거래가·환산취득가·감정가액·매매사례가액) **독립** 선택.
 * 양도 축: 취득과 **독립** — 구분양도(직접입력) | 일괄양도(양도시 기준시가 안분).
 *
 * 계획서: docs/02-design/features/transfer-land-building-independent-valuation-mode.plan.md (§8)
 * · UI 설계: transfer-land-building-independent-valuation-mode.ui.design.md (§2)
 *
 * 미입력 시 엔진 동작(`transfer-tax-split-gain.ts`):
 *   실가·감정: 한쪽만 입력 → 반대쪽 = 총액 − 입력값(잔액) / 둘 다 미입력 → 취득시 기준시가 비율 안분.
 *   매매사례: 파트별 입력 우선, 미입력 시 §166⑥ "구분 불분명" → 취득시 기준시가 비율 안분.
 *   환산: 파트 양도가 × (파트 취득시/양도시 기준시가).
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { RadioCardGroup, type RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import type { PartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";

export type { PartAcqMode };

const ACQ_MODE_OPTIONS: RadioCardOption<PartAcqMode>[] = [
  { value: "actual", label: "실거래가" },
  { value: "estimated", label: "환산취득가" },
  { value: "appraisal", label: "감정가액" },
  { value: "salesCase", label: "매매사례가액" },
];

const SALE_MODE_OPTIONS: RadioCardOption<"actual" | "apportioned">[] = [
  { value: "actual", label: "구분양도 (직접입력)" },
  { value: "apportioned", label: "일괄양도 (양도시 기준시가 안분)" },
];

interface Props {
  /** 토지·건물 소유자 분리 — 본인 소유하지 않는 파트는 모드 선택 비노출 */
  selfOwns: "both" | "building_only" | "land_only";
  /** 부담부증여(§159 자동 산정) — 파트별 모드·양도 분리 선택 자체를 숨긴다(안내만 표시) */
  isBurdenedGift?: boolean;

  landAcqMode: PartAcqMode;
  onLandAcqModeChange: (v: PartAcqMode) => void;
  buildingAcqMode: PartAcqMode;
  onBuildingAcqModeChange: (v: PartAcqMode) => void;

  saleSplitMode: "actual" | "apportioned";
  onSaleSplitModeChange: (v: "actual" | "apportioned") => void;

  landTransferPrice: string;
  onLandTransferPriceChange: (v: string) => void;
  buildingTransferPrice: string;
  onBuildingTransferPriceChange: (v: string) => void;
  landAcquisitionPrice: string;
  onLandAcquisitionPriceChange: (v: string) => void;
  buildingAcquisitionPrice: string;
  onBuildingAcquisitionPriceChange: (v: string) => void;
  landSalesCaseValue: string;
  onLandSalesCaseValueChange: (v: string) => void;
  buildingSalesCaseValue: string;
  onBuildingSalesCaseValueChange: (v: string) => void;
  landStandardPriceAtTransfer: string;
  onLandStandardPriceAtTransferChange: (v: string) => void;
  buildingStandardPriceAtTransfer: string;
  onBuildingStandardPriceAtTransferChange: (v: string) => void;
  landDirectExpenses: string;
  onLandDirectExpensesChange: (v: string) => void;
  buildingDirectExpenses: string;
  onBuildingDirectExpensesChange: (v: string) => void;
}

/** 파트 취득 방식별 조건부 입력 (actual/appraisal은 총액 직접입력, salesCase는 매매사례가, estimated는 안내만) */
function PartAcqInputs(props: {
  part: "land" | "building";
  mode: PartAcqMode;
  acquisitionPrice: string;
  onAcquisitionPriceChange: (v: string) => void;
  salesCaseValue: string;
  onSalesCaseValueChange: (v: string) => void;
}) {
  const label = props.part === "land" ? "토지" : "건물";
  if (props.mode === "actual" || props.mode === "appraisal") {
    return (
      <FieldCard label={`${label} ${props.mode === "appraisal" ? "감정가액" : "취득가액"}`}>
        <CurrencyInput
          label=""
          value={props.acquisitionPrice}
          onChange={props.onAcquisitionPriceChange}
          placeholder="미입력 시 나머지에서 자동 계산"
          data-testid={`split-${props.part}-acq-price`}
        />
      </FieldCard>
    );
  }
  if (props.mode === "salesCase") {
    return (
      <FieldCard label={`${label} 매매사례가액`} hint="미입력 시 취득시 기준시가 비율로 안분(소득령 §166⑥)">
        <CurrencyInput
          label=""
          value={props.salesCaseValue}
          onChange={props.onSalesCaseValueChange}
          placeholder="없으면 비워두세요"
          data-testid={`split-${props.part}-salescase-value`}
        />
      </FieldCard>
    );
  }
  // estimated — 취득시 기준시가는 위 "취득가액 산정 방식" 섹션의 공용 입력에서 파생(안분),
  // 양도시 기준시가는 아래 공용 칸에서 입력(환산 분모 겸 안분 분모).
  return (
    <p className="text-xs text-muted-foreground italic">
      {label} 환산취득가 = {label} 양도가액 × (취득시/양도시 기준시가) — 아래 양도시 기준시가 입력 필요.
    </p>
  );
}

export function LandBuildingSplitSection(props: Props) {
  const landOwned = props.selfOwns !== "building_only";
  const buildingOwned = props.selfOwns !== "land_only";
  const needsSaleStdPrice =
    props.saleSplitMode === "apportioned" ||
    props.landAcqMode === "estimated" ||
    props.buildingAcqMode === "estimated";

  if (props.isBurdenedGift) {
    return (
      <div className="space-y-2 rounded-md border border-dashed border-border bg-muted/20 p-3">
        <p className="rounded-md bg-fuchsia-50/60 px-2.5 py-1.5 text-xs text-fuchsia-800" data-testid="split-burdened-note">
          부담부증여는 양도가액·취득가액을 <strong>§159 인수 채무액 기준으로 자동 산정</strong>하므로,
          토지·건물 각 가액은 직접 입력하지 않고 <strong>기준시가 비율로 안분</strong>됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-dashed border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-xs font-semibold text-muted-foreground">
          취득가액 산정 방식 — 토지·건물 독립 선택
        </p>
        <LawArticleModal legalBasis="소득세법 시행령 §166⑥" label="§166⑥ 안분" />
      </div>

      {/* ① 토지 취득가액 방식 */}
      {landOwned && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">
              1
            </span>
            <p className="text-xs font-semibold text-amber-800">토지 취득가액 방식</p>
          </div>
          <div data-testid="part-acq-mode-land">
            <RadioCardGroup
              name="landAcqMode"
              tone="amber"
              layout="inline"
              options={ACQ_MODE_OPTIONS}
              value={props.landAcqMode}
              onChange={props.onLandAcqModeChange}
            />
          </div>
          <PartAcqInputs
            part="land"
            mode={props.landAcqMode}
            acquisitionPrice={props.landAcquisitionPrice}
            onAcquisitionPriceChange={props.onLandAcquisitionPriceChange}
            salesCaseValue={props.landSalesCaseValue}
            onSalesCaseValueChange={props.onLandSalesCaseValueChange}
          />
        </div>
      )}

      {/* ② 건물 취득가액 방식 */}
      {buildingOwned && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">
              2
            </span>
            <p className="text-xs font-semibold text-amber-800">건물 취득가액 방식</p>
          </div>
          <div data-testid="part-acq-mode-building">
            <RadioCardGroup
              name="buildingAcqMode"
              tone="amber"
              layout="inline"
              options={ACQ_MODE_OPTIONS}
              value={props.buildingAcqMode}
              onChange={props.onBuildingAcqModeChange}
            />
          </div>
          <PartAcqInputs
            part="building"
            mode={props.buildingAcqMode}
            acquisitionPrice={props.buildingAcquisitionPrice}
            onAcquisitionPriceChange={props.onBuildingAcquisitionPriceChange}
            salesCaseValue={props.buildingSalesCaseValue}
            onSalesCaseValueChange={props.onBuildingSalesCaseValueChange}
          />
        </div>
      )}

      {/* 양도가액 결정 방식 — 취득과 독립(이 자산의 토지·건물 양도가액. 다건 자산 간 bundledSaleMode와 별개) */}
      <div className="space-y-1.5 border-t border-border pt-2">
        <p className="text-xs font-semibold text-muted-foreground">
          이 자산의 토지·건물 양도가액 결정 방식
        </p>
        <div data-testid="sale-split-mode">
          <RadioCardGroup
            name="saleSplitMode"
            tone="amber"
            layout="inline"
            options={SALE_MODE_OPTIONS}
            value={props.saleSplitMode}
            onChange={props.onSaleSplitModeChange}
          />
        </div>
        {props.saleSplitMode === "actual" ? (
          <div className="grid grid-cols-2 gap-2">
            <FieldCard label="토지 양도가액" hint="소득령 §166⑥">
              <CurrencyInput label="" value={props.landTransferPrice} onChange={props.onLandTransferPriceChange} placeholder="미입력 시 나머지에서 자동 계산" data-testid="split-land-transfer-price" />
            </FieldCard>
            <FieldCard label="건물 양도가액">
              <CurrencyInput label="" value={props.buildingTransferPrice} onChange={props.onBuildingTransferPriceChange} placeholder="미입력 시 나머지에서 자동 계산" data-testid="split-building-transfer-price" />
            </FieldCard>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            양도시 기준시가 비율로 자동 안분됩니다(부가가치세법 시행령 §64①1호 준용).
          </p>
        )}
      </div>

      {/* 양도시 기준시가 — apportioned 양도(안분 분모) 또는 파트 환산(분모) 시 필요. 두 용도 겸용(단일 입력). */}
      {needsSaleStdPrice && (
        <div className="grid grid-cols-2 gap-2">
          <FieldCard label="토지 양도시 기준시가" hint="안분 분모 겸 환산취득가 분모">
            <CurrencyInput label="" value={props.landStandardPriceAtTransfer} onChange={props.onLandStandardPriceAtTransferChange} placeholder="양도시 토지 기준시가" />
          </FieldCard>
          <FieldCard label="건물 양도시 기준시가">
            <CurrencyInput label="" value={props.buildingStandardPriceAtTransfer} onChange={props.onBuildingStandardPriceAtTransferChange} placeholder="양도시 건물 기준시가" />
          </FieldCard>
        </div>
      )}

      {/* 자본적지출 — 모드·양도 방식과 무관하게 항상 입력 가능 */}
      <div className="grid grid-cols-2 gap-2">
        <FieldCard label="토지 자본적지출" hint="토지에 귀속되는 자본적지출만 입력, 없으면 비워두세요">
          <CurrencyInput label="" value={props.landDirectExpenses} onChange={props.onLandDirectExpensesChange} placeholder="없으면 비워두세요" />
        </FieldCard>
        <FieldCard label="건물 자본적지출" hint="건물에 귀속되는 자본적지출만 입력, 없으면 비워두세요">
          <CurrencyInput label="" value={props.buildingDirectExpenses} onChange={props.onBuildingDirectExpensesChange} placeholder="없으면 비워두세요" />
        </FieldCard>
      </div>
    </div>
  );
}
