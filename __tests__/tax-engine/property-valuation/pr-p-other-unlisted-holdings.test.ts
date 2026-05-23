/**
 * PR-P — §54③ 다른 비상장주식 10% 이하 보유 옵션 (이동평균법 취득가액 갈음) anchor 7건
 *
 * 법령: 상증령 §54③ + 법인령 §74①1호마목 (KoreanLaw MCP 2026-05-24)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-other-holdings-section-54-3.plan.md
 */

import { describe, it, expect } from "vitest";
import {
  evaluateOtherUnlistedHolding,
  evaluateOtherUnlistedHoldings,
  isWithinTenPercentThreshold,
  type OtherUnlistedHolding,
} from "@/lib/tax-engine/property-valuation/other-unlisted-holdings";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

// ============================================================
// P-1 ~ P-5: evaluateOtherUnlistedHolding 단위
// ============================================================

describe("[PR-P] evaluateOtherUnlistedHolding 단위", () => {
  it("P-1: 10% 이하 + 시가 있음 → 시가 우선 (§54③ 단서 + §60①)", () => {
    const h: OtherUnlistedHolding = {
      rowId: "h-1",
      issuerCorpName: "㈜타사",
      holdingShares: 100,
      totalShares: 1_500,
      treasuryShares: 500, // effectiveDenominator = 1000, ratio = 10% (이하 포함)
      movingAverageAcquisitionValue: 50_000_000,
      marketValue: 80_000_000, // §60① 시가
    };
    const r = evaluateOtherUnlistedHolding(h);
    expect(r.appliedMethod).toBe("market_value");
    expect(r.valuatedAmount).toBe(80_000_000);
    expect(r.warnings).toEqual([]);
    expect(r.appliedLegalBasis).toMatch(/§54③ 단서.*§60①/);
  });

  it("P-2: 10% 이하 + 시가 없음 → 이동평균 취득가액 갈음 (§54③ 본문 + 법인령 §74①1호마목)", () => {
    const h: OtherUnlistedHolding = {
      rowId: "h-2",
      issuerCorpName: "㈜타사",
      holdingShares: 50,
      totalShares: 1_000,
      // treasuryShares 미입력 → 0
      movingAverageAcquisitionValue: 30_000_000,
      // marketValue 미입력
    };
    const r = evaluateOtherUnlistedHolding(h);
    expect(r.appliedMethod).toBe("moving_average_acquisition");
    expect(r.valuatedAmount).toBe(30_000_000);
    expect(r.appliedLegalBasis).toMatch(/§54③ 본문.*§74①1호마목/);
  });

  it("P-3: 10% 초과 → 옵션 적용 차단", () => {
    const h: OtherUnlistedHolding = {
      rowId: "h-3",
      issuerCorpName: "㈜타사",
      holdingShares: 150, // 15% > 10%
      totalShares: 1_000,
      movingAverageAcquisitionValue: 30_000_000,
      marketValue: 50_000_000, // 시가 있어도 차단
    };
    const r = evaluateOtherUnlistedHolding(h);
    expect(r.appliedMethod).toBe("not_applicable");
    expect(r.valuatedAmount).toBe(0);
    expect(r.warnings.find((w) => w.reason === "exceeds_10pct")).toBeDefined();
    expect(r.holdingRatio).toBeCloseTo(0.15);
  });

  it("P-4: 자기주식 제외 후 10% 정확히 동률 → 옵션 포함", () => {
    const h: OtherUnlistedHolding = {
      rowId: "h-4",
      issuerCorpName: "㈜타사",
      holdingShares: 100,
      totalShares: 1_200,
      treasuryShares: 200, // effectiveDenominator = 1000, ratio = 100/1000 = 10.0%
      movingAverageAcquisitionValue: 20_000_000,
    };
    const r = evaluateOtherUnlistedHolding(h);
    expect(r.appliedMethod).toBe("moving_average_acquisition");
    expect(r.effectiveDenominator).toBe(1_000);
    expect(r.holdingRatio).toBeCloseTo(0.10);
  });

  it("P-5: 자기주식 미입력 → totalShares 그대로 분모 사용 (treasuryShares=0)", () => {
    const h: OtherUnlistedHolding = {
      rowId: "h-5",
      issuerCorpName: "㈜타사",
      holdingShares: 100,
      totalShares: 1_000, // ratio = 10% (이하 포함)
      movingAverageAcquisitionValue: 25_000_000,
    };
    const r = evaluateOtherUnlistedHolding(h);
    expect(r.appliedMethod).toBe("moving_average_acquisition");
    expect(r.effectiveDenominator).toBe(1_000);
  });

  it("P-5b: 시가·취득가액 둘 다 미입력 → no_method_available", () => {
    const h: OtherUnlistedHolding = {
      rowId: "h-5b",
      issuerCorpName: "㈜타사",
      holdingShares: 50,
      totalShares: 1_000,
    };
    const r = evaluateOtherUnlistedHolding(h);
    expect(r.appliedMethod).toBe("not_applicable");
    expect(r.warnings.find((w) => w.reason === "no_method_available")).toBeDefined();
  });

  it("P-5c: 분모 무효 (totalShares ≤ treasuryShares)", () => {
    const h: OtherUnlistedHolding = {
      rowId: "h-5c",
      issuerCorpName: "㈜타사",
      holdingShares: 100,
      totalShares: 500,
      treasuryShares: 500, // effectiveDenominator = 0
      movingAverageAcquisitionValue: 10_000_000,
    };
    const r = evaluateOtherUnlistedHolding(h);
    expect(r.appliedMethod).toBe("not_applicable");
    expect(r.warnings.find((w) => w.reason === "invalid_total_shares")).toBeDefined();
  });

  it("isWithinTenPercentThreshold 헬퍼 검증", () => {
    expect(isWithinTenPercentThreshold(100, 1_000).withinThreshold).toBe(true); // 10.0% 이하
    expect(isWithinTenPercentThreshold(101, 1_000).withinThreshold).toBe(false); // 10.1% > 10%
    expect(isWithinTenPercentThreshold(100, 1_200, 200).withinThreshold).toBe(true); // 분모 차감 후 10%
    expect(isWithinTenPercentThreshold(100, 500, 500).effectiveDenominator).toBe(0); // 분모 0
  });
});

