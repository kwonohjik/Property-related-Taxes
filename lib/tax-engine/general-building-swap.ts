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
import { safeMultiplyThenDivide } from "./tax-utils";
import { apportionByStdPrice } from "./std-price-apportion";
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
  /**
   * `direct` 중 **증축 전**에 지출한 금액 — 건물 파트에서만 쓴다. 증축분(`building2`)에 배분하지 않는다
   * (`docs/00-pm/gb-extension-capex-timing.plan.md` · 2026-10-23 사용자 규칙).
   */
  directBeforeExtension?: number;
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

/**
 * 자산총액 판정의 증축 입력 — 자산 단위 자본적지출을 지출 시점으로 가른 값(`general-building-entry.ts`가 만든다).
 * 증축 전 지출은 증축분(`building2`)에 가지 않고, 증축분이 실지거래가액이면 증축 후 지출·양도비의 증축분 몫은
 * 단서 비교에서 떼어 증축분에 §97②1호로 **가산**한다(같은 계획서 D-2·D-3).
 */
export interface ExtensionCapexInput {
  /** 자산 단위 자본적지출 중 증축 전 지출액(토지분 포함). */
  capexBeforeExtension: number;
  /** 증축 후 지출의 **건물 몫**(토지 : 원건물 취득시 기준시가로 나눈 건물분 — E-1과 같은 기준). */
  capexAfterExtensionBuilding: number;
}

/** 증축분 카드 — 3-way 엔진(`general-building-extension.ts`)의 `building2`. */
const EXTENSION_CARD_ID = "building2";

/** `amount`를 `cards`에 basis 비례로 나눴을 때 `target` 카드의 몫(마지막 카드 잔액 흡수 — `allocateWithinGroup`과 같은 값). */
function shareOf(
  cards: AssetCardForAggregate[],
  amount: number,
  basis: (card: AssetCardForAggregate) => number,
  target: AssetCardForAggregate,
): number {
  const tmp = new Map<string, number>();
  allocateWithinGroup(tmp, cards, amount, basis);
  return tmp.get(target.propertyId) ?? 0;
}

/** 맵에 더한다 — 같은 카드가 두 몫(증축 전·후)을 받을 때 덮어쓰지 않게. */
function addTo(target: Map<string, number>, id: string, amount: number): void {
  if (amount === 0) return;
  target.set(id, (target.get(id) ?? 0) + amount);
}

