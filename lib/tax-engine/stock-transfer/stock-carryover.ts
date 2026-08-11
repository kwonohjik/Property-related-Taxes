/**
 * 주식 이월과세 §97의2① — 게이트 판정 · 시나리오 A/B · ②3호 비교과세
 *
 * 계획서: docs/02-design/features/stock-carryover-97-2-necessary-expense.plan.md
 *
 * ## 이 모듈이 정하는 것
 *
 * 1. **「§97의2①에 해당하는 자산」인가** (`isStockCarryoverEligible`) — 게이트 5축
 * 2. 해당하면 **필요경비를 증여자 기준으로 재구성**한 입력(시나리오 A)
 * 3. 해당하지 않거나 ②3호로 배제되면 **수증자 기준**(시나리오 B)
 * 4. **②3호 비교** — 판정은 **자산별**, 비교 금액은 **전체 결정세액**
 *
 * ## 🔑 배제되면 세율도 함께 돌아간다
 *
 * §104②2호의 대상은 「§97의2제1항에 **해당하는 자산**」이다. ①이 적용되지 않으면 그 자산은
 * 해당 자산이 아니므로 보유기간도 수증일 기산으로 돌아간다. 그래서 시나리오 B는
 * `acquisitionCause`를 **`"purchase"`로 되돌린다** — 부동산 `buildInputB`와 같은 규약이다
 * (`transfer-tax-carryover.ts:616-645` · 선행 계획서 D-2가 연혁으로 종결).
 *
 * ⚠️ 이 되돌림을 빼면 「배제됐는데 세율만 소급」하는 과소과세가 된다(계획서 P-2).
 *
 * ## ⚠️ 기타자산은 대상이 아니다
 *
 * 영 §163의2①이 확장하는 자산은 §94①**2호가목**과 §94①**4호나목**(= **시설물이용권**)인데,
 * 이 엔진의 기타자산은 4호 **다목·라목**이다(계획서 §1.2).
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음. 세액 계산 함수는 매개변수로 주입받는다.
 */

import { isCarryoverRelationExcluded } from "../carryover-donor-death";
import { isStockCarryoverEra, isWithinCarryoverPeriod } from "../data/carryover-scope-era";
import type { StockTransferInput, AcquisitionLot } from "./types/stock-transfer.types";

/**
 * carryover 대상 종목 수 상한 — 2ⁿ 조합을 전수 계산하므로 방어선이 필요하다.
 * 실무상 1~2건이다. 초과는 입력 오류로 본다(⑧ validate가 먼저 막아야 한다).
 */
export const MAX_CARRYOVER_ITEMS = 10;

// ============================================================
// 1. 게이트 — 「§97의2①에 해당하는 자산」인가
// ============================================================

/**
 * §97의2① 대상 여부. **다섯 축을 모두 통과해야 한다.**
 *
 *   ⓐ 취득원인이 `carryover_gift`     — 사용자의 §97의2① 해당 **선언**
 *   ⓑ 기타자산이 아닐 것              — 영 §163의2①(계획서 §1.2)
 *   ⓒ 증여일 ≥ 2025-01-01             — 부칙 제20615호 §8 「시행 이후 **증여받는 자산**부터」
 *   ⓓ 양도일 − 증여일 ≤ **1년**        — §97의2① 괄호(주식은 10년이 아니다)
 *   ⓔ **관계 요건**                    — 배우자 사별 제외 · 직계존비속 양도 당시 사망 제외 ·
 *                                       배우자·직계존비속이 아니면 본문 요건 불충족
 *
 * ⓔ는 부동산이 쓰는 무의존 leaf를 **그대로 재사용**한다 — 인자가 사실만 받으므로
 * 자산 종류와 무관하다(메모리 `feedback_sibling_path_already_implements_rule`).
 *
 * ⚠️ **증여자 취득일이 없으면 대상이 아니다** — ①1호·§104②2호가 그 날짜로 기산하므로
 *    값이 없으면 승계를 계산할 수 없다(⑧ validate가 먼저 막는다).
 */
