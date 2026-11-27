/**
 * 국외전출세 — 세율 구분별 산출세액·지방소득세 (순수 leaf, 2027.1.1. 개정)
 *
 * 소득세법 §118의11 (2027.1.1. 이후 출국분)
 *   1호 3호 가·나목, 4호 다·라목 주식등 — 종전 누진표(3억 이하 20% / 초과 6천만원 + 초과액 25%)
 *   2호 3호 다목(국외주식등)  가. 중소기업의 주식등 100분의 10 / 나. 그 밖의 주식등 100분의 20
 *
 * 세율 × 금액은 `applyRate`(정수 연산)로만 한다 — 부동소수 곱 직접 사용 금지.
 */

import type { ExitTaxRateBucket } from "./types/exit-tax.types";
import { applyExitTaxRate } from "./exit-tax-rate";
import { applyRate } from "@/lib/tax-engine/tax-utils";
import { STOCK_EXIT_TAX_2027_CONSTS } from "@/lib/tax-engine/legal-codes/stock-exit-tax-2027";

/** 10원 미만 절사 (§47③ 준용 — 지방소득세) */
export function floorTen(n: number): number {
  return Math.floor(n / 10) * 10;
}

/** 구분별 산출세액. 1호는 종전 표(`applyExitTaxRate`) 그대로, 2호는 단일 세율이라 누진공제 0이다. */
export function calcBucketTax(
  bucket: ExitTaxRateBucket,
  taxBase: number,
): { rate: number; progressiveDeduction: number; tax: number } {
  if (bucket === "clause1") return applyExitTaxRate(taxBase);
  const rate =
    bucket === "clause2a" ? STOCK_EXIT_TAX_2027_CONSTS.SME_RATE : STOCK_EXIT_TAX_2027_CONSTS.OTHER_RATE;
  if (taxBase <= 0) return { rate: 0, progressiveDeduction: 0, tax: 0 };
  return { rate, progressiveDeduction: 0, tax: applyRate(taxBase, rate) };
}

/** 지방세법 §103의3⑧ 표의 경계 — 3억원 */
const LOCAL_TABLE_BREAKPOINT = 300_000_000;
/** 지방세법 §103의3⑧ — 3억원 초과 구간의 기본 금액 600만원 */
const LOCAL_TABLE_BASE_OVER = 6_000_000;

/**
 * 지방세법 §103의3⑧ 표를 양도소득과세표준에 **그대로 읽은** 지방소득세 (10원 미만 절사).
 *   3억원 이하: 과세표준 × 1천분의 20
 *   3억원 초과: 600만원 + (3억원 초과액 × 1천분의 25)
 *
 * 호 구분이 없는 단일표라 2호(소득세 10%/20%)와 어긋날 수 있다 — 계획 V-3. 그래서 2호는 이 값을 주값으로 두고
 * 소득세의 10%를 참고값(`localIncomeTaxAlternative`)으로 병기한다(사용자 결정 C-5). 1호는 소득세 표의 정확히 10%와 같아 쓰지 않는다.
 */
export function calcLocalIncomeTaxTable(taxBase: number): number {
  if (taxBase <= 0) return 0;
  const raw =
    taxBase <= LOCAL_TABLE_BREAKPOINT
      ? applyRate(taxBase, 0.02)
      : LOCAL_TABLE_BASE_OVER + applyRate(taxBase - LOCAL_TABLE_BREAKPOINT, 0.025);
  return floorTen(raw);
}
