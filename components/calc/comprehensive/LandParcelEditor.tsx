"use client";

/**
 * LandParcelEditor — 토지 필지 편집 모달 본문 (종합합산·별도합산 공용).
 *
 * 순수 controlled (parcel + onUpdate). 주택 PropertyCardEditor의 controlled 패턴만 차용
 * (토지는 6필드 소형 — 내부 state 불필요). 필드는 현행 인라인 LandParcelSection과 동일.
 * 직전연도 개별공시지가 필드는 priorMode === "auto"일 때만 노출(per-parcel 보존).
 */

import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import type { LandParcelForm, LandPriorMode } from "@/lib/stores/comprehensive-wizard-store";

type Kind = "aggregate" | "separate";

interface Props {
  parcel: LandParcelForm;
  kind: Kind;
  /** 당해연도 기준일 (`${과세연도}-06-01`) */
  refDate: string;
  /** 직전연도 (문자열) */
  priorYear: string;
  /** 직전연도 세부담상한 서브모드 — "auto"일 때만 직전 공시지가 필드 노출 */
  priorMode: LandPriorMode;
  onUpdate: (data: Partial<LandParcelForm>) => void;
}

const TEXT_INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function LandParcelEditor({ parcel, kind, refDate, priorYear, priorMode, onUpdate }: Props) {
  // 토지기준시가 자동 계산용 — 총면적(㎡). 모달에 면적 필드가 함께 있어 즉시 반영.
  const areaSqm = parseDecimal(parcel.area);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">
            시군구 <span className="text-muted-foreground font-normal text-xs">(재산세 합산)</span>
          </label>
          <input
            type="text"
            value={parcel.jurisdiction}
            onChange={(e) => onUpdate({ jurisdiction: e.target.value })}
            placeholder="예: 서초구"
            data-testid={`land-${kind}-parcel-jurisdiction`}
            className={TEXT_INPUT_CLASS}
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">
            필지명 <span className="text-muted-foreground font-normal text-xs">(선택)</span>
          </label>
          <input
            type="text"
            value={parcel.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="구분용 명칭"
            data-testid={`land-${kind}-parcel-name`}
            className={TEXT_INPUT_CLASS}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5" data-testid={`land-${kind}-parcel-area`}>
          <label className="block text-sm font-medium">총면적 (㎡)</label>
          <DecimalInput value={parcel.area} onChange={(v) => onUpdate({ area: v })} />
        </div>
        <div className="space-y-1.5" data-testid={`land-${kind}-parcel-share`}>
          <label className="block text-sm font-medium">지분율 (%)</label>
          <DecimalInput value={parcel.shareRatio} onChange={(v) => onUpdate({ shareRatio: v })} />
        </div>
      </div>

      {/* 당해 개별공시지가 — 면적 전달로 토지기준시가(= 공시지가 × 면적) 자동 계산 */}
      <div data-testid={`land-${kind}-parcel-price`}>
        <LandPriceLookupField
          label="당해 개별공시지가 (원/㎡)"
          pricePerSqm={parcel.officialPricePerSqm}
          onPricePerSqmChange={(v) => onUpdate({ officialPricePerSqm: v })}
          referenceDate={refDate}
          jibun={parcel.jibun}
          area={areaSqm}
        />
      </div>

      {priorMode === "auto" && (
        <div data-testid={`land-${kind}-parcel-prior-price`}>
          <LandPriceLookupField
            label={`직전연도(${priorYear}) 개별공시지가 (원/㎡)`}
            pricePerSqm={parcel.priorOfficialPricePerSqm}
            onPricePerSqmChange={(v) => onUpdate({ priorOfficialPricePerSqm: v })}
            referenceDate={`${priorYear}-06-01`}
            jibun={parcel.jibun}
            area={areaSqm}
          />
        </div>
      )}
    </div>
  );
}
