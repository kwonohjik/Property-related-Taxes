/**
 * Phase 3 anchor — 사례 5·6 net-asset-calc + goodwill
 *
 * 검증 대상:
 *   - net-asset-calc.ts: 자산총액·부채총액·순자산가액 산정 (§55① + §17의2)
 *   - goodwill.ts: 영업권 평가 (§59② + §55③ 자동 배제)
 *
 * anchor 매트릭스 (계획서 §6 + 디자인 §4):
 *   U-12: 사례 6 영업권 포함 전 순자산가액 = 489,351,700원
 *   U-13: 사례 6 영업권 = 0원 (초과이익 음수)
 *   U-15: 사례 6 1주당 순자산가치 = 9,787원
 *   U-19: 사례 5 영업권 = 31,747,839원 (PDF 표 3.7908 사용 시 31,747,950, 110원 차)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 * Design: docs/02-design/features/inheritance-unlisted-stock-valuation.engine.design.md §4
 */

import { describe, it, expect } from "vitest";
import {
  calcNetAssetTotal,
  calcNetAssetPerShare,
} from "@/lib/tax-engine/property-valuation/net-asset-calc";
import { calcGoodwill } from "@/lib/tax-engine/property-valuation/goodwill";
import type { UnlistedNetAssetCalculation } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

// ============================================================
// 사례 6 — 종합평가 (PDF p1541~1548)
// ============================================================

describe("[U-12·U-13·U-15] 사례 6 — 종합평가 net-asset + goodwill", () => {
  // PDF 사례 6 별지 부표3 2~3쪽 (p1546~1547)
  const case6NetAsset: UnlistedNetAssetCalculation = {
    // 자산총액 (가) — ① + ② − ⑥
    bsTotalAssets: 2_476_889_520,         // ① 재무상태표상 자산가액
    assetValuationDelta: 91_548_350,      // ② 평가차액 (제2쪽 4.순자산가액 "가"의 ②)
    corpTaxReservedAmount: 0,             // ③
    paidInCapitalIncrease: 0,             // ④
    otherEarnedRights: 0,                 // ⑤
    prepaidExpenses: 65_400_500,          // ⑥ 선급비용 등 (차감)
    preGiftRetainedEarnings: 0,           // ⑦

    // 부채총액 (나) — ⑨ + ⑩ + ⑫ + ⑭ − ⑰
    bsTotalLiabilities: 1_833_780_000,    // ⑨ 재무상태표상 부채액
    corporateTaxPayable: 32_627_890,      // ⑩ 법인세
    farmingSurtax: 0,                     // ⑪
    localIncomeTax: 3_262_780,            // ⑫ 지방소득세
    dividendPayable: 0,                   // ⑬
    retirementProvision: 445_785_000,     // ⑭ 퇴직급여추계액
    otherProvision: 0,                    // ⑮
    reserveExcluded: 0,                   // ⑯
    allowanceExcluded: 301_770_000,       // ⑰ 제충당금 (부채 차감)
    deferredTaxAdjustment: 0,             // ⑱
  };

  it("[U-12] 영업권 포함 전 순자산가액 = 489,351,700원", () => {
    const result = calcNetAssetTotal(case6NetAsset);

    // 자산총액 = 2,476,889,520 + 91,548,350 + 0 + 0 + 0 − 65,400,500 − 0 = 2,503,037,370
    expect(result.totalAssets).toBe(2_503_037_370);

    // 부채총액 = 1,833,780,000 + 32,627,890 + 0 + 3,262,780 + 0 + 445,785,000 + 0 − 0 − 301,770,000 + 0
    //         = 2,013,685,670
    expect(result.totalLiabilities).toBe(2_013_685_670);

    // 다. 영업권 포함 전 순자산가액 = 489,351,700
    expect(result.netAssetBeforeGoodwill).toBe(489_351_700);
    expect(result.zeroFloorApplied).toBe(false);
  });

  it("[U-13] 영업권 = 0원 (초과이익 음수 → 0)", () => {
    const result = calcGoodwill({
      weightedAvg3y: 58_341_511,    // 가. 3년 가중평균 순손익액
      selfCapital: 489_351_700,     // 다. 자기자본
      rate: 0.10,                   // 라. §19① 10%
    });

    // 나 = 58,341,511 × 50% = floor(29,170,755.5) = 29,170,755
    expect(result.weightedAvgHalf).toBe(29_170_755);

    // 마 = 489,351,700 × 10% = floor(48,935,170) = 48,935,170
    expect(result.selfCapitalRate).toBe(48_935_170);

    // 초과이익 = max(29,170,755 − 48,935,170, 0) = max(△19,764,415, 0) = 0
    expect(result.annualExcessProfit).toBe(0);

    // 사 = 0
    expect(result.goodwillCalc).toBe(0);

    // 자 = 0
    expect(result.goodwillFinal).toBe(0);
    expect(result.excludedByLaw).toBeUndefined(); // §55③ 사유가 아닌 산식상 0
  });

  it("[U-15] 1주당 순자산가치 ④ = 9,787원 (영업권 0 포함)", () => {
    // 영업권 0이므로 영업권 포함 후 순자산가액 = 영업권 포함 전 순자산가액 = 489,351,700
    const netAssetTotal = 489_351_700 + 0; // ③
    const totalShares = 50_000;
    expect(calcNetAssetPerShare(netAssetTotal, totalShares)).toBe(9_787);
    // 489,351,700 / 50,000 = 9,787.034 → floor 9,787
  });
});

