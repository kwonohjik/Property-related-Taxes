/**
 * 사례 36-A2 — 조합원입주권 양도 + 청산금 수령 (subject="right" + direction="receive")
 *
 * 36-A2-i: 실가 취득가 + receive
 * 36-A2-ii: 환산취득가 + receive
 *
 * ★ 2026-05-15 법령 원문 재확인 후 가목 산식 정정:
 *   §166①2호 가목 원문: "[양도가액 − (평가액 − 지급받은 청산금) − 필요경비]"
 *   이전 구현: settlement.gain = settlementAmount − 안분취득가  (법령 불일치 — 폐기)
 *   정정 후:  settlement.gain = 양도가액 − (평가액 − 청산금) − 인가후 필요경비
 *
 * 법령 근거 (law.go.kr 확인 2026-05-15):
 *   - §166①2호 가목: 인가후 분 양도차익 = 양도가액 − (평가액 − 지급받은 청산금) − 필요경비
 *   - §166①2호 나목: 인가전 양도차익 축소
 *     (preApprovalGain × (평가액 − 청산금) / 평가액)
 *   - §94①2호 + §166①2호 가목 구조: 인가후 분 LTHD = 0
 *   - §166⑤1호: 인가전 보유기간 기산
 *
 * 가정값 (CORE-36 기반 + direction=receive):
 *   rightsValue = 300,000,000 / oldAcq = 100,000,000
 *   settlementAmount = 90,000,000 / transferPrice = 520,000,000
 *   salePriceTotal = 300M − 90M = 210,000,000
 *
 * 정정 후 산식:
 *   가목: settlement.gain = 520M − 210M − 0 = 310,000,000
 *   나목: preApprovalGainAdjusted = floor(200M × 210M / 300M) = 140,000,000
 *   인가전 LTHD = 140M × 30% = 42,000,000
 *   인가후 분 LTHD = 0
 *   양도소득금액 = (140M − 42M) + 310M = 408,000,000
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

// ──────────────────────────────────────────────────────────────────────────────
// 36-A2-i — 실가 + receive
// ──────────────────────────────────────────────────────────────────────────────

describe("36-A2-i — 입주권 양도(receive) 실가 일반과세", () => {
  /**
   * CORE-36 입력에서 direction만 receive.
   * transferPrice = salePriceTotal(210M)로 처리되는지 확인.
   * (computeRightReceive는 transferPrice 파라미터를 Omit함 — 내부 산식에서 직접 salePriceTotal 사용)
   */
  const redevInfoReceive: RedevelopmentInfo = {
    subject: "right",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2018-10-23"),
    rightsValue: 300_000_000,
    settlementDirection: "receive",
    settlementAmount: 90_000_000,
    settlementSaleDate: new Date("2023-03-02"), // 입주권 양도일 = 소유권이전 고시일 (사례 36 단순화)
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    acquisitionRounding: "floor",
  };

  const input: TransferTaxInput = baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: 520_000_000, // §166①2호 가목에서 사용 (양도가액 − (평가액-청산금) − 비용)
    transferDate: new Date("2023-03-02"),
    acquisitionDate: new Date("2002-04-09"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 2,
    householdRightCount: 1,
    residencePeriodMonths: 0,
    redevelopment: redevInfoReceive,
  });

  const result = calculateTransferTax(input, mockRates);

  it("[36-A2-i-01] 인가후 분 양도차익 = 310,000,000 (§166①2호 가목)", () => {
    // ★ 정정: §166①2호 가목 법령 원문 적용
    // settlement.gain = 양도가액 − (평가액 − 청산금) − 인가후 필요경비
    //                 = 520M − (300M − 90M) − 0 = 520M − 210M = 310,000,000
    expect(result.redevelopmentDetail?.settlement.gain).toBe(310_000_000);
  });

  it("[36-A2-i-02] 인가전 축소 차익 = 140,000,000 (floor(200M × 210M / 300M) — §166①2호 나목)", () => {
    // salePriceTotal = 300M − 90M = 210M
    // 인가전 축소 = floor(200M × 210M / 300M) = 140,000,000
    expect(result.redevelopmentDetail?.preApproval.gain).toBe(140_000_000);
  });

  it("[36-A2-i-03] 인가전 LTHD = 42,000,000 (140M × 30% — 16년 표1 30% 캡)", () => {
    expect(result.redevelopmentDetail?.preApproval.lthd).toBe(42_000_000);
  });

  it("[36-A2-i-04] 청산금 분 LTHD = 0 (§94①2호 + §166①2호 가목 구조)", () => {
    expect(result.redevelopmentDetail?.settlement.lthd).toBe(0);
  });

  it("[36-A2-i-05] 인가후 기존주택분 gain = 0 (§166⑤1호)", () => {
    expect(result.redevelopmentDetail?.postApprovalExistingHouse.gain).toBe(0);
  });

  it("[36-A2-i-06] 양도소득금액 = 408,000,000 ((140M−42M) + 310M)", () => {
    // ★ 정정: (140M − 42M) + (310M − 0) = 98M + 310M = 408,000,000
    expect(result.redevelopmentDetail?.total.taxableIncome).toBe(408_000_000);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 36-A2-ii — 환산 + receive
// ──────────────────────────────────────────────────────────────────────────────

describe("36-A2-ii — 입주권 양도(receive) 환산취득가", () => {
  /**
   * 환산 모드: D=400M, P_A=120M → 환산취득가=90M, 개산공제=3.6M
   * preApprovalGain = 300M − 90M − 3.6M = 206,400,000
   *
   * ★ 정정 후 산식 (§166①2호 가목 법령 원문):
   *   salePriceTotal = 300M − 90M = 210,000,000
   *   가목: settlement.gain = 520M − 210M − 0 = 310,000,000
   *   나목: preApprovalGainAdjusted = floor(206.4M × 210M / 300M) = 144,480,000
   *   인가전 LTHD = floor(144,480,000 × 30%) = 43,344,000
   */
  const redevInfoEstimatedReceive: RedevelopmentInfo = {
    subject: "right",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2018-10-23"),
    rightsValue: 300_000_000,
    settlementDirection: "receive",
    settlementAmount: 90_000_000,
    settlementSaleDate: new Date("2023-03-02"),
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    acquisitionRounding: "floor",
    acquisitionHousingPrice: 120_000_000,   // P_A
    managementDisposalHousingPrice: 400_000_000, // D
  };

  const inputEstimated: TransferTaxInput = baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: 520_000_000,
    transferDate: new Date("2023-03-02"),
    acquisitionDate: new Date("2002-04-09"),
    acquisitionPrice: 0, // 환산 모드
    expenses: 0,
    useEstimatedAcquisition: true,
    isOneHousehold: false,
    householdHousingCount: 2,
    householdRightCount: 1,
    residencePeriodMonths: 0,
    redevelopment: redevInfoEstimatedReceive,
  });

  const result = calculateTransferTax(inputEstimated, mockRates);

  it("[36-A2-ii-01] 환산취득가 = 90,000,000 (floor(300M × 120M / 400M) — §166③)", () => {
    // 300M × 120M / 400M = 90,000,000 (정확히 나눠떨어짐)
    // receive 분기: apportionedAcquisition = 환산취득가 − 안분취득가
    // preApproval.apportionedAcquisition = oldAcq − receive.apportionedAcquisition = 90M − 27M = 63M
    // 환산취득가 직접 확인: valuationMeta.numerator (P_A)
    expect(result.redevelopmentDetail?.valuationMeta?.numerator).toBe(120_000_000);
  });

  it("[36-A2-ii-02] 인가후 분 양도차익 = 310,000,000 (§166①2호 가목)", () => {
    // ★ 정정: settlement.gain = 양도가액 − (평가액 − 청산금) − 인가후 필요경비
    //                          = 520M − (300M − 90M) − 0 = 310,000,000
    // (환산 모드에서도 양도가액 사용 — 가목 산식은 취득방법 무관)
    expect(result.redevelopmentDetail?.settlement.gain).toBe(310_000_000);
  });

  it("[36-A2-ii-03] 인가전 축소 차익 = 144,480,000 (floor(206.4M × 210M / 300M))", () => {
    // preApprovalGain(환산) = 300M − 90M − 3.6M = 206,400,000
    // 축소 = floor(206,400,000 × 210M / 300M) = floor(144,480,000) = 144,480,000
    expect(result.redevelopmentDetail?.preApproval.gain).toBe(144_480_000);
  });
});
