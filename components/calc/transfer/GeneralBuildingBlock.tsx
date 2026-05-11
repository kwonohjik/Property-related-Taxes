"use client";

/**
 * GeneralBuildingBlock — 일반건물(토지+건물 일괄) 입력 섹션
 *
 * 진입 조건: assetKind === "general_building" (취득방법 무관 항상 마운트)
 * 섹션 구조:
 *  ① 면적·규모 (sky)         — 항상 표시
 *  ② 양도시 기준시가 (emerald) — 항상 표시 (§166⑥ 토지·건물 안분 비율)
 *  ③ 취득시 기준시가 (amber)   — 환산취득가 모드만
 *  ⑤ 증축 정보 (fuchsia)      — 환산취득가 모드 + gbHasExtension ON 시 (선택)
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
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
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
   * 사례 33 "쌍방+일방 (증축 있음)" 안분 미리보기 — useMemo 순수 계산.
   * 5필드 모두 입력 시에만 결과 표시 (불완전 입력은 null 반환).
   * useEffect → store 미러링 금지 정책 준수.
   */
  const allocationPreview = useMemo(() => {
    if (!asset.gbHasExtension) return null;

    const landAreaVal = parseDecimal(asset.gbLandArea);
    const transferLandPerSqm = parseAmount(asset.gbTransferLandPricePerSqm ?? "");
    const transferBuildingStd = parseAmount(asset.gbTransferBuildingValue ?? "");
    const transferExtStd = parseAmount(asset.gbTransferExtensionBuildingStdPrice ?? "");
    const acqExtStd = parseAmount(asset.gbAcquisitionExtensionBuildingStdPrice ?? "");
    const totalTransfer = parseAmount(asset.actualSalePrice ?? "");
    const bundledAcq = parseAmount(asset.fixedAcquisitionPrice ?? "");
    const acqLandPerSqm = parseAmount(asset.gbAcqLandPricePerSqm ?? "");
    const acqBuildingStd = parseAmount(asset.gbAcqBuildingValue ?? "");

    if (
      !landAreaVal || !transferLandPerSqm || !transferBuildingStd ||
      !transferExtStd || !acqExtStd || !totalTransfer || !bundledAcq ||
      !acqLandPerSqm || !acqBuildingStd
    ) return null;

    // 양도시 기준시가 합계 (§166⑥ 안분 분모)
    const landStdTotal = Math.floor(transferLandPerSqm * landAreaVal);
    const denom = landStdTotal + transferBuildingStd + transferExtStd;
    if (denom <= 0) return null;

    // 양도가액 안분 (토지·건물1·건물2)
    const landTransfer = Math.floor((totalTransfer * landStdTotal) / denom);
    const b1Transfer = Math.floor((totalTransfer * transferBuildingStd) / denom);
    const b2Transfer = totalTransfer - landTransfer - b1Transfer;

    // 일괄 취득가액 안분 (취득시 기준시가 비율 — 토지·건물1)
    const acqLandStd = Math.floor(acqLandPerSqm * landAreaVal);
    const denomAcq = acqLandStd + acqBuildingStd;
    if (denomAcq <= 0) return null;
    const landAcq = Math.floor((bundledAcq * acqLandStd) / denomAcq);
    const b1Acq = bundledAcq - landAcq;

    // 건물2 환산취득가 (§176의2②)
    const b2Estimated = transferExtStd > 0 ? Math.floor((b2Transfer * acqExtStd) / transferExtStd) : 0;

    return { landTransfer, b1Transfer, b2Transfer, landAcq, b1Acq, b2Estimated };
  }, [
    asset.gbHasExtension,
    asset.gbLandArea,
    asset.gbTransferLandPricePerSqm,
    asset.gbTransferBuildingValue,
    asset.gbTransferExtensionBuildingStdPrice,
    asset.gbAcquisitionExtensionBuildingStdPrice,
    asset.actualSalePrice,
    asset.fixedAcquisitionPrice,
    asset.gbAcqLandPricePerSqm,
    asset.gbAcqBuildingValue,
  ]);

  /** 한국어 콤마 포맷 헬퍼 */
  function fmt(n: number): string {
    return n.toLocaleString("ko-KR");
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-violet-900">일반건물 (토지·건물 분리 산정)</p>
        <p className="text-xs text-violet-700">
          소득세법 시행령 §176의2② (환산취득가) · §104의3 (비사업용토지 판정)
        </p>
      </div>
      <div className="space-y-3">

        {/* 시나리오 가이드 — 일반건물 취득 유형 3가지 안내 */}
        <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 text-xs space-y-1.5">
          <p className="font-semibold text-blue-800">일반건물 — 취득 시나리오 가이드</p>
          <ul className="text-blue-700 space-y-0.5">
            <li>• <b>실거래가</b>: 토지·건물 일괄 취득가 입증 가능</li>
            <li>• <b>환산취득가</b>: 토지+건물 전체 입증 불가, 모두 환산 (사례 31)</li>
            <li>• <b>쌍방+일방 (증축 있음)</b>: 원취득은 실가, 증축분만 환산 (사례 33)</li>
          </ul>
        </div>

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

          <FieldCard label="양도시 건물기준시가" unit="원" hint="국세청 홈택스 → 기준시가 조회 → 건물분 기준시가 총액 (원)">
            <CurrencyInput label="양도시 건물기준시가" hideUnit value={asset.gbTransferBuildingValue} onChange={(v) => onChange({ gbTransferBuildingValue: v })} />
          </FieldCard>
        </div>

        {/* ③ 취득시 기준시가 (amber) — 환산취득가 모드만 */}
        {isEstimated && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800 select-none">③</span>
              <p className="text-xs font-semibold text-amber-700">취득시 기준시가 (환산 분자 + 개산공제 기준)</p>
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

            <div className="rounded bg-violet-50/60 border border-violet-200 px-3 py-2 text-xs text-violet-700 space-y-0.5">
              <p className="font-semibold">개산공제 (§163⑥)</p>
              <p>토지: 취득시 공시지가 × 토지면적 × 3%</p>
              <p>건물: 취득시 건물기준시가 총액 × 3%</p>
            </div>
          </div>
        )}

        {/* ⑤ 증축 정보 (amber) — 환산취득가 모드에서 선택적 */}
        {isEstimated && (
          <ToggleCard
            tone="amber"
            variant="card"
            title="증축 있음"
            description="사례 33: 양도코리아 '쌍방+일방' 케이스 — 원취득은 실가, 증축분(건물2)은 입증 불가로 환산취득가 적용. 라디오에서 '쌍방+일방 (증축 있음)' 선택 시 자동 활성화."
            checked={asset.gbHasExtension}
            onCheckedChange={(v) => onChange({ gbHasExtension: v })}
          >
            {/* 증축일 */}
            <FieldCard
              label="증축일"
              hint="건축물대장 사용승인일 또는 실제 사용일 (영 §162①4호)"
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

            <div className="rounded bg-fuchsia-50/60 border border-fuchsia-200 px-3 py-2 text-xs text-fuchsia-700 space-y-0.5">
              <p className="font-semibold">환산취득가 (§176의2②)</p>
              <p>건물2 양도가 × (취득시 건물기준시가 ÷ 양도시 건물기준시가)</p>
              <p className="mt-0.5 font-semibold">개산공제 (§163⑥)</p>
              <p>취득시 건물기준시가 총액 × 3%</p>
            </div>

            {/* 자동 안분 미리보기 — 5필드 모두 입력 시에만 표시 (참고용) */}
            {allocationPreview && (
              <div className="rounded bg-amber-100/60 border border-amber-200 px-3 py-2 text-xs text-amber-800 space-y-1">
                <p className="font-semibold">자동 안분 미리보기 (참고용)</p>
                <p>양도가액 안분 → 토지: {fmt(allocationPreview.landTransfer)} / 건물1: {fmt(allocationPreview.b1Transfer)} / 건물2: {fmt(allocationPreview.b2Transfer)}</p>
                <p>일괄 취득가 안분 → 토지: {fmt(allocationPreview.landAcq)} / 건물1: {fmt(allocationPreview.b1Acq)}</p>
                <p>건물2 환산취득가: {fmt(allocationPreview.b2Estimated)}</p>
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
          <p className="text-[11px] text-rose-600">
            부수토지 한도 = 수평투영면적 × 용도지역 배율. 초과분에만 +10%p 중과.
          </p>

          {/* 무허가건축물 — 배율 무관 전체 NBL */}
          <ToggleCard
            tone="rose"
            variant="chip"
            title="무허가(미등재) 건축물"
            description="건축물대장 미등재 시 배율 무관 토지 전체 비사업용 (§168의11①1호)"
            checked={asset.gbIsUnregistered}
            onCheckedChange={(v) => onChange({ gbIsUnregistered: v })}
          />

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

      </div>
    </div>
  );
}
