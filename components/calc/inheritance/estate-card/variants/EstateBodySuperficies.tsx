"use client";

/**
 * EstateBodySuperficies — 지상권 본체 입력 (상증법 §61③·상증령 §51·상증규 §16)
 *
 * 평가: 토지가액(공시지가×면적) × 2% 연수입 → 잔존연수 10% 현가환산 합계.
 * 잔존연수(민법 §280·§281): 자동 산정(resolveSuperficiesTenureYears) useMemo derive + 사용자 override.
 *   3중 패턴(mirror-pattern): 표시=useMemo derive, store엔 override만, 엔진 전달=lib/calc 합성.
 */

import { useMemo } from "react";
import { parseISO } from "date-fns";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import { resolveSuperficiesTenureYears } from "@/lib/tax-engine/property-valuation";
import type { SuperficiesStructureType } from "@/lib/tax-engine/types/inheritance-gift.types";
import { EstateBodySection } from "./EstateBodySection";
import { makePatcher } from "./EstateBodyHelpers";
import type { VariantBodyProps } from "./types";

const TEXT_INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const STRUCTURE_OPTIONS: { value: SuperficiesStructureType; label: string; description: string }[] = [
  { value: "solid_building", label: "견고건물·수목 (㉠)", description: "석조·석회조·연와조 등 — 최단 30년" },
  { value: "other_building", label: "그 외 건물 (㉡)", description: "최단 15년" },
  { value: "non_building", label: "공작물 (㉢)", description: "건물 이외 공작물 — 최단 5년" },
  { value: "unspecified", label: "종류 미정", description: "공작물 종류·구조 미정 → 15년 간주 (민법 §281②)" },
];

export function EstateBodySuperficies({ item, onUpdate, valuationDate }: VariantBodyProps) {
  const set = makePatcher(item, onUpdate);

  // 자동 잔존연수 — 엔진 단일진실 헬퍼 derive (dual-truth 금지)
  const autoYears = useMemo(() => {
    if (!item.superficiesSetDate || !valuationDate || item.superficiesStructureType == null) return undefined;
    const setDate =
      typeof item.superficiesSetDate === "string" ? parseISO(item.superficiesSetDate) : item.superficiesSetDate;
    return resolveSuperficiesTenureYears({
      agreed: !!item.superficiesAgreed,
      structureType: item.superficiesStructureType,
      agreedYears: item.superficiesAgreedYears,
      setDate,
      valuationDate: parseISO(valuationDate),
    });
  }, [
    item.superficiesSetDate,
    item.superficiesStructureType,
    item.superficiesAgreed,
    item.superficiesAgreedYears,
    valuationDate,
  ]);

  const override = item.superficiesRemainingYearsOverride;
  const displayYears = override ?? autoYears;
  const isAuto = override == null;
  const setDateStr = typeof item.superficiesSetDate === "string" ? item.superficiesSetDate : "";

  return (
    <div data-testid={`estate-body-variant-superficies-${item.id}`} className="space-y-3">
      <EstateBodySection
        title="지상권 평가"
        subtitle="상증법 §61③·상증령 §51·상증규 §16 — 토지가액×2% 연수입 10% 현가환산"
      >
        {/* 자산명 */}
        <FieldCard label="자산 명칭">
          <input
            type="text"
            value={item.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="선택 입력 (예: ○○토지 지상권)"
            className={TEXT_INPUT_CLASS}
          />
        </FieldCard>

        {/* ① 지상권 설정 토지 */}
        <LandPriceLookupField
          pricePerSqm={item.superficiesLandStandardPrice != null ? String(item.superficiesLandStandardPrice) : ""}
          onPricePerSqmChange={(v) => set({ superficiesLandStandardPrice: parseAmount(v) || undefined })}
          area={item.superficiesLandArea}
          referenceDate={valuationDate}
          label="지상권 설정 토지 개별공시지가"
          hint="원/㎡ — 토지가액 = 공시지가 × 면적 (§61①)"
        />
        <FieldCard label="토지 면적" unit="㎡">
          <DecimalInput
            value={item.superficiesLandArea != null ? String(item.superficiesLandArea) : ""}
            onChange={(v) => set({ superficiesLandArea: parseDecimal(v) || undefined })}
            data-testid={`superficies-land-area-${item.id}`}
          />
        </FieldCard>

        {/* ② 존속기간 (민법 §280·§281) */}
        <ToggleCard
          checked={!!item.superficiesAgreed}
          onCheckedChange={(v) => set({ superficiesAgreed: v })}
          title="존속기간 약정"
          description="ON: 약정(민법 §280) / OFF: 미약정(§281)"
          tone="violet"
        >
          <FieldCard label="약정 존속기간" unit="년" hint="최단존속기간 미만 약정은 최단으로 연장 (§280①)">
            <DecimalInput
              value={item.superficiesAgreedYears != null ? String(item.superficiesAgreedYears) : ""}
              onChange={(v) => set({ superficiesAgreedYears: parseDecimal(v) || undefined })}
              data-testid={`superficies-agreed-years-${item.id}`}
            />
          </FieldCard>
        </ToggleCard>

        <FieldCard label="건물·공작물 종류" hint="민법 §280·§281 최단존속기간 결정">
          <RadioCardGroup
            name={`superficies-structure-${item.id}`}
            options={STRUCTURE_OPTIONS}
            value={item.superficiesStructureType ?? ""}
            onChange={(v) => set({ superficiesStructureType: v })}
            tone="sky"
          />
        </FieldCard>

        <FieldCard label="지상권 설정일" hint="평가기준일(상속개시일/증여일)과 차분해 잔존연수 산정">
          <DateInput value={setDateStr} onChange={(v) => set({ superficiesSetDate: v || undefined })} />
        </FieldCard>

        {/* ③ 잔존연수 — 자동 derive + override */}
        <FieldCard
          label="잔존연수"
          unit="년"
          hint={isAuto ? "민법 최단기간·설정일 기준 자동 산정 (수정 가능)" : "직접 입력값 적용 중 (비우면 자동 복귀)"}
        >
          <DecimalInput
            value={displayYears != null ? String(displayYears) : ""}
            onChange={(v) => {
              const n = parseDecimal(v);
              set({ superficiesRemainingYearsOverride: n > 0 ? Math.trunc(n) : undefined });
            }}
            data-testid={`superficies-remaining-years-${item.id}`}
          />
        </FieldCard>
        {isAuto && autoYears != null && (
          <p className="text-xs text-sky-700 bg-sky-50 dark:bg-sky-900/20 rounded px-3 py-2">
            🔵 자동 산정 {autoYears}년 (민법 §280·§281, 1년 미만 절상)
          </p>
        )}
        <p className="text-xs text-sky-600 dark:text-sky-400">
          민법 최단존속기간: ㉠견고건물 30년 / ㉡기타건물 15년 / ㉢공작물 5년 · 약정 시 max(약정, 최단)
        </p>
      </EstateBodySection>
    </div>
  );
}
