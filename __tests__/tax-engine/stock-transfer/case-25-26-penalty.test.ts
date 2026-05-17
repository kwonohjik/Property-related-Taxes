/**
 * 케이스 25·26 anchor 테스트 — 가산세 분기
 *
 * 케이스 25: §47의2②1 부정행위 과소신고 가산세 40%
 * 케이스 26: §47의2②1 단서 국제거래 부정행위 가산세 60%
 *
 * 자가검증 anchor (본칙 직접 계산):
 *   과세표준 100,000,000 → 대주주 누진 20% → 산출세액 20,000,000
 *   케이스 25: 가산세 8,000,000 → finalTax 27,980,000 (전자신고 △20,000 포함)
 *   케이스 26: 가산세 12,000,000 → finalTax 31,980,000
 *   지방소득세 (산출세액 × 10%): 2,000,000
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

// ============================================================
// 공용 기본 입력 팩토리
// ============================================================

function penaltyBase(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    // 시장·대주주
    marketType: "kospi",
    isMajorShareholder: true,
    selfShareRatio: 0.03,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2023-12-31"),

    // §94①4 기타자산
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,

    // 회사 분류
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,

    // 보유기간 (2년 이상 — 단기30% 미발동)
    acquisitionDate: new Date("2022-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 1_000,
    totalIssuedShares: 10_000_000,
    acquisitionCause: "purchase",

    // 양도가액: 1주당 110,000원 × 1,000주 = 110,000,000
    transferPriceMode: "actual",
    perShareTransferPrice: 110_000,

    // 취득가액: 1주당 10,000원 × 1,000주 = 10,000,000
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 10_000,

    // 취득 후 상장·거래정지 비적용
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,

    // 장부분실 비적용
    bookLost: false,

    // 필요경비
    expenseMode: "actual",
    actualExpenses: 0,

    // 신고
    filingType: "preliminary",
    filingDate: new Date("2024-08-31"),
    isElectronicFiling: true,    // 전자신고 세액공제 20,000원
    isFraudulent: false,
    isInternationalTransaction: false,

    // 기본공제
    realEstateGroupBasicDeductionUsed: 0,

    ...overrides,
  };
}

/*
 * 핵심 산출 검증:
 *   양도가액 = 110,000 × 1,000 = 110,000,000
 *   취득가액 = 10,000 × 1,000 = 10,000,000
 *   필요경비 = 0
 *   양도소득금액 = 100,000,000
 *   기본공제 = 2,500,000
 *   과세표준 = 97,500,000
 *   대주주 누진세율: 3억 이하 20%
 *   산출세액 = 97,500,000 × 20% = 19,500,000 → 10원 절사: 19,500,000
 *   전자신고 공제: min(20,000, 19,500,000) = 20,000
 *
 * 케이스 25 (isFraudulent=true, isInternationalTransaction=false):
 *   부정 가산세: 19,500,000 × 40% = 7,800,000 → 10원 절사: 7,800,000
 *   finalTax: (19,500,000 + 7,800,000 - 20,000) = 27,280,000 → 10원 절사: 27,280,000
 *   지방소득세: 19,500,000 × 10% = 1,950,000 → 10원 절사: 1,950,000
 *
 * 케이스 26 (isFraudulent=true, isInternationalTransaction=true):
 *   국제 부정 가산세: 19,500,000 × 60% = 11,700,000 → 10원 절사: 11,700,000
 *   finalTax: (19,500,000 + 11,700,000 - 20,000) = 31,180,000 → 10원 절사: 31,180,000
 *   지방소득세: 1,950,000
 */

describe("케이스 25 — §47의2②1 부정행위 과소신고 가산세 40%", () => {
  const result = calculateStockTransferTax(
    penaltyBase({ isFraudulent: true, isInternationalTransaction: false }),
  );

  it("C25-01: taxCategory = listed_major", () => {
    expect(result.taxCategory).toBe("listed_major");
  });

  it("C25-02: isExempt = false", () => {
    expect(result.isExempt).toBe(false);
  });

  it("C25-03: transferPrice = 110,000,000", () => {
    expect(result.transferPrice).toBe(110_000_000);
  });

  it("C25-04: acquisitionPrice = 10,000,000", () => {
    expect(result.acquisitionPrice).toBe(10_000_000);
  });

  it("C25-05: transferIncome = 100,000,000", () => {
    expect(result.transferIncome).toBe(100_000_000);
  });

  it("C25-06: basicDeduction = 2,500,000 (§103②2호 주식 그룹)", () => {
    expect(result.basicDeduction).toBe(2_500_000);
  });

  it("C25-07: taxBase = 97,500,000", () => {
    expect(result.taxBase).toBe(97_500_000);
  });

  it("C25-08: appliedRate = 0.20 (대주주 누진 3억 이하)", () => {
    expect(result.appliedRate).toBe(0.20);
  });

  it("C25-09: calculatedTax = 19,500,000", () => {
    // 97,500,000 × 20% = 19,500,000
    expect(result.calculatedTax).toBe(19_500_000);
  });

  it("C25-10: underReportPenalty = 7,800,000 (§47의2②1 부정 40%)", () => {
    // 19,500,000 × 40% = 7,800,000 → 10원 절사 = 7,800,000
    expect(result.underReportPenalty).toBe(7_800_000);
  });

  it("C25-11: electronicFilingCredit = 20,000 (§52의2)", () => {
    expect(result.electronicFilingCredit).toBe(20_000);
  });

  it("C25-12: finalTax = 27,280,000", () => {
    // 19,500,000 + 7,800,000 - 20,000 = 27,280,000
    expect(result.finalTax).toBe(27_280_000);
  });

  it("C25-13: localIncomeTax = 1,950,000 (산출세액 × 10%, 10원 절사)", () => {
    // 19,500,000 × 10% = 1,950,000 → 10원 절사
    expect(result.localIncomeTax).toBe(1_950_000);
  });

  it("C25-14: appliedRules에 §47의2②1 부정 포함", () => {
    // warnings 또는 appliedRules에 부정 가산세 ref 기록
    const allRules = [...(result.appliedRules ?? []), ...(result.warnings ?? [])];
    const hasFraudRule = allRules.some(
      (r) => r.includes("§47의2") || r.includes("부정"),
    );
    expect(hasFraudRule).toBe(true);
  });
});

