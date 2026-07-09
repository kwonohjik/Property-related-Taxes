"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { computeDerivedAreas, round2 } from "@/lib/tax-engine/mixed-use-derived-areas";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { MixedUsePreHousingDisclosureSection } from "./MixedUsePreHousingDisclosureSection";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  useEstimatedAcquisition?: boolean;
  housingSectionNum?: number;
  commercialSectionNum?: number;
  /** 소재지 지번 주소 — Vworld 공시지가 조회용 */
  jibun?: string;
}

/**
 * 겸용주택 기준시가 입력 — 자산-우선 레이아웃 (용도변경 없음 `hasPartialUsageChange === false`).
 *
 * 시점-우선(양도시/취득시)이던 현행을 주택 섹션 / 상가 섹션으로 재편.
 * 각 섹션 내부에서 양도(emerald)·취득(amber) sub-block으로 시점을 구분.
 * 상가건물은 한 번의 계산으로 취득·양도를 동시 입력(BuildingStdPriceModalButton onApplyBoth).
 * 쓰기 대상 폼 필드는 현행과 동일 → 엔진 페이로드 불변(API 변환 무관).
 */
export function MixedUseAssetMajorStdPrice({
  asset,
  onChange,
  transferDate,
  useEstimatedAcquisition,
  housingSectionNum,
  commercialSectionNum,
  jibun,
}: Props) {
  const residential = parseDecimal(asset.residentialFloorArea);
  const commercial = parseDecimal(asset.nonResidentialFloorArea);
  const totalLand = parseDecimal(asset.mixedUseTotalLandArea);

  // 부수토지 안분 — leaf 헬퍼 단일 소스 + override(주택 부수토지) 반영 (three-state: 빈값→자동).
  // PHD ON이면 phdResidentialLandArea가 담당하므로 override 배타(입력칸 숨김).
  const overrideStr = asset.mixedResidentialLandAreaOverride ?? "";
  const hasOverride = !asset.usePreHousingDisclosure && overrideStr.trim() !== "";
  const derived = computeDerivedAreas({
    residentialFloorArea: residential,
    nonResidentialFloorArea: commercial,
    buildingFootprintArea: parseDecimal(asset.buildingFootprintArea),
    totalLandArea: totalLand,
    ...(hasOverride ? { residentialLandAreaOverride: parseDecimal(overrideStr) } : {}),
  });
  const commercialLandArea = derived.commercialLandArea;

  // 상가 부수토지 칸 편집 → 주택 override 역산 저장 (엔진 축은 주택, mirror onChange 1곳)
  const onCommercialLandChange = (v: string) => {
    if (v.trim() === "") {
      onChange({ mixedResidentialLandAreaOverride: "" });
      return;
    }
    const resid = round2(totalLand - (parseDecimal(v) || 0));
    onChange({ mixedResidentialLandAreaOverride: String(resid) });
  };

  // 양도시 상가부분 자동 계산
  const transferLandPerSqm = parseAmount(asset.mixedTransferLandPricePerSqm) ?? 0;
  const transferCommercialLandStd = Math.floor(transferLandPerSqm * commercialLandArea);
  const transferCommercialBuilding = parseAmount(asset.mixedTransferCommercialBuildingPrice) ?? 0;
  const transferCommercialTotal = transferCommercialLandStd + transferCommercialBuilding;

  // 취득시 상가부분 자동 계산 (mixedAcq 우선, PHD 토지가액 fallback — API 변환과 동일 우선순위)
  const acqLandPerSqm =
    parseAmount(asset.mixedAcqLandPricePerSqm) || parseAmount(asset.phdLandPricePerSqmAtAcq);
  const acqCommercialLandStd = Math.floor(acqLandPerSqm * commercialLandArea);
  const acqCommercialBuilding = parseAmount(asset.mixedAcqCommercialBuildingPrice) ?? 0;
  const acqCommercialTotal = acqCommercialLandStd + acqCommercialBuilding;

  const fmtKrw = (v: number) => (v > 0 ? `${v.toLocaleString()}` : "—");
  const fmtSqm = (v: number) => `${v.toFixed(2)}㎡`;

  // 취득 기준일 — 건물 취득일 기준(§164⑤ 주택 환산·건물 위치지수). 토지 취득일 아님.
  const acqReferenceDate = asset.acquisitionDate;

  const stdPriceAddress = {
    road: asset.addressRoad,
    jibun: asset.addressJibun,
    building: asset.buildingName,
    detail: asset.addressDetail,
    lng: asset.longitude,
    lat: asset.latitude,
  };
  // snapshotKey는 대상 필드 기준 — 취득·양도 통합 단일 키
  const bspPrefix = `bsp-${asset.assetId}-phd`;

  return (
    <div className="space-y-3">
      {/* ── ② 주택 기준시가 ─────────────────────────── */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
        <div className="flex items-center gap-2">
          {housingSectionNum !== undefined && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700 select-none">
              {housingSectionNum}
            </span>
          )}
          <p className="text-xs font-semibold text-slate-700">주택 기준시가</p>
        </div>

        {/* 양도 sub-block */}
        <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-2 space-y-2">
          <p className="text-[11px] font-semibold text-emerald-700">양도시</p>
          <FieldCard label="개별주택공시가격" hint="주택건물+주택부수토지 일괄">
            <CurrencyInput
              label=""
              value={asset.mixedTransferHousingPrice}
              onChange={(v) => onChange({ mixedTransferHousingPrice: v })}
              placeholder="양도시 개별주택공시가격"
            />
          </FieldCard>
        </div>

        {/* 취득 sub-block — PHD 토글(amber)이 시점 인디케이터 역할.
            §11-6: PHD ON 시 위젯 자체 tone(amber/violet/emerald PointBlock)에 위임 — 별도 amber 컨테이너 미추가 */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-amber-700">취득시</p>
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

          {!asset.usePreHousingDisclosure && (
            <div className="rounded-md border border-amber-200 bg-amber-50/40 p-2">
              <FieldCard label="개별주택공시가격" hint="미공시 시 비워두세요 — 위 §164⑤ 토글 사용">
                <CurrencyInput
                  label=""
                  value={asset.mixedAcqHousingPrice}
                  onChange={(v) => onChange({ mixedAcqHousingPrice: v })}
                  placeholder="취득시 개별주택공시가격 (미공시 시 빈값)"
                />
              </FieldCard>
            </div>
          )}
        </div>
      </div>

      {/* ── ③ 상가 기준시가 ─────────────────────────── */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
        <div className="flex items-center gap-2">
          {commercialSectionNum !== undefined && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700 select-none">
              {commercialSectionNum}
            </span>
          )}
          <p className="text-xs font-semibold text-slate-700">상가 기준시가</p>
        </div>

        {/* 상가건물 기준시가 — 양도/취득 나란히 + 통합 계산 모달 */}
        <p className="text-xs font-medium text-slate-600">
          상가건물 기준시가{" "}
          <span className="text-[10px] font-normal text-slate-500">
            (토지 제외 — 국세청 홈택스 &gt; 기준시가 조회)
          </span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-2 space-y-1">
            <p className="text-[11px] font-semibold text-emerald-700">양도시</p>
            <CurrencyInput
              label=""
              value={asset.mixedTransferCommercialBuildingPrice}
              onChange={(v) => onChange({ mixedTransferCommercialBuildingPrice: v })}
              placeholder="양도시 상가건물 기준시가"
              hideUnit
            />
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50/40 p-2 space-y-1">
            <p className="text-[11px] font-semibold text-amber-700">취득시</p>
            <CurrencyInput
              label=""
              value={asset.mixedAcqCommercialBuildingPrice}
              onChange={(v) => onChange({ mixedAcqCommercialBuildingPrice: v })}
              placeholder="취득시 상가건물 기준시가 (필수)"
              hideUnit
            />
          </div>
        </div>
        <div className="flex justify-end">
          <BuildingStdPriceModalButton
            lockedTaxType="transfer"
            initialAddress={stdPriceAddress}
            snapshotKey={`${bspPrefix}-commercial`}
            onApplyBoth={(acq, transfer) =>
              onChange({
                mixedAcqCommercialBuildingPrice: String(acq),
                mixedTransferCommercialBuildingPrice: String(transfer),
              })
            }
          />
        </div>

        {/* 상가부수토지 면적 (자동 안분·수정 가능) — PHD OFF 전용, 편집 시 주택분 자동 조정(양시점 공통) */}
        {!asset.usePreHousingDisclosure && totalLand > 0 && (
          <FieldCard
            label="상가부수토지 면적 (㎡)"
            hint="전체 토지 × 상가연면적 비율 자동 안분. 수정 시 주택분이 자동 조정되며 취득·양도 양시점에 공통 반영됩니다."
          >
            <DecimalInput
              value={hasOverride ? String(commercialLandArea) : ""}
              onChange={onCommercialLandChange}
              placeholder={commercialLandArea > 0 ? commercialLandArea.toFixed(2) : "자동 안분"}
              unit="㎡"
              data-testid="mixed-commercial-land-override"
            />
          </FieldCard>
        )}

        {/* 상가부수토지 개별공시지가 — 양도/취득 (세로 스택: 기준연도 드롭다운 폭 확보) */}
        <p className="text-xs font-medium text-slate-600">상가부수토지 개별공시지가</p>
        <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-2 space-y-1">
          <p className="text-[11px] font-semibold text-emerald-700">양도시</p>
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
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50/40 p-2 space-y-1">
          <p className="text-[11px] font-semibold text-amber-700">취득시</p>
          <LandPriceLookupField
            pricePerSqm={asset.mixedAcqLandPricePerSqm || asset.phdLandPricePerSqmAtAcq}
            onPricePerSqmChange={(v) => onChange({ mixedAcqLandPricePerSqm: v })}
            area={commercialLandArea > 0 ? commercialLandArea : undefined}
            referenceDate={acqReferenceDate}
            jibun={jibun}
            label="취득시 개별공시지가(상가)(원/㎡)"
            hint="상가부수토지 기준시가 자동 계산용 (필수)"
            placeholder="취득시 개별공시지가 /㎡"
          />
        </div>

        {/* 자동합계 — "기준시가 합계" 문구 유지 (E2E transfer-p3-hybrid 방어) */}
        {(transferCommercialLandStd > 0 ||
          transferCommercialBuilding > 0 ||
          acqCommercialLandStd > 0 ||
          acqCommercialBuilding > 0) && (
          <div className="space-y-2">
            {commercialLandArea > 0 && (
              <div className="rounded-lg bg-emerald-100/60 border border-emerald-200 px-3 py-2 text-sm space-y-1">
                <div className="flex justify-between text-xs text-emerald-700">
                  <span>상가부수토지 면적</span>
                  <span>{fmtSqm(commercialLandArea)}</span>
                </div>
                <div className="flex justify-between text-xs text-emerald-700">
                  <span>양도 상가부수토지 기준시가 (자동)</span>
                  <span>{fmtKrw(transferCommercialLandStd)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-emerald-900">
                  <span>양도 상가부분 기준시가 합계 (자동)</span>
                  <span>{fmtKrw(transferCommercialTotal)}</span>
                </div>
              </div>
            )}
            {(acqCommercialLandStd > 0 || acqCommercialBuilding > 0) && (
              <div className="rounded-lg bg-amber-100/60 border border-amber-200 px-3 py-2 text-sm space-y-1">
                <div className="flex justify-between text-xs text-amber-700">
                  <span>취득 상가부수토지 기준시가 (자동)</span>
                  <span>{fmtKrw(acqCommercialLandStd)}</span>
                </div>
                {acqCommercialBuilding > 0 && (
                  <div className="flex justify-between text-sm font-semibold text-amber-900">
                    <span>취득 상가부분 기준시가 합계 (자동)</span>
                    <span>{fmtKrw(acqCommercialTotal)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
