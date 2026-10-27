/**
 * 집계 「파생 단위」 — 이월과세 × 당초 증여 채무 부분(매입분) (설계서 §2.3~§2.6).
 *
 * 채무가 있는 이월과세 카드 i는 §97의2②3호 신고단위 비교에서 **A 배정일 때만** 증여분·매입분 두 카드로 펼쳐진다. B 배정(또는 강제 없음)은 원형 그대로.
 * 매입분 카드는 `properties` **꼬리**에 덧붙인다 — 원래 카드의 index가 하나도 밀리지 않아 `overrides`·`eligible`·`comparisons`·외부 단위 `start`와
 * 비교 드라이버(`resolveFilingUnitCarryoverScope`)를 건드릴 필요가 없다. 결과 `properties`는 A 배정 시 입력 카드 수보다 행이 늘 수 있다(`propertyId`로 찾는다).
 *
 * 단건 엔진(`calculateTransferTax`)에는 채무 키를 벗긴 카드만 보낸다 — 단건 엔진이 채무 키를 받으면 `calcCarryoverScenarios`가 던진다(G1).
 */

import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { calculateHoldingPeriod } from "./tax-utils";
import { carryoverDebtPiecesUnsupportedReason } from "./carryover-debt-pieces-scope";
import { carryoverDebtShareOf, splitCarryoverDebtPieces, type CarryoverDebtPieces, type CarryoverDebtShare } from "./carryover-debt-pieces";
import type { CarryoverScenarioOverrides, FilingUnitCarryoverComparison } from "./transfer-tax-aggregate-carryover-scope";
import type { AggregateTransferResult, PerPropertyBreakdown, TransferTaxItemInput } from "./types/transfer-aggregate.types";
import type { CarryoverPieceEcho, CarryoverPurchasedPartSplit, CarryoverTaxationDetail } from "./types/transfer-carryover.types";

export interface CarryoverDebtUnit extends CarryoverDebtPieces {
  share: CarryoverDebtShare;
  /** 원형 카드(채무 키 제거) — B 배정·baseline이 쓴다 */
  original: TransferTaxItemInput;
}

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * 채무가 있는 이월과세 카드(index → 조각). 조각을 만들 수 없는 입력은 여기서 던진다 — 조용히 한 덩어리로 계산하지 않는다.
 * @param externalStarts 외부 비교 단위(일반건물 부담부증여)의 시작 index — 파생 단위가 아니다.
 */
export function deriveCarryoverDebtUnits(
  properties: readonly TransferTaxItemInput[],
  externalStarts: ReadonlySet<number>,
): Map<number, CarryoverDebtUnit> {
  const units = new Map<number, CarryoverDebtUnit>();
  properties.forEach((p, i) => {
    if (p.acquisitionCause !== "carryover_gift") return;
    const share = carryoverDebtShareOf(p.carryoverTaxation);
    if (!share || externalStarts.has(i)) return;
    const reason = carryoverDebtPiecesUnsupportedReason(p as unknown as Record<string, unknown>);
    if (reason) throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, `당초 증여 때 인수한 채무 부분을 시나리오 A에서 나누어 계산하지 못하는 입력입니다 — ${reason}.`, { path: "carryoverTaxation.giftAssumedDebt" });
    if (
      p.oneHouseUnitRole === "house" &&
      properties.some((q) => q.oneHouseUnitRole === "appurtenant_land" || q.oneHouseUnitRole === "appurtenant_excess" || (q.propertyType === "land" && q.landNature === "appurtenant_to_housing"))
    )
      throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, "당초 증여 때 인수한 채무 부분을 나누면 집이 두 카드가 되어 주택부수토지와 함께 하는 1세대1주택 단위(소득세법 제89조 제1항 제3호)를 만들 수 없습니다.", { path: "carryoverTaxation.giftAssumedDebt" });
    const original = stripDebtKey(p);
    units.set(i, { share, original, ...splitCarryoverDebtPieces(original, share) });
  });
  return units;
}

