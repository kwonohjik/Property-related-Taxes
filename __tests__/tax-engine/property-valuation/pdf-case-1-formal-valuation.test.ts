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

  // ── 2025.07.10 양식 21항목 echo (G-3 / AC-4·AC-5) ──
  it("[AC-4] 2021 사업연도 ②~㉒ echo 입력값 일치", () => {
    expect(fb[0].addRefundInterest).toBe(1_000_000);   // ②
    expect(fb[0].subEntertainmentExcess).toBe(6_000_000); // ⑯
    expect(fb[0].subDonationExcess).toBe(3_800_000);   // ⑮
    expect(fb[0].subWithholdingPenalty).toBe(500_000); // ⑬
    expect(fb[0].subInterestPayment).toBe(3_000_000);  // ⑲
    expect(fb[0].subCorporateTax).toBe(7_000_000);     // ⑧
    expect(fb[0].subAdditionalTaxes).toBe(700_000);    // ⑨
    expect(fb[0].subForexValuationLoss).toBeUndefined(); // ㉑ 미입력
    expect(fb[1].addRefundInterest).toBeUndefined();     // 2020 미입력
  });

  it("[AC-5] addTotal = Σ가산(②~⑦), subTotal = Σ차감(⑧~㉒) 자기일관", () => {
    const add =
      (fb[0].addRefundInterest ?? 0) + (fb[0].addLossFromDividend ?? 0) +
      (fb[0].addCarriedDonation ?? 0) + (fb[0].addCarriedCarPayment ?? 0) +
      (fb[0].addForexValuationGain ?? 0) + (fb[0].addOtherByOrdinance ?? 0);
    expect(add).toBe(fb[0].addTotal);
    expect(fb[0].addTotal).toBe(1_000_000);

    const sub =
      (fb[0].subCorporateTax ?? 0) + (fb[0].subAdditionalTaxes ?? 0) +
      (fb[0].subFines ?? 0) + (fb[0].subCompulsoryPublicCharges ?? 0) +
      (fb[0].subPunitiveDamages ?? 0) + (fb[0].subWithholdingPenalty ?? 0) +
      (fb[0].subExcessiveExpenses ?? 0) + (fb[0].subDonationExcess ?? 0) +
      (fb[0].subEntertainmentExcess ?? 0) + (fb[0].subNonBusinessExpenses ?? 0) +
      (fb[0].subNonBusinessCarExpenses ?? 0) + (fb[0].subInterestPayment ?? 0) +
      (fb[0].subDepreciationShortage ?? 0) + (fb[0].subForexValuationLoss ?? 0) +
      (fb[0].subOtherByOrdinance ?? 0);
    expect(sub).toBe(fb[0].subTotal);
    expect(fb[0].subTotal).toBe(21_000_000);
  });
});

// ── 날짜 string 직렬화 방어 (sessionStorage/이력 복원 회귀) ──
// changeDate·fiscalYearEndDate·evaluationDate가 JSON 경유로 string이 되어도
// §56⑤ 유상증자 조정·환산주식수가 Date 입력과 동일해야 한다.
// (수정 전: capital-increase·converted-shares의 raw Date 비교가 silent false → 증자년도 0/환산주식수 미반영)
describe("[SER] 날짜 string 직렬화 silent false 방어", () => {
  // sessionStorage 복원 시뮬: Date → ISO string
  const serialized = JSON.parse(JSON.stringify(PDF_CASE_1)) as UnlistedStockValuationInput;
  const r = evaluateUnlistedStockV2(serialized);
  const fb = r.fiscalYearBreakdowns;

  it("string changeDate: typeof 확인 (입력이 실제로 string인지)", () => {
    expect(typeof (serialized.capitalChanges[0].changeDate as unknown)).toBe("string");
    expect(typeof (serialized.fiscalYears[0].fiscalYearEndDate as unknown)).toBe("string");
  });

  it("라. §56⑤ 조정 = [12,500,000, 25,000,000, 25,000,000] (Date 입력과 동일)", () => {
    expect([
      fb[0].capitalIncreaseAdjustment,
      fb[1].capitalIncreaseAdjustment,
      fb[2].capitalIncreaseAdjustment,
    ]).toEqual([12_500_000, 25_000_000, 25_000_000]);
  });

  it("바. 환산주식수 = [180,000, 180,000, 180,000] (Date 입력과 동일)", () => {
    expect([fb[0].convertedShares, fb[1].convertedShares, fb[2].convertedShares]).toEqual([
      180_000, 180_000, 180_000,
    ]);
  });

  it("차. 1주당 순손익가치 ⑤ = 7,150 (Date 입력과 동일)", () => {
    expect(r.netIncomePerShare).toBe(7_150);
  });
});

// ── 할증율 companySize 분기 (법 §63③ 20% / 시행령 §53⑧9호 중소·중견 배제) AC-7 ──
describe("[AC-7] 최대주주 할증율 companySize 분기", () => {
  const maxBase: UnlistedStockValuationInput = { ...PDF_CASE_1, isMaxShareholder: true };

  it("large → premiumRate 0.20 (법 §63③)", () => {
    expect(evaluateUnlistedStockV2({ ...maxBase, companySize: "large" }).premiumRate).toBe(0.2);
  });

  it("small(중소기업) → premiumRate 0 (§53⑧9호 배제)", () => {
    expect(evaluateUnlistedStockV2({ ...maxBase, companySize: "small" }).premiumRate).toBe(0);
  });

  it("medium(중견기업) → premiumRate 0 (§53⑦·§53⑧9호 배제)", () => {
    expect(evaluateUnlistedStockV2({ ...maxBase, companySize: "medium" }).premiumRate).toBe(0);
  });

  it("비최대주주 → premiumRate 0", () => {
    expect(evaluateUnlistedStockV2({ ...PDF_CASE_1, isMaxShareholder: false, companySize: "large" }).premiumRate).toBe(0);
  });
});

// ── §17의3② 1년 미만 사업연도 연환산 (FY / AN) ──
describe("[FY] §17의3② 1년 미만 사업연도 연환산", () => {
  it("FY-1(AN-2): startDate 미입력(12개월) → 연환산 미적용, 가중평균 715 회귀", () => {
    const r = evaluateUnlistedStockV2(PDF_CASE_1);
    expect(r.annualizationApplied).toBeUndefined();
    expect(r.weightedNetIncomePerShare).toBe(715);
  });

  it("AN-1: 2021 사업연도 6개월(2021-07-01~12-31) → 1주당 ×2 환산 + annualizationApplied[0]=true", () => {
    const input: typeof PDF_CASE_1 = {
      ...PDF_CASE_1,
      fiscalYears: [
        { ...PDF_CASE_1.fiscalYears[0], fiscalYearStartDate: new Date("2021-07-01") },
        PDF_CASE_1.fiscalYears[1],
        PDF_CASE_1.fiscalYears[2],
      ],
    };
    const r = evaluateUnlistedStockV2(input);
    expect(r.annualizationApplied).toEqual([true, false, false]);
    // H-26: 사업연도 0 개시일 2021-07-01 → 유상증자 2021-06-30은 개시 전 → §56⑤ 조정 0
    //   (종전 역산 개시 2021-01-01은 증자를 6개월 월할 12,500,000 과대 산입 → 736·1,472 버그값).
    //   마[0] = 120,000,000 → 1주당 순손익액 666 → ×12/6 = 1,332.
    expect(r.annualizedPerShareNetIncome?.[0]).toBe(1_332);
    // 가중평균이 환산 반영으로 715에서 변동
    expect(r.weightedNetIncomePerShare).not.toBe(715);
  });
});