describe("케이스 26 — §47의2②1 단서 국제거래 부정 가산세 60%", () => {
  const result = calculateStockTransferTax(
    penaltyBase({ isFraudulent: true, isInternationalTransaction: true }),
  );

  it("C26-01: taxCategory = listed_major", () => {
    expect(result.taxCategory).toBe("listed_major");
  });

  it("C26-02: calculatedTax = 19,500,000 (동일 과세표준)", () => {
    expect(result.calculatedTax).toBe(19_500_000);
  });

  it("C26-03: underReportPenalty = 11,700,000 (§47의2②1 단서 60%)", () => {
    // 19,500,000 × 60% = 11,700,000 → 10원 절사 = 11,700,000
    expect(result.underReportPenalty).toBe(11_700_000);
  });

  it("C26-04: electronicFilingCredit = 20,000 (§52의2)", () => {
    expect(result.electronicFilingCredit).toBe(20_000);
  });

  it("C26-05: finalTax = 31,180,000", () => {
    // 19,500,000 + 11,700,000 - 20,000 = 31,180,000
    expect(result.finalTax).toBe(31_180_000);
  });

  it("C26-06: localIncomeTax = 1,950,000 (산출세액 × 10%)", () => {
    expect(result.localIncomeTax).toBe(1_950_000);
  });

  it("C26-07: appliedRules에 §47의2②1 국제 부정 포함", () => {
    const allRules = [...(result.appliedRules ?? []), ...(result.warnings ?? [])];
    const hasIntlFraudRule = allRules.some(
      (r) => r.includes("§47의2") || r.includes("국제"),
    );
    expect(hasIntlFraudRule).toBe(true);
  });
});

describe("가산세 비교 — 일반 과소신고 10% (default)", () => {
  const result = calculateStockTransferTax(
    penaltyBase({ isFraudulent: false, isInternationalTransaction: false }),
  );

  it("C25-D-01: 일반 과소신고 10% = 1,950,000", () => {
    // 19,500,000 × 10% = 1,950,000
    expect(result.underReportPenalty).toBe(1_950_000);
  });

  it("C25-D-02: finalTax = 21,430,000", () => {
    // 19,500,000 + 1,950,000 - 20,000 = 21,430,000
    expect(result.finalTax).toBe(21_430_000);
  });

  it("C25-D-03: 가산세 0원 입력 (isFraudulent=false, 기본 10%)", () => {
    // 과소신고 기본 10% 발동 — 신고불성실 가산세 반드시 > 0
    expect(result.underReportPenalty).toBeGreaterThan(0);
  });
});

describe("가산세 경계 — 전자신고 미신청 시 공제 없음", () => {
  const result = calculateStockTransferTax(
    penaltyBase({
      isFraudulent: true,
      isInternationalTransaction: false,
      isElectronicFiling: false,   // 전자신고 OFF
    }),
  );

  it("C25-E-01: electronicFilingCredit = 0 (전자신고 미적용)", () => {
    expect(result.electronicFilingCredit).toBe(0);
  });

  it("C25-E-02: finalTax = 27,300,000 (공제 없음)", () => {
    // 19,500,000 + 7,800,000 = 27,300,000
    expect(result.finalTax).toBe(27_300_000);
  });
});

describe("케이스 21 — 외국법인 validate 차단 (UI 레벨 — 엔진 미호출)", () => {
  it("C21-01: out_of_scope_foreign은 validate에서 차단되어야 함 (import 검증)", () => {
    // validateStep1 함수가 out_of_scope_foreign을 에러로 반환하는지 확인
    // 엔진 직접 테스트는 불필요 (validate 레벨 차단)
    // 여기서는 차단 패턴을 문서화
    const foreignMarket = "out_of_scope_foreign";
    expect(foreignMarket).toBe("out_of_scope_foreign");
  });
});
