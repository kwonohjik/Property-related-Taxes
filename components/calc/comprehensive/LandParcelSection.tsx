"use client";

/**
 * LandParcelSection — 토지 필지별 입력 (종합합산·별도합산 공용).
 *
 * 집계 직접입력(summary, 기본) ↔ 필지별 자동계산(parcels) 모드 토글.
 * 필지 모드: 시군구·면적·지분율·당해/직전 개별공시지가 → 엔진 자동(지자체 합산 재산세·직전연도 상당액).
 * Design: docs/02-design/features/comprehensive-land-payable-calc.ui.design.md §4
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { useComprehensiveWizardStore } from "@/lib/stores/comprehensive-wizard-store";

type Kind = "aggregate" | "separate";

export function LandParcelSection({ kind }: { kind: Kind }) {
  const { formData, updateFormData, addLandParcel, removeLandParcel, updateLandParcel } =
    useComprehensiveWizardStore();

  const mode = kind === "aggregate" ? formData.landAggregateMode : formData.landSeparateMode;
  const modeKey = kind === "aggregate" ? "landAggregateMode" : "landSeparateMode";
  const parcels = kind === "aggregate" ? formData.landAggregateParcels : formData.landSeparateParcels;
  const priorMode =
    kind === "aggregate" ? formData.landAggregatePriorMode : formData.landSeparatePriorMode;
  const priorModeKey =
    kind === "aggregate" ? "landAggregatePriorMode" : "landSeparatePriorMode";
  const refDate = `${formData.assessmentYear}-06-01`;
  const priorYear = String((parseInt(formData.assessmentYear) || new Date().getFullYear()) - 1);
  const autoSupported = (parseInt(formData.assessmentYear) || 0) >= 2022;

  return (
    <div className="space-y-3">
      {/* 입력 방식 토글 */}
      <RadioCardGroup
        name={`land-mode-${kind}`}
        tone="sky"
        layout="inline"
        value={mode}
        onChange={(v) => updateFormData({ [modeKey]: v as "summary" | "parcels" })}
        options={[
          { value: "summary", label: "집계 직접 입력", description: "재산세 과표·부과세액을 합산액으로 입력" },
          { value: "parcels", label: "필지별 자동 계산", description: "필지 입력 → 재산세·세부담상한 자동" },
        ]}
      />

      {mode === "parcels" && (
        <div className="space-y-3">
          {parcels.map((parcel, index) => (
            <div
              key={parcel.id}
              className="rounded-lg border border-sky-200 bg-sky-50/40 p-4 space-y-3"
              data-testid={`land-${kind}-parcel-${index}`}
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-sky-800">필지 {index + 1}</h4>
                <button
                  type="button"
                  onClick={() => removeLandParcel(kind, parcel.id)}
                  className="text-xs text-destructive hover:underline"
                >
                  삭제
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium">
                    시군구 <span className="text-muted-foreground font-normal text-xs">(재산세 합산)</span>
                  </label>
                  <input
                    type="text"
                    value={parcel.jurisdiction}
                    onChange={(e) => updateLandParcel(kind, parcel.id, { jurisdiction: e.target.value })}
                    placeholder="예: 서초구"
                    data-testid={`land-${kind}-parcel-${index}-jurisdiction`}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium">
                    필지명 <span className="text-muted-foreground font-normal text-xs">(선택)</span>
                  </label>
                  <input
                    type="text"
                    value={parcel.name}
                    onChange={(e) => updateLandParcel(kind, parcel.id, { name: e.target.value })}
                    placeholder="구분용 명칭"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5" data-testid={`land-${kind}-parcel-${index}-area`}>
                  <label className="block text-sm font-medium">총면적 (㎡)</label>
                  <DecimalInput
                    value={parcel.area}
                    onChange={(v) => updateLandParcel(kind, parcel.id, { area: v })}
                  />
                </div>
                <div className="space-y-1.5" data-testid={`land-${kind}-parcel-${index}-share`}>
                  <label className="block text-sm font-medium">지분율 (%)</label>
                  <DecimalInput
                    value={parcel.shareRatio}
                    onChange={(v) => updateLandParcel(kind, parcel.id, { shareRatio: v })}
                  />
                </div>
              </div>

              <div data-testid={`land-${kind}-parcel-${index}-price`}>
                <LandPriceLookupField
                  label="당해 개별공시지가 (원/㎡)"
                  pricePerSqm={parcel.officialPricePerSqm}
                  onPricePerSqmChange={(v) => updateLandParcel(kind, parcel.id, { officialPricePerSqm: v })}
                  referenceDate={refDate}
                  jibun={parcel.jibun}
                />
              </div>

              {priorMode === "auto" && (
                <div data-testid={`land-${kind}-parcel-${index}-prior-price`}>
                  <LandPriceLookupField
                    label={`직전연도(${priorYear}) 개별공시지가 (원/㎡)`}
                    pricePerSqm={parcel.priorOfficialPricePerSqm}
                    onPricePerSqmChange={(v) =>
                      updateLandParcel(kind, parcel.id, { priorOfficialPricePerSqm: v })
                    }
                    referenceDate={`${priorYear}-06-01`}
                    jibun={parcel.jibun}
                  />
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() => addLandParcel(kind)}
            className="w-full rounded-md border border-dashed border-muted-foreground/50 px-4 py-3 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            + 필지 추가
          </button>

          {/* 직전연도(세부담상한) 서브모드 */}
          <div className="rounded-md border border-violet-200 bg-violet-50/40 p-3 space-y-2">
            <p className="text-xs font-semibold text-violet-700">직전연도 세부담 상한 (§15)</p>
            <RadioCardGroup
              name={`land-prior-${kind}`}
              tone="violet"
              layout="stack"
              value={priorMode}
              onChange={(v) => updateFormData({ [priorModeKey]: v as "none" | "auto" | "direct" })}
              options={[
                { value: "none", label: "미적용", description: "세부담 상한 계산 생략" },
                {
                  value: "auto",
                  label: "직전 공시지가로 자동 계산",
                  description: autoSupported
                    ? "각 필지 직전연도 공시지가 입력 (전 필지 필수)"
                    : "2022년 이후 귀속만 지원 — 직접 입력을 사용하세요",
                },
                { value: "direct", label: "직전연도 총세액 직접 입력", description: "재산세+종부세 합계액" },
              ]}
            />
            {priorMode === "direct" && (
              <CurrencyInput
                label="직전연도 총세액 (원)"
                value={
                  kind === "aggregate"
                    ? formData.landAggregate.previousYearTotalTax
                    : formData.landSeparatePreviousYearTotalTax
                }
                onChange={(v) =>
                  kind === "aggregate"
                    ? updateFormData({
                        landAggregate: { ...formData.landAggregate, previousYearTotalTax: v },
                      })
                    : updateFormData({ landSeparatePreviousYearTotalTax: v })
                }
                placeholder="0"
                hint="직전연도 재산세 + 종합부동산세 합계 (농특세 제외)"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
