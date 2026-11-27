/**
 * U-03 (비상장주식 리뷰 2026-11-28) — 상증령 §54④ 단서(3·5호)는 평가기준일 2026.2.27. 이후만.
 *
 * - 현행 §54④ 단서: 「다만, 제3호 및 제5호의 경우에는 제1항 본문에 따라 평가한 가액이 1주당 순자산가치보다
 *   낮은 경우로 한정한다」(대통령령 제36131호, 2026.2.27. 신설). 2025.10.01. 시행본에는 단서가 없다.
 * - 부칙 <제36131호> 제11조 「이 영 시행 이후 평가하는 경우부터 적용」 = 평가기준일 기준
 *   (기획재정부 재산세제과-955, 2021.11.02. — 같은 문구 부칙 <제28638호> 제8조 회신).
 */
import { describe, it, expect } from "vitest";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import { hasSection54_4Proviso } from "@/lib/tax-engine/property-valuation/section-54-4-proviso-era";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

/** 부동산 80%(3호) · 자산 5억 · 부채 0 · 10,000주 · 3년 각사업연도소득 1억 → 순자산 50,000 · 가중평균 80,000 */
const base = (evaluationDate: string, reason: "real_estate_80" | "stock_holding_80" = "real_estate_80"): UnlistedStockValuationInput => ({
  corpName: "㈜부동산과다",
  businessStartDate: new Date("2000-01-01"),
  evaluationDate: new Date(evaluationDate),
  faceValuePerShare: 5_000,
  totalShares: 10_000,
  ownedShares: 10_000,
  isRealEstateHeavy: false,
  fiscalYears: [
    { fiscalYearLabel: "Y-1", fiscalYearEndDate: new Date("2024-12-31"), taxableIncome: 100_000_000 },
    { fiscalYearLabel: "Y-2", fiscalYearEndDate: new Date("2023-12-31"), taxableIncome: 100_000_000 },
    { fiscalYearLabel: "Y-3", fiscalYearEndDate: new Date("2022-12-31"), taxableIncome: 100_000_000 },
  ],
  capitalChanges: [],
  netAssetValueRaw: {
    bsTotalAssets: 500_000_000, assetValuationDelta: 0,
    corpTaxReservedAmount: 0, paidInCapitalIncrease: 0, otherEarnedRights: 0,
    prepaidExpenses: 0, preGiftRetainedEarnings: 0,
    bsTotalLiabilities: 0, corporateTaxPayable: 0,
    farmingSurtax: 0, localIncomeTax: 0, dividendPayable: 0,
    retirementProvision: 0, otherProvision: 0,
    reserveExcluded: 0, allowanceExcluded: 0, deferredTaxAdjustment: 0,
  },
  isContinuousLossLastThreeYears: false,
  capitalizationRate: 0.10,
  isMaxShareholder: false,
  companySize: "large",
  netAssetOnlyReason: reason,
});

describe("U-03 — §54④ 단서 연혁 게이트", () => {
  it("경계: 2026-02-26 단서 없음 · 2026-02-27 단서 있음", () => {
    expect(hasSection54_4Proviso(new Date("2026-02-26"))).toBe(false);
    expect(hasSection54_4Proviso(new Date("2026-02-27"))).toBe(true);
  });

  it("평가기준일 2025-12-01 (3호): 무조건 순자산 50,000 · 총 500,000,000 (종전 80,000 · 8억 — 3억 과대)", () => {
    const r = evaluateUnlistedStockV2(base("2025-12-01"));
    expect(r.netAssetPerShare).toBe(50_000);
    expect(r.finalPerShareValue).toBe(50_000);
    expect(r.totalValuation).toBe(500_000_000);
    expect(r.appliedRules.some((x) => x.includes("단서 신설 전"))).toBe(true);
  });

  it("평가기준일 2025-12-01 (5호 stock_holding_80)도 같다", () => {
    const r = evaluateUnlistedStockV2(base("2025-12-01", "stock_holding_80"));
    expect(r.finalPerShareValue).toBe(50_000);
  });

  it("평가기준일 2026-03-02: 단서 — 가중평균 80,000 ≥ 순자산 50,000 → 본문 평가 80,000", () => {
    const r = evaluateUnlistedStockV2(base("2026-03-02"));
    expect(r.finalPerShareValue).toBe(80_000);
    expect(r.totalValuation).toBe(800_000_000);
  });
});
