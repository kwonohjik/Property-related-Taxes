/**
 * 의제취득일 전 상속·증여 토지·주택·상가·건물 × 부담부증여 — 3자 max(시가 평가, Q-24)인가 의제취득일 기준시가(기준시가 평가, Q-25)인가.
 * ⑤ 문구·①칸 노출과 ⑧이 같은 술어를 쓴다. `bg-pre-deemed.ts`와 나눈 이유: 담보 승 판정이 ④ 부담부증여 빌더를 import해서
 * ④가 범위 술어를 쓰면 순환 import가 된다.
 */
import { isBgPreDeemedAsset } from "./bg-pre-deemed";
import { bgCollateralForcesStdAcq } from "./burdened-gift-collateral-win";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 시가 평가라도 담보평가(상증법 §66)가 이기면 §159①1호 괄호가 발동한다(엔진 `acqStdPriceForced` — `bgCollateralForcesStdAcq`와 같은 축). */
export function bgPreDeemedUsesThreeWay(asset: AssetForm): boolean {
  return isBgPreDeemedAsset(asset) && asset.bgValuationMode === "sangjeungbeop_market" && !bgCollateralForcesStdAcq(asset);
}
