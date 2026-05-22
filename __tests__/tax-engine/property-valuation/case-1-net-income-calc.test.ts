/**
 * Phase 2 통합 anchor — 사례 1·2·3·4 1주당 순손익가치 재현
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 * Design: docs/02-design/features/inheritance-unlisted-stock-valuation.engine.design.md §4 anchor 매트릭스
 *
 * 검증 대상 모듈:
 *   - fiscal-year-net-income.ts (다. 순손익액)
 *   - converted-shares.ts (바. 환산주식수)
 *   - weighted-avg.ts (아·자·차 가중평균·환원율·1주당 순손익가치)
 *   - weighted-avg.ts (⑥-㉠·㉡·⑥ 1주당 평가액)
 */

import { describe, it, expect } from "vitest";
import { calcFiscalYearNetIncome } from "@/lib/tax-engine/property-valuation/fiscal-year-net-income";
import { applyShareConversion } from "@/lib/tax-engine/property-valuation/converted-shares";
import {
  calcWeightedAvg3y,
  calcPerShareNetIncomeValue,
  calcPerShareWeightedValuation,
  calcNetAssetFloor80,
  calcFinalPerShareValue,
} from "@/lib/tax-engine/property-valuation/weighted-avg";
import type { FiscalYearAdjustment } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

// ============================================================
// 사례 1 — 순손익가치 계산 사례 (PDF p1533~1535)
// ============================================================

describe("[U-1~U-6] 사례 1 — 순손익가치 계산", () => {
  // ① 2021년 사업연도 순손익액
  it("[U-1] 2021년 순손익액 = 140,000,000 + 1,000,000 − 21,000,000 = 120,000,000원", () => {
    const fy2021: FiscalYearAdjustment = {
      fiscalYearLabel: "2021",
      fiscalYearEndDate: new Date("2021-12-31"),
      taxableIncome: 140_000_000,
      addRefundInterest: 1_000_000, // ② 국세 과오납 환급금 가산금
      // 차감 (PDF p1534 사례 1 자료 4)):
      subEntertainmentExcess: 6_000_000,   // ⑯ 접대비 한도초과
      subDonationExcess: 3_800_000,        // ⑮ 기부금 한도초과
      subWithholdingPenalty: 500_000,      // ⑬ 원천세 징수불이행 가산세
      subInterestPayment: 3_000_000,       // ⑲ 업무무관 지급이자
      subCorporateTax: 7_000_000,          // ⑧ 법인세 총결정세액
      subAdditionalTaxes: 700_000,         // ⑨ 지방소득세
    };
    const result = calcFiscalYearNetIncome(fy2021);
    expect(result.addTotal).toBe(1_000_000);
    expect(result.subTotal).toBe(21_000_000);
    expect(result.adjustedNetIncome).toBe(120_000_000);
  });

  // ② 환산주식수 — §17의3⑤
  it("[U-2/U-3/U-4] 환산주식수 — 2020년·2019년 모두 180,000주 (단일연도 유증+무증 80,000)", () => {
    // 2020년말 100,000주 × (100,000 + 80,000) / 100,000 = 180,000
    expect(applyShareConversion(100_000, 80_000)).toBe(180_000);
    // 2019년말도 동일 (유상증자·무상증자 모두 2021년 발생 — 환산 비율 동일 적용)
    expect(applyShareConversion(100_000, 80_000)).toBe(180_000);
    // 2021년말 = 평가시점 발행주식수 = 180,000 (자료 그대로)
  });

  // ③ 가중평균 — PDF p1535 ⑤
  it("[U-5] 1주당 가중평균 = (736×3 + 750×2 + 583×1) / 6 = 715원", () => {
    // PDF 사례 1 해설 1535p:
    //   2021: 1주당 (120,000,000 + 12,500,000) / 180,000 = 132,500,000 / 180,000 = 735.5… → PDF 736
    //   2020: (110,000,000 + 25,000,000) / 180,000 = 135,000,000 / 180,000 = 750
    //   2019: (80,000,000 + 25,000,000) / 180,000 = 105,000,000 / 180,000 = 583.3… → PDF 583
    const weighted = calcWeightedAvg3y([736, 750, 583]);
    // (736×3 + 750×2 + 583×1)/6 = (2208 + 1500 + 583)/6 = 4291/6 = 715.166… → floor 715
    expect(weighted).toBe(715);
  });

  // ④ 1주당 순손익가치 — PDF p1535 ⑥
  it("[U-6] 1주당 순손익가치 = 715 / 0.1 = 7,150원", () => {
    const value = calcPerShareNetIncomeValue(715, 0.1);
    expect(value).toBe(7_150);
  });
});

// ============================================================
// 사례 2 — 사업개시 후 3년 이상 (PDF p1536)
// ============================================================

