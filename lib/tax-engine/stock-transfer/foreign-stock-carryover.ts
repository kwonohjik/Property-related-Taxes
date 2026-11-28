/**
 * 국외주식(§94①3호다목) 이월과세 §97의2① — 게이트 판정 · 시나리오 A/B 빌더
 *
 * 계획서: docs/02-design/features/foreign-stock-carryover-97-2.plan.md · .engine.plan.md
 * 국내 짝: `stock-carryover.ts`(게이트·시나리오) — 비교 솔버는 `stock-carryover-solver.ts` 공용.
 *
 * ## 국내와 다른 점
 *
 * 1. **이월과세의 효과가 필요경비뿐이다.** §104②는 「제1항제2호ㆍ제3호 및 제11호가목」의 보유기간만 정하고
 *    12호(국외주식)를 열거하지 않는다. 그래서 국내 시나리오 B가 하던 「세율 축 롤백」이 필요 없다
 *    (`acquisitionCause`를 `purchase`로 되돌리는 것은 재판정 차단용일 뿐이다).
 * 2. **필요경비 틀이 §97가 아니라 §118②→§118의4다.** 환산취득가액·개산공제·매매사례가 없다 —
 *    증여자 취득가액은 실지거래가액(`actual`) 또는 영 §178의3 시가(`market_price`) 둘뿐이다.
 * 3. **환산**: 증여자 취득가액 = 1주당 외화 × **증여자 취득일 기준환율**(영 §178의5① 「지출한 날」).
 *    수증일 환율이 아니다. 증여자 자본적지출은 그 **지출일** 환율이다. 항목별 절사(공용 환산 leaf `fx-krw.ts`).
 *
 * ## 게이트 — 국내와 같은 leaf를 그대로 쓴다 (single-source)
 *
 *   ⓐ 취득원인 `carryover_gift` 선언 · ⓒ 증여일 ≥ 2025.1.1. · ⓓ 양도일 ≤ 증여일 + 1년 ·
 *   ⓔ 관계 요건(양도일 기준) · ⓕ(국외 신규) §118의2 5년 거주 · 승계 입력 존재
 *
 * Layer 2 (Pure Engine): 이 파일은 `foreign-stock.ts`를 import하지 않는다 — 한도 계산에 쓰는
 * 「양도차익」은 호출부가 콜백으로 넘긴다(순환 방지, 국내 `buildStockScenarioA`와 같은 구조).
 */

import { isCarryoverRelationExcluded } from "../carryover-donor-death";
import { isStockCarryoverEra, isWithinCarryoverPeriod } from "../data/carryover-scope-era";
import { STOCK_FOREIGN_RESIDENT_MIN_YEARS } from "../legal-codes/stock";
import { toKrwUnlessZero } from "../fx-krw";
import type { ForeignStockInput } from "./types/foreign-stock.types";

/** 외화 단가 × 주식수 × 환율 → 원화(원 미만 절사). `foreign-stock.ts` STEP 3과 같은 공용 환산 leaf(BigInt 정확 곱)를 쓴다. */
export function foreignAcquisitionKrw(perShareForeign: number, shareCount: number, rate: number): number {
  return toKrwUnlessZero(perShareForeign, rate, "foreignAcquisition", shareCount);
}

/**
 * §97의2②3호가 견주는 「양도소득 **결정세액**」 — 산출세액 − 외국납부세액공제 (가산세 제외, Q-7).
 * 합산 경로는 이 값이 아니라 `totalFinalTax`를 쓴다(국내 합산과 같은 규약).
 */
export function foreignDecidedTax(r: { incomeTax: number; foreignTaxCreditApplied?: number }): number {
  return r.incomeTax - (r.foreignTaxCreditApplied ?? 0);
}

/**
 * 승계할 입력이 갖춰졌는가. 비어 있으면 승계를 계산할 수 없다 — ⑧·⑫가 먼저 막는 전제이고,
 * 직접 호출이 비운 채 도달하면 **대상에서 제외**한다(0원 취득가액으로 조용히 계산하지 않는다).
 */
export function hasForeignCarryoverInputs(input: ForeignStockInput): boolean {
  if (input.donorAcquisitionMode === undefined) return false;
  if (input.donorPerShareAcquisitionPriceForeign === undefined || input.donorPerShareAcquisitionPriceForeign < 0) return false;
  if (!((input.donorAcquisitionExchangeRate ?? 0) > 0)) return false;
  // Q-4 — 지출일 환율이 없으면 양도일 환율로 대신하지 않는다
  if ((input.donorCapitalExpenditureForeign ?? 0) > 0 && !((input.donorCapitalExpenditureExchangeRate ?? 0) > 0)) {
    return false;
  }
  return true;
}

/** §97의2① 대상 여부 — 모든 축을 통과해야 한다. */
export function isForeignCarryoverEligible(input: ForeignStockInput): boolean {
  if (input.acquisitionCause !== "carryover_gift") return false; // ⓐ
  if (!input.donorAcquisitionDate) return false;
  if (input.yearsResidentInKorea < STOCK_FOREIGN_RESIDENT_MIN_YEARS) return false; // ⓕ §118의2
  if (!isStockCarryoverEra(input.acquisitionDate)) return false; // ⓒ
  if (!isWithinCarryoverPeriod(input.acquisitionDate, input.transferDate, "stock")) return false; // ⓓ
  // ⓔ — 직계존비속 「양도 당시 사망」 괄호의 기준일은 양도일(2025.12.23. 개정 부칙 제7조)
  if (isCarryoverRelationExcluded(input.donorRelation, input.donorDeceased, input.transferDate)) return false;
  return hasForeignCarryoverInputs(input);
}

