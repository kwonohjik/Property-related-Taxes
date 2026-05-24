/**
 * PR-K-2 — §54⑥ Zod schema + validate (other methodNotes 강제) anchor 4
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-evaluation-committee-section-54-6.plan.md
 */

import { describe, it, expect } from "vitest";
import { unlistedStockValuationV2Schema } from "@/lib/validators/unlisted-stock-valuation-v2.schema";

const baseValid = {
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
  companySize: "large" as const,
};

describe("[PR-K-2] Zod schema + validate", () => {
  it("K-2-1: Zod 4방법 정상 통과 (clm·dcf·ddm·other 각각)", () => {
    const methods = ["clm", "dcf", "ddm"] as const;
    for (const method of methods) {
      const r = unlistedStockValuationV2Schema.safeParse({
        ...baseValid,
        evaluationCommittee: { method, taxpayerPerShareValuation: 10_000 },
      });
      expect(r.success).toBe(true);
    }
    // other + methodNotes 입력 → 통과
    const rOther = unlistedStockValuationV2Schema.safeParse({
      ...baseValid,
      evaluationCommittee: {
        method: "other",
        taxpayerPerShareValuation: 10_000,
        methodNotes: "감정평가법인 평가",
      },
    });
    expect(rOther.success).toBe(true);
  });

  it("K-2-2: method enum 외 값 차단", () => {
    const r = unlistedStockValuationV2Schema.safeParse({
      ...baseValid,
      evaluationCommittee: { method: "invalid_method", taxpayerPerShareValuation: 10_000 },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some((issue) =>
          issue.path.includes("method") || issue.path.includes("evaluationCommittee"),
        ),
      ).toBe(true);
    }
  });

  it("K-2-3: taxpayerPerShareValuation 음수·0 차단", () => {
    const rNeg = unlistedStockValuationV2Schema.safeParse({
      ...baseValid,
      evaluationCommittee: { method: "clm", taxpayerPerShareValuation: -1 },
    });
    expect(rNeg.success).toBe(false);

    const rZero = unlistedStockValuationV2Schema.safeParse({
      ...baseValid,
      evaluationCommittee: { method: "clm", taxpayerPerShareValuation: 0 },
    });
    expect(rZero.success).toBe(false);
  });

  it("K-2-4: validate \"other\" + methodNotes 누락·빈문자열 차단", () => {
    // methodNotes 누락
    const rMissing = unlistedStockValuationV2Schema.safeParse({
      ...baseValid,
      evaluationCommittee: { method: "other", taxpayerPerShareValuation: 10_000 },
    });
    expect(rMissing.success).toBe(false);
    if (!rMissing.success) {
      expect(
        rMissing.error.issues.some((issue) =>
          issue.message.includes("기타 평가법 선택 시 평가법 사유"),
        ),
      ).toBe(true);
    }

    // methodNotes 빈 문자열
    const rEmpty = unlistedStockValuationV2Schema.safeParse({
      ...baseValid,
      evaluationCommittee: {
        method: "other",
        taxpayerPerShareValuation: 10_000,
        methodNotes: "   ",
      },
    });
    expect(rEmpty.success).toBe(false);

    // methodNotes 입력 → 통과
    const rOk = unlistedStockValuationV2Schema.safeParse({
      ...baseValid,
      evaluationCommittee: {
        method: "other",
        taxpayerPerShareValuation: 10_000,
        methodNotes: "DCF 변형",
      },
    });
    expect(rOk.success).toBe(true);
  });

  it("K-2-회귀: evaluationCommittee 미입력 → 통과 (optional)", () => {
    const r = unlistedStockValuationV2Schema.safeParse(baseValid);
    expect(r.success).toBe(true);
  });
});
