/**
 * 종부령 §3①4호(미임대 민간건설임대 · 소유)·5호(부동산투자회사 2008 취득 매입임대)·9호(분양전환공공임대 만료 후 · 소유) anchor.
 * 판정: lib/tax-engine/comprehensive-exclusion-{4,5,9}ho.ts + comprehensive-exclusion.ts 공통(면적·가격·임대료·임대 개시·말소).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-4-5-9ho-types.plan.md §4 (Q 권장안 a)
 */
import { describe, it, expect } from "vitest";
import { validateRentalExclusion } from "@/lib/tax-engine/comprehensive-exclusion";
import { COMPREHENSIVE_EXCL as E } from "@/lib/tax-engine/legal-codes";
import type { RentalExclusionInput } from "@/lib/tax-engine/types/comprehensive.types";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("4호 미임대 민간건설임대", () => {
  /** 2022 등록(2018.3.31. 뒤) · 사용승인 2024-03-01 · 미임대 · 120㎡ · 8억 · 임대개시일은 과세기준일 뒤(소유라 보지 않는다) */
  const BASE: RentalExclusionInput = {
    registrationType: "vacant_construction",
    rentalRegistrationDate: d("2022-03-01"),
    usageApprovalDate: d("2024-03-01"),
    neverRentedSinceApproval: true,
    rentalStartDate: d("2026-01-01"),
    assessedValue: 800_000_000,
    area: 120,
    location: "metro",
    currentRent: 0,
    isInitialContract: true,
    assessmentDate: d("2025-06-01"),
  };
  const v = (over: Partial<RentalExclusionInput>) => validateRentalExclusion({ ...BASE, ...over });

  it("★ 성립 — 2018.3.31. 단서·임대개시·임대료·2호 이상을 보지 않는다", () => {
    const r = v({ previousRent: 1_000_000, currentRent: 1_500_000, isInitialContract: false });
    expect(r.failReasons).toBeUndefined();
    expect(r.reason).toBe(E.VACANT_CONSTRUCTION_RENTAL);
  });
  it("임대된 사실 있음 · 모름 → 불성립", () => {
    expect(v({ neverRentedSinceApproval: false }).failReasons).toEqual([E.VACANT_4HO_RENTED]);
    expect(v({ neverRentedSinceApproval: null }).failReasons).toEqual([E.VACANT_4HO_RENTED_UNKNOWN]);
  });
  it("★ 2년 경계 — 사용승인일 + 2년 당일까지 성립, 하루 넘으면 불성립", () => {
    expect(v({ usageApprovalDate: d("2023-06-01") }).isExcluded).toBe(true);
    expect(v({ usageApprovalDate: d("2023-05-31") }).failReasons).toEqual([E.VACANT_4HO_OVER_2Y]);
  });
  it("사용승인일 모름 → 불성립 + 확인 필요(가격도 6억으로 봄)", () => {
    const r = v({ usageApprovalDate: undefined });
    expect(r.failReasons).toEqual([E.VACANT_4HO_APPROVAL_UNKNOWN, E.PRICE_EXCEEDED, E.USAGE_APPROVAL_DATE_UNKNOWN]);
  });
  it("★ 나목 9억/6억 — 2022년분 사용승인 2021.2.17. 전이면 6억(부칙<제31447호> §2)", () => {
    const y22 = { assessmentDate: d("2022-06-01") };
    expect(v({ ...y22, usageApprovalDate: d("2021-02-16") }).failReasons).toEqual([
      E.PRICE_EXCEEDED,
      E.BUILT_PRICE_CAP_6EOK_PRE_20210217,
    ]);
    expect(v({ ...y22, usageApprovalDate: d("2021-02-17") }).isExcluded).toBe(true);
    // 2021년분 민간건설은 등록일 기준(사용승인 2020이어도 등록이 2.17. 이후면 9억)
    const y21 = { assessmentDate: d("2021-06-01"), usageApprovalDate: d("2020-01-01") };
    expect(v({ ...y21, rentalRegistrationDate: d("2021-02-17") }).isExcluded).toBe(true);
    expect(v({ ...y21, rentalRegistrationDate: d("2021-02-16") }).failReasons).toEqual([
      E.PRICE_EXCEEDED,
      E.BUILT_PRICE_CAP_6EOK_PRE_20210217,
    ]);
    expect(v({ assessedValue: 900_000_001 }).failReasons).toEqual([E.PRICE_EXCEEDED]);
  });
  it("면적 149㎡ 초과 · 등록 말소 → 불성립", () => {
    expect(v({ area: 149.01 }).failReasons).toEqual([E.AREA_EXCEEDED_149]);
    expect(v({ registrationRevokedDate: d("2025-01-01") }).failReasons).toEqual([E.MANDATORY_PERIOD_NOT_MET]);
  });
});

