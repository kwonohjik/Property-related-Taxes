/**
 * 가업상속공제 UI 통합 anchor — validate 배타성·정합성 (⑧)
 *
 * 계획서: docs/00-pm/inheritance-family-business-deduction-expansion.plan.md (v3)
 * 14지점 ⑧ validation — `[[mirror-pattern]]` 3중 패턴 강제.
 */

import { describe, expect, it } from "vitest";
import { validateFamilyBusinessEstateItem } from "@/lib/calc/inheritance-validate";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

function makeItem(overrides: Partial<EstateItem>): EstateItem {
  return {
    id: "X",
    name: "테스트 자산",
    category: "other",
    marketValue: 1_000_000_000,
    ...overrides,
  };
}

describe("FB-VALIDATE-EXCL — 영농↔가업 분류 배타성", () => {
  it("FB-EXCL-1: farmingCategory + familyBusinessCategory 동시 설정 → asset_dual_category_conflict 차단", () => {
    const item = makeItem({
      farmingCategory: "farmland",
      familyBusinessCategory: "business_real_estate",
    });
    expect(validateFamilyBusinessEstateItem(item, undefined)).toMatch(/asset_dual_category_conflict/);
  });

  it("FB-EXCL-2: farmingCategory만 설정 → 통과", () => {
    const item = makeItem({ farmingCategory: "farmland" });
    expect(validateFamilyBusinessEstateItem(item, undefined)).toBeNull();
  });

  it("FB-EXCL-3: familyBusinessCategory만 설정 → 통과", () => {
    const item = makeItem({ familyBusinessCategory: "business_equipment" });
    expect(validateFamilyBusinessEstateItem(item, undefined)).toBeNull();
  });

  it("FB-EXCL-4: 두 분류 모두 미설정 → 통과", () => {
    const item = makeItem({});
    expect(validateFamilyBusinessEstateItem(item, undefined)).toBeNull();
  });
});

describe("FB-VALIDATE-MISMATCH — businessType ↔ corporate_stock 정합성", () => {
  it("FB-MISMATCH-1: businessType=individual + corporate_stock → business_type_mismatch 차단", () => {
    const item = makeItem({
      category: "unlisted_stock",
      familyBusinessCategory: "corporate_stock",
    });
    expect(validateFamilyBusinessEstateItem(item, { businessType: "individual" })).toMatch(/business_type_mismatch/);
  });

  it("FB-MISMATCH-2: businessType=corporate + corporate_stock → 통과", () => {
    const item = makeItem({
      category: "unlisted_stock",
      familyBusinessCategory: "corporate_stock",
    });
    expect(validateFamilyBusinessEstateItem(item, { businessType: "corporate" })).toBeNull();
  });

  it("FB-MISMATCH-3: businessType=individual + business_real_estate → 통과 (지분 자산 아님)", () => {
    const item = makeItem({
      familyBusinessCategory: "business_real_estate",
    });
    expect(validateFamilyBusinessEstateItem(item, { businessType: "individual" })).toBeNull();
  });

  it("FB-MISMATCH-4: fb 미입력 → corporate_stock 정합성 검증 skip (legacy 모드)", () => {
    const item = makeItem({
      category: "unlisted_stock",
      familyBusinessCategory: "corporate_stock",
    });
    expect(validateFamilyBusinessEstateItem(item, undefined)).toBeNull();
  });
});
