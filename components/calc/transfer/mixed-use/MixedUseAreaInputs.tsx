"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  sectionNum?: number;
}

/** 면적 입력 (주택연면적·상가연면적·정착면적·토지면적 + 주택비율 자동표시) */
export function MixedUseAreaInputs({ asset, onChange, sectionNum }: Props) {
  const residential = parseDecimal(asset.residentialFloorArea) ?? 0;
  const commercial = parseDecimal(asset.nonResidentialFloorArea) ?? 0;
  const total = residential + commercial;
  const housingRatioText =
    total > 0 ? `${((residential / total) * 100).toFixed(2)}%` : "—";

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        {sectionNum !== undefined && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">
            {sectionNum}
          </span>
        )}
        <p className="text-xs font-semibold text-sky-700">면적 정보 (건축물대장 기준)</p>
      </div>

      <FieldCard
        label="주택 연면적 (산정면적, ㎡)"
        hint="개별주택가격확인서의 '산정면적' — 양도시 주거용 합계 (예: 1층 단독주택)"
      >
        <DecimalInput
          value={asset.residentialFloorArea}
          onChange={(v) => onChange({ residentialFloorArea: v })}
          placeholder="양도시 주거용 합계 면적"
          unit="㎡"
        />
      </FieldCard>

      <FieldCard
        label="상가 연면적 (㎡)"
        hint="비주택 합계 — 근린생활시설·사무·주차장 (양도시점 기준)"
      >
        <DecimalInput
          value={asset.nonResidentialFloorArea}
          onChange={(v) => onChange({ nonResidentialFloorArea: v })}
          placeholder="양도시 비주택 합계 면적"
          unit="㎡"
        />
      </FieldCard>

      <FieldCard
        label="건물 정착면적 (수평 투영면적, ㎡)"
        hint="건축물대장의 건축면적(수평 투영면적) — 부수토지 배율(3·5·10배) 초과 판정 기준"
      >
        <DecimalInput
          value={asset.buildingFootprintArea}
          onChange={(v) => onChange({ buildingFootprintArea: v })}
          placeholder="건축물대장의 건축면적"
          unit="㎡"
        />
      </FieldCard>

      <FieldCard label="전체 토지 면적 (㎡)">
        <DecimalInput
          value={asset.mixedUseTotalLandArea}
          onChange={(v) => onChange({ mixedUseTotalLandArea: v })}
          placeholder="전체 토지 면적"
          unit="㎡"
        />
      </FieldCard>

      {total > 0 && (
        <div className="px-3 py-2 rounded-lg bg-sky-100/60 text-sm border border-sky-200">
          <span className="text-sky-700">주택연면적 비율: </span>
          <span className="font-semibold text-sky-900">{housingRatioText}</span>
        </div>
      )}
    </div>
  );
}
