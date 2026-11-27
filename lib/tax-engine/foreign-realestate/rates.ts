import type { ParsedRates } from "../transfer-tax-helpers";
import type { ForeignRealEstateRates } from "./types";

/**
 * `parseRatesFromMap` 결과 → 국외 부동산 엔진 세율. 국내 장특·중과·1주택 규칙은 쓰지 않으므로 버린다.
 * (계획서 엔진 §3.1 — 국내 `progressive_rate` seed 행 재사용, A-0 anchor가 §55①과 일치함을 고정)
 */
export function foreignRealEstateRatesFrom(
  parsed: Pick<ParsedRates, "brackets" | "basicDeductionRules">,
): ForeignRealEstateRates {
  return {
    brackets: parsed.brackets,
    basicDeductionAnnualLimit: parsed.basicDeductionRules.annualLimit,
  };
}
