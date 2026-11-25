/**
 * PSE-E0 — 분리과세(공장용지·목장용지) 면적 한도 초과분 → 종합합산 이관 세액 anchor.
 * 계획서: docs/01-plan/features/property-separated-excess-transfer.engine.plan.md (§3 Pre-Do 표 · §6 케이스 K-1~K-19).
 *
 * 구성
 *  1. 회귀 0 — 초과 0 입력은 PSE 구현 전 master(f6a059725)의 결과와 **바이트 동일**(골든 JSON).
 *  2. 오라클 — F-1·F-1u·F-2·P-1·P-2. 기대값은 계획서 §3.2의 손계산 값(누진 구간 250,000 + 0.5%·합산 몫)이며 엔진 출력으로 만들지 않는다.
 *     PSE-E0 시점에는 이관분 세액이 없어 **빨강으로 시작**한다 — PSE-E2에서 초록이 된다.
 */
import { describe, it, expect } from "vitest";
import { calculatePropertyTax } from "../../../lib/tax-engine/property-tax";
import type { PropertyTaxInput } from "../../../lib/tax-engine/types/property.types";
import golden from "./fixtures/separated-excess-zero-golden.json";
import { FACTORY, PASTURE, ZERO_EXCESS_CASES } from "./fixtures/separated-excess-zero-cases";
import {
  PROPERTY_LAND_SPLIT_DIRECT_CAP_NOTICE,
  PROPERTY_LAND_SPLIT_NO_OTHER_NOTICE,
  PROPERTY_LAND_SPLIT_SEPARATED_NOTICE,
} from "../../../lib/tax-engine/property-land-split-tax";
import { PROPERTY_LAND_SPLIT_EXCESS_COMPREHENSIVE_NOTICE } from "../../../lib/tax-engine/property-tax-separated";
import { PROPERTY_LAND_SPLIT } from "../../../lib/tax-engine/legal-codes";

const BASE = { objectType: "land", landTaxType: "separated", targetDate: "2026-06-01" } as const;

/** F: 산업단지 공장 15,000㎡ · ㎡당 100,000원 = 15억 — 기준 12,000㎡(인정 12억) · 초과 3,000㎡(3억) */
const F_ITEM = { ...FACTORY, factoryTotalLandArea: 15000 };
const F = (over: Partial<PropertyTaxInput> = {}) =>
  calculatePropertyTax({ ...BASE, publishedPrice: 1_500_000_000, separateTaxationItem: F_ITEM, ...over } as PropertyTaxInput);

/** P: 목장 2,000㎡ · ㎡당 50,000원 = 1억 — 기준 625㎡(인정 31,250,000) · 초과 1,375㎡(68,750,000) */
const P_ITEM = { ...PASTURE, pastureTotalLandArea: 2000 };
const P = (over: Partial<PropertyTaxInput> = {}) =>
  calculatePropertyTax({ ...BASE, publishedPrice: 100_000_000, separateTaxationItem: P_ITEM, ...over } as PropertyTaxInput);

describe("PSE-E0 회귀 0 — 초과 0 입력은 구현 전 결과와 바이트 동일", () => {
  it("골든 입력 목록과 골든 키가 같다(누락·추가 방지)", () => {
    expect(Object.keys(golden).sort()).toEqual(Object.keys(ZERO_EXCESS_CASES).sort());
  });

  for (const [name, input] of Object.entries(ZERO_EXCESS_CASES)) {
    it(`K-1 ${name}`, () => {
      const now = JSON.parse(JSON.stringify(calculatePropertyTax(input)));
      expect(now).toStrictEqual((golden as Record<string, unknown>)[name]);
      expect("landSplit" in now).toBe(false);
    });
  }
});

