/**
 * 주택·건물(토지 제외) 부담부증여 × 토지·건물 취득일 다름 — ⑤ 칸 · ④ 전송 · ⑧ 필수가 함께 읽는 단일 술어.
 *
 * 설계서 `docs/00-pm/bg-house-building-split.design.md` §5.2(Q-2 a · Q-3 a). 엔진은 토지·건물을 파트로 나눠 §159를 계산한다(PR-A `burdened-gift-split-parts.ts`).
 *  · `own` — 본인 취득: 「토지·건물 취득일 다름」을 켜고 토지 취득일이 건물(자산) 취득일과 다르다. 토지 취득원인을 따로 두지 않았다.
 *  · `carryover` — 이월과세 토글 C: 당초 증여자가 토지·건물을 다른 날 취득했다. 건물분 증여자 취득일은 `buildingCarryover.donorAcquisitionDate`(일반건물 부담부증여와 같은 키).
 * 엔진의 같은 조건은 `bgPartDatesDiffer`(날짜로 판정)다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { parseAmount, parseDecimal } from "@/lib/calc/number-parse";
import { selfOwnsSplitApplicable, effectiveSelfOwns } from "./self-owns-scope";
import { burdenedGiftCarryoverDonorSplitRequested, engineLandOverlay } from "./transfer-land-part-cause";
import { calcLandStdPriceAtAcq, resolveLandStdAtTransfer } from "./transfer-tax-split-acq-mode";
import { safeMultiplyThenDivide } from "@/lib/tax-engine/tax-utils";

export type BgHouseSplitMode = "own" | "carryover";

export function bgHouseSplitMode(asset: AssetForm, opts?: { isNonPrimary?: boolean }): BgHouseSplitMode | undefined {
  if (asset.transferType !== "burdened_gift" || !selfOwnsSplitApplicable(asset)) return undefined;
  if ((effectiveSelfOwns(asset) ?? "both") !== "both") return undefined;
  if (burdenedGiftCarryoverDonorSplitRequested(asset, opts)) return "carryover";
  if (asset.acquisitionCause === "carryover_gift") return undefined;
  if (!asset.hasSeperateLandAcquisitionDate || !asset.landAcquisitionDate || engineLandOverlay(asset)) return undefined;
  return asset.landAcquisitionDate !== asset.acquisitionDate ? "own" : undefined;
}

/** 파트 칸이 열려 있는가 — 실지취득가액·매매사례가액·감정가액·평가액을 토지·건물로 받는다. */
export const bgHouseSplitActive = (asset: AssetForm, opts?: { isNonPrimary?: boolean }): boolean => bgHouseSplitMode(asset, opts) !== undefined;

/**
 * 양도시 토지·건물 기준시가(§159 파트 A의 근거 — 기준시가 평가면 그 값, 시가 평가면 파트 평가액 칸이 대신한다).
 *  · 건물(토지 제외): 토지 = ㎡당 공시지가 × 면적(「소득세법」 제99조 제1항 제1호 가목) · 건물 = 국세청 기준시가(나목).
 *  · 주택: 개별주택가격(라목 — 부수토지 포함 결합 공시)을 가목 : 나목 비율로 나눈다(「소득세법 시행령」 제166조 제6항 · 집행기준 99-164-9 · 일반 양도 S3-1과 같은 비례).
 * 가목·나목 중 하나라도 없으면 undefined(⑧이 그 칸으로 보낸다 — 자동 안분하지 않는다).
 */
export function bgHouseSplitTransferStd(asset: AssetForm): { land: number; building: number } | undefined {
  const ga = resolveLandStdAtTransfer(asset) ?? 0;
  const na = parseAmount(asset.buildingStandardPriceAtTransfer ?? "") || 0;
  if (ga <= 0 || na <= 0) return undefined;
  if (asset.assetKind !== "housing") return { land: ga, building: na };
  const total = parseAmount(asset.standardPriceAtTransfer) || 0;
  if (total <= 0) return undefined;
  const land = safeMultiplyThenDivide(total, ga, ga + na);
  return { land, building: total - land };
}

/**
 * 본인 취득의 취득시 토지·건물 기준시가 — 다른 날 따로 취득했으니 파트마다 그 취득일의 값이다(토지 = 가목 · 건물 = 나목, 「소득세법 시행령」 제164조 제3항).
 * 일반 양도 별개 취득과 같은 칸(`standardPricePerSqmAtAcq` × `acquisitionArea` · `buildingStandardPriceAtAcq`)을 쓴다.
 */
export function bgHouseSplitAcqStd(asset: AssetForm): { land: number; building: number } | undefined {
  const land = calcLandStdPriceAtAcq(parseAmount(asset.standardPricePerSqmAtAcq) || 0, parseDecimal(asset.acquisitionArea)) ?? 0;
  const building = parseAmount(asset.buildingStandardPriceAtAcq ?? "") || 0;
  return land > 0 && building > 0 ? { land, building } : undefined;
}

/**
 * ④ 주택·건물 부담부증여 info의 파트 값 — 엔진이 토지·건물 파트로 §159를 계산한다(설계서 §5.2).
 * 파트 칸이 정본이고 총액 칸은 싣지 않는다(⑤가 숨긴다). 날짜가 같으면 반대로 파트 칸의 남은 값을 싣지 않는다 — 엔진은 실지 파트 칸이 하나라도 있으면 총액을 버린다.
 * 본인 취득의 취득시 기준시가는 파트마다 그 취득일의 값이다. 이월과세는 당초 증여자 값(`carryoverDonorBasis`)이 A를 정하고 양도인(B)은 한 날짜라 종전 그대로다.
 */
export function bgHouseSplitInfoPatch(asset: AssetForm): {
  actualLandAcquisitionPrice?: undefined;
  actualBuildingAcquisitionPrice?: undefined;
  actualAcquisitionTotal?: undefined;
  marketValueByPart?: { land: number; building: number };
  landStdPriceAtTransfer?: number;
  buildingStdPriceAtTransfer?: number;
  landStdPriceAtAcquisition?: number;
  buildingStdPriceAtAcquisition?: number;
} {
  const mode = bgHouseSplitMode(asset);
  if (!mode) return { actualLandAcquisitionPrice: undefined, actualBuildingAcquisitionPrice: undefined, marketValueByPart: undefined };
  const transferStd = bgHouseSplitTransferStd(asset);
  const acqStd = mode === "own" ? bgHouseSplitAcqStd(asset) : undefined;
  const marketLand = parseAmount(asset.bgMarketValueLand) || 0;
  const marketBuilding = parseAmount(asset.bgMarketValueBuilding) || 0;
  return {
    actualAcquisitionTotal: undefined,
    ...(transferStd ? { landStdPriceAtTransfer: transferStd.land, buildingStdPriceAtTransfer: transferStd.building } : {}),
    ...(acqStd ? { landStdPriceAtAcquisition: acqStd.land, buildingStdPriceAtAcquisition: acqStd.building } : {}),
    ...(asset.bgValuationMode === "sangjeungbeop_market" && marketLand > 0 && marketBuilding > 0
      ? { marketValueByPart: { land: marketLand, building: marketBuilding } }
      : {}),
  };
}
