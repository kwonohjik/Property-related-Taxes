/**
 * 국외전출세 — anchor 테스트 (PR-4B)
 *
 * 법령: 소득세법 §118의9~§118의16 (2026.4.21. 시행)
 * 세율: §118의11 → §104①11가목2) 20%/25% (누진공제 15,000,000)
 *
 * anchor 기준: 디자인 §9.2 + 계획서 §8.2 자가검증값 (외부 자료 추종 금지)
 * 법령 정합 우선 (feedback_anchor_correction_legal_priority)
 *
 * ET-01~ET-10: 10개 anchor
 */

import { describe, it, expect } from "vitest";
import { calculateExitTax } from "@/lib/tax-engine/stock-transfer/exit-tax";
import type { ExitTaxInput, ExitTaxHolding } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";

// ============================================================
// 공통 헬퍼
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
    yearsResidentLast10: 8,           // 5년 이상 충족
    departureDate: new Date("2026-06-01"),
    isMajorShareholder: true,          // 대주주 충족 (시총 50억)
    holdings: [makeBaseHolding()],
    deferralRequested: false,
    deferralReason: "none",
    foreignTaxExclusionReason: "none",
    hasFiledHoldingsReport: true,
    ...overrides,
  };
}

// ============================================================
// ET-anchor-01: 기본 즉시 납부 케이스 (상장 대주주)
//
// 자가검증 (디자인 §9.2, 계획서 §8.2):
//   양도차익 = 100,000 × (50,000 − 20,000) = 3,000,000,000
//   기본공제 = 2,500,000
//   과세표준 = 2,997,500,000
//   §118의11 → §104①11가목2): 3억 초과 25%, 누진공제 15,000,000
//   산출세액 = floor(2,997,500,000 × 0.25) − 15,000,000
//            = 749,375,000 − 15,000,000 = 734,375,000
//   지방소득세 = floor10(734,375,000 × 0.1) = 73,437,500
// ============================================================

describe("ET-anchor-01: 기본 즉시 납부 (상장 대주주)", () => {
  const result = calculateExitTax(makeBaseInput());

  it("과세 분류 = exit_tax", () => {
    expect(result.taxCategory).toBe("exit_tax");
    expect(result.isLiable).toBe(true);
  });

  it("양도차익 = 3,000,000,000", () => {
    expect(result.totalTransferGain).toBe(3_000_000_000);
  });

  it("기본공제 = 2,500,000", () => {
    expect(result.basicDeduction).toBe(2_500_000);
  });

  it("과세표준 = 2,997,500,000", () => {
    expect(result.taxBase).toBe(2_997_500_000);
  });

  it("산출세액 = 734,375,000", () => {
    // floor(2,997,500,000 × 0.25) − 15,000,000
    // = 749,375,000 − 15,000,000 = 734,375,000
    expect(result.incomeTax).toBe(734_375_000);
  });

  it("지방소득세 = 73,437,500 (10원 미만 절사)", () => {
    expect(result.localIncomeTax).toBe(73_437_500);
  });

  it("납부유예 없음 (deferredTaxAmount=0)", () => {
    expect(result.deferralYears).toBe(0);
    expect(result.deferredTaxAmount).toBe(0);
  });

  it("거주자 요건·대주주 요건 충족", () => {
    expect(result.residencyEligible).toBe(true);
    expect(result.majorShareholderEligible).toBe(true);
  });

  it("종목별 결과 1건", () => {
    expect(result.holdingDetails).toHaveLength(1);
    expect(result.holdingDetails[0].departureDayValue).toBe(5_000_000_000);
    expect(result.holdingDetails[0].acquisitionCost).toBe(2_000_000_000);
    expect(result.holdingDetails[0].transferGain).toBe(3_000_000_000);
  });
});

// ============================================================
// ET-anchor-02: 거주자 요건 미충족 → 비과세
//   yearsResidentLast10 = 4 (5년 미만)
// ============================================================

describe("ET-anchor-02: 거주자 요건 미충족 → 비과세", () => {
  const result = calculateExitTax(
    makeBaseInput({ yearsResidentLast10: 4 })
  );

  it("과세 분류 = not_liable", () => {
    expect(result.taxCategory).toBe("not_liable");
    expect(result.isLiable).toBe(false);
  });

  it("산출세액 = 0", () => {
    expect(result.incomeTax).toBe(0);
    expect(result.localIncomeTax).toBe(0);
  });

  it("residencyEligible = false", () => {
    expect(result.residencyEligible).toBe(false);
  });
});

// ============================================================
// ET-anchor-03: 대주주 요건 미충족 → 비과세
// ============================================================

