/**
 * Phase 2 (F-1) anchor — 상장·비상장 V1 §22② 최대주주 배제 직속 필드
 *
 * 계획서: docs/00-pm/inheritance-stock-section22-toggle-consolidation.plan.md §6
 * 법령: 상속세 및 증여세법 §22② (최대주주 보유주식은 §22 금융재산에 포함되지 아니한다)
 *
 * E-1: EstateItem.isSection22MajorShareholder 직속 필드 추가 (상장·V1·V2 공용)
 * E-2: resolveFinancialEligibility 우선순위 0 가드 OR 확장
 *        (a) item.isSection22MajorShareholder === true  (직속 — 상장·V1·V2 공용)
 *        (b) item.unlistedStockValuationV2?.isSection22MajorShareholder === true  (V2 nested 호환)
 * E-4: baseItemSchema에 isSection22MajorShareholder: z.boolean().optional() 추가
 */

import { describe, expect, it } from "vitest";
import { resolveFinancialEligibility } from "@/lib/calc/financial-deduction-resolver";
import { suggestNetFinancialAssets } from "@/lib/calc/inheritance-deduction-suggest";
import type {
  EstateItem,
  UnlistedStockData,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 헬퍼 — 상장주식 직속 필드
// ============================================================
function listedItem(isSection22?: boolean): EstateItem {
  return {
    id: "listed-1",
    category: "listed_stock",
    name: "상장주식",
    listedStockAvgPrice: 50_000,
    listedStockShares: 1_000,
    // Phase 2 E-1: 직속 필드
    ...(isSection22 !== undefined ? { isSection22MajorShareholder: isSection22 } : {}),
  };
}

// ============================================================
// 헬퍼 — 비상장 V1(간편) 직속 필드
// ============================================================
function unlistedV1Item(isSection22?: boolean): EstateItem {
  const v1Data: UnlistedStockData = {
    totalShares: 10_000,
    ownedShares: 1_000,
    weightedNetIncome: 150_000_000,
    netAssetValue: 1_500_000_000,
    capitalizationRate: 0.10,
  };
  return {
    id: "v1-1",
    category: "unlisted_stock",
    name: "비상장주식 V1",
    unlistedValuationMode: "simple",
    unlistedStockData: v1Data,
    ...(isSection22 !== undefined ? { isSection22MajorShareholder: isSection22 } : {}),
  };
}

// ============================================================
// 헬퍼 — 비상장 V2 nested (기존 호환 경로)
// ============================================================
function unlistedV2NestedItem(nestedValue?: boolean, directValue?: boolean): EstateItem {
  return {
    id: "v2-1",
    category: "unlisted_stock",
    name: "비상장주식 V2",
    marketValue: 50_000_000,
    unlistedValuationMode: "formal",
    unlistedStockValuationV2: {
      isSection22MajorShareholder: nestedValue,
    } as never,
    ...(directValue !== undefined ? { isSection22MajorShareholder: directValue } : {}),
  };
}

// ============================================================
// F1-1 · F1-2 — 직속 필드 true → resolveFinancialEligibility false
// ============================================================
describe("[F1-1] 상장주식 직속 isSection22MajorShareholder=true → 금융재산공제 배제", () => {
  it("F1-1: 상장 직속 true → eligible false (§22② (a)직속 경로)", () => {
    expect(resolveFinancialEligibility(listedItem(true))).toBe(false);
  });
});

describe("[F1-2] 비상장 V1 직속 isSection22MajorShareholder=true → 금융재산공제 배제", () => {
  it("F1-2: V1 직속 true → eligible false (§22② (a)직속 경로)", () => {
    expect(resolveFinancialEligibility(unlistedV1Item(true))).toBe(false);
  });
});

// ============================================================
// F1-3 — V2 nested true + 직속 undefined → false (기존 호환)
// ============================================================
describe("[F1-3] V2 nested isSection22MajorShareholder=true + 직속 undefined → false (호환)", () => {
  it("F1-3: V2 nested true + 직속 undefined → false (§22② (b)V2 nested 경로)", () => {
    expect(resolveFinancialEligibility(unlistedV2NestedItem(true, undefined))).toBe(false);
  });
});

// ============================================================
// F1-4 — 직속 true + V2 nested false → false (OR 우선)
// ============================================================
describe("[F1-4] 직속 true + V2 nested false → false (OR 우선)", () => {
  it("F1-4: 직속=true + nested=false → false (직속 OR nested, 직속 우선)", () => {
    expect(resolveFinancialEligibility(unlistedV2NestedItem(false, true))).toBe(false);
  });
});

// ============================================================
// F1-5 · F1-6 — false/undefined → eligible 보존 (§19① 기본 포함)
// ============================================================
describe("[F1-5] 상장주식 직속 false/undefined → eligible 보존 (§19① 기본 포함)", () => {
  it("F1-5a: 상장 직속 false → true (포함)", () => {
    expect(resolveFinancialEligibility(listedItem(false))).toBe(true);
  });
  it("F1-5b: 상장 직속 undefined → true (포함)", () => {
    expect(resolveFinancialEligibility(listedItem(undefined))).toBe(true);
  });
});

describe("[F1-6] 비상장 V1 직속 false/undefined → eligible 보존", () => {
  it("F1-6a: V1 직속 false → true (포함)", () => {
    expect(resolveFinancialEligibility(unlistedV1Item(false))).toBe(true);
  });
  it("F1-6b: V1 직속 undefined → true (포함)", () => {
    expect(resolveFinancialEligibility(unlistedV1Item(undefined))).toBe(true);
  });
});

// ============================================================
// F1-9 — 상장 직속 ON → suggestNetFinancialAssets 제외 (numeric 유효)
// ============================================================
describe("[F1-9] 상장주식 직속 ON → suggestNetFinancialAssets에서 제외 (numeric 유효)", () => {
  it("F1-9: 상장 직속 OFF → suggest 포함 (50,000,000)", () => {
    const item = listedItem(false);
    expect(suggestNetFinancialAssets([item], []).value).toBe(50_000_000);
  });
  it("F1-9: 상장 직속 ON → suggest 제외 (0)", () => {
    const item = listedItem(true);
    expect(suggestNetFinancialAssets([item], []).value).toBe(0);
  });
  it("F1-9: 상장 ON/OFF 차이 발생 — numeric 유효 실증", () => {
    const off = suggestNetFinancialAssets([listedItem(false)], []).value;
    const on = suggestNetFinancialAssets([listedItem(true)], []).value;
    expect(off).toBeGreaterThan(on); // 50,000,000 > 0
  });
});

// ============================================================
// F1-10 — 비상장 V1 직속 ON → suggest 제외 (Phase 0 후 numeric 유효)
// ============================================================
describe("[F1-10] 비상장 V1 직속 ON → suggestNetFinancialAssets 제외", () => {
  it("F1-10: V1 직속 ON → suggest 제외 (0)", () => {
    const item = unlistedV1Item(true);
    expect(suggestNetFinancialAssets([item], []).value).toBe(0);
  });
  it("F1-10: V1 직속 OFF → suggest 포함 (>0, Phase 0 연동)", () => {
    const item = unlistedV1Item(false);
    const result = suggestNetFinancialAssets([item], []);
    expect(result.value).toBeGreaterThan(0);
  });
  it("F1-10: V1 ON/OFF 차이 발생 — numeric 유효 실증", () => {
    const off = suggestNetFinancialAssets([unlistedV1Item(false)], []).value;
    const on = suggestNetFinancialAssets([unlistedV1Item(true)], []).value;
    expect(off).toBeGreaterThan(on);
  });
});

// ============================================================
// F1-11 — 직속 true + isFinancialAssetForDeduction=true → false (우선순위 0 > 1)
// ============================================================
describe("[F1-11] 직속 §22② true + 명시 isFinancialAssetForDeduction=true → false (우선순위 0 > 1)", () => {
  it("F1-11: 상장 — 직속 ON + 명시 포함=true → false (§22② 법정 강제 우선)", () => {
    const item: EstateItem = {
      ...listedItem(true),
      isFinancialAssetForDeduction: true,
    };
    expect(resolveFinancialEligibility(item)).toBe(false);
  });
  it("F1-11: V1 — 직속 ON + 명시 포함=true → false", () => {
    const item: EstateItem = {
      ...unlistedV1Item(true),
      isFinancialAssetForDeduction: true,
    };
    expect(resolveFinancialEligibility(item)).toBe(false);
  });
});
