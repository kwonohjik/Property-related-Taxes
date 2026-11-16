/**
 * anchor — 종부령 §3⑦4호 「기존 임차인의 퇴거일부터 다음 임차인의 입주일까지의 기간이 2년 이내인 경우에는 계속 임대하는 것으로 본다」(T-12).
 * - 과세기준일 현재 공실이면 퇴거일부터 2년(초일 불산입 · 공휴일 연장 없음 — B 유형 `isWithinPeriod`) 이내만 성립 + 경고
 * - 퇴거일 빈칸·과세기준일 뒤·임대개시일 앞 → 불성립 · 4·9호는 보지 않음 · 공실이면 5% 비교 안 함(Q-5 a)
 * 실측(변경 전 교재 대조 probe P11): 현재 임대료 빈칸(공실)이어도 기간과 무관하게 성립.
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-input-gaps-4.plan.md §3.2·§4 A12
 */
import { describe, it, expect } from "vitest";
import { validateRentalExclusion } from "@/lib/tax-engine/comprehensive-exclusion";
import { COMPREHENSIVE_EXCL as E } from "@/lib/tax-engine/legal-codes";
import type { RentalExclusionInput } from "@/lib/tax-engine/types/comprehensive.types";
import { NA8_NOT_APPLICABLE } from "./_helpers/comprehensive-8na-not-applicable";

const d = (s: string) => new Date(s);
/** 8호 장기일반 민간매입 · 2025 과세기준일 · 지자체 2025.2.20. 등록 · 2023.3. 임대개시 */
const BASE: RentalExclusionInput = {
  ...NA8_NOT_APPLICABLE,
  registrationType: "private_purchase_long",
  rentalRegistrationDate: d("2025-02-20"),
  rentalApplicationDate: d("2025-02-15"),
  businessRegistrationDate: d("2025-02-20"),
  rentalStartDate: d("2023-03-01"),
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
const vac = (evict: string, over: Partial<RentalExclusionInput> = {}) =>
  run({ rentalVacantAtAssessment: true, vacancyEvictionDate: d(evict), ...over });

describe("A12 — 과세기준일 현재 공실 2년", () => {
  it("A12-1 ★ 퇴거 2023-06-01 → 만료 2025-06-01 당일 · 성립 + 경고", () => {
    const r = vac("2023-06-01");
    expect(r.isExcluded).toBe(true);
    expect(r.warnings).toEqual([E.VACANCY_WITHIN_2Y_WARNING]);
  });
  it("A12-2 ★ 퇴거 2023-05-30 → 불성립", () => {
    expect(vac("2023-05-30").failReasons).toEqual([E.VACANCY_OVER_2Y]);
  });
  it("A12-3 퇴거 2023-05-31(만료 2025-05-31 토요일) → 불성립 — 공휴일 연장 없음(V-4)", () => {
    expect(vac("2023-05-31").failReasons).toEqual([E.VACANCY_OVER_2Y]);
  });
  it("A12-4 퇴거일 빈칸 · 과세기준일 뒤 · 임대개시일 앞 → 불성립", () => {
    expect(run({ rentalVacantAtAssessment: true }).failReasons).toEqual([E.VACANCY_EVICTION_DATE_MISSING]);
    expect(vac("2025-06-02").failReasons).toEqual([E.VACANCY_EVICTION_DATE_INVALID]);
    expect(vac("2023-02-28").failReasons).toEqual([E.VACANCY_EVICTION_DATE_INVALID]);
  });
  it("Q-5 a 공실이면 5% 비교 안 함 — 남은 직전 임대료가 10% 낮아도 성립", () => {
    const r = vac("2024-12-01", { isInitialContract: false, previousRent: 900_000, currentRent: 1_000_000 });
    expect(r.isExcluded).toBe(true);
  });
  it("공실 아님(토글 OFF)은 불변 · 4·9호는 공실 값을 보지 않는다", () => {
    expect(run({ vacancyEvictionDate: d("2020-01-01") }).isExcluded).toBe(true);
    const ho4 = run({ registrationType: "vacant_construction", rentalVacantAtAssessment: true });
    expect(ho4.failReasons ?? []).not.toContain(E.VACANCY_EVICTION_DATE_MISSING);
  });
});
