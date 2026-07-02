/**
 * 종합부동산세 합산배제 전용면적 상한 anchor 테스트
 *
 * getAreaLimit 버그 수정 검증 (종부세 시행령 §3①):
 * - 건설임대(1·7·10호): 149㎡ 이하
 * - 매입임대(2·8·11호): 면적제한 없음
 * - 기존임대(3호, 2005 이전): 읍면 100㎡ / 그외 85㎡
 *
 * @see comprehensive-exclusion.ts getAreaLimit
 */

import { describe, it, expect } from "vitest";
import { validateRentalExclusion } from "@/lib/tax-engine/comprehensive-exclusion";
import { COMPREHENSIVE_EXCL } from "@/lib/tax-engine/legal-codes";
import type { RentalExclusionInput } from "@/lib/tax-engine/types/comprehensive.types";

const BASE: RentalExclusionInput = {
  registrationType: "private_construction",
  rentalRegistrationDate: new Date("2020-01-01"),
  rentalStartDate: new Date("2020-02-01"),
  assessedValue: 400_000_000,
  area: 85,
  location: "metro",
  currentRent: 1_000_000,
  isInitialContract: true,
  assessmentDate: new Date("2025-06-01"),
};

// ============================================================
// 건설임대 — 149㎡ 상한 (§3①1·7·10호)
// ============================================================

describe("건설임대 면적 상한 — 149㎡ (§3①1·7·10호)", () => {
  const CONSTRUCTION_TYPES: RentalExclusionInput["registrationType"][] = [
    "private_construction",
    "public_construction",
    "public_support_construction",
    "private_short_term_6y_construction",
  ];

  for (const registrationType of CONSTRUCTION_TYPES) {
    it(`${registrationType}: 149㎡ → 합산배제 (경계값 OK)`, () => {
      const result = validateRentalExclusion({ ...BASE, registrationType, area: 149 });
      expect(result.isExcluded).toBe(true);
      expect(result.failReasons ?? []).not.toContain(COMPREHENSIVE_EXCL.AREA_EXCEEDED);
      expect(result.failReasons ?? []).not.toContain(COMPREHENSIVE_EXCL.AREA_EXCEEDED_149);
    });

    it(`${registrationType}: 150㎡ → 면적초과 거부 (AREA_EXCEEDED_149)`, () => {
      const result = validateRentalExclusion({ ...BASE, registrationType, area: 150 });
      expect(result.isExcluded).toBe(false);
      expect(result.failReasons).toContain(COMPREHENSIVE_EXCL.AREA_EXCEEDED_149);
    });

    it(`${registrationType}: 86㎡ → 합산배제 (85㎡ 적용 안 됨)`, () => {
      // 건설임대는 85㎡ 제한이 없음 — 핵심 버그 수정 확인
      const result = validateRentalExclusion({ ...BASE, registrationType, area: 86 });
      // 면적 초과 failReason 없어야 함 (86 < 149)
      expect(result.failReasons ?? []).not.toContain(COMPREHENSIVE_EXCL.AREA_EXCEEDED);
      expect(result.failReasons ?? []).not.toContain(COMPREHENSIVE_EXCL.AREA_EXCEEDED_149);
    });
  }
});

// ============================================================
// 매입임대 — 면적제한 없음 (§3①2·8·11호)
// ============================================================

describe("매입임대 면적제한 없음 (§3①2·8·11호)", () => {
  const PURCHASE_TYPES: RentalExclusionInput["registrationType"][] = [
    "private_purchase_long",
    "private_purchase_short",
    "public_purchase",
    "public_support_purchase",
    "private_short_term_6y_purchase",
  ];

  // private_short_term_6y_purchase는 수도권 4억 초과 시 가격 초과 거부되므로 비수도권으로 테스트
  const getPriceForType = (t: string): { assessedValue: number; location: "metro" | "non_metro" } =>
    t === "private_short_term_6y_purchase"
      ? { assessedValue: 150_000_000, location: "non_metro" }
      : { assessedValue: 400_000_000, location: "metro" };

  for (const registrationType of PURCHASE_TYPES) {
    it(`${registrationType}: 200㎡ → 면적 초과 거부 없음 (면적제한 없음)`, () => {
      const priceOpts = getPriceForType(registrationType);
      const result = validateRentalExclusion({
        ...BASE,
        registrationType,
        area: 200,
        ...priceOpts,
      });
      expect(result.failReasons ?? []).not.toContain(COMPREHENSIVE_EXCL.AREA_EXCEEDED);
      expect(result.failReasons ?? []).not.toContain(COMPREHENSIVE_EXCL.AREA_EXCEEDED_149);
    });
  }
});

