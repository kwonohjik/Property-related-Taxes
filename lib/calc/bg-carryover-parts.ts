/**
 * 부담부증여 × 이월과세(「소득세법」 제97조의2) — **증여받은 파트** 단일 소스.
 *
 * 계획서 `docs/00-pm/gb-bg-part-carryover-calc.plan.md` §4.4~§4.6 (PR-2 화면).
 * ⑤(「당초 증여자」 블록·칸 노출)·④(`carryoverDonorBasis.parts`·사건 출처)·⑧(필수 칸·차단)이 이 함수들을 읽는다(3중 패턴).
 *
 * 파트가 갈리는 것은 **일반건물 분리 ON**뿐이다(건물 취득원인 칸). 분리 OFF는 원인이 하나라 둘 다 토지 원인을 따른다 —
 * 건물 원인 칸에 남은 값은 읽지 않는다(분리 OFF 종전 기준 L0 픽스처가 「토지 이월과세 + 건물 매매」다).
 * 일반건물이 아닌 자산은 취득원인 하나가 자산 전체다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";
import { gbCarryoverEventSource } from "./transfer-tax-api-gb-carryover";

type PartScope = Pick<AssetForm, "assetKind" | "acquisitionCause" | "hasSeperateLandAcquisitionDate" | "gbBuildingAcquisitionCause">;

const splitsParts = (asset: PartScope): boolean =>
  asset.assetKind === "general_building" && asset.hasSeperateLandAcquisitionDate === true;

/** 증여받은 파트 — 토지·건물 각각 이월과세(증여)인가. */
export function bgCarryoverParts(asset: PartScope): { land: boolean; building: boolean } {
  const land = asset.acquisitionCause === "carryover_gift";
  return { land, building: splitsParts(asset) ? asset.gbBuildingAcquisitionCause === "carryover_gift" : land };
}

/** 한 파트라도 이월과세인가 — 「당초 증여자」 입력을 여는 조건이다. */
export function bgAnyCarryover(asset: PartScope): boolean {
  const p = bgCarryoverParts(asset);
  return p.land || p.building;
}

/** 토지·건물 중 한 파트만 이월과세인가 — 엔진이 그 파트만 계산한다(감정·매매사례는 막는다 — 계획서 Q-3 a). */
export function bgPartialCarryover(asset: PartScope): boolean {
  const p = bgCarryoverParts(asset);
  return p.land !== p.building;
}

/**
 * ④ `burdenedGiftInfo.carryoverDonorBasis.parts` — 일반건물 분리 ON만 싣는다(미전송 = 둘 다).
 * ⑫ `refineGbBgCarryoverParts`가 같은 본문의 토지·건물 취득원인과 대조한다.
 */
/**
 * 이월과세 × 시가 평가 환산(K-5) · 토지·건물 모두 증여받음 — 시나리오 B 취득가액이 양도인 증여일 상증법 평가액(소령 §163⑨)이라
 * K-6/K-7처럼 「양도인이 증여받은 때의 상증법 평가액」 칸(`bgActual*`)을 연다(⑤)·싣는다(④)·요구한다(⑧).
 * 엔진 `isConvertedCarryoverReadingGiftValuation`·⑫와 같은 조건이다(계획서 `bg-carryover-k5-transferor-sec163-9.plan.md` Q-2 a).
 */
export function bgConvertedCarryoverReadsGiftValuation(asset: PartScope & Pick<AssetForm, "bgAcquisitionMethod">): boolean {
  return asset.bgAcquisitionMethod === "converted" && asset.acquisitionCause === "carryover_gift" && !bgPartialCarryover(asset);
}

/**
 * 이월과세 × K-5·K-6/K-7 · **한 파트만** 증여받은 일반건물 — 시나리오 B에서 양도인 증여일 평가액(소령 §163⑨)을 쓰는 그 파트.
 * 그 파트의 `bgActual*` 칸만 연다(⑤)·싣는다(④)·요구한다(⑧). 다른 파트는 양도인이 매입·신축한 것이라 양도인 자기 방식(환산·매매사례가액·감정가액)이다
 * — K-6/K-7이면 양도인 `bgPresumed*`는 그 다른 파트 칸만, 당초 증여자 `bgCoDonorPresumed*`는 증여받은 파트 칸만 쓴다.
 * 엔진 `partialCarryoverGiftValuationPart`·⑫ `requireBgAcquisitionParts`와 같은 조건이다(계획서 `bg-carryover-k5-one-part-b.plan.md` Q-1·Q-2 a · §9).
 */
export function bgPartialCarryoverGiftValuationPart(
  asset: PartScope & Pick<AssetForm, "bgAcquisitionMethod" | "bgValuationMode">,
): "land" | "building" | undefined {
  const m = asset.bgAcquisitionMethod;
  if (asset.bgValuationMode !== "sangjeungbeop_market" || (m !== "converted" && m !== "appraisal" && m !== "salesCase") || !bgPartialCarryover(asset))
    return undefined;
  return bgCarryoverParts(asset).land ? "land" : "building";
}

export function bgCarryoverPartsPayload(asset: PartScope): { land: boolean; building: boolean } | undefined {
  return splitsParts(asset) ? bgCarryoverParts(asset) : undefined;
}

/**
 * 증여 **사건** 서브폼(등기접수일·증여자 취득일·증여세 신고서 금액·당초 증여자 신축) — 이월과세가 아니면 undefined.
 * 일반건물은 `gbCarryoverEventSource`와 같다: 토지가 이월과세면 토지 블록(`carryover`), 건물만이면 화면의 유일한 블록인 `buildingCarryover`.
 */
export function bgCarryoverForm(
  asset: PartScope & Pick<AssetForm, "carryover" | "buildingCarryover">,
): CarryoverTaxationForm | undefined {
  if (!bgAnyCarryover(asset)) return undefined;
  return asset.assetKind === "general_building" ? gbCarryoverEventSource(asset) : asset.carryover;
}

/** ⑤ 사건 서브폼을 고칠 때 쓸 키 — `bgCarryoverForm`이 읽는 쪽과 같은 서브폼이다. */
export function bgCarryoverFormKey(asset: PartScope): "carryover" | "buildingCarryover" {
  return asset.assetKind === "general_building" && asset.acquisitionCause !== "carryover_gift" ? "buildingCarryover" : "carryover";
}
