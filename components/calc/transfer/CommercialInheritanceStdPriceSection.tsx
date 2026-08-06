/**
 * CommercialInheritanceStdPriceSection — 상속·**증여** 상가 §164⑥ 취득당시 기준시가 입력 (소령 §163⑨2호)
 *
 * assetKind === "commercial_building" + 취득원인 ∈ {상속, 증여} + 기준일 < 2005-01-01 시 렌더.
 * 상가 기준시가 최초고시(2005-01-01) 전 상속·증여 상가는
 * 취득가액 = max(상속개시일·증여일 상증법 평가액, §164⑥ 취득당시 기준시가).
 *
 * ⭐ **§163⑨2호는 「상속 또는 증여」다** — 2026-08-06 증여 개방(계획서 U-3). 종전에는 상속만
 *    통과시켜, PR #1097이 API payload 트리거를 열었어도 입력 칸이 없어 도달할 수 없었다.
 * §164⑥ 취득당시 기준시가(P_A)는 최초고시(2005) 역환산으로 산정 → 취득시·최초고시 3시점 기준시가 입력.
 *
 * cb* 스토어 필드 재사용(환산 섹션과 동일 물리량). opt-in — 미입력 시 상증법 평가액만 사용(Phase 1).
 * 양도시 값·환산 토글은 불요(P_A는 취득시·최초고시만).
 */
"use client";

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import { CommercialStdPriceLookupModal } from "@/components/calc/transfer/CommercialStdPriceLookupModal";
import { Sec164_5ProvisoNotice } from "@/components/calc/transfer/Sec164_5ProvisoNotice";
import { isBeforeBuildingStdPriceNotice } from "@/lib/calc/commercial-164-6-proviso";
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import { CommercialPre1990LandNotice } from "@/components/calc/transfer/CommercialPre1990LandNotice";
import { derivePre1990CommercialLandPricePerSqmAtAcqString } from "@/lib/calc/transfer-pre1990-commercial-bridge";
import { isCommercialPre1990Acquisition } from "@/lib/calc/transfer-pre1990-commercial-bridge";
import {
  deriveSec163_9BaseDate,
  isSec163_9Cause,
  sec163_9BaseDateLabel,
  sec163_9CauseLabel,
} from "@/lib/calc/transfer-163-9-base-date";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

interface Props {
  asset: AssetForm;
  onChange: (data: Partial<AssetForm>) => void;
  transferDate?: string;
}

