"use client";

/**
 * 일반건물 ⑤ 증축 정보 카드 — 증축일·면적·증축분 취득방식·건물2 기준시가·안분 미리보기.
 *
 * `GeneralBuildingBlock`에서 분리(2026-08-12, 800줄 정책). 증축분 2시점 기준시가 계산기를
 * 붙이면서 838줄이 되어, 증축 축 전체를 통째로 옮겼다.
 *
 * 게이트(지분 카드·부담부증여 제외)는 **호출부가 진다** — 이 컴포넌트는 렌더 여부를 묻지 않는다.
 */

import { useMemo } from "react";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { MultiPointBuildingStdPriceModal } from "@/components/calc/building-std-price/MultiPointBuildingStdPriceModal";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import { MULTI_POINT_BLOCK_MESSAGE, multiPointBlockReason } from "@/lib/calc/building-std-multipoint-gate";
import { canUseMultiPointStdPrice } from "@/lib/calc/building-std-multipoint-gate";
import { commercialAcqYear } from "@/lib/calc/building-std-batch-apply";
import { buildGeneralBuildingExtensionBatchPoints } from "@/lib/calc/building-std-batch-apply";
import { buildGeneralBuildingExtensionBatchPatch } from "@/lib/calc/building-std-batch-apply";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { AddressValue } from "@/components/ui/address-search";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  /** ① 기본정보 소재지 — 기준시가 모달 시드(건축물대장 조회에 pnu가 필요). */
  stdPriceAddress: AddressValue;
  /** 양도시 연도 — 증축 게이트 판정에 쓴다. 호출부가 1회 계산해 내려준다(재파생 금지). */
  transferYear: number | undefined;
  /** 일부 양도(O-4) — 증축분 취득가액·필요경비도 「양도분 기준」으로 안내한다. */
  isPartialTransfer: boolean;
}

