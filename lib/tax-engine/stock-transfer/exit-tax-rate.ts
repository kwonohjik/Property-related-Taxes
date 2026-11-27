/**
 * 국외전출세 — §118의11 세율표 적용 (순수 leaf)
 *
 * `exit-tax.ts`(본 계산)와 `exit-tax-credit.ts`(조정공제)가 함께 쓰므로 한 곳에 둔다.
 * (PR-1 동작 불변 분리 — 로직·주석은 `exit-tax.ts`에서 그대로 이동)
 */

import { STOCK_MAJOR_PROGRESSIVE_BRACKETS } from "./stock-rate-tables";

// ============================================================
// §118의11 → §104①11가목2) 누진세율
// STOCK_MAJOR_PROGRESSIVE_BRACKETS 재사용
// ============================================================

/**
 * §118의11 → §104①11가목2) 준용 산출세액 계산
 * 3억 이하 20% / 초과 25%(누진공제 15,000,000)
 */
export function applyExitTaxRate(taxBase: number): {
  rate: number;
  progressiveDeduction: number;
  tax: number;
} {
  if (taxBase <= 0) return { rate: 0, progressiveDeduction: 0, tax: 0 };

  for (const bracket of STOCK_MAJOR_PROGRESSIVE_BRACKETS) {
    const max = bracket.max ?? Infinity;
    if (taxBase <= max) {
      const rawTax = Math.floor(taxBase * bracket.rate) - bracket.deduction;
      return {
        rate: bracket.rate,
        progressiveDeduction: bracket.deduction,
        tax: Math.max(0, rawTax),
      };
    }
  }

  // 최고 구간 (25%)
  const last = STOCK_MAJOR_PROGRESSIVE_BRACKETS[STOCK_MAJOR_PROGRESSIVE_BRACKETS.length - 1];
  const rawTax = Math.floor(taxBase * last.rate) - last.deduction;
  return {
    rate: last.rate,
    progressiveDeduction: last.deduction,
    tax: Math.max(0, rawTax),
  };
}
