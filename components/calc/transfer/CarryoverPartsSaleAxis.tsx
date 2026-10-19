"use client";

/**
 * 파트 이월과세 C의 **양도 정보** — 수증자가 지출한 파트 자본적지출 + 축 A(양도가액 구분/일괄·양도시 기준시가).
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §3.2 (`CarryoverPartsSaleAxis`)
 *
 * 토지·건물을 나눠 계산하므로 파트 칸만 계산에 닿는다 — 자산 전체 자본적지출은 반영되지 않고(⑧ `validateSplitDirectInputs`가 이 칸으로 안내),
 * 양도가액은 구분 기재 또는 양도시 기준시가 비율로 나눈다(소득세법 시행령 §166⑥). `NonPurchaseSplitInputsBlock`(소유자 분리)의 하단과 **같은 컴포넌트**를 쓰되
 * 취득시 기준시가 안분 칸은 없다 — 두 파트 모두 실가(증여자 취득가액·증여 신고가액)라 취득가액을 기준시가로 나누지 않는다.
 *
 * 노출 술어는 `effectiveCarryoverDonorSplit` 하나(호출부가 1회 계산해 마운트) — ④ 전송·⑧ 필수와 같다.
 */
import { LandBuildingSaleSplitSection } from "./LandBuildingSaleSplitSection";
import { SplitPartCapexFields } from "./SplitPartCapexFields";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { saleStdPlacement } from "@/lib/calc/transfer-tax-split-acq-mode";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function CarryoverPartsSaleAxis(props: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}) {
  const { asset, onChange } = props;
  // 양도시 기준시가 배치 — 축 A와 같은 1회 계산을 공유한다(하위 재파생 금지).
  const saleStdPlace = saleStdPlacement();
  return (
    <div className="space-y-3" data-testid="carryover-parts-sale-axis">
      <ToneCard tone="amber">
        <p className="text-xs text-amber-900">
          토지·건물을 나눠 계산합니다. 수증자가 증여받은 뒤 지출한 자본적 지출은 토지분·건물분 칸에 각각 입력하고,
          양도가액은 계약서의 구분 기재 또는 양도시 기준시가 비율로 나눕니다 (소득세법 시행령 §166⑥).
        </p>
      </ToneCard>
      <SplitPartCapexFields
        asset={asset}
        onChange={onChange}
        landOwned
        buildingOwned
        // 파트 방식은 «실가»로 고정이다(`normalizeBuildingCauseInputs`) — 남은 환산·감정 플래그의 설명 문구를 보이지 않는다.
        landMode="actual"
        buildingMode="actual"
      />
      <LandBuildingSaleSplitSection
        isBurdenedGift={false}
        saleSplitMode={asset.saleSplitMode ?? "apportioned"}
        onSaleSplitModeChange={onChange}
        landTransferPrice={asset.landTransferPrice ?? ""}
        onLandTransferPriceChange={(v) => onChange({ landTransferPrice: v })}
        buildingTransferPrice={asset.buildingTransferPrice ?? ""}
        onBuildingTransferPriceChange={(v) => onChange({ buildingTransferPrice: v })}
        showStdCard={saleStdPlace.saleAxis}
        asset={asset}
        onAssetChange={onChange}
        transferDate={props.transferDate}
      />
    </div>
  );
}
