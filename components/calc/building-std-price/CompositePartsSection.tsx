"use client";

/**
 * 복합구조 입력(상속·증여 1시점) — 층·구역별 구조·용도·면적이 다른 건물.
 * 각 부분 독립 계산 후 합산. 공용 부속시설(주차장·기계실 등)은 주용도 면적비율로 안분(고시 계산서 V항).
 * 위치지수(공시지가)·신축연도·평가연도는 건물 공통 → 본 섹션은 부분별 구조·용도·면적·조정률만.
 */
import { Button } from "@/components/ui/button";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { BuildingStructureSelect } from "./BuildingStructureSelect";
import { BuildingUsageSelect } from "./BuildingUsageSelect";
import { emptyCompositePart, type CompositePartForm } from "@/lib/calc/building-std-price-form";

interface Props {
  /** 구조·용도지수표 기준 연도(평가연도) */
  year: number | undefined;
  parts: CompositePartForm[];
  onPartsChange: (parts: CompositePartForm[]) => void;
  sharedFacilityArea: string;
  onSharedFacilityAreaChange: (v: string) => void;
}

export function CompositePartsSection({
  year,
  parts,
  onPartsChange,
  sharedFacilityArea,
  onSharedFacilityAreaChange,
}: Props) {
  const hasShared = (parseFloat(sharedFacilityArea.replace(/,/g, "")) || 0) > 0;

  const update = (i: number, patch: Partial<CompositePartForm>) =>
    onPartsChange(parts.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const add = () => onPartsChange([...parts, emptyCompositePart()]);
  const remove = (i: number) => onPartsChange(parts.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2.5">
      {parts.map((p, i) => (
        <div key={i} className="rounded-md border border-violet-200 bg-white/60 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-violet-700">부분 {i + 1}</span>
            {parts.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-[11px] text-rose-600 underline underline-offset-2 hover:no-underline"
              >
                삭제
              </button>
            )}
          </div>
          <FieldCard label="부분 명칭" hint="예: 1층 점포, 2~5층 사무소(선택)">
            <input
              type="text"
              value={p.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder="부분 명칭 (선택)"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FieldCard>
          <FieldCard label="구조">
            <BuildingStructureSelect year={year} value={p.structureKey} onChange={(v) => update(i, { structureKey: v })} />
          </FieldCard>
          <FieldCard label="용도">
            <BuildingUsageSelect year={year} value={p.usageNo} onChange={(v) => update(i, { usageNo: v })} />
          </FieldCard>
          <FieldCard label="면적" hint="해당 부분 연면적">
            <DecimalInput value={p.floorArea} onChange={(v) => update(i, { floorArea: v })} unit="㎡" placeholder="부분 면적" />
          </FieldCard>
          <FieldCard label="조정률" hint="100 = 1.0(미적용). 부분별로 다를 수 있음">
            <DecimalInput value={p.adjustmentRate} onChange={(v) => update(i, { adjustmentRate: v })} unit="%" placeholder="100" />
          </FieldCard>
          {hasShared && (
            <FieldCard label="공용 조정률" hint="이 부분 귀속 공용시설분 조정률(100 = 1.0). 비우면 공용 안분 제외">
              <DecimalInput
                value={p.sharedAdjustmentRate}
                onChange={(v) => update(i, { sharedAdjustmentRate: v })}
                unit="%"
                placeholder="100"
              />
            </FieldCard>
          )}
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={add} className="w-full">
        + 부분 추가
      </Button>

      <FieldCard label="공용 부속시설 총면적" hint="주차장·보일러실·기계실 등. 입력 시 각 부분 주용도 면적비율로 안분(선택)">
        <DecimalInput
          value={sharedFacilityArea}
          onChange={onSharedFacilityAreaChange}
          unit="㎡"
          placeholder="공용시설 면적 (없으면 비워두세요)"
        />
      </FieldCard>
      {hasShared && (
        <p className="rounded-md bg-violet-50 px-2.5 py-1.5 text-[11px] text-violet-700">
          공용시설 {sharedFacilityArea}㎡는 각 부분 주용도 면적비율로 안분됩니다. 안분받을 부분에 위 「공용 조정률」을 입력하세요.
        </p>
      )}
    </div>
  );
}
