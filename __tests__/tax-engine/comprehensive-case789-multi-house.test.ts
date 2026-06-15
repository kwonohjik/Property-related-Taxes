/**
 * 종합부동산세 사례 7·8·9 — 주택분 재산세 부과세액 직접입력 (propertyTaxAmount)
 *
 * 출처: 국세청 「종합부동산세 세액계산 사례」 제8장 사례 7·8·9 (2022 귀속)
 * 계획서: docs/01-plan/features/comprehensive-case-7-8-9-multi-house.plan.md
 *
 * 갭: 주택분 ComprehensiveProperty에 재산세 부과세액(ⓐ) 직접입력 필드 부재.
 *   현행 imposedTax = calculatePropertyTax(공시) × (1−rate) × ratio 자동계산은
 *   주택 세부담상한(105/110/130%)·다가구 면적안분을 반영하지 못함 → ⓐ 불일치 → ⑤ 오류.
 * 해법: ComprehensiveProperty.propertyTaxAmount?: number (토지분 patten 이식).
 *   입력 시 imposedTax = 원값 (applyEffectiveFactor 후곱 금지 = 이중적용 방지).
 *
 * ★ Pre-Do: propertyTaxAmount 엔진 분기 전에는 실패가 정상(자동계산 ⓐ로 ⑤ 어긋남).
 */

import { describe, it, expect } from "vitest";
import { calculateComprehensiveTax } from "../../lib/tax-engine/comprehensive-tax";
import type { ComprehensiveTaxInput } from "../../lib/tax-engine/types/comprehensive.types";

describe("사례7 (다가구주택, ≠1세대1주택): 일반세율 0.6% · 세부담상한 150%", () => {
  // 1동 통합공시 8억 → 구별 면적안분 재산세 합산 714,000 (1층 300,000 + 2층 300,000 + 지하 114,000)
  // ① (8억−6억)×60%×0.6% = 720,000
  // ⓐ 714,000, ⓑ 1.2억×60%×0.4%=288,000, ⓒ 8억×60%×0.4%−630,000=1,290,000
  // ⓓ round(714,000×288,000/1,290,000)=159,405
  // ⑤ 720,000−159,405=560,595 (④=0: floor(1,020,926×1.5)−714,000=817,389 ≥ 560,595)
  it("⑤ 결정세액 560,595 · ① 720,000 · ⓓ 159,405", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2022,
      isOneHouseOwner: false,
      properties: [
        { propertyId: "house", assessedValue: 800_000_000, propertyTaxAmount: 714_000 },
      ],
      previousYearTotalTax: 1_020_926,
    };
    const result = calculateComprehensiveTax(input);
    expect(result.calculatedTax).toBe(720_000);
    expect(result.propertyTaxCredit.creditAmount).toBe(159_405);
    expect(result.determinedHousingTax).toBe(560_595);
  });
});

describe("사례8 (조정대상지역 2주택): 중과세율 2.2% · 세부담상한 300%", () => {
  // 서초 공시 20억·감면30% → 감면후 14억, 부과재산세 2,702,700 (세부담상한130% 적용 후 ×0.7)
  // 강남 공시 10억·감면0, 부과재산세 1,677,000
  // ① (24억−6억)×60%×2.2%−480만 = 18,960,000
  // ⓐ 4,379,700, ⓑ 10.8억×60%×0.4%=2,592,000, ⓒ 24억×60%×0.4%−630,000=5,130,000
  // ⓓ round(4,379,700×2,592,000/5,130,000)=2,212,901
  // ⑤ 16,747,099 (④=0)
  it("⑤ 결정세액 16,747,099 · ① 18,960,000 · ⓓ 2,212,901", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2022,
      isOneHouseOwner: false,
      isMultiHouseInAdjustedArea: true,
      properties: [
        { propertyId: "seocho", assessedValue: 2_000_000_000, reductionRate: 0.3, propertyTaxAmount: 2_702_700 },
        { propertyId: "gangnam", assessedValue: 1_000_000_000, propertyTaxAmount: 1_677_000 },
      ],
      previousYearTotalTax: 22_173_882,
    };
    const result = calculateComprehensiveTax(input);
    expect(result.taxBase).toBe(1_080_000_000);
    expect(result.calculatedTax).toBe(18_960_000);
    expect(result.propertyTaxCredit.creditAmount).toBe(2_212_901);
    expect(result.determinedHousingTax).toBe(16_747_099);
  });
});

describe("사례9 (3주택 이상): 중과세율 3.6% · 세부담상한 300%", () => {
  // 서초(20억·30%·2,702,700) + 강남(10억·1,677,000, 지분50%는 과표 미반영=ownershipRatio 미입력) + 안양 단독(5억·462,000)
  // ① (29억−6억)×60%×3.6%−2,160만 = 28,080,000
  // ⓐ 4,841,700, ⓑ 13.8억×60%×0.4%=3,312,000, ⓒ 29억×60%×0.4%−630,000=6,330,000
  // ⓓ round(4,841,700×3,312,000/6,330,000)=2,533,288 (floor=2,533,287 — round 필수, safeMulDivRound)
  // ⑤ 25,546,712 (④=0)
  it("⑤ 결정세액 25,546,712 · ① 28,080,000 · ⓓ 2,533,288 (round 필수)", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2022,
      isOneHouseOwner: false,
      properties: [
        { propertyId: "seocho", assessedValue: 2_000_000_000, reductionRate: 0.3, propertyTaxAmount: 2_702_700 },
        { propertyId: "gangnam", assessedValue: 1_000_000_000, propertyTaxAmount: 1_677_000 },
        { propertyId: "anyang", assessedValue: 500_000_000, propertyTaxAmount: 462_000 },
      ],
      previousYearTotalTax: 35_630_694,
    };
    const result = calculateComprehensiveTax(input);
    expect(result.taxBase).toBe(1_380_000_000);
    expect(result.calculatedTax).toBe(28_080_000);
    expect(result.propertyTaxCredit.creditAmount).toBe(2_533_288);
    expect(result.determinedHousingTax).toBe(25_546_712);
  });
});

describe("하위호환: propertyTaxAmount 미입력 시 자동계산 경로 유지 (사례5 회귀)", () => {
  it("propertyTaxAmount 없으면 calculatePropertyTax 자동계산 — 공제 781,357 불변", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2022,
      isOneHouseOwner: true,
      properties: [
        { propertyId: "p1", assessedValue: 1_500_000_000, exclusionType: "none" },
        { propertyId: "p2", assessedValue: 200_000_000, exclusionType: "none" },
      ],
    };
    const result = calculateComprehensiveTax(input);
    expect(result.calculatedTax).toBe(2_280_000);
    expect(result.propertyTaxCredit.creditAmount).toBe(781_357);
  });
});