describe("[U-7] 사례 2 — 가중평균 본칙 + 80% 하한 미발동", () => {
  it("[U-7] 1주당 평가액 = (4,840×3 + 5,000×2)/5 = 4,904원, 80% 하한(4,000) 미발동", () => {
    // PDF 자료: 1주당 순손익가치 4,840 / 1주당 순자산가치 5,000
    const niPerShare = 4_840;
    const naPerShare = 5_000;
    const weighted = calcPerShareWeightedValuation(niPerShare, naPerShare, false);
    // (4,840×3 + 5,000×2)/5 = (14,520 + 10,000)/5 = 4,904
    expect(weighted).toBe(4_904);

    const floor80 = calcNetAssetFloor80(naPerShare);
    expect(floor80).toBe(4_000); // 5,000 × 0.8

    const final = calcFinalPerShareValue(weighted, floor80);
    expect(final.finalValue).toBe(4_904);
    expect(final.floorApplied).toBe(false);
  });
});

// ============================================================
// 사례 3 — 순자산가치(△) → 0 처리 (PDF p1537)
// ============================================================
//
// ⚠️ Pre-Do P1-B 환류:
//   PDF 가중평균 280 vs 손계산 200 — PDF 자체 오기 확정
//   본 anchor는 손계산 정합값(1,200원)으로 정정
//   (PDF 표기 1,680원 보존은 별도 anchor U-8b로 처리)
// ============================================================

describe("[U-8] 사례 3 — 순자산 음수 0 처리 (손계산 정합)", () => {
  it("[U-8] 1주당 순손익가치 = 2,000원 (손계산 정합 — PDF 2,800 오기)", () => {
    // PDF 자료 1537p:
    //   2021: 1주당 순손익 550
    //   2020: 1주당 순손익 △120
    //   2019: 1주당 순손익 △210
    // §56① 가중평균 = (550×3 + (−120)×2 + (−210)×1)/6 = 1,200/6 = 200
    const weighted = calcWeightedAvg3y([550, -120, -210]);
    expect(weighted).toBe(200); // 손계산 정합 (PDF 280 오기)

    // 1주당 순손익가치 = 200 / 0.1 = 2,000원
    const niValue = calcPerShareNetIncomeValue(weighted, 0.1);
    expect(niValue).toBe(2_000); // PDF 2,800 오기
  });

  it("[U-8] 1주당 가중평균 = (2,000×3 + 0×2)/5 = 1,200원 (순자산 음수 → 0)", () => {
    // 순자산가치 -300,000,000 / 100,000주 = -3,000 → §55① 후단으로 0
    const netAssetPerShare = 0; // §55① 후단 적용

    const weighted = calcPerShareWeightedValuation(2_000, netAssetPerShare, false);
    // (2,000×3 + 0×2)/5 = 6,000/5 = 1,200
    expect(weighted).toBe(1_200);

    const floor80 = calcNetAssetFloor80(netAssetPerShare);
    expect(floor80).toBe(0);

    const final = calcFinalPerShareValue(weighted, floor80);
    expect(final.finalValue).toBe(1_200);
    expect(final.floorApplied).toBe(false);
  });

  it("[U-8b] PDF 표기 보존 — 가중평균 280 가정 시 1주당 평가액 1,680원", () => {
    // PDF 표기를 그대로 재현하려면 회사 전체 가중평균 = 28,000,000원 입력
    // 즉 1주당 가중평균 = 280, 1주당 순손익가치 = 2,800
    const niValue = calcPerShareNetIncomeValue(280, 0.1);
    expect(niValue).toBe(2_800);

    const weighted = calcPerShareWeightedValuation(2_800, 0, false);
    expect(weighted).toBe(1_680);
  });
});

// ============================================================
// 사례 4 — 양쪽 모두 음수·0 (PDF p1538)
// ============================================================

describe("[U-9] 사례 4 — 양쪽 0 처리", () => {
  it("[U-9] 1주당 가중평균 △758 → 0, 순자산 0 → 1주당 평가액 = 0", () => {
    // PDF 자료 1538p:
    //   2021: △1,200 / 2020: △800 / 2019: 652
    //   가중평균 = (△1,200×3 + △800×2 + 652)/6 = (−3,600−1,600+652)/6 = −4,548/6 = −758
    //   → §56① 후단 0 처리
    const weighted = calcWeightedAvg3y([-1_200, -800, 652]);
    expect(weighted).toBe(0); // 음수 → 0

    // 순자산가치 = 0 (§55① 후단)
    const niValue = calcPerShareNetIncomeValue(weighted, 0.1);
    expect(niValue).toBe(0);

    const weightedFinal = calcPerShareWeightedValuation(niValue, 0, false);
    expect(weightedFinal).toBe(0);

    const final = calcFinalPerShareValue(weightedFinal, 0);
    expect(final.finalValue).toBe(0);
  });
});

// ============================================================
// 부동산과다보유 가중치 반전 (§54① 본문 괄호)
// ============================================================

describe("[D-12] 부동산과다보유법인 가중치 반전 (2·3/5)", () => {
  it("일반 본칙 vs 부동산과다보유 — 동일 입력에서 다른 결과", () => {
    const niPerShare = 10_000;
    const naPerShare = 5_000;

    // 일반: (10,000×3 + 5,000×2)/5 = 40,000/5 = 8,000
    expect(calcPerShareWeightedValuation(niPerShare, naPerShare, false)).toBe(8_000);

    // 부동산과다보유: (10,000×2 + 5,000×3)/5 = 35,000/5 = 7,000
    expect(calcPerShareWeightedValuation(niPerShare, naPerShare, true)).toBe(7_000);
  });
});
