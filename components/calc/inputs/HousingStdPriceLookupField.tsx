"use client";

/**
 * 주택 기준시가(공동/개별주택 공시가격) 입력 + Vworld 자동조회 필드.
 *
 * LandPriceLookupField의 주택판. **핵심 차이**:
 *   - 주택 응답 `price`는 **총 공시가격(원, 총액)** — LandPriceLookupField의 `원/㎡ × 면적` 로직을
 *     답습하지 않고 price를 **직접 세팅**한다(면적곱 금지 — 가액 과대 버그 방지).
 *   - propertyType=housing → route가 공동주택(pblntfPc) 우선 → 개별주택(housePc) 자동 fallback.
 *     응답 priceType(apart/indvd)으로 공동/개별 배지 표시.
 *   - 주소검색은 **컴포넌트 외부**(부모가 렌더) — `jibun` string prop만 주입(LandPriceLookupField 패턴).
 *
 * 사용처: 임대개시일 기준시가(RentalUnitCard) · §161① 3시점 기준시가(RentalHousingExceptionSection).
 */

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { landPriceYearOptions, recommendLandPriceYear } from "@/lib/utils/land-price-year";

export interface HousingStdPriceLookupFieldProps {
  /** 기준시가 필드 라벨 */
  label: string;
  /** 현재 값 (원, 총액 문자열) */
  value: string;
  /** 값 변경 콜백 */
  onChange: (v: string) => void;
  /** 지번 주소 — 조회 활성화 조건(외부 주입, 컴포넌트 미내장) */
  jibun?: string;
  /** 공동주택 동(예: "324") — 지정 시 해당 세대 공시가격만 조회(임의 세대 반환 방지) */
  dong?: string;
  /** 공동주택 호(예: "1004") — 지정 시 해당 세대 공시가격만 조회 */
  ho?: string;
  /** 기준일 — 추천 연도 자동 계산 (임대 시작일·D_prior·취득일·양도일 등) */
  referenceDate?: string;
  required?: boolean;
  hint?: string;
  /** 조회 성공 시 해당 세대 전용면적(㎡) 전달 — 면적 자동채움용(공동주택 응답에만 존재). */
  onExclusiveArea?: (areaSqm: number) => void;
  /** E2E 셀렉터 prefix */
  testidPrefix: string;
}

export function HousingStdPriceLookupField({
  label,
  value,
  onChange,
  jibun,
  dong,
  ho,
  referenceDate,
  required = false,
  hint,
  onExclusiveArea,
  testidPrefix,
}: HousingStdPriceLookupFieldProps) {
  const [selectedYear, setSelectedYear] = useState("");
  const [isManual, setIsManual] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [priceType, setPriceType] = useState<string | null>(null);

  const options = referenceDate ? landPriceYearOptions(referenceDate) : [];
  const recommendedYear = referenceDate ? String(recommendLandPriceYear(referenceDate)) : "";
  const effectiveYear = selectedYear || recommendedYear;
  const canLookup = !!jibun && !!effectiveYear;

  function handleYearSelect(v: string | null) {
    if (!v) return;
    setSelectedYear(v);
    setIsManual(v !== recommendedYear);
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
      const params = new URLSearchParams({ jibun, propertyType: "housing", year: effectiveYear });
      if (dong) params.set("dong", dong);
      if (ho) params.set("ho", ho);
      const res = await fetch(`/api/address/standard-price?${params}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        setLookupError(json.error?.message ?? "조회 실패");
        return;
      }
      if (json.price && json.price > 0) {
        // ⚠️ 총액(원) 직접 세팅 — 면적곱 금지 (주택 공시가격은 총액)
        onChange(String(json.price));
        setPriceType(json.priceType ?? null);
        setLookupError(null);
        // 공동주택 응답의 전용면적(㎡) 전달 — 면적 자동채움(있을 때만).
        if (typeof json.exclusiveArea === "number" && json.exclusiveArea > 0) {
          onExclusiveArea?.(json.exclusiveArea);
        }
      } else {
        setLookupError("해당 연도 공시가격 없음");
      }
    } catch {
      setLookupError("네트워크 오류");
    } finally {
      setIsLookingUp(false);
    }
  }

  const priceTypeLabel =
    priceType === "apart_housing_price" ? "공동주택" : priceType === "indvd_housing_price" ? "개별주택" : null;

  const yearBadge = isManual ? (
    <span className="flex items-center gap-1">
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-micro font-medium text-amber-700">수동</span>
      <button
        type="button"
        onClick={handleResetToAuto}
        className="text-micro text-primary underline underline-offset-2 hover:no-underline"
      >
        ↻ 자동
      </button>
    </span>
  ) : effectiveYear ? (
    <span className="rounded bg-green-100 px-1.5 py-0.5 text-micro font-medium text-green-700">자동</span>
  ) : null;

  return (
    <div className="space-y-1.5">
      {/* 묶음 라벨 — 두 필드(공시가격 연도 + 기준시가) 공통 헤더 */}
      <div className="flex items-start gap-1 text-sm font-medium">
        {required && (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        )}
        <span className="leading-tight">{label}</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {/* ① 공시가격 연도 — Select + 조회 버튼 인라인 */}
      <FieldCard label="공시가격 연도" badge={yearBadge} stacked>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <Select value={effectiveYear} onValueChange={handleYearSelect} disabled={!referenceDate}>
              <SelectTrigger className="h-9 w-full" data-testid={`${testidPrefix}-year-select`}>
                <span>
                  {effectiveYear ? `${effectiveYear}년${!isManual ? " (자동)" : ""}` : "기준일 미입력"}
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
            data-testid={`${testidPrefix}-lookup-btn`}
            className="h-9 shrink-0 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted/60 disabled:opacity-40 transition-colors"
          >
            {isLookingUp ? "조회 중…" : "공시가격 조회"}
          </button>
        </div>
        {lookupError ? (
          <p className="mt-1 text-xs text-destructive" data-testid={`${testidPrefix}-status`}>
            {lookupError}
          </p>
        ) : !jibun ? (
          <p className="mt-1 text-caption text-muted-foreground">지번 주소 입력 후 조회 가능합니다.</p>
        ) : null}
      </FieldCard>

      {/* ② 기준시가 (총액, 원) — 조회 결과 직접 세팅·수동수정 가능 */}
      <FieldCard
        label="기준시가"
        hint={hint}
        unit="원"
        badge={
          priceTypeLabel ? (
            <span
              className="rounded bg-emerald-100 px-1.5 py-0.5 text-micro font-medium text-emerald-700"
              data-testid={`${testidPrefix}-pricetype-badge`}
            >
              {priceTypeLabel}
            </span>
          ) : null
        }
        stacked
      >
        <div data-testid={`${testidPrefix}-price-input`}>
          <CurrencyInput label="" value={value} onChange={onChange} hideUnit placeholder="기준시가 (원)" />
        </div>
      </FieldCard>
      </div>
    </div>
  );
}