// ============================================================
// 사례 5 — 유상증자·최대주주·중소기업 (PDF p1538~1539)
// ============================================================

describe("[U-19] 사례 5 — 영업권 평가", () => {
  it("[U-19] 영업권 = {28,750,000×50% − 60,000,000×10%} × ∑(1/1.1^n) = 31,747,839원", () => {
    // PDF 사례 5 자료:
    //   가중평균 = 28,750,000 (유상증자 가산 후)
    //   자기자본 = 60,000,000
    const result = calcGoodwill({
      weightedAvg3y: 28_750_000,
      selfCapital: 60_000_000,
      rate: 0.10,
    });

    // 나 = 28,750,000 × 50% = 14,375,000
    expect(result.weightedAvgHalf).toBe(14_375_000);

    // 마 = 60,000,000 × 10% = 6,000,000
    expect(result.selfCapitalRate).toBe(6_000_000);

    // 초과이익 = 14,375,000 − 6,000,000 = 8,375,000
    expect(result.annualExcessProfit).toBe(8_375_000);

    // 사 = 8,375,000 × ∑(1/1.1^n, n=1..5) = 8,375,000 × 3.79078676... = 31,747,839
    //   ★ PDF 표 3.7908 사용 시 31,747,950 (110원 차이 — 5년 연금현가표 4자리 반올림)
    //   본 엔진은 정확한 ∑ 사용 → 별지 양식 본문 산식 정합
    expect(result.goodwillCalc).toBe(31_747_839);

    // 자 = 31,747,839 (무체재산권 차감 없음, §55③ 미배제)
    expect(result.goodwillFinal).toBe(31_747_839);
    expect(result.excludedByLaw).toBeUndefined();
  });

  it("[U-19b] PDF 표 3.7908 정합 검증 — 8,375,000 × 3.7908 = 31,747,950 (참고)", () => {
    // 실무 보조 — 5년 연금현가표 4자리 반올림 사용 시 PDF 정합
    // (Math 정밀도 한계로 표 값과 정확 ∑ 110원 차이 — anchor는 정확 ∑ 채택)
    const tableValue = 3.7908;
    const annualExcess = 8_375_000;
    const pdfStyleGoodwill = Math.floor(annualExcess * tableValue);
    expect(pdfStyleGoodwill).toBe(31_747_950); // PDF 표기 정합
  });
});

// ============================================================
// §55③ 자동 배제 사유 검증
// ============================================================

describe("[D-13] §55③ 영업권 자동 배제 4사유", () => {
  const baseInput = {
    weightedAvg3y: 100_000_000,
    selfCapital: 50_000_000,
    rate: 0.10,
  };

  it("§55③ 1호 — 청산 시 영업권 0", () => {
    const result = calcGoodwill({ ...baseInput, netAssetOnlyReason: "liquidation" });
    expect(result.goodwillFinal).toBe(0);
    expect(result.excludedByLaw).toBe("liquidation");
  });

  it("§55③ 1호 — 부동산 80% 시 영업권 0", () => {
    const result = calcGoodwill({ ...baseInput, netAssetOnlyReason: "real_estate_80" });
    expect(result.goodwillFinal).toBe(0);
    expect(result.excludedByLaw).toBe("real_estate_80");
  });

  it("§55③ 2호 — 사업개시 3년 미만 시 영업권 0 (단서 미적용)", () => {
    const result = calcGoodwill({ ...baseInput, netAssetOnlyReason: "lt3y" });
    expect(result.goodwillFinal).toBe(0);
    expect(result.excludedByLaw).toBe("lt3y");
  });

  it("§55③ 3호 — 3년 계속 결손 시 영업권 0", () => {
    const result = calcGoodwill({ ...baseInput, isContinuousLossLastThreeYears: true });
    expect(result.goodwillFinal).toBe(0);
    expect(result.excludedByLaw).toBe("continuous_loss_3y");
  });

  it("§55③ 사유 없음 — 정상 산식 적용 (가>마 양수일 때)", () => {
    // 가중평균 100M × 50% = 50M / 자기자본 50M × 10% = 5M
    // 초과이익 = 45M / 사 = 45M × 3.79078676... = 170,585,404 (정확 ∑)
    const result = calcGoodwill(baseInput);
    expect(result.annualExcessProfit).toBe(45_000_000);
    expect(result.goodwillCalc).toBeGreaterThan(0);
    expect(result.excludedByLaw).toBeUndefined();
  });
});

// ============================================================
// §55① 후단 — 순자산 0 이하 시 0 처리
// ============================================================

describe("[U-8 회귀] §55① 후단 — 부채 > 자산 시 순자산 0", () => {
  it("부채총액 > 자산총액 시 net-asset = 0", () => {
    const negativeInput: UnlistedNetAssetCalculation = {
      bsTotalAssets: 100_000_000,
      assetValuationDelta: 0,
      corpTaxReservedAmount: 0,
      paidInCapitalIncrease: 0,
      otherEarnedRights: 0,
      prepaidExpenses: 0,
      preGiftRetainedEarnings: 0,
      bsTotalLiabilities: 200_000_000, // 자산 < 부채
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
    const result = calcNetAssetTotal(negativeInput);
    expect(result.totalAssets).toBe(100_000_000);
    expect(result.totalLiabilities).toBe(200_000_000);
    expect(result.netAssetBeforeGoodwill).toBe(0); // §55① 후단
    expect(result.zeroFloorApplied).toBe(true);
  });
});
