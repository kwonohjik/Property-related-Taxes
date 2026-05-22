/**
 * resolveAssetToggleVisibility — 자산 카드 토글 자동 노출 정책 테스트
 *
 * anchor 구성 (48):
 *   - 8-1 기본 매트릭스: 9 카테고리 × 1 = 9
 *   - 8-2 활성 우선 override: 9
 *   - 8-3 신탁 override: 6
 *   - 8-4 deposit CATEGORY_DEFAULT.deposit=true 활성 우선 자동 발동: 1
 *   - countHiddenExpandable 헬퍼: 9
 *   - 회귀 보호 (deemedCategory 변경·복합 시나리오): 5
 *   ─ 합계 48
 *
 * 계획서: docs/00-pm/asset-toggle-auto-visibility.plan.md §8
 * 디자인: docs/02-design/features/asset-toggle-auto-visibility.ui.design.md §8
 */

import { describe, expect, test } from "vitest";
import {
  countHiddenExpandable,
  resolveAssetToggleVisibility,
  type AssetToggleVisibility,
} from "@/lib/calc/asset-toggle-visibility";
import type { AssetCategory, EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

function makeItem(category: AssetCategory, patch: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "test",
    category,
    name: "",
    ...patch,
  };
}

// ============================================================
// 8-1. 기본 매트릭스 (9 카테고리)
// ============================================================

describe("resolveAssetToggleVisibility — 8-1 기본 매트릭스", () => {
  test.each<[AssetCategory, AssetToggleVisibility]>([
    [
      "real_estate_land",
      { farming: "default", familyBusiness: "default", financialDeduction: "hidden_expandable", deemedRetirementOption: "hidden" },
    ],
    [
      "real_estate_building",
      { farming: "default", familyBusiness: "default", financialDeduction: "hidden_expandable", deemedRetirementOption: "hidden" },
    ],
    [
      "real_estate_apartment",
      { farming: "hidden_permanent", familyBusiness: "hidden_expandable", financialDeduction: "hidden_expandable", deemedRetirementOption: "hidden" },
    ],
    [
      "cash",
      { farming: "hidden_permanent", familyBusiness: "hidden_permanent", financialDeduction: "hidden_permanent", deemedRetirementOption: "visible" },
    ],
    [
      "financial",
      // financial은 CATEGORY_DEFAULT=true로 활성 우선 자동 발동 → financialDeduction "default" 그대로
      { farming: "hidden_permanent", familyBusiness: "hidden_expandable", financialDeduction: "default", deemedRetirementOption: "visible" },
    ],
    [
      "listed_stock",
      { farming: "default", familyBusiness: "default", financialDeduction: "default", deemedRetirementOption: "visible" },
    ],
    [
      "unlisted_stock",
      { farming: "default", familyBusiness: "default", financialDeduction: "default", deemedRetirementOption: "visible" },
    ],
    [
      "other",
      { farming: "default", familyBusiness: "default", financialDeduction: "hidden_expandable", deemedRetirementOption: "visible" },
    ],
  ])("%s 카테고리", (category, expected) => {
    expect(resolveAssetToggleVisibility(makeItem(category))).toEqual(expected);
  });

  test("deposit 카테고리 — CATEGORY_DEFAULT.deposit=true 활성 우선 발동", () => {
    // deposit은 resolveFinancialEligibility=true로 활성 우선 정책 발동 → financialDeduction default
    // 매트릭스의 hidden_expandable이 무력화됨 (회귀 0 보장)
    expect(resolveAssetToggleVisibility(makeItem("deposit"))).toEqual({
      farming: "hidden_permanent",
      familyBusiness: "hidden_permanent",
      financialDeduction: "default", // 활성 우선 무력화
      deemedRetirementOption: "visible",
    });
  });
});

// ============================================================
// 8-2. 활성 우선 override (9개)
// ============================================================

