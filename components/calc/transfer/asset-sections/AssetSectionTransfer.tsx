"use client";

/**
 * ② 양도정보 — 양도형태(TransferModeBlock)·부담부증여 안내·양도가액(CompanionSaleModeBlock).
 * CompanionAssetCard L474–533 JSX를 그대로 이동.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { TransferModeBlock } from "../TransferModeBlock";
import { isExprValuationEligibleAssetKind } from "@/lib/tax-engine/expropriation-scope";
import { CompanionSaleModeBlock, type BundledSaleMode } from "../CompanionSaleModeBlock";
import { GeneralBuildingSaleSplitSection } from "../GeneralBuildingSaleSplitSection";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  singleMode?: boolean;
  bundledSaleMode: BundledSaleMode;
  transferDate?: string;
  contractTotalPrice?: string;
  /** 주 자산(assets[0]) — 증환지 증가분의 양도시 기준시가 live fallback 소스 */
  primaryAsset?: AssetForm;
  /** 지분 분할 모드(splitMode==="fractional") — 양도가액 자동계산·기준시가 안분 입력 숨김 게이트 */
  isFractionalSplit?: boolean;
}

export function AssetSectionTransfer({
  asset,
  onChange,
  singleMode,
  bundledSaleMode,
  transferDate,
  contractTotalPrice,
  primaryAsset,
  isFractionalSplit,
}: Props) {
  // 증환지 증가분: 당초분(assets[0]) 양도시 기준시가에서 live fallback (증가분 추가 순서와 무관하게 자동).
  // 사용자가 증가분 카드에서 직접 입력하면 자기 값이 우선(override). API·validate도 동일 fallback.
  const isReplotInc = !!asset.isReplotIncrement && !!primaryAsset;
  const fbPerSqm = isReplotInc ? (primaryAsset!.standardPricePerSqmAtTransfer || "") : "";
  const effPerSqm = asset.standardPricePerSqmAtTransfer || fbPerSqm;
  const fbTotal = (() => {
    if (!isReplotInc) return "";
    const p = parseFloat((fbPerSqm || "").replace(/,/g, ""));
    const a = parseFloat((asset.transferArea || "").replace(/,/g, ""));
    return p > 0 && a > 0 ? String(Math.floor(p * a)) : "";
  })();
  const effTotal = asset.standardPriceAtTransfer || fbTotal;
  return (
    <>
      {/*
       * 양도 정보 카드 — 부담부증여(소령 §159)는 "양도" 사건이므로 취득원인과 분리하여 별도 노출.
       * 양도가액 입력 위로 이동 — 사용자가 양도 형태를 먼저 결정한 뒤 그 결과에 따라 분기.
       */}
      <TransferModeBlock asset={asset} onChange={onChange} transferDate={transferDate ?? ""} />

      {/* 양도가액 — 부담부증여 시 엔진 자동 도출 (소령 §159) 안내 + 기준시가는 별도 유지 */}
      {asset.transferType === "burdened_gift" && (
        <div className="rounded-lg border border-fuchsia-300 bg-fuchsia-50/60 p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-fuchsia-200 text-micro font-bold text-fuchsia-800 select-none">
              §159
            </span>
            <p className="text-sm font-semibold text-fuchsia-900">
              양도가액은 자동 산정됩니다 (직접 입력 불필요)
            </p>
          </div>
          <p className="text-xs text-fuchsia-800">
            부담부증여(소득세법 시행령 §159)에서는 <b>양도가액 = 인수 채무액 × (자산별 평가가액 ÷ 증여가액)</b>으로
            엔진이 자동 산정합니다. 채무액·평가액은 위 <b>양도 정보</b> 카드(인수 채무 + 임대 평가 보조)에서 입력하세요.
          </p>
          <p className="text-caption text-fuchsia-700">
            ※ 아래 <b>양도시 기준시가</b> 입력은 §159 분모(증여가액 C)의 보충적 평가 산정에 사용됩니다 (기준시가 모드).
          </p>
        </div>
      )}
      {/*
        부담부증여 모드에서도 standardPriceAtTransfer는 §159 분모(C)의 보충적 평가 산정 입력으로 필요.
        general_building은 GeneralBuildingBlock의 gb* 필드, 시가 모드는 bgMarketValueAtTransfer 사용.
        따라서 housing/land/building/commercial_building + 기준시가 모드일 때만 표시.
      */}
      {!(asset.transferType === "burdened_gift" && asset.assetKind === "general_building") &&
       !(asset.transferType === "burdened_gift" && asset.bgValuationMode === "sangjeungbeop_market") && (
        <CompanionSaleModeBlock
          bundledSaleMode={
            asset.transferType === "burdened_gift" ? "apportioned" : (singleMode ? "actual" : bundledSaleMode)
          }
          assetKind={(asset.assetKind === "commercial_building" || asset.assetKind === "general_building" || asset.assetKind === "redevelopment_apt") ? "building" : asset.assetKind}
          actualSalePrice={asset.actualSalePrice}
          onActualSalePriceChange={(v) => onChange({ actualSalePrice: v })}
          standardPriceAtTransfer={effTotal}
          onStandardPriceAtTransferChange={(v) => onChange({ standardPriceAtTransfer: v })}
          singleMode={singleMode}
          jibun={asset.addressJibun || undefined}
          dong={asset.addressDong || undefined}
          ho={asset.addressHo || undefined}
          transferDate={transferDate}
          // D11 — §164⑨ 적격 자산은 면적을 **store에 저장**해야 특례 분모(min[] × 면적)가 산출된다.
          // 종전엔 land만 controlled라 건물·상가는 값이 StandardPriceInput 내부 state로 빠져
          // 엔진 게이트 `area > 0`에 걸려 **특례가 조용히 죽었다**(게이트만 넓히면 무효인 이유).
          // ※ 주택은 isAreaMode === false라 면적 칸 자체가 없다(총액 직접입력) — P5 총액 트랙 대상.
          transferArea={
            isExprValuationEligibleAssetKind(asset.assetKind) ? asset.transferArea : undefined
          }
          onTransferAreaChange={
            isExprValuationEligibleAssetKind(asset.assetKind)
              ? (v) => onChange({ transferArea: v })
              : undefined
          }
          ownershipNumerator={asset.ownershipNumerator}
          ownershipDenominator={asset.ownershipDenominator}
          contractTotalPrice={contractTotalPrice}
          // 지분 분할 모드는 양도가액 자동계산 — 기준시가 안분 입력 숨김.
          // 부담부증여(§159)는 standardPriceAtTransfer가 분모(C) 산정에 필요하므로 제외.
          isFractionalSplit={isFractionalSplit && asset.transferType !== "burdened_gift"}
          standardPricePerSqmAtTransfer={effPerSqm}
          onStandardPricePerSqmAtTransferChange={(v) => onChange({ standardPricePerSqmAtTransfer: v })}
        />
      )}

      {/*
        🔀 **양도가액 토지·건물 안분 방식** — ③ 취득의 `GeneralBuildingBlock`에서 이전했다
           (2026-08-07 · 사용자 요청). 양도가액을 토지·건물로 어떻게 나눌지는 **양도 정보**다.

        양도가액(`CompanionSaleModeBlock`) **바로 뒤**에 둔다 — 총액을 정한 다음 그것을 나누는
        순서라 로직 순서와 화면 순서가 일치한다(components/calc/CLAUDE.md 「UI 순서 = 로직 순서」).
      */}
      {asset.assetKind === "general_building" && (
        <GeneralBuildingSaleSplitSection
          asset={asset}
          onChange={onChange}
          blockedReason={
            asset.transferType === "burdened_gift"
              ? "부담부증여는 양도가액이 인수 채무액 기준으로 자동 산정되어 구분 기재가 성립하지 않습니다 (소득세법 시행령 §159)."
              : undefined
          }
          hasExtension={asset.gbHasExtension === true}
        />
      )}
    </>
  );
}
