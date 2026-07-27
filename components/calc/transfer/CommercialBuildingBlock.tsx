"use client";

/**
 * CommercialBuildingBlock — 상업용건물·오피스텔 환산취득가 입력 섹션
 *
 * assetKind === "commercial_building" + useEstimatedAcquisition 진입 시 렌더.
 * 소득세법 시행령 §164⑥ (호별고시 전 취득 역환산) + §176조의2②2호 (환산취득가).
 *
 * 구조:
 *  ① 면적 섹션 (sky)
 *  ② 호별 ㎡당 고시가 (amber/emerald)
 *  ③ 건물 기준시가 3시점 — 총액 (pre_disclosure 시만, amber+emerald)
 *  ④ 개별공시지가 3시점 (amber+emerald)
 *
 * 정책 준수:
 *  - placeholder 숫자 예시 금지 — hint prop에 한국어 설명만
 *  - ToggleCard + RadioCardGroup (native checkbox·radio 금지)
 *  - useEffect → store 미러링 금지 (onChange 직접 처리)
 *  - 자동 안분 fallback 금지 (미입력은 validate에서 차단)
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { CommercialStdPriceLookupModal } from "@/components/calc/transfer/CommercialStdPriceLookupModal";
import { isSec164_5ProvisoApplicable } from "@/lib/calc/commercial-164-6-proviso";
import { Sec164_5ProvisoNotice } from "@/components/calc/transfer/Sec164_5ProvisoNotice";
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import { CommercialPre1990LandNotice } from "@/components/calc/transfer/CommercialPre1990LandNotice";
import { derivePre1990CommercialLandPricePerSqmAtAcqString } from "@/lib/calc/transfer-pre1990-commercial-bridge";
import { isCommercialPre1990Acquisition } from "@/lib/calc/transfer-pre1990-commercial-bridge";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { useMemo } from "react";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 양도일 (공시지가 기준연도 자동 계산용) */
  transferDate?: string;
}

const CB_ERA_OPTIONS = [
  {
    value: "pre_disclosure" as const,
    label: "호별 고시 전 취득 (~2004.12)",
    description: "2004년 12월 31일 이전 취득 — 토지(개공지×면적)·건물(기준시가 총액) 비율로 역환산 (소득세법 시행령 §164⑥)",
  },
  {
    value: "post_disclosure" as const,
    label: "호별 고시 후 취득 (2005.1~)",
    description: "2005년 1월 1일 이후 취득 — 호별 ㎡당 고시가 비율로 환산",
  },
];

