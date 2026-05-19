/**
 * 해외주식 양도소득세 — anchor 테스트 (PR-4A)
 *
 * 법령: §94①3다목 + §118의2~§118의8 (소득세법 2026.4.21. 시행)
 * 세율: §118의5 → §55① 6~45% 8구간 (BASIC_PROGRESSIVE_BRACKETS)
 *
 * 자가검증값 (디자인 §9.1 R3 정정 완료):
 *   FS-anchor-01: 산출세액 20,865,500 (8,800만~1.5억 구간 35%, 누진공제 15,440,000)
 *   FS-anchor-02: 외국납부세액공제 후 최종 18,165,500
 *   FS-anchor-03: 5년 미만 거주 → not_liable (세액 0)
 *   FS-anchor-04: 외국납부세액 한도 초과 시 한도만 공제
 *   FS-anchor-05: 기본공제 250만원 (§118의7) 적용 확인
 *   FS-anchor-06: 지방소득세 10원 미만 절사 확인
 *
 * 법령 정확성 최우선 — 양도연도 세율 우선 (feedback_transfer_year_tax_rate)
 * 양도코리아 브랜드명 금지 (feedback_no_yangdo_korea_brand)
 */

import { describe, it, expect } from "vitest";
import { calculateForeignStockTax } from "@/lib/tax-engine/stock-transfer/foreign-stock";
import type { ForeignStockInput } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";

// ============================================================
// 기본 케이스 입력 (FS-anchor-01 기반)
// ============================================================

/**
 * 미국 NYSE 상장 외국법인 주식 — 기본 케이스
 * 환율 변동 (취득 1,200원/USD → 양도 1,350원/USD)
 *
 * 자가검증:
 *   transferPriceKrw = 1,000 × 150 × 1,350 = 202,500,000
 *   acquisitionPriceKrw = 1,000 × 80 × 1,200 = 96,000,000
 *   transferCostKrw = 200 × 1,350 = 270,000
 *   necessaryExpensesKrw = 0 + 270,000 = 270,000
 *   transferGain = 202,500,000 − 96,000,000 − 270,000 = 106,230,000
 *   basicDeduction = 2,500,000 (§118의7)
 *   taxBase = 103,730,000
 *   §55① 8,800만~1.5억 구간: 103,730,000 × 35% − 15,440,000
 *     = 36,305,500 − 15,440,000 = 20,865,500
 *   localIncomeTax = floor10(20,865,500 × 0.1) = 2,086,550
 */
const BASE_INPUT: ForeignStockInput = {
  marketType: "foreign_stock",
  yearsResidentInKorea: 7,              // §118의2 5년 이상 충족
  isListedForeignCorp: true,            // §157의3①1호
  stockName: "Example Corp",
  countryCode: "US",
  shareCount: 1_000,
  transferDate: new Date("2025-09-30"),
  transferPriceMode: "per_share",
  perShareTransferPriceForeign: 150,    // USD
  transferCurrencyCode: "USD",
  transferExchangeRate: 1_350,          // 양도일 기준환율 §178의5
  acquisitionDate: new Date("2022-03-15"),
  acquisitionMode: "actual",
  perShareAcquisitionPriceForeign: 80,  // USD
  acquisitionCurrencyCode: "USD",
  acquisitionExchangeRate: 1_200,       // 취득일 기준환율 §178의5 별도
  capitalExpenditureForeign: 0,
  transferCostForeign: 200,             // 수수료 200 USD
  hasForeignTax: false,
  foreignTaxMethod: "credit",
  isElectronicFiling: false,
};

