/**
 * ④ 부담부증여 × 토지·건물 소유자 분리 — 증여한 부분(본인 소유분)의 §159 입력 (계획서 `docs/00-pm/bg-owner-split-159.plan.md` §5 · Q-2 a · Q-4).
 *
 * 엔진 입력 계약(`burdened-gift-owner-split.ts`): 비소유 파트의 양도·취득시 기준시가는 **0**, 비소유 파트 실지취득가는 없음, `marketValueByPart` 없음,
 * 증여한 파트의 양도시 기준시가는 양수. 엔진이 0으로 바꿔 주지 않으므로(자동 안분 금지) 여기서 본인 몫만 싣는다.
 *
 * 증여한 파트의 기준시가는 날짜 분리(`bg-house-split.ts`)와 같은 파트 칸이다 — 토지 가목 = ㎡당 공시지가 × 면적, 건물 나목 = `buildingStandardPrice*`.
 * 건물만 본인이면 건물 칸만, 토지만 본인이면 토지 칸만 읽는다(비소유 파트 칸에 남은 값은 읽지 않는다).
 * 시가 모드의 증여한 부분 시가는 새 폼 필드 `bgMarketValueOwnedPart`를 기존 info 키 `marketValueAtTransfer`로 싣는다(새 와이어 키 없음 · 총액 칸을 대신 읽지 않는다).
 * 양도가액 직접 분할(`landTransferPrice` 등)은 싣지 않는다 — 부담부증여는 `isSplitPayloadActive`가 분리 payload를 끄고, 양도가액은 엔진이 §159로 정한다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { parseAmount, parseDecimal } from "@/lib/calc/number-parse";
import { bgOwnerSplitActive, bgOwnerSplitOwnedPart } from "./bg-owner-split-scope";
import { calcLandStdPriceAtAcq, resolveLandStdAtTransfer } from "./transfer-tax-split-acq-mode";

type StdPair = { land: number; building: number };

/** 증여한 부분의 양도시 기준시가 — 비소유 파트는 0. 증여한 부분 값이 비면 해당 파트도 0(⑧이 그 칸으로 보낸다). */
export function bgOwnerSplitTransferStd(asset: AssetForm): StdPair {
  const part = bgOwnerSplitOwnedPart(asset);
  return part === "building"
    ? { land: 0, building: parseAmount(asset.buildingStandardPriceAtTransfer ?? "") || 0 }
    : part === "land"
      ? { land: resolveLandStdAtTransfer(asset) ?? 0, building: 0 }
      : { land: 0, building: 0 };
}

/** 증여한 부분의 취득시 기준시가 — 비소유 파트는 0. */
export function bgOwnerSplitAcqStd(asset: AssetForm): StdPair {
  const part = bgOwnerSplitOwnedPart(asset);
  return part === "building"
    ? { land: 0, building: parseAmount(asset.buildingStandardPriceAtAcq ?? "") || 0 }
    : part === "land"
      ? { land: calcLandStdPriceAtAcq(parseAmount(asset.standardPricePerSqmAtAcq) || 0, parseDecimal(asset.acquisitionArea)) ?? 0, building: 0 }
      : { land: 0, building: 0 };
}

export interface BgOwnerSplitInfoPatch {
  landStdPriceAtTransfer?: number;
  buildingStdPriceAtTransfer?: number;
  landStdPriceAtAcquisition?: number;
  buildingStdPriceAtAcquisition?: number;
  actualLandAcquisitionPrice?: undefined;
  actualBuildingAcquisitionPrice?: undefined;
  marketValueByPart?: undefined;
  giftBuildingStdPriceAtTransfer?: undefined;
  marketValueAtTransfer?: number;
}

/**
 * ④ info의 본인 몫 값 — 범위 안(`bgOwnerSplitActive`)일 때만 덮는다. 단건·다건이 `buildBurdenedGiftInfo`를 거쳐 같은 값을 쓴다.
 *  · 기준시가 4칸: 증여한 부분만, 비소유 파트 0.
 *  · 실지취득가: 총액 칸(`bgActualAcquisitionTotal`)이 증여한 부분의 실지취득가액이다 — 토지·건물 파트 칸에 남은 값은 싣지 않는다.
 *  · 증여일 현재 건물 기준시가(`giftBuildingStdPriceAtTransfer`): 소유자 분리에서 본인분인지 결합 공시가격인지 확인하지 못했다(계획서 V-U1) — 싣지 않는다(⑤도 칸을 숨긴다).
 *  · 시가 모드: `marketValueAtTransfer` = 증여한 부분 시가. 비어 있으면 총액 칸으로 대신하지 않는다(⑧이 막는다).
 */
export function bgOwnerSplitInfoPatch(asset: AssetForm): BgOwnerSplitInfoPatch {
  if (!bgOwnerSplitActive(asset)) return {};
  const t = bgOwnerSplitTransferStd(asset);
  const a = bgOwnerSplitAcqStd(asset);
  return {
    landStdPriceAtTransfer: t.land,
    buildingStdPriceAtTransfer: t.building,
    landStdPriceAtAcquisition: a.land,
    buildingStdPriceAtAcquisition: a.building,
    actualLandAcquisitionPrice: undefined,
    actualBuildingAcquisitionPrice: undefined,
    marketValueByPart: undefined,
    giftBuildingStdPriceAtTransfer: undefined,
    ...(asset.bgValuationMode === "sangjeungbeop_market" ? { marketValueAtTransfer: parseAmount(asset.bgMarketValueOwnedPart) || undefined } : {}),
  };
}