describe("ET-anchor-03: 대주주 요건 미충족 → 비과세", () => {
  const result = calculateExitTax(
    makeBaseInput({ isMajorShareholder: false })
  );

  it("과세 분류 = not_liable", () => {
    expect(result.taxCategory).toBe("not_liable");
    expect(result.isLiable).toBe(false);
  });

  it("majorShareholderEligible = false", () => {
    expect(result.majorShareholderEligible).toBe(false);
  });
});

// ============================================================
// ET-anchor-04: 조정공제 §118의12 발동 (실양도가 < 출국일 시가)
//
// ET-anchor-01 기반 + 납부유예 후 실제 양도가 = 40,000원/주
//
// 자가검증 (디자인 §9.2):
//   실제 양도가액 = 100,000 × 40,000 = 4,000,000,000
//   출국일 양도가 = 5,000,000,000
//   실양도차손 = 5,000,000,000 − 4,000,000,000 = 1,000,000,000
//   출국일 양도차익 = 3,000,000,000
//   조정공제 = floor(734,375,000 × 1,000,000,000 / 3,000,000,000)
//            = floor(244,791,666.67) = 244,791,666
//   경정 후 세액 = 734,375,000 − 244,791,666 = 489,583,334
// ============================================================

describe("ET-anchor-04: 조정공제 §118의12 (실양도가 < 출국일 시가)", () => {
  const result = calculateExitTax(
    makeBaseInput({
      actualTransferPricePerShare: 40_000,
    })
  );

  it("조정공제액 = 244,791,666", () => {
    expect(result.adjustmentDeduction).toBe(244_791_666);
  });

  it("경정 후 최종 세액 = 489,583,334", () => {
    expect(result.finalTaxAfterAdjustment).toBe(489_583_334);
  });

  it("산출세액 = 734,375,000 (조정 전 기준 동일)", () => {
    expect(result.incomeTax).toBe(734_375_000);
  });
});

// ============================================================
// ET-anchor-05: 외국납부세액공제 §118의13 한도 내 (배제 사유 없음)
//
// ET-anchor-04 기반 + foreignTaxPaid = 50,000,000
//   조정공제 = 244,791,666
//   공제한도 = 734,375,000 − 244,791,666 = 489,583,334
//   외국납부세액 50,000,000 < 한도 → 전액 공제
// ============================================================

describe("ET-anchor-05: 외국납부세액공제 한도 내", () => {
  const result = calculateExitTax(
    makeBaseInput({
      actualTransferPricePerShare: 40_000,
      foreignTaxPaid: 50_000_000,
      foreignTaxExclusionReason: "none",
    })
  );

  it("외국납부세액공제 = 50,000,000", () => {
    expect(result.foreignTaxCreditApplied).toBe(50_000_000);
  });

  it("경정 후 세액 = 734,375,000 − 244,791,666 − 50,000,000 = 439,583,334", () => {
    expect(result.finalTaxAfterAdjustment).toBe(439_583_334);
  });
});

// ============================================================
// ET-anchor-06: 외국납부세액공제 한도 초과
//
// ET-anchor-04 기반 + foreignTaxPaid = 600,000,000 (한도 초과)
//   공제한도 = 489,583,334
//   적용 공제 = min(600,000,000, 489,583,334) = 489,583,334
// ============================================================

describe("ET-anchor-06: 외국납부세액공제 한도 초과", () => {
  const result = calculateExitTax(
    makeBaseInput({
      actualTransferPricePerShare: 40_000,
      foreignTaxPaid: 600_000_000,
      foreignTaxExclusionReason: "none",
    })
  );

  it("외국납부세액공제 = 공제한도 = 489,583,334", () => {
    expect(result.foreignTaxCreditApplied).toBe(489_583_334);
  });

  it("경정 후 세액 = 0", () => {
    expect(result.finalTaxAfterAdjustment).toBe(0);
  });
});

// ============================================================
// ET-anchor-07: §118의13②1호 배제 (credit_allowed) → 공제 0
// ============================================================

describe("ET-anchor-07: §118의13② 1호 배제 → 외국납부세액공제 0", () => {
  const result = calculateExitTax(
    makeBaseInput({
      actualTransferPricePerShare: 40_000,
      foreignTaxPaid: 50_000_000,
      foreignTaxExclusionReason: "credit_allowed",
    })
  );

  it("외국납부세액공제 = 0 (배제 적용)", () => {
    expect(result.foreignTaxCreditApplied).toBe(0);
  });

  it("warnings에 배제 사유 메시지 포함", () => {
    const hasMsg = result.warnings.some((w) => w.includes("§118의13②1호"));
    expect(hasMsg).toBe(true);
  });
});

