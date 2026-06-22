"use client";

/**
 * GeneralBuildingBlock — 일반건물(토지+건물 일괄) 입력 섹션
 *
 * 진입 조건: assetKind === "general_building" (취득방법 무관 항상 마운트)
 * 섹션 구조:
 *  ① 면적·규모 (sky)         — 항상 표시
 *  ② 양도시 기준시가 (emerald) — 항상 표시 (§166⑥ 토지·건물 안분 비율)
 *  ③ 취득시 기준시가 (amber)   — 환산취득가 모드 OR "토지·건물 일괄 (증축분 별도)" 모드 (일괄 취득가 안분에 필요)
 *  ⑤ 증축 정보 (amber)          — 환산취득가 모드 OR gbHasExtension ON 시 (선택); 증축분 취득방식 서브 라디오로 4가지 조합 지원
 *  ④ 비사업용토지 판정 (rose)  — 항상 표시 (§104의3·§168의12)
 *
 * 정책 준수:
 *  - placeholder 숫자 예시 금지
 *  - useEffect → store 미러링 금지
 *  - 자동 안분 fallback 금지
 *  - 용도지역 미입력 시 계산 차단 (fallback 3배 금지)
 */

import { useMemo } from "react";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { PrecedentArticleModal } from "@/components/ui/precedent-article-modal";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { DateInput } from "@/components/ui/date-input";

// §168의12 배율표 기준 용도지역 선택지
// (수도권/비수도권 배율 차이는 gbIsMetropolitan 토글로 반영)
const GB_ZONE_OPTIONS = [
  { value: "exclusive_residential", label: "전용주거" },
  { value: "general_residential",   label: "일반주거" },
  { value: "semi_residential",      label: "준주거" },
  { value: "commercial",            label: "상업지역" },
  { value: "industrial",            label: "공업지역" },
  { value: "green",                 label: "녹지지역" },
  { value: "management",            label: "관리지역" },
  { value: "agriculture_forest",    label: "농림지역" },
  { value: "natural_env",           label: "자연환경보전" },
  { value: "unplanned",             label: "도시계획 미지정" },
];

/** 용도지역 + 수도권 여부 → 배율 문자열 (UI 표시용) */
function getMultiplierLabel(zoneType: string, isMetro: boolean): string {
  const urban = ["exclusive_residential","general_residential","semi_residential",
    "commercial","industrial","green","unplanned"].includes(zoneType);
  if (!urban) return "10배 (도시지역 外)";
  if (isMetro) {
    if (zoneType === "green") return "5배 (수도권 녹지)";
    if (["exclusive_residential","general_residential","semi_residential",
      "commercial","industrial"].includes(zoneType)) return "3배 (수도권 주·상·공)";
    return "5배 (수도권 기타)";
  }
  return "5배 (수도권 밖 도시)";
}

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}