/** `allocateWithinGroup`의 누적판 — 기존 몫에 더한다. */
function allocateAdd(
  target: Map<string, number>,
  cards: AssetCardForAggregate[],
  amount: number,
  basis: (card: AssetCardForAggregate) => number,
): void {
  if (amount <= 0 || cards.length === 0) return;
  const tmp = new Map<string, number>();
  allocateWithinGroup(tmp, cards, amount, basis);
  for (const [id, v] of tmp) addTo(target, id, v);
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
  /** 가목 합계 = Σ(환산 카드 환산취득가 + 개산공제) — §97③ 감가상각비 공제 **전** 값. */
  estimatedSideTotal: number;
  /** 나목 = 자본적지출 + 양도비 (파트 단위에서는 파트 나목의 합). */
  directSide: number;
  /** propertyId → 배분된 나목분 (**택일 발동** 카드만 키 존재). */
  allocation: Map<string, number>;
  /** propertyId → 가산된 자본적지출 (**실가 파트** 카드만 키 존재 — §97②1호). */
  addition: Map<string, number>;
  /** 파트 단위 판정일 때만 채워진다. 자산총액 판정에서는 undefined. */
  perPart?: { land?: PartSwapDetail; building?: PartSwapDetail };
  /** `addition` 중 증축 전 자본적지출 몫(원건물 카드) — 표시용 echo. 증축 전 지출이 가산된 경우에만 키가 있다. */
  beforeExtensionAddition?: Map<string, number>;
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
          ? safeMultiplyThenDivide(amount, basis(c), basisTotal)
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
  extension?: ExtensionCapexInput,
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
  let directSide = (capitalExpenditure ?? 0) + (transferExpense ?? 0);
  const swapEligible =
    capitalExpenditure !== undefined || transferExpense !== undefined;
  // F8: 환산 카드(usedEstimatedAcquisition=true)만 가목 합산 — 실가 카드는 이미 actual 경로.
  const estimatedCards = cards.filter((c) => c.usedEstimatedAcquisition);

  /**
   * 증축분이 **실지거래가액**이면(D-3) 증축 후 자본적지출의 건물 몫 · 양도비 중 증축분 몫을 먼저 떼어 §97②1호로 가산한다.
   * 종전에는 환산 카드(토지·원건물)에만 나목을 배분해 증축분은 한 푼도 못 받았고, 나목 ≤ 가목이면 그 몫까지 사라졌다
   * (2026-10-23 실측: 양도비 1천만 → 세액 불변). 증축분 몫의 기준은 양도가액이다(Q-2 a · 양도비는 §100② 후문 — E-10 규칙).
   */
  const extCard = extension ? cards.find((c) => c.propertyId === EXTENSION_CARD_ID) : undefined;
  if (extension && extCard && !extCard.usedEstimatedAcquisition) {
    const buildingCards = cards.filter((c) => !isLandCard(c));
    const extShare =
      shareOf(buildingCards, extension.capexAfterExtensionBuilding, (c) => c.transferPrice, extCard) +
      shareOf(cards, transferExpense ?? 0, (c) => c.transferPrice, extCard);
    addTo(addition, extCard.propertyId, extShare);
    directSide -= extShare;
  }
  // §97③ — 가목은 감가상각비 공제 **전** 값으로 비교한다(`calcNecessaryExpense`와 같은 비교식 · 사용자 결정 2026-10-20).
  const estimatedSideTotal = estimatedCards.reduce((s, c) => s + c.acquisitionPrice + c.expenses, 0);
  // 동률(==)은 본문(단서 "적은 경우").
  const swapApplied =
    swapEligible && estimatedCards.length > 0 && directSide > estimatedSideTotal;

  if (swapApplied) {
    // 증축 전 지출은 증축분 카드에 가지 않는다(D-2) — 나머지만 종전처럼 환산 카드 전부에 (취득가액+개산공제) 비례.
    const before = extension && extCard?.usedEstimatedAcquisition ? Math.min(extension.capexBeforeExtension, directSide) : 0;
    const originCards = estimatedCards.filter((c) => c.propertyId !== EXTENSION_CARD_ID);
    const sideOf = (c: AssetCardForAggregate) => c.acquisitionPrice + c.expenses;
    if (before > 0 && originCards.length > 0) {
      // 택일은 자산 전체가 나목을 고른 것이다 — 몫이 0인 환산 카드도 키를 둬 개산공제가 남지 않게 한다.
      for (const c of estimatedCards) allocation.set(c.propertyId, 0);
      allocateAdd(allocation, originCards, before, sideOf);
      allocateAdd(allocation, estimatedCards, directSide - before, sideOf);
    } else {
      allocateWithinGroup(allocation, estimatedCards, directSide, sideOf);
    }
  }

  return {
    swapApplied,
    estimatedSideTotal,
    directSide,
    allocation,
    addition,
  };
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
  const beforeExtensionAddition = new Map<string, number>();
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
      ? apportionByStdPrice(totalTransferExpense, landTransferPrice, buildingTransferPrice).land
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
    // 증축이 있는 건물 파트 — 지출 시점별 배분(2026-10-23 · `docs/00-pm/gb-extension-capex-timing.plan.md` D-1·D-3).
    // 원건물이 감정·매매사례여도 증축분은 자기 취득방식대로 받는다(같은 계획서 §10) — 아래 갈래 4보다 먼저 가른다.
    const extCard = part === "building" ? partCards.find((c) => c.propertyId === EXTENSION_CARD_ID) : undefined;

    if ((mode === "appraisal" || mode === "salesCase") && !extCard) {
      perPart[part] = { estimatedSide: 0, directSide: 0, swapApplied: false };
      continue;
    }

    // 나목 = 자본적지출(직접 귀속) + 양도비(가액 비례 안분) — §97②2호 나목·1호 공통 정의.
    const partDirectSide = (input?.direct ?? 0) + partTransferExpense[part];
    if (partDirectSide <= 0) continue;
    directSide += partDirectSide;

    if (extCard && mode !== undefined) {
      const detail = resolveExtensionBuildingPart(
        partCards, extCard, mode, input?.direct ?? 0, input?.directBeforeExtension ?? 0, partTransferExpense.building,
        allocation, addition, beforeExtensionAddition,
      );
      perPart[part] = detail;
      estimatedSideTotal += detail.estimatedSide;
      if (detail.swapApplied) anySwap = true;
      continue;
    }

    if (mode === "actual") {
      // 갈래 3 — 실가 파트: §97②1호. 택일 아님, **가산**.
      // 배분 basis는 양도가액(파트 내 카드 금액이 모두 양도가액 비율로 쪼개져 있다).
      // 그룹 안의 **환산 카드에는 가산하지 않는다**(2026-10-22 E-1) — 증축분이 환산이면 §97②2호(개산공제 · 단서 택일)라 1호 가산과
      // 섞이면 안 된다. 그 몫은 같은 그룹의 실가 카드가 받는다(합계 보존). 실가 카드가 없으면 종전대로 그룹 전체.
      const actualCards = partCards.filter((c) => !c.usedEstimatedAcquisition);
      allocateWithinGroup(addition, actualCards.length > 0 ? actualCards : partCards, partDirectSide, (c) => c.transferPrice);
      perPart[part] = { estimatedSide: 0, directSide: partDirectSide, swapApplied: false };
      continue;
    }

    // 갈래 1/2 — 환산 파트: 가목↔나목 택일.
    const estimatedCards = partCards.filter((c) => c.usedEstimatedAcquisition);
    if (estimatedCards.length === 0) continue; // 환산 카드가 없으면 비교 대상이 없다
    // §97③ — 가목은 감가상각비 공제 **전** 값이다(자산총액 판정과 같은 식).
    const estimatedSide = estimatedCards.reduce((s, c) => s + c.acquisitionPrice + c.expenses, 0);
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
    ...(beforeExtensionAddition.size > 0 ? { beforeExtensionAddition } : {}),
  };
}

