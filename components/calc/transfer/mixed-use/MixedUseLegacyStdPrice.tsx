"use client";

import { useMemo } from "react";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import { computeDerivedAreas } from "@/lib/tax-engine/mixed-use-derived-areas";
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

/**
 * 겸용주택 기준시가 입력 — 시점-우선 레이아웃(현행/legacy).
 * 보유 중 일부 용도변경(`hasPartialUsageChange === true`) 경로 전용
 * (Case A 4부분 안분·Case B·방향 분기). 오케스트레이터가 이 경로로 라우팅.
 * 용도변경 없는 경우는 `MixedUseAssetMajorStdPrice`(자산-우선)가 담당.
 */
export function MixedUseLegacyStdPrice({
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
  const totalLand = parseDecimal(asset.mixedUseTotalLandArea);

  // 면적 안분 — leaf 헬퍼 단일 소스(dual-truth 제거). 자체 재구현은 override를 반영하지 못했다.
  // 면적 입력·수정은 섹션 ①(MixedUseAreaInputs) 단일 소스 — 여기서는 **조회만** 한다.
  // ⚠️ override 3필드를 **전부** 전달해야 한다. 하나라도 빠뜨리면 이 화면의 상가부수토지
  //    기준시가 자동계산·모달 prefill이 엔진값과 갈라진다(용도변경 ON 경로 — 섹션 ①은
  //    `MixedUseSection.tsx:115`에서 용도변경 여부와 무관하게 렌더되므로 여기서도 수정된다).
  // 부수토지 override는 PHD 무관 (2026-07-15 배타 해제 — API·UI·validate·사이드바 동일).
  const landOverrideStr = asset.mixedResidentialLandAreaOverride ?? "";
  const commLandOverrideStr = asset.mixedCommercialLandAreaOverride ?? "";
  const fpOverrideStr = asset.mixedResidentialFootprintOverride ?? "";
  const derived = computeDerivedAreas({
    residentialFloorArea: residential,
    nonResidentialFloorArea: commercial,
    buildingFootprintArea: parseDecimal(asset.buildingFootprintArea),
    totalLandArea: totalLand,
    ...(landOverrideStr.trim() !== ""
      ? { residentialLandAreaOverride: parseDecimal(landOverrideStr) }
      : {}),
    ...(commLandOverrideStr.trim() !== ""
      ? { commercialLandAreaOverride: parseDecimal(commLandOverrideStr) }
      : {}),
    ...(fpOverrideStr.trim() !== ""
      ? { residentialFootprintOverride: parseDecimal(fpOverrideStr) }
      : {}),
  });
  const commercialLandArea = derived.commercialLandArea;

  // 양도시 상가부분 자동 계산 (mixedTransfer 우선, PHD 토지가액 fallback — API 변환과 동일 우선순위)
  const transferLandPerSqm =
    parseAmount(asset.mixedTransferLandPricePerSqm) || parseAmount(asset.phdLandPricePerSqmAtTransfer);
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

  // 취득 기준일 — 취득시 개별공시지가(건물 위치지수 산정용): 건물 취득일 기준
  // (§164⑦ 주택 환산·신축연도 이후). 토지 취득일 아님(2026-04 회귀 정정).
  const acqReferenceDate = asset.acquisitionDate;
  // 상가부수토지 개별공시지가 취득시 추천 연도 전용 기준일 — 토지값이므로 토지 취득일 기준(§166⑥).
  const acqLandReferenceDate = asset.landAcquisitionDate || asset.acquisitionDate;
  // 모달 취득 위치지수 공시지가 prefill 가능 여부 — **토지일 = 건물일일 때만**.
  // 화면 부수토지 공시지가는 토지 취득일 기준(§166⑥), 모달 취득 위치지수 칸은 건물 취득일 기준이라
  // 두 날짜가 다르면 다른 연도 값 → 주입 시 위치지수 오산(세액 영향). 상세: MixedUseAssetMajorStdPrice 동일 주석.
  const canPrefillAcqLandPrice = acqLandReferenceDate === asset.acquisitionDate;

  // 건물 기준시가 계산기 모달 소재지 prefill — GeneralBuildingBlock 패턴 복제
  const stdPriceAddress = {
    road: asset.addressRoad,
    jibun: asset.addressJibun,
    building: asset.buildingName,
    detail: asset.addressDetail,
    lng: asset.longitude,
    lat: asset.latitude,
    pnu: asset.addressPnu,
  };
  // snapshotKey는 대상 폼 필드 기준(§4.4) — 같은 필드가 Case A/B에서 다른 컴포넌트로 렌더돼도 스냅샷 공유
  const bspPrefix = `bsp-${asset.assetId}-phd`;

  // Case A 4부분 안분 — 최초공시일 < 용도변경일
  const isCaseA = useMemo(() => {
    if (!asset.hasPartialUsageChange || asset.partialChangeDirection !== "house_to_commercial") return false;
    if (!asset.phdFirstDisclosureDate || !asset.partialChangeDate) return false;
    const fd = new Date(asset.phdFirstDisclosureDate);
    const uc = new Date(asset.partialChangeDate);
    return !isNaN(fd.getTime()) && !isNaN(uc.getTime()) && fd < uc;
  }, [asset.hasPartialUsageChange, asset.partialChangeDirection, asset.phdFirstDisclosureDate, asset.partialChangeDate]);

  // (Case A 양도 4부분 파생은 자산-우선 위젯으로 이관 — legacy에서 제거)

  return (
    <div className="space-y-3">
      {/* ── 취득시 기준시가 ─────────────────────────── */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          {acqSectionNum !== undefined && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">
              {acqSectionNum}
            </span>
          )}
          <p className="text-xs font-semibold text-amber-700">
            {isCaseA ? "주택·상가 기준시가 (취득·최초공시·양도 3시점)" : "취득시 기준시가"}
          </p>
        </div>

        {/* PHD 토글 — 항상 표시. 체크 시 환산취득가 모드 자동 전환 */}
        <ToggleCard
          tone="amber"
          size="sm"
          title="취득 당시 개별주택가격 미공시 (§164⑦ 3-시점 환산)"
          description={
            useEstimatedAcquisition
              ? "개별주택가격 최초 공시 이전 취득 시 활성화"
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
                <StandardPriceInput
                  propertyKind="house_individual"
                  totalPrice={asset.mixedAcqHousingPrice}
                  onTotalPriceChange={(v) => onChange({ mixedAcqHousingPrice: v })}
                  jibun={jibun}
                  referenceDate={acqReferenceDate}
                  label="개별주택공시가격"
                  hint="미공시 시 비워두세요 — 위 §164⑦ 토글 사용"
                />
              )}

            {/* 취득시 상가건물 기준시가 — 직접 입력 */}
            <FieldCard
              label="취득시 상가건물 기준시가"
              hint={
                asset.partialChangeDirection === "house_to_commercial"
                  ? "취득 당시 동일 건물의 국세청 고시 기준시가 — 직접 조회·입력 (필수)"
                  : "토지 제외 (필수)"
              }
            >
              <CurrencyInput
                label=""
                value={asset.mixedAcqCommercialBuildingPrice}
                onChange={(v) => onChange({ mixedAcqCommercialBuildingPrice: v })}
                placeholder="취득시 상가건물 기준시가 (필수)"
              />
            </FieldCard>
            <div className="flex justify-end">
              <BuildingStdPriceModalButton
                lockedTaxType="transfer"
                initialAddress={stdPriceAddress}
                snapshotKey={`${bspPrefix}-acq-commercial`}
                prefill={{
                  floorArea: asset.nonResidentialFloorArea,
                  landAreaM2: commercialLandArea > 0 ? String(commercialLandArea) : undefined,
                  acquisitionDate: asset.acquisitionDate,
                  transferDate,
                  // 시점별 모달이지만 폼은 취득·양도 2시점을 함께 계산하므로 양쪽 공시지가를 모두 넘긴다
                  // (applyTimePoint는 적용 버튼 노출만 제어). 취득 트랙 판정은 모달 단일 게이트(§164⑤).
                  acqLandPricePerSqm: canPrefillAcqLandPrice
                    ? asset.mixedAcqLandPricePerSqm || asset.phdLandPricePerSqmAtAcq
                    : undefined,
                  acqLandPricePerSqm2001: asset.phdLandPricePerSqmAtAcq2001,
                  transferLandPricePerSqm:
                    asset.mixedTransferLandPricePerSqm || asset.phdLandPricePerSqmAtTransfer,
                }}
                onApply={(v) => onChange({ mixedAcqCommercialBuildingPrice: String(v) })}
              />
            </div>

            <LandPriceLookupField
              pricePerSqm={asset.mixedAcqLandPricePerSqm || asset.phdLandPricePerSqmAtAcq}
              onPricePerSqmChange={(v) => onChange({ mixedAcqLandPricePerSqm: v })}
              area={commercialLandArea > 0 ? commercialLandArea : undefined}
              referenceDate={acqLandReferenceDate}
              jibun={jibun}
              label="개별공시지가 (원/㎡)"
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

            {/* 면적 행은 시점 무관 공통값 → 첫 박스(취득)가 담는다.
                게이트는 면적 OR 자기 값 — 면적 게이트만 두면 상가부수토지 0일 때
                상가건물 기준시가가 있어도 취득 합계가 사라진다(AssetMajor와 동일 방어). */}
            {(commercialLandArea > 0 || acqCommercialLandStd > 0 || acqCommercialBuilding > 0) && (
              <div className="rounded-lg bg-amber-100/60 border border-amber-200 px-3 py-2 text-sm space-y-1">
                {commercialLandArea > 0 && (
                  <div className="flex justify-between text-xs text-amber-700">
                    <span>상가부수토지 면적</span>
                    <span>{fmtSqm(commercialLandArea)}</span>
                  </div>
                )}
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

      {/* ── 양도시 기준시가 ───────────────────────────
          Case A(항상 PHD ON)에서 개별주택공시가격을 숨기면 헤더만 남는 빈 박스가 되므로
          sub-block 전체를 {!(isCaseA && PHD)} 로 가드. non-Case-A는 상가 필드가 남아 정상. */}
      {!(isCaseA && asset.usePreHousingDisclosure) && (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          {transferSectionNum !== undefined && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-micro font-bold text-emerald-800 select-none">
              {transferSectionNum}
            </span>
          )}
          <p className="text-xs font-semibold text-emerald-700">
            {isCaseA ? "양도시 개별주택공시가격" : "양도시 기준시가"}
          </p>
        </div>

        {/* PHD ON 시 하단 PHD 패널의 양도시 입력이 단일 소스이므로 숨김 */}
        {!asset.usePreHousingDisclosure && (
          <StandardPriceInput
            propertyKind="house_individual"
            totalPrice={asset.mixedTransferHousingPrice}
            onTotalPriceChange={(v) => onChange({ mixedTransferHousingPrice: v })}
            jibun={jibun}
            referenceDate={transferDate}
            label="개별주택공시가격"
            hint="주택건물+주택부수토지 일괄"
          />
        )}

        {/* Case A(용도변경 4부분)는 자산-우선 위젯(취득시 섹션 PHD, layout=asset-major)이 양도까지 흡수 — 별도 양도 4부분 미렌더. */}
        {!isCaseA && (
          /* 일반(비-Case A) 레이아웃 — 기존 유지 */
          <>
            <FieldCard
              label="상가건물 기준시가"
              hint="토지 제외 (개별주택가격확인서에 미포함)"
            >
              <CurrencyInput
                label=""
                value={asset.mixedTransferCommercialBuildingPrice}
                onChange={(v) => onChange({ mixedTransferCommercialBuildingPrice: v })}
                placeholder="양도시 상가건물 기준시가"
              />
            </FieldCard>
            <div className="flex justify-end">
              <BuildingStdPriceModalButton
                lockedTaxType="transfer"
                initialAddress={stdPriceAddress}
                snapshotKey={`${bspPrefix}-transfer-commercial`}
                prefill={{
                  floorArea: asset.nonResidentialFloorArea,
                  landAreaM2: commercialLandArea > 0 ? String(commercialLandArea) : undefined,
                  acquisitionDate: asset.acquisitionDate,
                  transferDate,
                  // 취득 모달과 동일 — 폼이 2시점을 함께 계산하므로 양쪽 공시지가 전달.
                  acqLandPricePerSqm: canPrefillAcqLandPrice
                    ? asset.mixedAcqLandPricePerSqm || asset.phdLandPricePerSqmAtAcq
                    : undefined,
                  acqLandPricePerSqm2001: asset.phdLandPricePerSqmAtAcq2001,
                  transferLandPricePerSqm:
                    asset.mixedTransferLandPricePerSqm || asset.phdLandPricePerSqmAtTransfer,
                }}
                onApply={(v) => onChange({ mixedTransferCommercialBuildingPrice: String(v) })}
              />
            </div>
            <LandPriceLookupField
              pricePerSqm={asset.mixedTransferLandPricePerSqm || asset.phdLandPricePerSqmAtTransfer}
              onPricePerSqmChange={(v) => onChange({ mixedTransferLandPricePerSqm: v })}
              area={commercialLandArea > 0 ? commercialLandArea : undefined}
              referenceDate={transferDate}
              jibun={jibun}
              label="개별공시지가 (원/㎡)"
              hint="상가부수토지 산정용 (필수)"
              placeholder="양도시 개별공시지가 /㎡"
            />
            {(transferCommercialLandStd > 0 || transferCommercialBuilding > 0) && (
              <div className="rounded-lg bg-emerald-100/60 border border-emerald-200 px-3 py-2 text-sm space-y-1">
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
      )}
    </div>
  );
}