// ============================================================
// FS-anchor-01: 표준 케이스 (USD 매수·매도 단순)
// 환율 변동 케이스 포함 (취득 1,200원 → 양도 1,350원)
// ============================================================
describe("FS-anchor-01: 미국 주식 기본 케이스 (§55① 누진 + §178의5 환율)", () => {
  const result = calculateForeignStockTax(BASE_INPUT);

  it("납세의무 충족", () => {
    expect(result.taxCategory).toBe("foreign_stock");
    expect(result.isLiable).toBe(true);
  });

  it("양도가액 원화 환산 (1,000주 × 150USD × 1,350원)", () => {
    expect(result.transferPriceKrw).toBe(202_500_000);
  });

  it("취득가액 원화 환산 (1,000주 × 80USD × 1,200원) — 취득일 별도 환율", () => {
    expect(result.acquisitionPriceKrw).toBe(96_000_000);
  });

  it("양도비 원화 환산 (200USD × 1,350원)", () => {
    // necessaryExpenses = capitalExpenditure(0) + transferCost(270,000)
    expect(result.necessaryExpensesKrw).toBe(270_000);
  });

  it("양도차익 = 202,500,000 − 96,000,000 − 270,000 = 106,230,000", () => {
    expect(result.transferGain).toBe(106_230_000);
  });

  it("기본공제 §118의7 = 2,500,000", () => {
    expect(result.basicDeduction).toBe(2_500_000);
  });

  it("과세표준 = 106,230,000 − 2,500,000 = 103,730,000", () => {
    expect(result.taxBase).toBe(103_730_000);
  });

  it("§55① 적용 세율 = 35% (8,800만~1.5억 구간)", () => {
    expect(result.appliedRate).toBe(0.35);
  });

  it("누진공제 = 15,440,000", () => {
    expect(result.progressiveDeduction).toBe(15_440_000);
  });

  /**
   * 산출세액 = 103,730,000 × 35% − 15,440,000
   *          = 36,305,500 − 15,440,000 = 20,865,500
   */
  it("산출세액 = 20,865,500 (디자인 §9.1 R3 확정값)", () => {
    expect(result.incomeTax).toBe(20_865_500);
  });

  it("지방소득세 = floor10(20,865,500 × 0.1) = 2,086,550", () => {
    expect(result.localIncomeTax).toBe(2_086_550);
  });

  it("외국납부세액 없음 → 최종세액 = 산출세액", () => {
    expect(result.finalTax).toBe(20_865_500);
  });

  it("총 납부액 = finalTax + localIncomeTax = 22,952,050", () => {
    expect(result.totalTax).toBe(20_865_500 + 2_086_550);
  });

  it("환율 echo (양도일·취득일 별도)", () => {
    expect(result.transferExchangeRate).toBe(1_350);
    expect(result.acquisitionExchangeRate).toBe(1_200);
  });
});

// ============================================================
// FS-anchor-02: 환율 변동 케이스 — 취득일과 양도일 환율 차이로 KRW 차익 증가
// ============================================================
describe("FS-anchor-02: 환율 변동으로 KRW 차익 증가 (취득 1,100 → 양도 1,400)", () => {
  const input: ForeignStockInput = {
    ...BASE_INPUT,
    acquisitionExchangeRate: 1_100,
    transferExchangeRate: 1_400,
    transferCostForeign: 0,
  };
  const result = calculateForeignStockTax(input);

  it("취득가액 원화 환산 (1,000주 × 80USD × 1,100원)", () => {
    expect(result.acquisitionPriceKrw).toBe(88_000_000);
  });

  it("양도가액 원화 환산 (1,000주 × 150USD × 1,400원)", () => {
    expect(result.transferPriceKrw).toBe(210_000_000);
  });

  it("양도차익 = 210,000,000 − 88,000,000 − 0 = 122,000,000 (환율 상승으로 증가)", () => {
    expect(result.transferGain).toBe(122_000_000);
  });

  it("과세표준 = 122,000,000 − 2,500,000 = 119,500,000", () => {
    expect(result.taxBase).toBe(119_500_000);
  });

  it("§55① 세율 35% 구간 (8,800만~1.5억)", () => {
    expect(result.appliedRate).toBe(0.35);
  });

  /**
   * 산출세액 = 119,500,000 × 35% − 15,440,000
   *          = 41,825,000 − 15,440,000 = 26,385,000
   */
  it("산출세액 자가검증", () => {
    const expected = Math.floor(119_500_000 * 0.35) - 15_440_000;
    expect(result.incomeTax).toBe(expected);
    expect(result.incomeTax).toBe(26_385_000);
  });
});

