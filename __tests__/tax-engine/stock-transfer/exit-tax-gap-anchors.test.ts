/**
 * 국외전출세 — 갭 보강 anchor (ET-GS-08b, ET-GS-09, ET-GS-11, ET-GS-12, ET-GS-13)
 *
 * exit-tax.test.ts 800줄 정책으로 분리.
 *
 * 법령: 소득세법 §118의9~§118의16 (2026.4.21. 시행)
 * 세율: §118의11 → §104①11가목2) 20%/25% (누진공제 15,000,000)
 *
 * 커버 대상:
 *   ET-GS-08b: §118의13②2호 step_up 배제 → 외국납부세액공제 0
 *   ET-GS-09:  보유현황 미신고 가산세 §118의15 (2%)
 *   ET-GS-11:  비상장 §99①4 기준시가 (unlisted_std 모드)
 *   ET-GS-12:  상장·비상장 혼합 보유 — 종목별 독립 평가 후 합산
 *   ET-GS-13:  3종목 조합 — 종목별 별도 계산 후 합산
 */

import { describe, it, expect } from "vitest";
import { calculateExitTax } from "@/lib/tax-engine/stock-transfer/exit-tax";
import type { ExitTaxInput, ExitTaxHolding } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";

// ============================================================
// 공통 헬퍼 (exit-tax.test.ts와 동일 패턴 — import 불가로 복제)
// ============================================================

/** 기본 보유 종목 1건 생성 (코스피 상장, 5만원 시가, 2만원 취득가) */
function makeBaseHolding(overrides?: Partial<ExitTaxHolding>): ExitTaxHolding {
  return {
    id: "holding-1",
    stockName: "테스트주식",
    marketType: "kospi",
    shareCount: 100_000,
    acquisitionDate: new Date("2015-01-01"),
    perShareAcquisitionPrice: 20_000,
    departureDayValuationMode: "market_price",
    departureDayMarketPrice: 50_000,
    ...overrides,
  };
}

/** 기본 ExitTaxInput 생성 (ET-anchor-01 기반) */
function makeBaseInput(overrides?: Partial<ExitTaxInput>): ExitTaxInput {
  return {
    marketType: "exit_tax",
    yearsResidentLast10: 8,
    departureDate: new Date("2026-06-01"),
    isMajorShareholder: true,
    holdings: [makeBaseHolding()],
    deferralRequested: false,
    deferralReason: "none",
    foreignTaxExclusionReason: "none",
    hasFiledHoldingsReport: true,
    ...overrides,
  };
}

// ============================================================
// ET-anchor-GS-08b: §118의13②2호 `step_up` 배제 — 외국납부세액공제 0
//
// §118의13②2호: 외국정부가 취득가액을 출국일 시가로 조정하는 경우
// → 외국납부세액공제 배제 (공제 0)
// ET-anchor-07(exit-tax.test.ts)이 1호(credit_allowed) — 본 anchor는 2호(step_up)
//
// 자가검증 (ET-anchor-04 기반):
//   조정공제 = floor(734,375,000 × 1,000,000,000 / 3,000,000,000) = 244,791,666
//   외국납부세액공제: step_up 배제 → 0
//   finalTaxAfterAdjustment = 734,375,000 − 244,791,666 − 0 = 489,583,334
// ============================================================
describe("ET-anchor-GS-08b: §118의13②2호 step_up → 외국납부세액공제 배제", () => {
  const result = calculateExitTax(
    makeBaseInput({
      actualTransferPricePerShare: 40_000,
      foreignTaxPaid: 50_000_000,
      foreignTaxExclusionReason: "step_up",
    })
  );

  it("외국납부세액공제 = 0 (step_up 배제)", () => {
    expect(result.foreignTaxCreditApplied).toBe(0);
  });

  it("조정공제는 정상 발동 (실양도가 < 출국일 시가)", () => {
    expect(result.adjustmentDeduction).toBe(244_791_666);
  });

  it("경정 후 세액 = 734,375,000 − 244,791,666 = 489,583,334", () => {
    expect(result.finalTaxAfterAdjustment).toBe(489_583_334);
  });

  it("warnings에 §118의13②2호 배제 메시지 포함", () => {
    const hasMsg = result.warnings.some((w) => w.includes("§118의13②2호"));
    expect(hasMsg).toBe(true);
  });

  it("appliedRules에 §118의13②(배제) 포함", () => {
    const hasRule = result.appliedRules.some((r) => r.includes("§118의13②"));
    expect(hasRule).toBe(true);
  });
});