/**
 * 증축이 있는 건물 파트(원건물 `building1` + 증축분 `building2`)의 나목 배분 — 지출 시점별(2026-10-23 사용자 규칙).
 *
 * - **증축 전** 자본적지출 → 원건물에만(증축 전에는 증축분이 없었다 — 「소득세법 시행령」 §163③).
 * - **증축 후** 자본적지출 → 원건물 : 증축분 = 양도가액 비율(Q-2 a). 양도비는 종전처럼 가액 비례(§100② 후문).
 * - 원건물 실가(갈래 3): 실가 카드에 §97②1호 가산. 증축분이 **환산**이면 증축 후 자본적지출의 증축분 몫만 증축분의
 *   §97②2호 단서 비교(가목 = 증축분 환산취득가 + 개산공제)로 보낸다(Q-3 a) — 양도비는 E-1 Q-8대로 실가 카드에.
 * - 원건물 환산(갈래 1/2): 증축분이 **실가**면 증축 후 자본적지출·양도비의 증축분 몫을 먼저 떼어 가산하고(D-3) 나머지로
 *   원건물 단서를 비교한다. 증축분도 환산이면 비교 단위(건물 파트 전체)는 그대로 두고 증축 전 몫만 원건물에 배분한다(D-2).
 *
 * 증축 전 지출이 0이면 원건물 실가 + 증축분 실가 · 원건물 환산 + 증축분 환산 두 조합은 종전과 같은 값이다.
 */
