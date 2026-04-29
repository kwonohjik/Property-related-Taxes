"use client";

/**
 * 검용주택 + 개별주택가격 미공시 (§164⑤) 3-시점 환산 패널
 *
 * 일반 자산용 PreHousingDisclosureSection과 동일한 PHD 알고리즘을 사용하지만:
 *  - 토지 면적은 검용주택의 "주택부수토지" 면적으로 자동 계산되어 readonly 표시
 *  - 양도시 개별주택가격은 mixedTransferHousingPrice를 자동 mirror
 *
 * 법령 근거: 소득세법 시행령 §164 ⑤
 */

import { useEffect } from "react";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ThreePointStandardPriceInput } from "../ThreePointStandardPriceInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface Props {
  asset: AssetForm;
  /** 양도일 (양도시 공시지가 기준연도용) */
  transferDate: string;
  onChange: (patch: Partial<AssetForm>) => void;
}

function LegalBadge() {
  return (
    <span className="inline-flex items-center rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      소득세법 시행령 §164 ⑤
    </span>
  );
}

export function MixedUsePreHousingDisclosureSection({
  asset,
  transferDate,
  onChange,
}: Props) {
  // 주택부수토지 면적 자동 계산 (검용주택)
  const residential = parseDecimal(asset.residentialFloorArea);
  const commercial = parseDecimal(asset.nonResidentialFloorArea);
  const totalLand = parseDecimal(asset.mixedUseTotalLandArea);
  const totalFloor = residential + commercial;
  // 소수점 2자리 반올림 — 화면 표시와 계산값 일치
  const residentialLandArea = parseFloat(
    (totalFloor > 0 ? totalLand * (residential / totalFloor) : 0).toFixed(2),
  );
  const residentialLandAreaText =
    residentialLandArea > 0 ? `${residentialLandArea.toFixed(2)} ㎡` : "—";

  // 양도시 개별주택가격: 검용주택 입력(mixedTransferHousingPrice) → PHD 양도시 주택가격 자동 mirror
  // PHD 입력이 비어 있을 때만 mixed 값을 자동 채움 (사용자 수동 입력 시 보호)
  useEffect(() => {
    const mixedAmount = parseAmount(asset.mixedTransferHousingPrice);
    const phdAmount = parseAmount(asset.phdTransferHousingPrice);
    if (mixedAmount > 0 && phdAmount === 0) {
      onChange({ phdTransferHousingPrice: String(mixedAmount) });
    }
  }, [asset.mixedTransferHousingPrice, asset.phdTransferHousingPrice, onChange]);

  return (
    <div className="space-y-4 rounded-md border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">개별주택가격 미공시 취득 (3-시점 환산)</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            검용주택의 주택부분 취득시 개별주택가격을 최초 공시일 기준으로 역산합니다.
            토지면적은 주택부수토지(자동 계산)를 사용합니다.
          </p>
        </div>
        <LegalBadge />
      </div>

      {/* ① 주택부수토지 면적 (자동) */}
      <FieldCard
        label="주택부수토지 면적"
        hint="전체 토지 × 주택연면적 비율 — 자동 계산 (입력 불요)"
        unit="㎡"
      >
        <div className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm tabular-nums text-muted-foreground">
          {residentialLandAreaText}
        </div>
      </FieldCard>

      {/* ② 최초 고시일 */}
      <FieldCard
        label="최초 고시일"
        required
        hint="개별주택가격이 처음 고시된 날짜 (주택공시가격알리미 확인)"
      >
        <DateInput
          value={asset.phdFirstDisclosureDate}
          onChange={(v) => onChange({ phdFirstDisclosureDate: v })}
        />
      </FieldCard>

      {/* ③ 최초 고시 개별주택가격 P_F */}
      <FieldCard
        label="최초 고시 개별주택가격"
        required
        hint="최초 고시일 당시 공시된 개별주택가격 (원)"
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

      {/* ④ 양도시 개별주택가격 P_T (검용주택 입력과 자동 동기화) */}
      <FieldCard
        label="양도시 개별주택가격"
        required
        hint="양도일 당시 공시된 개별주택가격. 위 검용주택 영역의 양도시 개별주택공시가격과 자동 동기화"
        unit="원"
      >
        <CurrencyInput
          label=""
          value={asset.phdTransferHousingPrice || asset.mixedTransferHousingPrice}
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
          landArea={residentialLandArea > 0 ? residentialLandArea.toFixed(4) : undefined}
          // 취득시 — 토지 취득일 기준
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

      <p className="text-[11px] text-muted-foreground">
        공시지가는{" "}
        <span className="font-medium">부동산공시가격알리미(realtyprice.kr)</span>
        에서, 건물기준시가는{" "}
        <span className="font-medium">국세청 홈택스 &gt; 기준시가 조회</span>를 이용하세요.
      </p>
    </div>
  );
}
