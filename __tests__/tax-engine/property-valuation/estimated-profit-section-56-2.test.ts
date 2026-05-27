/**
 * PR-G — §56② 추정이익 갈음 평가 옵션 anchor (EP-1~8)
 *
 * 법령: 상증령 §56② + 상증규 §17의3①④ (KoreanLaw MCP 2026-05-27)
 *   추정이익 평균가액(= 수익가치 × 환원율) ÷ 환원율 = 수익가치 → 순손익가치 ⑤ 갈음
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-estimated-profit-section-56-2.plan.md
 */

import { describe, it, expect } from "vitest";
import {
  applyEstimatedProfit,
  ESTIMATED_PROFIT_REASON_LABEL,
  type EstimatedProfitInput,
  type EstimatedProfitReasonCode,
} from "@/lib/tax-engine/property-valuation/estimated-profit-section-56-2";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";
import { unlistedStockValuationV2Schema } from "@/lib/validators/unlisted-stock-valuation-v2.schema";

// ── 공용 입력 빌더 ──
function baseInput(
  overrides: Partial<UnlistedStockValuationInput> = {},
): UnlistedStockValuationInput {
  return {
    corpName: "㈜예제",
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
      bsTotalAssets: 2_476_889_520,
      assetValuationDelta: 91_548_350,
      corpTaxReservedAmount: 0,
      paidInCapitalIncrease: 0,
      otherEarnedRights: 0,
      prepaidExpenses: 65_400_500,
      preGiftRetainedEarnings: 0,
      bsTotalLiabilities: 1_833_780_000,
      corporateTaxPayable: 32_627_890,
      farmingSurtax: 0,
      localIncomeTax: 3_262_780,
      dividendPayable: 0,
      retirementProvision: 445_785_000,
      otherProvision: 0,
      reserveExcluded: 0,
      allowanceExcluded: 301_770_000,
      deferredTaxAdjustment: 0,
    },
    isContinuousLossLastThreeYears: false,
    capitalizationRate: 0.1,
    isMaxShareholder: true,
    companySize: "large",
    ...overrides,
  };
}

function epInput(overrides: Partial<EstimatedProfitInput> = {}): EstimatedProfitInput {
  return {
    reasonCode: "merger_split_business_change",
    agencyEstimates: [1_000, 1_400],
    filedWithinDeadline: true,
    baseDateAndReportWithinDeadline: true,
    sameYearAsInheritanceOrGift: true,
    ...overrides,
  };
}

// ============================================================
// EP-1 — applyEstimatedProfit 산식 (손계산)
// ============================================================
describe("[PR-G] EP-1 applyEstimatedProfit 산식", () => {
  it("요건 충족 → 평균가액 1,200 / 순손익가치 12,000 (§17의3④ 환원율 상쇄)", () => {
    const r = applyEstimatedProfit(epInput(), 0.1);
    expect(r.applied).toBe(true);
    expect(r.estimatedProfitAverage).toBe(1_200); // floor((1000+1400)/2)
    expect(r.perShareIncomeValue).toBe(12_000); // floor(1200/0.10)
    expect(r.agencyCount).toBe(2);
    expect(r.warnings).toEqual([]);
  });

  it("3개 기관 평균 + 원 미만 절사", () => {
    const r = applyEstimatedProfit(epInput({ agencyEstimates: [1_000, 1_001, 1_001] }), 0.1);
    expect(r.estimatedProfitAverage).toBe(1_000); // floor(3002/3=1000.67)
    expect(r.perShareIncomeValue).toBe(10_000);
  });
});

// ============================================================
// EP-2 — orchestrator 갈음 (netIncomePerShare 대체)
// ============================================================
describe("[PR-G] EP-2 orchestrator 갈음", () => {
  it("추정이익 적용 시 result.netIncomePerShare = 갈음값(12,000)", () => {
    const withEp = evaluateUnlistedStockV2(baseInput({ estimatedProfit: epInput() }));
    expect(withEp.netIncomePerShare).toBe(12_000);
    expect(withEp.estimatedProfitResult?.applied).toBe(true);
    expect(withEp.appliedRules.some((r) => r.includes("§56② 추정이익"))).toBe(true);
  });

  it("미입력 케이스와 비교 — 순손익가치만 변경(갈음≠가중평균)", () => {
    const baseline = evaluateUnlistedStockV2(baseInput());
    const withEp = evaluateUnlistedStockV2(baseInput({ estimatedProfit: epInput() }));
    expect(withEp.netIncomePerShare).not.toBe(baseline.netIncomePerShare);
    expect(withEp.netIncomePerShare).toBe(12_000);
  });
});