// ============================================================
// P-6 ~ P-7: 오케스트레이터 통합 (result.otherUnlistedHoldingsEvaluated 노출)
// ============================================================

const case6Base: UnlistedStockValuationInput = {
  corpName: "㈜향기",
  businessStartDate: new Date("2000-01-01"),
  evaluationDate: new Date("2024-01-20"),
  faceValuePerShare: 5_000,
  totalShares: 50_000,
  ownedShares: 26_000,
  isRealEstateHeavy: false,
  fiscalYears: [
    { fiscalYearLabel: "2023", fiscalYearEndDate: new Date("2023-12-31"), taxableIncome: 76_842_660 },
    { fiscalYearLabel: "2022", fiscalYearEndDate: new Date("2022-12-31"), taxableIncome: 62_416_500 },
    { fiscalYearLabel: "2021", fiscalYearEndDate: new Date("2021-12-31"), taxableIncome: -5_311_910 },
  ],
  capitalChanges: [],
  netAssetValueRaw: {
    bsTotalAssets: 2_476_889_520, assetValuationDelta: 91_548_350,
    corpTaxReservedAmount: 0, paidInCapitalIncrease: 0, otherEarnedRights: 0,
    prepaidExpenses: 65_400_500, preGiftRetainedEarnings: 0,
    bsTotalLiabilities: 1_833_780_000, corporateTaxPayable: 32_627_890,
    farmingSurtax: 0, localIncomeTax: 3_262_780, dividendPayable: 0,
    retirementProvision: 445_785_000, otherProvision: 0,
    reserveExcluded: 0, allowanceExcluded: 301_770_000, deferredTaxAdjustment: 0,
  },
  isContinuousLossLastThreeYears: false,
  capitalizationRate: 0.10,
  isMaxShareholder: true,
  companySize: "large",
};

describe("[PR-P] orchestrator 통합", () => {
  it("P-6: otherUnlistedHoldings 입력 시 result.otherUnlistedHoldingsEvaluated 노출 + appliedRules 인용", () => {
    const input: UnlistedStockValuationInput = {
      ...case6Base,
      otherUnlistedHoldings: [
        {
          rowId: "h-1",
          issuerCorpName: "㈜소액보유",
          holdingShares: 50,
          totalShares: 1_000,
          movingAverageAcquisitionValue: 30_000_000,
        },
      ],
    };
    const r = evaluateUnlistedStockV2(input);
    expect(r.otherUnlistedHoldingsEvaluated).toHaveLength(1);
    expect(r.otherUnlistedHoldingsEvaluated?.[0].appliedMethod).toBe("moving_average_acquisition");
    expect(r.otherUnlistedHoldingsEvaluated?.[0].valuatedAmount).toBe(30_000_000);
    expect(r.appliedRules.some((rule) => rule.includes("§54③"))).toBe(true);
    // 본 결과 (사례 6 totalValuation)는 무변경 — 자산총액 자동 가산 없음
    expect(r.totalValuation).toBe(340_392_000);
  });

  it("P-7: otherUnlistedHoldings 미입력·빈 배열 → undefined (회귀 보호)", () => {
    // 미입력 — 사례 6 그대로
    const r1 = evaluateUnlistedStockV2(case6Base);
    expect(r1.otherUnlistedHoldingsEvaluated).toBeUndefined();
    expect(r1.appliedRules.every((rule) => !rule.includes("§54③"))).toBe(true);
    // 빈 배열
    const r2 = evaluateUnlistedStockV2({ ...case6Base, otherUnlistedHoldings: [] });
    expect(r2.otherUnlistedHoldingsEvaluated).toBeUndefined();
  });

  it("evaluateOtherUnlistedHoldings 배치 — 다건 (10% 이하 + 초과 혼합)", () => {
    const r = evaluateOtherUnlistedHoldings([
      { rowId: "h-1", issuerCorpName: "㈜A", holdingShares: 50, totalShares: 1_000, movingAverageAcquisitionValue: 10_000_000 },
      { rowId: "h-2", issuerCorpName: "㈜B", holdingShares: 200, totalShares: 1_000, marketValue: 50_000_000 },
    ]);
    expect(r).toHaveLength(2);
    expect(r?.[0].appliedMethod).toBe("moving_average_acquisition");
    expect(r?.[1].appliedMethod).toBe("not_applicable"); // 20% 초과
  });
});
