/**
 * 재산세 입력 Zod 스키마 — 도시지역분 세부담상한(v2) 게이트 anchor.
 *
 * H-1 회귀가드: previousYearHousingUrbanTax(도시지역분 직전세액)는 본세 직전세액과 함께만 허용.
 *   → 엔진 "본세 미적용 + 도시만 적용" 경로(echo 손실)를 입력 계층에서 전 차단(UI validate 미러링).
 */

import { describe, it, expect } from "vitest";
import { propertyTaxInputSchema } from "../../lib/validators/property-input";

const housingBase = {
  objectType: "housing" as const,
  publishedPrice: 518_000_000,
  isOneHousehold: true,
  isUrbanArea: true,
  targetDate: "2025-06-01",
};

describe("재산세 Zod — 도시지역분 세부담상한 v2 게이트", () => {
  it("도시지역분 직전세액 + 본세 직전세액 함께 → 통과", () => {
    const r = propertyTaxInputSchema.safeParse({
      ...housingBase,
      previousYearHousingBaseTax: 215_336,
      previousYearHousingUrbanTax: 277_846,
    });
    expect(r.success).toBe(true);
  });

  it("H-1 회귀: 도시지역분만(본세 직전세액 없음) → 차단", () => {
    const r = propertyTaxInputSchema.safeParse({
      ...housingBase,
      previousYearHousingUrbanTax: 277_846, // 본세 미동반
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(JSON.stringify(r.error.issues)).toContain("previousYearHousingUrbanTax");
    }
  });

  it("본세 직전세액만 → 통과 (도시지역분 선택)", () => {
    const r = propertyTaxInputSchema.safeParse({
      ...housingBase,
      previousYearHousingBaseTax: 215_336,
    });
    expect(r.success).toBe(true);
  });

  it("도시지역분 직전세액은 housing 외 objectType에서 차단", () => {
    const r = propertyTaxInputSchema.safeParse({
      objectType: "building",
      publishedPrice: 1_000_000_000,
      buildingType: "general",
      previousYearHousingUrbanTax: 100_000,
    });
    expect(r.success).toBe(false);
  });
});
