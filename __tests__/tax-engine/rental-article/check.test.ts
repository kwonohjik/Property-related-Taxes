/**
 * 공용 canonical predicate checkRentalArticle 직접 anchor (Phase 2 C2).
 * §155⑳·다주택이 공유하는 목별 판정 — failCodes 다중 수집·rules 상수 위임 검증.
 */
import { describe, it, expect } from "vitest";
import {
  checkRentalArticle,
  isApartmentRestrictedForArticle,
  isConstructionArticle,
  type NormalizedRentalUnit,
} from "@/lib/tax-engine/rental-article/check";

const base = (o: Partial<NormalizedRentalUnit> = {}): NormalizedRentalUnit => ({
  effectiveRegDate: new Date("2019-01-01"),
  isCapitalArea: true,
  isApartment: false,
  rentalStartOfficialPrice: 300_000_000,
  rentalYears: 12,
  landAreaM2: undefined,
  totalFloorAreaM2: undefined,
  hasMinimum2Units: false,
  isRegulatedAreaNewAcq: false,
  rentIncreaseUnder5Pct: true,
  ...o,
});

describe("checkRentalArticle — 목별 판정", () => {
  it("가목 6억 이하·5년 충족 → passed", () => {
    const r = checkRentalArticle("가", base({ rentalStartOfficialPrice: 600_000_000, rentalYears: 5 }));
    expect(r.passed).toBe(true);
    expect(r.requiredYears).toBe(5);
    expect(r.stdPriceCap).toBe(600_000_000);
  });

  it("마목 2020.8.18 등록 → 의무 10년·cap 6억(수도권)", () => {
    const r = checkRentalArticle("마", base({ effectiveRegDate: new Date("2020-08-18"), rentalYears: 9 }));
    expect(r.requiredYears).toBe(10);
    expect(r.failCodes).toContain("RENTAL_PERIOD_SHORT");
    expect(r.passed).toBe(false);
  });

  it("바목 F5: 2024등록 7억 → 6억 cap 초과 배제 / 2025.3등록 → 9억 통과", () => {
    const pre = checkRentalArticle("바", base({
      effectiveRegDate: new Date("2024-01-01"), rentalStartOfficialPrice: 700_000_000,
      rentalYears: 10, landAreaM2: 200, totalFloorAreaM2: 140, hasMinimum2Units: true,
    }));
    expect(pre.failCodes).toContain("STANDARD_PRICE_EXCEEDED");
    const post = checkRentalArticle("바", base({
      effectiveRegDate: new Date("2025-03-01"), rentalStartOfficialPrice: 700_000_000,
      rentalYears: 10, landAreaM2: 200, totalFloorAreaM2: 140, hasMinimum2Units: true,
    }));
    expect(post.passed).toBe(true);
  });

  it("아목 4억 초과·조정신규취득 → 다중 failCodes 수집", () => {
    const r = checkRentalArticle("아", base({
      effectiveRegDate: new Date("2025-07-01"), rentalStartOfficialPrice: 500_000_000,
      rentalYears: 6, isRegulatedAreaNewAcq: true,
    }));
    expect(r.passed).toBe(false);
    expect(r.failCodes).toEqual(expect.arrayContaining(["STANDARD_PRICE_EXCEEDED", "SHORT_TERM_REGULATED"]));
  });

  it("건설(자목) 면적 미입력 → SIZE_REQUIRED·MIN_UNITS_NOT_MET", () => {
    const r = checkRentalArticle("자", base({
      effectiveRegDate: new Date("2025-07-01"), rentalStartOfficialPrice: 300_000_000, rentalYears: 6,
    }));
    expect(r.failCodes).toEqual(expect.arrayContaining(["SIZE_REQUIRED", "MIN_UNITS_NOT_MET"]));
  });

  it("등록 미완비(effectiveRegDate null) → BOTH_REG_REQUIRED", () => {
    expect(checkRentalArticle("가", base({ effectiveRegDate: null })).failCodes).toContain("BOTH_REG_REQUIRED");
  });

  it("F6: 바목 아파트 → 제한 아님 / 아목 아파트 → 제한", () => {
    expect(isApartmentRestrictedForArticle("바", new Date("2021-01-01"), true)).toBe(false);
    expect(isApartmentRestrictedForArticle("아", new Date("2025-07-01"), true)).toBe(true);
    expect(isApartmentRestrictedForArticle("마", new Date("2020-08-18"), true)).toBe(true);
    expect(isApartmentRestrictedForArticle("마", new Date("2020-07-10"), true)).toBe(false);
  });

  it("isConstructionArticle — 다·바·자만 true", () => {
    expect(["다", "바", "자"].every((a) => isConstructionArticle(a as never))).toBe(true);
    expect(["가", "마", "아", "구법"].some((a) => isConstructionArticle(a as never))).toBe(false);
  });
});
