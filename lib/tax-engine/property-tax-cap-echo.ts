/**
 * §122 세부담상한 결과 echo 조립 — property-tax.ts 800줄 정책 분리.
 *
 * recompute 모드: taxCapMode·taxCapBasisTax·recomputeDetail(priorYear·priorTaxBase·appliedRate·recomputedTax) echo.
 * direct 모드: taxCapMode·taxCapBasisTax(= previousYearTax)만, recomputeDetail undefined.
 * basisTax는 호출부에서 resolveBasisTax로 이미 산출한 값을 전달 → 재계산 0.
 */

import { recomputePriorYearAppliedRate } from "./property-tax-recompute";
import type { PropertyTaxInput, PropertyTaxResult } from "./types/property.types";

type CapEcho = Pick<PropertyTaxResult, "taxCapMode" | "taxCapBasisTax" | "recomputeDetail">;

/**
 * 세부담상한 결과 echo 생성.
 * @param basisTax resolveBasisTax(input, priorYear) 결과 (cap 비교 기준 직전 세액상당액)
 * @param priorYear 직전 연도 (taxYear - 1)
 */
export function buildCapEcho(
  input: PropertyTaxInput,
  basisTax: number | undefined,
  priorYear: number,
): CapEcho {
  if (input.taxCapMode === "recompute" && input.previousYearTaxBase != null) {
    return {
      taxCapMode: "recompute",
      taxCapBasisTax: basisTax,
      recomputeDetail: {
        priorYear,
        priorTaxBase: input.previousYearTaxBase,
        appliedRate: recomputePriorYearAppliedRate(input, priorYear),
        recomputedTax: basisTax ?? 0,
      },
    };
  }
  return { taxCapMode: "direct", taxCapBasisTax: input.previousYearTax };
}