// ============================================================
// ET-anchor-08: 납부유예 토글 ON (5년)
// ============================================================

describe("ET-anchor-08: 납부유예 5년 신청", () => {
  const result = calculateExitTax(
    makeBaseInput({
      deferralRequested: true,
      deferralReason: "none",  // Zod에서 차단하지만 엔진 레벨에서 "none" → 5년 처리
    })
  );

  // deferralReason="none"이면 기본 5년 처리 (Zod에서 차단하므로 엔진은 방어)
  it("유예 세액 = 산출세액 전액", () => {
    // deferralRequested=true 이면 deferredTaxAmount = incomeTax
    expect(result.deferredTaxAmount).toBe(result.incomeTax);
  });
});

describe("ET-anchor-08b: 납부유예 10년 (study_abroad)", () => {
  const result = calculateExitTax(
    makeBaseInput({
      deferralRequested: true,
      deferralReason: "study_abroad",
    })
  );

  it("유예 연수 = 10년", () => {
    expect(result.deferralYears).toBe(10);
  });

  it("유예 세액 = 734,375,000", () => {
    expect(result.deferredTaxAmount).toBe(734_375_000);
  });

  it("납부유예 이자상당액 안내 메시지 있음", () => {
    expect(result.deferralInterestNote).toContain("이자상당액");
  });
});

// ============================================================
// ET-anchor-09: 과세표준 3억 경계 (20% → 25% 전환)
//
// 과세표준 = 300,000,000 정확
//   § 104①11가목2) 20%: tax = floor(300,000,000 × 0.20) − 0 = 60,000,000
// 과세표준 = 300,000,001 (경계 초과)
//   § 104①11가목2) 25%: tax = floor(300,000,001 × 0.25) − 15,000,000 = 75,000,000 − 15,000,000 = 60,000,000
// 이 두 결과가 연속적임을 검증 (경계 점프 없음)
// ============================================================

describe("ET-anchor-09: 과세표준 3억 경계", () => {
  // 과세표준 = 300,000,000 → 20% 구간
  // totalGain = 302,500,000 (기본공제 2,500,000 차감 후 300,000,000)
  const holdingAt300M: ExitTaxHolding = {
    ...makeBaseHolding(),
    shareCount: 1,
    departureDayMarketPrice: 322_500_000,  // 1주 출국일 시가
    perShareAcquisitionPrice: 20_000_000,   // 1주 취득가
  };

  const result300M = calculateExitTax(
    makeBaseInput({ holdings: [holdingAt300M] })
  );

  it("과세표준 300,000,000 → 세율 20% (누진공제 0)", () => {
    // totalGain = 322,500,000 − 20,000,000 = 302,500,000
    // basicDeduction = 2,500,000
    // taxBase = 300,000,000
    expect(result300M.taxBase).toBe(300_000_000);
    // incomeTax = floor(300,000,000 × 0.20) − 0 = 60,000,000
    expect(result300M.incomeTax).toBe(60_000_000);
  });

  // 과세표준 = 300,000,001 → 25% 구간
  const holdingOver300M: ExitTaxHolding = {
    ...makeBaseHolding(),
    shareCount: 1,
    departureDayMarketPrice: 322_500_001,
    perShareAcquisitionPrice: 20_000_000,
  };
  const resultOver300M = calculateExitTax(
    makeBaseInput({ holdings: [holdingOver300M] })
  );

  it("과세표준 300,000,001 → 세율 25% (누진공제 15,000,000)", () => {
    // taxBase = 300,000,001
    expect(resultOver300M.taxBase).toBe(300_000_001);
    // incomeTax = floor(300,000,001 × 0.25) − 15,000,000
    //           = 75,000,000 − 15,000,000 = 60,000,000
    expect(resultOver300M.incomeTax).toBe(60_000_000);
  });
});

// ============================================================
// ET-anchor-10: 기본공제 250만원 적용 확인
//   양도차익 < 250만 → 기본공제 = 양도차익 (과세표준 0)
// ============================================================

