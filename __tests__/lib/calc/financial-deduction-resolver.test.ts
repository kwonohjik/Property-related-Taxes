/**
 * §22 금융재산상속공제 적격 판정 — anchor 테스트
 *
 * 법령: 상증법 §22 + 시행령 §19①·④ (KoreanLaw MCP 검증 2026-05-21)
 * 계획서: docs/00-pm/inheritance-additional-deduction-autofill.plan.md §8.1
 */

import { describe, expect, it } from "vitest";

import {
  getCategoryDefaultDebt,
  getCategoryDefaultEligibility,
  resolveFinancialDebt,
  resolveFinancialEligibility,
} from "@/lib/calc/financial-deduction-resolver";
import type {
  DebtItem,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 헬퍼
// ============================================================

function asset(over: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "test",
    category: "financial",
    name: "테스트 자산",
    ...over,
  };
}

function debt(over: Partial<DebtItem> = {}): DebtItem {
  return {
    id: "test",
    category: "financial",
    name: "테스트 채무",
    amount: 0,
    ...over,
  };
}

// ============================================================
// EstateItem §22 적격 (FDR-1 ~ FDR-9)
// ============================================================

describe("resolveFinancialEligibility — EstateItem §22 적격", () => {
  it("FDR-1: category=financial, undefined → true (§19① 예금·적금·채권)", () => {
    expect(resolveFinancialEligibility(asset({ category: "financial" }))).toBe(true);
  });

  it("FDR-2: category=real_estate_land, undefined → false", () => {
    expect(
      resolveFinancialEligibility(asset({ category: "real_estate_land" })),
    ).toBe(false);
  });

  it("FDR-3: category=financial + 명시 true → true (명시값 = default 일치)", () => {
    expect(
      resolveFinancialEligibility(
        asset({ category: "financial", isFinancialAssetForDeduction: true }),
      ),
    ).toBe(true);
  });

  it("DEP-3: getCategoryDefaultEligibility(deposit) → false (UI 배지 '기본 제외')", () => {
    expect(getCategoryDefaultEligibility({ category: "deposit" })).toBe(false);
  });

  it("FDR-4: category=financial + 명시 false → false (사용자 override — §22② 차명 등)", () => {
    expect(
      resolveFinancialEligibility(
        asset({ category: "financial", isFinancialAssetForDeduction: false }),
      ),
    ).toBe(false);
  });

  it("DEP-1: category=deposit, undefined → false (§19① 금융회사 취급 한정 — 전세보증금 반환채권 미열거)", () => {
    // PR2: 전세보증금 반환채권은 임대인(사인) 채권 → §19① 금융회사 취급 금융재산 미해당
    expect(resolveFinancialEligibility(asset({ category: "deposit" }))).toBe(false);
  });

  it("DEP-2: category=deposit + 명시 true → true (사용자 override 보존)", () => {
    expect(
      resolveFinancialEligibility(
        asset({ category: "deposit", isFinancialAssetForDeduction: true }),
      ),
    ).toBe(true);
  });

  it("FDR-5: deemedCategory=insurance, undefined → true (§19① 보험금)", () => {
    expect(
      resolveFinancialEligibility(
        asset({ category: "cash", deemedCategory: "insurance" }),
      ),
    ).toBe(true);
  });

  it("FDR-6: deemedCategory=retirement → false (§19① 미열거)", () => {
    expect(
      resolveFinancialEligibility(
        asset({ category: "cash", deemedCategory: "retirement" }),
      ),
    ).toBe(false);
  });

  it("FDR-7: deemedCategory=trust, trustType=undefined → false (안전 default)", () => {
    expect(
      resolveFinancialEligibility(
        asset({ category: "other", deemedCategory: "trust" }),
      ),
    ).toBe(false);
  });

  it("FDR-7b: deemedCategory=trust, trustType=cash_trust → true (§19① 금전신탁)", () => {
    expect(
      resolveFinancialEligibility(
        asset({
          category: "other",
          deemedCategory: "trust",
          trustType: "cash_trust",
        }),
      ),
    ).toBe(true);
  });

  it("FDR-7c: deemedCategory=trust, trustType=real_estate → false (§19① 미열거)", () => {
    expect(
      resolveFinancialEligibility(
        asset({
          category: "other",
          deemedCategory: "trust",
          trustType: "real_estate",
        }),
      ),
    ).toBe(false);
  });

  it("FDR-7d: deemedCategory=trust, trustType=security → false", () => {
    expect(
      resolveFinancialEligibility(
        asset({
          category: "other",
          deemedCategory: "trust",
          trustType: "security",
        }),
      ),
    ).toBe(false);
  });

  it("FDR-7e: deemedCategory=trust, trustType=other → false", () => {
    expect(
      resolveFinancialEligibility(
        asset({
          category: "other",
          deemedCategory: "trust",
          trustType: "other",
        }),
      ),
    ).toBe(false);
  });

  it("FDR-8: trust + real_estate + 명시 true → true (명시값 우선)", () => {
    expect(
      resolveFinancialEligibility(
        asset({
          category: "other",
          deemedCategory: "trust",
          trustType: "real_estate",
          isFinancialAssetForDeduction: true,
        }),
      ),
    ).toBe(true);
  });

  it("FDR-9: category=listed_stock, undefined → true (§19① 주식)", () => {
    expect(resolveFinancialEligibility(asset({ category: "listed_stock" }))).toBe(
      true,
    );
  });
});