describe("resolveAssetToggleVisibility — 8-2 활성 우선 override", () => {
  test("cash + farmingCategory='rice_paddy' → farming default 승격 (hidden_perm 무력화)", () => {
    const item = makeItem("cash", { farmingCategory: "farmland" });
    expect(resolveAssetToggleVisibility(item).farming).toBe("default");
  });

  test("cash + familyBusinessCategory='business_land' → familyBusiness default 승격", () => {
    const item = makeItem("cash", { familyBusinessCategory: "business_real_estate" });
    expect(resolveAssetToggleVisibility(item).familyBusiness).toBe("default");
  });

  test("cash + isFinancialAssetForDeduction=true → financialDeduction default 승격", () => {
    const item = makeItem("cash", { isFinancialAssetForDeduction: true });
    expect(resolveAssetToggleVisibility(item).financialDeduction).toBe("default");
  });

  test("real_estate_apartment + farmingCategory='rice_paddy' → farming default 승격", () => {
    const item = makeItem("real_estate_apartment", { farmingCategory: "farmland" });
    expect(resolveAssetToggleVisibility(item).farming).toBe("default");
  });

  test("real_estate_land + deemedCategory='retirement' → deemedRetirementOption visible 승격", () => {
    const item = makeItem("real_estate_land", { deemedCategory: "retirement" });
    expect(resolveAssetToggleVisibility(item).deemedRetirementOption).toBe("visible");
  });

  test("financial + familyBusinessCategory='business_land' → familyBusiness default 승격", () => {
    const item = makeItem("financial", { familyBusinessCategory: "business_real_estate" });
    expect(resolveAssetToggleVisibility(item).familyBusiness).toBe("default");
  });

  test("deposit + isFinancialAssetForDeduction=false → financialDeduction hidden_expandable (user override)", () => {
    // 사용자가 명시적으로 false 설정 시 활성 우선 무력 → 매트릭스 적용
    const item = makeItem("deposit", { isFinancialAssetForDeduction: false });
    expect(resolveAssetToggleVisibility(item).financialDeduction).toBe("hidden_expandable");
  });

  test("other + farmingCategory='fishing_vessel' → farming default 유지", () => {
    const item = makeItem("other", { farmingCategory: "fishing_vessel" });
    expect(resolveAssetToggleVisibility(item).farming).toBe("default");
  });

  test("real_estate_apartment + 모든 활성 우선 동시 발동 → 모두 default", () => {
    const item = makeItem("real_estate_apartment", {
      farmingCategory: "farmland",
      familyBusinessCategory: "business_real_estate",
      isFinancialAssetForDeduction: true,
      deemedCategory: "retirement",
    });
    expect(resolveAssetToggleVisibility(item)).toEqual({
      farming: "default",
      familyBusiness: "default",
      financialDeduction: "default",
      deemedRetirementOption: "visible",
    });
  });
});

// ============================================================
// 8-3. 신탁 override (6개)
// ============================================================

describe("resolveAssetToggleVisibility — 8-3 신탁 override", () => {
  test("cash + deemedCategory='trust' + trustType=undefined → financialDeduction default (override) + 기본 OFF", () => {
    const item = makeItem("cash", { deemedCategory: "trust" });
    const result = resolveAssetToggleVisibility(item);
    expect(result.financialDeduction).toBe("default"); // override로 hidden_perm 무력화
  });

  test("cash + deemedCategory='trust' + trustType='cash_trust' → financialDeduction default + 기본 ON", () => {
    const item = makeItem("cash", { deemedCategory: "trust", trustType: "cash_trust" });
    const result = resolveAssetToggleVisibility(item);
    expect(result.financialDeduction).toBe("default");
  });

  test("real_estate_apartment + trust + trustType='real_estate' → financialDeduction default (override) + 기본 OFF", () => {
    const item = makeItem("real_estate_apartment", { deemedCategory: "trust", trustType: "real_estate" });
    const result = resolveAssetToggleVisibility(item);
    expect(result.financialDeduction).toBe("default");
  });

  test("real_estate_land + trust + trustType='cash_trust' → financialDeduction default + 기본 ON", () => {
    const item = makeItem("real_estate_land", { deemedCategory: "trust", trustType: "cash_trust" });
    const result = resolveAssetToggleVisibility(item);
    expect(result.financialDeduction).toBe("default");
  });

  test("real_estate_land + trust → farming/familyBusiness는 매트릭스 그대로 (trust override는 §22만)", () => {
    const item = makeItem("real_estate_land", { deemedCategory: "trust", trustType: "real_estate" });
    const result = resolveAssetToggleVisibility(item);
    expect(result.farming).toBe("default"); // real_estate_land 매트릭스
    expect(result.familyBusiness).toBe("default");
  });

  test("real_estate_apartment + trust → farming은 hidden_perm 유지 (trust override는 §22만)", () => {
    const item = makeItem("real_estate_apartment", { deemedCategory: "trust" });
    const result = resolveAssetToggleVisibility(item);
    expect(result.farming).toBe("hidden_permanent"); // trust override 무관
    expect(result.financialDeduction).toBe("default"); // trust override 발동
  });
});