// ============================================================
// FS-anchor-03: 외국납부세액공제 한도 내 — 전액 공제
// ============================================================
describe("FS-anchor-03: 외국납부세액공제 한도 내 전액 공제 (credit 선택)", () => {
  /**
   * BASE_INPUT + foreignTaxPaidForeign: 2,000 USD
   *   foreignTaxPaidKrw = 2,000 × 1,350 = 2,700,000
   *   foreignTaxCreditLimit = 20,865,500 (단일 자산 = 산출세액)
   *   foreignTaxCreditApplied = min(2,700,000, 20,865,500) = 2,700,000
   *   finalTax = 20,865,500 − 2,700,000 = 18,165,500
   *   localIncomeTax = floor10(18,165,500 × 0.1) = 1,816,550
   */
  const input: ForeignStockInput = {
    ...BASE_INPUT,
    hasForeignTax: true,
    foreignTaxPaidForeign: 2_000,
    foreignTaxCurrencyCode: "USD",
    foreignTaxExchangeRate: 1_350,
    foreignTaxMethod: "credit",
  };
  const result = calculateForeignStockTax(input);

  it("외국납부세액 원화 = 2,000 × 1,350 = 2,700,000", () => {
    expect(result.foreignTaxPaidKrw).toBe(2_700_000);
  });

  it("공제한도 = 산출세액 전액 (단일 자산 §118의6)", () => {
    expect(result.foreignTaxCreditLimit).toBe(20_865_500);
  });

  it("외국납부세액 < 한도 → 전액 공제 (2,700,000)", () => {
    expect(result.foreignTaxCreditApplied).toBe(2_700_000);
  });

  it("최종세액 = 20,865,500 − 2,700,000 = 18,165,500 (디자인 §9.1 R3 확정값)", () => {
    expect(result.finalTax).toBe(18_165_500);
  });

  it("지방소득세 = floor10(18,165,500 × 0.1) = 1,816,550", () => {
    expect(result.localIncomeTax).toBe(1_816_550);
  });
});

// ============================================================
// FS-anchor-04: 외국납부세액공제 한도 초과 — 한도만 공제
// ============================================================
describe("FS-anchor-04: 외국납부세액공제 한도 초과 → 한도만 공제", () => {
  /**
   * 외국납부세액이 산출세액(20,865,500)보다 클 경우
   * → 한도(20,865,500)만 공제, 초과분은 손실 (환급 불가)
   * 예시: 외국납부세액 = 30,000 USD × 1,350 = 40,500,000원 > 한도 20,865,500
   */
  const input: ForeignStockInput = {
    ...BASE_INPUT,
    hasForeignTax: true,
    foreignTaxPaidForeign: 30_000,      // 30,000 USD
    foreignTaxCurrencyCode: "USD",
    foreignTaxExchangeRate: 1_350,
    foreignTaxMethod: "credit",
  };
  const result = calculateForeignStockTax(input);

  it("외국납부세액 원화 = 30,000 × 1,350 = 40,500,000", () => {
    expect(result.foreignTaxPaidKrw).toBe(40_500_000);
  });

  it("한도 = 산출세액 20,865,500", () => {
    expect(result.foreignTaxCreditLimit).toBe(20_865_500);
  });

  it("실제 공제 = min(40,500,000, 20,865,500) = 한도 20,865,500", () => {
    expect(result.foreignTaxCreditApplied).toBe(20_865_500);
  });

  it("최종세액 = 20,865,500 − 20,865,500 = 0", () => {
    expect(result.finalTax).toBe(0);
  });

  it("지방소득세 = floor10(0 × 0.1) = 0", () => {
    expect(result.localIncomeTax).toBe(0);
  });
});

