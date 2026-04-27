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
 * 법령 근거: 소득세법 시행령 §164 ⑤
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
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
}

// ─── 시점별 단일 입력 블록 ─────────────────────────────────────────

interface PointBlockProps {
  label: string;
  referenceDate: string;
  selectedYear: string;
  isManual: boolean;
  onYearChange: (year: string, isManual: boolean) => void;
  landPricePerSqm: string;
  onLandPricePerSqmChange: (v: string) => void;
  buildingStdPrice: string;
  onBuildingStdPriceChange: (v: string) => void;
}

function PointBlock({
  label,
  referenceDate,
  selectedYear,
  isManual,
  onYearChange,
  landPricePerSqm,
  onLandPricePerSqmChange,
  buildingStdPrice,
  onBuildingStdPriceChange,
}: PointBlockProps) {
  const options = referenceDate ? landPriceYearOptions(referenceDate) : [];
  const recommendedYear = referenceDate
    ? String(recommendLandPriceYear(referenceDate))
    : "";

  function handleYearSelect(value: string | null) {
    if (!value) return;
    const manual = value !== recommendedYear;
    onYearChange(value, manual);
  }

  function handleResetToAuto() {
    onYearChange(recommendedYear, false);
  }

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

  return (
    <div className="space-y-2 rounded-md border border-dashed border-border bg-muted/20 p-3">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>

      {/* 공시지가 기준 연도 선택 */}
      <FieldCard label="공시지가 연도" badge={yearBadge}>
        <Select
          value={selectedYear || recommendedYear}
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
      </FieldCard>

      {/* 토지 단위 공시지가 (원/㎡) */}
      <FieldCard label="공시지가" unit="원/㎡" hint="개별공시지가 (원/㎡) — 부동산공시가격알리미 조회">
        <CurrencyInput
          label=""
          value={landPricePerSqm}
          onChange={onLandPricePerSqmChange}
          placeholder="원/㎡"
          hideUnit
        />
      </FieldCard>

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
        referenceDate={props.acquisitionDate}
        selectedYear={props.landPriceYearAtAcq}
        isManual={props.landPriceYearAtAcqIsManual}
        onYearChange={props.onLandPriceYearAtAcqChange}
        landPricePerSqm={props.landPricePerSqmAtAcq}
        onLandPricePerSqmChange={props.onLandPricePerSqmAtAcqChange}
        buildingStdPrice={props.buildingStdPriceAtAcq}
        onBuildingStdPriceChange={props.onBuildingStdPriceAtAcqChange}
      />

      <PointBlock
        label="② 최초공시일 기준시가"
        referenceDate={props.firstDisclosureDate}
        selectedYear={props.landPriceYearAtFirst}
        isManual={props.landPriceYearAtFirstIsManual}
        onYearChange={props.onLandPriceYearAtFirstChange}
        landPricePerSqm={props.landPricePerSqmAtFirst}
        onLandPricePerSqmChange={props.onLandPricePerSqmAtFirstChange}
        buildingStdPrice={props.buildingStdPriceAtFirst}
        onBuildingStdPriceChange={props.onBuildingStdPriceAtFirstChange}
      />

      <PointBlock
        label="③ 양도시 기준시가"
        referenceDate={props.transferDate}
        selectedYear={props.landPriceYearAtTransfer}
        isManual={props.landPriceYearAtTransferIsManual}
        onYearChange={props.onLandPriceYearAtTransferChange}
        landPricePerSqm={props.landPricePerSqmAtTransfer}
        onLandPricePerSqmChange={props.onLandPricePerSqmAtTransferChange}
        buildingStdPrice={props.buildingStdPriceAtTransfer}
        onBuildingStdPriceChange={props.onBuildingStdPriceAtTransferChange}
      />
    </div>
  );
}