export function GeneralBuildingBlock({ asset, onChange, transferDate }: Props) {
  const isEstimated = asset.useEstimatedAcquisition;
  // 건물 기준시가 모달 prefill — 자산 카드 소재지 재사용(이중입력 방지)
  const stdPriceAddress = {
    road: asset.addressRoad,
    jibun: asset.addressJibun,
    building: asset.buildingName,
    detail: asset.addressDetail,
    lng: asset.longitude,
    lat: asset.latitude,
  };

  // 자동 배율 표시 (용도지역 입력 시)
  const multiplierLabel = useMemo(() => {
    if (!asset.gbZoneType) return null;
    return getMultiplierLabel(asset.gbZoneType, asset.gbIsMetropolitan);
  }, [asset.gbZoneType, asset.gbIsMetropolitan]);

  // 인정 한도 미리 계산 (토지·수평투영면적 + 배율)
  const footprint = parseDecimal(asset.gbBuildingFootprintArea);
  const landArea = parseDecimal(asset.gbLandArea);
  const multiplierNum = multiplierLabel?.startsWith("3") ? 3 : multiplierLabel?.startsWith("5") ? 5 : 10;
  const allowedArea = footprint > 0 && asset.gbZoneType ? footprint * multiplierNum : null;

  /**
   * 증축 있음 안분 미리보기 — 4가지 조합 모두 지원.
   * - 원건물: isOriginActual = !useEstimatedAcquisition
   * - 증축분: extMode = gbExtensionAcquisitionMode ("estimated" | "actual")
   * 완전 입력 시에만 결과 표시 (불완전 입력은 null 반환).
   * useEffect → store 미러링 금지 정책 준수.
   */
  const allocationPreview = useMemo(() => {
    if (!asset.gbHasExtension) return null;

    const landAreaVal = parseDecimal(asset.gbLandArea);
    const transferLandPerSqm = parseAmount(asset.gbTransferLandPricePerSqm ?? "");
    const transferBuildingStd = parseAmount(asset.gbTransferBuildingValue ?? "");
    const transferExtStd = parseAmount(asset.gbTransferExtensionBuildingStdPrice ?? "");
    const totalTransfer = parseAmount(asset.actualSalePrice ?? "");
    const acqLandPerSqm = parseAmount(asset.gbAcqLandPricePerSqm ?? "");
    const acqBuildingStd = parseAmount(asset.gbAcqBuildingValue ?? "");

    const isOriginActual = !asset.useEstimatedAcquisition;
    const extMode = asset.gbExtensionAcquisitionMode || "estimated";

    // 양도가액 안분 — §166⑥ (3-way: 토지·건물1·건물2 기준시가 비율)
    // 증축분 양도시 기준시가는 모드 무관 항상 필요 (안분 분모 구성)
    if (!landAreaVal || !transferLandPerSqm || !transferBuildingStd || !transferExtStd || !totalTransfer) return null;
    const landStdTotal = Math.floor(transferLandPerSqm * landAreaVal);
    const denom = landStdTotal + transferBuildingStd + transferExtStd;
    if (denom <= 0) return null;

    const landTransfer = Math.floor((totalTransfer * landStdTotal) / denom);
    const b1Transfer = Math.floor((totalTransfer * transferBuildingStd) / denom);
    const b2Transfer = totalTransfer - landTransfer - b1Transfer;

    // Step 2: 원건물 취득가 안분 — 모드별
    let landAcq: number, b1Acq: number;
    if (isOriginActual) {
      // 실가 모드: 일괄 취득가를 취득시 기준시가 비율로 토지·건물1 안분
      const bundledAcq = parseAmount(asset.fixedAcquisitionPrice ?? "");
      if (!bundledAcq || !acqLandPerSqm || !acqBuildingStd) return null;
      const acqLandStd = Math.floor(acqLandPerSqm * landAreaVal);
      const denomAcq = acqLandStd + acqBuildingStd;
      if (denomAcq <= 0) return null;
      landAcq = Math.floor((bundledAcq * acqLandStd) / denomAcq);
      b1Acq = bundledAcq - landAcq;
    } else {
      // 환산 모드: 안분 양도가 × (취득시 기준시가 ÷ 양도시 기준시가)
      if (!acqLandPerSqm || !acqBuildingStd) return null;
      const acqLandStd = Math.floor(acqLandPerSqm * landAreaVal);
      landAcq = Math.floor((landTransfer * acqLandStd) / landStdTotal);
      b1Acq = Math.floor((b1Transfer * acqBuildingStd) / transferBuildingStd);
    }

    // Step 3: 증축분 취득가 — 모드별
    let b2Acq: number;
    if (extMode === "estimated") {
      const acqExtStd = parseAmount(asset.gbAcquisitionExtensionBuildingStdPrice ?? "");
      if (!acqExtStd) return null;
      b2Acq = transferExtStd > 0 ? Math.floor((b2Transfer * acqExtStd) / transferExtStd) : 0;
    } else {
      // 실가 모드: 입력된 실거래가 직접 사용 (미입력 시 0)
      b2Acq = parseAmount(asset.gbExtensionActualAcquisitionPrice ?? "") || 0;
    }

    return { landTransfer, b1Transfer, b2Transfer, landAcq, b1Acq, b2Acq, isOriginActual, extMode };
  }, [
    asset.gbHasExtension,
    asset.gbLandArea,
    asset.gbTransferLandPricePerSqm,
    asset.gbTransferBuildingValue,
    asset.gbTransferExtensionBuildingStdPrice,
    asset.gbAcquisitionExtensionBuildingStdPrice,
    asset.gbExtensionActualAcquisitionPrice,
    asset.actualSalePrice,
    asset.fixedAcquisitionPrice,
    asset.gbAcqLandPricePerSqm,
    asset.gbAcqBuildingValue,
    asset.useEstimatedAcquisition,
    asset.gbExtensionAcquisitionMode,
  ]);

  /** 한국어 콤마 포맷 헬퍼 */
  function fmt(n: number): string {
    return n.toLocaleString("ko-KR");
  }

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

  const isBurdenedGift = asset.transferType === "burdened_gift";

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-violet-900">일반건물 (토지·건물 분리 산정)</p>
        <p className="text-xs text-violet-700">
          소득세법 시행령 §176의2② (환산취득가) · §104의3 (비사업용토지 판정)
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="소득세법 §104의3" label="§104의3 비사업용" />
        </div>
      </div>
      <div className="space-y-3">

        {/* 부담부증여 모드 안내 — §159 자동 산정으로 취득가액 산정 방식 라디오/실거래가/증축 토글 모두 숨김 */}
        {isBurdenedGift && (
          <div className="rounded-lg border border-fuchsia-300 bg-fuchsia-50/60 p-3 text-xs space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="font-semibold text-fuchsia-900">
                부담부증여 §159 자동 산정 — 취득가액 산정 방식 선택 불필요
              </p>
              <LawArticleModal legalBasis="소득세법 시행령 §159" label="§159 부담부증여" />
            </div>
            <p className="text-fuchsia-800">
              부담부증여(소득세법 시행령 §159)는 양도가/취득가 모두 <b>채무비율 × 자산별 기준시가</b>로
              엔진이 자동 산정합니다. 실거래가/환산취득가/증축 모드 선택·일괄 취득가 입력이 모두 무의미하므로
              아래에는 §159 산식에 필요한 정보(면적·양도시·취득시 기준시가)만 표시됩니다.
            </p>
          </div>
        )}

        {/* 시나리오 가이드 — 일반 양도에서만 표시 (부담부증여 시 §159 강제로 의미 없음) */}
        {!isBurdenedGift && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 text-xs space-y-1.5">
            <p className="font-semibold text-blue-800">일반건물 — 취득 시나리오 가이드</p>
            <ul className="text-blue-700 space-y-0.5">
              <li>• <b>실거래가</b>: 토지·건물 일괄 취득가 입증 가능</li>
              <li>• <b>환산취득가</b>: 토지+건물 전체 입증 불가, 모두 환산</li>
              <li>• <b>토지·건물 일괄 (증축분 별도)</b>: 토지·원건물은 실거래가 일괄, 증축분만 환산</li>
              <li className="text-blue-600 mt-1">
                • 그 외 4가지 조합 (쌍방+쌍방·일방+쌍방·일방+일방): 위 라디오 1/2 선택 후 증축 토글 ON → 서브 라디오로 증축분 취득방식 선택
              </li>
            </ul>
          </div>
        )}

        {/* ① 면적·규모 (sky) — 항상 표시 */}
        <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">①</span>
            <p className="text-xs font-semibold text-sky-700">면적·규모</p>
          </div>

          <FieldCard label="토지면적" unit="㎡" hint="등기부등본 또는 토지대장 기재 토지면적 (㎡)">
            <DecimalInput value={asset.gbLandArea} onChange={(v) => onChange({ gbLandArea: v })} />
          </FieldCard>

          {isEstimated && (
            <FieldCard label="건물 연면적" unit="㎡" hint="건축물대장 기재 각층 바닥면적 합계 (㎡). 환산취득가 참고용.">
              <DecimalInput value={asset.gbBuildingArea} onChange={(v) => onChange({ gbBuildingArea: v })} />
            </FieldCard>
          )}

          <FieldCard
            label="건물 수평투영면적"
            unit="㎡"
            hint="건축물대장 '건축면적' 또는 1층 바닥면적. 비사업용토지 판정 기준 (§168의12)"
          >
            <DecimalInput value={asset.gbBuildingFootprintArea} onChange={(v) => onChange({ gbBuildingFootprintArea: v })} />
          </FieldCard>
        </div>

        {/* ② 양도시 기준시가 (emerald) — 항상 표시 (§166⑥ 토지·건물 안분 비율 결정) */}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-[10px] font-bold text-emerald-800 select-none">②</span>
            <p className="text-xs font-semibold text-emerald-700">양도시 기준시가 (토지·건물 안분 비율)</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <LawArticleModal legalBasis="소득세법 시행령 §166⑥" label="§166⑥ 안분" />
          </div>
          <p className="text-[11px] text-emerald-600">
            {isEstimated
              ? "환산취득가 분모 + 양도가액 안분 기준. 취득 기준시가는 아래 ③ 섹션에서 별도 입력."
              : "실거래가 합계를 토지·건물로 안분하는 기준시가 (§166⑥). 취득가액도 같은 비율로 안분됩니다."}
          </p>

          <LandPriceLookupField
            label="양도시 토지 공시지가"
            pricePerSqm={asset.gbTransferLandPricePerSqm}
            onPricePerSqmChange={(v) => onChange({ gbTransferLandPricePerSqm: v })}
            area={parseDecimal(asset.gbLandArea) || undefined}
            referenceDate={transferDate}
            jibun={asset.addressJibun}
            hint="양도일 전년도 기준 개별공시지가 (원/㎡). Vworld 또는 토지이음에서 조회."
          />

          <FieldCard label="양도시 건물기준시가" unit="원" hint="국세청 홈택스 → 기준시가 조회 → 건물분 기준시가 총액 (원). 모르면 아래 계산기로 산정.">
            <CurrencyInput label="양도시 건물기준시가" hideUnit value={asset.gbTransferBuildingValue} onChange={(v) => onChange({ gbTransferBuildingValue: v })} />
          </FieldCard>
          <div className="flex justify-end">
            <BuildingStdPriceModalButton lockedTaxType="transfer" initialAddress={stdPriceAddress} snapshotKey={`bsp-${asset.assetId}-gb-transfer`} onApply={(v) => onChange({ gbTransferBuildingValue: String(v) })} />
          </div>
        </div>

        {/* ③ 취득시 기준시가 (amber) — 환산취득가 / 일괄(증축) / 부담부증여(§159①1호 환산) 모드 */}
        {(isEstimated || asset.gbHasExtension || asset.transferType === "burdened_gift") && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800 select-none">③</span>
              <p className="text-xs font-semibold text-amber-700">취득시 기준시가 (환산 분자 + 개산공제 기준)</p>
              <LawArticleModal legalBasis="소득세법 시행령 §163⑥" label="§163⑥ 개산공제" />
            </div>

            <LandPriceLookupField
              label="취득시 토지 공시지가"
              pricePerSqm={asset.gbAcqLandPricePerSqm}
              onPricePerSqmChange={(v) => onChange({ gbAcqLandPricePerSqm: v })}
              area={parseDecimal(asset.gbLandArea) || undefined}
              referenceDate={asset.acquisitionDate}
              jibun={asset.addressJibun}
              hint="취득일 전년도 기준 개별공시지가 (원/㎡)"
            />

            <FieldCard label="취득시 건물기준시가" unit="원" hint="취득일 기준 건물기준시가 총액. 이 금액의 3%가 건물 개산공제액 (§163⑥)">
              <CurrencyInput label="취득시 건물기준시가" hideUnit value={asset.gbAcqBuildingValue} onChange={(v) => onChange({ gbAcqBuildingValue: v })} />
            </FieldCard>
            <div className="flex justify-end">
              <BuildingStdPriceModalButton lockedTaxType="transfer" initialAddress={stdPriceAddress} snapshotKey={`bsp-${asset.assetId}-gb-acq`} onApply={(v) => onChange({ gbAcqBuildingValue: String(v) })} />
            </div>

            <div className="rounded bg-violet-50/60 border border-violet-200 px-3 py-2 text-xs text-violet-700 space-y-0.5">
              <p className="font-semibold">개산공제 (§163⑥)</p>
              <p>토지: 취득시 공시지가 × 토지면적 × 3%</p>
              <p>건물: 취득시 건물기준시가 총액 × 3%</p>
            </div>

            {/* 부담부증여 §159①1호 단서 안내 — 사용자 입력 실거래가 무시 */}
            {asset.transferType === "burdened_gift" && (
              <div className="rounded bg-fuchsia-50/60 border border-fuchsia-200 px-3 py-2 text-xs text-fuchsia-800 space-y-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="font-semibold">부담부증여 §159①1호 단서</p>
                  <LawArticleModal legalBasis="소득세법 시행령 §159①" label="§159① 부담부증여" />
                </div>
                <p>
                  양도가액이 채무액(=기준시가 모드와 동치)으로 의제되므로
                  취득가액도 <b>취득시 기준시가 × 채무비율</b>로 환산됩니다.
                  취득 정보의 <b>실거래가 입력값은 §159 환산 산식에서 무시</b>됩니다.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ⑤ 증축 정보 (amber) — 환산취득가 모드 OR "토지·건물 일괄(증축분 별도)" 모드에서 표시.
            부담부증여 모드에서는 §159 자동 산정 — 증축 cross-cutting 비스코프이므로 숨김. */}
        {!isBurdenedGift && (isEstimated || asset.gbHasExtension) && (
          <ToggleCard
            tone="amber"
            variant="card"
            title="증축 있음"
            description="예제 '쌍방+일방' 케이스 — 원취득은 실가, 증축분(건물2)은 입증 불가로 환산취득가 적용. 토지 취득방식 라디오에서 '토지·건물 일괄 (증축분 별도)' 선택 시 자동 활성화."
            checked={asset.gbHasExtension}
            onCheckedChange={(v) => onChange({ gbHasExtension: v })}
          >
            {/* 증축일 */}
            <FieldCard
              label="증축일"
              hint="건축물대장 사용승인일 또는 실제 사용일 (영 §162①4호)"
              trailing={<LawArticleModal legalBasis="소득세법 시행령 §162①" label="§162①4호 취득시기" />}
            >
              <DateInput
                value={asset.gbExtensionDate}
                onChange={(v) => onChange({ gbExtensionDate: v })}
              />
            </FieldCard>

            {/* 증축 면적 */}
            <FieldCard
              label="증축 연면적"
              unit="㎡"
              hint="증축된 부분의 연면적 (㎡). 모르는 경우 비워두세요."
            >
              <DecimalInput
                value={asset.gbExtensionArea}
                onChange={(v) => onChange({ gbExtensionArea: v })}
              />
            </FieldCard>

            {/* 증축분 취득방식 (실가/환산) — 원취득과 독립 선택 */}
            <FieldCard
              label="증축분 취득 방식"
              hint="원취득과 무관하게 증축분의 취득가액 산정 방식을 별도로 선택합니다."
            >
              <RadioCardGroup
                name="gbExtensionAcquisitionMode"
                layout="inline"
                value={asset.gbExtensionAcquisitionMode || "estimated"}
                onChange={(v) => onChange({ gbExtensionAcquisitionMode: v as "actual" | "estimated" })}
                options={[
                  { value: "estimated", label: "환산취득가 (기본)" },
                  { value: "actual",    label: "실거래가 (별도 입력)" },
                ]}
              />
            </FieldCard>

            {/* 환산 모드: 기준시가 2필드 */}
            {(asset.gbExtensionAcquisitionMode === "estimated" || !asset.gbExtensionAcquisitionMode) && (
              <>
                {/* 양도시 건물2 기준시가 */}
                <FieldCard
                  label="양도시 건물2 기준시가 총액"
                  unit="원"
                  hint="국세청 홈택스 → 기준시가 조회 → 증축 건물분 기준시가 총액 (원). ㎡당 단가가 아닌 총액(원)."
                >
                  <CurrencyInput
                    label="양도시 건물2 기준시가 총액"
                    hideUnit
                    value={asset.gbTransferExtensionBuildingStdPrice}
                    onChange={(v) => onChange({ gbTransferExtensionBuildingStdPrice: v })}
                  />
                </FieldCard>

                {/* 취득시(증축시) 건물2 기준시가 */}
                <FieldCard
                  label="취득시(증축시) 건물2 기준시가 총액"
                  unit="원"
                  hint="증축 완료 시점 건물2 기준시가 총액 (원). 환산취득가 분자. ㎡당 단가가 아닌 총액(원)."
                >
                  <CurrencyInput
                    label="취득시(증축시) 건물2 기준시가 총액"
                    hideUnit
                    value={asset.gbAcquisitionExtensionBuildingStdPrice}
                    onChange={(v) => onChange({ gbAcquisitionExtensionBuildingStdPrice: v })}
                  />
                </FieldCard>
              </>
            )}

            {/* 실가 모드: 실거래가·필요경비 2필드 */}
            {asset.gbExtensionAcquisitionMode === "actual" && (
              <>
                {/* 양도시 건물2 기준시가 (실가 모드에서도 §166⑥ 안분 분모 구성에 필요) */}
                <FieldCard
                  label="양도시 건물2 기준시가 총액"
                  unit="원"
                  hint="§166⑥ 양도가액 안분 분모 계산에 필요합니다. 국세청 홈택스 → 기준시가 조회 → 증축 건물분 기준시가 총액 (원)."
                >
                  <CurrencyInput
                    label="양도시 건물2 기준시가 총액"
                    hideUnit
                    value={asset.gbTransferExtensionBuildingStdPrice}
                    onChange={(v) => onChange({ gbTransferExtensionBuildingStdPrice: v })}
                  />
                </FieldCard>

                <FieldCard
                  label="증축 실거래가"
                  unit="원"
                  hint="증축 시 실제로 지출한 비용. 영수증·계약서 등으로 입증 가능한 경우만."
                >
                  <CurrencyInput
                    label="증축 실거래가"
                    hideUnit
                    value={asset.gbExtensionActualAcquisitionPrice}
                    onChange={(v) => onChange({ gbExtensionActualAcquisitionPrice: v })}
                  />
                </FieldCard>

                <FieldCard
                  label="증축 실제 필요경비"
                  unit="원"
                  hint="증축 시 발생한 중개수수료·인지대 등. 없으면 비워두세요."
                >
                  <CurrencyInput
                    label="증축 실제 필요경비"
                    hideUnit
                    value={asset.gbExtensionActualExpenses}
                    onChange={(v) => onChange({ gbExtensionActualExpenses: v })}
                  />
                </FieldCard>
              </>
            )}

            {/* 증축 취득원인 */}
            <FieldCard label="증축 취득원인" hint="자가증축(신축자가건축)이 기본입니다. 타인에게 매수한 경우 매매 선택.">
              <RadioCardGroup
                name="gbExtensionAcquisitionCause"
                layout="inline"
                value={asset.gbExtensionAcquisitionCause ?? "newConstruction"}
                onChange={(v) => onChange({ gbExtensionAcquisitionCause: v as "purchase" | "newConstruction" })}
                options={[
                  { value: "newConstruction", label: "자가증축" },
                  { value: "purchase",        label: "매매" },
                ]}
              />
            </FieldCard>

            {/* §114조의2① 85㎡ 초과 게이트 — 자가증축 시만 표시 (경고용, 미입력=85㎡ 이하 처리) */}
            {asset.gbExtensionAcquisitionCause === "newConstruction" && (
              <FieldCard
                label="증축부분 바닥면적 합계"
                unit="㎡"
                hint="§114조의2① 가산세 발동 여부 판정 전용. 85㎡ 초과 시 가산세 적용. 모르는 경우 비워두세요."
              >
                <DecimalInput
                  value={asset.gbExtensionFloorArea85}
                  onChange={(v) => onChange({ gbExtensionFloorArea85: v })}
                />
              </FieldCard>
            )}

            {(asset.gbExtensionAcquisitionMode === "estimated" || !asset.gbExtensionAcquisitionMode) && (
              <div className="rounded bg-fuchsia-50/60 border border-fuchsia-200 px-3 py-2 text-xs text-fuchsia-700 space-y-0.5">
                <p className="font-semibold">환산취득가 (§176의2②)</p>
                <p>건물2 양도가 × (취득시 건물기준시가 ÷ 양도시 건물기준시가)</p>
                <p className="mt-0.5 font-semibold">개산공제 (§163⑥)</p>
                <p>취득시 건물기준시가 총액 × 3%</p>
              </div>
            )}

            {/* 안분 미리보기 — 4가지 조합 모두 지원, 필수 입력 완료 시에만 표시 */}
            {allocationPreview && (
              <div className="rounded bg-amber-100/60 border border-amber-200 px-3 py-2 text-xs text-amber-800 space-y-1">
                <p className="font-semibold">
                  안분 미리보기 (참고용)
                  <span className="ml-1.5 rounded-full px-1.5 py-0.5 bg-amber-200 text-amber-900 text-[10px]">
                    원건물 {allocationPreview.isOriginActual ? "실가" : "환산"} + 증축 {allocationPreview.extMode === "actual" ? "실가" : "환산"}
                  </span>
                </p>
                <p>양도가액 안분 → 토지: {fmt(allocationPreview.landTransfer)} / 건물1: {fmt(allocationPreview.b1Transfer)} / 건물2: {fmt(allocationPreview.b2Transfer)}</p>
                <p>
                  원건물 취득가 → 토지: {fmt(allocationPreview.landAcq)} / 건물1: {fmt(allocationPreview.b1Acq)}
                  {allocationPreview.isOriginActual ? " (실가 안분)" : " (환산)"}
                </p>
                <p>
                  건물2 취득가: {fmt(allocationPreview.b2Acq)}
                  {allocationPreview.extMode === "actual" ? " (실거래가)" : " (환산취득가)"}
                </p>
                <p className="text-[10px] text-amber-700">엔진 실제 계산값은 결과 단계에서 확인됩니다.</p>
              </div>
            )}
          </ToggleCard>
        )}

        {/* ④ 비사업용토지 판정 (rose) — 항상 표시 */}
        <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-200 text-[10px] font-bold text-rose-800 select-none">④</span>
            <p className="text-xs font-semibold text-rose-700">비사업용토지 판정</p>
            <span className="text-[10px] text-rose-500">(§104의3·§168의12)</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <LawArticleModal legalBasis="소득세법 §104의3" label="§104의3 비사업용" />
            <LawArticleModal legalBasis="소득세법 시행령 §168의12" label="§168의12 배율" />
          </div>
          <p className="text-[11px] text-rose-600">
            부수토지 한도 = 수평투영면적 × 용도지역 배율. 초과분에만 +10%p 중과.
          </p>

          {/* 무허가건축물 — 배율 무관 전체 NBL */}
          <ToggleCard
            tone="rose"
            variant="chip"
            title="무허가(미등재) 건축물"
            description="무허가건축물 부속토지는 재산세 별도합산에서 제외되어 토지 전체가 비사업용 (배율 계산 없음)"
            checked={asset.gbIsUnregistered}
            onCheckedChange={(v) => onChange({ gbIsUnregistered: v })}
          />
          {asset.gbIsUnregistered && (
            <div className="flex flex-wrap items-center gap-1.5">
              <LawArticleModal legalBasis="소득세법 §104의3 ① 4호 나목" label="§104의3①4호나목" />
              <LawArticleModal legalBasis="지방세법 시행령 §101 ① 단서" label="지방세법시행령 §101①단서" />
            </div>
          )}

          {!asset.gbIsUnregistered && (
            <>
              {/* 용도지역 */}
              <FieldCard
                label="용도지역 (필수)"
                hint="국토계획법상 용도지역. 미선택 시 계산이 진행되지 않습니다."
              >
                <RadioCardGroup
                  name="gbZoneType"
                  layout="inline"
                  value={asset.gbZoneType}
                  onChange={(v) => onChange({ gbZoneType: v })}
                  options={GB_ZONE_OPTIONS}
                />
              </FieldCard>

              {/* 수도권 여부 */}
              <ToggleCard
                tone="rose"
                variant="chip"
                title="수도권 소재 (서울·경기·인천)"
                description="수도권 주·상·공: 3배 / 녹지: 5배. 비수도권 도시: 5배."
                checked={asset.gbIsMetropolitan}
                onCheckedChange={(v) => onChange({ gbIsMetropolitan: v })}
              />

              {/* 배율·인정한도 자동 표시 */}
              {asset.gbZoneType && (
                <div className="rounded bg-rose-100/60 border border-rose-200 px-3 py-2 text-xs text-rose-800 space-y-0.5">
                  <p>적용 배율: <span className="font-semibold">{multiplierLabel}</span></p>
                  {footprint > 0 && allowedArea !== null && (
                    <p>인정 한도: {footprint}㎡ × {multiplierNum}배 = <span className="font-semibold tabular-nums">{allowedArea.toFixed(2)} ㎡</span></p>
                  )}
                  {footprint > 0 && landArea > 0 && allowedArea !== null && (
                    landArea <= allowedArea
                      ? <p className="text-emerald-700 font-semibold">→ 사업용 (중과 미발동)</p>
                      : <p className="text-rose-700 font-semibold">→ 초과분 {(landArea - allowedArea).toFixed(2)}㎡ 비사업용 (중과)</p>
                  )}
                </div>
              )}
            </>
          )}

          {asset.gbIsUnregistered && (
            <div className="rounded bg-rose-100/60 border border-rose-200 px-3 py-2 text-xs text-rose-700">
              무허가건축물 — 토지 전체 비사업용 (배율 계산 없음)
            </div>
          )}
        </div>

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

      </div>
    </div>
  );
}
