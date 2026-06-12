/**
 * 종부세 토지분 "납부할세액의 계산" — 사례10(종합합산)·사례11(별도합산) anchor
 *
 * 출처: 국세청 「2022 귀속 종합부동산세 계산 사례」 사례10 p.180~182 · 사례11 p.183~185
 *   (사용자 제공 PDF 축자 — 원단위 toBe 고정)
 * Design: docs/02-design/features/comprehensive-land-payable-calc.engine.design.md §1
 */

import { describe, it, expect } from "vitest";
import { calculateComprehensiveTax } from "../../lib/tax-engine/comprehensive-tax";
import { calculateSeparateAggregateLandTax } from "../../lib/tax-engine/comprehensive-separate-land";
import { calculateAggregateLandTax } from "../../lib/tax-engine/comprehensive-land-aggregate";
import type {
  ComprehensiveTaxInput,
  LandParcelInput,
} from "../../lib/tax-engine/types/comprehensive.types";

const BASE = { assessmentYear: 2022, isOneHouseOwner: false, properties: [] };
function input(extra: Partial<ComprehensiveTaxInput>): ComprehensiveTaxInput {
  return { ...BASE, ...extra } as ComprehensiveTaxInput;
}

// 사례10 종합합산 — 서초 200㎡·50%·4.3M/3.2M + 송파-1 100㎡·3.7M/3.3M + 송파-2 200㎡·5M/4M
const AGG: LandParcelInput[] = [
  { parcelId: "s1", jurisdiction: "서초구", area: 200, shareRatio: 0.5, officialPricePerSqm: 4_300_000, priorOfficialPricePerSqm: 3_200_000 },
  { parcelId: "p1", jurisdiction: "송파구", name: "송파구-1", area: 100, shareRatio: 1, officialPricePerSqm: 3_700_000, priorOfficialPricePerSqm: 3_300_000 },
  { parcelId: "p2", jurisdiction: "송파구", name: "송파구-2", area: 200, shareRatio: 1, officialPricePerSqm: 5_000_000, priorOfficialPricePerSqm: 4_000_000 },
];
// 사례11 별도합산 — 평창 100,000㎡·50%·180k/160k + 용인-1 100,000㎡·140k/130k + 용인-2 200,000㎡·140k/130k
const SEP: LandParcelInput[] = [
  { parcelId: "pc1", jurisdiction: "강원 평창군", area: 100_000, shareRatio: 0.5, officialPricePerSqm: 180_000, priorOfficialPricePerSqm: 160_000 },
  { parcelId: "y1", jurisdiction: "경기 용인시", name: "용인-1", area: 100_000, shareRatio: 1, officialPricePerSqm: 140_000, priorOfficialPricePerSqm: 130_000 },
  { parcelId: "y2", jurisdiction: "경기 용인시", name: "용인-2", area: 200_000, shareRatio: 1, officialPricePerSqm: 140_000, priorOfficialPricePerSqm: 130_000 },
];

describe("사례10 종합합산토지분 (LD-A1·A3)", () => {
  const r = calculateComprehensiveTax(input({ landAggregateParcels: AGG })).aggregateLandTax!;

  it("LD-A1: ①~⑤ 전 칸", () => {
    expect(r.calculatedTax).toBe(13_000_000);                       // ①
    expect(r.propertyTaxCredit.propertyTaxAmount).toBe(5_800_000);  // ②ⓐ
    expect(r.propertyTaxCredit.comprehensiveTaxBase).toBe(4_550_000); // ②ⓑ
    expect(r.propertyTaxCredit.propertyTaxBase).toBe(6_050_000);    // ②ⓒ
    expect(r.propertyTaxCredit.creditAmount).toBe(4_361_983);       // ②ⓓ
    expect(r.taxBeforeCap).toBe(8_638_017);                         // ③
    expect(r.currentYearTotalEquivalent).toBe(14_438_017);          // ④가
    expect(r.previousYearEquivalent?.propertyTaxEquiv).toBe(4_575_000);     // ④나①
    expect(r.previousYearEquivalent?.comprehensiveTaxEquiv).toBe(6_029_916); // ④나②
    expect(r.previousYearEquivalent?.detail.calculatedTax).toBe(9_025_000);  // ④나②ⓐ
    expect(r.previousYearEquivalent?.detail.creditAmount).toBe(2_995_084);   // ④나②ⓑ
    expect(r.previousYearEquivalent?.detail.stdTaxNumerator).toBe(3_158_750);
    expect(r.previousYearEquivalent?.detail.stdTaxDenominator).toBe(4_825_000);
    expect(r.previousYearEquivalent?.total).toBe(10_604_916);       // ④나
    expect(r.taxCap?.capAmount).toBe(15_907_374);                   // ④다
    expect(r.determinedTax).toBe(8_638_017);                        // ⑤
  });

  it("LD-A3: ②ⓐ 지자체 분해 (서초/송파)", () => {
    const seocho = r.perJurisdiction!.find((j) => j.jurisdiction === "서초구")!;
    expect(seocho.officialValueSum).toBe(430_000_000);
    expect(seocho.propertyTaxBase).toBe(301_000_000);
    expect(seocho.standardTax).toBe(1_255_000);
    expect(seocho.priorStandardTax).toBe(870_000);
    expect(seocho.capAmount).toBe(1_305_000);
    expect(seocho.imposedTax).toBe(1_255_000);
    const songpa = r.perJurisdiction!.find((j) => j.jurisdiction === "송파구")!;
    expect(songpa.officialValueSum).toBe(1_370_000_000);
    expect(songpa.standardTax).toBe(4_545_000);
    expect(songpa.capAmount).toBe(5_557_500);
    expect(songpa.imposedTax).toBe(4_545_000);
    expect(songpa.parcels).toHaveLength(2);
  });
});