export function CommercialInheritanceStdPriceSection({ asset, onChange, transferDate }: Props) {
  // 기준일·대상 판정은 API payload 빌더(`transfer-tax-api-inheritance.ts`)와 **같은 함수**를 쓴다.
  // 여기서 재기술하면 stale `inheritanceStartDate`를 가진 증여 자산에서 노출과 payload가 어긋난다.
  const inheritanceDate = deriveSec163_9BaseDate(asset);
  const dateLabel = sec163_9BaseDateLabel(asset);
  const causeLabel = sec163_9CauseLabel(asset);
  // 상가 기준시가 최초고시(2005-01-01) 전 상속·증여만 §164⑥ 대상.
  if (
    asset.assetKind !== "commercial_building" ||
    !isSec163_9Cause(asset.acquisitionCause) ||
    !inheritanceDate ||
    inheritanceDate >= "2005-01-01"
  ) {
    return null;
  }

  const exclusive = parseFloat(asset.cbExclusiveArea || "0") || 0;
  const shared = parseFloat(asset.cbSharedArea || "0") || 0;
  const totalFloorArea = exclusive + shared > 0 ? parseFloat((exclusive + shared).toFixed(2)) : null;
  // 건물 기준시가 모달 prefill — 자산 카드 소재지 재사용(CommercialBuildingBlock와 동일 AddressValue).
  const stdPriceAddress = {
    road: asset.addressRoad,
    jibun: asset.addressJibun,
    building: asset.buildingName,
    detail: asset.addressDetail,
    lng: asset.longitude,
    lat: asset.latitude,
    pnu: asset.addressPnu,
    dong: asset.addressDong || undefined,
    ho: asset.addressHo || undefined,
  };

  return (
    <ToneCard tone="amber" title="§164⑥ 취득당시 기준시가 (선택 — 상증법 평가액과 큰 금액 적용)" noDark>
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="소득세법 시행령 §163 ⑨ 2호" label="§163⑨2호" />
        <LawArticleModal legalBasis="소득세법 시행령 §164 ⑥" label="§164⑥" />
      </div>
      <p className="text-xs text-amber-700">
        상가 기준시가 최초고시(2005.1.1) 전 {causeLabel}받은 상가는 <b>max({dateLabel} 상증법 평가액, §164⑥ 취득당시 기준시가)</b>를
        취득가액으로 봅니다. 취득당시 기준시가는 최초고시(2005) 역환산으로 산정합니다. 아래 3시점 입력 시에만 적용되며,
        미입력 시 {dateLabel} 평가액만 사용합니다.
      </p>

      {/* 면적 3필드(전용·공유·대지)는 ① 기본정보로 이전했다 (2026-08-04).
          취득원인 무관 단일 입력 — `asset-sections/AssetAreaCommercial.tsx`.
          ⚠️ `totalFloorArea` 계산은 유지한다 — 아래 기준시가 모달 prefill이 소비한다. */}

      {/* ① 최초고시(2005) ㎡당 호별고시가 */}
      <ToneCard tone="emerald" sectionNum="1" title="최초고시(2005) 호별 ㎡당 고시가 (원/㎡)" noDark>
        <div className="flex flex-col items-end gap-1">
          <CommercialStdPriceLookupModal asset={asset} onChange={onChange} transferDate={transferDate} variant="inheritance" />
        </div>
        <FieldCard label="최초고시(2005) ㎡당 호별고시가" unit="원/㎡" hint="2005.1.1 최초 고시 시점 ㎡당 가액. 국세청 고시 이력에서 확인.">
          <CurrencyInput label="" value={asset.cbUnitPriceAtFirstOrAcq} onChange={(v) => onChange({ cbUnitPriceAtFirstOrAcq: v })} hideUnit />
        </FieldCard>
      </ToneCard>

      {/* ② 건물 기준시가 (취득시·최초고시) */}
      <ToneCard tone="amber" sectionNum="2" title="건물 기준시가 — 취득시·최초고시 (원, 총액)" noDark>
        {isBeforeBuildingStdPriceNotice(inheritanceDate) && (
          <Sec164_5ProvisoNotice
            acquisitionDate={inheritanceDate}
            checked={asset.cbAcqBuildingStdBy164_5}
            onCheckedChange={(v) => onChange({ cbAcqBuildingStdBy164_5: v })}
            timePointLabel={`취득당시(${dateLabel})`}
          />
        )}
        <FieldCard label={`취득시(${dateLabel}) 건물 기준시가`} unit="원" hint="㎡당 단가 × 연면적(보정계수 반영) = 건물 기준시가 총액">
          <CurrencyInput label="" value={asset.cbBuildingStdPriceAtAcq} onChange={(v) => onChange({ cbBuildingStdPriceAtAcq: v })} hideUnit />
        </FieldCard>
        <div className="flex justify-end">
          <BuildingStdPriceModalButton lockedTaxType="transfer" initialAddress={stdPriceAddress} snapshotKey={`bsp-${asset.assetId}-cbinh-acq`} applyTimePoint="acquisition" hideFloorAreaInput prefill={{ floorArea: totalFloorArea != null ? String(totalFloorArea) : undefined, landAreaM2: asset.cbLandArea, acquisitionDate: asset.acquisitionDate, transferDate }} onApply={(v) => onChange({ cbBuildingStdPriceAtAcq: String(v) })} />
        </div>
        <FieldCard label="최초고시시(2005) 건물 기준시가" unit="원" hint="2005.1.1 최초 고시 시점 건물 기준시가 총액">
          <CurrencyInput label="" value={asset.cbBuildingStdPriceAtFirst} onChange={(v) => onChange({ cbBuildingStdPriceAtFirst: v })} hideUnit />
        </FieldCard>
      </ToneCard>

      {/* ③ 개별공시지가 (취득시·최초고시) */}
      <ToneCard tone="amber" sectionNum="3" title="개별공시지가 — 취득시·최초고시 (원/㎡)" bodyClassName="space-y-3" noDark>
        <div>
          <p className="mb-1 text-caption font-medium text-amber-700">취득시({dateLabel})</p>
          {isCommercialPre1990Acquisition(asset) && (
            <>
              <CommercialPre1990LandNotice acquisitionDate={inheritanceDate} />
              <Pre1990LandValuationInput
                form={asset}
                onChange={onChange}
                acquisitionArea={asset.cbLandArea}
                jibun={asset.addressJibun || undefined}
                acquisitionDate={inheritanceDate}
                transferDate={transferDate}
              />
            </>
          )}
          <LandPriceLookupField
            label="취득시 개별공시지가"
            pricePerSqm={
              asset.cbLandPricePerSqmAtAcq ||
              derivePre1990CommercialLandPricePerSqmAtAcqString(asset, transferDate ?? "")
            }
            onPricePerSqmChange={(v) => onChange({ cbLandPricePerSqmAtAcq: v })}
            area={parseFloat(asset.cbLandArea || "0") || undefined}
            referenceDate={asset.acquisitionDate || undefined}
            jibun={asset.addressJibun || undefined}
          />
        </div>
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
      </ToneCard>
    </ToneCard>
  );
}
