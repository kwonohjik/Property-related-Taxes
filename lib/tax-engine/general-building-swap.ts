/**
 * 일반건물(토지+건물 다중카드) 환산 경로 §97②2호 단서 swap.
 *
 * 계획서: `docs/00-pm/general-commercial-estimated-97-2-swap.plan.md` §5.2 (자산총액 판정 — 안 A)
 *        `docs/02-design/features/general-building-part-major-acquisition.plan.md` §10 (파트 단위 — O-1)
 *
 * ## 두 판정 단위가 공존한다
 *
 * | 입력 형태 | 판정 단위 | 근거 |
 * |---|---|---|
 * | 자산 단위 자본적지출·양도비만 | **자산총액** 1회 (종전 안 A) | 파트별 귀속을 모르면 나목을 쪼갤 근거가 없다 |
 * | 파트별 자본적지출 명시 | **파트별**(토지/건물 각각) | 「소득세법」 §97②2호 본문 「자산별로」 |
 *
 * ### 파트 단위가 조문에 부합하는 이유 (O-1 — 2026-08-05 KoreanLaw 원문 확인)
 *
 * - §97②2호 **본문**: "…의 금액에 **자산별로** 대통령령으로 정하는 금액을 더한 금액"
 * - 같은 호 **가목**: "환산취득가액과 **본문 중** 대통령령으로 정하는 금액의 합계액"
 *   ⇒ 가목이 본문의 자산별 개산공제를 품으므로 **가목 자체가 자산별**이다.
 * - 「소득세법 시행령」 §163⑥: **1호 토지**(개별공시지가×3/100) · **2호 건물**(기준시가×3/100)
 *   ⇒ 토지·건물이 별개 호로 각각 다른 기준 = 「자산별」의 단위가 파트다.
 * - 단서 요건: "**취득가액을 환산취득가액으로 하는 경우**" ⇒ 혼합 모드에서 요건을 충족하는 것은
 *   환산 파트뿐이다. 자산총액 1회 판정은 실가 파트까지 단서에 끌어들여 요건에 반한다.
 *
 * 예규·심판례는 이 쟁점에 0건이다(조세심판원 8건은 모두 「환산 시 자본적지출 추가공제 불가」
 * = 택일 쟁점으로, 비교 **단위**를 다루지 않는다).
 *
 * ## 파트별 세 갈래
 *
 * 1. **환산 파트 + 나목 > 가목** → `allocation`. 택일이므로 환산취득가 **미차감**·필요경비=나목.
 * 2. **환산 파트 + 나목 ≤ 가목** → 본문. 개산공제만 남고 자본적지출은 반영되지 않는다(택일에서 짐).
 * 3. **실가 파트** → `addition`. §97②**1호**라 택일이 아니다 —
 *    「해당 실지거래가액 + 제1항제2호·제3호의 금액」이므로 취득가 차감 + 자본적지출 **가산**.
 *
 * 파트 내부 카드(사업용/비사업용, 본체/증축)는 같은 자산이므로 합산 후 배분하고,
 * 마지막 카드가 잔액을 흡수해 `Σ 배분 = 그 파트 나목` 불변식을 지킨다
 * (메모리 `feedback_floor_residual_absorption`).
 */
import { applyRate } from "./tax-utils";
import type { AssetCardForAggregate } from "./general-building-valuation";
import type { PartAcqMode } from "./transfer-tax-split-gain";

/**
 * 파트 하나의 나목 입력.
 *
 * `mode`는 **필수**다 — 갈래 판정의 단일 소스이기 때문이다. 카드의 `usedEstimatedAcquisition`
 * (boolean)으로 가르면 감정가액·매매사례가액 파트가 「환산 아님」으로 묶여 실가(§97②1호 가산)로
 * 오분류된다(2026-08-06 취득가액 리뷰 FAIL). 세 방식은 법적 취급이 **전부 다르다**(§10.2 표).
 */
export interface PartSwapInput {
  /** 그 파트에 **직접 귀속**된 자본적지출 (§97①2호). */
  direct: number;
  /** 그 파트의 취득가액 산정 방식. */
  mode: PartAcqMode;
}

/** 파트 축 입력. `land`·`building` 중 하나라도 있으면 **파트 단위 판정**으로 전환된다. */
export interface PartAxisInput {
  land?: PartSwapInput;
  building?: PartSwapInput;
  /**
   * 자산 단위 양도비 (§97①3호).
   *
   * 파트별로 나누지 않고 받아 **가액 비례로 안분**한다 — 「소득세법」 제100조 제2항 후문이
   * 「**공통되는** 취득가액과 **양도비용**은 해당 자산의 가액에 비례하여 안분계산한다」로
   * 양도비용을 **명문 열거**하기 때문이다(자본적지출은 열거되지 않아 직접 귀속을 받는다).
   *
   * 나목은 「제1항제2호 **및** 제3호에 따른 금액의 **합계액**」(§97②2호 나목)이므로 양도비를
   * 빼면 나목 자체가 과소 산정된다.
   */
  transferExpense?: number;
}