// ============================================================
// DebtItem §22 차감 적격 (FDD-1 ~ FDD-5)
// ============================================================

describe("resolveFinancialDebt — DebtItem §22 차감 적격", () => {
  it("FDD-1: category=financial, undefined → true (§19④ 금융회사등 채무)", () => {
    expect(resolveFinancialDebt(debt({ category: "financial" }))).toBe(true);
  });

  it("FDD-2: category=personal, undefined → false (§19④ 제외)", () => {
    expect(resolveFinancialDebt(debt({ category: "personal" }))).toBe(false);
  });

  it("FDD-3: category=personal + 명시 true → false (override 불가 — §19④ 강제)", () => {
    expect(
      resolveFinancialDebt(
        debt({ category: "personal", isFinancialDebtForDeduction: true }),
      ),
    ).toBe(false);
  });

  it("FDD-4: category=funeral → false (체크박스 disabled)", () => {
    expect(resolveFinancialDebt(debt({ category: "funeral" }))).toBe(false);
  });

  it("FDD-5: category=financial + 명시 false → false (사용자 명시 제외 — 입증 미비)", () => {
    expect(
      resolveFinancialDebt(
        debt({ category: "financial", isFinancialDebtForDeduction: false }),
      ),
    ).toBe(false);
  });

  it("category=tax → false (사적채무 동일 취급)", () => {
    expect(resolveFinancialDebt(debt({ category: "tax" }))).toBe(false);
  });
});

// ============================================================
// 카테고리 default 배지 (UI 표시용)
// ============================================================

describe("getCategoryDefaultEligibility — UI 배지", () => {
  it("financial → true", () => {
    expect(getCategoryDefaultEligibility({ category: "financial" })).toBe(true);
  });

  it("real_estate_land → false", () => {
    expect(getCategoryDefaultEligibility({ category: "real_estate_land" })).toBe(
      false,
    );
  });

  it("trust + cash_trust → true", () => {
    expect(
      getCategoryDefaultEligibility({
        category: "other",
        deemedCategory: "trust",
        trustType: "cash_trust",
      }),
    ).toBe(true);
  });

  it("trust + undefined → false (안전 default)", () => {
    expect(
      getCategoryDefaultEligibility({
        category: "other",
        deemedCategory: "trust",
      }),
    ).toBe(false);
  });

  it("isFinancialAssetForDeduction 명시값 무시 (배지는 default 표시)", () => {
    // getCategoryDefaultEligibility는 명시값을 받지 않는 시그니처 — 카테고리 기반 default만
    expect(
      getCategoryDefaultEligibility({ category: "financial" }),
    ).toBe(true);
  });
});

describe("getCategoryDefaultDebt — UI 배지", () => {
  it("financial → true", () => {
    expect(getCategoryDefaultDebt({ category: "financial" })).toBe(true);
  });

  it("personal → false", () => {
    expect(getCategoryDefaultDebt({ category: "personal" })).toBe(false);
  });

  it("funeral → false", () => {
    expect(getCategoryDefaultDebt({ category: "funeral" })).toBe(false);
  });
});
