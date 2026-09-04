"use client";

/**
 * PointBlock — 3시점 기준시가 위젯의 **시점 1개** 블록.
 *
 * `ThreePointStandardPriceInput`에서 분리(800줄 정책). 연도 선택·공시지가 조회·
 * 토지기준시가 자동계산 + 건물 기준시가 입력/계산기 런처를 한 시점 단위로 렌더한다.
 * `landOnly` 모드는 겸용 Case A(asset-major)에서 토지 3시점 공용 재사용 경로다.
 */

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import type { AddressValue } from "@/components/ui/address-search";
import { landPriceYearOptions, recommendLandPriceYear } from "@/lib/utils/land-price-year";

// ─── 라벨 매핑 ──────────────────────────────────────────────────
// targetLabel + useWholeBuildingLabels 값에 따라 입력 필드 라벨·hint를 명확화.
//
// useWholeBuildingLabels === true: Case A 의 취득시·최초공시 시점 — 당시 건물 전체가 주택이었으므로
// "주택부수토지/주택건물" 표현이 부정확. 전체 토지·전체 건물 의미로 표시.
function resolveLabels(targetLabel?: string, useWholeBuildingLabels?: boolean) {
  if (useWholeBuildingLabels) {
    return {
      landUnitPrice: "공시지가",
      landUnitPriceHint: "개별공시지가 (원/㎡) — 당시 전체 토지",
      landStdPrice: "전체 토지기준시가",
      landStdPriceHint: "공시지가 × 전체 토지면적 (주택+상가 전체)",
      buildingStdPrice: "전체 건물 기준시가",
      totalLabel: "건물+토지 기준시가 합계",
    };
  }
  if (targetLabel === "주택") {
    return {
      landUnitPrice: "주택부수토지 공시지가",
      landUnitPriceHint: "주택부수토지 개별공시지가 (원/㎡)",
      landStdPrice: "주택부수토지 기준시가",
      landStdPriceHint: "주택부수토지 공시지가 × 면적",
      buildingStdPrice: "주택 건물기준시가",
      totalLabel: "주택분 기준시가 합계",
    };
  }
  return {
    landUnitPrice: "공시지가",
    landUnitPriceHint: "개별공시지가 (원/㎡)",
    landStdPrice: "토지기준시가",
    landStdPriceHint: "공시지가(원/㎡) × 토지면적(㎡)",
    buildingStdPrice: "건물기준시가",
    totalLabel: "기준시가 합계",
  };
}

// ─── 시점별 단일 입력 블록 ─────────────────────────────────────────

type PointBlockTone = "amber" | "violet" | "emerald";

const TONE_CLASSES: Record<PointBlockTone, { container: string; label: string; summary: string }> = {
  amber: {
    container: "border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20",
    label: "text-amber-800 dark:text-amber-300",
    summary: "bg-amber-100/60 border border-amber-200 text-amber-900",
  },
  violet: {
    container: "border-violet-200 bg-violet-50/60 dark:border-violet-900/40 dark:bg-violet-950/20",
    label: "text-violet-800 dark:text-violet-300",
    summary: "bg-violet-100/60 border border-violet-200 text-violet-900",
  },
  emerald: {
    container: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20",
    label: "text-emerald-800 dark:text-emerald-300",
    summary: "bg-emerald-100/60 border border-emerald-200 text-emerald-900",
  },
};

interface PointBlockProps {
  label: string;
  tone?: PointBlockTone;
  referenceDate: string;
  selectedYear: string;
  isManual: boolean;
  onYearChange: (year: string, isManual: boolean) => void;
  landPricePerSqm: string;
  onLandPricePerSqmChange: (v: string) => void;
  buildingStdPrice: string;
  onBuildingStdPriceChange: (v: string) => void;
  jibun?: string;
  landArea?: string;
  /** 라벨 prefix용 대상 명시 (예: "주택") */
  targetLabel?: string;
  /** Case A 시 "전체 건물" 의미 라벨로 전환 (취득시·최초공시 시점 전용) */
  useWholeBuildingLabels?: boolean;
  /**
   * Case A 4부분 분리 모드 — true 일 때 토지·건물 기준시가를 주택분/상가분 2컬럼으로 표시.
   */
  splitMode?: boolean;
  housingLandArea?: string;
  commercialLandArea?: string;
  /**
   * 건물 기준시가 계산기 prefill 연면적(이중입력 방지). splitMode는 주택·상가가 각자 받는다(섞으면 오산).
   * ⚠️ 취득일·양도일은 넣지 않는다 — PointBlock은 시점별이라 최초공시 블록에 취득일을 주입하면 잘못된 연도로 계산된다.
   */
  housingFloorArea?: string;
  commercialFloorArea?: string;
  commercialBuildingStdPrice?: string;
  onCommercialBuildingStdPriceChange?: (v: string) => void;
  /** 건물기준시가(주택) 계산기 snapshotKey. 미주입 시 스냅샷 복원 없이 버튼 표시. */
  buildingStdSnapshotKey?: string;
  /** split 상가건물 계산기 snapshotKey. */
  commercialBuildingStdSnapshotKey?: string;
  /** 계산기 모달 소재지 주소 prefill. */
  stdPriceAddress?: AddressValue;
  /** true 시 이 시점 필드별 계산기 버튼 미표시(3시점 일괄 버튼으로 대체). */
  hideBuildingCalcButton?: boolean;
  /** true 시 토지(연도+공시지가)만 렌더하고 건물·합계는 생략 — asset-major 전치에서 토지 3시점 공용 재사용. */
  landOnly?: boolean;
}

