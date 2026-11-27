/**
 * U-02 (비상장주식 리뷰 2026-11-28 · 사용자 결정 Q-1) — §55① 후단 0원 하한은 영업권 합산 «뒤»에 건다.
 *
 * 법 근거(KoreanLaw MCP 본문 확인 2026-11-28, 상증령 MST 290845):
 *   - 상증령 §55① 「…자산을 … 평가한 가액에서 부채를 차감한 가액으로 하며, 순자산가액이 0원 이하인 경우에는 0원으로 한다」
 *   - 상증령 §55③ 「제1항을 적용할 때 제59조제2항에 따른 영업권평가액은 해당 법인의 자산가액에 이를 합산한다.
 *     다만, 다음 각 호의 경우에는 그러하지 아니하다」 — 1호 §54④1·3호 · 2호 §54④2호 · 3호 계속결손법인
 *   ⇒ ③ = max(0, (자산 − 부채) + 영업권). 단서 해당이면 영업권 0 → max(0, 자산 − 부채).
 *
 * 종전(ZF-3 설계): max(0, 자산 − 부채) + 영업권 — 자본잠식 법인에서 결손을 영업권으로 상계하지 않아 과대.
 */
import { describe, it, expect } from "vitest";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import { calcUnlistedStockPerShareValue } from "@/lib/tax-engine/property-valuation-stock";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

/** 장부 자산 1억 · 부채 2억(다 = −1억) · 3년 각사업연도소득 1억 · 10,000주 · 평가기준일 2026-06-01 */
const CAPITAL_IMPAIRED: UnlistedStockValuationInput = {
  corpName: "㈜자본잠식",
  businessStartDate: new Date("2000-01-01"),
  evaluationDate: new Date("2026-06-01"),
  faceValuePerShare: 5_000,
  totalShares: 10_000,
  ownedShares: 10_000,
  isRealEstateHeavy: false,
  fiscalYears: [
    { fiscalYearLabel: "2025", fiscalYearEndDate: new Date("2025-12-31"), taxableIncome: 100_000_000 },
    { fiscalYearLabel: "2024", fiscalYearEndDate: new Date("2024-12-31"), taxableIncome: 100_000_000 },
    { fiscalYearLabel: "2023", fiscalYearEndDate: new Date("2023-12-31"), taxableIncome: 100_000_000 },
  ],
  capitalChanges: [],
  netAssetValueRaw: {
    bsTotalAssets: 100_000_000, assetValuationDelta: 0,
    corpTaxReservedAmount: 0, paidInCapitalIncrease: 0, otherEarnedRights: 0,
    prepaidExpenses: 0, preGiftRetainedEarnings: 0,
    bsTotalLiabilities: 200_000_000, corporateTaxPayable: 0,
    farmingSurtax: 0, localIncomeTax: 0, dividendPayable: 0,
    retirementProvision: 0, otherProvision: 0,
    reserveExcluded: 0, allowanceExcluded: 0, deferredTaxAdjustment: 0,
  },
  isContinuousLossLastThreeYears: false,
  capitalizationRate: 0.10,
  isMaxShareholder: false,
  companySize: "large",
};

describe("U-02 V2 — 자본잠식 + 영업권: 하한은 영업권 합산 후", () => {
  const r = evaluateUnlistedStockV2(CAPITAL_IMPAIRED);

  it("영업권 189,539,338 · 다(사실값) −1억 echo", () => {
    expect(r.goodwillCalculation.goodwillFinal).toBe(189_539_338);
    expect(r.netAssetBeforeGoodwillRaw).toBe(-100_000_000);
  });

  it("③ = max(0, −1억 + 189,539,338) = 89,539,338 (종전 189,539,338)", () => {
    expect(r.netAssetTotal).toBe(89_539_338);
    expect(r.netAssetZeroFloorApplied).toBe(false);
    expect(r.netAssetPerShare).toBe(8_953);
  });

  it("⑥ 63,581원/주 · 총 635,810,000 (종전 67,581 · 675,810,000 — 40,000,000 과대)", () => {
    expect(r.finalPerShareValue).toBe(63_581);
    expect(r.totalValuation).toBe(635_810_000);
  });

  it("영업권으로도 못 메우면 ③ 0 + 하한 echo (부채 5억)", () => {
    const deep = evaluateUnlistedStockV2({
      ...CAPITAL_IMPAIRED,
      netAssetValueRaw: { ...CAPITAL_IMPAIRED.netAssetValueRaw, bsTotalLiabilities: 500_000_000 },
    });
    expect(deep.netAssetBeforeGoodwillRaw).toBe(-400_000_000);
    expect(deep.netAssetTotal).toBe(0);
    expect(deep.netAssetZeroFloorApplied).toBe(true);
    expect(deep.warnings.some((w) => w.includes("§55① 후단"))).toBe(true);
  });

  it("§55③ 단서 3호(계속결손법인) — 영업권을 합산하지 않으므로 ③ = max(0, 다) = 0", () => {
    const loss = evaluateUnlistedStockV2({ ...CAPITAL_IMPAIRED, isContinuousLossLastThreeYears: true });
    expect(loss.goodwillCalculation.goodwillFinal).toBe(0);
    expect(loss.netAssetTotal).toBe(0);
    expect(loss.netAssetZeroFloorApplied).toBe(true);
  });
});

describe("U-02 V1 간편평가 — 같은 순서", () => {
  it("순자산 −1억 + 영업권 → 1주당 순자산가치는 영업권 합산 후 하한", () => {
    const r = calcUnlistedStockPerShareValue(
      {
        totalShares: 10_000,
        ownedShares: 10_000,
        weightedNetIncome: 100_000_000,
        netAssetValue: -100_000_000,
        capitalizationRate: 0.1,
        netIncomeYear1: 100_000_000,
        netIncomeYear2: 100_000_000,
        netIncomeYear3: 100_000_000,
      } as Parameters<typeof calcUnlistedStockPerShareValue>[0],
      false,
    );
    expect(r.goodwill.goodwillFinal).toBeGreaterThan(100_000_000);
    expect(r.netAssetWithGoodwill).toBe(r.goodwill.goodwillFinal - 100_000_000);
  });
});
