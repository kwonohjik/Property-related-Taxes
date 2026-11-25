/**
 * PSA-E4 — 종합합산 이관분 세액 · 같은 관할구역 합산 · 필지 합계 세부담상한 anchor.
 * 오라클: 계획서 docs/01-plan/features/property-separate-demolished-requirements.engine.plan.md §13.4(S-1~S-7)·§13.5(K-32~K-47)
 * + UI 문서 §8.1(C1·C6·C13·C14). 기대값은 계획서 오라클과 **직접** 비교한다(엔진 출력으로 기대값을 만들지 않는다).
 */
import { describe, it, expect } from "vitest";
import { calculatePropertyTax } from "../../../lib/tax-engine/property-tax";
import { calculateSeparateAggregateTax } from "../../../lib/tax-engine/separate-aggregate-land";
import { calculateComprehensiveAggregateTax } from "../../../lib/tax-engine/property-tax-comprehensive-aggregate";
import { applyLandBrackets } from "../../../lib/tax-engine/property-land-split-tax";
import { getPropertyRateSet } from "../../../lib/tax-engine/data/property-rate-history";

type Input = Parameters<typeof calculatePropertyTax>[0];

const ITEM = {
  id: "p1",
  jurisdictionCode: "000000",
  landArea: 300,
  officialLandPrice: 1_000_000,
  zoningDistrict: "commercial" as const,
  buildingFloorArea: 100,
  buildingPermit: "yes" as const, // PSA-E3 — 영 §101① 단서(비철거 필지 허가·사용승인 «예»)
};

function separate(over: Record<string, unknown> = {}, item: Record<string, unknown> = {}, extra: Partial<Input> = {}) {
  return calculatePropertyTax({
    objectType: "land",
    landTaxType: "separate_aggregate",
    publishedPrice: 300_000_000,
    targetDate: "2026-06-01",
    otherSeparateAggregateValue: 0,
    otherComprehensiveValue: 0,
    separateAggregateItem: { ...ITEM, ...item },
    ...over,
    ...extra,
  } as Input);
}

/**
 * PSA-E2 — 철거 요건 칸: 철거된 것 = 건축물 · 허가·사용승인 받음 · 건축 외 용도 아님(과세기준일 2026.6.1. 시행본이 기간 안일 때 요구하는 칸 전부).
 * 철거 1년 초과는 기간 접힘이 먼저라 사실 칸을 읽지 않지만 종류(`demolishedKind`)는 항상 요구된다.
 */
const DEMOLISHED_OK = { demolishedKind: "building" as const, demolishedPermit: "yes" as const, demolishedOtherUse: "no" as const };
/** 철거 1년 초과(2025-05-31 → 2026-06-01) — 전량 종합합산 이관 */
const PERIOD_OVER = { demolished: true, demolishedDate: "2025-05-31", demolishedKind: "building" as const };
/** 공업 4배·바닥 100 → 별도합산 400㎡ + 이관 600㎡ (S-4) */
const S4 = { landArea: 1000, zoningDistrict: "industrial" as const };

