/**
 * PR-A 후속 anchor — §54④ 호별 분기 + §54① 단서 + §55③ 결손법인 배제
 *
 * 검증 대상 (계획서 §3 PR-A + 디자인 §1 D-7~D-13):
 *   D-7  §54④ 1호 청산 → 순자산 단독 (무조건) + 영업권 §55③ 1호 자동 0
 *   D-8  §54④ 2호 사업개시 3년 미만 → 순자산 단독 + 영업권 §55③ 2호 자동 0
 *   D-9a §54④ 3호 부동산 80% 단서 적용 (가중평균 > 순자산) → 가중평균
 *   D-9b §54④ 3호 단서 미적용 (가중평균 < 순자산) → 순자산
 *   D-10a §54④ 5호 주식 80% 단서 적용 → 가중평균
 *   D-10b §54④ 5호 단서 미적용 → 순자산
 *   D-11 §54④ 6호 잔여존속기한 3년 → 순자산 단독 (무조건)
 *   D-12 §54① 단서 부동산과다보유 → 가중치 반전 (2·3/5)
 *   D-13 §55③ 3호 3년 결손법인 → 영업권 자동 0
 *
 * 회귀 보호 anchor — 본 PR 엔진 변경 없음. §54④ 5종 단독 사유 + 부동산과다 + 결손법인 분기 동작 동결.
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-followup.plan.md
 * Design: docs/02-design/features/inheritance-unlisted-stock-valuation-followup.design.md §1
 */