export function PointBlock({
  label,
  tone,
  referenceDate,
  selectedYear,
  isManual,
  onYearChange,
  landPricePerSqm,
  onLandPricePerSqmChange,
  buildingStdPrice,
  onBuildingStdPriceChange,
  jibun,
  landArea,
  targetLabel,
  useWholeBuildingLabels,
  splitMode,
  housingLandArea,
  commercialLandArea,
  housingFloorArea,
  commercialFloorArea,
  commercialBuildingStdPrice,
  onCommercialBuildingStdPriceChange,
  buildingStdSnapshotKey,
  commercialBuildingStdSnapshotKey,
  stdPriceAddress,
  hideBuildingCalcButton,
  landOnly,
}: PointBlockProps) {
  const toneClasses = tone ? TONE_CLASSES[tone] : null;
  const labels = resolveLabels(targetLabel, useWholeBuildingLabels);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const options = referenceDate ? landPriceYearOptions(referenceDate) : [];
  const recommendedYear = referenceDate
    ? String(recommendLandPriceYear(referenceDate))
    : "";
  const effectiveYear = selectedYear || recommendedYear;

  function handleYearSelect(value: string | null) {
    if (!value) return;
    const manual = value !== recommendedYear;
    onYearChange(value, manual);
  }

  function handleResetToAuto() {
    onYearChange(recommendedYear, false);
  }

  async function handleLookup() {
    if (!jibun || !effectiveYear) return;
    setIsLookingUp(true);
    setLookupError(null);
    try {
      const params = new URLSearchParams({
        jibun,
        propertyType: "land",
        year: effectiveYear,
      });
      const res = await fetch(`/api/address/standard-price?${params}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        setLookupError(json.error?.message ?? "조회 실패");
        return;
      }
      // json.price: 개별공시지가 (원/㎡)
      if (json.price && json.price > 0) {
        onLandPricePerSqmChange(String(json.price));
        setLookupError(null);
      } else {
        setLookupError("해당 연도 공시지가 없음");
      }
    } catch {
      setLookupError("네트워크 오류");
    } finally {
      setIsLookingUp(false);
    }
  }

  // 토지기준시가 = 공시지가(원/㎡) × 면적(㎡)
  const pricePerSqm = parseAmount(landPricePerSqm);
  const area = landArea ? parseFloat(landArea) : 0;
  const landStdPrice = pricePerSqm > 0 && area > 0 ? Math.floor(pricePerSqm * area) : null;

  // Case A 분리 모드 — 주택분/상가분 토지 기준시가 분리 계산
  const housingArea = splitMode && housingLandArea ? parseFloat(housingLandArea) : 0;
  const commercialArea = splitMode && commercialLandArea ? parseFloat(commercialLandArea) : 0;
  const housingLandStd = splitMode && pricePerSqm > 0 && housingArea > 0 ? Math.floor(pricePerSqm * housingArea) : null;
  const commercialLandStd = splitMode && pricePerSqm > 0 && commercialArea > 0 ? Math.floor(pricePerSqm * commercialArea) : null;

  const yearBadge = isManual ? (
    <span className="flex items-center gap-1">
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-micro font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
        수동
      </span>
      <button
        type="button"
        onClick={handleResetToAuto}
        className="text-micro text-primary underline underline-offset-2 hover:no-underline"
      >
        ↻ 자동
      </button>
    </span>
  ) : (
    <span className="rounded bg-green-100 px-1.5 py-0.5 text-micro font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">
      자동
    </span>
  );

  const canLookup = !!jibun && !!effectiveYear;

  // 비-split·비-landOnly 시 연도·공시지가·토지기준시가를 한 행(3열)으로 배치.
  const rowMode = !splitMode && !landOnly;

  // ── 공시지가 기준 연도 (조회 버튼을 연도 select 오른쪽에 인라인 배치) ──
  const yearField = (
    <FieldCard label="공시지가 연도" badge={yearBadge} stacked={rowMode}>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <Select
            value={effectiveYear}
            onValueChange={handleYearSelect}
            disabled={!referenceDate}
          >
            <SelectTrigger className="h-9 w-full">
              <span>
                {selectedYear
                  ? `${selectedYear}년${!isManual ? " (자동)" : ""}`
                  : referenceDate
                    ? `${recommendedYear}년 (자동)`
                    : "기준일 미입력"}
              </span>
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt.year} value={String(opt.year)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <button
          type="button"
          onClick={handleLookup}
          disabled={!canLookup || isLookingUp}
          className="h-9 shrink-0 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted/60 disabled:opacity-40 transition-colors"
        >
          {isLookingUp ? "조회 중…" : "공시지가 조회"}
        </button>
      </div>
      {lookupError && (
        <p className="mt-1 text-xs text-destructive">{lookupError}</p>
      )}
    </FieldCard>
  );

  // ── 공시지가 단가 — Case A 분리 모드와 무관하게 단일 입력 (같은 지번) ──
  const unitPriceField = (
    <FieldCard
      label={labels.landUnitPrice}
      unit="원/㎡"
      stacked={rowMode}
      hint={labels.landUnitPriceHint}
    >
      <CurrencyInput
        label=""
        value={landPricePerSqm}
        onChange={onLandPricePerSqmChange}
        placeholder="원/㎡"
        hideUnit
      />
    </FieldCard>
  );

  // ── 토지기준시가 (자동 계산) — 비-split 전용, rowMode 시 위 두 필드와 한 행 ──
  const landStdField = (
    <FieldCard
      label={labels.landStdPrice}
      unit="원"
      stacked={rowMode}
      hint={labels.landStdPriceHint}
    >
      <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm tabular-nums text-muted-foreground">
        {landStdPrice !== null
          ? landStdPrice.toLocaleString()
          : <span className="text-muted-foreground/50">자동 계산</span>}
      </div>
    </FieldCard>
  );

  return (
    <div
      className={
        toneClasses
          ? `space-y-2 rounded-md border ${toneClasses.container} p-3`
          : "space-y-2 rounded-md border border-dashed border-border bg-muted/20 p-3"
      }
    >
      <p className={`text-xs font-semibold ${toneClasses ? toneClasses.label : "text-muted-foreground"}`}>
        {label}
      </p>

      {rowMode ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {yearField}
          {unitPriceField}
          {landStdField}
        </div>
      ) : (
        <>
          {yearField}
          {unitPriceField}
        </>
      )}

      {!landOnly && (
      <>
      {splitMode ? (
        <>
          {/* Case A 분리 모드 — 주택분/상가분 토지기준시가 (자동 계산, 2 컬럼) */}
          <div className="grid grid-cols-2 gap-2">
            <FieldCard
              label="주택분 토지기준시가"
              unit="원"
              hint={`공시지가 × 주택부수토지${housingArea > 0 ? ` (${housingArea}㎡)` : ""}`}
            >
              <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm tabular-nums text-muted-foreground">
                {housingLandStd !== null
                  ? housingLandStd.toLocaleString()
                  : <span className="text-muted-foreground/50">자동 계산</span>}
              </div>
            </FieldCard>
            <FieldCard
              label="상가분 토지기준시가"
              unit="원"
              hint={`공시지가 × 상가부수토지${commercialArea > 0 ? ` (${commercialArea}㎡)` : ""}`}
            >
              <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm tabular-nums text-muted-foreground">
                {commercialLandStd !== null
                  ? commercialLandStd.toLocaleString()
                  : <span className="text-muted-foreground/50">자동 계산</span>}
              </div>
            </FieldCard>
          </div>

          {/* Case A 분리 모드 — 주택건물/상가건물 기준시가 (사용자 입력, 2 컬럼) */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <FieldCard
                label="주택건물 기준시가"
                unit="원"
                hint="홈택스 — 양도시 주택 부분 면적에 해당하는 금액"
                required
              >
                <CurrencyInput
                  label=""
                  value={buildingStdPrice}
                  onChange={onBuildingStdPriceChange}
                  placeholder="원"
                  hideUnit
                />
              </FieldCard>
              {!hideBuildingCalcButton && (
                <div className="flex justify-end">
                  <BuildingStdPriceModalButton
                    lockedTaxType="transfer"
                    initialAddress={stdPriceAddress}
                    snapshotKey={buildingStdSnapshotKey}
                    prefill={{ floorArea: housingFloorArea, landAreaM2: housingLandArea }}
                    onApply={(v) => onBuildingStdPriceChange(String(v))}
                  />
                </div>
              )}
            </div>
            <div className="space-y-1">
              <FieldCard
                label="상가건물 기준시가"
                unit="원"
                hint="홈택스 — 양도시 상가 부분 면적에 해당하는 금액"
                required
              >
                <CurrencyInput
                  label=""
                  value={commercialBuildingStdPrice ?? ""}
                  onChange={onCommercialBuildingStdPriceChange ?? (() => {})}
                  placeholder="원"
                  hideUnit
                />
              </FieldCard>
              {/* 상가건물 버튼 — Phase 2.1: 배치가 취득·최초공시 상가도 산출하므로 배치 게이팅에 종속(숨김) */}
              {!hideBuildingCalcButton && onCommercialBuildingStdPriceChange && (
                <div className="flex justify-end">
                  <BuildingStdPriceModalButton
                    lockedTaxType="transfer"
                    initialAddress={stdPriceAddress}
                    snapshotKey={commercialBuildingStdSnapshotKey}
                    prefill={{ floorArea: commercialFloorArea, landAreaM2: commercialLandArea }}
                    onApply={(v) => onCommercialBuildingStdPriceChange(String(v))}
                  />
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* 일반 모드 — 토지기준시가는 위 행(rowMode)에 배치, 여기선 건물기준시가만 */}
          <FieldCard label={labels.buildingStdPrice} unit="원">
            <CurrencyInput
              label=""
              value={buildingStdPrice}
              onChange={onBuildingStdPriceChange}
              placeholder="원"
              hideUnit
            />
          </FieldCard>
          {!hideBuildingCalcButton && (
            <div className="flex justify-end">
              <BuildingStdPriceModalButton
                lockedTaxType="transfer"
                initialAddress={stdPriceAddress}
                snapshotKey={buildingStdSnapshotKey}
                prefill={{ floorArea: housingFloorArea, landAreaM2: landArea }}
                onApply={(v) => onBuildingStdPriceChange(String(v))}
              />
            </div>
          )}
        </>
      )}

      {/* 합계 — splitMode: 4부분 합 / 일반: 토지+건물 합 */}
      {(() => {
        const buildingAmt = parseAmount(buildingStdPrice);
        const commercialBuildingAmt = splitMode ? parseAmount(commercialBuildingStdPrice ?? "") : 0;
        if (splitMode) {
          const housingTotal = (housingLandStd ?? 0) + buildingAmt;
          const commercialTotal = (commercialLandStd ?? 0) + commercialBuildingAmt;
          const total = housingTotal + commercialTotal;
          if (total === 0) return null;
          return (
            <div className={`rounded-md px-3 py-2 text-sm space-y-1 ${toneClasses ? toneClasses.summary : "bg-muted/40 border border-border text-foreground"}`}>
              <div className="flex justify-between items-center text-xs">
                <span>주택분 기준시가 합계 (주택분토지 + 주택건물)</span>
                <span className="font-mono tabular-nums">{housingTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span>상가분 기준시가 합계 (상가분토지 + 상가건물)</span>
                <span className="font-mono tabular-nums">{commercialTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-current/20">
                <span className="text-xs font-semibold">전체 합산기준시가 (주택분 + 상가분)</span>
                <span className="font-semibold tabular-nums">{total.toLocaleString()}</span>
              </div>
            </div>
          );
        }
        if (landStdPrice === null && buildingAmt === 0) return null;
        const total = (landStdPrice ?? 0) + buildingAmt;
        return (
          <div className={`rounded-md px-3 py-2 text-sm ${toneClasses ? toneClasses.summary : "bg-muted/40 border border-border text-foreground"}`}>
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold">{labels.totalLabel}</span>
              <span className="font-semibold tabular-nums">{total.toLocaleString()}</span>
            </div>
          </div>
        );
      })()}
      </>
      )}
    </div>
  );
}

