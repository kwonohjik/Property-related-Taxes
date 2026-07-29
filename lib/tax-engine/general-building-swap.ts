/**
 * 일반건물(토지+건물 다중카드) 환산 경로 §97②2호 단서 swap — 자산총액 판정(안 A).
 *
 * 계획서: docs/00-pm/general-commercial-estimated-97-2-swap.plan.md §5.2.
 *
 * §97②2호 단서는 **자산 단위** 택일(가목=환산취득가+개산공제 vs 나목=자본적지출+양도비, MAX).
 * aggregate가 토지/건물(+NBL 4카드)로 쪼개므로:
 *   1) 판정은 **환산 카드 전체의 estimatedSide 합** 1회(F8 — 환산 카드만; 실가 카드 제외).
 *   2) 나목(directSide)을 swap 대상 카드에 **estimatedSide 비율**로 배분(F9 default),
 *      마지막 카드가 잔액 흡수(`Σ 배분 = directSide` 불변식 — feedback_floor_residual_absorption).
 * 배분된 카드는 buildProperties에서 acquisitionPrice=0(환산가 미차감)·expenses=배분나목으로 재구성.
 */
import { applyRate } from "./tax-utils";
import type { AssetCardForAggregate } from "./general-building-valuation";

export interface GeneralBuildingSwapDecision {
  /** §97②2호 단서 나목 채택 여부 (자산총액 directSide > estimatedSideTotal). */
  swapApplied: boolean;
  /** 가목 합계 = Σ(환산 카드 환산취득가 + 개산공제). */
  estimatedSideTotal: number;
  /** 나목 = 자본적지출 + 양도비 (자산 총액). */
  directSide: number;
  /** propertyId → 배분된 나목분 (swap 대상 카드만 키 존재). */
  allocation: Map<string, number>;
}

/**
 * 자산총액 swap 판정 + 나목 카드 배분.
 * @param cards 환산·실가 혼재 가능 (환산 카드만 판정·배분 대상 — F8/G3 경계).
 */
export function resolveGeneralBuildingSwap(
  cards: AssetCardForAggregate[],
  capitalExpenditure: number | undefined,
  transferExpense: number | undefined,
): GeneralBuildingSwapDecision {
  const directSide = (capitalExpenditure ?? 0) + (transferExpense ?? 0);
  const swapEligible =
    capitalExpenditure !== undefined || transferExpense !== undefined;
  // F8: 환산 카드(usedEstimatedAcquisition=true)만 가목 합산 — 실가 카드는 이미 actual 경로.
  const estimatedCards = cards.filter((c) => c.usedEstimatedAcquisition);
  const estimatedSideTotal = estimatedCards.reduce(
    (s, c) => s + c.acquisitionPrice + c.expenses,
    0,
  );
  const allocation = new Map<string, number>();
  // 동률(==)은 본문(단서 "적은 경우").
  const swapApplied =
    swapEligible && estimatedCards.length > 0 && directSide > estimatedSideTotal;

  if (swapApplied) {
    let allocated = 0;
    estimatedCards.forEach((c, i) => {
      let share: number;
      if (i === estimatedCards.length - 1) {
        // 마지막 카드 잔액 흡수 → Σ = directSide.
        share = directSide - allocated;
      } else {
        // estimatedSide 비율 (F9). directSide × (카드 estimatedSide / estimatedSideTotal).
        share =
          estimatedSideTotal > 0
            ? applyRate(directSide, (c.acquisitionPrice + c.expenses) / estimatedSideTotal)
            : Math.floor(directSide / estimatedCards.length);
        allocated += share;
      }
      allocation.set(c.propertyId, share);
    });
  }

  return { swapApplied, estimatedSideTotal, directSide, allocation };
}
