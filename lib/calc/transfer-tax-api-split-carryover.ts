/**
 * ④ 주택 split **파트 이월과세**(소득세법 §97의2①) — 폼 → payload 변환 (P2 C · P3 A · P4 B).
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.engine.design.md §1 (와이어 정본) · ui.design.md §2.4·§3.1
 *
 * 와이어는 **증여 사건 1벌**(`carryoverGiftEvent`) + **파트 N벌**(`landCarryoverPart`·`buildingCarryoverPart`)이다. 파트에는 평가액·증여세 상당액이 없다 —
 * 파트 평가액은 기존 `landAcquisitionPrice`·`buildingAcquisitionPrice`(`buildSplitPayload`가 싣는다)가 정본이고, 증여세 상당액은 ⑭ 합성기가 영 §163의2②로 안분한다.
 *
 * 일반건물(`transfer-tax-api-gb-carryover.ts`)과 다른 점 — 파트에 `giftDateAssetValue`가 없다(I-2). 증여자 취득가액을 모르면 파트 환산(P6):
 * `useEstimatedAcquisition` + `donorStandardPriceAtAcquisition`(증여자 취득 당시 그 파트 기준시가 총액)을 싣고 가액은 싣지 않는다(⑫ 상호배타).
 *
 * 지분(공유) 규약(I-3): 사건 금액(산출세액·과세가액)은 증여세 신고서에 적힌 사실이라 **스케일하지 않고**, 파트 금액(증여자 취득가액·자본적지출)만 `ratioed`로 지분 몫을 만든다.
 * 환산 분자(증여자 취득 당시 기준시가)는 물건 전체 공시가격이라 **스케일하지 않는다**(`parseAmount` 그대로) — 지분은 엔진이 개산공제에서만 곱한다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";
import { parseAmount } from "@/lib/calc/number-parse";
import { effectiveCarryoverDonorSplit, effectiveLandCarryover } from "./transfer-land-part-cause";
import { effectiveBuildingCarryoverMix } from "./transfer-land-part-cause";
import { partDonorEstimated } from "./transfer-land-part-cause";
import { carryoverHouseholdPayload } from "./transfer-tax-api-carryover";
import { buildDonorBuiltPartPayload, type SplitDonorBuiltPayload } from "./transfer-tax-api-donor-built-part";
import { carryoverAssumedDebt } from "./carryover-gift-assumed-debt";
import { splitCarryoverEventSource } from "./carryover-gift-event-source";

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
  // P5 §97의2②2호 — 1세대1주택 판정 사실(엔진 설계: 계획서 `transfer-split-part-carryover-p5.plan.md` Q3·Q4)
  /** 세대 사실 — 건물(주택)이 이월과세일 때만(B·C). 화면이 묻는 술어(`carryoverHouseholdFactVisible`)와 같은 조각(`carryoverHouseholdPayload`) */
  donorSameHouseholdContinuous?: boolean;
  donorHouseholdHoldingStartDate?: string;
  donorPriorHouseholdResidenceMonths?: number;
  donorRejoinedAfterDivorce?: boolean;
  /** 배우자 예외 — 통째 증여(C) + 배우자일 때만 */
  spouseGiftOneHouseAtGiftDate?: true;
}

/** ⑫ `landCarryoverPart`·`buildingCarryoverPart`. */
export interface SplitCarryoverPartPayload {
  donorAcquisitionDate: string;
  /** 실가 입력일 때만 — 환산(`useEstimatedAcquisition`)이면 싣지 않는다(⑫ 상호배타) */
  donorAcquisitionPrice?: number | undefined;
  /** P6 — 증여자 취득가액을 모를 때 환산취득가액. 환산일 때만 싣는다(OFF payload는 P1~P5와 같다) */
  useEstimatedAcquisition?: true;
  /** P6 — 환산 분자: 증여자 취득 당시 그 파트 기준시가 총액(지분 스케일 없음) */
  donorStandardPriceAtAcquisition?: number | undefined;
  donorCapitalExpenditure: number | undefined;
  /** 당초 증여 때 이 파트에 담보된 채무로서 인수한 금액(지분 몫) — 영 §163의2②2호 분자에서만 뺀다. 사건 토글이 꺼져 있거나 0이면 싣지 않는다. */
  giftAssumedDebt?: number;
  /** PR-3 — 증여자가 신축·증축한 건물(§114조의2 가산세). 건물 파트에서만, 토글 ON일 때만 싣는다(토지 파트는 ⑫가 거부) */
  donorBuilt?: SplitDonorBuiltPayload;
}

export interface SplitCarryoverPayload {
  /** C·A `carryover_gift` · B(건물만 이월과세) `purchase` — 토지 overlay(엔진 설계서 §1.2) */
  landAcquisitionCause: "carryover_gift" | "purchase";
  carryoverGiftEvent: SplitCarryoverEventPayload;
  /** C·A만 — B는 싣지 않는다(엔진 T15 stray 400). */
  landCarryoverPart?: SplitCarryoverPartPayload;
  /** C·B만 — A(토지만 이월과세)는 싣지 않는다(엔진 T15 stray 400). */
  buildingCarryoverPart?: SplitCarryoverPartPayload;
}

