"use client";

/**
 * 복합구조 입력(상증·양도 공용) — 층·구역별 구조·용도·면적이 다른 건물.
 * 각 부분 독립 계산 후 합산. 공용 부속시설(주차장·기계실 등)은 종류별 면적 입력 후 주용도 면적비율로 안분.
 * 상증: 조정률(% 또는 번호) 적용. 양도: 조정률 미적용 + 취득시 용도(연도별 체계 상이) 입력.
 */
import { Button } from "@/components/ui/button";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { BuildingStructureSelect } from "./BuildingStructureSelect";
import { BuildingUsageSelect } from "./BuildingUsageSelect";
import {
  emptyCompositePart,
  type CompositePartForm,
  type AncillaryAreaForm,
  type AncillaryFloorForm,
} from "@/lib/calc/building-std-price-form";
import type { AncillaryFacilityKind } from "@/lib/tax-engine/types/building-standard-price.types";

const ANCILLARY_FIELDS: { kind: AncillaryFacilityKind; label: string }[] = [
  { kind: "parking", label: "주차장" },
  { kind: "machine", label: "기계실" },
  { kind: "boiler", label: "보일러실" },
  { kind: "shelter", label: "대피소" },
  { kind: "rooftop", label: "옥탑" },
  { kind: "other", label: "기타" },
];

interface Props {
  /** 양도시(또는 평가) 구조·용도지수표 기준 연도 */
  year: number | undefined;
  /** 양도 복합 — 취득시 용도지수표 기준 연도(≤2000=2001) */
  acqYear?: number;
  /** 양도 복합 여부(취득시 용도 입력·조정률 숨김) */
  forTransfer?: boolean;
  parts: CompositePartForm[];
  onPartsChange: (parts: CompositePartForm[]) => void;
  ancillaryAreas: AncillaryAreaForm;
  onAncillaryChange: (areas: AncillaryAreaForm) => void;
  /** 부속시설 종류별 위치 층 라벨(계산서 Ⅳ "층별") */
  ancillaryFloors: AncillaryFloorForm;
  onAncillaryFloorsChange: (floors: AncillaryFloorForm) => void;
}

export function CompositePartsSection({
  year,
  acqYear,
  forTransfer = false,
  parts,
  onPartsChange,
  ancillaryAreas,
  onAncillaryChange,
  ancillaryFloors,
  onAncillaryFloorsChange,
}: Props) {
  const hasShared = ANCILLARY_FIELDS.some((a) => (parseFloat(ancillaryAreas[a.kind].replace(/,/g, "")) || 0) > 0);

  const update = (i: number, patch: Partial<CompositePartForm>) =>
    onPartsChange(parts.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const add = () => onPartsChange([...parts, emptyCompositePart()]);
  const remove = (i: number) => onPartsChange(parts.filter((_, idx) => idx !== i));
  const setAnc = (kind: AncillaryFacilityKind, v: string) => onAncillaryChange({ ...ancillaryAreas, [kind]: v });
  const setAncFloor = (kind: AncillaryFacilityKind, v: string) =>
    onAncillaryFloorsChange({ ...ancillaryFloors, [kind]: v });

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
          <FieldCard label="부분 명칭" hint="예: 지상1, 지하1 점포(선택)">
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
          <FieldCard label={forTransfer ? "양도시 용도" : "용도"}>
            <BuildingUsageSelect year={year} value={p.usageNo} onChange={(v) => update(i, { usageNo: v })} />
          </FieldCard>
          {forTransfer && (
            <FieldCard label="취득시 용도" hint="연도별 용도체계 상이 — 취득시점 기준 선택">
              <BuildingUsageSelect year={acqYear} value={p.acqUsageNo} onChange={(v) => update(i, { acqUsageNo: v })} />
            </FieldCard>
          )}
          <FieldCard label="면적" hint="해당 부분 연면적">
            <DecimalInput value={p.floorArea} onChange={(v) => update(i, { floorArea: v })} unit="㎡" placeholder="부분 면적" />
          </FieldCard>
          {!forTransfer && (
            <>
              <FieldCard label="조정률(%)" hint="100 = 1.0(미적용). 번호 입력 시 무시">
                <DecimalInput value={p.adjustmentRate} onChange={(v) => update(i, { adjustmentRate: v })} unit="%" placeholder="100" />
              </FieldCard>
              <FieldCard label="조정률 번호" hint="쉼표로 구분(예: 9,20). 입력 시 % 대신 번호 지수 곱">
                <input
                  type="text"
                  value={p.adjustmentNos}
                  onChange={(e) => update(i, { adjustmentNos: e.target.value })}
                  placeholder="조정률 번호 (선택)"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </FieldCard>
              {hasShared && (
                <>
                  <FieldCard label="공용 조정률(%)" hint="이 부분 귀속 공용시설분(100=1.0). 비우면 공용 안분 제외">
                    <DecimalInput
                      value={p.sharedAdjustmentRate}
                      onChange={(v) => update(i, { sharedAdjustmentRate: v })}
                      unit="%"
                      placeholder="100"
                    />
                  </FieldCard>
                  <FieldCard label="공용 조정률 번호" hint="쉼표 구분(예: 9,24)">
                    <input
                      type="text"
                      value={p.sharedAdjustmentNos}
                      onChange={(e) => update(i, { sharedAdjustmentNos: e.target.value })}
                      placeholder="공용 조정률 번호 (선택)"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </FieldCard>
                </>
              )}
            </>
          )}
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={add} className="w-full">
        + 부분 추가
      </Button>

      {/* 부속시설 종류별 면적 — 계산서 Ⅳ·Ⅴ */}
      <div className="rounded-md border border-violet-200 bg-violet-50/40 p-2.5 space-y-2">
        <p className="text-xs font-semibold text-violet-700">부속시설 면적 (주차장·기계실 등 — 선택)</p>
        <div className="grid grid-cols-2 gap-2">
          {ANCILLARY_FIELDS.map((a) => {
            const hasArea = (parseFloat(ancillaryAreas[a.kind].replace(/,/g, "")) || 0) > 0;
            return (
              <FieldCard key={a.kind} label={a.label} className="sm:grid-cols-[72px_1fr]">
                <div className="flex items-center gap-1.5">
                  <DecimalInput value={ancillaryAreas[a.kind]} onChange={(v) => setAnc(a.kind, v)} unit="㎡" placeholder={`${a.label} 면적`} />
                  {hasArea && (
                    <input
                      type="text"
                      value={ancillaryFloors[a.kind]}
                      onChange={(e) => setAncFloor(a.kind, e.target.value)}
                      placeholder="층(예 지하1)"
                      className="w-24 shrink-0 rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  )}
                </div>
              </FieldCard>
            );
          })}
        </div>
        {hasShared && !forTransfer && (
          <p className="rounded-md bg-violet-50 px-2.5 py-1.5 text-[11px] text-violet-700">
            부속시설은 각 부분 주용도 면적비율로 안분됩니다. 안분받을 부분에 위 「공용 조정률」을 입력하세요.
          </p>
        )}
        {hasShared && forTransfer && (
          <p className="rounded-md bg-violet-50 px-2.5 py-1.5 text-[11px] text-violet-700">
            부속시설은 전 부분 주용도 면적비율로 안분됩니다(양도 조정률 미적용).
          </p>
        )}
      </div>
    </div>
  );
}
