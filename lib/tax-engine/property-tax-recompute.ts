/**
 * §118 본문 정밀 재산정 (recompute 모드) — property-tax.ts 800줄 정책 분리.
 *
 * 세부담상한(§122) 기준 "직전 연도 세액상당액"을 직전연도 세율(역사 세율표)로 재산정.
 * 비주택 중 건축물·선박·종합합산토지만 지원 — 별도합산·분리는 면적·classify 구조라
 * 직전 과세표준만으로 재산정 불가(설계 C-6x), direct(직전 세액 직접입력) 유지.
 */

import { applyRate } from "./tax-utils";
import { calcBuildingTax } from "./property-tax";
import { calculateComprehensiveAggregateTax } from "./property-tax-comprehensive-aggregate";
import { getPropertyRateSet } from "./data/property-rate-history";
import type { PropertyTaxInput } from "./types/property.types";

/**
 * 직전연도 세액상당액 재산정 (지방세법 시행령 §118 본문).
 * 직전 과세표준 × 직전연도 세율(역사 세율표 priorYear 세트).
 */
export function recomputePriorYearTax(
  input: PropertyTaxInput,
  priorTaxBase: number,
  priorYear: number,
): number {
  const rs = getPropertyRateSet(priorYear);
  switch (input.objectType) {
    case "building":
      return calcBuildingTax(priorTaxBase, input.buildingType, rs).tax;
    case "vessel":
    case "aircraft":
      return applyRate(priorTaxBase, rs.vesselAircraft);
    case "land":
      if (input.landTaxType === "comprehensive_aggregate") {
        return calculateComprehensiveAggregateTax(priorTaxBase, rs);
      }
      return input.previousYearTax ?? 0; // 별도합산·분리 미지원 → direct
    default:
      return input.previousYearTax ?? 0;
  }
}

/**
 * 세부담상한 기준 직전 세액 결정.
 * recompute 모드(taxCapMode==="recompute" + previousYearTaxBase) → 재산정, 아니면 previousYearTax(direct).
 */
export function resolveBasisTax(
  input: PropertyTaxInput,
  priorYear: number,
): number | undefined {
  if (input.taxCapMode === "recompute" && input.previousYearTaxBase != null) {
    return recomputePriorYearTax(input, input.previousYearTaxBase, priorYear);
  }
  return input.previousYearTax;
}

/**
 * recompute 모드 직전연도 단일세율 (결과 echo recomputeDetail.appliedRate용).
 * 건축물=buildingType별, 선박·항공기=vesselAircraft, 누진 토지(종합합산 등)=undefined.
 */
export function recomputePriorYearAppliedRate(
  input: PropertyTaxInput,
  priorYear: number,
): number | undefined {
  const rs = getPropertyRateSet(priorYear);
  switch (input.objectType) {
    case "building":
      return calcBuildingTax(0, input.buildingType, rs).appliedRate;
    case "vessel":
    case "aircraft":
      return rs.vesselAircraft;
    default:
      return undefined; // land(종합합산 누진 등) — 단일세율 없음
  }
}
