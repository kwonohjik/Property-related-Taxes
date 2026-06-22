import { describe, it, expect } from "vitest";
import { computeEffectiveValuation } from "@/lib/calc/estate-item-valuation";
import { evaluateEstateItem } from "@/lib/tax-engine/property-valuation";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * computeEffectiveValuation 엔진 단일 진실화(hybrid 위임) anchor.
 * 계획: docs/00-pm/estate-valuation-single-source.plan.md
 * 설계: docs/02-design/features/estate-valuation-single-source.engine.design.md
 *
 * 위임 후 부동산은 evaluateEstateItem.valuatedAmount(§61⑤ 임대료환산·미임대·§66 담보하한 반영),
 * 주식은 §60 시가 우선+computeStockValuation(valuationDate fallback 보존), deposit은 leaseDeposit 직접,
 * cash·financial·기타는 §60 명시값 chain.
 */

const item = (p: Partial<EstateItem>): EstateItem => ({
  id: "x1",
  name: "테스트",
  category: "real_estate_building",
  ...p,
});

describe("computeEffectiveValuation — 엔진 위임 단일 진실", () => {
  it("[SS-1] 임대 부동산: 임대료환산 반영 → 700,000,000 (현행 651,300,000 dual-truth 해소)", () => {
    const i = item({
      standardPrice: 321_300_000,
      appurtenantLandStandardPrice: 330_000_000,
      monthlyRent: 2_000_000,
      leaseDeposit: 500_000_000,
    });
    expect(computeEffectiveValuation(i)).toBe(700_000_000);
    // 엔진 권위값과 일치(단일 진실)
    expect(computeEffectiveValuation(i)).toBe(evaluateEstateItem(i).valuatedAmount);
  });

  it("[SS-2] 미임대(공실) 포함: 858,100,000", () => {
    const i = item({
      standardPrice: 321_300_000,
      appurtenantLandStandardPrice: 330_000_000,
      monthlyRent: 2_000_000,
      leaseDeposit: 500_000_000,
      totalBuildingArea: 720,
      vacantBuildingArea: 180,
      vacantBuildingStandardPrice: 75_600_000,
    });
    expect(computeEffectiveValuation(i)).toBe(858_100_000);
  });

  it("[SS-3] §66 담보채권 하한: Max(평가, 담보채권액)", () => {
    const i = item({
      standardPrice: 321_300_000,
      appurtenantLandStandardPrice: 330_000_000,
      mortgageAmount: 900_000_000,
      leaseDeposit: 100_000_000,
    });
    // 담보채권 = 900,000,000 + 100,000,000 = 1,000,000,000 > 기준시가 651,300,000
    expect(computeEffectiveValuation(i)).toBe(1_000_000_000);
  });

  it("[SS-4] deposit leaseDeposit 미입력(0): throw 없이 0 반환", () => {
    const i = item({ category: "deposit", leaseDeposit: undefined });
    expect(() => computeEffectiveValuation(i)).not.toThrow();
    expect(computeEffectiveValuation(i)).toBe(0);
  });

  it("[SS-4b] deposit leaseDeposit 입력: 액면가", () => {
    const i = item({ category: "deposit", leaseDeposit: 300_000_000 });
    expect(computeEffectiveValuation(i)).toBe(300_000_000);
  });

  it("[SS-5] 상장주식: computeStockValuation 경로 유지(회귀)", () => {
    const i = item({
      category: "listed_stock",
      listedStockAvgPrice: 50_000,
      listedStockShares: 1_000,
    });
    // hybrid라 주식은 기존 경로 — 평가액 = 50,000 × 1,000 = 50,000,000
    expect(computeEffectiveValuation(i)).toBe(50_000_000);
  });

  it("[SS-6] 시가(marketValue) 우선: 부동산 marketValue 그대로", () => {
    const i = item({ marketValue: 1_000_000_000, standardPrice: 321_300_000 });
    expect(computeEffectiveValuation(i)).toBe(1_000_000_000);
  });

  it("[SS-7] cash·financial: marketValue 동등(§22 공제 미혼입)", () => {
    expect(computeEffectiveValuation(item({ category: "cash", marketValue: 50_000_000 }))).toBe(50_000_000);
    expect(computeEffectiveValuation(item({ category: "financial", marketValue: 80_000_000 }))).toBe(80_000_000);
  });
});