/** 영 §163의2② 안분 (한도 적용 전) — 산출세액 × 양도한 해당 자산가액 / 증여세 과세가액. BigInt + 원 미만 절사. */
export function apportionForeignGiftTax(input: ForeignStockInput): number {
  const tax = input.giftTaxAmount ?? 0;
  const transferred = input.transferredAssetValue ?? 0;
  const taxable = input.giftTaxableValue ?? 0;
  if (tax <= 0 || transferred <= 0 || taxable <= 0) return 0;
  return Number((BigInt(tax) * BigInt(transferred)) / BigInt(taxable));
}

function donorAcquisitionKrwOrUndefined(input: ForeignStockInput): number | undefined {
  if (!hasForeignCarryoverInputs(input)) return undefined;
  return foreignAcquisitionKrw(
    input.donorPerShareAcquisitionPriceForeign!,
    input.shareCount,
    input.donorAcquisitionExchangeRate!,
  );
}

/**
 * 시나리오 B — §97의2① **미적용**. 취득가액은 수증자 슬롯 그대로(증여 당시 평가액).
 * 승계용 지출·증여세 입력을 지우고 `acquisitionCause`를 `purchase`로 되돌려 재판정을 막는다.
 * (국내와 달리 세율 롤백이 목적이 아니다 — §104②가 12호를 열거하지 않는다.)
 *
 * 증여자 취득일·환율·통화는 **남긴다** — 엔진이 읽지 않고 결과 echo로만 쓴다(A/B 비교 표시).
 */
export function buildForeignScenarioB(input: ForeignStockInput): ForeignStockInput {
  return {
    ...input,
    acquisitionCause: "purchase",
    carryoverOutcome: "excluded",
    carryoverDonorAcquisitionKrw: donorAcquisitionKrwOrUndefined(input),
    carryoverGiftDateAcquisitionKrw: foreignAcquisitionKrw(
      input.perShareAcquisitionPriceForeign ?? 0,
      input.shareCount,
      input.acquisitionExchangeRate,
    ),
    carryoverDonorCapexKrw: undefined,
    carryoverGiftTaxExpense: undefined,
    donorCapitalExpenditureForeign: undefined,
    donorCapitalExpenditureExchangeRate: undefined,
    giftTaxAmount: undefined,
    transferredAssetValue: undefined,
    giftTaxableValue: undefined,
  };
}

/** 시나리오 A 골격 — 증여세 상당액은 한도 계산 후 주입받는다. */
function buildForeignScenarioABase(input: ForeignStockInput, giftTaxIncluded: number): ForeignStockInput {
  const donorCapexKrw = toKrwUnlessZero(
    input.donorCapitalExpenditureForeign ?? 0,
    input.donorCapitalExpenditureExchangeRate ?? 0,
    "donorCapitalExpenditure",
  );
  return {
    ...input,
    // ①1호 — 취득가액을 증여자 취득 당시 금액으로. 환율도 증여자 **취득일** 것(영 §178의5①)이다.
    acquisitionMode: input.donorAcquisitionMode!,
    perShareAcquisitionPriceForeign: input.donorPerShareAcquisitionPriceForeign,
    acquisitionExchangeRate: input.donorAcquisitionExchangeRate!,
    carryoverOutcome: "applied",
    // ①2호 — 증여자 자본적지출(양도비는 수증자 것만 — §97의2①2호는 §97①2호만 가리킨다)
    carryoverDonorCapexKrw: donorCapexKrw,
    // ①3호 — 증여세 상당액은 필요경비 확정 후 가산
    carryoverGiftTaxExpense: giftTaxIncluded,
    carryoverDonorAcquisitionKrw: donorAcquisitionKrwOrUndefined(input),
    carryoverGiftDateAcquisitionKrw: foreignAcquisitionKrw(
      input.perShareAcquisitionPriceForeign ?? 0,
      input.shareCount,
      input.acquisitionExchangeRate,
    ),
  };
}

/**
 * 시나리오 A 확정 — 증여세 상당액의 **한도**까지 반영한다.
 * 영 §163의2② 후단 「양도가액에서 법 제97조제1항 및 제2항의 금액을 공제한 잔액」을 국외주식에서는
 * §118의4 금액으로 읽어(해석례 미확인) **증여세 가산 직전 양도차익**을 한도로 삼는다.
 */
export function buildForeignScenarioA(
  input: ForeignStockInput,
  calcTransferGain: (i: ForeignStockInput) => number,
): ForeignStockInput {
  const apportioned = apportionForeignGiftTax(input);
  if (apportioned <= 0) return buildForeignScenarioABase(input, 0);
  const cap = Math.max(0, calcTransferGain(buildForeignScenarioABase(input, 0)));
  return buildForeignScenarioABase(input, Math.min(apportioned, cap));
}
