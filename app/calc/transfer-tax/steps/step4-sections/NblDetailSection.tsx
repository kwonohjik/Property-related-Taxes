import { DateInput } from "@/components/ui/date-input";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

// ============================================================
// 비사업용 토지 정밀 판정 (P0-A) — Step 4 섹션
// ============================================================

// ============================================================
// Step 4 보조 컴포넌트: 비사업용 토지 정밀 판정 (P0-A)
// ============================================================

const NBL_LAND_TYPE_OPTIONS = [
  { value: "farmland", label: "농지 (전·답·과수원)" },
  { value: "forest", label: "임야" },
  { value: "pasture", label: "목장용지" },
  { value: "housing_site", label: "주택 부수 토지" },
  { value: "villa_land", label: "별장 부수 토지" },
  { value: "other_land", label: "기타 토지 (나대지·잡종지)" },
] as const;

const NBL_ZONE_TYPE_OPTIONS = [
  { value: "exclusive_residential", label: "전용주거지역" },
  { value: "general_residential", label: "일반주거지역" },
  { value: "semi_residential", label: "준주거지역" },
  { value: "residential", label: "주거지역 (통합)" },
  { value: "commercial", label: "상업지역" },
  { value: "industrial", label: "공업지역" },
  { value: "green", label: "녹지지역" },
  { value: "management", label: "관리지역" },
  { value: "agriculture_forest", label: "농림지역" },
  { value: "natural_env", label: "자연환경보전지역" },
  { value: "undesignated", label: "미지정" },
] as const;

function isFarmlandNblType(landType: string) {
  return ["farmland", "paddy", "field", "orchard"].includes(landType);
}

export function NblDetailSection({
  form,
  onChange,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
}) {
  const periods = form.nblBusinessUsePeriods;

  function addPeriod() {
    onChange({
      nblBusinessUsePeriods: [
        ...periods,
        { startDate: "", endDate: "", usageType: "자경" },
      ],
    });
  }

  function removePeriod(idx: number) {
    onChange({
      nblBusinessUsePeriods: periods.filter((_, i) => i !== idx),
    });
  }

  function updatePeriod(idx: number, patch: Partial<{ startDate: string; endDate: string; usageType: string }>) {
    onChange({
      nblBusinessUsePeriods: periods.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border/80 bg-muted/20 px-4 py-4">
      <p className="text-sm font-medium">
        비사업용 토지 정밀 판정{" "}
        <span className="text-xs text-muted-foreground font-normal">(선택 — 입력 시 엔진이 자동 판정)</span>
      </p>

      {/* 지목 */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-muted-foreground">토지 지목</label>
        <select
          value={form.nblLandType}
          onChange={(e) => onChange({ nblLandType: e.target.value })}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">선택 안 함</option>
          {NBL_LAND_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* 면적 + 용도지역 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-muted-foreground">토지 면적 (㎡)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.nblLandArea}
            onChange={(e) => onChange({ nblLandArea: e.target.value })}
            onFocus={(e) => e.target.select()}
            placeholder="예: 500.00"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-muted-foreground">용도지역</label>
          <select
            value={form.nblZoneType}
            onChange={(e) => onChange({ nblZoneType: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">선택 안 함</option>
            {NBL_ZONE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 농지계 자경 여부 */}
      {isFarmlandNblType(form.nblLandType) && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <input
              id="nblFarmingSelf"
              type="checkbox"
              checked={form.nblFarmingSelf}
              onChange={(e) => onChange({ nblFarmingSelf: e.target.checked })}
              className="h-4 w-4 rounded accent-primary"
            />
            <label htmlFor="nblFarmingSelf" className="text-sm cursor-pointer">직접 자경 (재촌자경)</label>
          </div>
          {form.nblFarmingSelf && (
            <div className="ml-7 space-y-1.5">
              <label className="block text-xs font-medium text-muted-foreground">거주지까지 직선거리 (km)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.nblFarmerResidenceDistance}
                  onChange={(e) => onChange({ nblFarmerResidenceDistance: e.target.value })}
                  onFocus={(e) => e.target.select()}
                  placeholder="예: 15.0"
                  className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <span className="text-xs text-muted-foreground">km (30km 이내 = 재촌 인정)</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 사업용 사용기간 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">사업용 사용기간</label>
          <button
            type="button"
            onClick={addPeriod}
            className="text-xs text-primary hover:underline"
          >
            + 기간 추가
          </button>
        </div>
        {periods.length === 0 && (
          <p className="text-xs text-muted-foreground/70">없음 — 실제 사용기간이 있으면 추가하세요.</p>
        )}
        <div className="space-y-2">
          {periods.map((p, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-start">
              <div>
                <DateInput
                  value={p.startDate}
                  onChange={(v) => updatePeriod(idx, { startDate: v })}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">시작일</p>
              </div>
              <div>
                <DateInput
                  value={p.endDate}
                  onChange={(v) => updatePeriod(idx, { endDate: v })}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">종료일</p>
              </div>
              <input
                type="text"
                value={p.usageType}
                onChange={(e) => updatePeriod(idx, { usageType: e.target.value })}
                onFocus={(e) => e.target.select()}
                placeholder="자경"
                className="rounded-md border border-input bg-background px-2 py-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring w-16"
              />
              <button
                type="button"
                onClick={() => removePeriod(idx)}
                className="mt-1 text-destructive text-xs hover:underline"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