export function isStockCarryoverEligible(input: StockTransferInput): boolean {
  if (input.acquisitionCause !== "carryover_gift") return false;
  if (input.marketType === "other_asset") return false; // ⓑ
  if (!input.donorAcquisitionDate) return false;
  if (!isStockCarryoverEra(input.acquisitionDate)) return false; // ⓒ
  if (!isWithinCarryoverPeriod(input.acquisitionDate, input.transferDate, "stock")) return false; // ⓓ
  // ⓔ — 증여일(= 수증자 취득일)이 직계존비속 괄호의 기준일이다
  if (isCarryoverRelationExcluded(input.donorRelation, input.donorDeceased, input.acquisitionDate)) {
    return false;
  }
  return true;
}

/**
 * **lot(split) 판** — sub-lot 하나의 취득단가를 정한다.
 *
 * 🔑 **1년 요건(§97의2① 괄호)은 「매도 시점」 기준이다.** lot의 기산일은 매도 매칭 **전에**
 * 확정되므로 lot만 보고는 판정할 수 없고, 하나의 매수 lot이 1년 경계를 사이에 둔 두 매도에
 * 걸릴 수도 있다 — 그때는 **sub-lot마다 답이 갈린다**(계획서 L-3).
 * 그래서 세율 축의 `resolveLotStartDate`와 달리 `saleDate`를 받는다.
 *
 * 승계 조건을 못 넘으면 **수증 당시 평가액**(= lot 자신의 단가)으로 돌아간다.
 */
export function resolveLotAcquisitionPrice(
  lot: AcquisitionLot,
  saleDate: Date,
): number {
  const own = lot.perShareAcquisitionPrice;
  if (lot.acquisitionCause !== "carryover_gift") return own;
  if (lot.donorAcquisitionPrice === undefined) return own;
  if (!isStockCarryoverEra(lot.acquisitionDate)) return own;
  if (!isWithinCarryoverPeriod(lot.acquisitionDate, saleDate, "stock")) return own;
  if (isCarryoverRelationExcluded(lot.donorRelation, lot.donorDeceased, lot.acquisitionDate)) {
    return own;
  }
  return lot.donorAcquisitionPrice;
}

/** split 종목에 §97의2① 승계가 걸릴 lot이 하나라도 있는가 — ②3호 비교 대상 판정용 */
export function hasCarryoverLot(input: StockTransferInput): boolean {
  if (input.marketType === "other_asset") return false; // 계획서 §1.2
  return (input.acquisitionLots ?? []).some(
    (l) => l.acquisitionCause === "carryover_gift" && l.donorAcquisitionPrice !== undefined,
  );
}

// ============================================================
// 2. 증여세 상당액 — 영 §163의2②
// ============================================================

/**
 * 영 §163의2② 안분 (한도 적용 **전**).
 *
 * > 증여세 상당액 = **증여세 산출세액** × (**양도한 해당 자산가액** / **증여세 과세가액**)
 *
 * 분모가 0이면 산입하지 않는다(0 나눗셈 방어).
 * 곱셈이 조 단위를 넘을 수 있어 BigInt로 계산한 뒤 원 미만 절사한다.
 */
export function apportionStockGiftTax(input: StockTransferInput): number {
  const tax = input.giftTaxAmount ?? 0;
  const transferred = input.transferredAssetValue ?? 0;
  const taxable = input.giftTaxableValue ?? 0;
  if (tax <= 0 || transferred <= 0 || taxable <= 0) return 0;
  return Number((BigInt(tax) * BigInt(transferred)) / BigInt(taxable));
}

// ============================================================
// 3. 시나리오 빌더
// ============================================================

/**
 * 시나리오 B — §97의2① **미적용**.
 *
 * 취득가액은 사용자가 입력한 **증여 당시 평가액** 그대로이고,
 * `acquisitionCause`를 `"purchase"`로 되돌려 **세율 축(§104②2호)도 함께** 미적용으로 만든다.
 * 승계용 입력은 전부 제거해 하류가 실수로 읽지 못하게 한다.
 */