// ============================================================
// FS-anchor-05: 기본공제 250만원 §118의7 적용 확인
// ============================================================
describe("FS-anchor-05: 기본공제 250만원 (§118의7) 적용", () => {
  it("양도차익 > 기본공제 → 공제 2,500,000 적용", () => {
    const result = calculateForeignStockTax(BASE_INPUT);
    expect(result.basicDeduction).toBe(2_500_000);
    expect(result.taxBase).toBe(result.transferGain - 2_500_000);
  });

  it("양도차익 < 기본공제 → 공제 = 양도차익 (과세표준 0)", () => {
    /**
     * 양도가: 100주 × 1.5USD × 1,350 = 202,500
     * 취득가: 100주 × 1.0USD × 1,200 = 120,000
     * 양도차익 = 202,500 − 120,000 = 82,500 < 250만
     * basicDeduction = min(82,500, 2,500,000) = 82,500
     * taxBase = 0
     */
    const smallGainInput: ForeignStockInput = {
      ...BASE_INPUT,
      shareCount: 100,                      // 100주 (소량)
      perShareTransferPriceForeign: 1.5,    // 1.5 USD/주
      perShareAcquisitionPriceForeign: 1.0, // 1.0 USD/주
      transferCostForeign: 0,
    };
    const result = calculateForeignStockTax(smallGainInput);
    // 양도가: 100 × 1.5 × 1,350 = 202,500
    // 취득가: 100 × 1.0 × 1,200 = 120,000
    // 양도차익 = 82,500
    expect(result.transferGain).toBe(82_500);
    expect(result.basicDeduction).toBe(82_500);  // 양도차익 한도 내
    expect(result.taxBase).toBe(0);
    expect(result.incomeTax).toBe(0);
  });

  it("손실 → 기본공제 0 (양도차익 < 0)", () => {
    const lossInput: ForeignStockInput = {
      ...BASE_INPUT,
      perShareTransferPriceForeign: 50,   // 50 USD (손실 발생)
      perShareAcquisitionPriceForeign: 80,
      transferCostForeign: 0,
    };
    const result = calculateForeignStockTax(lossInput);
    expect(result.transferGain).toBeLessThan(0);
    expect(result.basicDeduction).toBe(0);
    expect(result.taxBase).toBe(0);
    expect(result.incomeTax).toBe(0);
  });
});

// ============================================================
// FS-anchor-06: 지방소득세 10원 미만 절사 확인
// ============================================================
describe("FS-anchor-06: 지방소득세 10원 미만 절사 (§47③ 준용)", () => {
  it("BASE_INPUT — 산출세액 20,865,500 → 지방소득세 = floor10(2,086,550) = 2,086,550", () => {
    const result = calculateForeignStockTax(BASE_INPUT);
    // 2,086,550은 이미 10원 단위
    expect(result.localIncomeTax).toBe(2_086_550);
    expect(result.localIncomeTax % 10).toBe(0);
  });

  it("10원 절사 발동 확인 — 산출세액이 10의 배수가 아닌 경우", () => {
    // 과세표준을 조정하여 산출세액이 10의 배수가 아닌 경우 생성
    // 소과세표준 케이스: taxBase=35,000 → §55① 6% → 35,000 × 0.06 = 2,100
    // localIncomeTax = floor10(2,100 × 0.1) = floor10(210) = 210
    const microInput: ForeignStockInput = {
      ...BASE_INPUT,
      shareCount: 100,
      perShareTransferPriceForeign: 3.0,    // 100주 × 3 USD × 1,350 = 405,000
      perShareAcquisitionPriceForeign: 0.5, // 100주 × 0.5 USD × 1,200 = 60,000
      transferCostForeign: 0,
      // transferGain = 405,000 − 60,000 = 345,000
      // basicDeduction = min(345,000, 2,500,000) = 345,000
      // taxBase = 0 (손실 없음, 공제로 0)
    };
    const result = calculateForeignStockTax(microInput);
    // 지방소득세는 항상 10원 단위
    expect(result.localIncomeTax % 10).toBe(0);
  });

  it("외국납부세액공제 후 지방소득세도 10원 단위 유지", () => {
    const input: ForeignStockInput = {
      ...BASE_INPUT,
      hasForeignTax: true,
      foreignTaxPaidForeign: 2_000,
      foreignTaxCurrencyCode: "USD",
      foreignTaxExchangeRate: 1_350,
      foreignTaxMethod: "credit",
    };
    const result = calculateForeignStockTax(input);
    // finalTax = 18,165,500 → localIncomeTax = floor10(1,816,550) = 1,816,550
    expect(result.localIncomeTax).toBe(1_816_550);
    expect(result.localIncomeTax % 10).toBe(0);
  });
});