function resolveExtensionBuildingPart(
  partCards: AssetCardForAggregate[],
  extCard: AssetCardForAggregate,
  mode: PartAcqMode,
  direct: number,
  directBeforeExtension: number,
  transferExpense: number,
  allocation: Map<string, number>,
  addition: Map<string, number>,
  beforeExtensionAddition: Map<string, number>,
): PartSwapDetail {
  const before = Math.min(Math.max(directBeforeExtension, 0), direct);
  const after = direct - before;
  const originCards = partCards.filter((c) => c.propertyId !== EXTENSION_CARD_ID);
  const byPrice = (c: AssetCardForAggregate) => c.transferPrice;
  const sideOf = (c: AssetCardForAggregate) => c.acquisitionPrice + c.expenses;
  const extCapex = shareOf(partCards, after, byPrice, extCard);
  const extTransfer = shareOf(partCards, transferExpense, byPrice, extCard);
  const extIsActual = !extCard.usedEstimatedAcquisition;
  const partDirectSide = direct + transferExpense;

  if (mode === "appraisal" || mode === "salesCase") {
    // 원건물 = 갈래 4(§97②2호 본문 — 개산공제만): 증축 전 지출·원건물 몫은 반영되지 않는다. 증축분은 자기 몫(증축 후 자본적지출 +
    // 양도비)을 실가면 §97②1호로 가산하고, 환산이면 그 몫을 나목으로 단서 비교한다(나목 = 그 자산의 자본적지출 + 양도비 — §97②2호 나목).
    const extShare = extCapex + extTransfer;
    if (extShare <= 0) return { estimatedSide: 0, directSide: 0, swapApplied: false };
    if (extIsActual) {
      addTo(addition, extCard.propertyId, extShare);
      return { estimatedSide: 0, directSide: extShare, swapApplied: false };
    }
    const extSide = sideOf(extCard);
    const swapApplied = extShare > extSide;
    if (swapApplied) allocation.set(extCard.propertyId, extShare);
    return { estimatedSide: extSide, directSide: extShare, swapApplied };
  }

  if (mode === "actual") {
    if (extIsActual) {
      // 두 카드 모두 실가 — 증축 후 지출·양도비는 양도가액 비율로, 증축 전 지출은 원건물에.
      allocateAdd(addition, partCards, after + transferExpense, byPrice);
      allocateAdd(addition, originCards, before, byPrice);
      allocateAdd(beforeExtensionAddition, originCards, before, byPrice);
      return { estimatedSide: 0, directSide: partDirectSide, swapApplied: false };
    }
    // 증축분 환산 — 원건물 실가 카드는 증축분 자본적지출 몫을 뺀 전부를 가산받는다.
    allocateAdd(addition, originCards, partDirectSide - extCapex, byPrice);
    allocateAdd(beforeExtensionAddition, originCards, before, byPrice);
    if (extCapex <= 0) return { estimatedSide: 0, directSide: partDirectSide, swapApplied: false };
    const extSide = sideOf(extCard);
    // 동률(==)은 본문 — 단서는 「적은 경우」다.
    const swapApplied = extCapex > extSide;
    if (swapApplied) allocation.set(extCard.propertyId, extCapex);
    return { estimatedSide: extSide, directSide: extCapex, swapApplied };
  }

  // 원건물 환산
  let nabok = partDirectSide;
  if (extIsActual) {
    addTo(addition, extCard.propertyId, extCapex + extTransfer);
    nabok -= extCapex + extTransfer;
  }
  const estimatedCards = partCards.filter((c) => c.usedEstimatedAcquisition);
  if (estimatedCards.length === 0 || nabok <= 0) {
    return { estimatedSide: 0, directSide: nabok, swapApplied: false };
  }
  const estimatedSide = estimatedCards.reduce((s, c) => s + sideOf(c), 0);
  const swapApplied = nabok > estimatedSide;
  if (swapApplied) {
    for (const c of estimatedCards) allocation.set(c.propertyId, 0);
    const originEstimated = estimatedCards.filter((c) => c.propertyId !== EXTENSION_CARD_ID);
    if (!extIsActual && before > 0 && originEstimated.length > 0) {
      allocateAdd(allocation, originEstimated, before, sideOf);
      allocateAdd(allocation, estimatedCards, nabok - before, sideOf);
    } else {
      allocateAdd(allocation, estimatedCards, nabok, sideOf);
    }
  }
  return { estimatedSide, directSide: nabok, swapApplied };
}