describe("PSE-E0 오라클 — 이관분 세액(손계산 값 · 구현 전 빨강)", () => {
  it("K-2 F-1 공장 초과 3,000㎡ · 타 0 — 분리과세분 1,680,000 + 이관분 800,000 = 2,480,000 / 총 2,976,000", () => {
    const r = F({ otherComprehensiveValue: 0 });
    expect(r.determinedTax).toBe(2_480_000);
    expect(r.surtax.localEducationTax).toBe(496_000);
    expect(r.totalPayable).toBe(2_976_000);
  });

  it("K-3 F-1u 도시지역 — 도시지역분 = 자기 과세표준 1,050,000,000 × 0.14% = 1,470,000 → 총 4,446,000", () => {
    const r = F({ otherComprehensiveValue: 0, isUrbanArea: true });
    expect(r.surtax.urbanAreaTax).toBe(1_470_000);
    expect(r.totalSurtax).toBe(1_966_000);
    expect(r.totalPayable).toBe(4_446_000);
  });

  it("K-4 F-2 타 종합합산 2억 — 합산 5억 → 과표 3.5억 → 합산세 1,500,000 → 이 필지 몫 900,000 → 본세 2,580,000 / 총 3,096,000", () => {
    const r = F({ otherComprehensiveValue: 200_000_000 });
    expect(r.determinedTax).toBe(2_580_000);
    expect(r.totalPayable).toBe(3_096_000);
  });

  it("K-5 P-1 목장 초과 1,375㎡ · 타 0 — 15,312 + 96,250 = 111,562 / 총 133,874", () => {
    const r = P({ otherComprehensiveValue: 0 });
    expect(r.determinedTax).toBe(111_562);
    expect(r.totalPayable).toBe(133_874);
  });

  it("K-6 P-2 타 종합합산 2억 — 몫 176,671 → 본세 191,983 / 총 230,379", () => {
    const r = P({ otherComprehensiveValue: 200_000_000 });
    expect(r.determinedTax).toBe(191_983);
    expect(r.totalPayable).toBe(230_379);
  });
});

const OLD_EXCLUDE_NOTICE = "분리과세 대상 토지는 종합부동산세 과세 대상에서 제외됩니다";

