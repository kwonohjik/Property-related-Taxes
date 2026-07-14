"use client";

/**
 * 개별주택가격 미공시 취득 시 3-시점 환산취득가 입력 패널
 *
 * 주택 취득 당시 개별주택가격이 공시되지 않은 경우, 최초 공시 시점을 기준으로
 * 취득·최초공시·양도 3시점의 기준시가를 입력해 취득시 기준시가를 역산한다.
 *
 * 법령 근거: 소득세법 시행령 §164 ⑤
 */

import { useState } from "react";
import { DateInput } from "@/components/ui/date-input";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ThreePointStandardPriceInput } from "./ThreePointStandardPriceInput";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

// ─── Props ────────────────────────────────────────────────────────

interface Props {
  asset: AssetForm;
  transferDate: string;
  onChange: (patch: Partial<AssetForm>) => void;
}

// ─── 법령 배지 ─────────────────────────────────────────────────────

function LegalBadge() {
  return (
    <span className="inline-flex items-center rounded border border-border bg-background px-1.5 py-0.5 text-micro font-medium text-muted-foreground">
      소득세법 시행령 §164 ⑤
    </span>
  );
}

// ─── 메인 패널 ────────────────────────────────────────────────────

// ─── 주택유형 옵션 ──────────────────────────────────────────────

type HousingType = "individual" | "apartment";

const HOUSING_TYPE_OPTIONS: { value: HousingType; label: string; description: string }[] = [
  { value: "individual", label: "단독·다가구주택",  description: "개별주택가격 기준 (부동산공시가격알리미)" },
  { value: "apartment",  label: "공동주택 (아파트)", description: "공동주택가격 기준 (부동산공시가격알리미)" },
];

// 주택유형별 공시가격 라벨
const PRICE_LABEL: Record<HousingType, { first: string; transfer: string }> = {
  individual: { first: "최초 고시 개별주택가격",  transfer: "양도시 개별주택가격" },
  apartment:  { first: "최초 고시 공동주택가격",  transfer: "양도시 공동주택가격" },
};

// ─── 메인 패널 ────────────────────────────────────────────────

