/**
 * 종합부동산세 합산배제 공시가격 상한 anchor 테스트
 *
 * getPriceLimit 버그 수정 검증 (종부세 시행령 §3① 각 호 가목):
 * - 건설임대(1·7호): 30호미만 9억 / 30호이상 12억 (수도권 무관)
 * - 매입임대(2·8호): 30호미만 6억/비수도권 3억 / 30호이상 9억/비수도권 6억
 * - 기존임대(3호): 3억 (수도권 무관)
 * - 단기건설(10호): 6억 / 단기매입(11호): 4억/2억 (무변경)
 *
 * @see comprehensive-exclusion.ts getPriceLimit
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
  area: 80, // 모든 유형 면적 상한 이내 (건설149·매입무제한·기존85)
  location: "metro",
  currentRent: 1_000_000,
  isInitialContract: true,
  assessmentDate: new Date("2025-06-01"),
};

const PRICE_EXCEEDED = COMPREHENSIVE_EXCL.PRICE_EXCEEDED;
const priceOk = (over: Partial<RentalExclusionInput>) =>
  (validateRentalExclusion({ ...BASE, ...over }).failReasons ?? []).includes(PRICE_EXCEEDED);

// ============================================================
// 건설임대 (§3①1·7호) — 30호미만 9억 / 30호이상 12억, 수도권 무관
// ============================================================
describe("건설임대 공시가격 상한 — 9억/12억 (§3①1·7호)", () => {
  const TYPES: RentalExclusionInput["registrationType"][] = [
    "private_construction",
    "public_construction",
    "public_support_construction",
  ];
  for (const registrationType of TYPES) {
    it(`${registrationType}: 8억 → 통과 (기존 6억 버그였다면 탈락했을 값)`, () => {
      expect(priceOk({ registrationType, assessedValue: 800_000_000 })).toBe(false);
    });
    it(`${registrationType}: 9억 경계 통과 / 9.5억 탈락`, () => {
      expect(priceOk({ registrationType, assessedValue: 900_000_000 })).toBe(false);
      expect(priceOk({ registrationType, assessedValue: 950_000_000 })).toBe(true);
    });
    it(`${registrationType}: 비수도권도 9억 (수도권 무관)`, () => {
      expect(priceOk({ registrationType, location: "non_metro", assessedValue: 800_000_000 })).toBe(false);
    });
    it(`${registrationType}: 30호 이상 → 12억 경계 통과 / 12.5억 탈락`, () => {
      expect(priceOk({ registrationType, isThirtyPlusUnits: true, assessedValue: 1_200_000_000 })).toBe(false);
      expect(priceOk({ registrationType, isThirtyPlusUnits: true, assessedValue: 1_250_000_000 })).toBe(true);
    });
  }
});

// ============================================================
// 매입임대 (§3①2·8호) — 30호미만 6억/3억 / 30호이상 9억/6억
// ============================================================
describe("매입임대 공시가격 상한 — 6억·3억 / 30호↑ 9억·6억 (§3①2·8호)", () => {
  const TYPES: RentalExclusionInput["registrationType"][] = [
    "private_purchase_long",
    "private_purchase_short",
    "public_purchase",
    "public_support_purchase",
  ];
  for (const registrationType of TYPES) {
    it(`${registrationType}: 수도권 6억 통과 / 6.1억 탈락`, () => {
      expect(priceOk({ registrationType, assessedValue: 600_000_000 })).toBe(false);
      expect(priceOk({ registrationType, assessedValue: 610_000_000 })).toBe(true);
    });
    it(`${registrationType}: 비수도권 3억 통과 / 3.1억 탈락`, () => {
      expect(priceOk({ registrationType, location: "non_metro", assessedValue: 300_000_000 })).toBe(false);
      expect(priceOk({ registrationType, location: "non_metro", assessedValue: 310_000_000 })).toBe(true);
    });
    it(`${registrationType}: 30호↑ 수도권 9억 통과 / 9.1억 탈락`, () => {
      expect(priceOk({ registrationType, isThirtyPlusUnits: true, assessedValue: 900_000_000 })).toBe(false);
      expect(priceOk({ registrationType, isThirtyPlusUnits: true, assessedValue: 910_000_000 })).toBe(true);
    });
    it(`${registrationType}: 30호↑ 비수도권 6억 통과 / 6.1억 탈락`, () => {
      expect(priceOk({ registrationType, isThirtyPlusUnits: true, location: "non_metro", assessedValue: 600_000_000 })).toBe(false);
      expect(priceOk({ registrationType, isThirtyPlusUnits: true, location: "non_metro", assessedValue: 610_000_000 })).toBe(true);
    });
  }

  it("public_support_purchase 수도권 7억 → 탈락 (기존 9억 버그 회귀 방지)", () => {
    expect(priceOk({ registrationType: "public_support_purchase", assessedValue: 700_000_000 })).toBe(true);
  });
});

// ============================================================
// 기존임대 (§3①3호) — 3억, 수도권 무관
// ============================================================
describe("기존임대 공시가격 상한 — 3억 (§3①3호)", () => {
  it("3억 통과 / 4억 탈락 (기존 6억 버그였다면 통과했을 값)", () => {
    expect(priceOk({ registrationType: "existing_rental", assessedValue: 300_000_000 })).toBe(false);
    expect(priceOk({ registrationType: "existing_rental", assessedValue: 400_000_000 })).toBe(true);
  });
  it("30호 여부 무관 (tier 없음)", () => {
    expect(priceOk({ registrationType: "existing_rental", isThirtyPlusUnits: true, assessedValue: 400_000_000 })).toBe(true);
  });
});

// ============================================================
// 단기임대 (§3①10·11호) — 무변경 회귀 방어
// ============================================================
describe("단기임대 공시가격 상한 — 무변경 (§3①10·11호)", () => {
  it("단기건설 6억 통과 / 6.1억 탈락 (호수 무관)", () => {
    expect(priceOk({ registrationType: "private_short_term_6y_construction", assessedValue: 600_000_000 })).toBe(false);
    expect(priceOk({ registrationType: "private_short_term_6y_construction", isThirtyPlusUnits: true, assessedValue: 610_000_000 })).toBe(true);
  });
  it("단기매입 수도권 4억 통과 / 비수도권 2억 통과 (호수 무관)", () => {
    expect(priceOk({ registrationType: "private_short_term_6y_purchase", assessedValue: 400_000_000 })).toBe(false);
    expect(priceOk({ registrationType: "private_short_term_6y_purchase", location: "non_metro", assessedValue: 200_000_000 })).toBe(false);
    expect(priceOk({ registrationType: "private_short_term_6y_purchase", assessedValue: 410_000_000 })).toBe(true);
  });
});
