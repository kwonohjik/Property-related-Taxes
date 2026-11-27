/**
 * 국외전출세 — 경정청구 세액공제 3함수 (§118의12~§118의14)
 *
 * PR-1 동작 불변 분리: `exit-tax.ts`에서 로직·주석을 그대로 이동했다.
 * 계획서: docs/02-design/features/stock-transfer-exit-tax-2027.engine.plan.md §7.1
 */

import type { ExitTaxInput, ExitTaxHolding } from "./types/exit-tax.types";
import { applyExitTaxRate } from "./exit-tax-rate";

// ============================================================
// STEP 7: 경정청구 — 조정공제·외국납부세액공제·비거주자공제
// ============================================================

/**
 * §118의12 조정공제 계산
 *
 * 실양도가액 < 출국일 시가 시:
 *   조정공제 = [출국일 양도가 − 실양도가] × §118의11에 따른 세율
 *            = 출국일 기준 산출세액 − 실양도가 기준 산출세액   (아래 본문 주석 참조)
 *
 * @param taxBase 출국일 기준 양도소득과세표준 (§118의10④ 기본공제 차감 후)
 * @param incomeTax 산출세액
 * @param totalDepartureDayValue 출국일 총 간주양도가액 (전 종목 합산)
 * @param actualTransferPricePerShare 실제 양도 1주당 단가 (원화)
 * @param holdings 보유 종목 (실양도 후 전체 종목 단일 주가 적용 — v1 단순화)
 */
export function calcAdjustmentDeduction(
  taxBase: number,
  incomeTax: number,
  totalDepartureDayValue: number,
  actualTransferPricePerShare: number,
  holdings: ExitTaxHolding[],
): number {
  // 실제 양도가액 합계 = actualTransferPricePerShare × 총 주수
  // (v1: 전 종목 동일 단가 적용 단순화)
  const totalShareCount = holdings.reduce((sum, h) => sum + h.shareCount, 0);
  const actualTransferValue = actualTransferPricePerShare * totalShareCount;

  // 실양도가 >= 출국일 시가 → 조정공제 없음 (§118의12① 「낮은 때」 요건)
  if (actualTransferValue >= totalDepartureDayValue) return 0;
  if (taxBase <= 0) return 0;

  /**
   * §118의12①: [출국일 양도가액 − 실제 양도가액] × **§118의11에 따른 세율**
   *
   * §118의11의 세율은 스칼라가 아니라 **누진표**다(3억 이하 20% / 초과 6천만원 + 초과액 25%).
   * 그러므로 차액이 실제로 얹혀 있는 위치에, 걸친 구간마다 그 구간의 세율로 적용해야 한다.
   * 그것이 곧 **「출국일 기준 산출세액 − 실제 양도가액 기준 산출세액」**이다 —
   * 취득가액과 §118의10④ 기본공제가 두 계산에 똑같이 들어 있어 상쇄되므로,
   * 과세표준의 차이는 곧 양도가액의 차이(= 조문의 대괄호 항)와 같다.
   *
   * ⚠️ **「차액 × 단일 한계세율」로 축약하면 안 된다.** 두 과세표준이 같은 구간에 있을 때만
   *    같은 값이 되고, 구간을 걸치면 차액의 아랫부분에 20%가 적용되므로 25%를 통으로 곱한
   *    값이 과다해진다(취득 5억·출국 10억·실제 7억 → 정답 69,875,000 vs 통곱 75,000,000).
   *    아래 한 줄이 두 경우를 모두 처리한다.
   */
  const priceDrop = totalDepartureDayValue - actualTransferValue;
  const reducedTaxBase = Math.max(0, taxBase - priceDrop);
  const deduction = incomeTax - applyExitTaxRate(reducedTaxBase).tax;

  // 조정공제는 산출세액을 초과할 수 없다 (실양도가가 취득가 아래로 내려간 경우)
  return Math.min(Math.max(0, deduction), incomeTax);
}