describe("PSA-E4 — 이관분 세액 (§13.4 오라클)", () => {
  it("S-1 K-32 철거 1년 초과 상업 300㎡ 전량 이관 — 현행 0 → 본세 800,000 / 총액 960,000", () => {
    const r = separate({}, PERIOD_OVER);
    expect(r.landSplit?.separate).toBeUndefined();
    expect(r.landSplit?.comprehensive).toMatchObject({ ownValue: 300_000_000, combinedTaxBase: 210_000_000, share: 800_000 });
    expect(r.determinedTax).toBe(800_000);
    expect(r.totalPayable).toBe(960_000);
    expect(r.taxBase).toBe(210_000_000);
  });

  it("S-2u S-1 + 도시지역 — 도시지역분은 이 필지 자기 과세표준 210,000,000 × 0.14% = 294,000 → 1,254,000", () => {
    const r = separate({ isUrbanArea: true }, PERIOD_OVER);
    expect(r.surtax.urbanAreaTax).toBe(294_000);
    expect(r.surtax.localEducationTax).toBe(160_000);
    expect(r.totalPayable).toBe(1_254_000);
  });

  it("S-3 K-35 일반주거 400㎡ 전량 이관 — 과표 280,000,000 → 1,150,000 / 1,380,000", () => {
    const r = separate({ publishedPrice: 400_000_000 }, { landArea: 400, zoningDistrict: "general_residential", ...PERIOD_OVER });
    expect(r.determinedTax).toBe(1_150_000);
    expect(r.totalPayable).toBe(1_380_000);
  });

  it("S-4 K-36 공업 1,000㎡·바닥 100 — 별도합산 640,000 + 이관 1,850,000 = 2,490,000 / 2,988,000 (현행: 이관분이 버려져 640,000)", () => {
    const r = separate({ publishedPrice: 1_000_000_000 }, S4);
    expect(r.landSplit?.separate).toMatchObject({ ownValue: 400_000_000, combinedTaxBase: 280_000_000, share: 640_000 });
    expect(r.landSplit?.comprehensive).toMatchObject({
      ownValue: 600_000_000,
      combinedTaxBase: 420_000_000,
      share: 1_850_000,
      appliedRate: 0.005,
      progressiveDeduction: 250_000,
      transferReasons: ["area_excess"],
    });
    expect(r.calculatedTax).toBe(2_490_000);
    expect(r.determinedTax).toBe(2_490_000);
    expect(r.totalPayable).toBe(2_988_000);
    expect(r.taxBase).toBe(700_000_000); // 이 필지 자기 과세표준 = 별도합산분 280M + 종합합산분 420M
    expect(r.landSplit?.jurisdictionBasis).toBe("같은 지방자치단체 관할구역 합산");
  });

  it("S-5 K-37 S-4 + 같은 관할 타 종합합산 2억 — 합산세 2,550,000 → 이 필지 몫 1,912,500 → 2,552,500 / 3,063,000 (+62,500)", () => {
    const r = separate({ publishedPrice: 1_000_000_000, otherComprehensiveValue: 200_000_000 }, S4);
    expect(r.landSplit?.comprehensive).toMatchObject({
      otherValue: 200_000_000,
      combinedValue: 800_000_000,
      combinedTaxBase: 560_000_000,
      combinedGrossTax: 2_550_000,
      share: 1_912_500,
    });
    expect(r.determinedTax).toBe(2_552_500);
    expect(r.totalPayable).toBe(3_063_000);
    expect(r.determinedTax - 2_490_000).toBe(62_500);
  });

  it("S-5u S-5 + 도시지역 — 도시지역분은 합산 과표(560,000,000)가 아니라 이 필지 자기 과표 700,000,000 × 0.14% = 980,000 (Q-18)", () => {
    const r = separate({ publishedPrice: 1_000_000_000, otherComprehensiveValue: 200_000_000, isUrbanArea: true }, S4);
    expect(r.surtax.urbanAreaTax).toBe(980_000);
    expect(r.surtax.localEducationTax).toBe(510_500); // 본세 2,552,500 × 20%
    expect(r.totalPayable).toBe(2_552_500 + 510_500 + 980_000);
  });

  it("S-6 K-38 S-4 + 같은 관할 타 별도합산 1억 — 합산세 850,000 → 몫 680,000 → 2,530,000 / 3,036,000 (+40,000)", () => {
    const r = separate({ publishedPrice: 1_000_000_000, otherSeparateAggregateValue: 100_000_000 }, S4);
    expect(r.landSplit?.separate).toMatchObject({ combinedValue: 500_000_000, combinedTaxBase: 350_000_000, combinedGrossTax: 850_000, share: 680_000 });
    expect(r.landSplit?.comprehensive?.share).toBe(1_850_000);
    expect(r.determinedTax).toBe(2_530_000);
    expect(r.totalPayable).toBe(3_036_000);
    expect(r.determinedTax - 2_490_000).toBe(40_000);
  });

  it("K-44 타 종합합산 0(명시) = K-32/S-4 값(몫 비율 1)", () => {
    expect(separate({ publishedPrice: 1_000_000_000, otherComprehensiveValue: 0 }, S4).determinedTax).toBe(2_490_000);
  });

  it("UI C1 — 철거 2026-03-01 상업 1,000㎡(바닥 100 → 한도 300): 별도합산 430,000 + 이관 700㎡ 2,200,000 = 2,630,000 / 3,156,000", () => {
    const r = separate({ publishedPrice: 1_000_000_000 }, { landArea: 1000, demolished: true, demolishedDate: "2026-03-01", ...DEMOLISHED_OK });
    expect(r.landSplit?.separate?.share).toBe(430_000);
    expect(r.landSplit?.comprehensive?.share).toBe(2_200_000);
    expect(r.determinedTax).toBe(2_630_000);
    expect(r.totalPayable).toBe(3_156_000);
  });

  it("UI C6 — 철거 2025-05-31(1년 초과) 상업 1,000㎡: 현행 0 → 3,900,000", () => {
    const r = separate({ publishedPrice: 1_000_000_000 }, { landArea: 1000, ...PERIOD_OVER });
    expect(r.determinedTax).toBe(3_250_000);
    expect(r.totalPayable).toBe(3_900_000);
  });

  it("UI C5 — 철거 2025-06-01(1년 만료일 당일): 별도합산 유지 → 이관분 면적 초과분만 종합합산", () => {
    const r = separate({ publishedPrice: 1_000_000_000 }, { landArea: 1000, demolished: true, demolishedDate: "2025-06-01", ...DEMOLISHED_OK });
    expect(r.landSplit?.separate?.share).toBe(430_000);
    expect(r.totalPayable).toBe(3_156_000);
  });
});

