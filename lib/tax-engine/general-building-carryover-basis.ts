/**
 * 환산 모드 이월과세 분자·분모 주입 leaf — 2-way·증축(3-way)·실가 경로가 **같은 함수**를 쓴다.
 *
 * `general-building-valuation.ts`에서 옮겼다(PR-0, 2026-10-23): 증축 분기(`general-building-extension.ts`)가 불러야 하는데
 * valuation 이 extension 을 import 하므로 그대로 두면 순환이다. valuation 은 이 함수를 **재수출**해 종전 import 경로를 지킨다.
 */
import type { AssetCardForAggregate } from "./types/general-building.types";

/**
 * 환산 모드 이월과세의 분자·분모를 카드에 실는다 (설계 D9-8) — 증축 경로와 공유한다.
 *
 * 분자는 `composeGbCarryover`가 서브객체에 담아 보낸 사용자 입력(증여자 취득 당시),
 * 분모는 **그 파트의 양도 당시 기준시가**(엔진이 아는 값).
 * 환산 모드가 아니거나 분자가 없으면 아무것도 하지 않는다 — 회귀 0.
 */
export function applyCarryoverEstimationBasis(
  cards: AssetCardForAggregate[],
  landStdAtTransfer: number,
  buildingStdAtTransfer: number,
): void {
  for (const c of cards) {
    const ct = c.carryoverTaxation;
    if (!ct?.useEstimatedAcquisition) continue;
    const numerator = ct.donorStandardPriceAtAcquisition;
    if (numerator === undefined) continue;
    c.carryoverDonorStandardPriceAtAcquisition = numerator;
    c.standardPriceAtTransferForCarryover =
      c.propertyType === "land" ? landStdAtTransfer : buildingStdAtTransfer;
  }
}
