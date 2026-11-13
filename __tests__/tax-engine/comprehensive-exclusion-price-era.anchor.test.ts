/**
 * anchor — 종부령 §3①1호·7호 가목 건설임대 6억/9억 적용례(대통령령 제31447호 부칙 제2조, 2022.8.2. 개정).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-price-cap-eras.plan.md §4-1 (Q-2 a · Q-3 a).
 * 실측(2026-11-13 probe, 변경 전): 2018 등록 민간건설·2020 사용승인 공공건설 7억이 2021~2024 모두 성립(6억 대상).
 */
import { describe, it, expect } from "vitest";
import { validateRentalExclusion } from "@/lib/tax-engine/comprehensive-exclusion";
import { COMPREHENSIVE_EXCL as E } from "@/lib/tax-engine/legal-codes";
import type { RentalExclusionInput } from "@/lib/tax-engine/types/comprehensive.types";
import { NA8_NOT_APPLICABLE } from "./_helpers/comprehensive-8na-not-applicable";

const d = (s: string) => new Date(s);
const BASE: RentalExclusionInput = {
  registrationType: "public_construction",
  ...NA8_NOT_APPLICABLE,
  rentalRegistrationDate: d("2018-01-10"),
  businessRegistrationDate: d("2018-01-10"),
  rentalStartDate: d("2018-02-01"),
  assessedValue: 700_000_000,
  area: 84,
  location: "metro",
  currentRent: 1_000_000,
  isInitialContract: true,
  assessmentDate: d("2023-06-01"),
};
const v = (over: Partial<RentalExclusionInput>) => validateRentalExclusion({ ...BASE, ...over });

describe("2022~2024 — 사용승인일로 6억/9억", () => {
  it("★ 공공건설 7억 · 사용승인 2020 → 불성립(6억) + 사유", () => {
    const r = v({ usageApprovalDate: d("2020-05-01") });
    expect(r.isExcluded).toBe(false);
    expect(r.failReasons).toEqual([E.PRICE_EXCEEDED, E.BUILT_PRICE_CAP_6EOK_PRE_20210217]);
  });
  it("경계 — 사용승인 2021-02-16 → 6억 · 2021-02-17 → 9억(당일 포함)", () => {
    expect(v({ usageApprovalDate: d("2021-02-16") }).isExcluded).toBe(false);
    expect(v({ usageApprovalDate: d("2021-02-17") }).isExcluded).toBe(true);
  });
  it("★ 사용승인일 모름 → 6억 + 확인 필요", () => {
    expect(v({}).failReasons).toEqual([E.PRICE_EXCEEDED, E.USAGE_APPROVAL_DATE_UNKNOWN]);
  });
  it("민간건설(1호)·공공지원 건설(7호)도 2022 이후는 사용승인일", () => {
    expect(v({ registrationType: "private_construction", usageApprovalDate: d("2020-01-01") }).failReasons).toContain(
      E.BUILT_PRICE_CAP_6EOK_PRE_20210217,
    );
    expect(v({ registrationType: "public_support_construction", usageApprovalDate: d("2022-01-01") }).isExcluded).toBe(true);
  });
  it("6억 이하면 사용승인일 없이도 성립", () => {
    expect(v({ assessedValue: 600_000_000 }).isExcluded).toBe(true);
  });
});

describe("2021 과세연도", () => {
  const y21 = { assessmentDate: d("2021-06-01") };
  it("민간건설은 등록일 — 2021-02-17 등록 → 9억 · 2018 등록 → 6억(사용승인일 무관)", () => {
    expect(v({ ...y21, registrationType: "private_construction", rentalRegistrationDate: d("2021-02-17"), businessRegistrationDate: d("2018-01-10") }).failReasons ?? []).not.toContain(
      E.PRICE_EXCEEDED,
    );
    expect(
      v({ ...y21, registrationType: "private_construction", usageApprovalDate: d("2022-01-01") }).failReasons,
    ).toContain(E.BUILT_PRICE_CAP_6EOK_PRE_20210217);
  });
  it("공공건설은 2021에도 사용승인일", () => {
    expect(v({ ...y21, usageApprovalDate: d("2021-03-01") }).isExcluded).toBe(true);
    expect(v({ ...y21 }).failReasons).toContain(E.USAGE_APPROVAL_DATE_UNKNOWN);
  });
});

describe("2020 이하 · 2025 이후", () => {
  it("2020 과세연도 → 6억(9억 개정 전)", () => {
    expect(v({ assessmentDate: d("2020-06-01"), usageApprovalDate: d("2022-01-01") }).failReasons).toContain(
      E.BUILT_PRICE_CAP_6EOK_PRE_20210217,
    );
  });
  it("2025 이후 → 사용승인일 무관 9억(Q-3 a)", () => {
    expect(v({ assessmentDate: d("2025-06-01") }).isExcluded).toBe(true);
    expect(v({ assessmentDate: d("2026-06-01"), usageApprovalDate: d("2019-01-01") }).isExcluded).toBe(true);
  });
  it("매입(2·8호)·단기 건설(10호)은 이 적용례 대상 아님", () => {
    expect(v({ registrationType: "public_purchase", assessedValue: 590_000_000 }).isExcluded).toBe(true);
    expect(v({ registrationType: "private_short_term_6y_construction", assessmentDate: d("2026-06-01"), assessedValue: 590_000_000, isApartment: false }).failReasons ?? []).not.toContain(
      E.USAGE_APPROVAL_DATE_UNKNOWN,
    );
  });
});