/**
 * §118의13① 외국납부세액공제
 *
 * 🔴 2026-08-28 정정(리뷰 #9 — **세액 변경**) — 종전에는 **한도만** 구현하고 계산식(안분 비율)이
 * 통째로 빠져 있었다. 시그니처에 양도가액·필요경비 인자 자체가 없어 비율을 계산할 수 없었다.
 *
 * 법문(소득세법 lawId 001565, 시행 2026-07-01 본):
 *   「… 산출세액에서 조정공제액을 공제한 금액을 **한도로** 다음의 계산식에 따라 계산한
 *    외국납부세액을 산출세액에서 공제한다.
 *    해당 자산의 양도소득에 대하여 외국정부에 납부한 세액
 *      × [제118조의10제1항에 따른 양도가액(제118조의12제1항에 해당하는 경우에는 **실제 양도가액**)
 *         − 제118조의10제2항에 따른 필요경비]
 *      ÷ (실제 양도가액 − 제118조의10제2항에 따른 필요경비)」
 *   ⇒ 「한도」와 「계산식」은 **별개 요건**이다.
 *
 * 🔑 조정공제가 발동하는 구간(실양도 < 출국일 시가 = §118의12① 해당)은 분자도 실제 양도가액이
 *    되어 **분자 = 분모**라 비율이 1이다. 결함이 실제로 세액을 움직이는 구간은
 *    **「실양도 > 출국일 시가」 단독**이고, 방향은 항상 과대공제(세액 과소)였다.
 *    실측: 출국일 시가 50억·필요경비 20억·실양도 60억·외국납부 5억
 *      → 종전 5억 전액 공제 / 정상 floor(5억 × 30억/40억) = 3.75억 ⇒ 1.25억 과소.
 *
 * ⚠️ 곱셈이 2^53 을 넘을 수 있다(외국납부세액 × 양도차익) — BigInt 로 계산한다.
 *
 * §118의13②: 1호(외국정부 산출세액 공제 허용) 또는 2호(취득가액 출국일 시가 조정) 시 배제.
 *
 * @param incomeTax 산출세액
 * @param adjustmentDeduction 조정공제액
 * @param foreignTaxPaid 외국납부세액 (원화)
 * @param exclusionReason §118의13② 배제 사유
 * @param apportion 안분 인자 — 실제 양도가액이 없으면 비율을 세울 수 없다(`ratioApplied: false`).
 */
export function calcForeignTaxCredit(
  incomeTax: number,
  adjustmentDeduction: number,
  foreignTaxPaid: number,
  exclusionReason: ExitTaxInput["foreignTaxExclusionReason"],
  apportion: {
    /** §118의10① 양도가액 — 출국일 현재 시가 합계 */
    departureDayValue: number;
    /** §118의10② 필요경비 합계 */
    necessaryExpense: number;
    /** 실제 양도가액 합계. 미입력이면 undefined. */
    actualTransferValue?: number;
  },
): { applied: number; ratioApplied: boolean } {
  // §118의13②적용 배제 → 공제 0
  if (exclusionReason !== "none") return { applied: 0, ratioApplied: false };

  // 공제한도 = 산출세액 − 조정공제액
  const limit = Math.max(0, incomeTax - adjustmentDeduction);

  const { departureDayValue, necessaryExpense, actualTransferValue } = apportion;

  // 실제 양도가액이 없으면 분모를 세울 수 없다. 여기서 공제를 **막지는 않는다** —
  // 근거 없이 불리해지기 때문이다. 대신 호출부가 경고로 표면화한다.
  if (actualTransferValue == null) {
    return { applied: Math.min(foreignTaxPaid, limit), ratioApplied: false };
  }

  const denominator = actualTransferValue - necessaryExpense;
  if (denominator <= 0) return { applied: 0, ratioApplied: true };

  // §118의12①에 해당하는 경우(실양도 < 출국일 시가)에는 분자도 **실제 양도가액**이다.
  const numeratorBase =
    actualTransferValue < departureDayValue ? actualTransferValue : departureDayValue;
  const numerator = numeratorBase - necessaryExpense;
  if (numerator <= 0) return { applied: 0, ratioApplied: true };

  const apportioned = apportionForeignTax(foreignTaxPaid, numerator, denominator);

  return { applied: Math.min(apportioned, limit), ratioApplied: true };
}

/**
 * §118의13① 안분식의 곱셈·나눗셈 — 외국납부세액 × 분자 ÷ 분모 (원 미만 절사).
 * 곱셈이 2^53 을 넘을 수 있어 BigInt 로 계산한다. 분모는 0 초과여야 한다(호출부가 보장).
 * 전역 경로(`calcForeignTaxCredit`)와 종목별 경로(`exit-tax-actual-transfer.ts`)가 같은 식을 쓰도록 한 곳에 둔다.
 */
export function apportionForeignTax(foreignTaxPaid: number, numerator: number, denominator: number): number {
  return Number(
    (BigInt(Math.trunc(foreignTaxPaid)) * BigInt(Math.trunc(numerator))) / BigInt(Math.trunc(denominator)),
  );
}

/**
 * §118의14① 비거주자 세액공제
 *
 * 한도 = 「산출세액에서 조정공제액을 공제한 금액」 — **그 둘뿐이다**.
 *
 * 🔴 2026-08-28 정정(리뷰 #8) — 종전 주석은 「§118의13과 **병용** 시 순서」라 적고 한도에서
 * 외국납부세액공제까지 빼고 있었는데, 법문에 그런 항목이 없다. ②가 두 공제의 **병용 자체를
 * 금지**하므로 「병용 시 순서」라는 전제부터 틀렸다. 한도를 근거 없이 과소 산정하면
 * 납세자에게 불리해진다([[feedback_no_unfavorable_application_without_legal_basis]]).
 *
 * @param incomeTax 산출세액
 * @param adjustmentDeduction 조정공제액
 * @param domesticSourceTaxWithheld §156①7호 원천징수액 (원화)
 */
export function calcDomesticTaxCredit(
  incomeTax: number,
  adjustmentDeduction: number,
  domesticSourceTaxWithheld: number,
): number {
  const limit = Math.max(0, incomeTax - adjustmentDeduction);
  return Math.min(domesticSourceTaxWithheld, limit);
}
