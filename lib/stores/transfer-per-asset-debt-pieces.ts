/**
 * 사이드바·자산별 요약 — 이월과세 당초 증여 채무 부분(매입분)을 나눈 결과의 **매입분 행**을 원 자산으로 합친다.
 *
 * 엔진은 한 자산을 증여분(= 원 카드 id)·매입분(`${id}__purchased`) 두 카드로 집계해 `mode:"bundled"`로 돌려준다(엔진 설계서 §2.6).
 * `computeTransferPerAssetSummary`는 폼 `assetId`(주 자산은 `primary`)로 행을 찾으므로 증여분 행만 잡히고 매입분 행이 빠진다 —
 * 단건은 양도가액·취득가액이 조각 하나로 보이고, 함께 양도 둘째 자산은 합산이 어긋난다(계획서 UI 설계서 §4).
 * 채택이 B(한 행)이거나 r = 1(매입분 한 행이 원 id)이면 `__purchased` 행이 없어 `null` — 종전 그대로다.
 */
import type { TransferAPIResult } from "@/lib/calc/transfer-tax-api";

export const PURCHASED_PART_ID_SUFFIX = "__purchased";

export interface PurchasedPartRowTotals {
  sale: number;
  acq: number;
  exp: number;
}

export function purchasedPartTotals(
  bundled: Extract<TransferAPIResult, { mode: "bundled" }> | null,
  bundledAssetId: string,
): PurchasedPartRowTotals | null {
  const id = `${bundledAssetId}${PURCHASED_PART_ID_SUFFIX}`;
  const row = bundled?.apportionment.apportioned.find((p) => p.assetId === id);
  if (!row) return null;
  // 필요경비는 엔진이 실제로 차감한 값(개산공제 포함)이 정본이다 — 안분 행은 입력 경비만 담는다(F-14와 같은 규칙).
  const prop = bundled?.aggregated?.properties?.find((p) => p.propertyId === id);
  return { sale: row.allocatedSalePrice, acq: row.allocatedAcquisitionPrice, exp: prop?.necessaryExpense ?? row.allocatedExpenses };
}