describe("ET-anchor-10: 기본공제 250만원 적용", () => {
  // 양도차익 = 100 × (25,010 − 0) = 2,501,000 (250만 < 양도차익)
  const holding: ExitTaxHolding = {
    ...makeBaseHolding(),
    shareCount: 100,
    departureDayMarketPrice: 25_010,
    perShareAcquisitionPrice: 0,
  };
  const result = calculateExitTax(makeBaseInput({ holdings: [holding] }));

  it("양도차익 = 2,501,000", () => {
    expect(result.totalTransferGain).toBe(2_501_000);
  });

  it("기본공제 = 2,500,000 (양도차익 > 250만)", () => {
    expect(result.basicDeduction).toBe(2_500_000);
  });

  it("과세표준 = 1,000", () => {
    expect(result.taxBase).toBe(1_000);
  });

  // 양도차익 = 100 × (24,000) = 2,400,000 (250만 미만)
  const holdingSmall: ExitTaxHolding = {
    ...makeBaseHolding(),
    shareCount: 100,
    departureDayMarketPrice: 24_000,
    perShareAcquisitionPrice: 0,
  };
  const resultSmall = calculateExitTax(makeBaseInput({ holdings: [holdingSmall] }));

  it("양도차익 < 250만 → 기본공제 = 양도차익, 과세표준 = 0", () => {
    expect(resultSmall.totalTransferGain).toBe(2_400_000);
    expect(resultSmall.basicDeduction).toBe(2_400_000);
    expect(resultSmall.taxBase).toBe(0);
    expect(resultSmall.incomeTax).toBe(0);
  });
});

// ============================================================
// ET-anchor-extra: 지방소득세 10원 미만 절사 검증
//
// 산출세액 = 734,375,001원 가정 시
// localIncomeTax = floor10(734,375,001 × 0.1) = floor10(73,437,500.1) = 73,437,500
//
// 실제: ET-anchor-01의 localIncomeTax = 73,437,500 (이미 검증됨)
// 추가: 1원 단위 차이 케이스
// ============================================================

describe("ET-extra: 지방소득세 10원 미만 절사", () => {
  // 과세표준 = 99 → incomeTax = floor(99 × 0.20) = 19
  // localIncomeTax = floor10(19 × 0.1) = floor10(1.9) = 0
  const holdingMicro: ExitTaxHolding = {
    ...makeBaseHolding(),
    shareCount: 1,
    departureDayMarketPrice: 2_500_099,  // gain = 2,500,099
    perShareAcquisitionPrice: 0,
  };
  // taxBase = 2,500,099 − 2,500,000 = 99
  const result = calculateExitTax(makeBaseInput({ holdings: [holdingMicro] }));

  it("과세표준 = 99", () => {
    expect(result.taxBase).toBe(99);
  });

  it("산출세액 = floor(99 × 0.20) = 19", () => {
    expect(result.incomeTax).toBe(19);
  });

  it("지방소득세 = floor10(1.9) = 0 (10원 미만 절사)", () => {
    expect(result.localIncomeTax).toBe(0);
  });
});

// ============================================================
// ET-extra-2: 다종목 보유 출국 — 합산 과세표준
// ============================================================

describe("ET-extra-2: 다종목 보유 (상장 + 비상장)", () => {
  const holding1: ExitTaxHolding = {
    id: "h1",
    stockName: "코스피종목",
    marketType: "kospi",
    shareCount: 10_000,
    acquisitionDate: new Date("2018-01-01"),
    perShareAcquisitionPrice: 10_000,
    departureDayValuationMode: "market_price",
    departureDayMarketPrice: 30_000,
  };
  const holding2: ExitTaxHolding = {
    id: "h2",
    stockName: "비상장종목",
    marketType: "unlisted",
    shareCount: 5_000,
    acquisitionDate: new Date("2019-06-01"),
    perShareAcquisitionPrice: 5_000,
    departureDayValuationMode: "unlisted_std",
    unlistedStdPricePerShare: 20_000,
  };

  const result = calculateExitTax(
    makeBaseInput({ holdings: [holding1, holding2] })
  );

  it("종목1 양도차익 = 200,000,000", () => {
    // 10,000 × (30,000 − 10,000) = 200,000,000
    expect(result.holdingDetails[0].transferGain).toBe(200_000_000);
  });

  it("종목2 양도차익 = 75,000,000", () => {
    // 5,000 × (20,000 − 5,000) = 75,000,000
    expect(result.holdingDetails[1].transferGain).toBe(75_000_000);
  });

  it("합산 양도차익 = 275,000,000", () => {
    expect(result.totalTransferGain).toBe(275_000_000);
  });

  it("과세표준 = 272,500,000 (기본공제 250만 차감)", () => {
    expect(result.taxBase).toBe(272_500_000);
  });

  it("산출세액 = floor(272,500,000 × 0.20) = 54,500,000", () => {
    // 272,500,000 < 3억 → 20% 구간
    expect(result.incomeTax).toBe(54_500_000);
  });

  it("holdingDetails 2건", () => {
    expect(result.holdingDetails).toHaveLength(2);
  });
});
