"use client";

/**
 * GeneralBuildingBlock — 일반건물(토지+건물 일괄) 입력 섹션
 *
 * 진입 조건: assetKind === "general_building" (취득방법 무관 항상 마운트)
 * 섹션 구조:
 *  ① 토지 공시지가 (slate) — 취득시(amber) → 양도시(emerald). 양도시는 항상, 취득시는 게이트
 *  ② 건물 기준시가 (slate) — 취득시(amber) → 양도시(emerald) + 2시점 일괄 계산 + 개산공제 안내
 *     증축 정보 (amber)    — 환산취득가 모드 OR gbHasExtension ON 시 (선택); 증축분 취득방식 서브 라디오로 4가지 조합 지원
 *  ③ 비사업용토지 판정 (rose)  — 항상 표시
 *      (「소득세법」 §104의3①4호나목 → 「지방세법」 §106①2호 → 「지방세법 시행령」 §101①2호·②)
 *
 * ## 배치 축을 시점 → 자산으로 바꿨다 (2026-08-05)
 *
 * 종전은 ①양도시(토지+건물) ②취득시(토지+건물)의 **시점 축**이었다. 3시점 화면
 * (`ThreePointAssetMajorRender` — 토지 공시지가 그룹 → 자산별 건물 기준시가 그룹)과 축이 달라
 * 같은 계산기를 오가는 사용자가 매번 다른 순서를 읽어야 했다. **자산 축**(토지 → 건물,
 * 각 그룹 안에서 취득 → 양도)으로 통일한다.
 * ⚠️ 시점별 tone 계약(취득=amber·양도=emerald)은 **안쪽 박스가 그대로 승계**한다 —
 *    components/calc/CLAUDE.md 색상 가이드 위반이 아니다. 바깥 그룹만 slate(중립)다.
 * ⚠️ 「건물 기준시가 계산」 런처가 한 화면에 둘이라 **순서가 바뀌었다** — E2E에서 `.first()`로
 *    양도시 런처를 잡던 셀렉터는 `[data-gb-stdprice="transfer"]` 스코프로 바꿔야 한다.
 * anchor: `__tests__/components/gb-stdprice-asset-major-layout.anchor.test.tsx`
 *
 * ⚠️ 면적 3필드(토지·연면적·바닥면적)는 **① 기본정보**로 이전했다(2026-08-04) —
 *    `asset-sections/AssetAreaGeneralBuilding.tsx`. 연면적의 `isEstimated` 게이트는
 *    2026-08-05에 제거돼 3필드 모두 상시 노출된다. 여기에 면적 칸을 다시 추가하지 말 것.
 *    ※ `footprint`·`landArea` 파생값은 유지한다 — ③ 비사업용토지 한도 미리보기가 소비한다.
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
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import { MultiPointBuildingStdPriceModal } from "@/components/calc/building-std-price/MultiPointBuildingStdPriceModal";
import { canUseMultiPointStdPrice } from "@/lib/calc/building-std-multipoint-gate";
import { MULTI_POINT_BLOCK_MESSAGE, multiPointBlockReason } from "@/lib/calc/building-std-multipoint-gate";
import { buildGeneralBuildingBatchPatch, commercialAcqYear } from "@/lib/calc/building-std-batch-apply";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { GeneralBuildingNblSection } from "./GeneralBuildingNblSection";
import { GeneralBuildingConversionSection } from "./GeneralBuildingConversionSection";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { DateInput } from "@/components/ui/date-input";


// 배율은 엔진 getBuildingSiteMultiplier가 단일 진실 — UI에서 재구현 금지.
//   근거: 「소득세법」 제104조의3 제1항 제4호 나목 → 「지방세법」 제106조 제1항 제2호
//         → 「지방세법 시행령」 제101조 제1항 제2호(바닥면적 × 제2항 적용배율).
//   종전 UI는 「소득세법 시행령」 제168조의12(주택 부수토지) 배율을 인라인 재구현했고
//   엔진도 같은 오류였다(2026-07-30 정정 — 22개 조합 중 19개 오답).

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
    pnu: asset.addressPnu,
    dong: asset.addressDong || undefined,
    ho: asset.addressHo || undefined,
  };

  // ── P4: 취득·양도 2시점 일괄 계산(배치) 배선 — 계획서 §4.2·§5 P4 ────────────
  // 건물분 기준시가의 취득 시점은 **건물 취득일**이 따로 있으면 그것이다(§166⑥ 별개취득).
  const gbAcqYear = commercialAcqYear(asset.gbBuildingAcquisitionDate || asset.acquisitionDate);
  const gbTransferYear = commercialAcqYear(transferDate);
  const gbBatchBlockReason = multiPointBlockReason({
    acquisitionYear: gbAcqYear,
    transferYear: gbTransferYear,
  });
  const canGbBatch = canUseMultiPointStdPrice({
    acquisitionYear: gbAcqYear,
    transferYear: gbTransferYear,
  });
  /** 2시점 — 일반건물에는 최초고시 시점이 없다(§164⑥ 환산 경로가 아니다). */
  const gbBatchPoints = useMemo(
    () => [
      {
        key: "acquisition" as const,
        label: "취득시",
        year: gbAcqYear,
        // 취득 ≤2000이면 모달 칸이 2001.1.1 기준(위치지수 전용) — 취득당시 토지값을 넣지 않는다.
        landPricePerM2: gbAcqYear != null && gbAcqYear <= 2000 ? "" : asset.gbAcqLandPricePerSqm,
      },
      {
        key: "transfer" as const,
        label: "양도시",
        year: gbTransferYear,
        landPricePerM2: asset.gbTransferLandPricePerSqm,
      },
    ],
    [gbAcqYear, gbTransferYear, asset.gbAcqLandPricePerSqm, asset.gbTransferLandPricePerSqm],
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

  const isBurdenedGift = asset.transferType === "burdened_gift";
  /**
   * 취득시 기준시가(토지·건물)를 입력받는 조건 — 환산 분자 / 일괄 취득가 안분 / §159 환산.
   * 종전 "② 취득시 기준시가" 카드의 게이트를 그대로 승계한다(자산 축으로 재편해도 조건 불변).
   */
  const showAcqStdPrice = isEstimated || asset.gbHasExtension || isBurdenedGift;
  /**
   * 2시점 일괄 계산 런처가 실제로 떠 있는가 — 시점별 계산기의 **대체 여부**를 가른다.
   *
   * 일괄이 있으면 시점별 계산기 2개는 중복이라 숨긴다(2026-08-05 사용자 요청). 다만 일괄이
   * 없는 두 경우에는 **반드시 시점별을 남긴다** — 없으면 건물기준시가를 산정할 경로가 사라진다
   * (dead-end 금지: `feedback_ui_gate_removes_sole_input_path`).
   *   · 실거래가 모드: 취득시 입력이 없어 "2시점"이 성립하지 않는다 → 양도시 계산기가 유일 경로
   *   · 배치 게이트 차단(§164⑧ 동일연도 등): 사유만 뜨고 일괄 버튼이 없다
   */
  const showBatchLauncher = showAcqStdPrice && canGbBatch;

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
              아래에는 §159 산식에 필요한 정보(양도시·취득시 기준시가)만 표시됩니다.
              <b>면적</b>은 ① 기본정보에서 입력합니다.
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

        {/* 면적 3필드(토지·연면적·바닥면적)는 ① 기본정보로 이전했다 (2026-08-04).
            `asset-sections/AssetAreaGeneralBuilding.tsx` — 연면적 게이트는 2026-08-05에
            제거돼 상시 노출된다. 여기에 면적 칸을 다시 추가하지 말 것. */}

        {/* ① 토지 공시지가 (취득 → 양도) — 3시점 화면(`ThreePointAssetMajorRender`)과 같은
            **자산 축** 배치. 시점 정체성은 안쪽 amber(취득)/emerald(양도) 박스가 그대로 진다. */}
        <ToneCard
          tone="slate"
          sectionNum="①"
          title="토지 공시지가 (토지기준시가)"
          titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §166⑥" label="§166⑥ 안분" />}
          noDark
        >
          <p className="text-caption text-slate-600">
            {isEstimated
              ? "① 토지 · ② 건물 기준시가가 환산취득가 분모와 양도가액 안분 기준을 구성합니다 (§166⑥)."
              : "① 토지 · ② 건물 기준시가가 실거래가 합계를 토지·건물로 안분하는 기준입니다 (§166⑥). 취득가액도 같은 비율로 안분됩니다."}
          </p>

          {showAcqStdPrice && (
            <div data-gb-stdprice="acq">
              <ToneCard tone="amber" title="취득시" noDark>
                <LandPriceLookupField
                  label="취득시 토지 공시지가"
                  pricePerSqm={asset.gbAcqLandPricePerSqm}
                  onPricePerSqmChange={(v) => onChange({ gbAcqLandPricePerSqm: v })}
                  area={parseDecimal(asset.gbLandArea) || undefined}
                  referenceDate={asset.acquisitionDate}
                  jibun={asset.addressJibun}
                  hint={
                    // 상가와 같은 트랙 분기 — 일괄 계산기의 취득 공시지가(≤2000)는 2001.1.1 기준이다.
                    gbAcqYear != null && gbAcqYear <= 2000
                      ? "일괄 계산기에 넣은 2001.1.1 기준 공시지가는 위치지수 산정용이라 이 칸에 자동 입력되지 않습니다 — 취득 당시 개별공시지가를 직접 입력하세요."
                      : "취득일 전년도 기준 개별공시지가 (원/㎡)"
                  }
                />
              </ToneCard>
            </div>
          )}

          <div data-gb-stdprice="transfer">
            <ToneCard tone="emerald" title="양도시" noDark>
              <LandPriceLookupField
                label="양도시 토지 공시지가"
                pricePerSqm={asset.gbTransferLandPricePerSqm}
                onPricePerSqmChange={(v) => onChange({ gbTransferLandPricePerSqm: v })}
                area={parseDecimal(asset.gbLandArea) || undefined}
                referenceDate={transferDate}
                jibun={asset.addressJibun}
                hint="양도일 전년도 기준 개별공시지가 (원/㎡). Vworld 또는 토지이음에서 조회."
              />
            </ToneCard>
          </div>
        </ToneCard>

        {/* ② 건물 기준시가 (취득 → 양도) */}
        <ToneCard
          tone="slate"
          sectionNum="②"
          title="건물 기준시가"
          titleExtra={
            showAcqStdPrice ? (
              <LawArticleModal legalBasis="소득세법 시행령 §163⑥" label="§163⑥ 개산공제" />
            ) : undefined
          }
          noDark
        >
          {/* 취득·양도 2시점 일괄 계산 — 소재지·신축연도·구조·용도를 1회 입력해 두 시점 건물기준시가를
              함께 채운다. 게이트가 막으면 사유를 밝히고 시점별 계산기만 남긴다(계획서 §4.2).
              취득시 입력이 필요 없는 모드에서는 2시점 자체가 성립하지 않아 표시하지 않는다. */}
          {showAcqStdPrice &&
            (showBatchLauncher ? (
              <div className="flex justify-end">
                <MultiPointBuildingStdPriceModal
                  points={gbBatchPoints}
                  onApply={(v) => onChange(buildGeneralBuildingBatchPatch(v, asset))}
                  snapshotPrefix={`bsp-${asset.assetId}-gb`}
                  jibun={asset.addressJibun || undefined}
                  initialAddress={stdPriceAddress}
                  housingFloorAreaPrefill={asset.gbBuildingArea || undefined}
                  hideFloorAreaInput
                  dataTestId="gb-building-std-batch-open"
                />
              </div>
            ) : (
              gbBatchBlockReason && (
                <p className="rounded-md bg-amber-100/60 px-2.5 py-1.5 text-caption text-amber-800">
                  {MULTI_POINT_BLOCK_MESSAGE[gbBatchBlockReason]}
                </p>
              )
            ))}

          {showAcqStdPrice && (
            <div data-gb-stdprice="acq">
              <ToneCard tone="amber" title="취득시" noDark>
                <FieldCard label="취득시 건물기준시가" unit="원" hint="취득일 기준 건물기준시가 총액. 이 금액의 3%가 건물 개산공제액 (§163⑥)">
                  <CurrencyInput label="취득시 건물기준시가" hideUnit value={asset.gbAcqBuildingValue} onChange={(v) => onChange({ gbAcqBuildingValue: v })} />
                </FieldCard>
                {/* 일괄 런처가 없을 때만 — 있으면 중복이라 숨긴다(위 showBatchLauncher 주석). */}
                {!showBatchLauncher && (
                  <div className="flex justify-end">
                    <BuildingStdPriceModalButton lockedTaxType="transfer" initialAddress={stdPriceAddress} snapshotKey={`bsp-${asset.assetId}-gb-acq`} applyTimePoint="acquisition" hideFloorAreaInput prefill={{ floorArea: asset.gbBuildingArea, landAreaM2: asset.gbLandArea, acquisitionDate: asset.gbBuildingAcquisitionDate || asset.acquisitionDate, transferDate }} onApply={(v) => onChange({ gbAcqBuildingValue: String(v) })} />
                  </div>
                )}
              </ToneCard>
            </div>
          )}

          <div data-gb-stdprice="transfer">
            <ToneCard tone="emerald" title="양도시" noDark>
              {/* hint의 계산기 위치 안내는 실제 런처 위치를 따라간다 — 일괄이면 위, 아니면 아래. */}
              <FieldCard
                label="양도시 건물기준시가"
                unit="원"
                hint={
                  showBatchLauncher
                    ? "건물분 기준시가 총액 (원). 모르면 위 「2시점 건물기준시가 일괄 계산」으로 산정."
                    : "건물분 기준시가 총액 (원). 모르면 아래 계산기로 산정."
                }
              >
                <CurrencyInput label="양도시 건물기준시가" hideUnit value={asset.gbTransferBuildingValue} onChange={(v) => onChange({ gbTransferBuildingValue: v })} />
              </FieldCard>
              {!showBatchLauncher && (
                <div className="flex justify-end">
                  <BuildingStdPriceModalButton lockedTaxType="transfer" initialAddress={stdPriceAddress} snapshotKey={`bsp-${asset.assetId}-gb-transfer`} applyTimePoint="transfer" hideFloorAreaInput prefill={{ floorArea: asset.gbBuildingArea, landAreaM2: asset.gbLandArea, acquisitionDate: asset.gbBuildingAcquisitionDate || asset.acquisitionDate, transferDate }} onApply={(v) => onChange({ gbTransferBuildingValue: String(v) })} />
                </div>
              )}
            </ToneCard>
          </div>

          {/* 개산공제는 토지·건물 취득시 값을 함께 쓴다 — 두 그룹 뒤(②의 말미)에 둔다. */}
          {showAcqStdPrice && (
            <div className="rounded bg-violet-50/60 border border-violet-200 px-3 py-2 text-xs text-violet-700 space-y-0.5">
              <p className="font-semibold">개산공제 (§163⑥)</p>
              <p>토지: 취득시 공시지가 × 토지면적 × 3%</p>
              <p>건물: 취득시 건물기준시가 총액 × 3%</p>
            </div>
          )}

          {/* 부담부증여 §159①1호 단서 안내 — 사용자 입력 실거래가 무시 */}
          {isBurdenedGift && (
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
        </ToneCard>

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
                  hint="증축 건물분 기준시가 총액 (원). ㎡당 단가가 아닌 총액(원)."
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
                  hint="§166⑥ 양도가액 안분 분모 계산에 필요합니다. 증축 건물분 기준시가 총액 (원)."
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
        )}

        <GeneralBuildingNblSection asset={asset} onChange={onChange} />

        <GeneralBuildingConversionSection asset={asset} onChange={onChange} transferDate={transferDate} />

      </div>
    </div>
  );
}
