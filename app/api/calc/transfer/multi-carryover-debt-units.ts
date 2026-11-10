/**
 * ⑭ 다건 합산 — 이월과세(소득세법 §97의2) × 당초 증여 때 인수한 채무 부분(매입분) 자산의 **단독 계산**
 * (계획서 `docs/00-pm/multi-carryover-bg-gb-shares.plan.md` 트랙 CO-DEBT · V-CO2).
 *
 * 채무 부분은 시나리오 A에서 증여분·매입분 두 조각으로 나뉘고, 그 분할은 신고 단위 집계만 한다
 * (`calculateTransferTaxAggregateWithUnits` → `deriveCarryoverDebtUnits`). 단건 엔진은 채무 키를 받으면 던진다.
 * 연간 합산 집계 자체는 이미 그 함수를 부르므로, 자산 하나만 따로 계산하는 두 곳(예정신고 세액 · 같은 날 권리 고지)만
 * 단건 route(`carryover-debt-route.ts`)와 같은 계산 — 카드 1장짜리 신고 단위 집계 — 으로 바꾼다.
 */
import { calculateTransferTaxAggregateWithUnits } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { AggregateTransferResult, TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import { carryoverDebtShareOf } from "@/lib/tax-engine/carryover-debt-pieces";
import { ratesForTransferDate, type RatesByTransferDate } from "@/lib/tax-engine/transfer-tax-item-rates";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { PreliminaryCardUnit } from "@/lib/tax-engine/transfer-tax-preliminary-filing";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

/** 단건 route가 `carryover-debt-route.ts`로 보내는 자산인가 — 같은 술어(이월과세 취득 + 인수 채무). */
export function isCarryoverDebtItem(p: Pick<TransferTaxInput, "acquisitionCause" | "carryoverTaxation">): boolean {
  return p.acquisitionCause === "carryover_gift" && carryoverDebtShareOf(p.carryoverTaxation) !== null;
}

/**
 * 그 자산만의 신고 — 단건 `calculateCarryoverDebtTransfer`와 같은 집계 입력(카드 1장 · 같은 날 조각 동순위 규약 · 그 양도일 세율).
 * 가산세·정정 입력은 호출부가 벗긴 카드를 넘긴다.
 */
export function aggregateCarryoverDebtAlone(
  card: TransferTaxInput,
  taxYear: number,
  annualBasicDeductionUsed: number,
  rates: TaxRatesMap,
  ratesByTransferDate?: RatesByTransferDate,
): AggregateTransferResult {
  return calculateTransferTaxAggregateWithUnits(
    {
      taxYear,
      properties: [card as unknown as TransferTaxItemInput],
      annualBasicDeductionUsed,
      sameDayEqualTaxOrder: "marginalRateThenAssetNumber",
    },
    ratesForTransferDate(card.transferDate, rates, ratesByTransferDate),
    undefined,
    [],
  ).result;
}

/** 예정신고 세액 단위 — 채무 인수분 이월과세 자산은 카드 1장짜리 집계로 계산한다(단건 엔진 직접 호출 금지). */
export function carryoverDebtPreliminaryUnits(
  properties: readonly TransferTaxInput[],
  taxYear: number,
  rates: TaxRatesMap,
  ratesByTransferDate?: RatesByTransferDate,
  /** 이미 다른 단위(일반건물 카드 묶음)에 든 인덱스 — 건너뛴다. */
  covered: ReadonlySet<number> = new Set(),
): PreliminaryCardUnit[] {
  return properties.flatMap((p, idx) =>
    !covered.has(idx) && isCarryoverDebtItem(p)
      ? [{
          indices: [idx],
          calculate: (cards, used) => {
            const r = aggregateCarryoverDebtAlone(cards[0], taxYear, used, rates, ratesByTransferDate);
            return { determinedTax: r.determinedTax, reductionAmount: r.reductionAmount, ruralSurtax: r.ruralSurtax, basicDeduction: r.basicDeduction };
          },
        }]
      : [],
  );
}