export function buildStockScenarioB(input: StockTransferInput): StockTransferInput {
  return {
    ...input,
    // 배제됐다는 **사실**을 남긴다 — 아래에서 `acquisitionCause`를 되돌리므로 흔적이 사라진다.
    carryoverOutcome: "excluded",
    /**
     * split 모드 — **lot도 함께** 되돌린다. 종목 축만 바꾸면 `allocateLots`가 lot의
     * `carryover_gift`를 보고 계속 승계해 「배제됐는데 취득가액은 승계」가 된다.
     */
    acquisitionLots: input.acquisitionLots?.map((l) =>
      l.acquisitionCause === "carryover_gift"
        ? {
            ...l,
            acquisitionCause: "purchase" as const,
            donorAcquisitionDate: undefined,
            donorAcquisitionPrice: undefined,
            donorCapitalExpenditure: undefined,
            donorGiftTaxAmount: undefined,
          }
        : l,
    ),
    acquisitionCause: "purchase",
    donorAcquisitionDate: undefined,
    donorAcquisitionPrice: undefined,
    donorAcquisitionStdPrice: undefined,
    donorCapitalExpenditure: undefined,
    giftTaxAmount: undefined,
    transferredAssetValue: undefined,
    giftTaxableValue: undefined,
  };
}

/**
 * 시나리오 A 골격 — §97의2① 적용. 증여세 상당액은 **한도 계산 후** 주입받는다.
 *
 * · ①1호 — 취득가액을 **증여자 취득 당시 실지거래가액**으로 승계(§97①1호 가목)
 * · ①2호 — 증여자 자본적지출을 필요경비에 포함 (⚠️ 양도비 §97①3호는 제외)
 * · ①3호 — 증여세 상당액 산입
 *
 * ⚠️ **환산 모드는 아직 여기서 다루지 않는다**(Phase 3). `donorAcquisitionPrice`가 없으면
 *    취득가액을 건드리지 않으므로 `acquisitionMode: "estimated"` 경로가 그대로 흐른다 —
 *    그 경우 증여자 기준 환산(§97①1호 나목)이 **미반영**이고 anchor N-5·N-6이 실패로 남아
 *    그 사실을 지킨다.
 *
 * ⚠️ `acquisitionCause`는 `"carryover_gift"`를 **유지**한다 — 세율 축이 증여자 취득일로
 *    기산해야 하기 때문이다(§104②2호).
 */
function buildStockScenarioABase(
  input: StockTransferInput,
  giftTaxIncluded: number,
): StockTransferInput {
  const donorCapex = input.donorCapitalExpenditure ?? 0;

  /**
   * ①1호 **가목** — 증여자 취득 당시 실지거래가액을 아는 경우. 실가로 승계한다.
   * (실가 경로에서는 필요경비가 실비 합산이다 — 개산공제는 환산 모드 전용.)
   */
  if (input.donorAcquisitionPrice !== undefined) {
    return {
      ...input,
      acquisitionMode: "actual",
      perShareAcquisitionPrice: input.donorAcquisitionPrice,
      expenseMode: "actual",
      // ①2호 — 증여자 자본적지출
      actualExpenses: (input.actualExpenses ?? 0) + donorCapex,
      // ①3호 — 증여세는 필요경비 확정 **후** 가산한다(타입 주석 참조)
      carryoverGiftTaxExpense: giftTaxIncluded,
      carryoverOutcome: "applied",
    };
  }

  /**
   * ①1호 **나목** — 증여자 실지거래가액을 확인할 수 없어 **환산**하는 경우.
   *
   * 환산취득가 = 양도가 × (**취득 당시 기준시가** / 양도 당시 기준시가)이고,
   * 이월과세면 분자가 **증여자 취득 당시**의 것이다. 분모(양도측)는 이월과세와 무관하므로
   * 건드리지 않는다.
   *
   * 🔑 **분자를 재계산하지 않고 「취득측 입력」을 증여자 값으로 갈아 끼운다.** 환산 분기가
   *   5개(취득후상장·거래정지·비상장·취득일거래정지·상장)이고 각각 분모 산정이 달라서,
   *   분모를 밖으로 꺼내 재환산하면 분기마다 다른 코드가 필요하다. 입력 치환은 **한 곳**이다.
   */
  const donorStd = input.donorAcquisitionStdPrice;
  return {
    ...input,
    ...(donorStd !== undefined
      ? {
          // 상장 1개월 종가평균 경로의 취득측 입력
          acquisitionDatePriceAvg1Month: donorStd,
          // 취득측 보충평가(비상장·거래정지)를 우회하고 이 값을 취득기준시가로 확정한다
          acquisitionStdPriceOverridePerShare: donorStd,
        }
      : {}),
    // ①2호 — 환산 모드에서도 증여자 자본적지출은 **나목(자본적지출+양도비)** 의 일부다.
    //   §97②2호 단서 비교에 참여해야 하므로 `actualExpenses`가 맞다.
    actualExpenses: (input.actualExpenses ?? 0) + donorCapex,
    carryoverGiftTaxExpense: giftTaxIncluded,
    carryoverOutcome: "applied",
  };
}

