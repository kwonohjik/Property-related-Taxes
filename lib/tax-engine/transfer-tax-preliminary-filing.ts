/**
 * 예정신고 산출세액 — 자산별 가산세 base (F03)
 *
 * ## 왜 집계 결정세액이 아닌가
 *
 * 「국세기본법」 §47의2①은 무신고가산세의 base를 「그 신고로 납부하여야 할 세액」이라 하고,
 * 괄호에서 **예정신고를 포함**한다고 명시한다. 같은 조 ⑤은 「예정신고와 관련하여 가산세가
 * 부과되는 부분에 대해서는 **확정신고와 관련한 가산세를 적용하지 아니한다**」고 하여 두 축을
 * 분리한다. ⇒ 예정신고 무신고의 base는 **그 건의 예정신고 세액**이지 신고 전체 결정세액이 아니다.
 *
 * ⛔ 그래서 집계 결정세액을 `taxBaseShare`로 **역안분하는 방식은 금지**다(F03·§104⑤에서 두 번
 *    확정). 실측상 ~1% 과대를 **49% 반대 방향 오차**로 바꾼다 — 예정신고 base에 차손통산·합산
 *    누진을 넣는 셈이기 때문이다.
 *
 * ## 무엇이 틀려 있었나
 *
 * `multi/route.ts`가 주입하던 값은 집계 1차 pass의 **자산별 standalone 결정세액**인데,
 * 그 값은 `skipBasicDeduction: true`로 계산된다(집계가 §103 기본공제를 신고 단위로 따로
 * 배분하기 때문이다). 그래서 **기본공제가 빠진 세액**이 가산세 base가 됐다.
 *
 * 실측(2026-08-23 · mock 세율 · 토지 2건 중 1건 무신고):
 * 기본공제 2,500,000 × 세율 40% = **1,000,000**만큼 base가 컸고, 가산세 20%로
 * **200,000(0.85%) 과대**였다.
 *
 * ## 조문이 정한 계산
 *
 * · **§107①** 예정신고 산출세액 = (양도차익 − 장기보유특별공제 − **양도소득 기본공제**) × §104① 세율
 * · **§103②** 기본공제는 「해당 과세기간에 **먼저 양도한 자산**의 양도소득금액에서부터
 *   **순서대로**」 공제한다 — 배분 순서가 **명문**이라 「자동 안분 fallback 금지」의 대상이 아니다.
 * · **§107②** 2회 이후 예정신고를 합산 신고하면 이미 신고한 산출세액을 차감한다 —
 *   기본공제가 **앞선 신고에서 소진**된다는 것을 조문이 전제한다.
 *
 * ⇒ 양도일 오름차순으로 단건 엔진을 돌리되, 앞선 자산이 쓴 기본공제를 `annualBasicDeductionUsed`로
 *   누적해 넘긴다. 집계의 `MAX_BENEFIT` 배분(확정신고 축)과는 **다른 축**이라 서로 간섭하지 않는다.
 *
 * @see docs/00-pm/transfer-review-2026-08-open-items.plan.md §F03
 */
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { TransferTaxInput } from "./types/transfer.types";

/** 자산 index → 그 자산의 예정신고 결정세액(§107① 산출세액 − 감면세액). */
export type PreliminaryFilingTaxes = Map<number, { determinedTax: number; reductionAmount: number }>;

interface CalcFn {
  (input: TransferTaxInput, rates: TaxRatesMap): {
    determinedTax: number;
    reductionAmount?: number;
    basicDeduction?: number;
  };
}

/**
 * 자산별 **예정신고 결정세액**을 §103② 순서로 계산한다.
 *
 * @param properties 신고에 담긴 전 자산(가산세 대상이 아닌 자산도 **기본공제를 소진**하므로 전부 넣는다)
 * @param annualBasicDeductionUsed 이 신고 이전에 이미 사용한 기본공제(폼 입력)
 * @param calculateTransferTax 단건 엔진(주입 — 순환 import 회피)
 */
export function computePreliminaryFilingTaxes(
  properties: readonly TransferTaxInput[],
  rates: TaxRatesMap,
  annualBasicDeductionUsed: number,
  calculateTransferTax: CalcFn,
): PreliminaryFilingTaxes {
  // §103② — 「먼저 양도한 자산」부터. 같은 날이면 입력 순서를 유지한다(안정 정렬).
  const order = properties
    .map((p, index) => ({ index, at: p.transferDate?.getTime?.() ?? 0 }))
    .sort((a, b) => (a.at === b.at ? a.index - b.index : a.at - b.at));

  const result: PreliminaryFilingTaxes = new Map();
  let used = annualBasicDeductionUsed;

  for (const { index } of order) {
    const asset = properties[index];
    /**
     * ⚠️ **집계 컨텍스트를 빼고 부른다.** 예정신고는 그 건만의 신고이므로
     * §102② 차손통산·§104⑤ 비교과세·집계 기본공제 배분이 들어가면 안 된다.
     * `skipBasicDeduction`을 **끄는 것**이 이 함수의 존재 이유다(§107① C 항).
     */
    const single: TransferTaxInput = {
      ...asset,
      annualBasicDeductionUsed: used,
      skipBasicDeduction: false,
      skipLossFloor: false,
      // 신고서 단위 정정은 예정신고 세액과 무관하다(집계 결정세액에 1회만 적용된다).
      amendment: undefined,
      // 가산세 재귀 방지 — 여기서 구하는 것이 그 가산세의 base다.
      filingPenaltyDetails: undefined,
      delayedPaymentDetails: undefined,
    };
    const r = calculateTransferTax(single, rates);
    result.set(index, {
      determinedTax: r.determinedTax,
      reductionAmount: r.reductionAmount ?? 0,
    });
    used += r.basicDeduction ?? 0;
  }

  return result;
}