describe("5호 부동산투자회사 2008 취득 매입임대", () => {
  /** 2008-05-01 취득 · 5호 · 2008 공시가격 6억 이하 · 비수도권 · 100㎡ · 현재 공시가격 9억(보지 않는다) */
  const BASE: RentalExclusionInput = {
    registrationType: "reit_purchase",
    reitAcquisitionDate: d("2008-05-01"),
    reitRental5hoCount: 5,
    reitPrice2008Under6eok: true,
    rentalRegistrationDate: d("2008-05-01"),
    rentalStartDate: d("2008-06-01"),
    assessedValue: 900_000_000,
    area: 100,
    location: "non_metro",
    currentRent: 1_000_000,
    isInitialContract: true,
    assessmentDate: d("2025-06-01"),
  };
  const v = (over: Partial<RentalExclusionInput>) => validateRentalExclusion({ ...BASE, ...over });

  it("★ 성립 — 현재 공시가격·임대료 증가율은 보지 않는다", () => {
    const r = v({ previousRent: 1_000_000, currentRent: 1_200_000, isInitialContract: false });
    expect(r.failReasons).toBeUndefined();
    expect(r.reason).toBe(E.REIT_PURCHASE_RENTAL);
  });
  it("★ 취득일 2008.1.1.~12.31. 경계 · 모름", () => {
    expect(v({ reitAcquisitionDate: d("2008-01-01") }).isExcluded).toBe(true);
    expect(v({ reitAcquisitionDate: d("2008-12-31") }).isExcluded).toBe(true);
    expect(v({ reitAcquisitionDate: d("2007-12-31") }).failReasons).toEqual([E.REIT_5HO_NOT_2008]);
    expect(v({ reitAcquisitionDate: d("2009-01-01") }).failReasons).toEqual([E.REIT_5HO_NOT_2008]);
    expect(v({ reitAcquisitionDate: undefined }).failReasons).toEqual([E.REIT_5HO_ACQ_UNKNOWN]);
  });
  it("5호 이상 · 2008 공시가격 · 수도권 · 면적", () => {
    expect(v({ reitRental5hoCount: 4 }).failReasons).toEqual([E.REIT_5HO_UNITS_UNDER_5]);
    expect(v({ reitRental5hoCount: undefined }).failReasons).toEqual([E.REIT_5HO_UNITS_UNKNOWN]);
    expect(v({ reitPrice2008Under6eok: false }).failReasons).toEqual([E.REIT_5HO_PRICE_2008_EXCEEDED]);
    expect(v({ reitPrice2008Under6eok: null }).failReasons).toEqual([E.REIT_5HO_PRICE_2008_UNKNOWN]);
    expect(v({ location: "metro" }).failReasons).toEqual([E.REIT_5HO_METRO]);
    expect(v({ area: 150 }).failReasons).toEqual([E.AREA_EXCEEDED_149]);
  });
  it("나목 10년 — 미달이면 경고만(성립 유지)", () => {
    const r = v({ actualRentalYears: 8 });
    expect(r.isExcluded).toBe(true);
    expect(r.warnings?.[0]).toContain("의무임대기간(10년)");
  });
});

