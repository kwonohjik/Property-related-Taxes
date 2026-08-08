"use client";

/**
 * 비-매매 취득원인(상속·증여·신축 등)에서 **토지·건물 소유자 분리** 계산에 필요한 입력 블록.
 *
 * 계획서: docs/02-design/features/transfer-self-owns-non-purchase.plan.md §4.3
 *
 * 매매 경로(`CompanionAcqPurchaseBlock`)는 취득일 2열·취득시 기준시가·축 A를 모두 갖췄지만
 * 상속·증여 블록에는 하나도 없다. 그 상태로 소유자 토글만 노출하면 `calcSplitGain`이
 * null을 반환하고 `selfOwns`가 무시되어 **비소유 파트까지 전액 과세**된다
 * (transfer-tax.ts:315 — `splitDetail && selfOwns !== "both"`).
 *
 * 이 블록은 **조립만** 한다(로직 신설 없음):
 *   ① 취득시 기준시가 — `StandardPriceInput`(§166⑥ 안분 비율 소스)
 *   ② 축 A — `LandBuildingSaleSplitSection`(양도가액 구분/일괄 + 양도시 기준시가)
 *
 * 토지 취득일은 **입력받지 않는다** — 상속·증여는 취득일이 하나(상속개시일·증여일)이므로
 * API 변환이 `acquisitionDate`로 후퇴시킨다(`transfer-tax-api-split.ts`). 같은 날짜가 되어
 * `isSeparateAcquisition`이 false → 파트별 취득가액 완결 규칙 대신 기준시가 비율 안분 경로.
 * (건물만 상속받고 토지는 이전에 매매 취득한 경우처럼 **파트별 취득원인이 다른** 케이스는
 *  현 데이터 모델이 표현하지 못한다 — 별도 과제.)
 */

import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LandBuildingSaleSplitSection } from "./LandBuildingSaleSplitSection";
import { saleStdPlacement, effectivePartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";
import { toPropertyKind } from "./CompanionAcqPurchaseBlock.types";
import { isLandBuildingSplitable } from "./AssetOwnershipSplitSection";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function NonPurchaseSplitInputsBlock(props: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}) {
  const { asset, onChange } = props;

  // 매매는 `CompanionAcqPurchaseBlock`이 이미 전부 제공한다 — 중복 노출 금지.
  if (asset.acquisitionCause === "purchase") return null;
  if (!isLandBuildingSplitable(asset.assetKind)) return null;
  if ((asset.selfOwns ?? "both") === "both") return null;
  // 겸용주택은 자체 4부분 안분이 축을 지배한다(`isSeparateAcquisition`에서도 제외).
  if (asset.isMixedUseHouse) return null;

  // 양도시 기준시가 배치 — 축 A와 **같은 1회 계산**을 공유한다(하위 재파생 금지 규약).
  // ⏳ Phase 1-D부터 배치는 불변(항상 축 A) — §100③ 판정이 양쪽 기준시가를 요구한다.
  const saleStdPlace = saleStdPlacement();

  const ownedLabel = asset.selfOwns === "building_only" ? "건물" : "토지";

  return (
    <div className="space-y-3" data-testid="non-purchase-split-inputs">
      <ToneCard tone="amber" noDark>
        <p className="text-xs text-amber-900">
          토지·건물 소유자가 달라 <strong>{ownedLabel}분만</strong> 본인 양도소득으로 과세합니다.
          취득가액·양도가액은 아래 기준시가 비율로 토지·건물에 안분합니다 (소득세법 시행령 §166⑥).
        </p>
      </ToneCard>

      {/* ① 취득시 기준시가 — 취득가액 안분 비율의 유일한 소스(§99①1호 가목·나목).
          토지분 = ㎡당 개별공시지가 × 면적, 건물분 = 총액 − 토지분.
          ⚠️ 의제취득일(1985.1.1.) 이전 상속은 `PreDeemedInputs`가 같은 `standardPriceAtAcq`
             필드에 총액을 넣는다 — 같은 폼 필드를 공유하므로 값이 어긋나지 않는다
             (components/calc/CLAUDE.md "같은 의미 폼 필드의 양방향 read/write" 규약). */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">
          취득시 기준시가 (원) <span className="text-destructive">*</span>
        </label>
        <StandardPriceInput
          propertyKind={toPropertyKind(asset.assetKind)}
          totalPrice={asset.standardPriceAtAcq ?? ""}
          onTotalPriceChange={(v) => onChange({ standardPriceAtAcq: v })}
          pricePerSqm={asset.standardPricePerSqmAtAcq ?? ""}
          onPricePerSqmChange={(v) => onChange({ standardPricePerSqmAtAcq: v })}
          area={asset.acquisitionArea ?? ""}
          onAreaChange={(v) => onChange({ acquisitionArea: v })}
          jibun={asset.addressJibun}
          dong={asset.addressDong}
          ho={asset.addressHo}
          referenceDate={asset.acquisitionDate}
          hint="토지·건물 안분 비율 산정 기준 (§166⑥). 토지분 = ㎡당 공시지가 × 면적, 건물분 = 총액 − 토지분"
        />
      </div>

      {/* ② 축 A — 양도가액 구분/일괄 + 양도시 기준시가 */}
      <LandBuildingSaleSplitSection
        isBurdenedGift={asset.transferType === "burdened_gift"}
        saleSplitMode={asset.saleSplitMode ?? "apportioned"}
        // patch 덩어리를 그대로 전달 — 전환 시 쓰지 않는 값 정리가 함께 들어 있다.
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
