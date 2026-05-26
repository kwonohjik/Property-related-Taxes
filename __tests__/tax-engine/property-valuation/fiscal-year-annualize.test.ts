/**
 * §17의3② 1년 미만 사업연도 연환산 anchor 테스트 (FYA-1 ~ FYA-9)
 *
 * 설계: docs/02-design/features/inheritance-unlisted-fiscal-year-under-1year.design.md §5
 * 법령: 상증규 §17의3② — "사업연도가 1년 미만인 경우에는 1년으로 계산한 가액으로 한다."
 * 환산: 1주당 순손익액 × 12 / 개월수. 개월수 = differenceInCalendarMonths(end,start)+1.
 *
 * FYA-1: fiscalYearStartDate 미입력 → 12개월 가정, 환산 없음 (회귀)
 * FYA-2: 6개월 사업연도 → ×2 환산
 * FYA-3: 9개월 사업연도 → ×12/9 환산
 * FYA-5: 12개월·13개월 → 무변환
 * FYA-8: 6개월 결손 → 환산 후 결손 확대
 * FYA-9: 개월수 경계 (2023-07-01~2023-12-31 = 6)
 * FY-7:  annualizationApplied echo 표시 (orchestrator 통합)
 */

import { describe, it, expect } from "vitest";
import {
  fiscalYearMonths,
  annualizePerShareNetIncome,
  monthsBetween,
} from "@/lib/tax-engine/property-valuation/fiscal-year-annualize";
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

describe("§17의3② 연환산 — fiscalYearMonths / annualizePerShareNetIncome 단위", () => {
  it("FYA-9: 2023-07-01~2023-12-31 = 6개월 (differenceInCalendarMonths(12,7)+1=6)", () => {
    const months = fiscalYearMonths(new Date("2023-07-01"), new Date("2023-12-31"));
    expect(months).toBe(6);
  });

  it("FYA-1: fiscalYearStartDate 미입력 → 12개월 (연환산 없음)", () => {
    expect(fiscalYearMonths(undefined, undefined)).toBe(12);
    expect(fiscalYearMonths(undefined, new Date("2023-12-31"))).toBe(12);
    expect(annualizePerShareNetIncome(1000, undefined, new Date("2023-12-31"))).toBe(1000);
  });

  it("FYA-2: 6개월 사업연도 → perShare × 2 (×12/6)", () => {
    const start = new Date("2023-07-01");
    const end = new Date("2023-12-31");
    // 개월수 확인
    expect(fiscalYearMonths(start, end)).toBe(6);
    // 1주당 6,000 → 12,000
    expect(annualizePerShareNetIncome(6_000, start, end)).toBe(12_000);
    // 1주당 60,000,000 → 120,000,000
    expect(annualizePerShareNetIncome(60_000_000, start, end)).toBe(120_000_000);
  });

  it("FYA-3: 9개월 사업연도 → perShare × 12/9", () => {
    const start = new Date("2023-04-01");
    const end = new Date("2023-12-31");
    expect(fiscalYearMonths(start, end)).toBe(9);
    // 9,000 × 12/9 = 12,000
    expect(annualizePerShareNetIncome(9_000, start, end)).toBe(12_000);
  });

  it("FYA-5: 12개월 사업연도 → 무변환", () => {
    const start = new Date("2023-01-01");
    const end = new Date("2023-12-31");
    expect(fiscalYearMonths(start, end)).toBe(12);
    expect(annualizePerShareNetIncome(5_000, start, end)).toBe(5_000);
  });

  it("FYA-5b: 13개월(결산기 변경) → months≥12 → 무변환", () => {
    const start = new Date("2022-12-01");
    const end = new Date("2023-12-31");
    const months = fiscalYearMonths(start, end);
    expect(months).toBeGreaterThanOrEqual(12);
    expect(annualizePerShareNetIncome(5_000, start, end)).toBe(5_000);
  });

  it("FYA-8: 결손 6개월 → 환산 후 결손 확대 (음수 × 2)", () => {
    const start = new Date("2023-07-01");
    const end = new Date("2023-12-31");
    // -6,000 × 12/6 = -12,000
    expect(annualizePerShareNetIncome(-6_000, start, end)).toBe(-12_000);
  });

  it("monthsBetween: start > end → 0 가드", () => {
    expect(monthsBetween(new Date("2024-01-01"), new Date("2023-01-01"))).toBe(0);
  });

  it("monthsBetween floorToOne default true: 같은 월 start/end → 최소 1", () => {
    // §56⑤ 유상증자 월할 계산 호환 — 1개월 미만도 1개월
    const m = monthsBetween(new Date("2023-07-15"), new Date("2023-07-20"));
    expect(m).toBeGreaterThanOrEqual(1);
  });

  it("monthsBetween floorToOne:false: 같은 월 start/end → 1 (절상 없음)", () => {
    // §17의3② 환산용 — differenceInCalendarMonths(7,7)+1 = 1
    const m = monthsBetween(new Date("2023-07-01"), new Date("2023-07-31"), { floorToOne: false });
    expect(m).toBe(1);
  });
});