// ============================================================
// 기존임대 §3①3호 — 읍면 100㎡ / 그외 85㎡
// ============================================================

describe("기존임대주택 §3①3호 — 읍면 100㎡ / 그외 85㎡", () => {
  const BASE_EXISTING: RentalExclusionInput = {
    ...BASE,
    registrationType: "existing_rental",
    assessedValue: 200_000_000, // 2억 (기존임대 3억 이하 — price 격리, area만 검증)
    location: "metro",
  };

  // 비읍면 85㎡ 경계
  it("비읍면 85㎡ → 합산배제 (경계값 OK)", () => {
    const result = validateRentalExclusion({ ...BASE_EXISTING, area: 85, isEupMyeonArea: false });
    expect(result.failReasons ?? []).not.toContain(COMPREHENSIVE_EXCL.AREA_EXCEEDED);
    expect(result.reason).toBe(COMPREHENSIVE_EXCL.EXISTING_RENTAL);
  });

  it("비읍면 86㎡ → 면적초과 거부 (AREA_EXCEEDED)", () => {
    const result = validateRentalExclusion({ ...BASE_EXISTING, area: 86, isEupMyeonArea: false });
    expect(result.isExcluded).toBe(false);
    expect(result.failReasons).toContain(COMPREHENSIVE_EXCL.AREA_EXCEEDED);
  });

  // 읍면 100㎡ 경계
  it("읍면 100㎡ → 합산배제 (경계값 OK)", () => {
    const result = validateRentalExclusion({ ...BASE_EXISTING, area: 100, isEupMyeonArea: true });
    expect(result.failReasons ?? []).not.toContain(COMPREHENSIVE_EXCL.AREA_EXCEEDED);
    expect(result.reason).toBe(COMPREHENSIVE_EXCL.EXISTING_RENTAL);
  });

  it("읍면 101㎡ → 면적초과 거부 (AREA_EXCEEDED)", () => {
    const result = validateRentalExclusion({ ...BASE_EXISTING, area: 101, isEupMyeonArea: true });
    expect(result.isExcluded).toBe(false);
    expect(result.failReasons).toContain(COMPREHENSIVE_EXCL.AREA_EXCEEDED);
  });

  it("읍면 90㎡ → 합산배제 (비읍면 85㎡ 초과지만 읍면 기준 100㎡ 이하)", () => {
    const result = validateRentalExclusion({ ...BASE_EXISTING, area: 90, isEupMyeonArea: true });
    expect(result.failReasons ?? []).not.toContain(COMPREHENSIVE_EXCL.AREA_EXCEEDED);
    expect(result.reason).toBe(COMPREHENSIVE_EXCL.EXISTING_RENTAL);
  });

  // isEupMyeonArea 미입력 → false와 동일(85㎡ 적용)
  it("isEupMyeonArea 미입력 + 86㎡ → 면적초과 거부 (기본 85㎡)", () => {
    const { isEupMyeonArea: _, ...withoutFlag } = BASE_EXISTING;
    const result = validateRentalExclusion({ ...withoutFlag, area: 86 });
    expect(result.isExcluded).toBe(false);
    expect(result.failReasons).toContain(COMPREHENSIVE_EXCL.AREA_EXCEEDED);
  });

  // 법령 조문 확인
  it("기존임대 합산배제 법령 조문 — EXISTING_RENTAL", () => {
    const result = validateRentalExclusion({ ...BASE_EXISTING, area: 80 });
    expect(result.reason).toBe(COMPREHENSIVE_EXCL.EXISTING_RENTAL);
  });
});

// ============================================================
// 공공지원민간임대 분리 — 건설(149㎡) vs 매입(면적제한 없음)
// ============================================================