describe("PSA-E4 — 요구 술어 · 엔진이 읽는 칸만", () => {
  it("K-40 400㎡ 전량 별도합산 — 이관분 0이라 타 종합합산 칸은 비요구·엔진이 읽지 않는다(stale 값 무해)", () => {
    const clean = separate({ otherSeparateAggregateValue: 0, otherComprehensiveValue: undefined }, { landArea: 300 });
    const stale = separate({ otherSeparateAggregateValue: 0, otherComprehensiveValue: 999_000_000 }, { landArea: 300 });
    expect(clean.determinedTax).toBe(430_000);
    expect(stale.determinedTax).toBe(430_000);
    expect(stale.landSplit?.comprehensive).toBeUndefined();
    expect(stale.warnings.some((w) => w.includes("합산 입력이 없어"))).toBe(false);
  });

  it("K-41 400㎡ 전량 이관 — 별도합산분 0이라 타 별도합산 칸은 비요구·읽지 않는다", () => {
    const stale = separate({ otherSeparateAggregateValue: 999_000_000 }, PERIOD_OVER);
    expect(stale.determinedTax).toBe(800_000);
    expect(stale.landSplit?.separate).toBeUndefined();
  });

  it("요구되는데 엔진 직접 호출에서 칸이 없으면 이 필지 단독 + 확인 필요 고지(Zod가 입구에서 막는다)", () => {
    const r = separate({ otherComprehensiveValue: undefined }, PERIOD_OVER);
    expect(r.determinedTax).toBe(800_000);
    expect(r.warnings.some((w) => w.includes("합산 입력이 없어 이 필지 단독"))).toBe(true);
  });

  it("합산 입력이 있으면 합산 안내 고지", () => {
    const r = separate({ otherComprehensiveValue: 1 }, PERIOD_OVER);
    expect(r.warnings.some((w) => w.includes("공시가액 비율로 나눈 값"))).toBe(true);
  });
});

describe("PSA-E4 — 직접 종합합산 선택 (Q-16)", () => {
  const direct = (over: Partial<Input> = {}) =>
    calculatePropertyTax({
      objectType: "land",
      landTaxType: "comprehensive_aggregate",
      publishedPrice: 300_000_000,
      targetDate: "2026-06-01",
      otherComprehensiveValue: 0,
      ...over,
    } as Input);

  it("C13 공시가격 3억 + 타 종합합산 0(명시) — 960,000 불변", () => {
    const r = direct();
    expect(r.determinedTax).toBe(800_000);
    expect(r.totalPayable).toBe(960_000);
    expect(r.landSplit?.comprehensive?.transferReasons).toEqual(["direct_type"]);
  });

  it("C14 + 타 종합합산 1억 — 합산 가액 4억 → 과표 280,000,000 → 1,150,000 → 몫 862,500 → 총액 1,035,000", () => {
    const r = direct({ otherComprehensiveValue: 100_000_000 });
    expect(r.landSplit?.comprehensive).toMatchObject({ combinedTaxBase: 280_000_000, combinedGrossTax: 1_150_000, share: 862_500 });
    expect(r.determinedTax).toBe(862_500);
    expect(r.totalPayable).toBe(1_035_000);
  });
});

