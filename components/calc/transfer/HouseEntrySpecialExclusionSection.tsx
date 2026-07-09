"use client";

/**
 * HouseEntrySpecialExclusionSection — 다른 보유 주택의 P2 특수 배제 사유 (2주택 전용·인구감소)
 *
 * 소령 §167의10① 3호(부득이)·8호(소송)·⑩(기준시가 1억↓ 정비구역 제외) + §167의3①2호의2(인구감소 세컨드홈).
 * 엔진은 effectiveHouseCount===2(부득이·소송·저가) / countEffectiveHouses(인구감소)에서 평가.
 *
 * 정책: ToggleCard/DateInput/DecimalInput 전용 · OFF 시 onUpdate 직접 undefined(useEffect 미러링 금지).
 */

import { DateInput } from "@/components/ui/date-input";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

interface Props {
  house: HouseEntry;
  onUpdate: (patch: Partial<HouseEntry>) => void;
}

export function HouseEntrySpecialExclusionSection({ house, onUpdate }: Props) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-200 text-micro font-bold text-rose-800 select-none">
          ④
        </span>
        <p className="text-xs font-semibold text-rose-700">특수 배제 사유 (2주택·인구감소)</p>
      </div>

      {/* 부득이한 사유 (취학·근무·질병) */}
      <ToggleCard
        variant="card"
        tone="rose"
        checked={house.isUnavoidableReason ?? false}
        onCheckedChange={(v) =>
          onUpdate({
            isUnavoidableReason: v,
            unavoidableResidenceYears: v ? house.unavoidableResidenceYears : undefined,
            unavoidableReasonResolvedDate: v ? house.unavoidableReasonResolvedDate : undefined,
          })
        }
        title="부득이한 사유 취득 주택"
        description="취학·근무상 형편·질병 요양 등 (기준시가 3억 이하·1년 이상 거주 — 소령 §167의10①3호)"
      >
        <div className="space-y-2 pt-1">
          <div className="space-y-1">
            <label className="block text-caption text-muted-foreground font-medium">거주기간 (년)</label>
            <DecimalInput
              value={house.unavoidableResidenceYears ?? ""}
              onChange={(v) => onUpdate({ unavoidableResidenceYears: v || undefined })}
              placeholder="거주기간 입력"
            />
            <p className="text-caption text-muted-foreground/70">1년 이상이어야 배제 적용</p>
          </div>
          <div className="space-y-1">
            <label className="block text-caption text-muted-foreground font-medium">
              사유 해소일 <span className="text-muted-foreground/60 font-normal">(해소 시 — 이후 3년 이내 양도)</span>
            </label>
            <DateInput
              value={house.unavoidableReasonResolvedDate ?? ""}
              onChange={(v) => onUpdate({ unavoidableReasonResolvedDate: v || undefined })}
            />
          </div>
        </div>
      </ToggleCard>

      {/* 소송 취득 주택 */}
      <ToggleCard
        variant="card"
        tone="rose"
        checked={house.isLitigationHousing ?? false}
        onCheckedChange={(v) =>
          onUpdate({
            isLitigationHousing: v,
            litigationAcquisitionDate: v ? house.litigationAcquisitionDate : undefined,
          })
        }
        title="소송 취득·진행 중 주택"
        description="소송으로 취득하거나 소송 진행 중 (소령 §167의10①8호)"
      >
        <div className="space-y-1 pt-1">
          <label className="block text-caption text-muted-foreground font-medium">
            소송 취득일 <span className="text-muted-foreground/60 font-normal">(취득 완료 시 — 3년 이내 배제. 미입력=진행 중)</span>
          </label>
          <DateInput
            value={house.litigationAcquisitionDate ?? ""}
            onChange={(v) => onUpdate({ litigationAcquisitionDate: v || undefined })}
          />
        </div>
      </ToggleCard>

      {/* 정비구역 — 기준시가 1억↓ 소형 배제에서 제외 */}
      <ToggleCard
        variant="chip"
        tone="rose"
        checked={house.isRedevelopmentZone ?? false}
        onCheckedChange={(v) => onUpdate({ isRedevelopmentZone: v })}
        title="정비구역(재개발·재건축) 지정"
      />

      {/* 인구감소지역 세컨드홈 */}
      <ToggleCard
        variant="card"
        tone="rose"
        checked={house.isPopulationDeclineArea ?? false}
        onCheckedChange={(v) =>
          onUpdate({
            isPopulationDeclineArea: v,
            isSecondHomeRegistered: v ? house.isSecondHomeRegistered : undefined,
            populationAreaType: v ? house.populationAreaType : undefined,
          })
        }
        title="인구감소지역 소재 주택"
        description="소령 §167의3①12 다·라목 — 세컨드홈 특례 시 주택 수 제외 (2026.1.1~)"
      >
        <div className="space-y-2 pt-1">
          <ToggleCard
            variant="chip"
            tone="rose"
            checked={house.isSecondHomeRegistered ?? false}
            onCheckedChange={(v) => onUpdate({ isSecondHomeRegistered: v })}
            title="세컨드홈 특례 등록"
          />
          <div className="space-y-1">
            <label className="block text-caption text-muted-foreground font-medium">지역 유형 (가액 한도)</label>
            <RadioCardGroup
              name={`house-pop-area-${house.id}`}
              layout="inline"
              tone="rose"
              value={house.populationAreaType ?? "interest"}
              onChange={(v) => onUpdate({ populationAreaType: v as "decline" | "interest" })}
              options={[
                { value: "decline", label: "인구감소지역(다목·9억)" },
                { value: "interest", label: "인구감소관심지역(라목·4억)" },
              ]}
            />
          </div>
        </div>
      </ToggleCard>
    </div>
  );
}
