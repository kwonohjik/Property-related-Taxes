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

export interface CarryoverCardTotals {
  acq: number;
  exp: number;
}

/**
 * 이월과세 일반건물 단건 — 카드(토지·건물·증여분·매입분 꼬리) 전체의 **엔진이 실제로 차감한** 취득가액·필요경비 합.
 *
 * 일반건물 단건의 사이드바는 안분 행(`apportionment.apportioned`) 합을 읽는데, 이 행은 집계 **이전** 카드로 만들어져(`buildApportionment`)
 * 이월과세 시나리오 A 채택 시 증여자 기준 취득가액·필요경비가 반영되지 않고 수증자 환산 카드 값이 남는다 — 채무 조각과 무관하게 이미 엔진 차감과 어긋난 상태였다
 * (실측: 토지 A 채택 취득가액 1.5억 + 건물 2.5억 = 엔진 4억 ↔ 사이드바 5억 · 필요경비 1,500만 ↔ 600만).
 * 조각이 생기면 꼬리 카드(`land__purchased`)는 `aggregated.properties`에만 있어 더 벌어진다(엔진 설계서 §3.4) → 같은 파일 `computeTransferPerAssetSummary`의
 * 원칙(「엔진이 이 자산에 **실제로 쓴** 취득가액·필요경비」)대로 집계 값을 읽는다.
 *
 * 이월과세 카드(`carryoverTaxationDetail`)가 하나도 없으면 `null` — 이월과세가 아닌 일반건물은 종전 소스 그대로다(회귀 0).
 */
export function carryoverCardTotals(bundled: Extract<TransferAPIResult, { mode: "bundled" }> | null): CarryoverCardTotals | null {
  const props = bundled?.aggregated?.properties;
  if (!props || !props.some((p) => p.carryoverTaxationDetail)) return null;
  return props.reduce((acc, p) => ({ acq: acc.acq + p.acquisitionPrice, exp: acc.exp + p.necessaryExpense }), { acq: 0, exp: 0 });
}
