/**
 * anchor — 가격 요건 판정 기준 공시가격(T-03) — 엔진 `validateRentalExclusion` · `rentalPriceCap` · `priceBasisApplies`.
 * 1·7호 가목 「2호 이상의 주택의 임대를 개시한 날(…) 또는 최초로 제9항에 따른 합산배제신고를 한 연도의 과세기준일을 기준으로 하여」.
 * 화면 경로·세액은 __tests__/api/comprehensive.route.price-basis.anchor.test.ts.
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-tax-defects-3.plan.md §3 A03-6·A03-8
 */
import { describe, it, expect } from "vitest";
import { validateRentalExclusion, rentalPriceCap, priceBasisApplies } from "@/lib/tax-engine/comprehensive-exclusion";
import { COMPREHENSIVE_EXCL as E } from "@/lib/tax-engine/legal-codes";
import type { RentalExclusionInput } from "@/lib/tax-engine/types/comprehensive.types";
import { NA8_NOT_APPLICABLE } from "./_helpers/comprehensive-8na-not-applicable";

const d = (s: string) => new Date(s);
/** 7호 공공지원 건설 · 2023 과세연도 · 사용승인 2020 → 상한 6억(부칙<제31447호> §2) */
const BASE: RentalExclusionInput = {
  qualifyingUnitCount: 2,
  registrationType: "public_support_construction",
  ...NA8_NOT_APPLICABLE,
  rentalRegistrationDate: d("2020-01-10"),
  rentalStartDate: d("2020-02-01"),
  usageApprovalDate: d("2020-01-01"),
  assessedValue: 700_000_000,
  area: 84,
  location: "metro",
  currentRent: 1_000_000,
  isInitialContract: true,
  assessmentDate: d("2023-06-01"),
};
const v = (over: Partial<RentalExclusionInput>) => validateRentalExclusion({ ...BASE, ...over });

describe("엔진 — 기준 공시가격으로 판정", () => {
  it("A03-6 ★ 7호 2023 · 사용승인 2020(6억) · 그해 7억 · 기준 5억 → 성립", () => {
    expect(v({}).isExcluded).toBe(false);
    expect(v({ priceBasisValue: 500_000_000 }).isExcluded).toBe(true);
  });
  it("경계 — 기준 6억(상한과 같음) 성립 · 600,000,001원 불성립 + 판정값과 6억 사유", () => {
    expect(v({ priceBasisValue: 600_000_000 }).isExcluded).toBe(true);
    expect(v({ priceBasisValue: 600_000_001 }).failReasons).toEqual([
      E.PRICE_EXCEEDED,
      E.BUILT_PRICE_CAP_6EOK_PRE_20210217,
      `가격 판정: 600,000,001원 — ${E.PRICE_JUDGED_BY_BASIS}`,
    ]);
  });
  it("기준 0원은 입력 안 함 — 그해 공시가격으로 판정", () => {
    expect(v({ priceBasisValue: 0 }).isExcluded).toBe(false);
  });
  it("A03-8 3호(2005년도 가격)·4호(신고 연도 현재)는 기준 칸을 보지 않는다", () => {
    const ho3 = v({ registrationType: "existing_rental", assessedValue: 400_000_000, priceBasisValue: 200_000_000 });
    expect(ho3.failReasons).toContain(E.PRICE_EXCEEDED);
    expect(ho3.failReasons?.some((r) => r.startsWith("가격 판정:"))).toBe(false);
    const ho4 = v({ registrationType: "vacant_construction", assessedValue: 1_000_000_000, priceBasisValue: 500_000_000 });
    expect(ho4.failReasons).toContain(E.PRICE_EXCEEDED);
  });
  it("9호는 바탕 유형으로 — 공공매입 수도권 7억 · 기준 5억 → 가격 사유 없음", () => {
    const r = v({
      registrationType: "public_conversion_pending",
      conversionBase: "purchase",
      priceBasisValue: 500_000_000,
    });
    expect(r.failReasons ?? []).not.toContain(E.PRICE_EXCEEDED);
  });
});

describe("rentalPriceCap · priceBasisApplies — 화면 술어가 쓰는 공개 함수", () => {
  const cap = (over: Partial<RentalExclusionInput>) => rentalPriceCap({ ...BASE, ...over });
  it("상한은 엔진 판정과 같다 — 7호 6억/9억 · 8호 수도권 6억 · 30호 9억 · 9호 바탕 모름 Infinity", () => {
    expect(cap({})).toBe(600_000_000);
    expect(cap({ usageApprovalDate: d("2022-01-01") })).toBe(900_000_000);
    expect(cap({ registrationType: "private_purchase_long" })).toBe(600_000_000);
    expect(cap({ registrationType: "private_purchase_long", isThirtyPlusUnits: true, assessmentDate: d("2025-06-01") })).toBe(900_000_000);
    expect(cap({ registrationType: "public_conversion_pending", conversionBase: undefined })).toBe(Infinity);
    expect(cap({ registrationType: "public_conversion_pending", conversionBase: "purchase" })).toBe(600_000_000);
  });
  it("대상 유형 — 1·2·6·7·8·10·11호 · 3·4·5·9호(원 유형) 제외", () => {
    for (const t of [
      "private_construction",
      "public_construction",
      "private_purchase_short",
      "public_purchase",
      "unsold_purchase",
      "public_support_construction",
      "private_purchase_long",
      "public_support_purchase",
      "private_short_term_6y_construction",
      "private_short_term_6y_purchase",
    ])
      expect(priceBasisApplies(t)).toBe(true);
    for (const t of ["existing_rental", "vacant_construction", "reit_purchase", "public_conversion_pending"])
      expect(priceBasisApplies(t)).toBe(false);
  });
});