// ============================================================
// 8-4. 회귀 보호 + 복합 시나리오
// ============================================================

describe("resolveAssetToggleVisibility — 회귀 보호", () => {
  test("deemedCategory='insurance' → financialDeduction default (resolveFinancialEligibility 우선순위 2)", () => {
    // insurance는 resolveFinancialEligibility=true → 활성 우선 발동
    const item = makeItem("real_estate_land", { deemedCategory: "insurance" });
    expect(resolveAssetToggleVisibility(item).financialDeduction).toBe("default");
  });

  test("deemedCategory='retirement' → financialDeduction은 매트릭스 그대로 (retirement는 §22 false)", () => {
    // retirement는 resolveFinancialEligibility=false → 활성 우선 미발동
    // real_estate_land 매트릭스: financialDeduction = hidden_expandable
    const item = makeItem("real_estate_land", { deemedCategory: "retirement" });
    const result = resolveAssetToggleVisibility(item);
    expect(result.financialDeduction).toBe("hidden_expandable");
    expect(result.deemedRetirementOption).toBe("visible"); // 활성 우선 발동
  });

  test("listed_stock + familyBusinessCategory='corporate_stock' → 모든 토글 default 유지", () => {
    const item = makeItem("listed_stock", { familyBusinessCategory: "corporate_stock" });
    expect(resolveAssetToggleVisibility(item)).toEqual({
      farming: "default",
      familyBusiness: "default",
      financialDeduction: "default",
      deemedRetirementOption: "visible",
    });
  });

  test("cash + deemedCategory='retirement' → 매트릭스 그대로 (cash는 모든 토글 hidden_perm)", () => {
    const item = makeItem("cash", { deemedCategory: "retirement" });
    expect(resolveAssetToggleVisibility(item)).toEqual({
      farming: "hidden_permanent",
      familyBusiness: "hidden_permanent",
      financialDeduction: "hidden_permanent",
      deemedRetirementOption: "visible",
    });
  });

  test("real_estate_apartment + deemedCategory='retirement' → deemedRetirementOption visible (활성 우선)", () => {
    const item = makeItem("real_estate_apartment", { deemedCategory: "retirement" });
    expect(resolveAssetToggleVisibility(item).deemedRetirementOption).toBe("visible");
  });
});

// ============================================================
// 8-5. countHiddenExpandable 헬퍼 (9개)
// ============================================================

describe("countHiddenExpandable — 펼침 카운트", () => {
  test.each<[AssetCategory, number]>([
    ["real_estate_land", 1], // §22만
    ["real_estate_building", 1], // §22만
    ["real_estate_apartment", 2], // 가업 + §22 (영농은 hidden_perm)
    ["cash", 0], // 모두 hidden_perm — 펼침 링크 미노출
    ["financial", 1], // 가업만 (§22는 default — CATEGORY_DEFAULT 활성 우선)
    ["listed_stock", 0], // 모두 default
    ["unlisted_stock", 0],
    ["other", 1], // §22만
  ])("%s 카테고리 → 펼침 카운트 %i", (category, expected) => {
    const visibility = resolveAssetToggleVisibility(makeItem(category));
    expect(countHiddenExpandable(visibility)).toBe(expected);
  });

  test("deposit 카테고리 → 펼침 카운트 0 (CATEGORY_DEFAULT 활성 우선으로 §22가 default 승격, 나머지 hidden_perm)", () => {
    const visibility = resolveAssetToggleVisibility(makeItem("deposit"));
    expect(countHiddenExpandable(visibility)).toBe(0);
  });
});