describe("PSA-E4 — 필지 합계 세부담상한 (Q-15)", () => {
  it("S-7 K-45 S-1 + recompute 직전 과표 150,000,000 → 직전 세액상당액 500,000 → 상한 750,000 → 총액 900,000", () => {
    const r = separate({ taxCapMode: "recompute", previousYearTaxBase: 150_000_000 }, PERIOD_OVER);
    expect(r.taxCapBasisTax).toBe(500_000);
    expect(r.calculatedTax).toBe(800_000);
    expect(r.determinedTax).toBe(750_000);
    expect(r.taxCapRate).toBe(1.5);
    expect(r.totalPayable).toBe(900_000);
    expect(r.landSplit?.cap).toMatchObject({ applied: true, basisTax: 500_000, basisTaxSeparate: 0, basisTaxComprehensive: 500_000 });
    expect(r.recomputeDetail?.recomputedTax).toBe(500_000);
  });

  it("S-7b S-1 + direct(직전 실제 세액 100,000) — 이관분이 있어 상한 미적용 + 고지", () => {
    const r = separate({ previousYearTax: 100_000 }, PERIOD_OVER);
    expect(r.determinedTax).toBe(800_000);
    expect(r.taxCapRate).toBe(1);
    expect(r.warnings.some((w) => w.includes("세부담상한(150%)을 적용하지 않았습니다"))).toBe(true);
  });

  it("direct + 이관분 0(전량 별도합산) — 종전 그대로 상한 적용: 430,000 vs 100,000 × 150% = 150,000", () => {
    const r = separate({ previousYearTax: 100_000 });
    expect(r.calculatedTax).toBe(430_000);
    expect(r.determinedTax).toBe(150_000);
    expect(r.taxCapRate).toBe(1.5);
  });

  it("recompute — 별도합산분·이관분 둘 다 있으면 직전 과표를 가액 비율로 나눠 분류별 직전 세율 재산정", () => {
    // 별도합산 400M : 이관 600M = 4 : 6. 직전 과표 100,000,000 → 별도 40,000,000(0.2%=80,000) · 종합 60,000,000(0.3%−50,000=130,000) = 210,000 → 상한 315,000
    const r = separate({ publishedPrice: 1_000_000_000, taxCapMode: "recompute", previousYearTaxBase: 100_000_000 }, S4);
    expect(r.landSplit?.cap).toMatchObject({ basisTaxSeparate: 80_000, basisTaxComprehensive: 130_000, basisTax: 210_000 });
    expect(r.calculatedTax).toBe(2_490_000);
    expect(r.determinedTax).toBe(315_000);
  });

  it("recompute — 직전 세율이 분류별로 다른 구간 시료: 직전 과표 400,000,000 → 별도 160M 0.2%=320,000 · 종합 240M 0.5%−250,000=950,000 → 1,270,000 → 상한 1,905,000", () => {
    const r = separate({ publishedPrice: 1_000_000_000, taxCapMode: "recompute", previousYearTaxBase: 400_000_000 }, S4);
    expect(r.landSplit?.cap).toMatchObject({ basisTaxSeparate: 320_000, basisTaxComprehensive: 950_000, basisTax: 1_270_000 });
    expect(r.determinedTax).toBe(1_905_000);
  });

  it("합계 상한 — 별도합산분만이 아니라 이 필지 합계(별도합산분 + 이관분)에 건다", () => {
    // 직전 세액상당액 1,000,000 → 상한 1,500,000 < 합계 2,490,000. (별도합산분만 비교했다면 640,000 < 1,500,000 이라 상한이 안 걸린다)
    const r = separate({ publishedPrice: 1_000_000_000, taxCapMode: "recompute", previousYearTaxBase: 400_000_000 }, { ...S4, buildingFloorArea: 100 });
    expect(r.calculatedTax).toBe(2_490_000);
    expect(r.determinedTax).toBeLessThan(r.calculatedTax);
    expect(r.landSplit?.taxBeforeCap).toBe(2_490_000);
  });

  it("recompute 직전 과표를 입력했는데 직전 연도 세율이 같아도 합산 입력이 있으면 «이 필지 단독 직전 기준» 고지", () => {
    const r = separate({ taxCapMode: "recompute", previousYearTaxBase: 150_000_000, otherComprehensiveValue: 1 }, PERIOD_OVER);
    expect(r.warnings.some((w) => w.includes("합산 효과는 넣지 않음"))).toBe(true);
  });

  it("직전 세액 미입력 — 상한 미적용 + (별도합산 경로) 종전 고지 유지", () => {
    const r = separate({}, PERIOD_OVER);
    expect(r.taxCapRate).toBe(1);
    expect(r.warnings.some((w) => w.includes("전년도 세부담 상당세액이 입력되지 않아"))).toBe(true);
  });
});

