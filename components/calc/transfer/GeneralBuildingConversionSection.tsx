"use client";

/**
 * GeneralBuildingBlock ⑦ — **주택 → 상가 용도변경** 섹션 (fuchsia)
 *
 * 사례 35(사전법규재산 2022-684·881 · 서울행법 2012구단26961): 다주택 상태에서 용도변경하면
 * 변경일 이전 보유기간이 장기보유특별공제에서 배제된다(「소득세법」 제95조 제2항 표1).
 * 후속-1: 「양도소득세 집행기준」 99-164-10 환산주택가격.
 *
 * `GeneralBuildingBlock`에서 분리했다(2026-08-04 P4 — 배치 런처 추가로 836줄 초과).
 * 두 미리보기 useMemo도 이 섹션 전용이라 함께 옮겼다.
 */

import { useMemo } from "react";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { PrecedentArticleModal } from "@/components/ui/precedent-article-modal";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { DateInput } from "@/components/ui/date-input";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 양도일 — 용도변경 보유기간 미리보기에 사용 */
  transferDate?: string;
}

export function GeneralBuildingConversionSection({ asset, onChange, transferDate }: Props) {
  /**
   * 사례 35: 주택→상가 용도변경 미리보기 — 보유기간 기산일 + 표1 공제율 안내.
   * useMemo 순수 — useEffect 미러링 금지 정책 준수.
   */
  const conversionPreview = useMemo(() => {
    if (!asset.gbHouseToCommercialConversion) return null;
    if (!asset.gbConversionDate || !transferDate) return null;
    if (asset.gbWasMultiHouseAtConversion === null) return null; // 미선택 시 표시 보류
    const startISO = asset.gbWasMultiHouseAtConversion
      ? asset.gbConversionDate
      : asset.acquisitionDate;
    if (!startISO) return null;
    const start = new Date(startISO);
    const end = new Date(transferDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    // 만 보유연수 (초일불산입 — 민법 §157, calculateHoldingPeriod 동일 로직)
    const startPlusOne = new Date(start);
    startPlusOne.setDate(startPlusOne.getDate() + 1);
    let years = end.getFullYear() - startPlusOne.getFullYear();
    const m = end.getMonth() - startPlusOne.getMonth();
    if (m < 0 || (m === 0 && end.getDate() < startPlusOne.getDate())) years -= 1;
    years = Math.max(0, years);
    const isUnder3Years = years < 3;
    const rate = isUnder3Years ? 0 : Math.min(years * 2, 30);
    return {
      isUnder3Years,
      years,
      label: asset.gbWasMultiHouseAtConversion
        ? `보유기간 기산일 = 용도변경일 (${asset.gbConversionDate})`
        : `보유기간 기산일 = 당초 취득일 (${asset.acquisitionDate})`,
      notice: isUnder3Years
        ? `보유기간 ${years}년 → 3년 미만 — 장기보유특별공제 0% (§95② 표1)`
        : `보유기간 ${years}년 → §95② 표1 ${rate}% (연 2%, 최대 30%)`,
    };
  }, [
    asset.gbHouseToCommercialConversion,
    asset.gbConversionDate,
    asset.gbWasMultiHouseAtConversion,
    asset.acquisitionDate,
    transferDate,
  ]);

  /** 사례 35 후속-1 §99-164-10 환산주택가격 미리보기 — useMemo 순수 */
  const convertedHousingPreview = useMemo(() => {
    if (!asset.gbHasFirstDisclosure) return null;
    const firstDisc = parseAmount(asset.gbFirstDisclosurePrice);
    const firstDiscLand = parseAmount(asset.gbFirstDisclosureLandStdPrice);
    const firstDiscBld = parseAmount(asset.gbFirstDisclosureBuildingStdPrice);
    const acqLandPerSqm = parseAmount(asset.gbAcqLandPricePerSqm ?? "");
    const acqBld = parseAmount(asset.gbAcqBuildingValue ?? "");
    const landArea = parseDecimal(asset.gbLandArea ?? "");
    if (!firstDisc || !firstDiscLand || !firstDiscBld || !acqLandPerSqm || !acqBld || !landArea) return null;
    const acqLand = Math.floor(acqLandPerSqm * landArea);
    const acqTotal = acqLand + acqBld;
    const firstDiscTotal = firstDiscLand + firstDiscBld;
    if (firstDiscTotal <= 0 || acqTotal <= 0) return null;
    const converted = Math.floor(firstDisc * acqTotal / firstDiscTotal);
    return { converted, firstDisc, acqTotal, firstDiscTotal };
  }, [
    asset.gbHasFirstDisclosure,
    asset.gbFirstDisclosurePrice,
    asset.gbFirstDisclosureLandStdPrice,
    asset.gbFirstDisclosureBuildingStdPrice,
    asset.gbAcqLandPricePerSqm,
    asset.gbAcqBuildingValue,
    asset.gbLandArea,
  ]);

  return (
    <>
        {/* ⑦ 주택→상가 용도변경 (fuchsia) — 사례 35 (사전법규재산 2022-684·881) */}
        <ToggleCard
          tone="fuchsia"
          variant="card"
          title="주택 → 상가 용도변경"
          description="주택 전체를 근린생활시설 등 비주택으로 용도변경한 경우 ON. 다주택 상태에서 용도변경 시 변경일 이전 보유기간이 장기보유특별공제에서 배제됩니다."
          checked={asset.gbHouseToCommercialConversion}
          onCheckedChange={(v) => onChange({ gbHouseToCommercialConversion: v })}
          trailing={
            <PrecedentArticleModal
              citation="사전법규재산 2022-684"
              label="근거"
              kind="ruling"
              summary={
                "조정대상지역 다주택자가 주택을 상가로 용도변경한 후 중과배제기간(2022-05-10 ~ 2024-05-09) 중 양도하는 경우,\n장기보유특별공제 보유기간 기산일은 용도변경일로 한다.\n변경일 이전 보유기간은 장기보유특별공제 대상에서 배제된다.\n\n관련: 사전법규재산 2022-881 (2022.12.28) — 동일 취지\n     서울행법 2012구단26961 (2013.04.24) — 다주택자 용도변경 LTHD 배제 판결"
              }
            />
          }
        >
          <FieldCard
            label="용도변경일"
            hint="건축물대장 용도변경 처리 완료일. 취득일 이후, 양도일 이전이어야 합니다."
          >
            <DateInput
              value={asset.gbConversionDate}
              onChange={(v) => onChange({ gbConversionDate: v })}
            />
          </FieldCard>

          <FieldCard
            label="변경 당시 다주택자(중과대상)였습니까?"
            hint="'예' 선택 시 변경일 이전 보유기간은 장기보유특별공제에서 배제됩니다 (사전법규재산 2022-684·881 / 서울행법 2012구단26961)."
            trailing={<LawArticleModal legalBasis="소득세법 §95②" label="§95② 표1 장특공제" />}
          >
            <RadioCardGroup
              name="gbWasMultiHouseAtConversion"
              layout="inline"
              value={
                asset.gbWasMultiHouseAtConversion === null
                  ? ""
                  : String(asset.gbWasMultiHouseAtConversion)
              }
              onChange={(v) => onChange({ gbWasMultiHouseAtConversion: v === "true" })}
              options={[
                { value: "true", label: "예 (다주택)", description: "변경일 이전 보유기간 LTHD 배제 — 기산일 = 용도변경일" },
                { value: "false", label: "아니오 (1주택)", description: "당초 취득일 기산 — 변경일 무영향" },
              ]}
            />
          </FieldCard>

          {/* 미리보기 카드 — useMemo 순수 */}
          {conversionPreview && (
            <div
              className={
                "rounded border px-3 py-2 text-xs " +
                (conversionPreview.isUnder3Years
                  ? "bg-amber-50 border-amber-300 text-amber-800"
                  : "bg-emerald-50 border-emerald-300 text-emerald-800")
              }
            >
              <p className="font-semibold">{conversionPreview.label}</p>
              <p className="mt-1">{conversionPreview.notice}</p>
            </div>
          )}

          {/* 사례 35 후속-1: §99-164-10 환산주택가격 (환산취득가 모드만) */}
          {asset.useEstimatedAcquisition && (
            <ToggleCard
              tone="fuchsia"
              variant="card"
              title="주택으로 최초공시 후 상가로 용도변경 (환산취득가)"
              description="취득가액을 모르는 경우 §99-164-10 환산주택가격으로 취득당시 기준시가를 환산합니다."
              checked={asset.gbHasFirstDisclosure}
              onCheckedChange={(v) => onChange({ gbHasFirstDisclosure: v })}
              trailing={
                <PrecedentArticleModal
                  citation="양도소득세 집행기준 99-164-10"
                  label="집행기준"
                  kind="interpretation"
                  summary={
                    "취득당시에는 주택으로 개별주택가격이 고시된 이후 상가건물로 용도를 변경하여 양도하는 경우,\n취득 시 기준시가는 환산주택가격을 자산별 기준시가로 안분하여 토지와 주택분 기준시가를 각각 산정하며,\n양도 시 기준시가는 일반건물과 토지에 대한 기준시가를 적용하여 계산한다.\n\n취득당시의 환산주택가격(기준시가) =\n  최초공시주택가격 × (토지 취득당시의 기준시가 + 건물 취득당시의 기준시가)\n               ÷ (주택가격 최초공시 당시의 토지기준시가와 건물기준시가의 합계액)"
                  }
                />
              }
            >
              <FieldCard label="최초공시주택가격" unit="원"
                hint="주택가격이 최초로 고시된 시점의 개별주택가격 총액 (원)">
                <CurrencyInput label="최초공시주택가격" hideUnit
                  value={asset.gbFirstDisclosurePrice}
                  onChange={(v) => onChange({ gbFirstDisclosurePrice: v })} />
              </FieldCard>
              <FieldCard label="최초공시 당시 토지 기준시가" unit="원"
                hint="최초공시 시점 개별공시지가 × 면적 총액 (원)">
                <CurrencyInput label="최초공시 당시 토지 기준시가" hideUnit
                  value={asset.gbFirstDisclosureLandStdPrice}
                  onChange={(v) => onChange({ gbFirstDisclosureLandStdPrice: v })} />
              </FieldCard>
              <FieldCard label="최초공시 당시 건물 기준시가" unit="원"
                hint="최초공시 시점 건물 기준시가 총액 (원)">
                <CurrencyInput label="최초공시 당시 건물 기준시가" hideUnit
                  value={asset.gbFirstDisclosureBuildingStdPrice}
                  onChange={(v) => onChange({ gbFirstDisclosureBuildingStdPrice: v })} />
              </FieldCard>
              {convertedHousingPreview && (
                <div className="rounded border bg-rose-100/60 border-rose-300 px-3 py-2 text-xs text-rose-800">
                  <p className="font-semibold">
                    환산주택가격 = {convertedHousingPreview.converted.toLocaleString("ko-KR")} 원
                  </p>
                  <p className="mt-1">
                    = {convertedHousingPreview.firstDisc.toLocaleString("ko-KR")}
                    {" × "}
                    {convertedHousingPreview.acqTotal.toLocaleString("ko-KR")}
                    {" ÷ "}
                    {convertedHousingPreview.firstDiscTotal.toLocaleString("ko-KR")}
                  </p>
                  <p className="mt-1 text-rose-600">근거: 양도소득세 집행기준 99-164-10</p>
                </div>
              )}
            </ToggleCard>
          )}
        </ToggleCard>
    </>
  );
}