// ============================================================
// ET-anchor-GS-09: 보유현황 미신고 가산세 §118의15 — 2%
//
// hasFiledHoldingsReport=false + totalFaceValue 입력 시
// holdingsReportPenalty = floor(totalFaceValue × 0.02)
//
// 자가검증:
//   totalFaceValue = 500,000,000 (5억원 액면금액 합계)
//   holdingsReportPenalty = floor(500,000,000 × 0.02) = 10,000,000
// ============================================================
describe("ET-anchor-GS-09: 보유현황 미신고 가산세 §118의15 (2%)", () => {
  const result = calculateExitTax(
    makeBaseInput({
      hasFiledHoldingsReport: false,
      totalFaceValue: 500_000_000,
    })
  );

  it("납세의무 충족 (과세 정상 계산)", () => {
    expect(result.isLiable).toBe(true);
    // ET-anchor-01과 동일 종목 구성 → 산출세액 동일
    expect(result.incomeTax).toBe(734_375_000);
  });

  it("보유현황 가산세 = floor(500,000,000 × 0.02) = 10,000,000", () => {
    expect(result.holdingsReportPenalty).toBe(10_000_000);
  });

  it("warnings에 보유현황 미신고 메시지 포함", () => {
    const hasMsg = result.warnings.some((w) => w.includes("보유현황 미신고"));
    expect(hasMsg).toBe(true);
  });

  it("appliedRules에 §118의15 포함", () => {
    const hasRule = result.appliedRules.some((r) => r.includes("§118의15"));
    expect(hasRule).toBe(true);
  });

  // totalFaceValue 미입력 시 — 가산세 계산 불가, warning만 발행
  const resultNoFaceValue = calculateExitTax(
    makeBaseInput({
      hasFiledHoldingsReport: false,
      totalFaceValue: undefined,
    })
  );

  it("totalFaceValue 미입력 시 holdingsReportPenalty = undefined", () => {
    expect(resultNoFaceValue.holdingsReportPenalty).toBeUndefined();
  });

  it("totalFaceValue 미입력 시 가산세 미계산 warning 포함", () => {
    const hasMsg = resultNoFaceValue.warnings.some(
      (w) => w.includes("액면금액") || w.includes("totalFaceValue")
    );
    expect(hasMsg).toBe(true);
  });
});

// ============================================================
// ET-anchor-GS-11: 비상장 §99①4 기준시가 모드 (unlisted_std)
//
// departureDayValuationMode="unlisted_std" + unlistedStdPricePerShare
// §178의9②2호나목: 매매사례 없음 → §99①4 비상장 기준시가 적용
//
// 자가검증:
//   종목: 비상장, 주수 10,000, 1주당 §99①4 기준시가 = 15,000원
//   출국일 가치 = 10,000 × 15,000 = 150,000,000
//   취득가액 = 10,000 × 5,000 = 50,000,000
//   양도차익 = 100,000,000
//   기본공제 = 2,500,000
//   과세표준 = 97,500,000
//   §104①11가목2) 20%: taxBase < 3억
//   산출세액 = floor(97,500,000 × 0.20) = 19,500,000
// ============================================================
describe("ET-anchor-GS-11: 비상장 §99①4 기준시가 적용 (unlisted_std 모드)", () => {
  const holdingUnlistedStd: ExitTaxHolding = {
    id: "h-unlisted-std",
    stockName: "비상장기업",
    marketType: "unlisted",
    shareCount: 10_000,
    acquisitionDate: new Date("2020-01-01"),
    perShareAcquisitionPrice: 5_000,
    departureDayValuationMode: "unlisted_std",
    unlistedStdPricePerShare: 15_000,
  };

  const result = calculateExitTax(
    makeBaseInput({ holdings: [holdingUnlistedStd] })
  );

  it("출국일 가치 = 10,000 × 15,000 = 150,000,000", () => {
    expect(result.holdingDetails[0].departureDayValue).toBe(150_000_000);
    expect(result.holdingDetails[0].departureDayValuePerShare).toBe(15_000);
  });

  it("취득원가 = 10,000 × 5,000 = 50,000,000", () => {
    expect(result.holdingDetails[0].acquisitionCost).toBe(50_000_000);
  });

  it("양도차익 = 100,000,000", () => {
    expect(result.holdingDetails[0].transferGain).toBe(100_000_000);
    expect(result.totalTransferGain).toBe(100_000_000);
  });

  it("과세표준 = 97,500,000 (기본공제 250만 차감)", () => {
    expect(result.taxBase).toBe(97_500_000);
  });

  it("산출세액 = floor(97,500,000 × 0.20) = 19,500,000 (3억 미만 → 20%)", () => {
    expect(result.incomeTax).toBe(19_500_000);
  });

  it("valuationMode = unlisted_std (결과 echo)", () => {
    expect(result.holdingDetails[0].valuationMode).toBe("unlisted_std");
  });
});