/** 증여 사건 서브폼 출처 — ⑤·④·⑧ 공용(`carryover-gift-event-source.ts`가 정본). */
export { splitCarryoverEventSource } from "./carryover-gift-event-source";

/**
 * 파트 서브폼 → 파트 payload. 금액 칸은 비었거나 0이면 `undefined`(빈 값을 「입력했다」로 오인하지 않는다 — ⑫ 필수 위반이 필드 오류로 드러난다).
 * `estimated`(= `partDonorEstimated` 그 파트) 이면 가액 대신 환산 플래그 + 분자를 싣는다 — 둘은 ⑫에서 상호배타다.
 */
function buildPart(
  c: CarryoverTaxationForm | undefined,
  /** 증여 사건 서브폼 — 인수채무 토글(`giftDebtAssumed`)을 읽는다. */
  event: CarryoverTaxationForm | undefined,
  ratioed: (v: string | undefined) => number | undefined,
  estimated: boolean,
  donorBuilt?: SplitDonorBuiltPayload,
): SplitCarryoverPartPayload {
  // 파트 평가액(`*AcquisitionPrice`)과 같은 지분 스케일(`ratioed`)로 줄인다 — 분자 = 평가액 몫 − 채무 몫.
  const debt = carryoverAssumedDebt(event, c) > 0 ? ratioed(c?.giftAssumedDebt) : undefined;
  return {
    donorAcquisitionDate: c?.donorAcquisitionDate ?? "",
    ...(estimated
      ? { useEstimatedAcquisition: true as const, donorStandardPriceAtAcquisition: parseAmount(c?.donorStandardPriceAtAcquisition ?? "") || undefined }
      : { donorAcquisitionPrice: ratioed(c?.donorAcquisitionPrice) }),
    donorCapitalExpenditure: ratioed(c?.donorCapitalExpenditure),
    ...(debt ? { giftAssumedDebt: debt } : {}),
    ...(donorBuilt ? { donorBuilt } : {}),
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
 * C·A·B payload — 셋 다 아니면 `undefined`(키를 하나도 내지 않는다: 엔진 T15 stray 400 방지). A는 사건 + 토지 파트만, B는 사건 + 건물 파트만(토지 overlay `purchase`) —
 * 둘 다 함께 양도 자산이면 싣지 않는다(엔진 S0 — ⑧이 막는다).
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
  const est = partDonorEstimated(asset, opts);
  // PR-3 — 건물 파트의 증여자 신축·증축(⑤·⑧과 같은 술어). 토지 파트에는 싣지 않는다.
  const donorBuilt = buildDonorBuiltPartPayload(asset, opts);
  if (effectiveCarryoverDonorSplit(asset, opts)) {
    const c = asset.carryover;
    return {
      landAcquisitionCause: "carryover_gift",
      carryoverGiftEvent: {
        ...buildEvent(splitCarryoverEventSource(asset)),
        ...carryoverHouseholdPayload(asset),
        // 배우자 예외(P5-Q4) — 통째 증여만. 관계가 바뀐 stale 값은 싣지 않는다(자산 단위 `buildCarryoverPayload`와 같은 규칙).
        ...(c?.donorRelation === "spouse" && c.spouseGiftOneHouseAtGiftDate ? { spouseGiftOneHouseAtGiftDate: true as const } : {}),
      },
      landCarryoverPart: buildPart(asset.landCarryover, splitCarryoverEventSource(asset), ratioed, est.land),
      buildingCarryoverPart: buildPart(asset.carryover, splitCarryoverEventSource(asset), ratioed, est.building, donorBuilt),
    };
  }
  if (!opts?.isNonPrimary && effectiveLandCarryover(asset))
    return {
      landAcquisitionCause: "carryover_gift",
      carryoverGiftEvent: buildEvent(splitCarryoverEventSource(asset)),
      landCarryoverPart: buildPart(asset.landCarryover, splitCarryoverEventSource(asset), ratioed, est.land),
    };
  if (!opts?.isNonPrimary && effectiveBuildingCarryoverMix(asset))
    return {
      landAcquisitionCause: "purchase",
      // 세대 사실(P5-Q3) — 건물이 증여받은 주택이다. 배우자 예외는 싣지 않는다(P5-Q4 — 건물만 증여는 해석례 없음).
      carryoverGiftEvent: { ...buildEvent(splitCarryoverEventSource(asset)), ...carryoverHouseholdPayload(asset) },
      buildingCarryoverPart: buildPart(asset.carryover, splitCarryoverEventSource(asset), ratioed, est.building, donorBuilt),
    };
  return undefined;
}