export function GeneralBuildingExtensionSection({
  asset,
  onChange,
  transferDate,
  stdPriceAddress,
  transferYear,
  isPartialTransfer,
}: Props) {
  /**
   * 증축분(건물2) 2시점 — **증축시**·양도시. 취득 시점이 원건물과 다르다(영 §162①4호).
   * 게이트는 같은 순수 함수를 쓰되 인자가 증축일 연도다 — 원건물 게이트를 재사용하면
   * 증축일이 양도연도와 같은 경우(§164⑧)를 놓친다.
   */
  const gbExtYear = commercialAcqYear(asset.gbExtensionDate);
  const gbExtBatchBlockReason = multiPointBlockReason({
    acquisitionYear: gbExtYear,
    transferYear,
  });
  const canGbExtBatch = canUseMultiPointStdPrice({
    acquisitionYear: gbExtYear,
    transferYear,
  });
  const gbExtBatchPoints = useMemo(
    () => buildGeneralBuildingExtensionBatchPoints(asset, transferDate),
    [asset, transferDate],
  );

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

  return (
    <>
        {/* ⑤ 증축 정보 (amber) — 일반건물이면 **항상** 표시한다(2026-08-12 · 위 게이트 주석).
            증축 유무는 물건의 사실이지 취득가액 산정 방식의 함수가 아니다.
            부담부증여 모드에서는 §159 자동 산정 — 증축 cross-cutting 비스코프이므로 숨김. */}
        {/* 🔒 증축은 **물건 사건**이다 — 지분 카드에서는 숨긴다(설계 D1-3·D4).
            안에 「양도시 건물2 기준시가」가 있어 emerald 카드만 숨기는 것으로는 부족하다. */}
        <ToggleCard
          tone="amber"
          variant="card"
          title="증축 있음"
          description="원취득분(토지·원건물)과 별도로 증축한 건물분(건물2)이 있는 경우. 증축분의 취득가액 산정 방식은 원취득분과 무관하게 아래에서 따로 고릅니다."
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
              {/* 건물2 2시점(증축시·양도시) 기준시가 일괄 계산 — 원건물 ②와 같은 층위의 도구.
                  종전에는 이 두 칸이 **직접 입력 전용**이라, 원건물 쪽에는 계산기가 있는데
                  증축분만 손으로 구해야 했다(2026-08-12 사용자 지적 — 구현 누락).

                  면적은 증축 연면적이다 — 원건물 계산기가 원건물 연면적을 쓰는 것과 대칭.
                  게이트가 막으면 사유만 띄운다(원건물과 같은 처리 — dead-end 아님:
                  두 칸 모두 직접 입력이 살아 있다). */}
              {canGbExtBatch ? (
                <div className="flex justify-end">
                  <MultiPointBuildingStdPriceModal
                    points={gbExtBatchPoints}
                    onApply={(v) => onChange(buildGeneralBuildingExtensionBatchPatch(v))}
                    snapshotPrefix={`bsp-${asset.assetId}-gb-ext`}
                    jibun={asset.addressJibun || undefined}
                    initialAddress={stdPriceAddress}
                    housingFloorAreaPrefill={asset.gbExtensionArea || undefined}
                    hideFloorAreaInput
                    dataTestId="gb-ext-building-std-batch-open"
                    buttonLabel="증축분 2시점 기준시가 일괄 계산"
                  />
                </div>
              ) : (
                gbExtBatchBlockReason && (
                  <p className="rounded-md bg-amber-100/60 px-2.5 py-1.5 text-caption text-amber-800">
                    {MULTI_POINT_BLOCK_MESSAGE[gbExtBatchBlockReason]}
                  </p>
                )
              )}

              {/* 양도시 건물2 기준시가 */}
              <FieldCard
                label="양도시 건물2 기준시가 총액"
                unit="원"
                hint="증축 건물분 기준시가 총액 (원). ㎡당 단가가 아닌 총액(원). 모르면 위 「증축분 2시점 기준시가 일괄 계산」으로 산정."
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
                hint="§166⑥ 양도가액 안분 분모 계산에 필요합니다. 증축 건물분 기준시가 총액 (원). 모르면 아래 계산기로 산정."
              >
                <CurrencyInput
                  label="양도시 건물2 기준시가 총액"
                  hideUnit
                  value={asset.gbTransferExtensionBuildingStdPrice}
                  onChange={(v) => onChange({ gbTransferExtensionBuildingStdPrice: v })}
                />
              </FieldCard>
              {/* 실가 모드는 **양도시 1시점만** 필요하다 — 취득시 건물2 기준시가는 환산 분자라
                  여기서는 쓰이지 않는다. 그래서 2시점 일괄이 아니라 단일 시점 계산기를 붙인다
                  (2시점을 열면 쓰지도 않을 증축시 값을 요구하게 된다). */}
              <div className="flex justify-end">
                <BuildingStdPriceModalButton
                  lockedTaxType="transfer"
                  initialAddress={stdPriceAddress}
                  snapshotKey={`bsp-${asset.assetId}-gb-ext-transfer`}
                  applyTimePoint="transfer"
                  hideFloorAreaInput
                  prefill={{
                    floorArea: asset.gbExtensionArea,
                    landAreaM2: asset.gbLandArea,
                    /* 증축분의 「취득」은 증축일이다(영 §162①4호) — 원건물 취득일을 넣으면
                       모달이 없는 시점의 건물을 계산한다. */
                    acquisitionDate: asset.gbExtensionDate,
                    transferDate,
                    transferLandPricePerSqm: asset.gbTransferLandPricePerSqm,
                  }}
                  onApply={(v) => onChange({ gbTransferExtensionBuildingStdPrice: String(v) })}
                />
              </div>

              {/* 🔑 일부 양도(O-4)에서는 이 두 칸도 **양도분 기준**이다 — 증축분 취득가액은
                  ③ 상단의 일괄 취득가액 안분 계산기가 다루지 않는 별도 슬롯이기 때문이다
                  (그 계산기는 `fixedAcquisitionPrice` = 토지+원건물 일괄만 산출한다). */}
              <FieldCard
                label="증축 실거래가"
                unit="원"
                hint={
                  isPartialTransfer
                    ? "증축 시 실제로 지출한 비용 중 양도한 부분에 대응하는 금액. 증축분을 통째로 양도했다면 전액, 일부만 양도했다면 취득 당시 가치 비율로 안분한 금액을 넣으세요."
                    : "증축 시 실제로 지출한 비용. 영수증·계약서 등으로 입증 가능한 경우만."
                }
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
                hint={
                  isPartialTransfer
                    ? "증축 시 발생한 중개수수료·인지대 등 중 양도한 부분에 대응하는 금액. 없으면 비워두세요."
                    : "증축 시 발생한 중개수수료·인지대 등. 없으면 비워두세요."
                }
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
                <span className="ml-1.5 rounded-full px-1.5 py-0.5 bg-amber-200 text-amber-900 text-micro">
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
              <p className="text-micro text-amber-700">엔진 실제 계산값은 결과 단계에서 확인됩니다.</p>
            </div>
          )}
        </ToggleCard>
    </>
  );
}
