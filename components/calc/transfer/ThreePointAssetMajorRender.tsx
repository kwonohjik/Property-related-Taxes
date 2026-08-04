"use client";

/**
 * 겸용주택 Case A — 자산-우선(주택/상가) 전치 렌더.
 *
 * `ThreePointStandardPriceInput`의 `layout="asset-major"`에서 3-PointBlock(시점) 대신
 * 렌더. 토지 3시점(공유)은 `PointBlock` landOnly 모드로 재사용(연도·조회·공시지가 로직 공유),
 * 주택/상가 건물은 자산별 섹션에 3시점 배치. 자산분 토지 auto는 공용 헬퍼로 계산(표시전용).
 * 건물 6값 산출은 주택/상가 섹션 헤더의 `MultiPointBuildingStdPriceModal` 런처 2개가 담당(D1) —
 * 두 런처 모두 동일한 결합 모달을 열어 주택+상가 6값을 일관 산출(부모가 points·applyBatch 전달).
 * (계획: mixed-use-case-a-per-section-stdprice-calculator.plan.md §4)
 */
import type { ReactNode } from "react";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { landStdForArea } from "@/lib/calc/mixed-use-case";
import { PointBlock, type ThreePointStandardPriceInputProps } from "./ThreePointStandardPriceInput";
import {
  MultiPointBuildingStdPriceModal,
  type MultiPointStdPriceApply,
  type StdPricePointSpec,
} from "@/components/calc/building-std-price/MultiPointBuildingStdPriceModal";

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
  calcButton,
}: {
  label: string;
  which: "housing" | "commercial";
  points: Point[];
  area: number;
  /** 섹션 헤더 우측 건물 기준시가 계산기 런처(없으면 미표시) */
  calcButton?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700">{label} 기준시가</p>
        {calcButton}
      </div>
      {points.map((p) => {
        const building = which === "housing" ? p.housingBuilding : p.commercialBuilding;
        const onBuilding = which === "housing" ? p.onHousingBuilding : p.onCommercialBuilding;
        const landStd = landStdForArea(parseAmount(p.landPrice) || 0, area);
        const tone = SUB_TONE[p.tone];
        return (
          <div key={p.key} className={`rounded-md border p-2 space-y-1 ${tone.box}`}>
            <p className={`text-caption font-semibold ${tone.text}`}>{p.label}</p>
            <FieldCard label={`${label}건물 기준시가`}>
              <CurrencyInput
                label=""
                value={building}
                onChange={onBuilding ?? (() => {})}
                placeholder="원"
                hideUnit
              />
            </FieldCard>
            <div className="flex justify-between text-caption text-slate-600 px-1">
              <span>{label}분 토지기준시가 (자동)</span>
              <span className="font-mono tabular-nums">{fmt(landStd)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface AssetMajorBatchProps {
  /** 부모(ThreePointStandardPriceInput)가 계산한 배치 모달 3시점 메타(연도·공시지가 prefill) */
  batchPoints?: StdPricePointSpec[];
  /** 부모의 applyBatch — 주택 3 + 상가 3 + 공시지가 되돌려쓰기 라우팅 */
  onBatchApply?: (v: MultiPointStdPriceApply) => void;
}

export function ThreePointAssetMajorRender(
  props: ThreePointStandardPriceInputProps & AssetMajorBatchProps,
) {
  const housingArea = props.housingLandArea ? parseFloat(props.housingLandArea) : 0;
  const commercialArea = props.commercialLandArea ? parseFloat(props.commercialLandArea) : 0;

  // 섹션 헤더 런처(D1) — 두 버튼 모두 동일 결합 모달(주택+상가 6값·commercialAcqFirstMode).
  // asset-major는 Case A 전용이라 splitMode(=isCaseA)와 동치이나 prop에서 재파생(단일 소스).
  const splitMode = props.splitHousingCommercialForAcqAndFirst === true;
  const calcButton = (label: string, testid: string) =>
    props.enableBatchCalc && props.batchPoints && props.onBatchApply ? (
      <MultiPointBuildingStdPriceModal
        points={props.batchPoints}
        onApply={props.onBatchApply}
        enableCommercial={splitMode}
        commercialAcqFirstMode={splitMode}
        snapshotPrefix={props.stdPriceSnapshotPrefix}
        jibun={props.jibun}
        initialAddress={props.stdPriceAddress}
        housingFloorAreaPrefill={props.housingFloorArea}
        commercialFloorAreaPrefill={props.commercialFloorArea}
        buttonLabel={label}
        dataTestId={testid}
      />
    ) : undefined;

  const points: Point[] = [
    {
      key: "acq",
      label: "취득",
      tone: "amber",
      // 부수토지 공시지가 추천 = 토지 취득일(§166⑥, land value). 건물 std는 acquisitionDate(건물일) 별도.
      refDate: props.acqLandReferenceDate ?? props.acquisitionDate,
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

      <AssetSection
        label="주택"
        which="housing"
        points={points}
        area={housingArea}
        calcButton={calcButton("주택 기준시가 계산", "phd-housing-stdprice-calc")}
      />
      <AssetSection
        label="상가"
        which="commercial"
        points={points}
        area={commercialArea}
        calcButton={calcButton("상가 기준시가 계산", "phd-commercial-stdprice-calc")}
      />
    </div>
  );
}