describe("공공지원민간임대 분리 — 건설(§7호) vs 매입(§8호)", () => {
  const BASE_PUBLIC_SUPPORT: RentalExclusionInput = {
    ...BASE,
    assessedValue: 500_000_000,  // 5억 (매입 수도권 6억·건설 9억 이하 — price 격리, area만 검증)
    location: "metro",
  };

  it("공공지원_건설: 149㎡ → 합산배제", () => {
    const result = validateRentalExclusion({
      ...BASE_PUBLIC_SUPPORT,
      registrationType: "public_support_construction",
      area: 149,
    });
    expect(result.isExcluded).toBe(true);
    expect(result.reason).toBe(COMPREHENSIVE_EXCL.PUBLIC_SUPPORT_CONSTRUCTION_RENTAL);
  });

  it("공공지원_건설: 150㎡ → 면적초과 거부", () => {
    const result = validateRentalExclusion({
      ...BASE_PUBLIC_SUPPORT,
      registrationType: "public_support_construction",
      area: 150,
    });
    expect(result.isExcluded).toBe(false);
    expect(result.failReasons).toContain(COMPREHENSIVE_EXCL.AREA_EXCEEDED_149);
  });

  it("공공지원_매입: 200㎡ → 합산배제 (면적제한 없음)", () => {
    const result = validateRentalExclusion({
      ...BASE_PUBLIC_SUPPORT,
      registrationType: "public_support_purchase",
      area: 200,
    });
    expect(result.isExcluded).toBe(true);
    expect(result.reason).toBe(COMPREHENSIVE_EXCL.PUBLIC_SUPPORT_PURCHASE_RENTAL);
  });

  // 가격기준 공통: 수도권 9억
  it("공공지원_건설: 9억(수도권) → 합산배제", () => {
    const result = validateRentalExclusion({
      ...BASE_PUBLIC_SUPPORT,
      registrationType: "public_support_construction",
      assessedValue: 900_000_000,
      area: 100,
    });
    expect(result.isExcluded).toBe(true);
  });

  it("공공지원_건설: 9억1천(수도권) → 가격초과 거부", () => {
    const result = validateRentalExclusion({
      ...BASE_PUBLIC_SUPPORT,
      registrationType: "public_support_construction",
      assessedValue: 910_000_000,
      area: 100,
    });
    expect(result.isExcluded).toBe(false);
    expect(result.failReasons).toContain(COMPREHENSIVE_EXCL.PRICE_EXCEEDED);
  });

  // 의무임대기간 공통: 10년
  it("공공지원_건설: 경과 8년 < 의무 10년 → 배제 유지 + 경고", () => {
    const result = validateRentalExclusion({
      ...BASE_PUBLIC_SUPPORT,
      registrationType: "public_support_construction",
      area: 100,
      actualRentalYears: 8,
    });
    expect(result.isExcluded).toBe(true);
    expect(result.warnings?.length).toBeGreaterThan(0);
    expect(result.warnings![0]).toContain("10");
  });

  it("공공지원_매입: 경과 8년 < 의무 10년 → 배제 유지 + 경고", () => {
    const result = validateRentalExclusion({
      ...BASE_PUBLIC_SUPPORT,
      registrationType: "public_support_purchase",
      area: 200,
      actualRentalYears: 8,
    });
    expect(result.isExcluded).toBe(true);
    expect(result.warnings?.length).toBeGreaterThan(0);
    expect(result.warnings![0]).toContain("10");
  });
});

// ============================================================
// 회귀 방어 — private_purchase_long 기존 동작 보존
// ============================================================

describe("회귀 방어 — 기존 매입임대 동작 불변", () => {
  it("private_purchase_long 200㎡ → 면적 에러 없음 (기존 동작 유지)", () => {
    const result = validateRentalExclusion({
      ...BASE,
      registrationType: "private_purchase_long",
      area: 200,
    });
    expect(result.failReasons ?? []).not.toContain(COMPREHENSIVE_EXCL.AREA_EXCEEDED);
  });

  it("private_purchase_long 수도권 6억 이하 → 합산배제", () => {
    const result = validateRentalExclusion({
      ...BASE,
      registrationType: "private_purchase_long",
      area: 80,
      assessedValue: 600_000_000,
    });
    expect(result.isExcluded).toBe(true);
    expect(result.reason).toBe(COMPREHENSIVE_EXCL.PRIVATE_PURCHASE_RENTAL_LONG);
  });
});
