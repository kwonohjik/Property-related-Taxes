"use client";

import { useMemo } from "react";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
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
  const acqLandPerSqm =
    parseAmount(asset.mixedAcqLandPricePerSqm) ||
    parseAmount(asset.phdLandPricePerSqmAtAcq);
  const acqCommercialLandStd = Math.floor(acqLandPerSqm * commercialLandArea);
  const acqCommercialBuilding = parseAmount(asset.mixedAcqCommercialBuildingPrice) ?? 0;
  const acqCommercialTotal = acqCommercialLandStd + acqCommercialBuilding;

  const fmtKrw = (v: number) => v > 0 ? `${v.toLocaleString()}` : "—";
  const fmtSqm = (v: number) => `${v.toFixed(2)}㎡`;

  // 취득 기준일: 토지 취득일 우선, 없으면 건물 취득일
  const acqReferenceDate = asset.landAcquisitionDate || asset.acquisitionDate;

  // Case A 4부분 안분 — 최초공시일 < 용도변경일
  const isCaseA = useMemo(() => {
    if (!asset.hasPartialUsageChange || asset.partialChangeDirection !== "house_to_commercial") return false;
    if (!asset.phdFirstDisclosureDate || !asset.partialChangeDate) return false;
    const fd = new Date(asset.phdFirstDisclosureDate);
    const uc = new Date(asset.partialChangeDate);
    return !isNaN(fd.getTime()) && !isNaN(uc.getTime()) && fd < uc;
  }, [asset.hasPartialUsageChange, asset.partialChangeDirection, asset.phdFirstDisclosureDate, asset.partialChangeDate]);

  // Case A 4부분: 공시지가 × 각 토지면적 자동 계산
  const transferLandPerSqmForFour = parseAmount(
    asset.phdLandPricePerSqmAtTransfer || asset.mixedTransferLandPricePerSqm,
  );
  const transferHousingLandStd = Math.floor(transferLandPerSqmForFour * residentialLandArea);
  const transferCommercialLandStdFour = Math.floor(transferLandPerSqmForFour * commercialLandArea);
  const transferHousingBuildingStd = parseAmount(asset.phdBuildingStdPriceAtTransfer) ?? 0;
  const transferFourPartTotal =
    transferHousingLandStd + transferHousingBuildingStd + transferCommercialLandStdFour + transferCommercialBuilding;

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

        {isCaseA ? (
          /* Case A 4부분 통합 레이아웃 — 이미지 12와 동일 구조 */
          <>
            <LandPriceLookupField
              pricePerSqm={asset.phdLandPricePerSqmAtTransfer || asset.mixedTransferLandPricePerSqm}
              onPricePerSqmChange={(v) => {
                onChange({ phdLandPricePerSqmAtTransfer: v, mixedTransferLandPricePerSqm: v });
              }}
              area={totalLand > 0 ? totalLand : undefined}
              referenceDate={transferDate}
              jibun={jibun}
              label="공시지가 (원/㎡)"
              hint="주택+상가 전체 토지 공시지가"
              placeholder="양도시 개별공시지가 /㎡"
            />
            {(residentialLandArea > 0 || commercialLandArea > 0) && (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-emerald-200 bg-emerald-50/40 px-3 py-2 text-xs">
                  <p className="text-emerald-700 font-medium">주택분 토지기준시가</p>
                  <p className="font-mono text-sm mt-1 text-emerald-900">{fmtKrw(transferHousingLandStd)}</p>
                  <p className="text-[10px] text-emerald-600">공시지가 × 주택부수토지 ({fmtSqm(residentialLandArea)})</p>
                </div>
                <div className="rounded-md border border-emerald-200 bg-emerald-50/40 px-3 py-2 text-xs">
                  <p className="text-emerald-700 font-medium">상가분 토지기준시가</p>
                  <p className="font-mono text-sm mt-1 text-emerald-900">{fmtKrw(transferCommercialLandStdFour)}</p>
                  <p className="text-[10px] text-emerald-600">공시지가 × 상가부수토지 ({fmtSqm(commercialLandArea)})</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <FieldCard label="* 주택건물 기준시가" hint="홈택스 — 양도시 주택 부분에 해당하는 면적의 당시 건물 기준시가">
                <CurrencyInput
                  label=""
                  value={asset.phdBuildingStdPriceAtTransfer}
                  onChange={(v) => onChange({ phdBuildingStdPriceAtTransfer: v })}
                  placeholder="원"
                  hideUnit
                />
              </FieldCard>
              <FieldCard label="* 상가건물 기준시가" hint="홈택스 — 양도시 상가 부분에 해당하는 면적의 당시 건물 기준시가">
                <CurrencyInput
                  label=""
                  value={asset.mixedTransferCommercialBuildingPrice}
                  onChange={(v) => onChange({ mixedTransferCommercialBuildingPrice: v })}
                  placeholder="원"
                  hideUnit
                />
              </FieldCard>
            </div>
            <div className="rounded-lg bg-emerald-100/60 border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-900 flex justify-between">
              <span>4부분 합산기준시가 (주택분토지+주택건물+상가분토지+상가건물)</span>
              <span>{fmtKrw(transferFourPartTotal)}</span>
            </div>
          </>
        ) : (
          /* 일반(비-Case A) 레이아웃 — 기존 유지 */
          <>
            <FieldCard
              label="상가건물 기준시가"
              hint="토지 제외 — 국세청 홈택스 > 기준시가 조회 (개별주택가격확인서에 미포함)"
            >
              <CurrencyInput
                label=""
                value={asset.mixedTransferCommercialBuildingPrice}
                onChange={(v) => onChange({ mixedTransferCommercialBuildingPrice: v })}
                placeholder="양도시 상가건물 기준시가"
              />
            </FieldCard>
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
          </>
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
        <ToggleCard
          tone="amber"
          size="sm"
          title="취득 당시 개별주택가격 미공시 (§164⑤ 3-시점 환산)"
          description={
            useEstimatedAcquisition
              ? "1996년 최초 고시 이전 취득 시 활성화"
              : "활성화 시 환산취득가 모드로 자동 전환"
          }
          checked={!!asset.usePreHousingDisclosure}
          onCheckedChange={(checked) => {
            onChange({
              usePreHousingDisclosure: checked,
              // PHD는 환산취득가 모드에서만 의미 있으므로 체크 시 자동 전환
              ...(checked ? { useEstimatedAcquisition: true } : {}),
            });
          }}
        >
          <MixedUsePreHousingDisclosureSection
            asset={asset}
            transferDate={transferDate ?? ""}
            onChange={onChange}
          />
        </ToggleCard>

        {/* Case A 시 모든 입력은 PHD ① 취득시 4부분 블록으로 통합 — 중복 표시 제거 */}
        {!isCaseA && (
          <>
            {/* direction === "house_to_commercial" 시 개별주택공시가격은 PHD에서 처리 또는 직접 입력 (둘 다 가능).
                direction === "commercial_to_house" 시 취득시 주택이 없었으므로 hidden. */}
            {asset.partialChangeDirection !== "commercial_to_house" &&
              !asset.usePreHousingDisclosure && (
                <FieldCard label="개별주택공시가격" hint="미공시 시 비워두세요 — 위 §164⑤ 토글 사용">
                  <CurrencyInput
                    label=""
                    value={asset.mixedAcqHousingPrice}
                    onChange={(v) => onChange({ mixedAcqHousingPrice: v })}
                    placeholder="취득시 개별주택공시가격 (미공시 시 빈값)"
                  />
                </FieldCard>
              )}

            {/* 취득시 상가건물 기준시가 — 직접 입력 */}
            <FieldCard
              label="취득시 상가건물 기준시가"
              hint={
                asset.partialChangeDirection === "house_to_commercial"
                  ? "취득 당시 동일 건물의 국세청 고시 기준시가 — 직접 조회·입력 (필수)"
                  : "토지 제외 — 국세청 홈택스 > 기준시가 조회 (필수)"
              }
            >
              <CurrencyInput
                label=""
                value={asset.mixedAcqCommercialBuildingPrice}
                onChange={(v) => onChange({ mixedAcqCommercialBuildingPrice: v })}
                placeholder="취득시 상가건물 기준시가 (필수)"
              />
            </FieldCard>

            <LandPriceLookupField
              pricePerSqm={asset.mixedAcqLandPricePerSqm || asset.phdLandPricePerSqmAtAcq}
              onPricePerSqmChange={(v) => onChange({ mixedAcqLandPricePerSqm: v })}
              area={commercialLandArea > 0 ? commercialLandArea : undefined}
              referenceDate={acqReferenceDate}
              jibun={jibun}
              label="취득시 개별공시지가(상가)(원/㎡)"
              hint={
                asset.partialChangeDirection === "house_to_commercial"
                  ? "취득 당시 동일 토지의 개별공시지가 — 직접 조회·입력 (필수)"
                  : "상가부수토지 기준시가 자동 계산용 (필수)"
              }
              placeholder="취득시 개별공시지가 /㎡"
            />

            {asset.hasPartialUsageChange && asset.partialChangeDirection === "house_to_commercial" && (
              <div className="rounded-lg bg-amber-100/60 border border-amber-200 px-3 py-2 text-xs text-amber-900 space-y-1">
                <p>
                  ℹ 취득시점에는 전체가 주택이었으므로 상가 부분 기준시가가 직접 존재하지 않습니다.
                  취득 당시 동일 건물의 국세청 고시 기준시가와 개별공시지가를 <strong>직접 조회하여 입력</strong>해야 합니다.
                </p>
                <p>
                  두 값 중 하나라도 미입력이면 계산을 진행할 수 없습니다 (시행령 §166⑥ + 집행기준 99-164-10).
                </p>
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <LawArticleModal legalBasis="소득세법 시행령 §166⑥" label="§166⑥ 안분" />
                </div>
              </div>
            )}
            {asset.hasPartialUsageChange && asset.partialChangeDirection === "commercial_to_house" && (
              <div className="rounded-lg bg-amber-100/60 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                ℹ 취득시점에 주택이 존재하지 않음 — 개별주택공시가격 입력 불필요. 취득시 상가건물 기준시가 + 개별공시지가를 입력하면 양도시 면적비율로 안분되어 취득시 주택부분 기준시가를 산정합니다.
              </div>
            )}

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
          </>
        )}
      </div>
    </div>
  );
}