describe("9호 분양전환공공임대 만료 후 2년", () => {
  /** 공공건설 바탕 · 만료일 2024-03-01 · 미전환 · 84㎡ · 5억 · 2025 과세 */
  const BASE: RentalExclusionInput = {
    registrationType: "public_conversion_pending",
    conversionBase: "construction",
    isConversionPublicRental: true,
    mandatoryPeriodEndDate: d("2024-03-01"),
    conversionCompleted: false,
    rentalRegistrationDate: d("2014-03-01"),
    rentalStartDate: d("2014-03-01"),
    assessedValue: 500_000_000,
    area: 84,
    location: "metro",
    currentRent: 1_000_000,
    isInitialContract: true,
    assessmentDate: d("2025-06-01"),
  };
  const v = (over: Partial<RentalExclusionInput>) => validateRentalExclusion({ ...BASE, ...over });

  it("★ 성립 — 임대 계속·등록 말소를 보지 않는다(소유)", () => {
    const r = v({ registrationRevokedDate: d("2024-04-01"), rentalStartDate: d("2026-01-01") });
    expect(r.failReasons).toBeUndefined();
    expect(r.reason).toBe(E.PUBLIC_CONVERSION_PENDING_RENTAL);
  });
  it("★ 2023년분부터(제33696호 부칙 §2) — 2022는 불성립", () => {
    expect(v({ assessmentDate: d("2022-06-01"), mandatoryPeriodEndDate: d("2021-03-01") }).failReasons).toEqual([
      E.CONV_9HO_NOT_IN_FORCE,
    ]);
    expect(v({ assessmentDate: d("2023-06-01"), mandatoryPeriodEndDate: d("2022-03-01") }).isExcluded).toBe(true);
  });
  it("★ 만료일 다음 날부터 2년 — 만료 + 2년 당일까지 · 만료 전 · 모름", () => {
    expect(v({ mandatoryPeriodEndDate: d("2023-06-01") }).isExcluded).toBe(true);
    expect(v({ mandatoryPeriodEndDate: d("2023-05-31") }).failReasons).toEqual([E.CONV_9HO_OVER_2Y]);
    expect(v({ mandatoryPeriodEndDate: d("2025-06-01") }).failReasons).toEqual([E.CONV_9HO_NOT_EXPIRED]);
    expect(v({ mandatoryPeriodEndDate: undefined }).failReasons).toEqual([E.CONV_9HO_END_UNKNOWN]);
  });
  it("분양전환공공임대 여부 · 분양전환 여부", () => {
    expect(v({ isConversionPublicRental: false }).failReasons).toEqual([E.CONV_9HO_NOT_CONVERSION]);
    expect(v({ isConversionPublicRental: null }).failReasons).toEqual([E.CONV_9HO_CONVERSION_UNKNOWN]);
    expect(v({ conversionCompleted: true }).failReasons).toEqual([E.CONV_9HO_CONVERTED]);
    expect(v({ conversionCompleted: null }).failReasons).toEqual([E.CONV_9HO_CONVERTED_UNKNOWN]);
  });
  it("★ 면적·가격·임대료는 바탕 유형(1호 공공건설 / 2호 공공매입)으로 — 구분 모르면 그것만 사유", () => {
    expect(v({ assessedValue: 900_000_001 }).failReasons).toEqual([E.PRICE_EXCEEDED]);
    expect(v({ area: 150 }).failReasons).toEqual([E.AREA_EXCEEDED_149]);
    // 2024년분 공공건설 · 사용승인 2020 → 6억(부칙<제31447호> §2) — 사유도 바탕 유형으로 붙는다
    expect(
      v({ assessmentDate: d("2024-06-01"), mandatoryPeriodEndDate: d("2023-03-01"), assessedValue: 700_000_000, usageApprovalDate: d("2020-01-01") })
        .failReasons,
    ).toEqual([E.PRICE_EXCEEDED, E.BUILT_PRICE_CAP_6EOK_PRE_20210217]);
    // 공공매입 수도권 6억 · 면적 무제한
    expect(v({ conversionBase: "purchase", assessedValue: 700_000_000 }).failReasons).toEqual([E.PRICE_EXCEEDED]);
    expect(v({ conversionBase: "purchase", area: 200 }).isExcluded).toBe(true);
    expect(v({ conversionBase: undefined, assessedValue: 2_000_000_000, area: 200 }).failReasons).toEqual([
      E.CONV_9HO_BASE_UNKNOWN,
    ]);
    expect(v({ previousRent: 1_000_000, currentRent: 1_080_000, isInitialContract: false }).failReasons).toEqual([
      E.RENT_INCREASE_EXCEEDED,
    ]);
  });
});
