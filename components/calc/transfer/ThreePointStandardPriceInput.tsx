"use client";

/**
 * 3-시점 공시지가 입력 컴포넌트
 *
 * 취득시 / 최초공시일 / 양도시 3개 시점의 토지 단위 공시지가와
 * 건물 기준시가를 입력받는다.
 *
 * 각 시점별 연도 선택은 landPriceYearOptions()의 추천값이 기본으로 선택되며,
 * 사용자가 수동 변경 시 "수동" 배지와 "↻ 자동" 복원 버튼이 표시된다.
 *
 * jibun + year 제공 시 Vworld 개별공시지가 자동 조회 버튼 활성화.
 * 공시지가(원/㎡)와 면적(㎡)이 모두 있으면 토지기준시가를 표시한다.
 *
 * 법령 근거: 소득세법 시행령 §164 ⑤
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
import { landPriceYearOptions, recommendLandPriceYear } from "@/lib/utils/land-price-year";

// ─── Props ────────────────────────────────────────────────────────

export interface ThreePointStandardPriceInputProps {
  // 취득시
  acquisitionDate: string;
  landPriceYearAtAcq: string;
  landPriceYearAtAcqIsManual: boolean;
  onLandPriceYearAtAcqChange: (year: string, isManual: boolean) => void;
  landPricePerSqmAtAcq: string;
  onLandPricePerSqmAtAcqChange: (v: string) => void;
  buildingStdPriceAtAcq: string;
  onBuildingStdPriceAtAcqChange: (v: string) => void;

  // 최초공시일
  firstDisclosureDate: string;
  landPriceYearAtFirst: string;
  landPriceYearAtFirstIsManual: boolean;
  onLandPriceYearAtFirstChange: (year: string, isManual: boolean) => void;
  landPricePerSqmAtFirst: string;
  onLandPricePerSqmAtFirstChange: (v: string) => void;
  buildingStdPriceAtFirst: string;
  onBuildingStdPriceAtFirstChange: (v: string) => void;

  // 양도시
  transferDate: string;
  landPriceYearAtTransfer: string;
  landPriceYearAtTransferIsManual: boolean;
  onLandPriceYearAtTransferChange: (year: string, isManual: boolean) => void;
  landPricePerSqmAtTransfer: string;
  onLandPricePerSqmAtTransferChange: (v: string) => void;
  buildingStdPriceAtTransfer: string;
  onBuildingStdPriceAtTransferChange: (v: string) => void;

  /** 지번 주소 — Vworld 개별공시지가 조회용 */
  jibun?: string;
  /** 토지 면적 (㎡) — 토지기준시가 = 공시지가 × 면적 */
  landArea?: string;
}

// ─── 시점별 단일 입력 블록 ─────────────────────────────────────────

type PointBlockTone = "amber" | "violet" | "emerald";

const TONE_CLASSES: Record<PointBlockTone, { container: string; label: string }> = {
  amber: {
    container: "border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20",
    label: "text-amber-800 dark:text-amber-300",
  },
  violet: {
    container: "border-violet-200 bg-violet-50/60 dark:border-violet-900/40 dark:bg-violet-950/20",
    label: "text-violet-800 dark:text-violet-300",
  },
  emerald: {
    container: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20",
    label: "text-emerald-800 dark:text-emerald-300",
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
}

function PointBlock({
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
}: PointBlockProps) {
  const toneClasses = tone ? TONE_CLASSES[tone] : null;
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

  const yearBadge = isManual ? (
    <span className="flex items-center gap-1">
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
        수동
      </span>
      <button
        type="button"
        onClick={handleResetToAuto}
        className="text-[10px] text-primary underline underline-offset-2 hover:no-underline"
      >
        ↻ 자동
      </button>
    </span>
  ) : (
    <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">
      자동
    </span>
  );

  const canLookup = !!jibun && !!effectiveYear;

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

      {/* 공시지가 기준 연도 선택 + 조회 버튼 */}
      <FieldCard label="공시지가 연도" badge={yearBadge}>
        <div className="flex gap-2">
          <div className="flex-1">
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
        {!canLookup && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            지번 주소 입력 후 조회 가능합니다
          </p>
        )}
      </FieldCard>

      {/* 토지 단위 공시지가 (원/㎡) + 토지기준시가 */}
      <div className="grid grid-cols-2 gap-2">
        <FieldCard label="공시지가" unit="원/㎡" hint="개별공시지가 (원/㎡)">
          <CurrencyInput
            label=""
            value={landPricePerSqm}
            onChange={onLandPricePerSqmChange}
            placeholder="원/㎡"
            hideUnit
          />
        </FieldCard>
        <FieldCard
          label="토지기준시가"
          unit="원"
          hint="공시지가(원/㎡) × 토지면적(㎡)"
        >
          <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm tabular-nums text-muted-foreground">
            {landStdPrice !== null
              ? landStdPrice.toLocaleString()
              : <span className="text-muted-foreground/50">자동 계산</span>}
          </div>
        </FieldCard>
      </div>

      {/* 건물 기준시가 (원) */}
      <FieldCard label="건물기준시가" unit="원" hint="국세청 건물기준시가 (원) — 양도·취득 당시 기준시가">
        <CurrencyInput
          label=""
          value={buildingStdPrice}
          onChange={onBuildingStdPriceChange}
          placeholder="원"
          hideUnit
        />
      </FieldCard>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────

export function ThreePointStandardPriceInput(props: ThreePointStandardPriceInputProps) {
  return (
    <div className="space-y-3">
      <PointBlock
        label="① 취득시 기준시가"
        tone="amber"
        referenceDate={props.acquisitionDate}
        selectedYear={props.landPriceYearAtAcq}
        isManual={props.landPriceYearAtAcqIsManual}
        onYearChange={props.onLandPriceYearAtAcqChange}
        landPricePerSqm={props.landPricePerSqmAtAcq}
        onLandPricePerSqmChange={props.onLandPricePerSqmAtAcqChange}
        buildingStdPrice={props.buildingStdPriceAtAcq}
        onBuildingStdPriceChange={props.onBuildingStdPriceAtAcqChange}
        jibun={props.jibun}
        landArea={props.landArea}
      />

      <PointBlock
        label="② 최초공시일 기준시가"
        tone="violet"
        referenceDate={props.firstDisclosureDate}
        selectedYear={props.landPriceYearAtFirst}
        isManual={props.landPriceYearAtFirstIsManual}
        onYearChange={props.onLandPriceYearAtFirstChange}
        landPricePerSqm={props.landPricePerSqmAtFirst}
        onLandPricePerSqmChange={props.onLandPricePerSqmAtFirstChange}
        buildingStdPrice={props.buildingStdPriceAtFirst}
        onBuildingStdPriceChange={props.onBuildingStdPriceAtFirstChange}
        jibun={props.jibun}
        landArea={props.landArea}
      />

      <PointBlock
        label="③ 양도시 기준시가"
        tone="emerald"
        referenceDate={props.transferDate}
        selectedYear={props.landPriceYearAtTransfer}
        isManual={props.landPriceYearAtTransferIsManual}
        onYearChange={props.onLandPriceYearAtTransferChange}
        landPricePerSqm={props.landPricePerSqmAtTransfer}
        onLandPricePerSqmChange={props.onLandPricePerSqmAtTransferChange}
        buildingStdPrice={props.buildingStdPriceAtTransfer}
        onBuildingStdPriceChange={props.onBuildingStdPriceAtTransferChange}
        jibun={props.jibun}
        landArea={props.landArea}
      />
    </div>
  );
}
