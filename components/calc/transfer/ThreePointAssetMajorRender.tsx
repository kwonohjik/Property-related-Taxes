"use client";

/**
 * 겸용주택 Case A — 자산-우선(주택/상가) 전치 렌더.
 *
 * `ThreePointStandardPriceInput`의 `layout="asset-major"`에서 3-PointBlock(시점) 대신
 * 렌더. 토지 3시점(공유)은 `PointBlock` landOnly 모드로 재사용(연도·조회·공시지가 로직 공유),
 * 주택/상가 건물은 자산별 섹션에 3시점 배치. 자산분 토지 auto는 공용 헬퍼로 계산(표시전용).
 * 건물 6값 산출은 부모의 `PhdBuildingStdPriceModalButton`(배치)이 담당 → 여기선 값 입력만.
 */
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { landStdForArea } from "@/lib/calc/mixed-use-case";
import { PointBlock, type ThreePointStandardPriceInputProps } from "./ThreePointStandardPriceInput";

type Tone = "amber" | "violet" | "emerald";

const SUB_TONE: Record<Tone, { box: string; text: string }> = {
  amber: { box: "border-amber-200 bg-amber-50/40", text: "text-amber-700" },
  violet: { box: "border-violet-200 bg-violet-50/40", text: "text-violet-700" },
  emerald: { box: "border-emerald-200 bg-emerald-50/40", text: "text-emerald-700" },
};

interface Point {
  key: string;
  label: string;
  tone: Tone;
  refDate: string;
  year: string;
  yearManual: boolean;
  onYear: (year: string, isManual: boolean) => void;
  landPrice: string;
  onLandPrice: (v: string) => void;
  housingBuilding: string;
  onHousingBuilding: (v: string) => void;
  commercialBuilding: string;
  onCommercialBuilding?: (v: string) => void;
}

const fmt = (n: number | null) => (n && n > 0 ? n.toLocaleString() : "—");

function AssetSection({
  label,
  which,
  points,
  area,
}: {
  label: string;
  which: "housing" | "commercial";
  points: Point[];
  area: number;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
      <p className="text-xs font-semibold text-slate-700">{label} 기준시가</p>
      {points.map((p) => {
        const building = which === "housing" ? p.housingBuilding : p.commercialBuilding;
        const onBuilding = which === "housing" ? p.onHousingBuilding : p.onCommercialBuilding;
        const landStd = landStdForArea(parseAmount(p.landPrice) || 0, area);
        const tone = SUB_TONE[p.tone];
        return (
          <div key={p.key} className={`rounded-md border p-2 space-y-1 ${tone.box}`}>
            <p className={`text-[11px] font-semibold ${tone.text}`}>{p.label}</p>
            <FieldCard label={`${label}건물 기준시가`} hint="국세청 홈택스 > 기준시가 조회">
              <CurrencyInput
                label=""
                value={building}
                onChange={onBuilding ?? (() => {})}
                placeholder="원"
                hideUnit
              />
            </FieldCard>
            <div className="flex justify-between text-[11px] text-slate-600 px-1">
              <span>{label}분 토지기준시가 (자동)</span>
              <span className="font-mono tabular-nums">{fmt(landStd)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ThreePointAssetMajorRender(props: ThreePointStandardPriceInputProps) {
  const housingArea = props.housingLandArea ? parseFloat(props.housingLandArea) : 0;
  const commercialArea = props.commercialLandArea ? parseFloat(props.commercialLandArea) : 0;

  const points: Point[] = [
    {
      key: "acq",
      label: "취득",
      tone: "amber",
      refDate: props.acquisitionDate,
      year: props.landPriceYearAtAcq,
      yearManual: props.landPriceYearAtAcqIsManual,
      onYear: props.onLandPriceYearAtAcqChange,
      landPrice: props.landPricePerSqmAtAcq,
      onLandPrice: props.onLandPricePerSqmAtAcqChange,
      housingBuilding: props.buildingStdPriceAtAcq,
      onHousingBuilding: props.onBuildingStdPriceAtAcqChange,
      commercialBuilding: props.commercialBuildingStdPriceAtAcq ?? "",
      onCommercialBuilding: props.onCommercialBuildingStdPriceAtAcqChange,
    },
    {
      key: "first",
      label: "최초공시",
      tone: "violet",
      refDate: props.firstDisclosureDate,
      year: props.landPriceYearAtFirst,
      yearManual: props.landPriceYearAtFirstIsManual,
      onYear: props.onLandPriceYearAtFirstChange,
      landPrice: props.landPricePerSqmAtFirst,
      onLandPrice: props.onLandPricePerSqmAtFirstChange,
      housingBuilding: props.buildingStdPriceAtFirst,
      onHousingBuilding: props.onBuildingStdPriceAtFirstChange,
      commercialBuilding: props.commercialBuildingStdPriceAtFirst ?? "",
      onCommercialBuilding: props.onCommercialBuildingStdPriceAtFirstChange,
    },
    {
      key: "transfer",
      label: "양도",
      tone: "emerald",
      refDate: props.transferDate,
      year: props.landPriceYearAtTransfer,
      yearManual: props.landPriceYearAtTransferIsManual,
      onYear: props.onLandPriceYearAtTransferChange,
      landPrice: props.landPricePerSqmAtTransfer,
      onLandPrice: props.onLandPricePerSqmAtTransferChange,
      housingBuilding: props.buildingStdPriceAtTransfer,
      onHousingBuilding: props.onBuildingStdPriceAtTransferChange,
      commercialBuilding: props.commercialBuildingStdPriceAtTransfer ?? "",
      onCommercialBuilding: props.onCommercialBuildingStdPriceAtTransferChange,
    },
  ];

  return (
    <div className="space-y-3">
      {/* 토지 개별공시지가 3시점 (주택·상가 공유) — PointBlock landOnly 재사용 */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
        <p className="text-xs font-semibold text-slate-700">토지 개별공시지가 (3시점 · 주택·상가 공유)</p>
        {points.map((p) => (
          <PointBlock
            key={p.key}
            landOnly
            label={`${p.label} 공시지가`}
            tone={p.tone}
            referenceDate={p.refDate}
            selectedYear={p.year}
            isManual={p.yearManual}
            onYearChange={p.onYear}
            landPricePerSqm={p.landPrice}
            onLandPricePerSqmChange={p.onLandPrice}
            buildingStdPrice=""
            onBuildingStdPriceChange={() => {}}
            jibun={props.jibun}
          />
        ))}
      </div>

      <AssetSection label="주택" which="housing" points={points} area={housingArea} />
      <AssetSection label="상가" which="commercial" points={points} area={commercialArea} />
    </div>
  );
}
