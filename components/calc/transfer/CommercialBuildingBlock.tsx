"use client";

/**
 * CommercialBuildingBlock — 상업용건물·오피스텔 환산취득가 입력 섹션
 *
 * assetKind === "commercial_building" + useEstimatedAcquisition 진입 시 렌더.
 * 소득세법 시행령 §164⑥ (호별고시 전 취득 역환산) + §176조의2②2호 (환산취득가).
 *
 * 구조:
 *  ① 호별 ㎡당 고시가 (amber/emerald)
 *  ② 개별공시지가 3시점 (amber+emerald)
 *  ③ 건물 기준시가 3시점 — 총액 (pre_disclosure 시만, amber+emerald)
 *
 * ⚠️ ②(토지)가 ③(건물)보다 **먼저**다 — 엔진 조립 순서(토지→건물)와 일치시키고,
 *    건물 기준시가 계산기가 ②의 공시지가를 위치지수 입력으로 prefill 받기 때문이다.
 *
 * ⚠️ 면적 3필드(전용·공유·대지)는 **① 기본정보**로 이전했다(2026-08-04) —
 *    `asset-sections/AssetAreaCommercial.tsx`. 종전에는 이 블록(비상속)과
 *    `CommercialInheritanceStdPriceSection`(상속)이 같은 3필드를 각각 렌더해
 *    취득원인에 따라 입력 위치가 달라졌다. 여기에 면적 칸을 다시 추가하지 말 것.
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
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { CommercialStdPriceLookupModal } from "@/components/calc/transfer/CommercialStdPriceLookupModal";
import { isSec164_5ProvisoApplicable } from "@/lib/calc/commercial-164-6-proviso";
import { Sec164_5ProvisoNotice } from "@/components/calc/transfer/Sec164_5ProvisoNotice";
import { Sec164_8ProvisoInput } from "@/components/calc/transfer/Sec164_8ProvisoInput";
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import { CommercialPre1990LandNotice } from "@/components/calc/transfer/CommercialPre1990LandNotice";
import { derivePre1990CommercialLandPricePerSqmAtAcqString } from "@/lib/calc/transfer-pre1990-commercial-bridge";
import { isCommercialPre1990Acquisition } from "@/lib/calc/transfer-pre1990-commercial-bridge";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { resolveCbEra } from "@/lib/calc/commercial-cb-era";
import { COMMERCIAL_FIRST_DISCLOSURE_YEAR } from "@/lib/calc/commercial-cb-era";
import { MultiPointBuildingStdPriceModal } from "@/components/calc/building-std-price/MultiPointBuildingStdPriceModal";
import type { MultiPointStdPriceApply } from "@/components/calc/building-std-price/MultiPointBuildingStdPriceModal";
import { canUseMultiPointStdPrice } from "@/lib/calc/building-std-multipoint-gate";
import { MULTI_POINT_BLOCK_MESSAGE, multiPointBlockReason } from "@/lib/calc/building-std-multipoint-gate";
import { isAcq2001LocationIndexTrack } from "@/lib/calc/phd-acq-land-price-track";
import { buildCommercialBatchPatch } from "@/lib/calc/building-std-batch-apply";
import { buildAcqBuildingStdEditPatch } from "@/lib/calc/building-std-batch-apply";
import { isCbEraAutoDerived } from "@/lib/calc/commercial-cb-era";
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
    dong: asset.addressDong || undefined,
    ho: asset.addressHo || undefined,
  };
  const isOn = asset.useEstimatedAcquisition && asset.assetKind === "commercial_building";
  // 취득일에서 자동 판정(2005-01-01 경계) — 사용자가 라디오를 직접 고르면 그 값이 우선한다.
  // API 변환·validate도 같은 `resolveCbEra`를 쓴다(3중 패턴 — dual-truth 방지).
  const effEra = resolveCbEra(asset);
  const eraAutoDerived = isCbEraAutoDerived(asset);
  const isPreDisclosure = effEra === "pre_disclosure";
  const isPostDisclosure = effEra === "post_disclosure";
  const hasEra = isPreDisclosure || isPostDisclosure;
  // §164⑥ 단서 — 취득연도 ≤2000은 나목(건물 기준시가) 가액이 없어 §164⑤ 준용 산정이 필요하다.
  const needs164_5 = isSec164_5ProvisoApplicable(effEra, asset.acquisitionDate);
  // §164④ — 취득이 개별공시지가 고시(1990.8.30.) 전이면 가목의 가액이 없어 토지등급 환산이 필요하다.
  const needs164_4 = isCommercialPre1990Acquisition(asset);
  // 파생값(store 미저장) — 표시 fallback. API·validate도 같은 함수로 동일 fallback을 쓴다.
  const pre1990LandAtAcq = derivePre1990CommercialLandPricePerSqmAtAcqString(asset, transferDate ?? "");

  /**
   * P3 — 과거 시점 ㎡당 고시가가 양도시보다 **높은** 경우 경고(2026-08-04 실사례).
   *
   * §164⑥ 환산취득가 = 양도가액 × 취득시 환산기준시가 ÷ 양도시 호별총액이라, 과거 단가가
   * 양도 단가를 넘으면 환산취득가가 양도가액 이상이 되어 **양도차익이 0**이 된다.
   * 실제로 최초고시 단가를 10배(2,178,000 → 21,780,000) 잘못 넣은 사례에서 세액이 0으로 나왔고,
   * 화면에 아무 단서가 없어 엔진 결함으로 오인됐다.
   *
   * ⛔ **차단하지 않는다** — 시세 하락 구간에서는 과거 단가가 더 높을 수 있어 법령상 불가능한
   *    조합이 아니다. 값을 임의 보정하지도 않는다(자동 fallback 금지 정책과 같은 취지).
   */
  const unitPriceInversion = useMemo(() => {
    const past = parseAmount(asset.cbUnitPriceAtFirstOrAcq);
    const transfer = parseAmount(asset.cbUnitPriceAtTransfer);
    if (past <= 0 || transfer <= 0 || past <= transfer) return null;
    return { past, transfer };
  }, [asset.cbUnitPriceAtFirstOrAcq, asset.cbUnitPriceAtTransfer]);

  // 연면적 자동 계산 표시 (사용자 친화적 피드백)
  const totalFloorArea = useMemo(() => {
    const excl = parseFloat(asset.cbExclusiveArea || "0");
    const shared = parseFloat(asset.cbSharedArea || "0");
    if (excl > 0 || shared > 0) {
      return parseFloat((excl + shared).toFixed(2));
    }
    return null;
  }, [asset.cbExclusiveArea, asset.cbSharedArea]);

  // ── P3: 3시점 일괄 계산(배치) 배선 — 계획서 §4.3~§4.5 ──────────────────────
  const yearOf = (d: string | undefined) =>
    d && d.length >= 4 ? Number.parseInt(d.slice(0, 4), 10) : undefined;
  const acqYear = yearOf(asset.acquisitionDate);
  const transYear = yearOf(transferDate);
  const batchBlockReason = multiPointBlockReason({
    acquisitionYear: acqYear,
    transferYear: transYear,
  });
  const canBatch = canUseMultiPointStdPrice({
    acquisitionYear: acqYear,
    transferYear: transYear,
  });
  /**
   * 시점 3종 — 최초고시는 2005 고정(「소득세법 시행령」 제164조 제6항 · 국세청 최초 고시).
   * 공시지가 prefill: 취득 ≤2000이면 모달 칸이 2001.1.1 기준(위치지수 전용)이라
   * 취득당시 토지값(`cbLandPricePerSqmAtAcq`)을 넣지 않는다 — 트랙이 다르다(§4.3-4).
   */
  const batchPoints = useMemo(
    () => [
      {
        key: "acquisition" as const,
        label: "취득시",
        year: acqYear,
        landPricePerM2: isAcq2001LocationIndexTrack(acqYear) ? "" : asset.cbLandPricePerSqmAtAcq,
      },
      {
        key: "firstDisclosure" as const,
        label: "최초고시(2005)",
        year: COMMERCIAL_FIRST_DISCLOSURE_YEAR,
        landPricePerM2: asset.cbLandPricePerSqmAtFirst,
      },
      { key: "transfer" as const, label: "양도시", year: transYear, landPricePerM2: asset.cbLandPricePerSqmAtTransfer },
    ],
    [acqYear, transYear, asset.cbLandPricePerSqmAtAcq, asset.cbLandPricePerSqmAtFirst, asset.cbLandPricePerSqmAtTransfer],
  );

  /**
   * 배치 결과 → 자산 폼 반영. patch 조립은 순수 함수(`buildCommercialBatchPatch`)가 하고
   * 여기서는 **`onChange` 1회**만 호출한다(§4.4 — 단일키 setter 연속 호출 금지).
   */
  const applyBatch = (v: MultiPointStdPriceApply) =>
    onChange(buildCommercialBatchPatch(v, asset));

  /** Q-1 — 취득시 금액 직접 수정 시 §164⑤ 준용 확인 해제(같은 patch에 실어 단일 배치로). */
  const changeAcqBuildingStd = (v: string) =>
    onChange(buildAcqBuildingStdEditPatch(v, asset));

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
        {/* 호별고시 시점 분기 — 취득일에서 자동 선택(수동 변경 가능) */}
        <div>
          <p className="mb-2 text-xs font-semibold text-amber-700">취득 시점 구분</p>
          <RadioCardGroup
            name={`cbEra-${asset.assetId}`}
            options={CB_ERA_OPTIONS}
            value={effEra}
            onChange={(v) => onChange({ cbEra: v })}
            tone="amber"
            layout="stack"
          />
          <p className="mt-1 text-caption text-amber-700">
            {eraAutoDerived
              ? "위 취득일 기준으로 자동 선택했습니다 — 국세청 호별 고시 대상이 아닌 물건이면 직접 변경하세요."
              : asset.cbEra
                ? "직접 선택한 값입니다 — 취득일 기준 자동 판정보다 우선합니다."
                : "취득일을 입력하면 자동으로 선택됩니다."}
          </p>
        </div>

        {/* 면적 3필드(전용·공유·대지)는 ① 기본정보로 이전했다 (2026-08-04).
            취득원인 무관 단일 입력 — `asset-sections/AssetAreaCommercial.tsx`.
            ⚠️ `totalFloorArea` 계산은 유지한다 — 아래 기준시가 모달 prefill이 소비한다. */}

        {/* ① 호별 ㎡당 고시가 (emerald/amber) — cbEra 선택 후 표시 */}
        {hasEra && (
          <ToneCard tone="emerald" sectionNum="1" title="호별 ㎡당 고시가 (원/㎡)" noDark>
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
              {unitPriceInversion && (
                <p
                  className="mt-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700"
                  data-testid="cb-unit-price-inversion-warning"
                >
                  {isPreDisclosure ? "최초고시(2005)" : "취득시"} ㎡당 고시가(
                  {unitPriceInversion.past.toLocaleString()})가 양도시(
                  {unitPriceInversion.transfer.toLocaleString()})보다 <b>높습니다</b> — 자릿수를
                  확인하세요. 이 경우 환산취득가가 양도가액 이상이 되어 <b>양도차익이 0</b>으로
                  계산될 수 있습니다.
                </p>
              )}
            </div>
          </ToneCard>
        )}

        {/* ② 개별공시지가 3시점 (amber+emerald) — cbEra 선택 후 표시.
            ⚠️ 건물 기준시가(③)보다 **위**에 둔다(2026-08-04): ⑴ 엔진이 기준시가합을
               토지→건물 순으로 조립하고(`commercial-building-valuation.ts:243~248`),
               ⑵ 건물 기준시가 계산기가 **위치지수 산정에 이 공시지가를 입력으로** 받는다
               (모달 prefill). 아래에 두면 계산기를 열 때 prefill이 비어 사용자가 같은 값을
               모달에서 다시 넣게 된다. */}
        {hasEra && (
          <ToneCard
            tone="amber"
            sectionNum="2"
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
                // 취득 ≤2000은 일괄 계산기의 공시지가와 **트랙이 다르다** — 그쪽은 2001.1.1 기준
                // (위치지수 산정 전용, §164⑤)이고 이 칸은 취득당시 토지가액이다. 자동 입력하면
                // 환산이 조용히 틀리므로 드롭하고, 대신 그 사실을 여기서 알린다.
                hint={
                  isAcq2001LocationIndexTrack(acqYear)
                    ? "일괄 계산기에 넣은 2001.1.1 기준 공시지가는 위치지수 산정용이라 이 칸에 자동 입력되지 않습니다 — 취득 당시 개별공시지가를 직접 입력하세요."
                    : undefined
                }
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

        {/* ③ 건물 기준시가 3시점 — 총액 (pre_disclosure 시만 표시). 위 ② 공시지가 뒤에 온다. */}
        {isPreDisclosure && (
          <ToneCard tone="amber" sectionNum="3" title="건물 기준시가 — 3시점 (원, 총액)" noDark>
            <div className="text-xs text-amber-700 mb-1">
              건물분 ㎡당 가액 × 연면적(전유+공용 보정계수 반영) = <b>건물 기준시가 총액</b>으로 환산해 입력
            </div>
            {/* 3시점 일괄 계산 — 소재지·신축연도·구조·용도를 1회 입력해 아래 3칸을 함께 채운다.
                게이트가 막으면 사유를 밝히고 아래 시점별 계산기만 남긴다(계획서 §4.2). */}
            {canBatch ? (
              <div className="flex flex-col items-end gap-1">
                <MultiPointBuildingStdPriceModal
                  points={batchPoints}
                  onApply={applyBatch}
                  snapshotPrefix={`bsp-${asset.assetId}-cb`}
                  jibun={asset.addressJibun || undefined}
                  initialAddress={stdPriceAddress}
                  housingFloorAreaPrefill={totalFloorArea != null ? String(totalFloorArea) : undefined}
                  hideFloorAreaInput
                  dataTestId="cb-building-std-batch-open"
                />
              </div>
            ) : (
              batchBlockReason && (
                <p className="rounded-md bg-amber-100/60 px-2.5 py-1.5 text-caption text-amber-800">
                  {MULTI_POINT_BLOCK_MESSAGE[batchBlockReason]}
                </p>
              )
            )}
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
                onChange={changeAcqBuildingStd}
                hideUnit
              />
            </FieldCard>
            <div className="flex justify-end">
              <BuildingStdPriceModalButton lockedTaxType="transfer" initialAddress={stdPriceAddress} snapshotKey={`bsp-${asset.assetId}-cb-acq`} applyTimePoint="acquisition" hideFloorAreaInput prefill={{ floorArea: totalFloorArea != null ? String(totalFloorArea) : undefined, landAreaM2: asset.cbLandArea, acquisitionDate: asset.acquisitionDate, transferDate }} onApply={(v) => onChange({ cbBuildingStdPriceAtAcq: String(v) })} />
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
                <BuildingStdPriceModalButton lockedTaxType="transfer" initialAddress={stdPriceAddress} snapshotKey={`bsp-${asset.assetId}-cb-transfer`} applyTimePoint="transfer" hideFloorAreaInput prefill={{ floorArea: totalFloorArea != null ? String(totalFloorArea) : undefined, landAreaM2: asset.cbLandArea, acquisitionDate: asset.acquisitionDate, transferDate }} onApply={(v) => onChange({ cbBuildingStdPriceAtTransfer: String(v) })} />
              </div>
            </div>
          </ToneCard>
        )}

        {/* §164⑥ 산식 괄호 단서 — 두 시점 기준시가합이 같을 때만 노출(③·④ 입력 후 확정) */}
        {isPreDisclosure && <Sec164_8ProvisoInput asset={asset} onChange={onChange} />}
      </div>
    </ToggleCard>
  );
}