describe("§17의3② 연환산 — evaluateUnlistedStockV2 orchestrator 통합 (FY-7·FYA-2 통합)", () => {
  /**
   * FY-7 + FYA-2: 6개월 1년전 사업연도 입력
   * 1년전: fiscalYearStartDate=2023-07-01, end=2023-12-31, taxableIncome=60,000,000
   *   → 순손익액 60,000,000 (차감 없음), 환산주식수 = totalShares = 1,000
   *   → 1주당 순손익액 = 60,000,000 / 1,000 = 60,000
   *   → §17의3② 연환산: 60,000 × 12/6 = 120,000
   * 2년전·3년전: 12개월, 순손익 0 → 1주당 0
   * 가중평균: (120,000×3 + 0×2 + 0×1) / 6 = 60,000
   * annualizationApplied[0] = true, annualizedPerShareNetIncome[0] = 120,000
   */
  const FY7_INPUT: UnlistedStockValuationInput = {
    corpName: "FY7테스트",
    businessStartDate: new Date("2020-01-01"),
    evaluationDate: new Date("2024-03-31"),
    faceValuePerShare: 5_000,
    totalShares: 1_000,
    ownedShares: 1_000,
    isRealEstateHeavy: false,
    fiscalYears: [
      {
        fiscalYearLabel: "2023(6개월)",
        fiscalYearEndDate: new Date("2023-12-31"),
        fiscalYearStartDate: new Date("2023-07-01"), // 6개월 신설
        taxableIncome: 60_000_000,
      },
      {
        fiscalYearLabel: "2022",
        fiscalYearEndDate: new Date("2022-12-31"),
        taxableIncome: 0,
      },
      {
        fiscalYearLabel: "2021",
        fiscalYearEndDate: new Date("2021-12-31"),
        taxableIncome: 0,
      },
    ],
    capitalChanges: [],
    netAssetValueRaw: ZERO_NET_ASSET,
    isContinuousLossLastThreeYears: false,
    capitalizationRate: 0.10,
    isMaxShareholder: false,
    companySize: "small",
  };

  it("FY-7: annualizationApplied[0]=true echo 확인", () => {
    const result = evaluateUnlistedStockV2(FY7_INPUT);
    expect(result.annualizationApplied).toBeDefined();
    expect(result.annualizationApplied![0]).toBe(true);
    expect(result.annualizationApplied![1]).toBe(false);
    expect(result.annualizationApplied![2]).toBe(false);
  });

  it("FY-7: annualizedPerShareNetIncome[0]=120,000 (60,000 × 12/6)", () => {
    const result = evaluateUnlistedStockV2(FY7_INPUT);
    expect(result.annualizedPerShareNetIncome).toBeDefined();
    expect(result.annualizedPerShareNetIncome![0]).toBe(120_000);
  });

  it("FYA-2 통합: 연환산 반영된 가중평균 = (120,000×3 + 0 + 0) / 6 = 60,000", () => {
    const result = evaluateUnlistedStockV2(FY7_INPUT);
    expect(result.weightedNetIncomePerShare).toBe(60_000);
  });

  it("FYA-1 회귀: fiscalYearStartDate 미입력 시 annualizationApplied 없음 (12개월 회귀)", () => {
    const input12: UnlistedStockValuationInput = {
      ...FY7_INPUT,
      fiscalYears: [
        {
          fiscalYearLabel: "2023",
          fiscalYearEndDate: new Date("2023-12-31"),
          // fiscalYearStartDate 없음 → 12개월
          taxableIncome: 60_000_000,
        },
        FY7_INPUT.fiscalYears[1],
        FY7_INPUT.fiscalYears[2],
      ],
    };
    const result = evaluateUnlistedStockV2(input12);
    // 12개월 → 연환산 없음 → annualizationApplied undefined
    expect(result.annualizationApplied).toBeUndefined();
    expect(result.annualizedPerShareNetIncome).toBeUndefined();
    // 가중평균: (60,000×3 + 0 + 0) / 6 = 30,000 (미환산)
    expect(result.weightedNetIncomePerShare).toBe(30_000);
  });
});

describe("§17의3② 연환산 — Zod validation (⑧⑫)", () => {
  it("개시일 > 종료일이면 Zod 오류", async () => {
    const { fiscalYearAdjustmentSchema } = await import(
      "@/lib/validators/unlisted-stock-valuation-v2.schema"
    );
    const result = fiscalYearAdjustmentSchema.safeParse({
      fiscalYearLabel: "2023",
      fiscalYearEndDate: new Date("2023-12-31"),
      fiscalYearStartDate: new Date("2024-01-01"), // start > end — 차단
      taxableIncome: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // ZodError에서 issues로 접근
      const msgs = result.error.issues.map((issue) => issue.message);
      expect(msgs.some((m) => m.includes("개시일") && m.includes("종료일"))).toBe(true);
    }
  });

  it("개시일 <= 종료일이면 통과", async () => {
    const { fiscalYearAdjustmentSchema } = await import(
      "@/lib/validators/unlisted-stock-valuation-v2.schema"
    );
    const result = fiscalYearAdjustmentSchema.safeParse({
      fiscalYearLabel: "2023",
      fiscalYearEndDate: new Date("2023-12-31"),
      fiscalYearStartDate: new Date("2023-07-01"), // 6개월 — 통과
      taxableIncome: 0,
    });
    expect(result.success).toBe(true);
  });

  it("개시일 미입력이면 통과 (optional)", async () => {
    const { fiscalYearAdjustmentSchema } = await import(
      "@/lib/validators/unlisted-stock-valuation-v2.schema"
    );
    const result = fiscalYearAdjustmentSchema.safeParse({
      fiscalYearLabel: "2023",
      fiscalYearEndDate: new Date("2023-12-31"),
      // fiscalYearStartDate 없음
      taxableIncome: 0,
    });
    expect(result.success).toBe(true);
  });
});