// ============================================================
// ET-anchor-GS-12: 상장·비상장 혼합 보유 — 종목별 독립 평가 후 합산
//
// §178의9: 종목 성격에 따라 각각 시가 산정 후 합산
//   종목A (코스피, market_price): 100,000주 × 50,000 − 100,000 × 20,000 = 3,000,000,000
//   종목B (비상장, unlisted_std): 5,000주 × 25,000 − 5,000 × 8,000 = 85,000,000
//   합산 양도차익 = 3,085,000,000
//   기본공제 = 2,500,000
//   과세표준 = 3,082,500,000
//   §104①11가목2) 25%: taxBase > 3억
//   산출세액 = floor(3,082,500,000 × 0.25) − 15,000,000 = 755,625,000
// ============================================================
describe("ET-anchor-GS-12: 상장·비상장 혼합 보유 — 종목별 독립 평가 + 합산", () => {
  const holdingListed: ExitTaxHolding = {
    id: "h-listed",
    stockName: "코스피우량주",
    marketType: "kospi",
    shareCount: 100_000,
    acquisitionDate: new Date("2015-01-01"),
    perShareAcquisitionPrice: 20_000,
    departureDayValuationMode: "market_price",
    departureDayMarketPrice: 50_000,
  };

  const holdingUnlisted: ExitTaxHolding = {
    id: "h-unlisted",
    stockName: "비상장벤처",
    marketType: "unlisted",
    shareCount: 5_000,
    acquisitionDate: new Date("2018-06-01"),
    perShareAcquisitionPrice: 8_000,
    departureDayValuationMode: "unlisted_std",
    unlistedStdPricePerShare: 25_000,
  };

  const result = calculateExitTax(
    makeBaseInput({ holdings: [holdingListed, holdingUnlisted] })
  );

  it("상장 종목 출국일 가치 = 100,000 × 50,000 = 5,000,000,000", () => {
    expect(result.holdingDetails[0].departureDayValue).toBe(5_000_000_000);
  });

  it("상장 종목 양도차익 = 3,000,000,000", () => {
    expect(result.holdingDetails[0].transferGain).toBe(3_000_000_000);
  });

  it("비상장 종목 출국일 가치 = 5,000 × 25,000 = 125,000,000", () => {
    expect(result.holdingDetails[1].departureDayValue).toBe(125_000_000);
  });

  it("비상장 종목 양도차익 = 5,000 × (25,000 − 8,000) = 85,000,000", () => {
    expect(result.holdingDetails[1].transferGain).toBe(85_000_000);
  });

  it("합산 양도차익 = 3,085,000,000", () => {
    expect(result.totalTransferGain).toBe(3_085_000_000);
  });

  it("과세표준 = 3,082,500,000", () => {
    expect(result.taxBase).toBe(3_082_500_000);
  });

  it("산출세액 = floor(3,082,500,000 × 0.25) − 15,000,000 = 755,625,000", () => {
    const expected = Math.floor(3_082_500_000 * 0.25) - 15_000_000;
    expect(result.incomeTax).toBe(expected);
    expect(result.incomeTax).toBe(755_625_000);
  });

  it("holdingDetails 2건 — 상장·비상장 각각 독립 계산", () => {
    expect(result.holdingDetails).toHaveLength(2);
    expect(result.holdingDetails[0].valuationMode).toBe("market_price");
    expect(result.holdingDetails[1].valuationMode).toBe("unlisted_std");
  });
});

