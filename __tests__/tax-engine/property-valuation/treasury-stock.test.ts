/**
 * 자기주식 보유 비상장주식 평가 anchor (교재 이미지 4~8, p.1453~1456)
 *
 * 기준값(이미지 사례): A=1,800,000,000(영업권 포함 후), N=30,000, t=6,000,
 *   1주당 순손익액 7,000 → p(순손익가치)=70,000. (C-05만 p=0)
 *   영업권 0이 되도록 회사 가중평균 순손익액을 낮게(나<마) 구성.
 *
 * Plan/Design: docs/02-design/features/inheritance-unlisted-stock-treasury-stock.{plan,engine.design}.md
 */
import { describe, it, expect } from "vitest";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import { solveSelfReferentialValuation } from "@/lib/tax-engine/property-valuation/treasury-stock";
import type {
  UnlistedStockValuationInput,
  UnlistedNetAssetCalculation,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

// 이미지 기준 상수
const A = 1_800_000_000; // 자기주식 제외 순자산가액 (영업권 포함 후)
const N = 30_000; // 발행주식총수
const T = 6_000; // 자기주식수
const P = 70_000; // 순손익가치 (1주당 순손익액 7,000 ÷ 0.1)

// 순자산 A=1,800,000,000: 제자산 2,000,000,000 − 제부채 200,000,000 (조정 0)
const NET_ASSET: UnlistedNetAssetCalculation = {
  bsTotalAssets: 2_000_000_000,
  assetValuationDelta: 0,
  corpTaxReservedAmount: 0,
  paidInCapitalIncrease: 0,
  otherEarnedRights: 0,
  prepaidExpenses: 0,
  preGiftRetainedEarnings: 0,
  bsTotalLiabilities: 200_000_000,
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

/**
 * 기준 입력 빌더. perShareIncome는 "유효발행주식총수당 1주당 순손익액"이 7,000이 되도록
 * 사업연도 taxableIncome = 7,000 × effectiveShares 로 구성(자본변동 0건 → 환산주식수=effectiveShares).
 */
function makeInput(opts: {
  treasuryStock?: { shares: number; purpose: "temporary_holding" | "cancellation" };
  perShareIncome?: number; // 기본 7,000 (C-05는 0)
  isRealEstateHeavy?: boolean;
  netAssetOnlyReason?: UnlistedStockValuationInput["netAssetOnlyReason"];
  isMaxShareholder?: boolean;
}): UnlistedStockValuationInput {
  const perShare = opts.perShareIncome ?? 7_000;
  const effective =
    opts.treasuryStock?.purpose === "cancellation" ? N - opts.treasuryStock.shares : N;
  const fyIncome = perShare * effective; // 각 사업연도 동일 → 가중평균 1주당 = perShare
  return {
    corpName: "㈜하늘",
    businessStartDate: new Date("2010-01-01"),
    evaluationDate: new Date("2020-01-20"),
    faceValuePerShare: 5_000,
    totalShares: N,
    ownedShares: 10_000,
    isRealEstateHeavy: opts.isRealEstateHeavy ?? false,
    netAssetOnlyReason: opts.netAssetOnlyReason,
    fiscalYears: [
      { fiscalYearLabel: "2019", fiscalYearEndDate: new Date("2019-12-31"), taxableIncome: fyIncome },
      { fiscalYearLabel: "2018", fiscalYearEndDate: new Date("2018-12-31"), taxableIncome: fyIncome },
      { fiscalYearLabel: "2017", fiscalYearEndDate: new Date("2017-12-31"), taxableIncome: fyIncome },
    ],
    capitalChanges: [],
    netAssetValueRaw: NET_ASSET,
    isContinuousLossLastThreeYears: false,
    capitalizationRate: 0.10,
    isMaxShareholder: opts.isMaxShareholder ?? false,
    companySize: "large",
    treasuryStock: opts.treasuryStock,
  };
}

// ============================================================
// solver 단위 (treasury-stock.ts — 일시보유 전용)
// ============================================================
describe("solveSelfReferentialValuation (일시보유 자기참조)", () => {
  it("C-02 일반법인 → 71,739", () => {
    const r = solveSelfReferentialValuation({
      netAssetTotal: A, treasuryShares: T, totalShares: N,
      netIncomeValuePerShare: P, isRealEstateHeavy: false, netAssetOnly: false,
    });
    expect(r.weightedSelfRef).toBe(71_739);
    expect(r.selfRefNetAssetPerShare).toBe(74_347);
    expect(r.finalPerShareValue).toBe(71_739);
    expect(r.floor80Applied).toBe(false);
  });

  it("C-05 80% 하한 재계산 (p=0) → 57,142", () => {
    const r = solveSelfReferentialValuation({
      netAssetTotal: A, treasuryShares: T, totalShares: N,
      netIncomeValuePerShare: 0, isRealEstateHeavy: false, netAssetOnly: false,
    });
    expect(r.weightedSelfRef).toBe(26_086);
    expect(r.selfRefNetAssetPerShare).toBe(65_217);
    expect(r.floor80Applied).toBe(true);
    expect(r.floor80NetAssetValue).toBe(71_428);
    expect(r.finalPerShareValue).toBe(57_142);
  });

  it("C-06 부동산과다보유 → 72,727", () => {
    const r = solveSelfReferentialValuation({
      netAssetTotal: A, treasuryShares: T, totalShares: N,
      netIncomeValuePerShare: P, isRealEstateHeavy: true, netAssetOnly: false,
    });
    expect(r.finalPerShareValue).toBe(72_727);
  });

  it("C-07 순자산단독 → 75,000", () => {
    const r = solveSelfReferentialValuation({
      netAssetTotal: A, treasuryShares: T, totalShares: N,
      netIncomeValuePerShare: P, isRealEstateHeavy: false, netAssetOnly: true,
    });
    expect(r.finalPerShareValue).toBe(75_000);
  });
});

// ============================================================
// 오케스트레이터 통합
// ============================================================
describe("evaluateUnlistedStockV2 — 자기주식 통합", () => {
  it("C-01 자기주식 없음 (회귀) → ④60,000 ⑤70,000 ⑥66,000", () => {
    const r = evaluateUnlistedStockV2(makeInput({}));
    expect(r.netAssetPerShare).toBe(60_000); // 1,800,000,000 / 30,000
    expect(r.netIncomePerShare).toBe(70_000);
    expect(r.weightedAvgPerShare).toBe(66_000); // (70,000×3 + 60,000×2)/5
    expect(r.finalPerShareValue).toBe(66_000);
    expect(r.treasuryStockApplied).toBeUndefined();
  });

  it("C-02 일시보유 일반 → ⑥71,739", () => {
    const r = evaluateUnlistedStockV2(
      makeInput({ treasuryStock: { shares: T, purpose: "temporary_holding" } }),
    );
    expect(r.netIncomePerShare).toBe(70_000);
    expect(r.finalPerShareValue).toBe(71_739);
    expect(r.netAssetPerShare).toBe(74_347); // self-ref ④
    expect(r.treasuryStockApplied?.purpose).toBe("temporary_holding");
    expect(r.treasuryStockApplied?.effectiveTotalShares).toBe(30_000);
  });

  it("C-04 소각·감자 일반 → ④75,000 ⑥72,000", () => {
    const r = evaluateUnlistedStockV2(
      makeInput({ treasuryStock: { shares: T, purpose: "cancellation" } }),
    );
    expect(r.netAssetPerShare).toBe(75_000); // A/(N−t) = 1,800,000,000/24,000
    expect(r.netIncomePerShare).toBe(70_000);
    expect(r.finalPerShareValue).toBe(72_000);
    expect(r.treasuryStockApplied?.effectiveTotalShares).toBe(24_000);
  });

  it("C-05 일시보유 80% 하한 (p=0) → ⑥57,142", () => {
    const r = evaluateUnlistedStockV2(
      makeInput({ treasuryStock: { shares: T, purpose: "temporary_holding" }, perShareIncome: 0 }),
    );
    expect(r.finalPerShareValue).toBe(57_142);
    expect(r.treasuryStockApplied?.floor80SelfReferentialApplied).toBe(true);
    expect(r.treasuryStockApplied?.floor80NetAssetValue).toBe(71_428);
  });

  it("C-08 소각·감자 순자산단독 (liquidation) → ⑥75,000", () => {
    const r = evaluateUnlistedStockV2(
      makeInput({
        treasuryStock: { shares: T, purpose: "cancellation" },
        netAssetOnlyReason: "liquidation",
      }),
    );
    expect(r.finalPerShareValue).toBe(75_000);
  });

  it("C-10 일시보유 최대주주 → ⑧86,086", () => {
    const r = evaluateUnlistedStockV2(
      makeInput({
        treasuryStock: { shares: T, purpose: "temporary_holding" },
        isMaxShareholder: true,
      }),
    );
    expect(r.finalPerShareValue).toBe(71_739);
    expect(r.premiumPerShare).toBe(86_086); // floor(71,739 × 1.20)
    expect(r.finalPerShareForReporting).toBe(86_086);
  });
});
