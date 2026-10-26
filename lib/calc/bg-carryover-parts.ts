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
