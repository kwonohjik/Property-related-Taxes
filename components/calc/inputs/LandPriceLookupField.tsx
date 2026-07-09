"use client";

/**
 * 개별공시지가 입력 + Vworld 조회 + 토지기준시가 자동 계산 필드
 *
 * 사용 규칙 (강제):
 *   모든 "개별공시지가 (원/㎡)" 입력 필드는 반드시 이 컴포넌트를 사용한다.
 *   - 기준연도 선택 드롭다운 + Vworld 조회 버튼 (위 행)
 *   - 공시지가 입력 + 면적 × 공시지가 = 토지기준시가 계산 결과 (아래 행)
 *
 * Props:
 *   - pricePerSqm / onPricePerSqmChange: 공시지가 (원/㎡) 값
 *   - area: 해당 토지 면적 (㎡) — 제공 시 토지기준시가 자동 계산
 *   - referenceDate: 기준일 (추천 연도 자동 계산용)
 *   - jibun: 지번 주소 (Vworld 조회 활성화 조건)
 *   - label: 필드 라벨 (기본 "개별공시지가")
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

export interface LandPriceLookupFieldProps {
  /** 공시지가 (원/㎡) 현재 값 */
  pricePerSqm: string;
  /** 공시지가 변경 콜백 */
  onPricePerSqmChange: (v: string) => void;
  /** 토지 면적 (㎡) — 제공 시 토지기준시가 = pricePerSqm × area 자동 표시 */
  area?: number;
  /** 면적 변경 콜백 — 지정 시 공시가격 조회 성공 시 필지면적(lndpclAr)을 빈 칸에 한해 자동 채움 */
  onAreaChange?: (v: string) => void;
  /** 기준일 (양도일 또는 취득일) — 추천 연도 자동 계산 */
  referenceDate?: string;
  /** 지번 주소 — Vworld 조회 활성화 조건 */
  jibun?: string;
  /** 필드 라벨 */
  label?: string;
  /** 부가 hint */
  hint?: string;
  /** 입력 placeholder */
  placeholder?: string;
}

export function LandPriceLookupField({
  pricePerSqm,
  onPricePerSqmChange,
  area,
  onAreaChange,
  referenceDate,
  jibun,
  label = "개별공시지가 (원/㎡)",
  hint,
  placeholder = "원/㎡",
}: LandPriceLookupFieldProps) {
  const [selectedYear, setSelectedYear] = useState("");
  const [isManual, setIsManual] = useState(false);
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
    setSelectedYear(value);
    setIsManual(manual);
  }

  function handleResetToAuto() {
    setSelectedYear(recommendedYear);
    setIsManual(false);
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
      if (json.price && json.price > 0) {
        onPricePerSqmChange(String(json.price));
        // 면적 자동 채움 — 빈 값일 때만 (조회된 필지면적 lndpclAr, ㎡)
        if (onAreaChange && typeof json.area === "number" && json.area > 0 && !(area && area > 0)) {
          onAreaChange(String(json.area));
        }
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
  const numericPrice = parseAmount(pricePerSqm);
  const landStdPrice =
    numericPrice > 0 && area && area > 0
      ? Math.floor(numericPrice * area)
      : null;

  const canLookup = !!jibun && !!effectiveYear;

  const yearBadge = isManual ? (
    <span className="flex items-center gap-1">
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-micro font-medium text-amber-700">
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
  ) : effectiveYear ? (
    <span className="rounded bg-green-100 px-1.5 py-0.5 text-micro font-medium text-green-700">
      자동
    </span>
  ) : null;

  return (
    // 컴팩트 3열 — 공시지가 연도(Select+조회 인라인) | 개별공시지가 | 토지기준시가
    // (ThreePointStandardPriceInput PointBlock 레이아웃과 통일)
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {/* ① 공시지가 연도 — Select + 조회 버튼 인라인 */}
      <FieldCard label="공시지가 연도" badge={yearBadge} stacked>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <Select
              value={effectiveYear}
              onValueChange={handleYearSelect}
              disabled={!referenceDate}
            >
              <SelectTrigger className="h-9 w-full">
                <span>
                  {effectiveYear
                    ? `${effectiveYear}년${!isManual ? " (자동)" : ""}`
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

      {/* ② 개별공시지가 */}
      <FieldCard label={label} hint={hint} unit="원/㎡" stacked>
        <CurrencyInput
          label=""
          value={pricePerSqm}
          onChange={onPricePerSqmChange}
          placeholder={placeholder}
          hideUnit
        />
      </FieldCard>

      {/* ③ 토지기준시가 (자동 계산) */}
      <FieldCard
        label="토지기준시가"
        hint={area ? `${area.toFixed(2)}㎡ × 공시지가` : "면적 입력 후 자동 계산"}
        unit="원"
        stacked
      >
        <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm tabular-nums text-muted-foreground">
          {landStdPrice !== null
            ? landStdPrice.toLocaleString()
            : <span className="text-muted-foreground/40 text-xs">면적 입력 후 자동 계산</span>}
        </div>
      </FieldCard>
    </div>
  );
}
