/**
 * anchor — 종부령 §3⑧ 「… 요건을 충족하지 않게 된 때에는 해당 과세연도를 포함하여 연속하는 2개 과세연도까지는 합산배제 임대주택에서 제외한다」(T-07b)
 * + 부칙<대통령령 제30404호> 제4조 「이 영 시행 이후 위반하는 분부터 적용한다」(2020.2.11.).
 * - 위반 계약일 연도 Y: Y ≤ 과세연도 ≤ Y+1 → 불성립 · 그해 6.1. 뒤 위반은 그해도 제외 + 확인 필요(Q-8 a)
 * - 1·2·7·8·10·11호만(9호·3·4·5·6호 제외) · 그해 6.1. 계약이 이미 5% 초과면 사유 하나만
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-input-gaps-4.plan.md §3.3·§4 A07b
 */
import { describe, it, expect } from "vitest";
import { validateRentalExclusion } from "@/lib/tax-engine/comprehensive-exclusion";
import { rentViolationApplies } from "@/lib/tax-engine/comprehensive-exclusion-rent-violation";
import { rentIncreaseLimitApplies } from "@/lib/tax-engine/comprehensive-exclusion";
import { COMPREHENSIVE_EXCL as E } from "@/lib/tax-engine/legal-codes";
import type { RentalExclusionInput } from "@/lib/tax-engine/types/comprehensive.types";
import { NA8_NOT_APPLICABLE } from "./_helpers/comprehensive-8na-not-applicable";

const d = (s: string) => new Date(s);
/** 8호 장기일반 민간매입 · 2025 과세기준일 · 지자체 2025.2.20. 등록 · 2020.3. 임대개시 */
const BASE: RentalExclusionInput = {
  ...NA8_NOT_APPLICABLE,
  registrationType: "private_purchase_long",
  rentalRegistrationDate: d("2020-02-20"),
  rentalApplicationDate: d("2020-02-15"),
  businessRegistrationDate: d("2020-02-20"),
  rentalStartDate: d("2020-03-01"),
  acquisitionDate: d("2016-01-01"),
  assessedValue: 500_000_000,
  area: 59,
  location: "metro",
  currentRent: 1_000_000,
  isInitialContract: true,
  assessmentDate: d("2025-06-01"),
  ownerType: "individual",
};
const run = (over: Partial<RentalExclusionInput>) => validateRentalExclusion({ ...BASE, ...over });
const viol = (v: string, over: Partial<RentalExclusionInput> = {}) => run({ rentViolationDate: d(v), ...over });

describe("A07b — §3⑧ 5% 위반 뒤 2개 과세연도", () => {
  it("A07b-1 ★ 2025 과세연도 · 위반 2024.3.1.(Y+1) → 불성립", () => {
    expect(viol("2024-03-01").failReasons).toEqual([E.RENT_VIOLATION_TWO_YEARS]);
  });
  it("A07b-2 ★ 위반 2023.3.1.(Y+2) → 성립 · 위반 2025.3.1.(Y, 6.1. 전) → 불성립", () => {
    expect(viol("2023-03-01").isExcluded).toBe(true);
    expect(viol("2025-03-01").failReasons).toEqual([E.RENT_VIOLATION_TWO_YEARS]);
  });
  it("Q-8 a 그해 6.1. 뒤 위반(2025.7.1.) → 그해도 제외 + 확인 필요 · 다음 해 위반(2026.1.1.)은 보지 않음", () => {
    expect(viol("2025-07-01").failReasons).toEqual([E.RENT_VIOLATION_SAME_YEAR_AFTER_ASSESSMENT]);
    expect(viol("2026-01-01").isExcluded).toBe(true);
  });
  it("A07b-3 부칙 제4조 — 2020 과세연도 · 위반 2020.2.10. 성립 · 2020.2.11. 불성립", () => {
    const y20 = { assessmentDate: d("2020-06-01") };
    expect(viol("2020-02-10", y20).isExcluded).toBe(true);
    expect(viol("2020-02-11", y20).failReasons).toEqual([E.RENT_VIOLATION_TWO_YEARS]);
  });
  it("A07b-4 9호·3·4·5·6호는 보지 않는다 · §3⑧ 집합은 5% 요건 집합에서 9호만 빠진다", () => {
    for (const t of ["public_conversion_pending", "existing_rental", "vacant_construction", "reit_purchase", "unsold_purchase"])
      expect(rentViolationApplies(t)).toBe(false);
    const all = ["private_construction", "public_construction", "private_purchase_short", "public_purchase", "existing_rental", "vacant_construction", "reit_purchase", "unsold_purchase", "public_support_construction", "private_purchase_long", "public_support_purchase", "public_conversion_pending", "private_short_term_6y_construction", "private_short_term_6y_purchase"];
    expect(all.filter((t) => rentIncreaseLimitApplies(t) !== rentViolationApplies(t))).toEqual(["public_conversion_pending"]);
  });
  it("A07b-5 그해 6.1. 계약이 이미 5% 초과 + 위반일 그해 → 사유 하나만", () => {
    const r = viol("2025-03-01", { isInitialContract: false, previousRent: 1_000_000, currentRent: 1_100_000 });
    expect(r.failReasons).toEqual([E.RENT_INCREASE_EXCEEDED]);
  });
});
