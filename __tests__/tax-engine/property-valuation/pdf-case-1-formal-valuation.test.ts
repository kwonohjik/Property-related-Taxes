/**
 * PDF 사례 1 — 정식평가(evaluateUnlistedStockV2) 전체 파이프라인 재현
 *
 * 입력 (교재 사례 1):
 *   - 평가기준일 2022.6.30, 12월 결산
 *   - 발행주식총수 180,000 (2020말·2019말 = 100,000)
 *   - 2021.6.30 유상증자 50,000주 @ 5,000원, 2021.10.30 무상증자 30,000주
 *   - 순손익액(다): 2021 120,000,000 / 2020 110,000,000 / 2019 80,000,000
 *
 * 기대 (PDF):
 *   - 환산주식수 [180,000, 180,000, 180,000] (§17의3⑤)
 *   - §56⑤ 조정 [12,500,000, 25,000,000, 25,000,000]
 *   - 최종 순손익액 [132,500,000, 135,000,000, 105,000,000]
 *   - 1주당 순손익액 [736, 750, 583]
 *   - 1주당 가중평균 715 / 1주당 순손익가치 ⑤ 7,150
 */

import { describe, it, expect } from "vitest";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import type {
  UnlistedStockValuationInput,
  UnlistedNetAssetCalculation,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

const ZERO_NET_ASSET: UnlistedNetAssetCalculation = {
  bsTotalAssets: 0,
  assetValuationDelta: 0,
  corpTaxReservedAmount: 0,
  paidInCapitalIncrease: 0,
  otherEarnedRights: 0,
  prepaidExpenses: 0,
  preGiftRetainedEarnings: 0,
  bsTotalLiabilities: 0,
  corporateTaxPayable: 0,
  farmingSurtax: 0,
  localIncomeTax: 0,
  dividendPayable: 0,
  retirementProvision: 0,
  otherProvision: 0,
  reserveExcluded: 0,
  allowanceExcluded: 0,
  deferredTaxAdjustment: 0,
};

const PDF_CASE_1: UnlistedStockValuationInput = {
  corpName: "주식회사",
  businessStartDate: new Date("2000-01-01"),
  evaluationDate: new Date("2022-06-30"),
  faceValuePerShare: 5_000,
  totalShares: 180_000,
  ownedShares: 180_000,
  isRealEstateHeavy: false,
  fiscalYears: [
    {
      // 직전 1사업연도 (2021) — 다.순손익액 = 120,000,000
      fiscalYearLabel: "2021",
      fiscalYearEndDate: new Date("2021-12-31"),
      taxableIncome: 140_000_000,
      addRefundInterest: 1_000_000,
      subEntertainmentExcess: 6_000_000,
      subDonationExcess: 3_800_000,
      subWithholdingPenalty: 500_000,
      subInterestPayment: 3_000_000,
      subCorporateTax: 7_000_000,
      subAdditionalTaxes: 700_000,
    },
    {
      // 직전 2사업연도 (2020) — 110,000,000
      fiscalYearLabel: "2020",
      fiscalYearEndDate: new Date("2020-12-31"),
      taxableIncome: 110_000_000,
    },
    {
      // 직전 3사업연도 (2019) — 80,000,000
      fiscalYearLabel: "2019",
      fiscalYearEndDate: new Date("2019-12-31"),
      taxableIncome: 80_000_000,
    },
  ],
  capitalChanges: [
    { changeType: "paid_in", changeDate: new Date("2021-06-30"), sharesIssued: 50_000, pricePerShare: 5_000 },
    { changeType: "free_issue", changeDate: new Date("2021-10-30"), sharesIssued: 30_000 },
  ],
  netAssetValueRaw: ZERO_NET_ASSET,
  isContinuousLossLastThreeYears: false,
  capitalizationRate: 0.1,
  isMaxShareholder: false,
  companySize: "small",
};

describe("[PDF-1] 정식평가 통합 — 교재 사례 1 순손익가치 재현", () => {
  const r = evaluateUnlistedStockV2(PDF_CASE_1);
  const fb = r.fiscalYearBreakdowns;

  it("다. 순손익액 = [120,000,000, 110,000,000, 80,000,000]", () => {
    expect([fb[0].adjustedNetIncome, fb[1].adjustedNetIncome, fb[2].adjustedNetIncome]).toEqual([
      120_000_000, 110_000_000, 80_000_000,
    ]);
  });

  it("라. §56⑤ 유상증자 조정 = [12,500,000, 25,000,000, 25,000,000] (무상증자 미적용)", () => {
    expect([
      fb[0].capitalIncreaseAdjustment,
      fb[1].capitalIncreaseAdjustment,
      fb[2].capitalIncreaseAdjustment,
    ]).toEqual([12_500_000, 25_000_000, 25_000_000]);
  });

  it("마. 최종 순손익액 = [132,500,000, 135,000,000, 105,000,000]", () => {
    expect([fb[0].finalNetIncome, fb[1].finalNetIncome, fb[2].finalNetIncome]).toEqual([
      132_500_000, 135_000_000, 105_000_000,
    ]);
  });

  it("바. 환산주식수 = [180,000, 180,000, 180,000] (§17의3⑤)", () => {
    expect([fb[0].convertedShares, fb[1].convertedShares, fb[2].convertedShares]).toEqual([
      180_000, 180_000, 180_000,
    ]);
  });

  it("사. 1주당 순손익액 = [736, 750, 583]", () => {
    expect([fb[0].perShareNetIncome, fb[1].perShareNetIncome, fb[2].perShareNetIncome]).toEqual([736, 750, 583]);
  });

  it("아. 1주당 가중평균 순손익액 = 715", () => {
    expect(r.weightedNetIncomePerShare).toBe(715);
  });

  it("차. 1주당 순손익가치 ⑤ = 715 / 0.1 = 7,150", () => {
    expect(r.netIncomePerShare).toBe(7_150);
  });
});
