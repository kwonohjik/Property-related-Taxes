/**
 * 종합부동산세 사례6 — 주택 건물·부속토지 소유자 분리(시가표준액 비율 안분, ≠1세대1주택)
 *
 * 국세청 종부세 세액계산 사례집 제8장 사례6 (2022 귀속). 납세자는 부속토지만 100% 소유(건물 0%).
 * 공시가격을 건물·토지 시가표준액 비율로 안분:
 *   당해 안분 = 토지 8억 / 전체 10억 = 0.8 → 15억 × 0.8 = 12억
 *   직전 안분 = 토지 7.8억 / 전체 10.4억 = 0.75 → 14억 × 0.75 = 10.5억
 *
 * ★ PDF 나① 중간값 "2,490,000"은 교재 오기 — 정정 2,730,000(8.4억×0.4%−63만, ×7.8/10.4=2,047,500).
 *   세부담상한 미적용(가 3,743,616 ≤ 다 5,634,000)이라 안분 정밀도가 ⑤에 영향 없음(numeric 0 — 충실 재현).
 */
import { describe, it, expect } from "vitest";
import { calculateComprehensiveTax } from "@/lib/tax-engine/comprehensive-tax";

describe("종합부동산세 사례6 — 건물·부속토지 시가표준액 안분", () => {
  it("PY-S6: 토지만 100% 소유 — ⑤ 1,367,616 + 안분 전 항목", () => {
    const r = calculateComprehensiveTax({
      assessmentYear: 2022,
      isOneHouseOwner: false,
      properties: [
        {
          propertyId: "p1",
          assessedValue: 1_500_000_000,
          appurtenantSplit: {
            ownedPart: "land",
            landStandardValue: 800_000_000,
            buildingStandardValue: 200_000_000,
          },
        },
      ],
      previousYearAuto: {
        assessedValue: 1_400_000_000, // 단일주택 → priorHouseValues 생략(assessedValue fallback)
        isOneHouseOwner: false,
        appurtenantSplit: {
          ownedPart: "land",
          landStandardValue: 780_000_000,
          buildingStandardValue: 260_000_000,
        },
      },
    });

    // 당해
    expect(r.effectiveIncludedAssessedValue).toBe(1_200_000_000); // 15억 × 0.8 = 12억 (안분)
    expect(r.taxBase).toBe(360_000_000); // (12억 − 6억) × 60% = 3.6억
    expect(r.calculatedTax).toBe(2_280_000); // ① 재산세공제전 종부세
    expect(r.propertyTaxCredit.totalPropertyTax).toBe(2_376_000); // ⓐ 부과 재산세 (2,970,000 × 0.8)
    expect(r.propertyTaxCredit.comprehensiveTaxBase).toBe(864_000); // ⓑ (3.6억 × 60% × 0.4%)
    expect(r.propertyTaxCredit.propertyTaxBase).toBe(2_250_000); // ⓒ (12억 × 60% × 0.4% − 63만)
    expect(r.propertyTaxCredit.creditAmount).toBe(912_384); // ②ⓓ
    expect(r.taxBeforeCap).toBe(1_367_616); // ③ 세부담상한전

    // 직전 상당액
    expect(r.previousYearEquivalent?.propertyTaxEquiv).toBe(2_047_500); // 나① (2,730,000 × 0.75)
    expect(r.previousYearEquivalent?.comprehensiveTaxEquiv).toBe(1_708_500); // 나②
    expect(r.previousYearEquivalent?.total).toBe(3_756_000); // 나
    expect(r.previousYearEquivalent?.detail.calculatedTax).toBe(2_820_000); // 나②ⓐ
    expect(r.previousYearEquivalent?.detail.creditAmount).toBe(1_111_500); // 나②ⓑ

    // 세부담상한 + 최종
    expect(r.currentYearTotalEquivalent).toBe(3_743_616); // 가 (②ⓐ + ③)
    expect(r.taxCap?.capAmount).toBe(5_634_000); // 다 (나 × 150%)
    expect(r.taxCap?.isApplied).toBe(false); // 가 ≤ 다 → 미발동
    expect(r.determinedHousingTax).toBe(1_367_616); // ⑤ 납부할세액
  });

  it("S6-2: 건물만 소유 — 안분 = 건물/전체 (2억/10억 = 0.2)", () => {
    const r = calculateComprehensiveTax({
      assessmentYear: 2022,
      isOneHouseOwner: false,
      properties: [
        {
          propertyId: "p1",
          assessedValue: 1_500_000_000,
          appurtenantSplit: {
            ownedPart: "building",
            landStandardValue: 800_000_000,
            buildingStandardValue: 200_000_000,
          },
        },
      ],
    });
    expect(r.effectiveIncludedAssessedValue).toBe(300_000_000); // 15억 × 0.2 = 3억
  });

  it("S6-3: 분리 + 공유지분 50% 동시 — 단일 floor 합성 (15억 × 0.5 × 0.8 = 6억)", () => {
    const r = calculateComprehensiveTax({
      assessmentYear: 2022,
      isOneHouseOwner: false,
      properties: [
        {
          propertyId: "p1",
          assessedValue: 1_500_000_000,
          ownershipRatio: 0.5,
          appurtenantSplit: {
            ownedPart: "land",
            landStandardValue: 800_000_000,
            buildingStandardValue: 200_000_000,
          },
        },
      ],
    });
    expect(r.effectiveIncludedAssessedValue).toBe(600_000_000); // 15억 × 0.5 × 0.8 = 6억
  });

  it("S6-4: appurtenantSplit 미입력 — 안분 미적용(회귀, 비율 1)", () => {
    const r = calculateComprehensiveTax({
      assessmentYear: 2022,
      isOneHouseOwner: false,
      properties: [{ propertyId: "p1", assessedValue: 1_500_000_000 }],
    });
    expect(r.effectiveIncludedAssessedValue).toBe(1_500_000_000); // 안분 없음 = 원공시
  });
});
