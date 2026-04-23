"use client";

/**
 * 동반자산 상속 취득(inheritance) 입력 블록
 *
 * 상속 취득가액 산정 모드:
 *   - auto:   상속개시일 직전 공시가격으로 보충적평가액 자동 산정 (상증법 §61)
 *   - manual: 직접 입력 (감정평가액·시가 등)
 *
 * 자산별 단기보유 통산을 위해 피상속인 취득일을 자체 입력받는다.
 */

import { useEffect } from "react";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { cn } from "@/lib/utils";
import { useStandardPriceLookup, getDefaultPriceYear } from "@/lib/hooks/useStandardPriceLookup";

const INHERITANCE_ASSET_KIND_OPTIONS = [
  { value: "land", label: "토지 (공시지가 × 면적)" },
  { value: "house_individual", label: "개별·다세대주택 (개별주택가격)" },
  { value: "house_apart", label: "공동주택 (공동주택가격)" },
] as const;

interface BlockProps {
  assetId: string;
  acquisitionDate: string; // 상속개시일과 동일
  onAcquisitionDateChange: (v: string) => void;
  decedentAcquisitionDate: string;
  onDecedentAcquisitionDateChange: (v: string) => void;
  valuationMode: "auto" | "manual";
  onValuationModeChange: (mode: "auto" | "manual") => void;
  // auto 모드용
  inheritanceAssetKind: "land" | "house_individual" | "house_apart";
  onInheritanceAssetKindChange: (v: "land" | "house_individual" | "house_apart") => void;
  inheritanceDate: string;
  onInheritanceDateChange: (v: string) => void;
  landAreaM2: string;
  publishedValueAtInheritance: string;
  onPublishedValueAtInheritanceChange: (v: string) => void;
  // manual 모드용
  fixedAcquisitionPrice: string;
  onFixedAcquisitionPriceChange: (v: string) => void;
  /** 공시가격 조회용 지번 주소 */
  jibun?: string;
}

// ─── 토지 공시지가 조회 ───────────────────────────────────────────

function LandPublishedValueLookup({
  jibun,
  inheritanceDate,
  value,
  onChange,
}: {
  jibun?: string;
  inheritanceDate: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { loading, msg, year, setYear, yearOptions, lookup } =
    useStandardPriceLookup("land");

  useEffect(() => {
    setYear(getDefaultPriceYear(inheritanceDate, "land"));
  }, [inheritanceDate, setYear]);

  async function handleLookup() {
    const price = await lookup({ jibun: jibun ?? "", propertyType: "land", year });
    if (price !== null) onChange(String(price));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="border rounded-md px-2 py-1.5 text-sm bg-background"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleLookup}
          disabled={loading}
          className="px-3 py-1.5 rounded-md text-sm border border-border bg-background hover:bg-muted disabled:opacity-50 transition-colors"
        >
          {loading ? "조회 중…" : "공시가격 조회"}
        </button>
      </div>
      <CurrencyInput
        label="상속개시일 직전 고시 개별공시지가 (원/㎡)"
        value={value}
        onChange={onChange}
      />
      {msg && (
        <p
          className={cn(
            "text-xs",
            msg.kind === "ok"
              ? "text-green-600 dark:text-green-400"
              : "text-destructive",
          )}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}

// ─── 주택 공시가격 조회 ────────────────────────────────────────────

function HousePublishedValueLookup({
  jibun,
  inheritanceDate,
  value,
  onChange,
}: {
  jibun?: string;
  inheritanceDate: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { loading, msg, year, setYear, yearOptions, lookup } =
    useStandardPriceLookup("housing");

  useEffect(() => {
    setYear(getDefaultPriceYear(inheritanceDate, "housing"));
  }, [inheritanceDate, setYear]);

  async function handleLookup() {
    const price = await lookup({ jibun: jibun ?? "", propertyType: "housing", year });
    if (price !== null) onChange(String(price));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="border rounded-md px-2 py-1.5 text-sm bg-background"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleLookup}
          disabled={loading}
          className="px-3 py-1.5 rounded-md text-sm border border-border bg-background hover:bg-muted disabled:opacity-50 transition-colors"
        >
          {loading ? "조회 중…" : "공시가격 조회"}
        </button>
      </div>
      <CurrencyInput
        label="상속개시일 직전 고시 주택가격 (원)"
        value={value}
        onChange={onChange}
      />
      {msg && (
        <p
          className={cn(
            "text-xs",
            msg.kind === "ok"
              ? "text-green-600 dark:text-green-400"
              : "text-destructive",
          )}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}

// ─── 메인 블록 ────────────────────────────────────────────────────

export function CompanionAcqInheritanceBlock(props: BlockProps) {
  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">상속개시일</label>
          <DateInput
            value={props.acquisitionDate}
            onChange={props.onAcquisitionDateChange}
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">피상속인 취득일</label>
          <DateInput
            value={props.decedentAcquisitionDate}
            onChange={props.onDecedentAcquisitionDateChange}
          />
          <p className="text-[11px] text-muted-foreground">단기보유 통산용 (소득세법 §95④)</p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">상속 취득가액 산정</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => props.onValuationModeChange("auto")}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm border transition-colors",
              props.valuationMode === "auto"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-muted",
            )}
          >
            자동 (보충적평가액)
          </button>
          <button
            type="button"
            onClick={() => props.onValuationModeChange("manual")}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm border transition-colors",
              props.valuationMode === "manual"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-muted",
            )}
          >
            직접 입력
          </button>
        </div>

        {props.valuationMode === "auto" && (
          <div className="pl-4 space-y-3 pt-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">자산 구분 (상속개시일 기준)</label>
              <div className="flex flex-col gap-1.5">
                {INHERITANCE_ASSET_KIND_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name={`inh-kind-${props.assetId}`}
                      value={opt.value}
                      checked={props.inheritanceAssetKind === opt.value}
                      onChange={() => props.onInheritanceAssetKindChange(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {props.inheritanceAssetKind === "land" && (
              <div className="space-y-3">
                <LandPublishedValueLookup
                  jibun={props.jibun}
                  inheritanceDate={props.inheritanceDate}
                  value={props.publishedValueAtInheritance}
                  onChange={props.onPublishedValueAtInheritanceChange}
                />
                {props.landAreaM2 && parseAmount(props.publishedValueAtInheritance) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    보충적평가액 ≈{" "}
                    {(
                      parseFloat(props.landAreaM2) *
                      parseAmount(props.publishedValueAtInheritance)
                    ).toLocaleString()}
                    원
                  </p>
                )}
              </div>
            )}

            {(props.inheritanceAssetKind === "house_individual" ||
              props.inheritanceAssetKind === "house_apart") && (
              <HousePublishedValueLookup
                jibun={props.jibun}
                inheritanceDate={props.inheritanceDate}
                value={props.publishedValueAtInheritance}
                onChange={props.onPublishedValueAtInheritanceChange}
              />
            )}
          </div>
        )}

        {props.valuationMode === "manual" && (
          <div className="pl-4 pt-2">
            <CurrencyInput
              label="취득가액 (원)"
              value={props.fixedAcquisitionPrice}
              onChange={props.onFixedAcquisitionPriceChange}
              required
            />
          </div>
        )}
      </div>
    </div>
  );
}