describe("PSE-E2 이관분 경로 — 결과 echo·합계·정합 (K-2·K-8·K-13·K-16~K-19)", () => {
  it("K-2 공장 F-1 echo — 분리과세분(단일세율)·종합합산 이관분(합산 몫)·합계 · 별도합산분 없음", () => {
    const r = F({ otherComprehensiveValue: 0 });
    const ls = r.landSplit!;
    expect(ls.separate).toBeUndefined();
    expect(ls.separated).toEqual({
      category: "standard",
      appliedRate: 0.002,
      ownValue: 1_200_000_000,
      ownTaxBase: 840_000_000,
      tax: 1_680_000,
      areaLimit: { kind: "factory", totalArea: 15000, standardArea: 12000, recognizedArea: 12000, excessArea: 3000 },
    });
    expect(ls.comprehensive).toMatchObject({
      ownValue: 300_000_000, otherValue: 0, combinedValue: 300_000_000, combinedTaxBase: 210_000_000,
      combinedGrossTax: 800_000, share: 800_000, transferReasons: ["factory_area_excess"],
    });
    expect(ls.taxBeforeCap).toBe(2_480_000);
    expect(r.taxBase).toBe(1_050_000_000); // 이 필지 자기 과세표준 = 840,000,000 + 210,000,000
    expect(r.calculatedTax).toBe(2_480_000);
    expect(r.calculatedTaxBeforeCap).toBe(2_480_000);
    expect(r.appliedRate).toBe(0); // 분류별 세율 혼합 — 분류별은 landSplit
    expect(r.fairMarketRatio).toBe(0.7);
    expect(r.taxCapRate).toBe(1);
  });

  it("K-5 목장 P-1 echo — 저율 0.07% 분리과세분 + 이관분 · 사유 pasture_area_excess", () => {
    const ls = P({ otherComprehensiveValue: 0 }).landSplit!;
    expect(ls.separated).toMatchObject({
      category: "low_rate", appliedRate: 0.0007, ownValue: 31_250_000, ownTaxBase: 21_875_000, tax: 15_312,
      areaLimit: { kind: "pasture", totalArea: 2000, standardArea: 625, recognizedArea: 625, excessArea: 1375 },
    });
    expect(ls.comprehensive).toMatchObject({ ownValue: 68_750_000, combinedTaxBase: 48_125_000, share: 96_250, transferReasons: ["pasture_area_excess"] });
  });

  it("K-4 F-2 합산 — 합산 가액 5억 · 과표 3.5억 · 합산세 1,500,000 · 몫 900,000(분모는 합산 가액)", () => {
    const c = F({ otherComprehensiveValue: 200_000_000 }).landSplit!.comprehensive!;
    expect(c).toMatchObject({ otherValue: 200_000_000, combinedValue: 500_000_000, combinedTaxBase: 350_000_000, combinedGrossTax: 1_500_000, share: 900_000 });
  });

  it("K-8 `0` 명시 = K-2 · 빈칸(엔진 직접 호출)은 단독 계산 + NO_OTHER 고지(자동 0 아님 — 입구 차단은 ⑧·⑫)", () => {
    const zero = F({ otherComprehensiveValue: 0 });
    const blank = F();
    expect(blank.determinedTax).toBe(zero.determinedTax);
    expect(blank.warnings).toContain(PROPERTY_LAND_SPLIT_NO_OTHER_NOTICE);
    expect(zero.warnings).not.toContain(PROPERTY_LAND_SPLIT_NO_OTHER_NOTICE);
  });

  it("K-16 합 보존 — 분리과세분 가액 + 이관분 가액 = 공시가격(잔액은 이관분이 흡수)", () => {
    for (const [r, price] of [[F({ otherComprehensiveValue: 0 }), 1_500_000_000], [P({ otherComprehensiveValue: 0 }), 100_000_000]] as const) {
      expect(r.landSplit!.separated!.ownValue + r.landSplit!.comprehensive!.ownValue).toBe(price);
    }
    // 나누어떨어지지 않는 가액 — 잔액 흡수
    const odd = calculatePropertyTax({ ...BASE, publishedPrice: 1_000_000_007, separateTaxationItem: F_ITEM, otherComprehensiveValue: 0 } as PropertyTaxInput);
    expect(odd.landSplit!.separated!.ownValue + odd.landSplit!.comprehensive!.ownValue).toBe(1_000_000_007);
  });

  it("K-13 직전 세액 direct — 이관분이 있으면 상한 미적용 + 고지(직전 구분을 알 수 없다)", () => {
    const r = F({ otherComprehensiveValue: 0, previousYearTax: 1_500_000 });
    expect(r.determinedTax).toBe(2_480_000);
    expect(r.taxCapRate).toBe(1);
    expect(r.warnings).toContain(PROPERTY_LAND_SPLIT_DIRECT_CAP_NOTICE);
  });

  it("K-17 종부세 고지 — 초과 > 0이면 이관분 고지문(현행 «제외» 문구 아님) · 초과 0이면 현행 문구", () => {
    const over = F({ otherComprehensiveValue: 0 }).warnings.join("\n");
    expect(over).toContain(PROPERTY_LAND_SPLIT_EXCESS_COMPREHENSIVE_NOTICE);
    expect(over).not.toContain(OLD_EXCLUDE_NOTICE);
    expect(over).toContain(PROPERTY_LAND_SPLIT_SEPARATED_NOTICE);
    const zero = calculatePropertyTax(ZERO_EXCESS_CASES["F-0 공장 8,000㎡(이내)"]).warnings.join("\n");
    expect(zero).toContain(OLD_EXCLUDE_NOTICE);
    expect(zero).not.toContain(PROPERTY_LAND_SPLIT_EXCESS_COMPREHENSIVE_NOTICE);
  });

  it("경고 문구 — «인별 합산» 서술 정정(관할구역 합산) · substring «종합합산과세대상으로 이관» 유지", () => {
    const w = F({ otherComprehensiveValue: 0 }).warnings.join("\n");
    expect(w).toContain("종합합산과세대상으로 이관");
    expect(w).not.toContain("인별 합산");
    expect(w).toContain("같은 지방자치단체 관할구역");
    expect(P({ otherComprehensiveValue: 0 }).warnings.join("\n")).not.toContain("인별 합산");
  });

  it("법령 근거 — 이관 근거(§106①1호)·합산(§113①1호)·분리과세 과표(§113①3호)가 결과에 실린다", () => {
    const b = F({ otherComprehensiveValue: 0 }).legalBasis;
    expect(b).toContain(PROPERTY_LAND_SPLIT.SEPARATED_EXCESS_TO_COMPREHENSIVE);
    expect(b).toContain(PROPERTY_LAND_SPLIT.AGGREGATION_COMPREHENSIVE);
  });

  it("K-19 총액 정합 — 본세 + 부가세 합 = 납부 총액 · 분납 기준은 합계 본세(F-2 2,580,000 > 250만 → 가능)", () => {
    for (const r of [F({ otherComprehensiveValue: 0 }), F({ otherComprehensiveValue: 200_000_000 }), P({ otherComprehensiveValue: 0 }), F({ otherComprehensiveValue: 0, isUrbanArea: true })]) {
      expect(r.determinedTax + r.totalSurtax).toBe(r.totalPayable);
    }
    expect(F({ otherComprehensiveValue: 0 }).installment.eligible).toBe(false); // 2,480,000 ≤ 2,500,000
    expect(F({ otherComprehensiveValue: 200_000_000 }).installment.eligible).toBe(true); // 2,580,000
  });

  it("K-18 공유지분 — 안분 합이 합계 본세·합계 납부액과 같다(기존 buildTaxpayerOutcome 경로)", () => {
    const r = F({
      otherComprehensiveValue: 200_000_000,
      taxpayerInfo: { registeredOwner: "A", coOwnershipShares: [{ ownerId: "A", shareRatio: 0.6 }, { ownerId: "B", shareRatio: 0.4 }] },
    } as Partial<PropertyTaxInput>);
    expect(r.taxpayer?.type).toBe("co_owner");
    const d = r.coOwnershipDistribution!.distributions;
    expect(d.reduce((a, x) => a + x.taxAmount, 0)).toBe(2_580_000);
    expect(d.reduce((a, x) => a + x.totalAmount, 0)).toBe(3_096_000);
  });

  it("K-1 stale otherComprehensiveValue — 초과 0이면 엔진이 읽지 않는다(M-7: 값이 달라도 결과 동일)", () => {
    const a = calculatePropertyTax({ ...BASE, publishedPrice: 800_000_000, separateTaxationItem: FACTORY, otherComprehensiveValue: 0 } as PropertyTaxInput);
    const b = calculatePropertyTax({ ...BASE, publishedPrice: 800_000_000, separateTaxationItem: FACTORY, otherComprehensiveValue: 999_000_000 } as PropertyTaxInput);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.landSplit).toBeUndefined();
  });

  it("K-15 한도 없는 유형은 이관 경로에 들어가지 않는다 — 농지·골프장에 합산 칸이 있어도 무시", () => {
    const farm = calculatePropertyTax({ ...BASE, publishedPrice: 100_000_000, separateTaxationItem: { isFarmland: true }, otherComprehensiveValue: 5_000_000_000 } as PropertyTaxInput);
    expect(farm.landSplit).toBeUndefined();
    expect(farm.determinedTax).toBe(49_000);
  });

  it("K-11 시지역 그 밖 공장(urban)·허가 미이행은 분리과세 아님 — 기존대로 던진다(이관 로직 미진입)", () => {
    expect(() => F({ separateTaxationItem: { ...F_ITEM, factoryLocation: "urban" } } as Partial<PropertyTaxInput>)).toThrow();
    expect(() => F({ separateTaxationItem: { ...F_ITEM, factoryIsUnpermitted: true } } as Partial<PropertyTaxInput>)).toThrow();
  });
});

