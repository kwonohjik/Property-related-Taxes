/**
 * PR-L3 — §63②3호 상장법인 증자 신주(미상장) 평가 anchor (L3-1~9 + 회귀)
 *
 * 령 §57③: 1주당 = (상장 동일 법인 §63①1호가목 평가액: 전후 2개월 평균) − 배당차액(규칙 §18②).
 * 단서(§18②): 정관상 배당기산일을 기존 상장주식과 동일하게 정하면 배당차액 제외(=0).
 *
 * Plan:   docs/00-pm/inheritance-stock-capital-increase-new-shares-section-63-2-3.plan.md
 * Design: docs/02-design/features/inheritance-stock-capital-increase-new-shares-section-63-2-3.engine.design.md
 */
import { describe, it, expect } from "vitest";
import {
  resolveEffectiveDividendDifference,
  applyCapitalIncreaseShareValuation,
} from "@/lib/tax-engine/property-valuation/dividend-difference-section-63-2-3";
import {
  computeStockValuation,
  resolveEstateItemValue,
} from "@/lib/tax-engine/valuation/resolve-estate-item-value";
import { getValuatedAmount } from "@/lib/calc/inheritance-deduction-suggest";
import { isSection22MajorShareholderExcluded } from "@/lib/calc/financial-deduction-resolver";
import { deriveFamilyBusinessValue } from "@/lib/tax-engine/deductions/family-business";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

function listedItem(overrides: Partial<EstateItem>): EstateItem {
  return {
    id: "ls-1",
    category: "listed_stock",
    name: "상장법인 증자 신주",
    listedStockAvgPrice: 50_000,
    listedStockShares: 100,
    ...overrides,
  } as EstateItem;
}

describe("PR-L3 §63②3호 배당차액 차감 (applyCapitalIncreaseShareValuation)", () => {
  it("L3-1: avg 50,000·배당차액 3,000·sameBaseDate=false → perShare=47,000·eff=3,000", () => {
    const r = applyCapitalIncreaseShareValuation(50_000, 3_000, false);
    expect(r.effectiveDividendDifference).toBe(3_000);
    expect(r.perShareValue).toBe(47_000);
  });

  it("L3-2: 단서 — sameBaseDate=true(배당차액 9,999 입력) → eff=0·perShare=50,000", () => {
    expect(resolveEffectiveDividendDifference(9_999, true)).toBe(0);
    const r = applyCapitalIncreaseShareValuation(50_000, 9_999, true);
    expect(r.effectiveDividendDifference).toBe(0);
    expect(r.perShareValue).toBe(50_000);
  });

  it("L3-5: 음수 경계 — 배당차액 60,000 > avg 50,000 → perShare=0", () => {
    const r = applyCapitalIncreaseShareValuation(50_000, 60_000, false);
    expect(r.perShareValue).toBe(0);
  });
});

describe("PR-L3 §63②3호 computeStockValuation 전파", () => {
  it("L3-3: flag=true·avg 50,000·shares 100·배당차액 3,000 → 4,700,000 (off → 5,000,000)", () => {
    const on = listedItem({
      isCapitalIncreaseUnlistedShare: true,
      listedStockDividendDifference: 3_000,
    });
    expect(computeStockValuation(on)).toBe(4_700_000);

    const off = listedItem({});
    expect(computeStockValuation(off)).toBe(5_000_000);
  });

  it("L3-4: 단일 진실 동치 — resolveEstateItemValue ≡ getValuatedAmount ≡ computeStockValuation", () => {
    const item = listedItem({
      isCapitalIncreaseUnlistedShare: true,
      listedStockDividendDifference: 3_000,
    });
    expect(resolveEstateItemValue(item)).toBe(4_700_000);
    expect(getValuatedAmount(item)).toBe(4_700_000);
    expect(computeStockValuation(item)).toBe(4_700_000);
  });

  it("L3-6: flag on·배당차액 미입력(undefined) → 차감 0·perShare=avg(=5,000,000)", () => {
    const item = listedItem({ isCapitalIncreaseUnlistedShare: true });
    expect(computeStockValuation(item)).toBe(5_000_000);
  });

  it("L3-7: §63③ 할증 미적용(선재 불변) — isSection22MajorShareholder=true여도 ×1.2 없음", () => {
    const item = listedItem({
      isCapitalIncreaseUnlistedShare: true,
      listedStockDividendDifference: 3_000,
      isSection22MajorShareholder: true,
    });
    expect(computeStockValuation(item)).toBe(4_700_000); // (50,000−3,000)×100, 할증 없음
    expect(isSection22MajorShareholderExcluded(item)).toBe(true); // 금융재산공제 배제 경로는 분리 작동
  });

  it("L3-8: 가업상속공제 전파(메커니즘) — listed 가업자산 deriveFamilyBusinessValue가 차감 후 값 산입", () => {
    const item = listedItem({
      isCapitalIncreaseUnlistedShare: true,
      listedStockDividendDifference: 3_000,
      familyBusinessCategory: "corporate_stock",
    });
    expect(deriveFamilyBusinessValue([item])).toBe(4_700_000);
  });

  it("L3-9: dual-truth — computeStockValuation(item) 단일값이 화면 합계 기준(엔진=화면 base)", () => {
    const item = listedItem({
      isCapitalIncreaseUnlistedShare: true,
      listedStockDividendDifference: 3_000,
    });
    // 화면 preview·사이드바도 동일 computeStockValuation(item)을 호출(D-8 재배선) → 동일값
    expect(computeStockValuation(item)).toBe(4_700_000);
  });

  it("회귀: flag 미입력 listed_stock 기존 동작 불변 (computeStockValuation = floor(avg)×shares)", () => {
    expect(computeStockValuation(listedItem({}))).toBe(5_000_000);
    expect(computeStockValuation(listedItem({ listedStockAvgPrice: 0 }))).toBe(0);
  });
});
