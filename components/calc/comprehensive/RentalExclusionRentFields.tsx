"use client";

/**
 * 합산배제 임대주택 — 공실(§3⑦4호 · T-12) · 5% 비교 기준 계약 · 임대료 칸. ExclusionInfoInput에서 분리(800줄 정책).
 * - 공실 토글은 4·9호(「소유」)에서 묻지 않는다(`asksVacancy` — ④⑧과 같은 술어). 공실이면 그해 계약이 없어 아래 5%·임대료 칸을 숨긴다.
 * - 5%·임대료 칸은 4호(미임대)·5호(임대료 요건 없음)에서 묻지 않는다(`asksRent`).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-input-gaps-4.plan.md §3.2
 */
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { DateInput } from "@/components/ui/date-input";
import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";
import { asksVacancy } from "@/lib/calc/comprehensive-rental-vacancy";
import { isVacantEntry } from "@/lib/calc/comprehensive-rental-vacancy";

export function RentalExclusionRentFields({
  property,
  registrationType,
  asksRent,
  onUpdate,
}: {
  property: PropertyEntry;
  registrationType: string;
  asksRent: boolean;
  onUpdate: (patch: Partial<PropertyEntry>) => void;
}) {
  const vacant = isVacantEntry(property, registrationType);
  return (
    <>
      {asksVacancy(registrationType) && (
        <ToggleCard
          tone="violet"
          title="과세기준일(6월 1일) 현재 임차인이 없음(공실)"
          description="기존 임차인이 나간 날부터 2년 안이면 계속 임대한 것으로 봅니다(시행령 §3⑦4호)"
          checked={property.rentalVacantAtAssessment === true}
          onCheckedChange={(v) => onUpdate({ rentalVacantAtAssessment: v })}
        >
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">
              기존 임차인 퇴거일 <span className="text-destructive">*</span>
            </label>
            <DateInput
              data-testid="comprehensive-vacancy-eviction-date"
              value={property.vacancyEvictionDate ?? ""}
              onChange={(v) => onUpdate({ vacancyEvictionDate: v })}
            />
            <p className="text-xs text-muted-foreground">
              퇴거일 다음 날부터 2년이 지나기 전에 다음 임차인이 입주해야 합니다. 2년을 넘긴 공실이면 합산배제되지 않습니다.
            </p>
          </div>
        </ToggleCard>
      )}

      {/* 5% 비교 기준 계약 — 4호(미임대)·5호(임대료 요건 없음)는 묻지 않는다.
          기준은 2019.2.12. 이후 처음 쓴 표준임대차계약(종부령 부칙<제29524호> §3 · 서면-2020-부동산-2435),
          8호는 등록·재등록 뒤 처음 쓴 계약(서면-2021-부동산-5682·2749). 1·2호는 해석례 없음(계획서 V-F) */}
      {asksRent && !vacant && (<>
      <ToggleCard
        tone="violet"
        title="처음 쓴 표준임대차계약 (5% 비교 제외)"
        description="2019.2.12. 이후 처음 쓴 표준임대차계약이면 켜세요"
        checked={property.isInitialContract}
        onCheckedChange={(v) => onUpdate({ isInitialContract: v })}
      />
      <p className="text-xs text-muted-foreground">
        장기일반 매입(8호)은 등록·재등록 뒤 처음 쓴 계약이 기준입니다. 다른 호는 확인 필요.
      </p>

      {/* 임대료 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CurrencyInput
          label="현재 임대료 (월)"
          value={property.currentRent}
          onChange={(v) => onUpdate({ currentRent: v })}
          placeholder="0"
          hint="환산 월세 기준"
        />
        {!property.isInitialContract && (
          <CurrencyInput
            label="직전 임대료 (월)"
            value={property.previousRent}
            onChange={(v) => onUpdate({ previousRent: v })}
            placeholder="0"
            hint="바로 앞 계약의 월 임대료(보증금은 월세로 환산)"
          />
        )}
      </div>

      {/* 임대료 증가율 경고 (갱신 계약 시) */}
      {!property.isInitialContract &&
        property.currentRent &&
        property.previousRent &&
        (() => {
          const current = parseInt(property.currentRent.replace(/,/g, "") || "0");
          const previous = parseInt(property.previousRent.replace(/,/g, "") || "0");
          if (previous > 0 && current > previous * 1.05) {
            return (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 dark:bg-red-950/40">
                <p className="text-xs text-red-700 dark:text-red-300">
                  ⚠ 바로 앞 계약보다 5% 넘게 올랐습니다. 처음 쓴 표준임대차계약이 아니면 합산배제되지 않습니다.
                </p>
              </div>
            );
          }
          return null;
        })()}
      </>)}
    </>
  );
}