export function CommercialBuildingBlock({ asset, onChange, transferDate }: Props) {
  // 건물 기준시가 모달 prefill — 자산 카드 소재지 재사용(이중입력 방지)
  const stdPriceAddress = {
    road: asset.addressRoad,
    jibun: asset.addressJibun,
    building: asset.buildingName,
    detail: asset.addressDetail,
    lng: asset.longitude,
    lat: asset.latitude,
    pnu: asset.addressPnu,
  };
  const isOn = asset.useEstimatedAcquisition && asset.assetKind === "commercial_building";
  const isPreDisclosure = asset.cbEra === "pre_disclosure";
  const isPostDisclosure = asset.cbEra === "post_disclosure";
  const hasEra = isPreDisclosure || isPostDisclosure;
  // §164⑥ 단서 — 취득연도 ≤2000은 나목(건물 기준시가) 가액이 없어 §164⑤ 준용 산정이 필요하다.
  const needs164_5 = isSec164_5ProvisoApplicable(asset.cbEra, asset.acquisitionDate);
  // §164④ — 취득이 개별공시지가 고시(1990.8.30.) 전이면 가목의 가액이 없어 토지등급 환산이 필요하다.
  const needs164_4 = isCommercialPre1990Acquisition(asset);
  // 파생값(store 미저장) — 표시 fallback. API·validate도 같은 함수로 동일 fallback을 쓴다.
  const pre1990LandAtAcq = derivePre1990CommercialLandPricePerSqmAtAcqString(asset, transferDate ?? "");

  // 연면적 자동 계산 표시 (사용자 친화적 피드백)
  const totalFloorArea = useMemo(() => {
    const excl = parseFloat(asset.cbExclusiveArea || "0");
    const shared = parseFloat(asset.cbSharedArea || "0");
    if (excl > 0 || shared > 0) {
      return parseFloat((excl + shared).toFixed(2));
    }
    return null;
  }, [asset.cbExclusiveArea, asset.cbSharedArea]);

  return (
    <ToggleCard
      tone="amber"
      checked={isOn}
      onCheckedChange={(v) => onChange({ useEstimatedAcquisition: v })}
      title="환산취득가 사용"
      description="취득일 당시 실거래가 확인 불가 시 기준시가 비율로 환산 (소득세법 §114⑦, 시행령 §176조의2②2호)"
    >
      <div className="space-y-4">
        {/* 환산취득가 근거 조문 (§164⑥ 환산 관련은 관례 검토중 — 텍스트만 유지) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="소득세법 §114 ⑦" label="§114⑦" />
          <LawArticleModal legalBasis="소득세법 시행령 §176조의2 ② 2호" label="§176의2②2호" />
        </div>
        {/* 호별고시 시점 분기 */}
        <div>
          <p className="mb-2 text-xs font-semibold text-amber-700">취득 시점 구분</p>
          <RadioCardGroup
            name={`cbEra-${asset.assetId}`}
            options={CB_ERA_OPTIONS}
            value={asset.cbEra}
            onChange={(v) => onChange({ cbEra: v })}
            tone="amber"
            layout="stack"
          />
        </div>

        {/* ① 면적 섹션 (sky) — cbEra 선택 후 표시 */}
        {hasEra && (
          <ToneCard tone="sky" sectionNum="1" title="면적 정보 (㎡)" noDark>
            <FieldCard
              label="전용면적"
              unit="㎡"
              hint="건물 전용면적 (분양면적에서 공유면적 제외)"
            >
              <DecimalInput
                value={asset.cbExclusiveArea}
                onChange={(v) => onChange({ cbExclusiveArea: v })}
                placeholder="전용면적 입력"
              />
            </FieldCard>
            <FieldCard
              label="공유면적"
              unit="㎡"
              hint="계단·복도 등 공유부분 면적"
            >
              <DecimalInput
                value={asset.cbSharedArea}
                onChange={(v) => onChange({ cbSharedArea: v })}
                placeholder="공유면적 입력"
              />
            </FieldCard>
            <FieldCard
              label="대지면적"
              unit="㎡"
              hint="이 호에 귀속되는 대지권 면적 (등기부 기재 면적)"
            >
              <DecimalInput
                value={asset.cbLandArea}
                onChange={(v) => onChange({ cbLandArea: v })}
                placeholder="대지면적 입력"
              />
            </FieldCard>
            {totalFloorArea !== null && (
              <div className="rounded bg-sky-100/60 border border-sky-200 px-3 py-2 text-xs text-sky-800">
                연면적 (전용+공유) = <span className="font-semibold">{totalFloorArea.toLocaleString()} ㎡</span>
              </div>
            )}
          </ToneCard>
        )}

        {/* ② 호별 ㎡당 고시가 (emerald/amber) — cbEra 선택 후 표시 */}
        {hasEra && (
          <ToneCard tone="emerald" sectionNum="2" title="호별 ㎡당 고시가 (원/㎡)" noDark>
            {/* 국세청 고시분 자동조회 — 호 선택 시 단가·전용·공유면적을 단일 배치로 채운다 */}
            <div className="flex flex-col items-end gap-1">
              <CommercialStdPriceLookupModal
                asset={asset}
                onChange={onChange}
                transferDate={transferDate}
                variant="estimated"
              />
            </div>
            {/* 양도시 — emerald */}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2">
              <FieldCard
                label="양도시 ㎡당 호별고시가"
                unit="원/㎡"
                hint="호별로 고시된 ㎡당 가액 입력"
              >
                <CurrencyInput
                  label=""
                  value={asset.cbUnitPriceAtTransfer}
                  onChange={(v) => onChange({ cbUnitPriceAtTransfer: v })}
                  hideUnit
                />
              </FieldCard>
            </div>
            {/* 최초고시(2005) 또는 취득시 — amber */}
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2">
              <FieldCard
                label={isPreDisclosure
                  ? "최초고시(2005) ㎡당 호별고시가"
                  : "취득시 ㎡당 호별고시가"}
                unit="원/㎡"
                hint={isPreDisclosure
                  ? "2005.1.1 최초 고시 시점 ㎡당 가액. 국세청 고시 이력에서 확인."
                  : "취득 당시 ㎡당 호별고시가. 국세청 고시 이력에서 확인."}
              >
                <CurrencyInput
                  label=""
                  value={asset.cbUnitPriceAtFirstOrAcq}
                  onChange={(v) => onChange({ cbUnitPriceAtFirstOrAcq: v })}
                  hideUnit
                />
              </FieldCard>
            </div>
          </ToneCard>
        )}

        {/* ③ 건물 기준시가 3시점 — 총액 (pre_disclosure 시만 표시) */}
        {isPreDisclosure && (
          <ToneCard tone="amber" sectionNum="3" title="건물 기준시가 — 3시점 (원, 총액)" noDark>
            <div className="text-xs text-amber-700 mb-1">
              건물분 ㎡당 가액 × 연면적(전유+공용 보정계수 반영) = <b>건물 기준시가 총액</b>으로 환산해 입력
            </div>
            {needs164_5 && (
              <Sec164_5ProvisoNotice
                acquisitionDate={asset.acquisitionDate}
                checked={asset.cbAcqBuildingStdBy164_5}
                onCheckedChange={(v) => onChange({ cbAcqBuildingStdBy164_5: v })}
              />
            )}
            {/* 취득시 — amber */}
            <FieldCard
              label="취득시 건물 기준시가"
              unit="원"
              hint="㎡당 단가 × 연면적(보정계수 반영) = 건물 기준시가 총액"
            >
              <CurrencyInput
                label=""
                value={asset.cbBuildingStdPriceAtAcq}
                onChange={(v) => onChange({ cbBuildingStdPriceAtAcq: v })}
                hideUnit
              />
            </FieldCard>
            <div className="flex justify-end">
              <BuildingStdPriceModalButton lockedTaxType="transfer" initialAddress={stdPriceAddress} snapshotKey={`bsp-${asset.assetId}-cb-acq`} applyTimePoint="acquisition" prefill={{ floorArea: totalFloorArea != null ? String(totalFloorArea) : undefined, landAreaM2: asset.cbLandArea, acquisitionDate: asset.acquisitionDate, transferDate }} onApply={(v) => onChange({ cbBuildingStdPriceAtAcq: String(v) })} />
            </div>
            {/* 최초고시시(2005) — amber */}
            <FieldCard
              label="최초고시시(2005) 건물 기준시가"
              unit="원"
              hint="2005.1.1 최초 고시 시점 건물 기준시가 총액"
            >
              <CurrencyInput
                label=""
                value={asset.cbBuildingStdPriceAtFirst}
                onChange={(v) => onChange({ cbBuildingStdPriceAtFirst: v })}
                hideUnit
              />
            </FieldCard>
            {/* 양도시 — emerald */}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2">
              <FieldCard
                label="양도시 건물 기준시가"
                unit="원"
                hint="양도 당시 건물 기준시가 총액"
              >
                <CurrencyInput
                  label=""
                  value={asset.cbBuildingStdPriceAtTransfer}
                  onChange={(v) => onChange({ cbBuildingStdPriceAtTransfer: v })}
                  hideUnit
                />
              </FieldCard>
              <div className="mt-1 flex justify-end">
                <BuildingStdPriceModalButton lockedTaxType="transfer" initialAddress={stdPriceAddress} snapshotKey={`bsp-${asset.assetId}-cb-transfer`} applyTimePoint="transfer" prefill={{ floorArea: totalFloorArea != null ? String(totalFloorArea) : undefined, landAreaM2: asset.cbLandArea, acquisitionDate: asset.acquisitionDate, transferDate }} onApply={(v) => onChange({ cbBuildingStdPriceAtTransfer: String(v) })} />
              </div>
            </div>
          </ToneCard>
        )}

        {/* ④ 개별공시지가 3시점 (amber+emerald) — cbEra 선택 후 표시 */}
        {hasEra && (
          <ToneCard
            tone="amber"
            sectionNum={isPreDisclosure ? "4" : "3"}
            title={`개별공시지가 — ${isPreDisclosure ? "3시점" : "2시점"} (원/㎡)`}
            bodyClassName="space-y-3"
            noDark
          >

            {/* 취득시 — amber (공통 필수) */}
            <div>
              <p className="mb-1 text-caption font-medium text-amber-700">취득시</p>
              {needs164_4 && (
                <>
                  <CommercialPre1990LandNotice acquisitionDate={asset.acquisitionDate} />
                  <Pre1990LandValuationInput
                    form={asset}
                    onChange={onChange}
                    acquisitionArea={asset.cbLandArea}
                    jibun={asset.addressJibun || undefined}
                    acquisitionDate={asset.acquisitionDate}
                    transferDate={transferDate}
                  />
                </>
              )}
              <LandPriceLookupField
                label="취득시 개별공시지가"
                pricePerSqm={asset.cbLandPricePerSqmAtAcq || pre1990LandAtAcq}
                onPricePerSqmChange={(v) => onChange({ cbLandPricePerSqmAtAcq: v })}
                area={parseFloat(asset.cbLandArea || "0") || undefined}
                referenceDate={asset.acquisitionDate || undefined}
                jibun={asset.addressJibun || undefined}
              />
            </div>

            {/* 최초고시시(2005) — amber (pre_disclosure 시만 필수) */}
            {isPreDisclosure && (
              <div>
                <p className="mb-1 text-caption font-medium text-amber-700">최초고시시(2005)</p>
                <LandPriceLookupField
                  label="최초고시시(2005) 개별공시지가"
                  pricePerSqm={asset.cbLandPricePerSqmAtFirst}
                  onPricePerSqmChange={(v) => onChange({ cbLandPricePerSqmAtFirst: v })}
                  area={parseFloat(asset.cbLandArea || "0") || undefined}
                  referenceDate="2005-01-01"
                  jibun={asset.addressJibun || undefined}
                />
              </div>
            )}

            {/* 양도시 — emerald (공통 필수) */}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2">
              <p className="mb-1 text-caption font-medium text-emerald-700">양도시</p>
              <LandPriceLookupField
                label="양도시 개별공시지가"
                pricePerSqm={asset.cbLandPricePerSqmAtTransfer}
                onPricePerSqmChange={(v) => onChange({ cbLandPricePerSqmAtTransfer: v })}
                area={parseFloat(asset.cbLandArea || "0") || undefined}
                referenceDate={transferDate || undefined}
                jibun={asset.addressJibun || undefined}
              />
            </div>
          </ToneCard>
        )}
      </div>
    </ToggleCard>
  );
}