describe("PSA-E4 — 회귀 0 (K-47): 이관·합산이 없는 입력은 종전 `calculateSeparateAggregateTax`와 같은 값", () => {
  const cases = [
    { landArea: 300, price: 1_000_000, floor: 100, zone: "commercial" as const },
    { landArea: 1000, price: 1_000_000, floor: 300, zone: "industrial" as const },
    { landArea: 120, price: 4_000_000, floor: 40, zone: "general_residential" as const },
    { landArea: 2000, price: 3_000_000, floor: 600, zone: "commercial" as const },
    { landArea: 90, price: 12_345_678, floor: 30, zone: "commercial" as const },
  ];
  for (const c of cases) {
    it(`${c.zone} ${c.landArea}㎡ × ${c.price.toLocaleString()}`, () => {
      const item = { ...ITEM, landArea: c.landArea, officialLandPrice: c.price, zoningDistrict: c.zone, buildingFloorArea: c.floor };
      const legacy = calculateSeparateAggregateTax({ taxpayerId: "single", targetYear: 2026, landList: [{ ...item, taxBaseDate: "2026-06-01" }] });
      const r = separate({ publishedPrice: c.price * c.landArea }, item);
      if (legacy.totalExcessOfficialValue === 0) {
        expect(r.taxBase).toBe(legacy.taxBase);
        expect(r.calculatedTax).toBe(legacy.grossTax);
        expect(r.determinedTax).toBe(legacy.taxAfterCap);
        expect(r.fairMarketRatio).toBe(legacy.fairMarketValueRatio);
      } else {
        // 이관분이 있으면 별도합산분 몫은 종전과 같고, 이관분이 더해진다
        expect(r.landSplit?.separate?.share).toBe(legacy.grossTax);
        expect(r.determinedTax).toBeGreaterThan(legacy.grossTax);
      }
    });
  }
});

describe("PSA-E4 — 누진세율 leaf ≡ 기존 함수 (구간 경계)", () => {
  const rs = getPropertyRateSet(2026);
  const bases = [0, 1, 49_999_999, 50_000_000, 50_000_001, 99_999_999, 100_000_000, 100_000_001, 199_999_999, 200_000_000, 200_000_001, 999_999_999, 1_000_000_000, 1_000_000_001, 5_000_000_000];
  it("종합합산", () => {
    for (const b of bases) expect(applyLandBrackets(b, rs.landComprehensive).tax).toBe(calculateComprehensiveAggregateTax(b));
  });
  it("별도합산(한 필지 전량 인정분 — 공시가액을 FMR 역산하지 않고 단일 세율표 직접 대조)", () => {
    expect(applyLandBrackets(200_000_000, rs.landSeparateAggregate).tax).toBe(400_000);
    expect(applyLandBrackets(200_000_001, rs.landSeparateAggregate).tax).toBe(400_000); // 0.3% × 200,000,001 − 200,000 = 400,000.003 → 400,000
    expect(applyLandBrackets(1_000_000_000, rs.landSeparateAggregate).tax).toBe(2_800_000);
    expect(applyLandBrackets(1_000_000_001, rs.landSeparateAggregate).tax).toBe(2_800_000);
  });
});

describe("PSA-E4 — FMR 두 분류 단일 소스", () => {
  it("DB 행(land_building 0.60 시료)이면 별도합산분·이관분 모두 같은 비율을 쓴다", () => {
    const rates = new Map([
      ["property:fair_market_ratio:land_building", { rateTable: { ratio: 0.6 } }],
    ]) as unknown as Parameters<typeof calculatePropertyTax>[1];
    const r = calculatePropertyTax(
      {
        objectType: "land",
        landTaxType: "separate_aggregate",
        publishedPrice: 1_000_000_000,
        targetDate: "2026-06-01",
        otherSeparateAggregateValue: 0,
        otherComprehensiveValue: 0,
        separateAggregateItem: { ...ITEM, ...S4 },
      } as Input,
      rates,
    );
    expect(r.fairMarketRatio).toBe(0.6);
    expect(r.landSplit?.separate?.combinedTaxBase).toBe(240_000_000); // 400M × 0.6
    expect(r.landSplit?.comprehensive?.combinedTaxBase).toBe(360_000_000); // 600M × 0.6
  });
});