export interface PartSwapDetail {
  /** 가목 = Σ(그 파트 **환산** 카드 환산취득가 + 개산공제). 실가 파트는 0. */
  estimatedSide: number;
  /** 나목 = 그 파트 자본적지출 + 양도비. */
  directSide: number;
  swapApplied: boolean;
}

export interface GeneralBuildingSwapDecision {
  /** §97②2호 단서 나목 채택 여부 (파트 단위에서는 **어느 파트든** 발동하면 true). */
  swapApplied: boolean;
  /** 가목 합계 = Σ(환산 카드 환산취득가 + 개산공제). */
  estimatedSideTotal: number;
  /** 나목 = 자본적지출 + 양도비 (파트 단위에서는 파트 나목의 합). */
  directSide: number;
  /** propertyId → 배분된 나목분 (**택일 발동** 카드만 키 존재). */
  allocation: Map<string, number>;
  /** propertyId → 가산된 자본적지출 (**실가 파트** 카드만 키 존재 — §97②1호). */
  addition: Map<string, number>;
  /** 파트 단위 판정일 때만 채워진다. 자산총액 판정에서는 undefined. */
  perPart?: { land?: PartSwapDetail; building?: PartSwapDetail };
}

/** 카드가 토지 파트인가 — 건물 카드는 `general_building_unit`. */
function isLandCard(card: AssetCardForAggregate): boolean {
  return card.propertyType === "land";
}

/**
 * 그룹 내 카드에 금액을 배분한다 — basis 비율 + **마지막 카드 잔액 흡수**.
 * `Σ 배분 = amount` 불변식이 이 함수의 계약이다.
 */
function allocateWithinGroup(
  target: Map<string, number>,
  cards: AssetCardForAggregate[],
  amount: number,
  basis: (card: AssetCardForAggregate) => number,
): void {
  const basisTotal = cards.reduce((s, c) => s + basis(c), 0);
  let allocated = 0;
  cards.forEach((c, i) => {
    let share: number;
    if (i === cards.length - 1) {
      share = amount - allocated; // 잔액 흡수
    } else {
      share =
        basisTotal > 0
          ? applyRate(amount, basis(c) / basisTotal)
          : Math.floor(amount / cards.length);
      allocated += share;
    }
    target.set(c.propertyId, share);
  });
}

/**
 * §97②2호 단서 판정 + 카드 배분.
 *
 * @param cards     환산·실가 혼재 가능
 * @param partAxis  파트 축 입력. `land`·`building` 중 하나라도 있으면 **파트 단위 판정**으로 전환한다.
 */
export function resolveGeneralBuildingSwap(
  cards: AssetCardForAggregate[],
  capitalExpenditure: number | undefined,
  transferExpense: number | undefined,
  partAxis?: PartAxisInput,
): GeneralBuildingSwapDecision {
  const allocation = new Map<string, number>();
  const addition = new Map<string, number>();

  const usePartAxis =
    partAxis !== undefined &&
    (partAxis.land !== undefined || partAxis.building !== undefined);

  if (usePartAxis) {
    return resolvePerPart(cards, partAxis, allocation, addition);
  }

  // ── 자산총액 판정 (종전 안 A — 회귀 0) ──────────────────────────────
  const directSide = (capitalExpenditure ?? 0) + (transferExpense ?? 0);
  const swapEligible =
    capitalExpenditure !== undefined || transferExpense !== undefined;
  // F8: 환산 카드(usedEstimatedAcquisition=true)만 가목 합산 — 실가 카드는 이미 actual 경로.
  const estimatedCards = cards.filter((c) => c.usedEstimatedAcquisition);
  const estimatedSideTotal = estimatedCards.reduce(
    (s, c) => s + c.acquisitionPrice + c.expenses,
    0,
  );
  // 동률(==)은 본문(단서 "적은 경우").
  const swapApplied =
    swapEligible && estimatedCards.length > 0 && directSide > estimatedSideTotal;

  if (swapApplied) {
    allocateWithinGroup(allocation, estimatedCards, directSide, (c) =>
      c.acquisitionPrice + c.expenses,
    );
  }

  return { swapApplied, estimatedSideTotal, directSide, allocation, addition };
}

