"use client";

/**
 * 동반자산 상속 취득(inheritance) 입력 블록
 *
 * 상속 취득가액 산정 모드:
 *   - auto:   상속개시일 직전 공시가격으로 보충적평가액 자동 산정 (상증법 §61)
 *   - manual: 직접 입력 (감정평가액·시가 등)
 *
 * 자산별 단기보유 통산을 위해 피상속인 취득일을 자체 입력받는다.
 *
 * publishedValueAtInheritance 저장 형식:
 *   - 토지(land):   단가(원/㎡) — 엔진이 × landAreaM2 하여 보충적평가액 산출
 *   - 주택:         총액(원)    — 엔진에 그대로 전달
 * API 스키마 변경 없음.
 */

import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { DateInput } from "@/components/ui/date-input";
import { cn } from "@/lib/utils";
import { useState } from "react";

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
  /**
   * 토지: 단가(원/㎡) 저장 — 엔진이 면적을 곱해 보충적평가액 산출
   * 주택: 총액(원) 저장
   * API 스키마 변경 없음 (기존 publishedValueAtInheritance 필드 그대로)
   */
  publishedValueAtInheritance: string;
  onPublishedValueAtInheritanceChange: (v: string) => void;
  // manual 모드용
  fixedAcquisitionPrice: string;
  onFixedAcquisitionPriceChange: (v: string) => void;
  /** 공시가격 조회용 지번 주소 */
  jibun?: string;
}

// ─── 메인 블록 ────────────────────────────────────────────────────

export function CompanionAcqInheritanceBlock(props: BlockProps) {
  // 토지 모드: 공시지가 단가(원/㎡)를 publishedValueAtInheritance에 저장하되,
  // StandardPriceInput의 totalPrice에는 단가×면적 계산 결과(총액)를 표시한다.
  // 단, 엔진은 publishedValueAtInheritance(단가)를 받으므로 별도 totalPrice state로 관리.
  const [landTotalPrice, setLandTotalPrice] = useState(() => {
    if (props.inheritanceAssetKind === "land" && props.publishedValueAtInheritance && props.landAreaM2) {
      const sqm = parseAmount(props.publishedValueAtInheritance);
      const area = parseFloat(props.landAreaM2);
      return sqm > 0 && area > 0 ? String(Math.floor(sqm * area)) : "";
    }
    return "";
  });

  /**
   * 토지 단가 변경 핸들러
   * pricePerSqm → publishedValueAtInheritance (단가 저장)
   * totalPrice  → landTotalPrice (표시 전용)
   */
  function handleLandPricePerSqmChange(v: string) {
    props.onPublishedValueAtInheritanceChange(v.replace(/,/g, ""));
  }

  function handleLandTotalPriceChange(v: string) {
    setLandTotalPrice(v);
    // 총액 역산 → 단가 업데이트
    const total = parseAmount(v);
    const area = parseFloat(props.landAreaM2);
    if (total > 0 && area > 0) {
      const perSqm = Math.round((total / area) * 1000) / 1000;
      props.onPublishedValueAtInheritanceChange(String(perSqm));
    }
  }

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

            {/* 토지: pricePerSqm = publishedValueAtInheritance (단가), totalPrice = 내부 계산용 */}
            {props.inheritanceAssetKind === "land" && (
              <div className="space-y-3">
                <StandardPriceInput
                  propertyKind="land"
                  totalPrice={landTotalPrice}
                  onTotalPriceChange={handleLandTotalPriceChange}
                  pricePerSqm={props.publishedValueAtInheritance}
                  onPricePerSqmChange={handleLandPricePerSqmChange}
                  area={props.landAreaM2}
                  jibun={props.jibun}
                  referenceDate={props.inheritanceDate}
                  label="상속개시일 직전 고시 개별공시지가 (원/㎡) 및 총액"
                  hint="보충적평가액 = 공시지가(원/㎡) × 면적(㎡)"
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

            {/* 주택: totalPrice = publishedValueAtInheritance (총액 직접 저장) */}
            {(props.inheritanceAssetKind === "house_individual" ||
              props.inheritanceAssetKind === "house_apart") && (
              <StandardPriceInput
                propertyKind={props.inheritanceAssetKind}
                totalPrice={props.publishedValueAtInheritance}
                onTotalPriceChange={props.onPublishedValueAtInheritanceChange}
                jibun={props.jibun}
                referenceDate={props.inheritanceDate}
                label="상속개시일 직전 고시 주택가격 (원)"
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