// ============================================================
// ET-anchor-GS-13: 종목별 별도 계산 후 합산 — 3종목 조합
//
// 3종목 케이스: 코스피 + 코스닥 + 비상장 매매사례가액(unlisted_sample)
//   종목A (코스피, market_price): 50,000주 × 40,000 − 50,000 × 15,000 = 1,250,000,000
//   종목B (코스닥, market_price): 20,000주 × 30,000 − 20,000 × 10,000 = 400,000,000
//   종목C (비상장, unlisted_sample): 3,000주 × 50,000 − 3,000 × 20,000 = 90,000,000
//   합산 양도차익 = 1,740,000,000
//   기본공제 = 2,500,000
//   과세표준 = 1,737,500,000
//   §104①11가목2) 25%: taxBase > 3억
//   산출세액 = floor(1,737,500,000 × 0.25) − 15,000,000 = 419,375,000
//   지방소득세 = floor10(419,375,000 × 0.1) = 41,937,500
// ============================================================
describe("ET-anchor-GS-13: 3종목 조합 — 종목별 별도 계산 후 합산", () => {
  const holdingA: ExitTaxHolding = {
    id: "h-A",
    stockName: "코스피종목A",
    marketType: "kospi",
    shareCount: 50_000,
    acquisitionDate: new Date("2016-01-01"),
    perShareAcquisitionPrice: 15_000,
    departureDayValuationMode: "market_price",
    departureDayMarketPrice: 40_000,
  };

  const holdingB: ExitTaxHolding = {
    id: "h-B",
    stockName: "코스닥종목B",
    marketType: "kosdaq",
    shareCount: 20_000,
    acquisitionDate: new Date("2017-03-01"),
    perShareAcquisitionPrice: 10_000,
    departureDayValuationMode: "market_price",
    departureDayMarketPrice: 30_000,
  };

  const holdingC: ExitTaxHolding = {
    id: "h-C",
    stockName: "비상장C",
    marketType: "unlisted",
    shareCount: 3_000,
    acquisitionDate: new Date("2019-06-01"),
    perShareAcquisitionPrice: 20_000,
    departureDayValuationMode: "unlisted_sample",
    unlistedSamplePrice: 50_000,
  };

  const result = calculateExitTax(
    makeBaseInput({ holdings: [holdingA, holdingB, holdingC] })
  );

  it("종목A 양도차익 = 50,000 × (40,000 − 15,000) = 1,250,000,000", () => {
    expect(result.holdingDetails[0].transferGain).toBe(1_250_000_000);
  });

  it("종목B 양도차익 = 20,000 × (30,000 − 10,000) = 400,000,000", () => {
    expect(result.holdingDetails[1].transferGain).toBe(400_000_000);
  });

  it("종목C 양도차익 = 90,000,000 (비상장 매매사례가액 §178의9②2호가목)", () => {
    // 3,000 × (50,000 − 20,000) = 90,000,000
    expect(result.holdingDetails[2].transferGain).toBe(90_000_000);
    expect(result.holdingDetails[2].valuationMode).toBe("unlisted_sample");
  });

  it("합산 양도차익 = 1,740,000,000", () => {
    expect(result.totalTransferGain).toBe(1_740_000_000);
  });

  it("과세표준 = 1,737,500,000", () => {
    expect(result.taxBase).toBe(1_737_500_000);
  });

  it("산출세액 = floor(1,737,500,000 × 0.25) − 15,000,000 = 419,375,000", () => {
    const expected = Math.floor(1_737_500_000 * 0.25) - 15_000_000;
    expect(result.incomeTax).toBe(expected);
    expect(result.incomeTax).toBe(419_375_000);
  });

  it("holdingDetails 3건 — 종목별 독립 계산 구조 확인", () => {
    expect(result.holdingDetails).toHaveLength(3);
  });

  it("지방소득세 = floor10(419,375,000 × 0.1) = 41,937,500", () => {
    expect(result.localIncomeTax).toBe(41_937_500);
  });
});