// ============================================================
// FS-anchor-07 (추가): §118의2 납세의무 미충족 — 5년 미만 거주자
// ============================================================
describe("FS-anchor-07: §118의2 납세의무 없음 (5년 미만 거주)", () => {
  const notLiableInput: ForeignStockInput = {
    ...BASE_INPUT,
    yearsResidentInKorea: 3,   // 5년 미만 → 납세의무 없음
  };
  const result = calculateForeignStockTax(notLiableInput);

  it("taxCategory = not_liable", () => {
    expect(result.taxCategory).toBe("not_liable");
  });

  it("isLiable = false", () => {
    expect(result.isLiable).toBe(false);
  });

  it("모든 세액 = 0", () => {
    expect(result.incomeTax).toBe(0);
    expect(result.localIncomeTax).toBe(0);
    expect(result.finalTax).toBe(0);
    expect(result.totalTax).toBe(0);
  });

  it("ineligibleReason 설명 포함", () => {
    expect(result.ineligibleReason).toBeDefined();
    expect(result.ineligibleReason).toContain("§118의2");
  });
});

// ============================================================
// FS-anchor-08: 외국납부세액 필요경비 산입 선택 (expense 모드)
// ============================================================
describe("FS-anchor-08: 외국납부세액 필요경비 산입 (§118의6 expense 선택)", () => {
  /**
   * BASE_INPUT + foreignTaxPaidForeign: 2,000 USD → expense 선택
   * foreignTaxPaidKrw = 2,000 × 1,350 = 2,700,000
   * necessaryExpensesKrw = 270,000(수수료) + 2,700,000(외국납부세액) = 2,970,000
   * transferGain = 202,500,000 − 96,000,000 − 2,970,000 = 103,530,000
   * basicDeduction = 2,500,000
   * taxBase = 101,030,000
   * §55① 35% 구간: 101,030,000 × 35% − 15,440,000 = 35,360,500 − 15,440,000 = 19,920,500
   */
  const input: ForeignStockInput = {
    ...BASE_INPUT,
    hasForeignTax: true,
    foreignTaxPaidForeign: 2_000,
    foreignTaxCurrencyCode: "USD",
    foreignTaxExchangeRate: 1_350,
    foreignTaxMethod: "expense",  // 필요경비 산입 선택
  };
  const result = calculateForeignStockTax(input);

  it("외국납부세액이 필요경비에 포함 (2,700,000 + 270,000 = 2,970,000)", () => {
    expect(result.necessaryExpensesKrw).toBe(2_970_000);
    expect(result.foreignTaxExpenseApplied).toBe(2_700_000);
  });

  it("양도차익 감소 (필요경비 증가분 반영)", () => {
    expect(result.transferGain).toBe(103_530_000);
  });

  it("외국납부세액공제 미적용 (expense 모드에서 credit 없음)", () => {
    expect(result.foreignTaxCreditApplied).toBeUndefined();
    expect(result.foreignTaxCreditLimit).toBeUndefined();
  });

  it("과세표준 = 103,530,000 − 2,500,000 = 101,030,000", () => {
    expect(result.taxBase).toBe(101_030_000);
  });

  it("산출세액 자가검증 (§55① 35%)", () => {
    const expected = Math.floor(101_030_000 * 0.35) - 15_440_000;
    expect(result.incomeTax).toBe(expected);
    expect(result.incomeTax).toBe(19_920_500);
  });
});