/** 엔진에 보내는 카드 — 채무 키를 벗긴다(단건 엔진 가드 G1). */
export function stripDebtKey(p: TransferTaxItemInput): TransferTaxItemInput {
  const ct = p.carryoverTaxation;
  return ct && ct.giftAssumedDebt !== undefined ? { ...p, carryoverTaxation: { ...ct, giftAssumedDebt: undefined } } : p;
}

/** A 배정인 파생 단위를 펼친다: 카드 i → 증여분(r = 1이면 매입분), 매입분은 꼬리. `engineProps`는 채무 키가 벗겨진 원형 목록(길이 불변). */
export function applyDebtUnits(
  engineProps: readonly TransferTaxItemInput[],
  units: ReadonlyMap<number, CarryoverDebtUnit>,
  overrides: CarryoverScenarioOverrides,
): TransferTaxItemInput[] {
  if (units.size === 0) return [...engineProps];
  const props = [...engineProps];
  const tail: TransferTaxItemInput[] = [];
  for (const [i, u] of units) {
    if (overrides[i] !== "A") continue;
    props[i] = u.gift ?? u.purchased;
    if (u.gift) tail.push(u.purchased);
  }
  return [...props, ...tail];
}

const rowOf = (r: AggregateTransferResult, id: string): PerPropertyBreakdown | undefined => r.properties.find((p) => p.propertyId === id);

const pieceEcho = (row: PerPropertyBreakdown, acquisitionDate: Date, transferDate: Date): CarryoverPieceEcho => ({
  propertyId: row.propertyId,
  transferPrice: row.transferPrice,
  acquisitionPrice: row.acquisitionPrice,
  acquisitionDate: ymd(acquisitionDate),
  holdingPeriodYears: calculateHoldingPeriod(acquisitionDate, transferDate).years,
  transferGain: row.transferGain,
  appliedRate: row.appliedRate,
});

/**
 * 부모 카드(`properties[i]`)의 detail에 조각 echo를 싣는다 — 채택과 무관하게 항상.
 * 채택하지 않은 쪽(A′)은 드라이버가 이미 돌린 반사실 실행(`runA`)의 카드 행에서 만든다.
 * B 열은 원형 카드 baseline의 B(자산 전체)다 — 증여분 카드 내부의 B는 조각 크기로 줄인 값이라 쓰지 않는다.
 */
export function attachPurchasedPartSplit(
  final: AggregateTransferResult,
  index: number,
  unit: CarryoverDebtUnit,
  runA: AggregateTransferResult,
  baselineDetail: CarryoverTaxationDetail | undefined,
  cmp: FilingUnitCarryoverComparison,
): AggregateTransferResult {
  const row = final.properties[index];
  const detail = row?.carryoverTaxationDetail ?? baselineDetail;
  if (!row || !detail || !baselineDetail) return final;
  const { gift, purchased, original, share } = unit;
  const transferDate = original.transferDate;
  const ct = original.carryoverTaxation!;
  const giftRow = gift ? rowOf(runA, gift.propertyId) : undefined;
  const purchasedRow = rowOf(runA, purchased.propertyId);
  if (!purchasedRow || (gift && !giftRow)) return final;
  const split: CarryoverPurchasedPartSplit = {
    debtAmount: share.debt,
    giftValuation: share.valuation,
    transferPrice: original.transferPrice,
    donorAcquisitionPrice: baselineDetail.scenarioA.acquisitionPrice,
    ...(giftRow ? { gift: pieceEcho(giftRow, ct.donorAcquisitionDate, transferDate) } : {}),
    purchased: pieceEcho(purchasedRow, ct.giftRegistryDate, transferDate),
    determinedTaxA: cmp.determinedTaxWithCarryover,
    determinedTaxB: cmp.determinedTaxWithout,
  };
  const next: CarryoverTaxationDetail = {
    ...detail,
    filingUnitComparison: cmp,
    scenarioA: { ...detail.scenarioA, purchasedPartSplit: split },
    scenarioB: baselineDetail.scenarioB,
  };
  return { ...final, properties: final.properties.map((p, idx) => (idx === index ? { ...p, carryoverTaxationDetail: next } : p)) };
}