/**
 * 시나리오 A 확정 — 증여세 상당액의 **한도**까지 반영한다.
 *
 * 영 §163의2② 후단: 「필요경비로 산입되는 증여세 상당액은 **양도가액에서 법 제97조제1항 및
 * 제2항의 금액을 공제한 잔액을 한도**로 한다」 = **증여세 가산 직전 양도차익**.
 *
 * ⇒ 증여세를 0으로 둔 A를 한 번 계산해 그 양도차익을 한도로 삼는다(부동산과 동형 —
 *   `transfer-tax-carryover.ts:360-366`). 한도는 **그 종목 단독**으로 정해지므로
 *   조합마다 다시 구할 필요가 없다.
 */
export function buildStockScenarioA(
  input: StockTransferInput,
  calcTransferIncome: (i: StockTransferInput) => number,
): StockTransferInput {
  const apportioned = apportionStockGiftTax(input);
  if (apportioned <= 0) return buildStockScenarioABase(input, 0);

  const cap = Math.max(0, calcTransferIncome(buildStockScenarioABase(input, 0)));
  return buildStockScenarioABase(input, Math.min(apportioned, cap));
}

// ============================================================
// 4. ②3호 비교 — 자산별 판정 · 전체 결정세액
// ============================================================

/**
 * carryover 종목의 A/B를 확정해 **그대로 계산에 넘길 수 있는 입력 배열**을 돌려준다.
 *
 * ## ②3호를 조건으로 옮기면
 *
 * > 3. 제1항을 적용하여 계산한 양도소득 **결정세액**이 제1항을 적용하지 아니하고 계산한
 * >    양도소득 **결정세액**보다 **적은 경우**
 *
 * 자산 *i* 는 `T(i=적용) < T(i=미적용)` 이면 배제된다. 나머지 자산의 상태는 그대로 둔다.
 * ⇒ 최종 조합은 **자기 자신을 재생산하는 조합**이어야 한다:
 *
 * ```
 *   모든 i:  (i가 적용 상태인가)  ===  (T(i=적용) ≥ T(i=미적용))
 * ```
 *
 * (동률은 「적은 경우」가 아니므로 **적용을 유지**한다 — 그래서 `≥`다.)
 *
 * ## 왜 전체 결정세액인가 (Q-2)
 *
 * 「결정세액」은 §92의 계산 순서를 거친 **과세기간 단위** 개념이고, 조문에 「자산별 결정세액」은
 * 없다. 주식은 §103② 기본공제가 **그룹 단위 연 1회**라 종목 단위로 비교하면 실제로 판정이
 * 뒤집힌다(실측 격자 56건 중 4건 · 계획서 §4 Q-2).
 *
 * ## 복수해 (Q-2b)
 *
 * 조건을 만족하는 조합이 여럿이면 **적용(A)이 가장 많은 것**을 택한다. 실측 24건에서
 * 복수해는 **전부 세액 동률**이었다 — 이 규칙은 세액이 아니라 표시·세율 축을 결정론적으로
 * 고정하기 위한 것이다.
 *
 * @param inputs          종목 배열 (그대로의 사용자 입력)
 * @param computeTotalTax 배열 전체의 **결정세액** 합계 (순환 방지를 위해 주입)
 * @param calcTransferIncome 단건 양도소득금액 (증여세 한도 계산용)
 */
