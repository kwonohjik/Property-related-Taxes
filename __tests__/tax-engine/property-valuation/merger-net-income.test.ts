/**
 * 합병 후 3년 미경과 합병법인 순손익액 계산 (상증령 §56③, 상증통 63-56…12·서서-1071·재재산-181)
 * PDF anchor: 한국세무사회 2009 주식변동실무해설 p.218~220
 *   A-1 사례㉮ 동일 사업연도 합병   → 1주당 33/83/200, 가중평균 133
 *   A-2 사례㉯ 다른 사업연도 합병   → 순손익액(combined) 350·450 (주식수 미제공)
 *   A-3 사례㉰ 1:0.5 합병비율       → 1주당 2,800/1,666/2,000, 가중평균 @2,288
 */
import { describe, it, expect } from "vitest";
import { computeMergerPerShareNetIncome } from "@/lib/tax-engine/property-valuation/merger-net-income";
import { calcWeightedAvg3y } from "@/lib/tax-engine/property-valuation/weighted-avg";
import { annualizePerShareNetIncome } from "@/lib/tax-engine/property-valuation/fiscal-year-annualize";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import type { MergerNetIncomeContext } from "@/lib/tax-engine/types/merger-net-income.types";
import type {
  UnlistedStockValuationInput,
  UnlistedNetAssetCalculation,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

describe("computeMergerPerShareNetIncome — 합병 후 3년 미경과 순손익액", () => {
  it("[A-1] 사례㉮ 동일 사업연도 합병 — 1주당 33/83/200, 가중평균 133", () => {
    const ctx: MergerNetIncomeContext = {
      mergerRegistrationDate: new Date(2007, 0, 1),
      postMergerShares: 1500,
      acquirer: [
        { shares: 1500, netIncome: 300_000, startDate: new Date(2007, 0, 1), endDate: new Date(2007, 11, 31) }, // 전1년 2007 (피합병 소멸)
        { shares: 1000, netIncome: 200_000, startDate: new Date(2006, 0, 1), endDate: new Date(2006, 11, 31) }, // 전2년 2006
        { shares: 1000, netIncome: 100_000, startDate: new Date(2005, 0, 1), endDate: new Date(2005, 11, 31) }, // 전3년 2005
      ],
      targetFiscalYears: [
        { netIncome: -75_000, startDate: new Date(2006, 0, 1), endDate: new Date(2006, 11, 31) },
        { netIncome: -50_000, startDate: new Date(2005, 0, 1), endDate: new Date(2005, 11, 31) },
      ],
    };
    const r = computeMergerPerShareNetIncome(ctx);
    expect(r.perShare).toEqual([200, 83, 33]);
    expect(r.combined).toEqual([300_000, 125_000, 50_000]);
    expect(calcWeightedAvg3y(r.perShare)).toBe(133);
  });

  it("[A-2] 사례㉯ 다른 사업연도 합병 — combined 순손익액 600/350/450 (6개월 안분)", () => {
    const ctx: MergerNetIncomeContext = {
      mergerRegistrationDate: new Date(2020, 5, 30),
      postMergerShares: 1, // 주식수 미제공 → combined만 검증
      acquirer: [
        { shares: 1, netIncome: 600, startDate: new Date(2021, 0, 1), endDate: new Date(2021, 11, 31) }, // 전1년 2021
        { shares: 1, netIncome: 300, startDate: new Date(2020, 0, 1), endDate: new Date(2020, 11, 31) }, // 전2년 2020
        { shares: 1, netIncome: 200, startDate: new Date(2019, 0, 1), endDate: new Date(2019, 11, 31) }, // 전3년 2019
      ],
      targetFiscalYears: [
        { netIncome: 100, startDate: new Date(2019, 6, 1), endDate: new Date(2020, 5, 30) }, // B 2019.7~2020.6
        { netIncome: 400, startDate: new Date(2018, 6, 1), endDate: new Date(2019, 5, 30) }, // B 2018.7~2019.6
      ],
    };
    const r = computeMergerPerShareNetIncome(ctx);
    expect(r.combined).toEqual([600, 350, 450]);
  });

  it("[A-3] 사례㉰ 1:0.5 합병 — 1주당 2,800/1,666/2,000, 가중평균 @2,288 (결손 통산)", () => {
    const ctx: MergerNetIncomeContext = {
      mergerRegistrationDate: new Date(2021, 5, 30),
      postMergerShares: 15_000,
      acquirer: [
        { shares: 15_000, netIncome: 40_000_000, startDate: new Date(2021, 0, 1), endDate: new Date(2021, 11, 31) }, // 전1년 2021
        { shares: 15_000, netIncome: 30_000_000, startDate: new Date(2020, 0, 1), endDate: new Date(2020, 11, 31) }, // 전2년 2020
        { shares: 10_000, netIncome: 20_000_000, startDate: new Date(2019, 0, 1), endDate: new Date(2019, 11, 31) }, // 전3년 2019 (합병전 갑만)
      ],
      targetFiscalYears: [
        { netIncome: 2_000_000, startDate: new Date(2021, 0, 1), endDate: new Date(2021, 11, 31) },
        { netIncome: -5_000_000, startDate: new Date(2020, 0, 1), endDate: new Date(2020, 11, 31) }, // 을 결손 통산
      ],
    };
    const r = computeMergerPerShareNetIncome(ctx);
    expect(r.perShare).toEqual([2800, 1666, 2000]);
    expect(r.combined).toEqual([42_000_000, 25_000_000, 20_000_000]);
    expect(calcWeightedAvg3y(r.perShare)).toBe(2288);
  });
});

describe("§17의3② 영역① 이미지38 — 10개월 사업연도 연환산 (사업개시 2019.3.1)", () => {
  it("[C2] 2019.3.1~12.31 = 10개월 → 1주당 순손익액 ×12/10", () => {
    const start = new Date(2019, 2, 1); // 2019-03-01
    const end = new Date(2019, 11, 31); // 2019-12-31
    // 583 × 12 / 10 = 699 (floor)
    expect(annualizePerShareNetIncome(583, start, end)).toBe(699);
    // 1,000 × 12 / 10 = 1,200
    expect(annualizePerShareNetIncome(1_000, start, end)).toBe(1_200);
  });
});

describe("합병 orchestrator 통합 — evaluateUnlistedStockV2 (㉰ 재현 + 연환산 skip echo)", () => {
  const ZERO_NET_ASSET: UnlistedNetAssetCalculation = {
    bsTotalAssets: 0, assetValuationDelta: 0, corpTaxReservedAmount: 0,
    paidInCapitalIncrease: 0, otherEarnedRights: 0, prepaidExpenses: 0,
    preGiftRetainedEarnings: 0, bsTotalLiabilities: 0, corporateTaxPayable: 0,
    farmingSurtax: 0, localIncomeTax: 0, dividendPayable: 0, retirementProvision: 0,
    otherProvision: 0, reserveExcluded: 0, allowanceExcluded: 0, deferredTaxAdjustment: 0,
  };
  const MERGER_INPUT: UnlistedStockValuationInput = {
    corpName: "㉰합병테스트",
    businessStartDate: new Date("1991-07-01"),
    evaluationDate: new Date("2022-02-01"),
    faceValuePerShare: 5_000,
    totalShares: 15_000,
    ownedShares: 15_000,
    isRealEstateHeavy: false,
    fiscalYears: [
      { fiscalYearLabel: "2021", fiscalYearEndDate: new Date("2021-12-31"), taxableIncome: 0 },
      { fiscalYearLabel: "2020", fiscalYearEndDate: new Date("2020-12-31"), taxableIncome: 0 },
      { fiscalYearLabel: "2019", fiscalYearEndDate: new Date("2019-12-31"), taxableIncome: 0 },
    ],
    capitalChanges: [],
    netAssetValueRaw: ZERO_NET_ASSET,
    isContinuousLossLastThreeYears: false,
    capitalizationRate: 0.10,
    isMaxShareholder: false,
    companySize: "small",
    mergerContext: {
      mergerRegistrationDate: new Date(2021, 5, 30),
      postMergerShares: 15_000,
      acquirer: [
        { shares: 15_000, netIncome: 40_000_000, startDate: new Date(2021, 0, 1), endDate: new Date(2021, 11, 31) },
        { shares: 15_000, netIncome: 30_000_000, startDate: new Date(2020, 0, 1), endDate: new Date(2020, 11, 31) },
        { shares: 10_000, netIncome: 20_000_000, startDate: new Date(2019, 0, 1), endDate: new Date(2019, 11, 31) },
      ],
      targetFiscalYears: [
        { netIncome: 2_000_000, startDate: new Date(2021, 0, 1), endDate: new Date(2021, 11, 31) },
        { netIncome: -5_000_000, startDate: new Date(2020, 0, 1), endDate: new Date(2020, 11, 31) },
      ],
    },
  };

  it("[M-INT] 가중평균순손익액 = @2,288 (㉰ orchestrator 통과)", () => {
    const r = evaluateUnlistedStockV2(MERGER_INPUT);
    expect(r.weightedNetIncomePerShare).toBe(2288);
  });

  it("[M-INT] mergerApplied=true, 연환산 echo는 상호배타로 undefined", () => {
    const r = evaluateUnlistedStockV2(MERGER_INPUT);
    expect(r.mergerApplied).toBe(true);
    expect(r.mergerResult?.perShare).toEqual([2800, 1666, 2000]);
    expect(r.annualizationApplied).toBeUndefined();
  });
});