// ============================================================
// EP-3 — 요건 미충족(기관 1개) → 갈음 안 함
// ============================================================
describe("[PR-G] EP-3 둘 이상 미충족", () => {
  it("기관 1개 → applied=false, 순손익가치 현행 가중평균 유지", () => {
    const baseline = evaluateUnlistedStockV2(baseInput());
    const r = applyEstimatedProfit(epInput({ agencyEstimates: [1_000] }), 0.1);
    expect(r.applied).toBe(false);
    expect(r.warnings.some((w) => w.includes("둘 이상"))).toBe(true);

    const withEp = evaluateUnlistedStockV2(
      baseInput({ estimatedProfit: epInput({ agencyEstimates: [1_000] }) }),
    );
    expect(withEp.netIncomePerShare).toBe(baseline.netIncomePerShare); // 갈음 안 됨
  });
});

// ============================================================
// EP-4 — 절차 요건 1개 false → 갈음 안 함 + warning
// ============================================================
describe("[PR-G] EP-4 절차 요건 미충족", () => {
  it("동일연도(4호) false → applied=false + 절차 warning", () => {
    const r = applyEstimatedProfit(epInput({ sameYearAsInheritanceOrGift: false }), 0.1);
    expect(r.applied).toBe(false);
    expect(r.warnings.some((w) => w.includes("절차 요건"))).toBe(true);
  });
});

// ============================================================
// EP-5 교체 + EP9-1~3 — §59③ 영업권 추정이익 준용 (PR-G2)
// ============================================================
describe("[PR-G2] §59③ 영업권 추정이익 준용", () => {
  it("EP-5 교체: 추정이익 적용 + 영업권>0 → 미반영 warning 부재 + §59③ 준용", () => {
    // 고수익·저순자산 → 영업권 확실히 >0
    const highGoodwill = baseInput({
      fiscalYears: [
        { fiscalYearLabel: "2023", fiscalYearEndDate: new Date("2023-12-31"), taxableIncome: 500_000_000 },
        { fiscalYearLabel: "2022", fiscalYearEndDate: new Date("2022-12-31"), taxableIncome: 500_000_000 },
        { fiscalYearLabel: "2021", fiscalYearEndDate: new Date("2021-12-31"), taxableIncome: 500_000_000 },
      ],
      netAssetValueRaw: {
        ...baseInput().netAssetValueRaw,
        bsTotalAssets: 1_000_000_000,
        assetValuationDelta: 0,
        prepaidExpenses: 0,
        bsTotalLiabilities: 900_000_000,
        corporateTaxPayable: 0,
        localIncomeTax: 0,
        retirementProvision: 0,
        allowanceExcluded: 0,
      },
      estimatedProfit: epInput(),
    });
    const r = evaluateUnlistedStockV2(highGoodwill);
    expect(r.goodwillCalculation.goodwillFinal).toBeGreaterThan(0);
    // PR-G2: §59③ 준용 — 미반영 warning 제거 + appliedRules에 §59③ 준용
    expect(r.warnings.some((w) => w.includes("미반영"))).toBe(false);
    expect(r.appliedRules.some((w) => w.includes("§59③"))).toBe(true);
    // EP9-1: 영업권 가중평균(가.) = 추정이익 평균가액(1,200) × 발행주식총수(50,000)
    expect(r.goodwillCalculation.weightedAvg3y).toBe(1_200 * 50_000);
  });

  it("EP9-2: 추정이익 ON vs OFF → 영업권 가중평균·goodwillFinal 상이", () => {
    const offBase = baseInput({
      fiscalYears: [
        { fiscalYearLabel: "2023", fiscalYearEndDate: new Date("2023-12-31"), taxableIncome: 500_000_000 },
        { fiscalYearLabel: "2022", fiscalYearEndDate: new Date("2022-12-31"), taxableIncome: 500_000_000 },
        { fiscalYearLabel: "2021", fiscalYearEndDate: new Date("2021-12-31"), taxableIncome: 500_000_000 },
      ],
      netAssetValueRaw: {
        ...baseInput().netAssetValueRaw,
        bsTotalAssets: 1_000_000_000,
        assetValuationDelta: 0,
        prepaidExpenses: 0,
        bsTotalLiabilities: 900_000_000,
        corporateTaxPayable: 0,
        localIncomeTax: 0,
        retirementProvision: 0,
        allowanceExcluded: 0,
      },
    });
    const off = evaluateUnlistedStockV2(offBase);
    const on = evaluateUnlistedStockV2({ ...offBase, estimatedProfit: epInput() });
    expect(on.goodwillCalculation.weightedAvg3y).not.toBe(off.goodwillCalculation.weightedAvg3y);
    expect(on.goodwillCalculation.goodwillFinal).not.toBe(off.goodwillCalculation.goodwillFinal);
  });

  it("EP9-3: 추정이익 applied + §55③ 3년결손 배제 → goodwillFinal=0 유지 + §59③ 안내 미표시", () => {
    const r = evaluateUnlistedStockV2(
      baseInput({
        fiscalYears: [
          { fiscalYearLabel: "2023", fiscalYearEndDate: new Date("2023-12-31"), taxableIncome: 500_000_000 },
          { fiscalYearLabel: "2022", fiscalYearEndDate: new Date("2022-12-31"), taxableIncome: 500_000_000 },
          { fiscalYearLabel: "2021", fiscalYearEndDate: new Date("2021-12-31"), taxableIncome: 500_000_000 },
        ],
        isContinuousLossLastThreeYears: true,
        estimatedProfit: epInput(),
      }),
    );
    expect(r.goodwillCalculation.goodwillFinal).toBe(0);
    expect(r.goodwillCalculation.excludedByLaw).toBe("continuous_loss_3y");
    expect(r.appliedRules.some((w) => w.includes("§59③"))).toBe(false);
  });
});