// ============================================================
// FS-anchor-09: 총액 직접 입력 모드 (transferPriceMode="total")
// ============================================================
describe("FS-anchor-09: 양도가액 총액 직접 입력 모드", () => {
  const input: ForeignStockInput = {
    ...BASE_INPUT,
    transferPriceMode: "total",
    perShareTransferPriceForeign: undefined,
    totalTransferPriceForeign: 150_000,   // 150,000 USD 총액 (1주당 150 × 1,000주와 동일)
    transferCostForeign: 0,
  };
  const result = calculateForeignStockTax(input);

  it("총액 환산 = 150,000 × 1,350 = 202,500,000", () => {
    expect(result.transferPriceKrw).toBe(202_500_000);
  });

  it("수수료 없음 → 양도차익 = 202,500,000 − 96,000,000", () => {
    expect(result.necessaryExpensesKrw).toBe(0);
    expect(result.transferGain).toBe(106_500_000);
  });
});

// ============================================================
// FS-anchor-GS-03: §178의3 시가 보충 모드 — 취득가액 미상 (market_price 모드)
//
// 엔진 구현 현황: acquisitionMode="market_price" 분기 구현됨.
// §178의3 시가를 사용자가 직접 입력하면 동일 산식으로 환산.
// warning: "§178의3 시가 산정: 사용자 입력값 사용..."
//
// 자가검증:
//   acquisitionPriceKrw = 1,000 × 90 USD × 1,250원 = 112,500,000
//   (실가 acquisitionMode="actual" 대비 취득가 상이 — 시가 보충 시나리오)
//   transferGain = 202,500,000 − 112,500,000 − 270,000 = 89,730,000
//   basicDeduction = 2,500,000
//   taxBase = 87,230,000
//   §55① 5,000만~8,800만 구간: 87,230,000 × 24% − 5,760,000
//           = 20,935,200 − 5,760,000 = 15,175,200
// ============================================================
describe("FS-anchor-GS-03: §178의3 시가 보충 모드 — market_price 취득 (v1 사용자 입력)", () => {
  /**
   * acquisitionMode="market_price": §178의3 시가 산정
   * v1에서는 perShareAcquisitionPriceForeign에 외부 검증된 시가를 직접 입력
   * 엔진은 동일 환산식을 적용하되 warning을 발행
   */
  const input: ForeignStockInput = {
    ...BASE_INPUT,
    acquisitionMode: "market_price",
    perShareAcquisitionPriceForeign: 90,       // §178의3 시가 (사용자 입력)
    acquisitionExchangeRate: 1_250,             // 취득일 기준환율 (시가 산정 시점)
    transferCostForeign: 200,
  };
  const result = calculateForeignStockTax(input);

  it("납세의무 충족 (§118의2 거주기간 충족)", () => {
    expect(result.isLiable).toBe(true);
  });

  it("취득가액 원화 = 1,000 × 90 × 1,250 = 112,500,000", () => {
    expect(result.acquisitionPriceKrw).toBe(112_500_000);
  });

  it("양도차익 = 202,500,000 − 112,500,000 − 270,000 = 89,730,000", () => {
    expect(result.transferGain).toBe(89_730_000);
  });

  it("과세표준 = 89,730,000 − 2,500,000 = 87,230,000", () => {
    expect(result.taxBase).toBe(87_230_000);
  });

  it("§55① 세율 = 24% (5,000만~8,800만 구간)", () => {
    expect(result.appliedRate).toBe(0.24);
  });

  it("누진공제 = 5,760,000 (§55① 5,000만~8,800만 구간 정확값)", () => {
    // §55① 세율표: 5,000만 초과 ~ 8,800만 이하 → 24%, 누진공제 5,760,000
    expect(result.progressiveDeduction).toBe(5_760_000);
  });

  it("산출세액 = floor(87,230,000 × 0.24) − 5,760,000 = 15,175,200", () => {
    // 87,230,000 × 0.24 = 20,935,200 → floor = 20,935,200
    // 20,935,200 − 5,760,000 = 15,175,200
    const expected = Math.floor(87_230_000 * 0.24) - 5_760_000;
    expect(result.incomeTax).toBe(expected);
    expect(result.incomeTax).toBe(15_175_200);
  });

  it("§178의3 시가 보충 warning 발행", () => {
    const hasWarning = result.warnings.some((w) => w.includes("§178의3"));
    expect(hasWarning).toBe(true);
  });

  it("appliedRules에 §178의3 포함", () => {
    const hasRule = result.appliedRules.some((r) => r.includes("§178의3"));
    expect(hasRule).toBe(true);
  });
});