/**
 * 파트 단위 판정 — 토지·건물 각각 독립으로 가목↔나목을 비교한다.
 *
 * 갈래는 **파트 모드**로 가른다(§10.2):
 *   `actual`               → 갈래 3 `addition` (§97②1호 — 가산)
 *   `estimated`            → 갈래 1/2 `allocation` 또는 본문 (§97②2호 단서 — 택일)
 *   `appraisal`·`salesCase` → 갈래 4 아무것도 하지 않음 (§97②2호 **본문** — 개산공제만)
 */
function resolvePerPart(
  cards: AssetCardForAggregate[],
  partAxis: PartAxisInput,
  allocation: Map<string, number>,
  addition: Map<string, number>,
): GeneralBuildingSwapDecision {
  const perPart: NonNullable<GeneralBuildingSwapDecision["perPart"]> = {};
  let estimatedSideTotal = 0;
  let directSide = 0;
  let anySwap = false;

  const landCards = cards.filter(isLandCard);
  const buildingCards = cards.filter((c) => !isLandCard(c));

  /**
   * 자산 단위 양도비를 파트에 안분한다 — §100② 후문 「해당 자산의 가액에 비례」.
   * 마지막 파트가 잔액을 흡수해 `Σ = transferExpense` 불변식을 지킨다.
   */
  const totalTransferExpense = partAxis.transferExpense ?? 0;
  const landTransferPrice = landCards.reduce((s, c) => s + c.transferPrice, 0);
  const buildingTransferPrice = buildingCards.reduce((s, c) => s + c.transferPrice, 0);
  const transferPriceTotal = landTransferPrice + buildingTransferPrice;
  const landTransferExpense =
    transferPriceTotal > 0
      ? applyRate(totalTransferExpense, landTransferPrice / transferPriceTotal)
      : 0;
  const partTransferExpense: Record<"land" | "building", number> = {
    land: landTransferExpense,
    building: totalTransferExpense - landTransferExpense, // 잔액 흡수
  };

  const groups: Array<["land" | "building", AssetCardForAggregate[]]> = [
    ["land", landCards],
    ["building", buildingCards],
  ];

  for (const [part, partCards] of groups) {
    if (partCards.length === 0) continue;
    const input = partAxis[part];
    const mode = input?.mode;

    /**
     * 갈래 4 — 감정가액·매매사례가액 파트: §97②2호 **본문**만 적용된다.
     * 본문은 「제1항제1호나목의 금액 + 자산별 개산공제」이고 **제1항제2호·제3호를 포함하지 않는다**.
     * 따라서 자본적지출·양도비는 어느 쪽으로도 반영되지 않는다(개산공제는 이미 카드에 실려 있다).
     * `capexHint`가 화면에서 같은 내용을 고지한다.
     */
    if (mode === "appraisal" || mode === "salesCase") {
      perPart[part] = { estimatedSide: 0, directSide: 0, swapApplied: false };
      continue;
    }

    // 나목 = 자본적지출(직접 귀속) + 양도비(가액 비례 안분) — §97②2호 나목·1호 공통 정의.
    const partDirectSide = (input?.direct ?? 0) + partTransferExpense[part];
    if (partDirectSide <= 0) continue;
    directSide += partDirectSide;

    if (mode === "actual") {
      // 갈래 3 — 실가 파트: §97②1호. 택일 아님, **가산**.
      // 배분 basis는 양도가액(파트 내 카드 금액이 모두 양도가액 비율로 쪼개져 있다).
      allocateWithinGroup(addition, partCards, partDirectSide, (c) => c.transferPrice);
      perPart[part] = { estimatedSide: 0, directSide: partDirectSide, swapApplied: false };
      continue;
    }

    // 갈래 1/2 — 환산 파트: 가목↔나목 택일.
    const estimatedCards = partCards.filter((c) => c.usedEstimatedAcquisition);
    if (estimatedCards.length === 0) continue; // 환산 카드가 없으면 비교 대상이 없다
    const estimatedSide = estimatedCards.reduce(
      (s, c) => s + c.acquisitionPrice + c.expenses,
      0,
    );
    estimatedSideTotal += estimatedSide;
    // 동률(==)은 본문 — 단서는 「적은 경우」다.
    const swapApplied = partDirectSide > estimatedSide;
    perPart[part] = { estimatedSide, directSide: partDirectSide, swapApplied };

    if (swapApplied) {
      anySwap = true;
      allocateWithinGroup(allocation, estimatedCards, partDirectSide, (c) =>
        c.acquisitionPrice + c.expenses,
      );
    }
    // 갈래 2(나목 ≤ 가목)는 본문 유지 — 아무 맵에도 넣지 않는다.
  }

  return {
    swapApplied: anySwap,
    estimatedSideTotal,
    directSide,
    allocation,
    addition,
    perPart,
  };
}
