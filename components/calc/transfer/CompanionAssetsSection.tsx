"use client";

import type { CompanionAssetForm } from "@/lib/stores/calc-wizard-store";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";

const ASSET_KIND_LABELS: Record<string, string> = {
  housing: "주택",
  land: "토지",
  building: "건물(토지 외)",
};

const ASSET_KIND_OPTIONS = [
  { value: "housing", label: "주택" },
  { value: "land", label: "토지·농지" },
  { value: "building", label: "건물(토지 외)" },
] as const;

const INHERITANCE_ASSET_KIND_OPTIONS = [
  { value: "land", label: "토지 (공시지가 × 면적)" },
  { value: "house_individual", label: "개별·다세대주택 (개별주택가격)" },
  { value: "house_apart", label: "공동주택 (공동주택가격)" },
] as const;

function makeDefaultAsset(index: number): CompanionAssetForm {
  return {
    assetId: `companion-${Date.now()}-${index}`,
    assetLabel: `동반자산 ${index + 1}`,
    assetKind: "land",
    standardPriceAtTransfer: "",
    directExpenses: "0",
    reductionType: "",
    farmingYears: "0",
    inheritanceValuationMode: "auto",
    inheritanceDate: "",
    inheritanceAssetKind: "land",
    landAreaM2: "",
    publishedValueAtInheritance: "",
    fixedAcquisitionPrice: "",
    addressRoad: "",
    addressJibun: "",
    isOneHousehold: false,
  };
}

interface Props {
  assets: CompanionAssetForm[];
  onChange: (assets: CompanionAssetForm[]) => void;
}

export function CompanionAssetsSection({ assets, onChange }: Props) {
  function addAsset() {
    onChange([...assets, makeDefaultAsset(assets.length)]);
  }

  function removeAsset(idx: number) {
    onChange(assets.filter((_, i) => i !== idx));
  }

  function updateAsset(idx: number, patch: Partial<CompanionAssetForm>) {
    onChange(assets.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }

  return (
    <div className="space-y-4">
      {assets.map((asset, idx) => (
        <div key={asset.assetId} className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">
              동반자산 {idx + 1} — {ASSET_KIND_LABELS[asset.assetKind] ?? asset.assetKind}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => removeAsset(idx)}
            >
              삭제
            </Button>
          </div>

          {/* 자산 종류 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">자산 종류</label>
            <div className="flex gap-2 flex-wrap">
              {ASSET_KIND_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateAsset(idx, { assetKind: opt.value })}
                  className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                    asset.assetKind === opt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 자산 명칭 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">자산 명칭</label>
            <input
              type="text"
              value={asset.assetLabel}
              onChange={(e) => updateAsset(idx, { assetLabel: e.target.value })}
              placeholder="예: 농지(밭), 부속토지"
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            />
          </div>

          {/* 양도시 기준시가 */}
          <CurrencyInput
            label={
              asset.assetKind === "land"
                ? "양도시 기준시가 (공시지가 × 면적, 원)"
                : "양도시 기준시가 (원)"
            }
            value={asset.standardPriceAtTransfer}
            onChange={(v) => updateAsset(idx, { standardPriceAtTransfer: v })}
            required
          />

          {/* 직접 필요경비 */}
          <CurrencyInput
            label="직접 귀속 필요경비 (원)"
            value={asset.directExpenses}
            onChange={(v) => updateAsset(idx, { directExpenses: v })}
          />

          {/* 감면 */}
          {asset.assetKind === "land" && (
            <div className="space-y-2">
              <label className="block text-sm font-medium">감면</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => updateAsset(idx, { reductionType: "" })}
                  className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                    !asset.reductionType
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-muted"
                  }`}
                >
                  없음
                </button>
                <button
                  type="button"
                  onClick={() => updateAsset(idx, { reductionType: "self_farming" })}
                  className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                    asset.reductionType === "self_farming"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-muted"
                  }`}
                >
                  자경농지 감면 (조특법 §69)
                </button>
              </div>
              {asset.reductionType === "self_farming" && (
                <div className="pl-4 space-y-1.5">
                  <label className="block text-sm font-medium">
                    자경기간 (년)
                  </label>
                  <input
                    type="number"
                    value={asset.farmingYears}
                    onChange={(e) => updateAsset(idx, { farmingYears: e.target.value })}
                    min={0}
                    max={50}
                    className="w-32 border rounded-md px-3 py-2 text-sm bg-background"
                  />
                </div>
              )}
            </div>
          )}

          {/* 상속 취득가액 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">상속 취득가액 산정</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => updateAsset(idx, { inheritanceValuationMode: "auto" })}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                  asset.inheritanceValuationMode === "auto"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted"
                }`}
              >
                자동 (보충적평가액)
              </button>
              <button
                type="button"
                onClick={() => updateAsset(idx, { inheritanceValuationMode: "manual" })}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                  asset.inheritanceValuationMode === "manual"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted"
                }`}
              >
                직접 입력
              </button>
            </div>

            {asset.inheritanceValuationMode === "auto" && (
              <div className="pl-4 space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium">자산 구분 (상속개시일 기준)</label>
                  <div className="flex flex-col gap-1.5">
                    {INHERITANCE_ASSET_KIND_OPTIONS.map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                          type="radio"
                          name={`inh-kind-${asset.assetId}`}
                          value={opt.value}
                          checked={asset.inheritanceAssetKind === opt.value}
                          onChange={() => updateAsset(idx, { inheritanceAssetKind: opt.value })}
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium">상속개시일</label>
                  <DateInput
                    value={asset.inheritanceDate}
                    onChange={(v) => updateAsset(idx, { inheritanceDate: v })}
                  />
                </div>

                {asset.inheritanceAssetKind === "land" && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium">토지 면적 (㎡)</label>
                      <input
                        type="number"
                        value={asset.landAreaM2}
                        onChange={(e) => updateAsset(idx, { landAreaM2: e.target.value })}
                        min={0}
                        placeholder="예: 793"
                        className="w-48 border rounded-md px-3 py-2 text-sm bg-background"
                      />
                    </div>
                    <CurrencyInput
                      label="상속개시일 직전 고시 개별공시지가 (원/㎡)"
                      value={asset.publishedValueAtInheritance}
                      onChange={(v) => updateAsset(idx, { publishedValueAtInheritance: v })}
                    />
                    {asset.landAreaM2 && parseAmount(asset.publishedValueAtInheritance) > 0 && (
                      <p className="text-xs text-muted-foreground">
                        보충적평가액 ≈{" "}
                        {(
                          parseFloat(asset.landAreaM2) *
                          parseAmount(asset.publishedValueAtInheritance)
                        ).toLocaleString()}
                        원
                      </p>
                    )}
                  </div>
                )}

                {(asset.inheritanceAssetKind === "house_individual" ||
                  asset.inheritanceAssetKind === "house_apart") && (
                  <CurrencyInput
                    label="상속개시일 직전 고시 주택가격 (원)"
                    value={asset.publishedValueAtInheritance}
                    onChange={(v) => updateAsset(idx, { publishedValueAtInheritance: v })}
                  />
                )}
              </div>
            )}

            {asset.inheritanceValuationMode === "manual" && (
              <div className="pl-4">
                <CurrencyInput
                  label="취득가액 (원)"
                  value={asset.fixedAcquisitionPrice}
                  onChange={(v) => updateAsset(idx, { fixedAcquisitionPrice: v })}
                />
              </div>
            )}
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" onClick={addAsset} className="w-full">
        + 동반자산 추가
      </Button>
    </div>
  );
}
