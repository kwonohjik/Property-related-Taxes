/**
 * anchor — 종부령 §3① 각 호 외의 부분 「과세기준일 현재 「소득세법」 제168조 또는 「법인세법」 제111조에 따른 사업자등록(…)을 한 자」
 * + 후단 「… 보유현황 신고기간 종료일까지 임대사업자로서 사업자등록을 하는 경우에는 … 과세기준일 현재 … 사업자등록을 한 것으로 본다」(T-13).
 *
 * - 세무서 등록일 > 그해 9.30.(토요일·공휴일이면 다음 날 · 민법 §161) → 불성립 · 6.2.~9.30. → 성립(문언 의제 · 경고 없음 · Q-2 a)
 * - 비면 「모름」=불성립(Q-3 a) · 1·2호는 2018.2.13. 이후 과세연도에 단서(`regCap2018Issue`)가 이미 보므로 건너뜀(이중 보고 방지)
 * - 10·11호는 2026 과세기준일부터(PR-1 지자체 등록 기한과 같은 경계)
 * 실측(변경 전 교재 대조 probe P12): 8호 세무서 등록일은 결과에 영향 없음(2026.1.10.이어도 성립).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-input-gaps-4.plan.md §3.1·§4 A13
 */
import { describe, it, expect } from "vitest";
import { validateRentalExclusion } from "@/lib/tax-engine/comprehensive-exclusion";
import { COMPREHENSIVE_EXCL as E } from "@/lib/tax-engine/legal-codes";
import type { RentalExclusionInput } from "@/lib/tax-engine/types/comprehensive.types";
import { NA8_NOT_APPLICABLE } from "./_helpers/comprehensive-8na-not-applicable";

const d = (s: string) => new Date(s);
/** 8호 장기일반 민간매입 · 2025 과세기준일 · 지자체 2025.2.20. 등록 · 2025.3. 임대개시 */
const BASE: RentalExclusionInput = {
  ...NA8_NOT_APPLICABLE,
  registrationType: "private_purchase_long",
  rentalRegistrationDate: d("2025-02-20"),
  rentalApplicationDate: d("2025-02-15"),
  businessRegistrationDate: d("2025-02-20"),
  rentalStartDate: d("2025-03-01"),
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

describe("A13 — 세무서 사업자등록 기한", () => {
  it("A13-1 과세기준일 전 등록 → 성립 · 경고 없음(불변)", () => {
    const r = run({});
    expect(r.isExcluded).toBe(true);
    expect(r.warnings).toBeUndefined();
  });
  it("A13-2 ★ 6.2.~9.30. 등록 → 성립 · 경고 없음(문언 의제)", () => {
    for (const s of ["2025-06-02", "2025-09-30"]) {
      const r = run({ businessRegistrationDate: d(s) });
      expect(r.isExcluded).toBe(true);
      expect(r.warnings).toBeUndefined();
    }
  });
  it("A13-3 ★ 9.30. 뒤 등록 → 불성립", () => {
    expect(run({ businessRegistrationDate: d("2025-10-01") }).failReasons).toEqual([E.BUSINESS_REGISTERED_AFTER_FILING_DEADLINE]);
  });
  it("A13-4 2023 — 9.30.(토)·10.1.(일)·10.2.(월 임시공휴일)·10.3.(개천절) 뒤 10.4.까지 · 10.5. 불성립", () => {
    const y23 = { assessmentDate: d("2023-06-01"), rentalRegistrationDate: d("2023-02-20"), rentalStartDate: d("2023-03-01") };
    expect(run({ ...y23, businessRegistrationDate: d("2023-10-04") }).isExcluded).toBe(true);
    expect(run({ ...y23, businessRegistrationDate: d("2023-10-05") }).failReasons).toEqual([
      E.BUSINESS_REGISTERED_AFTER_FILING_DEADLINE,
    ]);
  });
  it("A13-5 ★ 빈칸 → 불성립(모름) · 7호·6호·10호(2026)도 같다", () => {
    expect(run({ businessRegistrationDate: undefined }).failReasons).toEqual([E.BUSINESS_REGISTRATION_DATE_MISSING]);
    expect(
      run({ registrationType: "public_support_construction", qualifyingUnitCount: 2, businessRegistrationDate: undefined }).failReasons,
    ).toContain(E.BUSINESS_REGISTRATION_DATE_MISSING);
  });
  it("A13-6 1·2호 2018.2.13. 이후 과세연도 — 단서 사유 하나만(이중 보고 없음)", () => {
    const ho2 = { registrationType: "private_purchase_short" as const, rentalRegistrationDate: d("2017-03-01"), rentalStartDate: d("2017-04-01") };
    expect(run({ ...ho2, businessRegistrationDate: d("2018-05-01") }).failReasons).toEqual([E.REGISTERED_AFTER_2018_03_31]);
    expect(run({ ...ho2, businessRegistrationDate: undefined }).failReasons).toEqual([E.BUSINESS_REGISTRATION_DATE_UNKNOWN]);
  });
  it("A13-7 11호 2025는 보지 않는다 · 2026부터 본다", () => {
    const h11 = {
      registrationType: "private_short_term_6y_purchase" as const,
      rentalRegistrationDate: d("2025-07-01"),
      rentalStartDate: d("2024-01-01"),
      isApartment: false,
      businessRegistrationDate: undefined,
    };
    expect(run(h11).failReasons ?? []).not.toContain(E.BUSINESS_REGISTRATION_DATE_MISSING);
    expect(run({ ...h11, assessmentDate: d("2026-06-01") }).failReasons).toContain(E.BUSINESS_REGISTRATION_DATE_MISSING);
  });
  it("공공·3·4·5·9호는 보지 않는다(Q-1 a)", () => {
    for (const t of ["public_construction", "public_purchase", "existing_rental", "vacant_construction", "reit_purchase", "public_conversion_pending"] as const) {
      expect(run({ registrationType: t, businessRegistrationDate: undefined }).failReasons ?? []).not.toContain(
        E.BUSINESS_REGISTRATION_DATE_MISSING,
      );
    }
  });
});