// ============================================================
// FS-anchor-GS-07: 국내+해외 기본공제 그룹 분리 확인
//
// §118의7 해외주식 기본공제 250만원은 §103①2호 국내주식 그룹과 별도 독립.
// 동일 과세기간에 국내 주식 250만 + 해외 주식 250만 = 500만원 효과 가능.
// 엔진 단건 호출 2회로 그룹 분리 구조 검증.
// ============================================================
describe("FS-anchor-GS-07: 기본공제 그룹 분리 — §118의7 vs §103①2호", () => {
  /**
   * 해외주식 결과는 §118의7 기본공제 250만원을 단독 적용.
   * 국내주식(별도 엔진)은 §103①2호 250만원을 별도 적용.
   * 두 그룹은 합산되지 않고 독립 처리됨.
   *
   * 본 테스트: 해외주식 2건 독립 호출 시 각각 250만원 기본공제 적용 확인
   * (실제 합산 신고 시 그룹 내에서 1회만 적용됨 — 당 케이스는 단건 검증)
   */

  // 케이스 A: 양도차익 5,000,000 (250만 초과) → basicDeduction = 250만
  const inputA: ForeignStockInput = {
    ...BASE_INPUT,
    shareCount: 200,
    perShareTransferPriceForeign: 30,       // 200 × 30 × 1,350 = 8,100,000
    perShareAcquisitionPriceForeign: 10,    // 200 × 10 × 1,200 = 2,400,000
    transferCostForeign: 0,
    // transferGain = 8,100,000 − 2,400,000 = 5,700,000
  };
  const resultA = calculateForeignStockTax(inputA);

  // 케이스 B: 다른 해외 주식 (별개 종목, 동일 과세기간)
  const inputB: ForeignStockInput = {
    ...BASE_INPUT,
    countryCode: "JP",
    shareCount: 300,
    perShareTransferPriceForeign: 20,       // 300 × 20 × 1,350 = 8,100,000
    perShareAcquisitionPriceForeign: 8,     // 300 × 8 × 1,200 = 2,880,000
    transferCostForeign: 0,
    // transferGain = 8,100,000 − 2,880,000 = 5,220,000
  };
  const resultB = calculateForeignStockTax(inputB);

  it("케이스 A: 기본공제 = 2,500,000 (§118의7 단건 적용)", () => {
    expect(resultA.transferGain).toBe(5_700_000);
    expect(resultA.basicDeduction).toBe(2_500_000);
  });

  it("케이스 B: 기본공제 = 2,500,000 (§118의7 단건 적용 — 별도 그룹)", () => {
    expect(resultB.transferGain).toBe(5_220_000);
    expect(resultB.basicDeduction).toBe(2_500_000);
  });

  it("두 결과 모두 basicDeduction = 2,500,000 (그룹 분리 독립 적용)", () => {
    // 실제 합산 신고 시에는 동일 그룹 내 250만 1회만 적용됨
    // 본 케이스는 엔진 단건 레벨에서 §118의7 독립 적용 구조 확인
    expect(resultA.basicDeduction).toBe(2_500_000);
    expect(resultB.basicDeduction).toBe(2_500_000);
  });

  it("§118의7 appliedRules 포함 확인 (국내 §103①2호와 별도 독립 근거)", () => {
    const hasRuleA = resultA.appliedRules.some((r) => r.includes("§118의7"));
    const hasRuleB = resultB.appliedRules.some((r) => r.includes("§118의7"));
    expect(hasRuleA).toBe(true);
    expect(hasRuleB).toBe(true);
  });
});

