"use client";

/**
 * 개별주택가격 미공시 취득 시 3-시점 환산취득가 입력 패널
 *
 * 주택 취득 당시 개별주택가격이 공시되지 않은 경우, 최초 공시 시점을 기준으로
 * 취득·최초공시·양도 3시점의 기준시가를 입력해 취득시 기준시가를 역산한다.
 *
 * 법령 근거: 소득세법 시행령 §164 ⑤
 */

import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
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

export function PreHousingDisclosureSection({ asset, transferDate, onChange }: Props) {

  return (
    <div className="space-y-4 rounded-md border border-primary/30 bg-primary/5 p-4">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">개별주택가격 미공시 취득 (3-시점 환산)</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            취득 당시 개별주택가격이 공시되지 않은 경우,
            최초 공시일의 개별주택가격을 기준으로 취득시 기준시가를 역산합니다.
          </p>
        </div>
        <LegalBadge />
      </div>

      {/* ① 최초 고시일 */}
      <FieldCard
        label="최초 고시일"
        required
        hint="개별주택가격이 처음으로 고시된 날짜 (주택공시가격알리미 확인)"
      >
        <DateInput
          value={asset.phdFirstDisclosureDate}
          onChange={(v) => onChange({ phdFirstDisclosureDate: v })}
        />
      </FieldCard>

      {/* ② 최초 고시 개별주택가격 P_F */}
      <FieldCard
        label="최초 고시 개별주택가격"
        required
        hint="최초 고시일 당시 공시된 개별주택가격 P_F (원) — 주택공시가격알리미 조회"
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

      {/* ③ 양도시 개별주택가격 P_T */}
      <FieldCard
        label="양도시 개별주택가격"
        required
        hint="양도일 당시 공시된 개별주택가격 P_T (원) — 양도일 기준 공시가격알리미 조회"
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

      {/* ④ 토지 면적 — 항상 편집 가능 (주택 자산은 별도 면적 섹션이 없으므로) */}
      <FieldCard
        label="토지 면적"
        required
        hint="단위공시지가(원/㎡) × 면적으로 기준시가 계산 — 등기부등본의 토지 면적 기재"
        unit="㎡"
        warning={!asset.acquisitionArea ? "미입력 시 토지기준시가 계산 불가" : undefined}
      >
        <input
          type="number"
          min="0"
          step="0.01"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="예: 212"
          value={asset.acquisitionArea}
          onChange={(e) => onChange({ acquisitionArea: e.target.value })}
        />
      </FieldCard>

      {/* ⑤ 3-시점 기준시가 입력 */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">
          3시점 기준시가 입력 — 토지 단위 공시지가(원/㎡) + 건물 기준시가(원)
        </p>
        <ThreePointStandardPriceInput
          // 취득시
          acquisitionDate={asset.acquisitionDate}
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
      <p className="text-[11px] text-muted-foreground">
        공시지가는{" "}
        <span className="font-medium">부동산공시가격알리미(realtyprice.kr)</span>
        에서 조회하실 수 있습니다.
        건물기준시가는{" "}
        <span className="font-medium">국세청 홈택스 &gt; 기준시가 조회</span>를 이용하세요.
      </p>
    </div>
  );
}
