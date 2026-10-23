/**
 * 의제취득일 전 상속·증여 토지·주택·상가·건물 × 부담부증여 — 3자 max(시가 평가, Q-24)인가 의제취득일 기준시가(기준시가 평가, Q-25)인가.
 * ⑤ 문구·①칸 노출과 ⑧이 같은 술어를 쓴다. `bg-pre-deemed.ts`와 나눈 이유: 담보 승 판정이 ④ 부담부증여 빌더를 import해서
 * ④가 범위 술어를 쓰면 순환 import가 된다.
 */
import { isBgPreDeemedAsset } from "./bg-pre-deemed";
import { bgCollateralForcesStdAcq } from "./burdened-gift-collateral-win";
import { gbBgMarketPreDeemedParts } from "./gb-pre-deemed";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 시가 평가라도 담보평가(상증법 §66)가 이기면 §159①1호 괄호가 발동한다(엔진 `acqStdPriceForced` — `bgCollateralForcesStdAcq`와 같은 축). */
export function bgPreDeemedUsesThreeWay(asset: AssetForm): boolean {
  return isBgPreDeemedAsset(asset) && asset.bgValuationMode === "sangjeungbeop_market" && !bgCollateralForcesStdAcq(asset);
}

/**
 * 일반건물 부담부증여의 취득가액이 GB 취득시 기준시가 칸 × 채무비율인가 — 기준시가 평가 또는 시가 평가·담보 승(§159①1호 괄호 · Q-25).
 * 1985.1.1. 전 상속·증여 파트면 그 칸이 의제취득일 기준시가라 ①③이 후보가 아니다 — ⑧ E-1 면제(G-1)·⑤ 등급 카드 문구(G-4)가 같은 술어를 쓴다(PR-7b-2).
 * 시가 평가(파트별 3자 max · Q-28·Q-29)는 PR-7b-6.
 */
export function gbBgUsesStdAcq(asset: AssetForm): boolean {
  if (asset.assetKind !== "general_building" || asset.transferType !== "burdened_gift") return false;
  return asset.bgValuationMode !== "sangjeungbeop_market" || bgCollateralForcesStdAcq(asset);
}

/**
 * 일반건물 부담부증여 · 시가 평가(담보 패) — 의제취득일 전 상속·증여 파트는 그 파트만 3자 max다(사용자 결정 Q-28 · PR-7b-6).
 * ⑤(① 칸·산정방식 라디오·방식별 금액 칸)와 ⑧(① 필수 Q-29·G-5 · E-1 면제 · 산정방식 요구)이 같은 술어를 쓴다. 두 파트가 모두면 산정방식이 없다.
 */
export function gbBgThreeWayParts(asset: AssetForm): { land: boolean; building: boolean; all: boolean; any: boolean } {
  const m = gbBgMarketPreDeemedParts(asset);
  const on = (m.land || m.building) && !bgCollateralForcesStdAcq(asset);
  const land = on && m.land;
  const building = on && m.building;
  return { land, building, all: land && building, any: land || building };
}