describe("PSE-E4 recompute 세부담상한 — 분류별 직전 연도 세율 재산정 (K-14 · F-3 · M-12)", () => {
  /**
   * 손계산 오라클 — F-1(분리과세분 가액 12억 · 이관분 3억 · 합계 15억) · 직전 과세표준 5억 · 직전 연도 2025.
   *  분류별 직전 과표 = 5억 × 12/15 = 4억(분리과세분) · 5억 × 3/15 = 1억(이관분)
   *  분리과세분 직전 세액 = 4억 × 0.2% = 800,000
   *  이관분 직전 세액 = 1억(구간2 상한 이하) × 0.3% − 누진공제 50,000 = 250,000
   *  직전 세액상당액 = 1,050,000 → 상한 150% = 1,575,000 < 당해 합계 2,480,000 → 징수 본세 1,575,000
   */
  const recompute = (over: Partial<PropertyTaxInput> = {}) =>
    F({ otherComprehensiveValue: 0, taxCapMode: "recompute", previousYearTaxBase: 500_000_000, ...over });

  it("K-14 F-3 — 직전 세액상당액 1,050,000 → 상한 1,575,000 적용 · 교육세 315,000 · 총 1,890,000", () => {
    const r = recompute();
    expect(r.calculatedTaxBeforeCap).toBe(2_480_000);
    expect(r.determinedTax).toBe(1_575_000);
    expect(r.taxCapRate).toBe(1.5);
    expect(r.surtax.localEducationTax).toBe(315_000);
    expect(r.totalPayable).toBe(1_890_000);
    expect(r.landSplit!.cap).toEqual({
      applied: true, capRate: 1.5, basisTax: 1_050_000, basisTaxSeparated: 800_000, basisTaxComprehensive: 250_000,
    });
    expect(r.landSplit!.cap).not.toHaveProperty("basisTaxSeparate"); // 별도합산분 직전액 키는 별도합산 전용
    expect(r.taxCapMode).toBe("recompute");
    expect(r.taxCapBasisTax).toBe(1_050_000);
    expect(r.warnings.some((w) => w.includes("직전 과세표준을 분류별 가액 비율로 나눠"))).toBe(true);
    expect(r.warnings).not.toContain(PROPERTY_LAND_SPLIT_DIRECT_CAP_NOTICE);
  });

  it("상한이 합계에 걸린다 — 이관분에만 걸었다면 1,680,000 + 250,000 = 1,930,000 (M-12)", () => {
    expect(recompute().determinedTax).not.toBe(1_930_000);
    expect(recompute().landSplit!.taxBeforeCap).toBe(2_480_000);
  });

  it("직전 세액상당액이 크면 상한 미적용 — 직전 과표 15억 → 3,150,000 × 150% ≥ 2,480,000", () => {
    // 분리과세분 직전 12억 × 0.2% = 2,400,000 · 이관분 직전 3억(구간3) × 0.5% − 누진공제 250,000 = 1,250,000 → 합 3,650,000
    const r = recompute({ previousYearTaxBase: 1_500_000_000 });
    expect(r.landSplit!.cap).toMatchObject({ applied: false, basisTaxSeparated: 2_400_000, basisTaxComprehensive: 1_250_000, basisTax: 3_650_000 });
    expect(r.determinedTax).toBe(2_480_000);
  });

  it("목장 recompute — 분리과세분은 저율(0.07%) 직전 세율로 재산정", () => {
    // P-1: 분리과세분 31,250,000 · 이관분 68,750,000 · 직전 과표 50,000,000 → 분리과세분 직전 과표 15,625,000(×0.07% = 10,937) · 이관분 34,375,000(×0.2% = 68,750)
    const r = P({ otherComprehensiveValue: 0, taxCapMode: "recompute", previousYearTaxBase: 50_000_000 });
    expect(r.landSplit!.cap).toMatchObject({ basisTaxSeparated: 10_937, basisTaxComprehensive: 68_750, basisTax: 79_687 });
    // 상한 = floor(79,687 × 1.5) = 119,530 > 당해 111,562 → 미적용
    expect(r.landSplit!.cap!.applied).toBe(false);
    expect(r.determinedTax).toBe(111_562);
  });

  it("직전 과세표준 0 → 재산정 불가라 상한 미적용(고지는 direct 직전 세액 미입력과 같다)", () => {
    expect(F({ otherComprehensiveValue: 0, taxCapMode: "recompute", previousYearTaxBase: 0 }).determinedTax).toBe(2_480_000);
  });

  it("초과 0 + recompute 입력 — 종전 분리과세 경로(직전 세액 direct만) 그대로: 골든과 동일", () => {
    const base = ZERO_EXCESS_CASES["F-0 공장 8,000㎡(이내)"];
    const withRecompute = calculatePropertyTax({ ...base, taxCapMode: "recompute", previousYearTaxBase: 100_000_000 } as PropertyTaxInput);
    expect(withRecompute.landSplit).toBeUndefined();
    expect(withRecompute.determinedTax).toBe(1_120_000);
  });
});
