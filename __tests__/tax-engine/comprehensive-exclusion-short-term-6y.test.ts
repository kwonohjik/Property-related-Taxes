/**
 * 단기민간임대주택(6년형) 합산배제 anchor — 종부세령 §3①10호(건설)·11호(매입)
 *
 * 가격기준: 건설 6억(수도권 무관, 법령 본문 확정) /
 *           매입 수도권 4억·비수도권 2억 (한국세정신문·세무해설 2차 확인 — 법령 표 원문 최종 대조 권장)
 * 면적: 건설 149㎡ 이하 / 매입 면적조건 없음
 * 의무기간: 6년
 */
import { describe, it, expect } from "vitest";
import { validateRentalExclusion } from "@/lib/tax-engine/comprehensive-exclusion";
import type { RentalExclusionInput } from "@/lib/tax-engine/types/comprehensive.types";

const base = (over: Partial<RentalExclusionInput>): RentalExclusionInput => ({
  registrationType: "private_short_term_6y_construction",
  rentalRegistrationDate: new Date("2025-01-01"),
  rentalStartDate: new Date("2025-01-01"),
  assessedValue: 500_000_000,
  area: 100,
  location: "metro",
  currentRent: 1_000_000,
  isInitialContract: true,
  assessmentDate: new Date("2026-06-01"),
  ...over,
});

describe("단기민간임대주택(6년) 합산배제 — 건설 §3①10호", () => {
  it("#1 적격 (100㎡·수도권 5억·7년)", () => {
    expect(validateRentalExclusion(base({ actualRentalYears: 7 })).isExcluded).toBe(true);
  });
  it("#2 가격초과 (6.5억)", () => {
    expect(validateRentalExclusion(base({ assessedValue: 650_000_000 })).isExcluded).toBe(false);
  });
  it("#3 면적초과 (150㎡)", () => {
    expect(validateRentalExclusion(base({ area: 150 })).isExcluded).toBe(false);
  });
  it("#4 면적경계 (149㎡ 이하 OK)", () => {
    expect(validateRentalExclusion(base({ area: 149 })).isExcluded).toBe(true);
  });
  it("#6 의무기간 6년 미충족 → 배제 유지 + 경고", () => {
    const r = validateRentalExclusion(base({ actualRentalYears: 4 }));
    expect(r.isExcluded).toBe(true);
    expect(r.warnings && r.warnings.length).toBeGreaterThan(0);
  });
  it("#7 말소(과세기준일 이전) → 거부", () => {
    expect(
      validateRentalExclusion(base({ registrationRevokedDate: new Date("2026-03-01") })).isExcluded,
    ).toBe(false);
  });
});

describe("단기민간임대주택(6년) 합산배제 — 매입 §3①11호", () => {
  const purchase = (over: Partial<RentalExclusionInput>) =>
    base({ registrationType: "private_short_term_6y_purchase", ...over });

  it("#5 면적 무관 + 수도권 4억 이하 (200㎡·3.5억)", () => {
    expect(validateRentalExclusion(purchase({ area: 200, assessedValue: 350_000_000 })).isExcluded).toBe(true);
  });
  it("#5b 수도권 가격초과 (4.5억)", () => {
    expect(validateRentalExclusion(purchase({ assessedValue: 450_000_000 })).isExcluded).toBe(false);
  });
  it("#5c 비수도권 경계 (2억 이하 OK)", () => {
    expect(
      validateRentalExclusion(purchase({ location: "non_metro", assessedValue: 200_000_000 })).isExcluded,
    ).toBe(true);
  });
  it("#5d 비수도권 초과 (2.5억)", () => {
    expect(
      validateRentalExclusion(purchase({ location: "non_metro", assessedValue: 250_000_000 })).isExcluded,
    ).toBe(false);
  });
});