export function PreHousingDisclosureSection({ asset, transferDate, onChange }: Props) {
  // UI 로컬 상태 — 폼 state·API 페이로드에 포함되지 않음
  const [housingType, setHousingType] = useState<HousingType>("individual");

  const priceLabel = PRICE_LABEL[housingType];
  // 개별/공동주택 공시가격 자동조회 — StandardPriceInput 재사용 (propertyKind로 분기)
  const housePropertyKind = housingType === "apartment" ? "house_apart" : "house_individual";

  // 건물 기준시가 계산기 모달 소재지 prefill — GeneralBuildingBlock 패턴 복제
  const stdPriceAddress = {
    road: asset.addressRoad,
    jibun: asset.addressJibun,
    building: asset.buildingName,
    detail: asset.addressDetail,
    lng: asset.longitude,
    lat: asset.latitude,
  };

  return (
    <div className="space-y-4 rounded-md border border-primary/30 bg-primary/5 p-4">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">주택공시가격 미공시 취득 (3-시점 환산)</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            취득 당시 주택공시가격이 고시되지 않은 경우,
            최초 공시일의 주택공시가격을 기준으로 취득시 기준시가를 역산합니다.
          </p>
        </div>
        <LegalBadge />
      </div>

      {/* 주택유형 선택 */}
      <RadioCardGroup
        name="housingType"
        value={housingType}
        onChange={setHousingType}
        options={HOUSING_TYPE_OPTIONS}
        layout="inline"
        tone="amber"
      />

      {/* ①② 토지 면적 · 최초 고시일 (한 행) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldCard label="토지 면적" required unit="㎡" stacked>
          <DecimalInput
            placeholder="토지 면적 입력"
            value={asset.acquisitionArea}
            onChange={(v) => onChange({ acquisitionArea: v })}
          />
        </FieldCard>

        <FieldCard label="최초 고시일" required stacked>
          <DateInput
            value={asset.phdFirstDisclosureDate}
            onChange={(v) => onChange({ phdFirstDisclosureDate: v })}
          />
          {housingType === "apartment" && (
            <p className="mt-1 text-caption text-amber-700">
              공동주택(아파트)의 경우 최초고시 이전 취득 시 1993.2.1 또는 1990.4.30이 최초고시일에 해당합니다.
            </p>
          )}
        </FieldCard>
      </div>

      {/* ③④ 최초 고시 주택공시가격 P_F · 양도시 주택공시가격 P_T (한 행, StandardPriceInput 자동조회) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StandardPriceInput
          propertyKind={housePropertyKind}
          totalPrice={asset.phdFirstDisclosureHousingPrice}
          onTotalPriceChange={(v) => onChange({ phdFirstDisclosureHousingPrice: v })}
          jibun={asset.addressJibun || undefined}
          dong={asset.addressDong || undefined}
          ho={asset.addressHo || undefined}
          referenceDate={asset.phdFirstDisclosureDate}
          label={priceLabel.first}
          required
        />
        <StandardPriceInput
          propertyKind={housePropertyKind}
          totalPrice={asset.phdTransferHousingPrice}
          onTotalPriceChange={(v) => onChange({ phdTransferHousingPrice: v })}
          jibun={asset.addressJibun || undefined}
          dong={asset.addressDong || undefined}
          ho={asset.addressHo || undefined}
          referenceDate={transferDate}
          label={priceLabel.transfer}
          required
        />
      </div>

      {/* ⑤ 3-시점 기준시가 입력 */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">
          3시점 기준시가 입력 — 토지 단위 공시지가(원/㎡) + 건물 기준시가(원)
        </p>
        <ThreePointStandardPriceInput
          jibun={asset.addressJibun || undefined}
          landArea={asset.acquisitionArea || undefined}
          stdPriceSnapshotPrefix={`bsp-${asset.assetId}-phd`}
          stdPriceAddress={stdPriceAddress}
          enableBatchCalc
          // 건물 기준시가·batch·신축연도는 건물 취득일 기준(건물 std valuationYear ≥ 신축연도).
          // 단, 취득 부수토지 개별공시지가는 토지 취득일 기준(§166⑥, 부수토지 기준시가 = 공시지가 × 면적의
          // land value — 건물 위치지수용 아님) → acqLandReferenceDate로 분리(2026-07-11, B안).
          acquisitionDate={asset.acquisitionDate}
          acqLandReferenceDate={asset.landAcquisitionDate || asset.acquisitionDate}
          landPriceYearAtAcq={asset.phdLandPriceYearAtAcq}
          landPriceYearAtAcqIsManual={asset.phdLandPriceYearAtAcqIsManual}
          onLandPriceYearAtAcqChange={(year, isManual) =>
            onChange({ phdLandPriceYearAtAcq: year, phdLandPriceYearAtAcqIsManual: isManual })
          }
          landPricePerSqmAtAcq={asset.phdLandPricePerSqmAtAcq}
          onLandPricePerSqmAtAcqChange={(v) => onChange({ phdLandPricePerSqmAtAcq: v })}
          buildingStdPriceAtAcq={asset.phdBuildingStdPriceAtAcq}
          onBuildingStdPriceAtAcqChange={(v) => onChange({ phdBuildingStdPriceAtAcq: v })}
          // 최초공시일
          firstDisclosureDate={asset.phdFirstDisclosureDate}
          landPriceYearAtFirst={asset.phdLandPriceYearAtFirst}
          landPriceYearAtFirstIsManual={asset.phdLandPriceYearAtFirstIsManual}
          onLandPriceYearAtFirstChange={(year, isManual) =>
            onChange({ phdLandPriceYearAtFirst: year, phdLandPriceYearAtFirstIsManual: isManual })
          }
          landPricePerSqmAtFirst={asset.phdLandPricePerSqmAtFirst}
          onLandPricePerSqmAtFirstChange={(v) => onChange({ phdLandPricePerSqmAtFirst: v })}
          buildingStdPriceAtFirst={asset.phdBuildingStdPriceAtFirst}
          onBuildingStdPriceAtFirstChange={(v) => onChange({ phdBuildingStdPriceAtFirst: v })}
          // 양도시
          transferDate={transferDate}
          landPriceYearAtTransfer={asset.phdLandPriceYearAtTransfer}
          landPriceYearAtTransferIsManual={asset.phdLandPriceYearAtTransferIsManual}
          onLandPriceYearAtTransferChange={(year, isManual) =>
            onChange({
              phdLandPriceYearAtTransfer: year,
              phdLandPriceYearAtTransferIsManual: isManual,
            })
          }
          landPricePerSqmAtTransfer={asset.phdLandPricePerSqmAtTransfer}
          onLandPricePerSqmAtTransferChange={(v) => onChange({ phdLandPricePerSqmAtTransfer: v })}
          buildingStdPriceAtTransfer={asset.phdBuildingStdPriceAtTransfer}
          onBuildingStdPriceAtTransferChange={(v) =>
            onChange({ phdBuildingStdPriceAtTransfer: v })
          }
        />
      </div>
    </div>
  );
}
