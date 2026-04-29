"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { MixedUsePreHousingDisclosureSection } from "./MixedUsePreHousingDisclosureSection";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  useEstimatedAcquisition?: boolean;
  transferSectionNum?: number;
  acqSectionNum?: number;
  /** 소재지 지번 주소 — Vworld 공시지가 조회용 */
  jibun?: string;
}

/** 양도시·취득시 기준시가 입력 + 자동 계산 표시 */
export function MixedUseStandardPriceInputs({
  asset,
  onChange,
  transferDate,
  useEstimatedAcquisition,
  transferSectionNum,
  acqSectionNum,
  jibun,
}: Props) {
  const residential = parseDecimal(asset.residentialFloorArea);
  const commercial = parseDecimal(asset.nonResidentialFloorArea);
  const totalFloor = residential + commercial;
  const totalLand = parseDecimal(asset.mixedUseTotalLandArea);

  // 소수점 2자리 반올림 — 화면 표시(toFixed(2))와 계산값 일치 (불일치 시 76.51표시/76.508계산 버그)
  const commercialLandArea = parseFloat(
    (totalFloor > 0 ? totalLand * (commercial / totalFloor) : 0).toFixed(2),
  );
  const residentialLandArea = parseFloat((totalLand - commercialLandArea).toFixed(2));

  // 양도시 상가부분 자동 계산
  const transferLandPerSqm = parseAmount(asset.mixedTransferLandPricePerSqm) ?? 0;
  const transferCommercialLandStd = Math.floor(transferLandPerSqm * commercialLandArea);
  const transferCommercialBuilding = parseAmount(asset.mixedTransferCommercialBuildingPrice) ?? 0;
  const transferCommercialTotal = transferCommercialLandStd + transferCommercialBuilding;

  // 취득시 상가부분 자동 계산
  const acqLandPerSqm = parseAmount(asset.mixedAcqLandPricePerSqm) ?? 0;
  const acqCommercialLandStd = Math.floor(acqLandPerSqm * commercialLandArea);
  const acqCommercialBuilding = parseAmount(asset.mixedAcqCommercialBuildingPrice) ?? 0;
  const acqCommercialTotal = acqCommercialLandStd + acqCommercialBuilding;

  const fmtKrw = (v: number) => v > 0 ? `${v.toLocaleString()}원` : "—";
  const fmtSqm = (v: number) => `${v.toFixed(2)}㎡`;

  // 취득 기준일: 토지 취득일 우선, 없으면 건물 취득일
  const acqReferenceDate = asset.landAcquisitionDate || asset.acquisitionDate;

  return (
    <div className="space-y-3">
      {/* ── 양도시 기준시가 ─────────────────────────── */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          {transferSectionNum !== undefined && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-[10px] font-bold text-emerald-800 select-none">
              {transferSectionNum}
            </span>
          )}
          <p className="text-xs font-semibold text-emerald-700">양도시 기준시가</p>
        </div>

        <FieldCard label="개별주택공시가격" hint="주택건물+주택부수토지 일괄">
          <CurrencyInput
            label=""
            value={asset.mixedTransferHousingPrice}
            onChange={(v) => onChange({ mixedTransferHousingPrice: v })}
            placeholder="양도시 개별주택공시가격"
          />
        </FieldCard>

        <FieldCard label="상가건물 기준시가" hint="토지 제외 — 국세청 기준시가">
          <CurrencyInput
            label=""
            value={asset.mixedTransferCommercialBuildingPrice}
            onChange={(v) => onChange({ mixedTransferCommercialBuildingPrice: v })}
            placeholder="양도시 상가건물 기준시가"
          />
        </FieldCard>

        {/* 개별공시지가 — LandPriceLookupField: 연도 선택 + 조회 버튼 + 토지기준시가 자동 계산 */}
        <LandPriceLookupField
          pricePerSqm={asset.mixedTransferLandPricePerSqm}
          onPricePerSqmChange={(v) => onChange({ mixedTransferLandPricePerSqm: v })}
          area={commercialLandArea > 0 ? commercialLandArea : undefined}
          referenceDate={transferDate}
          jibun={jibun}
          label="개별공시지가 (원/㎡)"
          hint="상가부수토지 산정용"
          placeholder="양도시 개별공시지가 /㎡"
        />

        {commercialLandArea > 0 && (
          <div className="rounded-lg bg-emerald-100/60 border border-emerald-200 px-3 py-2 text-sm space-y-1">
            <div className="flex justify-between text-xs text-emerald-700">
              <span>상가부수토지 면적</span>
              <span>{fmtSqm(commercialLandArea)}</span>
            </div>
            <div className="flex justify-between text-xs text-emerald-700">
              <span>상가부수토지 기준시가 (자동)</span>
              <span>{fmtKrw(transferCommercialLandStd)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold text-emerald-900">
              <span>상가부분 기준시가 합계 (자동)</span>
              <span>{fmtKrw(transferCommercialTotal)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── 취득시 기준시가 ─────────────────────────── */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          {acqSectionNum !== undefined && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800 select-none">
              {acqSectionNum}
            </span>
          )}
          <p className="text-xs font-semibold text-amber-700">취득시 기준시가</p>
        </div>

        {/* PHD 토글 — 항상 표시. 체크 시 환산취득가 모드 자동 전환 */}
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-amber-400 bg-white/60 px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={!!asset.usePreHousingDisclosure}
            onChange={(e) => {
              const checked = e.target.checked;
              onChange({
                usePreHousingDisclosure: checked,
                // PHD는 환산취득가 모드에서만 의미 있으므로 체크 시 자동 전환
                ...(checked ? { useEstimatedAcquisition: true } : {}),
              });
            }}
            className="rounded border-border"
          />
          <span className="font-medium text-amber-800">취득 당시 개별주택가격 미공시 (§164⑤ 3-시점 환산)</span>
          <span className="text-xs text-amber-600">
            {useEstimatedAcquisition
              ? "1996년 최초 고시 이전 취득 시 활성화"
              : "활성화 시 환산취득가 모드로 자동 전환"}
          </span>
        </label>

        {asset.usePreHousingDisclosure ? (
          <MixedUsePreHousingDisclosureSection
            asset={asset}
            transferDate={transferDate ?? ""}
            onChange={onChange}
          />
        ) : (
          <FieldCard label="개별주택공시가격" hint="미공시 시 비워두세요 — 위 §164⑤ 토글 사용">
            <CurrencyInput
              label=""
              value={asset.mixedAcqHousingPrice}
              onChange={(v) => onChange({ mixedAcqHousingPrice: v })}
              placeholder="취득시 개별주택공시가격 (미공시 시 빈값)"
            />
          </FieldCard>
        )}

        <FieldCard label="취득시 상가건물 기준시가">
          <CurrencyInput
            label=""
            value={asset.mixedAcqCommercialBuildingPrice}
            onChange={(v) => onChange({ mixedAcqCommercialBuildingPrice: v })}
            placeholder="취득시 상가건물 기준시가"
          />
        </FieldCard>

        {/* 개별공시지가 — LandPriceLookupField: 연도 선택 + 조회 버튼 + 토지기준시가 자동 계산 */}
        <LandPriceLookupField
          pricePerSqm={asset.mixedAcqLandPricePerSqm}
          onPricePerSqmChange={(v) => onChange({ mixedAcqLandPricePerSqm: v })}
          area={commercialLandArea > 0 ? commercialLandArea : undefined}
          referenceDate={acqReferenceDate}
          jibun={jibun}
          label="취득시 개별공시지가(상가)(원/㎡)"
          placeholder="취득시 개별공시지가 /㎡"
        />

        {(acqCommercialLandStd > 0 || acqCommercialBuilding > 0) && (
          <div className="rounded-lg bg-amber-100/60 border border-amber-200 px-3 py-2 text-sm space-y-1">
            <div className="flex justify-between text-xs text-amber-700">
              <span>취득시 상가부수토지 기준시가 (자동)</span>
              <span>{fmtKrw(acqCommercialLandStd)}</span>
            </div>
            {acqCommercialBuilding > 0 && (
              <div className="flex justify-between text-sm font-semibold text-amber-900">
                <span>취득시 상가부분 기준시가 합계 (자동)</span>
                <span>{fmtKrw(acqCommercialTotal)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
