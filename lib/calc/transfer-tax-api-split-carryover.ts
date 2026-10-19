/**
 * ④ 주택 split **파트 이월과세**(소득세법 §97의2①) — 폼 → payload 변환 (P2 C).
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.engine.design.md §1 (와이어 정본) · ui.design.md §2.4·§3.1
 *
 * 와이어는 **증여 사건 1벌**(`carryoverGiftEvent`) + **파트 N벌**(`landCarryoverPart`·`buildingCarryoverPart`)이다. 파트에는 평가액·증여세 상당액이 없다 —
 * 파트 평가액은 기존 `landAcquisitionPrice`·`buildingAcquisitionPrice`(`buildSplitPayload`가 싣는다)가 정본이고, 증여세 상당액은 ⑭ 합성기가 영 §163의2②로 안분한다.
 *
 * 일반건물(`transfer-tax-api-gb-carryover.ts`)과 다른 점 — 파트에 `giftDateAssetValue`·환산 플래그가 없다(I-2·I-4: 환산은 후속 P6).
 *
 * 지분(공유) 규약(I-3): 사건 금액(산출세액·과세가액)은 증여세 신고서에 적힌 사실이라 **스케일하지 않고**, 파트 금액(증여자 취득가액·자본적지출)만 `ratioed`로 지분 몫을 만든다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { effectiveCarryoverDonorSplit } from "./transfer-land-part-cause";

/** ⑫ `carryoverGiftEvent` — 증여 그 자체의 사실. */
export interface SplitCarryoverEventPayload {
  giftRegistryDate: string;
  giftTaxCalculated: number;
  giftTaxBase: number;
  donorRelation?: "spouse" | "lineal" | "other";
  donorDeceased?: true;
  exclusionDeclared?: {
    expropriationWithin2Years?: true;
    legacyOneHouseExemptionDeclared?: true;
    isFamilyBusinessInheritedAsset?: true;
  };
}

/** ⑫ `landCarryoverPart`·`buildingCarryoverPart`. */
export interface SplitCarryoverPartPayload {
  donorAcquisitionDate: string;
  donorAcquisitionPrice: number | undefined;
  donorCapitalExpenditure: number | undefined;
}

export interface SplitCarryoverPayload {
  landAcquisitionCause: "carryover_gift";
  carryoverGiftEvent: SplitCarryoverEventPayload;
  landCarryoverPart: SplitCarryoverPartPayload;
  buildingCarryoverPart: SplitCarryoverPartPayload;
}

/**
 * C의 증여 **사건** 출처 서브폼 — 등기접수일·산출세액·과세가액·관계·사망·적용배제가 이 한 벌이다.
 * 건물 파트의 증여자 입력도 같은 `carryover`가 받는다(토글 전 입력이 건물 값으로 재해석된다 — UI 설계 §3.3). 토지 파트는 `landCarryover`.
 * ⑤(카드 바인딩)·④·⑧이 이 함수 하나로 같은 서브폼을 읽는다.
 */
export function splitCarryoverEventSource(asset: Pick<AssetForm, "carryover">): CarryoverTaxationForm | undefined {
  return asset.carryover;
}

/** 파트 서브폼 → 파트 payload. 금액 칸은 비었거나 0이면 `undefined`(빈 값을 「입력했다」로 오인하지 않는다 — ⑫ 필수 위반이 필드 오류로 드러난다). */
function buildPart(
  c: CarryoverTaxationForm | undefined,
  ratioed: (v: string | undefined) => number | undefined,
): SplitCarryoverPartPayload {
  return {
    donorAcquisitionDate: c?.donorAcquisitionDate ?? "",
    donorAcquisitionPrice: ratioed(c?.donorAcquisitionPrice),
    donorCapitalExpenditure: ratioed(c?.donorCapitalExpenditure),
  };
}

function buildEvent(c: CarryoverTaxationForm | undefined): SplitCarryoverEventPayload {
  const ex = c?.exclusionDeclared;
  return {
    giftRegistryDate: c?.giftRegistryDate ?? "",
    giftTaxCalculated: parseAmount(c?.giftTaxCalculated ?? ""),
    giftTaxBase: parseAmount(c?.giftTaxBase ?? ""),
    // §97의2① 관계요건 — 미선택("")·미사망(false)은 보내지 않는다(엔진 기본값과 동치). 사건-수준이 정본이라 두 파트가 함께 읽는다.
    donorRelation: c?.donorRelation || undefined,
    donorDeceased: c?.donorDeceased ? true : undefined,
    ...(ex
      ? {
          exclusionDeclared: {
            expropriationWithin2Years: ex.expropriationWithin2Years ? (true as const) : undefined,
            legacyOneHouseExemptionDeclared: ex.legacyOneHouseExemptionDeclared ? (true as const) : undefined,
            isFamilyBusinessInheritedAsset: ex.isFamilyBusinessInheritedAsset ? (true as const) : undefined,
          },
        }
      : {}),
  };
}

/**
 * C payload — `effectiveCarryoverDonorSplit`가 거짓이면 `undefined`(키를 하나도 내지 않는다: 엔진 T15 stray 400 방지).
 *
 * `landAcquisitionDate`·`acquisitionDate`·`isSeparateAcquisition: false`·파트 방식 `actual`·`landAcquisitionPrice`·`buildingAcquisitionPrice`·양도가액 구분은
 * `buildSplitPayload`/`transfer-tax-api.ts`가 같은 술어로 싣는다. 최상위 `carryoverTaxation`은 싣지 않는다(상호배제 R-1).
 */
export function buildSplitCarryoverPayload(
  asset: AssetForm,
  /** 지분 스케일 적용기 — `buildSplitPayload`가 파트 취득가액에 쓰는 것과 **같은** `makeRatioed(...)` 결과. */
  ratioed: (v: string | undefined) => number | undefined,
  opts?: { isNonPrimary?: boolean },
): SplitCarryoverPayload | undefined {
  if (!effectiveCarryoverDonorSplit(asset, opts)) return undefined;
  return {
    landAcquisitionCause: "carryover_gift",
    carryoverGiftEvent: buildEvent(splitCarryoverEventSource(asset)),
    landCarryoverPart: buildPart(asset.landCarryover, ratioed),
    buildingCarryoverPart: buildPart(asset.carryover, ratioed),
  };
}