export function resolveStockCarryover(
  inputs: StockTransferInput[],
  computeTotalTax: (list: StockTransferInput[]) => number,
  calcTransferIncome: (i: StockTransferInput) => number,
): StockTransferInput[] {
  const targets: number[] = [];
  for (let i = 0; i < inputs.length; i++) {
    // split 종목은 종목 축 `acquisitionCause`가 아니라 **lot**에 이월과세가 실린다.
    if (isStockCarryoverEligible(inputs[i]) || hasCarryoverLot(inputs[i])) targets.push(i);
  }

  /**
   * 게이트를 못 넘은 `carryover_gift`는 **여기서 B로 되돌린다**.
   *
   * 🔑 이것이 계획서 **P-6**의 수정이다 — 종전에는 `calcHoldingPeriod`가 게이트 중
   * ⓒ·ⓓ만 보고 **관계 요건(ⓔ)을 판정하지 않아**, 배우자 사별·직계존비속 사망·관계
   * 부적격인데도 증여자 취득일로 소급했다(과소과세).
   */
  const base = inputs.map((v, i) =>
    (v.acquisitionCause === "carryover_gift" || hasCarryoverLot(v)) && !targets.includes(i)
      ? buildStockScenarioB(v)
      : v,
  );

  if (targets.length === 0) return base;
  if (targets.length > MAX_CARRYOVER_ITEMS) {
    throw new Error(
      `이월과세 대상 종목이 ${targets.length}건입니다 — ${MAX_CARRYOVER_ITEMS}건을 초과하면 ` +
        `§97의2②3호 조합 비교를 계산할 수 없습니다.`,
    );
  }

  // 시나리오는 종목마다 한 번만 만든다(조합 수와 무관).
  const scenarioA = new Map<number, StockTransferInput>();
  const scenarioB = new Map<number, StockTransferInput>();
  for (const i of targets) {
    scenarioA.set(i, buildStockScenarioA(inputs[i], calcTransferIncome));
    scenarioB.set(i, buildStockScenarioB(inputs[i]));
  }

  const n = targets.length;
  const size = 1 << n;
  const materialize = (mask: number): StockTransferInput[] => {
    const list = [...base];
    targets.forEach((assetIdx, bit) => {
      list[assetIdx] = (mask >> bit) & 1 ? scenarioA.get(assetIdx)! : scenarioB.get(assetIdx)!;
    });
    return list;
  };

  const tax: number[] = new Array(size);
  for (let mask = 0; mask < size; mask++) tax[mask] = computeTotalTax(materialize(mask));

  const popcount = (m: number) => {
    let c = 0;
    for (let b = 0; b < n; b++) if ((m >> b) & 1) c++;
    return c;
  };

  // 자기 재생산 조합(고정점)을 찾는다.
  let best = -1;
  for (let mask = 0; mask < size; mask++) {
    let consistent = true;
    for (let bit = 0; bit < n; bit++) {
      const on = mask | (1 << bit);
      const off = mask & ~(1 << bit);
      const shouldApply = tax[on] >= tax[off]; // 동률은 적용 유지
      if (((mask >> bit) & 1) === 1 !== shouldApply) {
        consistent = false;
        break;
      }
    }
    if (!consistent) continue;
    if (best === -1 || popcount(mask) > popcount(best)) best = mask;
  }

  /**
   * 고정점은 **반드시 존재한다** — 「전체 세액 최대 조합 중 적용 최다」가 항상 조건을
   * 만족하기 때문이다(적용 자산은 토글해도 세액이 안 커지므로 `≥`, 미적용 자산은
   * 엄격히 작아지므로 `<`). 아래는 부동소수·절사로 인한 이론 밖 상황 대비 방어선이다.
   */
  if (best === -1) {
    const maxTax = Math.max(...tax);
    for (let mask = 0; mask < size; mask++) {
      if (tax[mask] !== maxTax) continue;
      if (best === -1 || popcount(mask) > popcount(best)) best = mask;
    }
  }

  return materialize(best);
}
