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
  /**
   * 입력값의 대상 명시 — 라벨에 prefix 적용. 검용주택 PHD 등 주택분과 상가분이
   * 같은 화면에 노출되는 컨텍스트에서 어느 쪽 입력인지 구별 표시용.
   * 예: "주택" → "주택부수토지 공시지가", "주택 건물기준시가".
   * 미주입 시 기존 라벨 유지 (단일 자산 PHD 등 backward compat).
   */
  targetLabel?: string;
  /**
   * 검용주택 + 보유 중 일부 용도변경에서 최초공시일 < 용도변경일 인 경우(Case A) 전용.
   * true 일 때 ① 취득시 · ② 최초공시일 시점은 "당시 전체 주택"이었으므로 라벨이 변경되며,
   * ③ 양도시는 그대로 검용 상태(주택분만) 라벨을 사용한다.
   */
  wholeBuildingForAcqAndFirst?: boolean;
  /**
   * Case A 시 ① 취득시 · ② 최초공시일 시점에 사용할 토지면적(㎡, 전체 토지면적).
   * `wholeBuildingForAcqAndFirst === true` 일 때만 의미가 있으며,
   * 미주입 시 `landArea` 로 fallback. ③ 양도시는 항상 `landArea` 사용.
   */
  landAreaForAcqAndFirst?: string;
  /**
   * ① 취득시 토지 공시지가/연도가 외부 섹션에서 자동 동기화되는 경우 read-only 표시 + 안내.
   * 검용주택 PHD에서 섹션 2의 `mixedAcqLandPricePerSqm`을 미러링할 때 사용.
   */
  landAutoSyncAtAcq?: { label: string };
  /**
   * ③ 양도시 토지 공시지가/연도가 외부 섹션에서 자동 동기화되는 경우 read-only 표시 + 안내.
   * 검용주택 PHD에서 섹션 2의 `mixedTransferLandPricePerSqm`을 미러링할 때 사용.
   */
  landAutoSyncAtTransfer?: { label: string };
}

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
      buildingStdPriceHint: "국세청 건물기준시가 — 당시 건물 전체 (주택+상가 합계, 당시는 모두 주택)",
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
      buildingStdPriceHint: "국세청 건물기준시가 — 주택건물(상가건물 제외)",
      totalLabel: "주택분 기준시가 합계",
    };
  }
  return {
    landUnitPrice: "공시지가",
    landUnitPriceHint: "개별공시지가 (원/㎡)",
    landStdPrice: "토지기준시가",
    landStdPriceHint: "공시지가(원/㎡) × 토지면적(㎡)",
    buildingStdPrice: "건물기준시가",
    buildingStdPriceHint: "국세청 건물기준시가 (원) — 양도·취득 당시 기준시가",
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
   * 토지 공시지가·연도가 외부에서 자동 동기화되는 경우 read-only로 표시.
   * 건물 기준시가는 그대로 입력 유지.
   */
  landAutoSync?: { label: string };
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
  targetLabel,
  useWholeBuildingLabels,
  landAutoSync,
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

      {/* 공시지가 기준 연도 — landAutoSync 시 read-only 표시 */}
      {landAutoSync ? (
        <FieldCard
          label="공시지가 연도"
          badge={
            <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">
              자동
            </span>
          }
        >
          <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm tabular-nums text-muted-foreground">
            {effectiveYear ? (
              `${effectiveYear}년`
            ) : (
              <span className="text-muted-foreground/50">기준일 미입력</span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{landAutoSync.label}</p>
        </FieldCard>
      ) : (
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
      )}

      {/* 토지 단위 공시지가 (원/㎡) + 토지기준시가 — landAutoSync 시 단가는 read-only */}
      <div className="grid grid-cols-2 gap-2">
        <FieldCard
          label={labels.landUnitPrice}
          unit="원/㎡"
          hint={landAutoSync ? landAutoSync.label : labels.landUnitPriceHint}
        >
          {landAutoSync ? (
            <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm tabular-nums text-muted-foreground">
              {pricePerSqm > 0 ? (
                pricePerSqm.toLocaleString()
              ) : (
                <span className="text-muted-foreground/40 text-xs">위 섹션에서 입력</span>
              )}
            </div>
          ) : (
            <CurrencyInput
              label=""
              value={landPricePerSqm}
              onChange={onLandPricePerSqmChange}
              placeholder="원/㎡"
              hideUnit
            />
          )}
        </FieldCard>
        <FieldCard
          label={labels.landStdPrice}
          unit="원"
          hint={labels.landStdPriceHint}
        >
          <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm tabular-nums text-muted-foreground">
            {landStdPrice !== null
              ? landStdPrice.toLocaleString()
              : <span className="text-muted-foreground/50">자동 계산</span>}
          </div>
        </FieldCard>
      </div>

      {/* 건물 기준시가 (원) */}
      <FieldCard label={labels.buildingStdPrice} unit="원" hint={labels.buildingStdPriceHint}>
        <CurrencyInput
          label=""
          value={buildingStdPrice}
          onChange={onBuildingStdPriceChange}
          placeholder="원"
          hideUnit
        />
      </FieldCard>

      {/* 합계 — 토지기준시가 + 건물기준시가 */}
      {(() => {
        const buildingAmt = parseAmount(buildingStdPrice);
        if (landStdPrice === null && buildingAmt === 0) return null;
        const total = (landStdPrice ?? 0) + buildingAmt;
        return (
          <div className={`rounded-md px-3 py-2 text-sm ${toneClasses ? toneClasses.summary : "bg-muted/40 border border-border text-foreground"}`}>
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold">{labels.totalLabel}</span>
              <span className="font-semibold tabular-nums">{total.toLocaleString()}원</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────

export function ThreePointStandardPriceInput(props: ThreePointStandardPriceInputProps) {
  // Case A 분기 라벨/면적 결정
  const useWholeForAcqFirst = props.wholeBuildingForAcqAndFirst === true;
  const acqFirstLandArea = useWholeForAcqFirst
    ? (props.landAreaForAcqAndFirst ?? props.landArea)
    : props.landArea;

  // 시점별 섹션 헤더 라벨
  const targetSuffix = props.targetLabel ? `${props.targetLabel}분 ` : "";
  const acqLabel = useWholeForAcqFirst
    ? "① 취득시 기준시가 (당시 전체 주택)"
    : `① 취득시 ${targetSuffix}기준시가`;
  const firstLabel = useWholeForAcqFirst
    ? "② 최초공시일 기준시가 (당시 전체 주택)"
    : `② 최초공시일 ${targetSuffix}기준시가`;
  // 양도시는 Case A 여부와 무관하게 항상 검용 상태 (주택분만)
  const transferLabel = `③ 양도시 ${targetSuffix}기준시가`;

  return (
    <div className="space-y-3">
      <PointBlock
        label={acqLabel}
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
        landArea={acqFirstLandArea}
        targetLabel={props.targetLabel}
        useWholeBuildingLabels={useWholeForAcqFirst}
        landAutoSync={props.landAutoSyncAtAcq}
      />

      <PointBlock
        label={firstLabel}
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
        landArea={acqFirstLandArea}
        targetLabel={props.targetLabel}
        useWholeBuildingLabels={useWholeForAcqFirst}
      />

      <PointBlock
        label={transferLabel}
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
        targetLabel={props.targetLabel}
        landAutoSync={props.landAutoSyncAtTransfer}
        // 양도시는 Case A 여부와 무관하게 항상 주택분 라벨 사용
      />
    </div>
  );
}
