/**
 * 단건 환산 §97②2호 단서(swap) — 표시 계층이 «양도차익 계산에서 실제로 뺀 값»을 읽는 leaf.
 *
 * 단서가 적용되면 엔진은 당회차 환산취득가액을 차감하지 않고(필요경비 = 실비 전액), 개산공제도 쓰지 않는다.
 * 그런데 `acquisitionPrice`·`ownAcquisitionPrice`·`estimatedDeduction` echo 는 환산·개산공제 값을 그대로
 * 싣는다 — 그대로 표에 쓰면 「양도가액 − 취득가액 − 필요경비 = 양도차익」이 깨진다
 * (실측: 400,000,000 − 80,000,000 − 100,000,000 ≠ 300,000,000). 신고서·결과 화면이 이 leaf 를 같이 쓴다.
 *
 * 기신고분(영 §158②)은 그 회차에서 확정된 값이라 단서와 무관하게 차감된다 — `acquisitionPrice − ownAcquisitionPrice`.
 * ① lot 부분 swap 은 엔진이 `ownAcquisitionPrice` 에서 이미 뺐고 `swapApplied` 가 false 라 여기 걸리지 않는다.
 */

import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

type SwapEcho = Pick<StockTransferResult, "swapApplied" | "acquisitionPrice" | "ownAcquisitionPrice" | "estimatedDeduction">;

/**
 * 당회차 취득가액 echo — 2026-09-14 이전 저장 이력에는 `ownAcquisitionPrice` 가 없다(타입은 필수지만 복원 데이터는
 * 그 전 형태일 수 있다). 그때는 기신고 합산도 폼 레벨이었으므로 `acquisitionPrice` 가 곧 당회차분이다.
 */
export function ownAcquisitionPriceEcho(r: SwapEcho): number {
  return r.ownAcquisitionPrice ?? r.acquisitionPrice;
}

/** 단서로 차감하지 않은 당회차 환산취득가액 — 단서가 아니면 0 */
export function swapExcludedAcquisitionPrice(r: SwapEcho): number {
  return r.swapApplied ? ownAcquisitionPriceEcho(r) : 0;
}

/** 차감된 취득가액 합계(기신고분 포함) */
export function deductedAcquisitionPrice(r: SwapEcho): number {
  return r.acquisitionPrice - swapExcludedAcquisitionPrice(r);
}

/** 차감된 당회차 취득가액 */
export function deductedOwnAcquisitionPrice(r: SwapEcho): number {
  return ownAcquisitionPriceEcho(r) - swapExcludedAcquisitionPrice(r);
}

/** 필요경비에 들어간 개산공제 — 단서면 없다 */
export function appliedEstimatedDeduction(r: SwapEcho): number | undefined {
  return r.swapApplied ? undefined : r.estimatedDeduction;
}