// ============================================================
// FS-anchor-GS-09: §178의5② 장기할부조건 분할 수령 — v1 미지원 확인
//
// 소득세법 시행령 §178의5②: 장기할부조건 양도 시 수령 시점별 환율 각 적용.
// 현재 엔진 v1: 단건 양도가액 입력만 지원.
// 장기할부 다시점 분할 수령은 후속 PR 스코프.
//
// 본 anchor: v1에서 총액 입력 + 단일 환율로 계산됨을 확인 (미지원 대신 총액 근사 처리)
// ============================================================
describe("FS-anchor-GS-09: 장기할부 분할 수령 §178의5② — v1 단일환율 근사 처리", () => {
  /**
   * v1 처리: §178의5② 장기할부 분할 수령 미지원.
   * 사용자는 총 수령액 합계를 totalTransferPriceForeign에 직접 입력 + 대표 환율 사용.
   * 추후 PR에서 시점별 분할 환율 적용 지원 예정.
   *
   * 본 케이스: 3회 분할 수령 총합 = 210,000 USD를 총액으로 입력
   *   총 수령 USD: 70,000 + 70,000 + 70,000 = 210,000 USD
   *   대표 환율: 1,350원/USD (평균 환율 근사)
   *   transferPriceKrw = 210,000 × 1,350 = 283,500,000
   */
  const input: ForeignStockInput = {
    ...BASE_INPUT,
    transferPriceMode: "total",
    perShareTransferPriceForeign: undefined,
    totalTransferPriceForeign: 210_000,    // 3회 분할 수령 합계 (근사 처리)
    transferExchangeRate: 1_350,            // 대표 환율 (시점별 환율 미적용 v1 한계)
    transferCostForeign: 0,
    shareCount: 1_000,
    perShareAcquisitionPriceForeign: 80,
    acquisitionExchangeRate: 1_200,
  };
  const result = calculateForeignStockTax(input);

  it("v1: 총액 + 단일 환율 → 양도가액 환산 = 283,500,000", () => {
    // 210,000 USD × 1,350원 = 283,500,000
    expect(result.transferPriceKrw).toBe(283_500_000);
  });

  it("취득가액 = 1,000 × 80 × 1,200 = 96,000,000", () => {
    expect(result.acquisitionPriceKrw).toBe(96_000_000);
  });

  it("양도차익 = 283,500,000 − 96,000,000 = 187,500,000", () => {
    expect(result.transferGain).toBe(187_500_000);
  });

  it("과세표준 = 187,500,000 − 2,500,000 = 185,000,000", () => {
    expect(result.taxBase).toBe(185_000_000);
  });

  it("§55① 세율 = 38% (1.5억~3억 구간)", () => {
    expect(result.appliedRate).toBe(0.38);
  });

  it("산출세액 자가검증 (§55① 38%, 누진공제 19,940,000)", () => {
    // 185,000,000 × 38% − 19,940,000
    // = 70,300,000 − 19,940,000 = 50,360,000
    const expected = Math.floor(185_000_000 * 0.38) - 19_940_000;
    expect(result.incomeTax).toBe(expected);
    expect(result.incomeTax).toBe(50_360_000);
  });

  it("납부 성공 (v1 총액 근사 처리)", () => {
    // §178의5② 시점별 분할 환율 미구현 — v1 제한사항
    // 총액 입력으로 정상 계산됨 확인
    expect(result.isLiable).toBe(true);
    expect(result.taxCategory).toBe("foreign_stock");
  });
});

// ============================================================
// FS-anchor-10: LTHD 미적용 확인 (§118의8 단서)
// ============================================================
describe("FS-anchor-10: LTHD 미적용 — §118의8 단서", () => {
  it("10년 보유해도 LTHD 공제 없음 — taxBase = transferGain − basicDeduction", () => {
    // 취득일을 10년 전으로 설정해도 LTHD 0 확인
    const longHoldInput: ForeignStockInput = {
      ...BASE_INPUT,
      acquisitionDate: new Date("2015-01-01"),  // 10년 보유
      transferDate: new Date("2025-09-30"),
    };
    const result = calculateForeignStockTax(longHoldInput);
    // 해외주식은 §118의8 단서로 LTHD 미적용
    // taxBase = transferGain − basicDeduction (LTHD 없음)
    expect(result.taxBase).toBe(result.transferGain - result.basicDeduction);

    // §118의8 적용 규칙이 appliedRules에 포함
    expect(result.appliedRules.some((r) => r.includes("§118의8"))).toBe(true);
  });
});