describe("사례11 별도합산토지분 (LD-A2)", () => {
  const r = calculateComprehensiveTax(input({ landSeparateParcels: SEP })).separateLandTax!;

  it("LD-A2: ①~⑤ 전 칸", () => {
    expect(r.calculatedTax).toBe(241_000_000);                      // ①
    expect(r.propertyTaxCredit.propertyTaxAmount).toBe(140_400_000); // ②ⓐ
    expect(r.propertyTaxCredit.comprehensiveTaxBase).toBe(120_400_000); // ②ⓑ
    expect(r.propertyTaxCredit.propertyTaxBase).toBe(141_600_000);   // ②ⓒ
    expect(r.propertyTaxCredit.creditAmount).toBe(119_379_661);      // ②ⓓ
    expect(r.taxBeforeCap).toBe(121_620_339);                       // ③
    expect(r.currentYearTotalEquivalent).toBe(262_020_339);         // ④가
    expect(r.previousYearEquivalent?.propertyTaxEquiv).toBe(129_200_000); // ④나①
    expect(r.previousYearEquivalent?.comprehensiveTaxEquiv).toBe(99_514_663); // ④나②
    expect(r.previousYearEquivalent?.detail.calculatedTax).toBe(202_300_000); // ④나②ⓐ
    expect(r.previousYearEquivalent?.detail.creditAmount).toBe(102_785_337);  // ④나②ⓑ
    expect(r.previousYearEquivalent?.total).toBe(228_714_663);      // ④나
    expect(r.taxCap?.capAmount).toBe(343_071_994);                 // ④다 (floor — 교재 995는 round 표기)
    expect(r.determinedTax).toBe(121_620_339);                     // ⑤
  });
});

describe("게이팅·회귀 (LD-B)", () => {
  it("LD-B1: 직전 공시지가 미입력 → 직전연도 분해 없음·상한 미적용", () => {
    const noPrior = AGG.map((p) => {
      const rest = { ...p };
      delete rest.priorOfficialPricePerSqm;
      return rest;
    });
    const r = calculateComprehensiveTax(input({ landAggregateParcels: noPrior })).aggregateLandTax!;
    expect(r.calculatedTax).toBe(13_000_000);
    expect(r.previousYearEquivalent).toBeUndefined();
    expect(r.taxCap).toBeUndefined();
    // §122 Min 비교값 부재 → imposedTax = standardTax
    expect(r.propertyTaxCredit.propertyTaxAmount).toBe(5_800_000);
    expect(r.perJurisdiction!.every((j) => j.capAmount === undefined)).toBe(true);
  });

  it("LD-B5: 2021 귀속 → 직전연도 자동계산 미산출(2022+ 한정)", () => {
    const r = calculateComprehensiveTax(input({ assessmentYear: 2021, landAggregateParcels: AGG })).aggregateLandTax!;
    expect(r.previousYearEquivalent).toBeUndefined();
    expect(r.taxCap).toBeUndefined();
  });

  it("LD-B-회귀: 집계 직접입력 모드 불변 (perJurisdiction undefined)", () => {
    const r = calculateAggregateLandTax(
      { totalOfficialValue: 1_800_000_000, propertyTaxBase: 1_260_000_000, propertyTaxAmount: 5_800_000 },
      1.0,
    );
    expect(r.calculatedTax).toBe(13_000_000);
    expect(r.perJurisdiction).toBeUndefined();
    expect(r.previousYearEquivalent).toBeUndefined();
  });

  it("LD-B-별도회귀: 직접입력 + 상한 미적용(prev 부재)", () => {
    const r = calculateSeparateAggregateLandTax(
      [{ landId: "x", publicPrice: 51_000_000_000, propertyTaxBase: 35_700_000_000, propertyTaxAmount: 140_400_000 }],
      1.0,
    );
    expect(r.calculatedTax).toBe(241_000_000);
    expect(r.taxCap).toBeUndefined();
    expect(r.determinedTax).toBe(121_620_339);
  });
});
