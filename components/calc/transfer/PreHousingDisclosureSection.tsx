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
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ThreePointStandardPriceInput } from "./ThreePointStandardPriceInput";
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
    <span className="inline-flex items-center rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
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

// 주택유형별 최초고시일 안내 텍스트
const FIRST_DISCLOSURE_GUIDE: Record<HousingType, string> = {
  individual: "개별주택가격이 처음으로 고시된 날짜 — 단독주택 최초고시 2005.4.30 (주택공시가격알리미 확인)",
  apartment:  "공동주택가격이 처음으로 고시된 날짜 — 아파트 최초고시 1993.2.1 또는 1990.4.30 (주택공시가격알리미 확인)",
};

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

      {/* ① 토지 면적 */}
      <FieldCard
        label="토지 면적"
        required
        hint="단위공시지가(원/㎡) × 면적으로 기준시가 계산 — 등기부등본의 토지 면적 기재"
        unit="㎡"
      >
        <input
          type="number"
          min="0"
          step="0.01"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="토지 면적 입력"
          value={asset.acquisitionArea}
          onChange={(e) => onChange({ acquisitionArea: e.target.value })}
        />
      </FieldCard>

      {/* ② 최초 고시일 */}
      <FieldCard
        label="최초 고시일"
        required
        hint={FIRST_DISCLOSURE_GUIDE[housingType]}
      >
        <DateInput
          value={asset.phdFirstDisclosureDate}
          onChange={(v) => onChange({ phdFirstDisclosureDate: v })}
        />
      </FieldCard>

      {/* ③ 최초 고시 주택공시가격 P_F */}
      <FieldCard
        label={priceLabel.first}
        required
        hint="최초 고시일 당시 공시된 주택공시가격 (원) — 부동산공시가격알리미(realtyprice.kr) 조회"
        unit="원"
      >
        <CurrencyInput
          label=""
          value={asset.phdFirstDisclosureHousingPrice}
          onChange={(v) => onChange({ phdFirstDisclosureHousingPrice: v })}
          placeholder="원"
          hideUnit
          required
        />
      </FieldCard>

      {/* ④ 양도시 주택공시가격 P_T */}
      <FieldCard
        label={priceLabel.transfer}
        required
        hint="양도일 당시 공시된 주택공시가격 P_T (원) — 양도일 기준 부동산공시가격알리미 조회"
        unit="원"
      >
        <CurrencyInput
          label=""
          value={asset.phdTransferHousingPrice}
          onChange={(v) => onChange({ phdTransferHousingPrice: v })}
          placeholder="원"
          hideUnit
          required
        />
      </FieldCard>

      {/* ⑤ 3-시점 기준시가 입력 */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">
          3시점 기준시가 입력 — 토지 단위 공시지가(원/㎡) + 건물 기준시가(원)
        </p>
        <ThreePointStandardPriceInput
          jibun={asset.addressJibun || undefined}
          landArea={asset.acquisitionArea || undefined}
          // 취득시 — PHD는 토지 취득일 기준 (건물과 다를 수 있음)
          acquisitionDate={asset.landAcquisitionDate || asset.acquisitionDate}
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

      {/* 안내 문구 */}
      <div className="space-y-1 text-[11px] text-muted-foreground">
        <p>
          주택공시가격은{" "}
          <span className="font-medium">부동산공시가격알리미(realtyprice.kr)</span>
          에서 조회하실 수 있습니다.
        </p>
        <p>
          건물기준시가(원)는{" "}
          <span className="font-medium">국세청 홈택스 &gt; 기준시가 조회</span>에서
          연도별 값을 직접 확인 후 입력하세요.
          {housingType === "apartment" && (
            <span className="block mt-0.5 text-amber-700">
              공동주택(아파트)의 경우 최초고시 이전 취득 시 1993.2.1 또는 1990.4.30이 최초고시일에 해당합니다.
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