// ============================================================
// EP-6 — 음수 추정이익 → 0 강제 안 함 + warning + 하류 80% 하한 보정
// ============================================================
describe("[PR-G] EP-6 음수 추정이익 (§56② 음수→0 단서 displace)", () => {
  it("음수 평균 → perShareIncomeValue 음수(0 미강제) + warning", () => {
    const r = applyEstimatedProfit(epInput({ agencyEstimates: [-5_000, -3_000] }), 0.1);
    expect(r.estimatedProfitAverage).toBe(-4_000);
    expect(r.perShareIncomeValue).toBe(-40_000); // floor(-4000/0.10), 0 강제 안 함
    expect(r.warnings.some((w) => w.includes("음수"))).toBe(true);
  });

  it("orchestrator — 음수 순손익가치는 80% 순자산 하한으로 보정", () => {
    const r = evaluateUnlistedStockV2(
      baseInput({ estimatedProfit: epInput({ agencyEstimates: [-5_000, -3_000] }) }),
    );
    // 가중평균 < 80%하한 → 80% 하한 발동
    expect(r.netAssetFloorApplied).toBe(true);
    expect(r.finalPerShareValue).toBe(r.netAssetFloor80);
  });
});

// ============================================================
// EP-8 — reasonCode 7종 매핑 (1호 삭제 제외)
// ============================================================
describe("[PR-G] EP-8 reasonCode 라벨 매핑", () => {
  it("7개 사유 모두 라벨 존재 + 비어있지 않음", () => {
    const codes: EstimatedProfitReasonCode[] = [
      "asset_receipt_50pct",
      "merger_split_business_change",
      "merger_gift_section38",
      "closure_over_1yr",
      "disposal_gain_50pct",
      "sales_period_under_3yr",
      "similar_notified",
    ];
    expect(Object.keys(ESTIMATED_PROFIT_REASON_LABEL).length).toBe(7);
    for (const c of codes) {
      expect(ESTIMATED_PROFIT_REASON_LABEL[c]).toBeTruthy();
      expect(ESTIMATED_PROFIT_REASON_LABEL[c].length).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// EP-7 — Zod superRefine (둘 이상 미충족 차단)
// ============================================================
describe("[PR-G] EP-7 Zod superRefine", () => {
  function schemaInput(estimatedProfit?: unknown) {
    return {
      corpName: "㈜예제",
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
      netAssetValueRaw: baseInput().netAssetValueRaw,
      isContinuousLossLastThreeYears: false,
      capitalizationRate: 0.1,
      isMaxShareholder: true,
      companySize: "large",
      estimatedProfit,
    };
  }

  it("ON + 기관 1개 → parse 실패 (path estimatedProfit.agencyEstimates)", () => {
    const res = unlistedStockValuationV2Schema.safeParse(
      schemaInput({
        reasonCode: "merger_split_business_change",
        agencyEstimates: [1_000],
        filedWithinDeadline: true,
        baseDateAndReportWithinDeadline: true,
        sameYearAsInheritanceOrGift: true,
      }),
    );
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some((i) => i.path.join(".") === "estimatedProfit.agencyEstimates"),
      ).toBe(true);
    }
  });

  it("ON + 기관 2개 → parse 성공", () => {
    const res = unlistedStockValuationV2Schema.safeParse(
      schemaInput({
        reasonCode: "merger_split_business_change",
        agencyEstimates: [1_000, 1_400],
        filedWithinDeadline: true,
        baseDateAndReportWithinDeadline: true,
        sameYearAsInheritanceOrGift: true,
      }),
    );
    expect(res.success).toBe(true);
  });

  it("OFF(미입력) → parse 성공 (회귀)", () => {
    const res = unlistedStockValuationV2Schema.safeParse(schemaInput(undefined));
    expect(res.success).toBe(true);
  });
});

// ============================================================
// 회귀 — estimatedProfit 미입력 시 결과 불변
// ============================================================
describe("[PR-G] 회귀 — 미입력 불변", () => {
  it("estimatedProfit undefined → estimatedProfitResult undefined, 결과 동일", () => {
    const r = evaluateUnlistedStockV2(baseInput());
    expect(r.estimatedProfitResult).toBeUndefined();
  });
});