import { describe, it, expect } from "vitest";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import { calcGoodwill } from "@/lib/tax-engine/property-valuation/goodwill";
import type {
  UnlistedStockValuationInput,
  UnlistedNetAssetCalculation,
  FiscalYearAdjustment,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

// ============================================================
// 공통 헬퍼
// ============================================================

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

function emptyFY(label: string, endDate: Date, taxableIncome = 0): FiscalYearAdjustment {
  return {
    fiscalYearLabel: label,
    fiscalYearEndDate: endDate,
    taxableIncome,
  };
}

/**
 * 자기자본 5억 + 발행 10,000주 시나리오 — D-7 청산 등 무조건 사유 anchor용
 *   1주당 순자산가액 = 500,000,000 / 10,000 = 50,000원
 */
function makeBasicInput(
  override: Partial<UnlistedStockValuationInput>,
): UnlistedStockValuationInput {
  const evaluationDate = new Date("2024-01-20");
  return {
    corpName: "테스트법인",
    businessStartDate: new Date("2010-01-01"),
    evaluationDate,
    faceValuePerShare: 5_000,
    totalShares: 10_000,
    ownedShares: 10_000,
    isRealEstateHeavy: false,
    fiscalYears: [
      emptyFY("2023.1.1.~12.31.", new Date("2023-12-31")),
      emptyFY("2022.1.1.~12.31.", new Date("2022-12-31")),
      emptyFY("2021.1.1.~12.31.", new Date("2021-12-31")),
    ],
    capitalChanges: [],
    netAssetValueRaw: {
      ...ZERO_NET_ASSET,
      bsTotalAssets: 500_000_000,
      bsTotalLiabilities: 0,
    },
    isContinuousLossLastThreeYears: false,
    capitalizationRate: 0.10,
    goodwillRate: 0.10,
    isMaxShareholder: false,
    companySize: "small",
    ...override,
  };
}

// ============================================================
// D-7 — §54④ 1호 청산 (무조건 순자산 단독)
// ============================================================

describe("[D-7] §54④ 1호 청산 — 순자산 단독 (무조건) + 영업권 §55③ 1호 배제", () => {
  it("D-7: netAssetOnlyReason=liquidation → 1주당 평가액 = 50,000 (영업권 0)", () => {
    const input = makeBasicInput({ netAssetOnlyReason: "liquidation" });
    const result = evaluateUnlistedStockV2(input);

    // 순자산 5억 + 영업권 0 → ③ = 5억
    expect(result.netAssetTotal).toBe(500_000_000);
    expect(result.goodwillCalculation.goodwillFinal).toBe(0);
    expect(result.goodwillCalculation.excludedByLaw).toBe("liquidation");

    // ④ 1주당 순자산 = 50,000
    expect(result.netAssetPerShare).toBe(50_000);

    // 무조건 사유 → 가중평균 비활성 (0)
    expect(result.weightedAvgPerShare).toBe(0);

    // ⑥ 최종 = 50,000 (80% 하한 미적용)
    expect(result.finalPerShareValue).toBe(50_000);
    expect(result.netAssetFloorApplied).toBe(false);

    expect(result.appliedRules.some((r) => r.includes("liquidation"))).toBe(true);
  });
});

// ============================================================
// D-8 — §54④ 2호 사업개시 3년 미만
// ============================================================

describe("[D-8] §54④ 2호 사업개시 3년 미만 — 순자산 단독 + 영업권 §55③ 2호 배제", () => {
  it("D-8: netAssetOnlyReason=lt3y → 순자산 단독, 영업권 0", () => {
    const evaluationDate = new Date("2024-01-20");
    const input = makeBasicInput({
      // 사업개시 2021-02 (평가기준일 기준 약 2년 11개월 — 3년 미만)
      businessStartDate: new Date("2021-02-01"),
      evaluationDate,
      netAssetOnlyReason: "lt3y",
    });
    const result = evaluateUnlistedStockV2(input);

    expect(result.goodwillCalculation.goodwillFinal).toBe(0);
    expect(result.goodwillCalculation.excludedByLaw).toBe("lt3y");
    expect(result.netAssetPerShare).toBe(50_000);
    expect(result.finalPerShareValue).toBe(50_000);
    expect(result.weightedAvgPerShare).toBe(0); // 무조건 사유
    expect(result.appliedRules.some((r) => r.includes("lt3y"))).toBe(true);
  });
});

// ============================================================
// D-9a / D-9b — §54④ 3호 부동산 80% (단서 양방향)
// ============================================================

describe("[D-9a·9b] §54④ 3호 부동산 80% — 단서 양방향", () => {
  /**
   * D-9a: 가중평균 > 순자산 → 가중평균 적용 (단서로 본칙 회귀)
   *
   * 시나리오 구성:
   *   - 자기자본 5억 + 10,000주 → 1주당 순자산 50,000
   *   - 3년 순손익액 합계 1억 (각 3.33M, 가중평균 3.33M) → 1주당 순손익가치 ⑤ = 333,300 (3.33M÷0.1)
   *   - 일반 가중평균 ㉠ = (50,000×2 + 333,300×3) / 5 = (100,000 + 999,900)/5 = 219,980
   *   - 80% 하한 = 50,000 × 0.8 = 40,000
   *   - 가중평균(219,980) > 순자산(50,000) → 단서 미발동 (D-9a)
   *   - 최종 = max(219,980, 40,000) = 219,980
   *   - ★ 그러나 §55③ 1호로 영업권 0 (real_estate_80) → 순자산 동일 5억
   */
  it("D-9a: 가중평균 > 순자산 → 가중평균 적용 (영업권은 §55③ 1호로 0)", () => {
    const input = makeBasicInput({
      netAssetOnlyReason: "real_estate_80",
      fiscalYears: [
        // 각 사업연도 taxableIncome으로 약 333.3M 순손익 만들기
        {
          fiscalYearLabel: "2023",
          fiscalYearEndDate: new Date("2023-12-31"),
          taxableIncome: 333_300_000,
        },
        {
          fiscalYearLabel: "2022",
          fiscalYearEndDate: new Date("2022-12-31"),
          taxableIncome: 333_300_000,
        },
        {
          fiscalYearLabel: "2021",
          fiscalYearEndDate: new Date("2021-12-31"),
          taxableIncome: 333_300_000,
        },
      ],
    });
    const result = evaluateUnlistedStockV2(input);

    // 영업권 §55③ 1호 배제 (§54④ 3호)
    expect(result.goodwillCalculation.excludedByLaw).toBe("real_estate_80");
    expect(result.goodwillCalculation.goodwillFinal).toBe(0);

    // 1주당 순자산 = 50,000
    expect(result.netAssetPerShare).toBe(50_000);

    // 가중평균 > 순자산 → 본칙 회귀 → 가중평균 적용
    expect(result.weightedAvgPerShare).toBeGreaterThan(result.netAssetPerShare);
    expect(result.finalPerShareValue).toBe(result.weightedAvgPerShare);
  });

  /**
   * D-9b: 가중평균 < 순자산 → 순자산 적용 (단서 발동)
   *
   * 시나리오 구성:
   *   - 자기자본 5억 + 10,000주 → 1주당 순자산 50,000
   *   - 순손익 0 (사업연도 모두 빈 값) → 1주당 순손익가치 ⑤ = 0
   *   - 일반 가중평균 ㉠ = (50,000×2 + 0×3) / 5 = 20,000
   *   - 가중평균(20,000) < 순자산(50,000) → 단서 발동 → 50,000 적용
   */
  it("D-9b: 가중평균 < 순자산 → 순자산 적용 (단서 발동)", () => {
    const input = makeBasicInput({ netAssetOnlyReason: "real_estate_80" });
    const result = evaluateUnlistedStockV2(input);

    expect(result.netAssetPerShare).toBe(50_000);
    expect(result.weightedAvgPerShare).toBeLessThan(result.netAssetPerShare);

    // 단서 발동 → 순자산 적용
    expect(result.finalPerShareValue).toBe(50_000);
    expect(result.appliedRules.some((r) => r.includes("real_estate_80") && r.includes("단서"))).toBe(
      true,
    );
  });
});

// ============================================================
// D-10a / D-10b — §54④ 5호 주식 80% (단서 양방향)
// ============================================================

describe("[D-10a·10b] §54④ 5호 주식 80% — 단서 양방향", () => {
  it("D-10a: 가중평균 > 순자산 → 가중평균 적용 (단서 미발동)", () => {
    const input = makeBasicInput({
      netAssetOnlyReason: "stock_holding_80",
      fiscalYears: [
        {
          fiscalYearLabel: "2023",
          fiscalYearEndDate: new Date("2023-12-31"),
          taxableIncome: 100_000_000,
        },
        {
          fiscalYearLabel: "2022",
          fiscalYearEndDate: new Date("2022-12-31"),
          taxableIncome: 100_000_000,
        },
        {
          fiscalYearLabel: "2021",
          fiscalYearEndDate: new Date("2021-12-31"),
          taxableIncome: 100_000_000,
        },
      ],
    });
    const result = evaluateUnlistedStockV2(input);

    expect(result.netAssetPerShare).toBe(50_000);
    expect(result.weightedAvgPerShare).toBeGreaterThan(result.netAssetPerShare);
    expect(result.finalPerShareValue).toBe(result.weightedAvgPerShare);
  });

  it("D-10b: 가중평균 < 순자산 → 순자산 적용 (단서 발동)", () => {
    const input = makeBasicInput({ netAssetOnlyReason: "stock_holding_80" });
    const result = evaluateUnlistedStockV2(input);

    expect(result.netAssetPerShare).toBe(50_000);
    expect(result.weightedAvgPerShare).toBeLessThan(result.netAssetPerShare);
    expect(result.finalPerShareValue).toBe(50_000);
    expect(result.appliedRules.some((r) => r.includes("stock_holding_80") && r.includes("단서"))).toBe(
      true,
    );
  });
});

// ============================================================
// D-11 — §54④ 6호 잔여존속기한 3년 (무조건)
// ============================================================

describe("[D-11] §54④ 6호 잔여존속기한 3년 — 순자산 단독 (무조건)", () => {
  it("D-11: netAssetOnlyReason=remaining_3y → 순자산 단독, 영업권은 §55③에 명시 X", () => {
    const input = makeBasicInput({ netAssetOnlyReason: "remaining_3y" });
    const result = evaluateUnlistedStockV2(input);

    // §54④ 6호는 §55③ 자동 배제 사유 아님 — 영업권 산식상 0 (가-마 음수)
    expect(result.goodwillCalculation.goodwillFinal).toBe(0);
    expect(result.goodwillCalculation.excludedByLaw).toBeUndefined();

    expect(result.netAssetPerShare).toBe(50_000);
    expect(result.weightedAvgPerShare).toBe(0); // 무조건 사유
    expect(result.finalPerShareValue).toBe(50_000);
    expect(result.appliedRules.some((r) => r.includes("remaining_3y"))).toBe(true);
  });
});

// ============================================================
// D-12 — §54① 단서 부동산과다보유 (가중치 반전)
// ============================================================

describe("[D-12] §54① 단서 부동산과다보유 — 가중치 반전 (2·3/5)", () => {
  it("D-12: isRealEstateHeavy=true → (⑤×2 + ④×3)/5 가중치 반전", () => {
    // 자기자본 1억 + 1주당 순자산 ④ = 200원 (10,000주 → 100,000,000 / 10,000 = 10,000원이 안 됨)
    // 직접 ④=200, ⑤=100 시나리오를 만들기 위해 큰 주식수 사용
    //   자기자본 2,000,000 + 10,000주 → 1주당 순자산 = 200원
    //   순손익 1주당 100원 만들기 위해 사업연도 taxableIncome 조정
    //   1주당 순손익액 = floor(net / shares) = 10원 (예: net=100,000)
    //   가중평균 = 10원 → 순손익가치 ⑤ = 10/0.1 = 100원
    //   일반: (10×2(④에 해당) → ★ 잘못 — 본 엔진의 calcPerShareWeightedValuation:
    //     niW=3, naW=2 (일반) / niW=2, naW=3 (부동산과다)
    //     ⑤ × niW + ④ × naW
    //     일반: 100×3 + 200×2 = 300 + 400 = 700, /5 = 140
    //     부동산과다: 100×2 + 200×3 = 200 + 600 = 800, /5 = 160 (★ 더 높음)
    const input = makeBasicInput({
      isRealEstateHeavy: true,
      totalShares: 10_000,
      ownedShares: 10_000,
      netAssetValueRaw: {
        ...ZERO_NET_ASSET,
        bsTotalAssets: 2_000_000, // 1주당 순자산 200
      },
      fiscalYears: [
        {
          fiscalYearLabel: "2023",
          fiscalYearEndDate: new Date("2023-12-31"),
          taxableIncome: 100_000, // 1주당 순손익 10 → 순손익가치 100
        },
        {
          fiscalYearLabel: "2022",
          fiscalYearEndDate: new Date("2022-12-31"),
          taxableIncome: 100_000,
        },
        {
          fiscalYearLabel: "2021",
          fiscalYearEndDate: new Date("2021-12-31"),
          taxableIncome: 100_000,
        },
      ],
    });
    const result = evaluateUnlistedStockV2(input);

    expect(result.netAssetPerShare).toBe(200);
    expect(result.netIncomePerShare).toBe(100); // 10 / 0.1 = 100

    // 부동산과다 가중치 반전: (100×2 + 200×3)/5 = 800/5 = 160
    expect(result.weightedAvgPerShare).toBe(160);

    // 80% 하한 = 200×0.8 = 160 (정확 일치)
    expect(result.netAssetFloor80).toBe(160);

    // 최종 = max(160, 160) = 160
    expect(result.finalPerShareValue).toBe(160);
  });

  it("D-12 비교: isRealEstateHeavy=false (일반) → (⑤×3 + ④×2)/5", () => {
    // 동일 입력 + 일반 가중치 → 140
    const input = makeBasicInput({
      isRealEstateHeavy: false,
      totalShares: 10_000,
      ownedShares: 10_000,
      netAssetValueRaw: {
        ...ZERO_NET_ASSET,
        bsTotalAssets: 2_000_000,
      },
      fiscalYears: [
        {
          fiscalYearLabel: "2023",
          fiscalYearEndDate: new Date("2023-12-31"),
          taxableIncome: 100_000,
        },
        {
          fiscalYearLabel: "2022",
          fiscalYearEndDate: new Date("2022-12-31"),
          taxableIncome: 100_000,
        },
        {
          fiscalYearLabel: "2021",
          fiscalYearEndDate: new Date("2021-12-31"),
          taxableIncome: 100_000,
        },
      ],
    });
    const result = evaluateUnlistedStockV2(input);

    // 일반 가중치: (100×3 + 200×2)/5 = 700/5 = 140
    expect(result.weightedAvgPerShare).toBe(140);

    // 80% 하한 = 160 > 가중평균 140 → 80% 하한 발동
    expect(result.netAssetFloor80).toBe(160);
    expect(result.finalPerShareValue).toBe(160);
    expect(result.netAssetFloorApplied).toBe(true);
  });
});

// ============================================================
// D-13 — §55③ 3호 3년 결손법인 (영업권 자동 0)
// ============================================================

describe("[D-13] §55③ 3호 3년 결손법인 — 영업권 자동 0", () => {
  it("D-13: isContinuousLossLastThreeYears=true → 영업권 0 (산식 양수여도 배제)", () => {
    // 산식상으로는 영업권이 양수가 나올 수 있는 시나리오에서도 §55③ 3호로 자동 0
    const result = calcGoodwill({
      weightedAvg3y: 100_000_000, // 충분히 큰 양수
      selfCapital: 100_000_000, // 작은 자기자본 → 마 = 10M
      rate: 0.10,
      isContinuousLossLastThreeYears: true,
    });

    // 산식상: 나 = 50M, 마 = 10M, 초과이익 = 40M → 사 ≈ 40M × 3.79 ≈ 151.6M
    // 그러나 §55③ 3호 자동 배제로 자 = 0
    expect(result.weightedAvgHalf).toBe(50_000_000);
    expect(result.selfCapitalRate).toBe(10_000_000);
    expect(result.annualExcessProfit).toBe(40_000_000);
    expect(result.goodwillCalc).toBeGreaterThan(0); // 산식 자체는 양수

    // 자: §55③ 3호 자동 0
    expect(result.goodwillFinal).toBe(0);
    expect(result.excludedByLaw).toBe("continuous_loss_3y");
  });

  it("D-13 비교: isContinuousLossLastThreeYears=false → 산식 결과 그대로", () => {
    const result = calcGoodwill({
      weightedAvg3y: 100_000_000,
      selfCapital: 100_000_000,
      rate: 0.10,
      isContinuousLossLastThreeYears: false,
    });

    expect(result.annualExcessProfit).toBe(40_000_000);
    expect(result.goodwillFinal).toBeGreaterThan(0); // 산식 결과 그대로
    expect(result.excludedByLaw).toBeUndefined();
  });
});
