"use client";

/**
 * StandardPriceInput — 공시가격 입력 공용 컴포넌트
 *
 * - 토지·비주거건물: 단가(원/㎡) + 면적(㎡) → 총액(원) 자동계산 (isAreaMode)
 * - 주택(단독·공동):  총액 직접 입력
 *
 * 엔진에는 항상 총액(totalPrice)만 전달된다.
 * API 스키마 변경 없음.
 */

import { useEffect } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { cn } from "@/lib/utils";
import { useStandardPriceLookup, getDefaultPriceYear } from "@/lib/hooks/useStandardPriceLookup";

export type PriceSource = "lookup" | "manual" | "lookup-edited";

interface Props {
  /**
   * 자산 종류 — 토지·비주거건물은 단가+면적 모드(isAreaMode=true),
   * 주택(단독·공동)은 총액 직접 입력 모드
   */
  propertyKind: "land" | "building_non_residential" | "house_individual" | "house_apart";
  /** 기준시가 총액 (원) — 엔진에 전달되는 실제 값 */
  totalPrice: string;
  onTotalPriceChange: (v: string) => void;
  /** ㎡당 단가 (원/㎡) — land/building_non_residential 전용 */
  pricePerSqm?: string;
  onPricePerSqmChange?: (v: string) => void;
  /** 면적 (㎡) — land/building_non_residential 전용 */
  area?: string;
  onAreaChange?: (v: string) => void;
  /** 지번 주소 (공시가격 자동 조회용) */
  jibun?: string;
  /** 기준일 (양도일·취득일·과세기준일 등) — 조회 연도 기본값 계산에 사용 */
  referenceDate?: string;
  label?: string;
  hint?: string;
  required?: boolean;
  /** false이면 조회 버튼 영역 숨김 (기본 true) */
  enableLookup?: boolean;
  /** 이력 저장용 출처 추적 (UI 미노출) */
  onSourceChange?: (source: PriceSource) => void;
  /** 조회 연도 강제 고정 (1990 이전 등) */
  forceYear?: string;
}

/**
 * propertyKind를 훅용 propertyType으로 변환
 */
function toPropertyType(kind: Props["propertyKind"]): string {
  return kind === "house_individual" || kind === "house_apart" ? "housing" : "land";
}

export function StandardPriceInput({
  propertyKind,
  totalPrice,
  onTotalPriceChange,
  pricePerSqm,
  onPricePerSqmChange,
  area,
  onAreaChange,
  jibun,
  referenceDate,
  label,
  hint,
  required = false,
  enableLookup = true,
  onSourceChange,
  forceYear,
}: Props) {
  const isAreaMode =
    propertyKind === "land" || propertyKind === "building_non_residential";
  const propertyType = toPropertyType(propertyKind);

  const { loading, msg, year, setYear, yearOptions, lookup } =
    useStandardPriceLookup(propertyType);

  // 기준일이 바뀌면 조회 연도 자동 갱신 (forceYear 우선)
  useEffect(() => {
    if (forceYear) {
      setYear(forceYear);
    } else {
      setYear(getDefaultPriceYear(referenceDate ?? "", propertyType));
    }
  }, [referenceDate, propertyType, forceYear, setYear]);

  // ── 단가 변경 → 총액 자동계산 ──────────────────────────────────
  function handlePricePerSqmChange(v: string) {
    onPricePerSqmChange?.(v);
    const sqm = parseFloat(v.replace(/,/g, "") || "0");
    const areaNum = parseFloat(area?.replace(/,/g, "") || "0");
    if (sqm > 0 && areaNum > 0) {
      const computed = String(Math.floor(sqm * areaNum));
      onTotalPriceChange(computed);
      onSourceChange?.("manual");
    }
  }

  // ── 면적 변경 → 총액 자동계산 ──────────────────────────────────
  function handleAreaChange(v: string) {
    onAreaChange?.(v);
    const areaNum = parseFloat(v || "0");
    const sqm = parseFloat(pricePerSqm?.replace(/,/g, "") || "0");
    if (sqm > 0 && areaNum > 0) {
      const computed = String(Math.floor(sqm * areaNum));
      onTotalPriceChange(computed);
      onSourceChange?.("manual");
    }
  }

  // ── 총액 수동 편집 ───────────────────────────────────────────────
  function handleTotalPriceChange(v: string) {
    onTotalPriceChange(v);
    onSourceChange?.("lookup-edited");
  }

  // ── 조회 버튼 클릭 ─────────────────────────────────────────────
  async function handleLookup() {
    const price = await lookup({ jibun: jibun ?? "", propertyType, year });
    if (price === null) return;

    if (isAreaMode) {
      // 단가 저장
      onPricePerSqmChange?.(String(price));
      // 면적이 있으면 총액 자동계산
      const areaNum = parseFloat(area?.replace(/,/g, "") || "0");
      if (areaNum > 0) {
        onTotalPriceChange(String(Math.floor(areaNum * price)));
      }
    } else {
      // 주택: 총액 직접 저장
      onTotalPriceChange(String(price));
    }
    onSourceChange?.("lookup");
  }

  const showLookupArea = enableLookup;

  // ── 단가·면적이 모두 입력된 경우만 힌트 표시 ─────────────────────
  const autoCalcHint =
    isAreaMode &&
    parseFloat(pricePerSqm?.replace(/,/g, "") || "0") > 0 &&
    parseFloat(area?.replace(/,/g, "") || "0") > 0
      ? "단가 × 면적 자동계산"
      : undefined;

  const effectiveHint = autoCalcHint ?? hint;

  return (
    <div className="space-y-2">
      {/* 연도 선택 + 조회 버튼 */}
      {showLookupArea && (
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
      )}

      {/* 단가 + 면적 입력 (isAreaMode) */}
      {isAreaMode && (
        <div className="grid grid-cols-2 gap-3">
          <CurrencyInput
            label="㎡당 단가 (원/㎡)"
            value={pricePerSqm ?? ""}
            onChange={handlePricePerSqmChange}
            placeholder="공시지가 단가"
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">면적 (㎡)</label>
            <input
              type="number"
              step="0.01"
              min={0}
              value={area ?? ""}
              onChange={(e) => handleAreaChange(e.target.value)}
              placeholder="예: 793.5"
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            />
          </div>
        </div>
      )}

      {/* 총액 입력 */}
      <CurrencyInput
        label={
          label ??
          (isAreaMode ? "공시가격 총액 (원)" : "공시가격 (원)")
        }
        value={totalPrice}
        onChange={handleTotalPriceChange}
        required={required}
        hint={effectiveHint}
      />

      {/* 조회 결과 메시지 */}
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

      {/* 단가만 있고 면적이 없을 때 안내 */}
      {isAreaMode &&
        parseFloat(pricePerSqm?.replace(/,/g, "") || "0") > 0 &&
        !parseFloat(area?.replace(/,/g, "") || "0") && (
          <p className="text-xs text-muted-foreground">
            면적(㎡)을 입력하면 총액이 자동 계산됩니다.
          </p>
        )}
    </div>
  );
}
