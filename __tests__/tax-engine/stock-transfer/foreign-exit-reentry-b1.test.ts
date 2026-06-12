/**
 * B-1②b 재전입 환급 §118의17①1호 (5년 이내 미양도 재입국 거주자)
 *
 * §118의17①1호: 출국일부터 5년 이내 미양도 + 국내 재입국 거주자 → 환급/납부유예 취소.
 *   ③ §118의15④ 미신고 가산세는 환급 제외. ④ 2·3호는 국세환급가산금 미가산.
 */

import { describe, it, expect } from "vitest";
import { calculateExitTax } from "@/lib/tax-engine/stock-transfer/exit-tax";
import type { ExitTaxInput } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";

function base(overrides?: Partial<ExitTaxInput>): ExitTaxInput {
  return {
    marketType: "exit_tax",
    yearsResidentLast10: 8,
    departureDate: new Date("2026-06-01"),
    isMajorShareholder: true,
    holdings: [
      {
        id: "h1",
        stockName: "예제",
        marketType: "kospi",
        shareCount: 100,
        acquisitionDate: new Date("2020-01-01"),
        perShareAcquisitionPrice: 20_000,
        departureDayValuationMode: "market_price",
        departureDayMarketPrice: 50_000,
      },
    ],
    deferralRequested: false,
    deferralReason: "none",
    foreignTaxExclusionReason: "none",
    hasFiledHoldingsReport: true,
    reenteredWithin5Years: false,
    ...overrides,
  };
}

describe("B-1②b 재전입 환급 §118의17①1호", () => {
  it("B1-REENTRY-0 (baseline): 재입국 false → reentryRefund 미산출", () => {
    const r = calculateExitTax(base());
    expect(r.reentryRefund).toBeUndefined();
  });

  it("B1-REENTRY-1: 납부 완료 + 재입국 → 환급(소득세+지방세)·취소 아님", () => {
    const r = calculateExitTax(base({ reenteredWithin5Years: true }));
    expect(r.reentryRefund).toBeDefined();
    expect(r.reentryRefund!.isDeferralCancel).toBe(false);
    // 환급액 = 산출세액 + 지방소득세 (미신고 가산세 제외)
    expect(r.reentryRefund!.amount).toBe(r.incomeTax + r.localIncomeTax);
    expect(r.reentryRefund!.amount).toBeGreaterThan(0);
  });

  it("B1-REENTRY-2: 납부유예 중 + 재입국 → 유예 세액 취소", () => {
    const r = calculateExitTax(
      base({ reenteredWithin5Years: true, deferralRequested: true, deferralReason: "none" }),
    );
    expect(r.reentryRefund!.isDeferralCancel).toBe(true);
    // 취소액 = 유예 세액 (= 산출세액)
    expect(r.reentryRefund!.amount).toBe(r.deferredTaxAmount);
    expect(r.reentryRefund!.amount).toBe(r.incomeTax);
  });
});

describe("B-1②a 납부유예 이자상당액 §118의16④·§178의12③", () => {
  it("B1-INTEREST-0 (baseline): 일수·이자율 미입력 → deferralInterest 미산출(안내만)", () => {
    const r = calculateExitTax(base({ deferralRequested: true, deferralReason: "none" }));
    expect(r.deferralInterest).toBeUndefined();
    expect(r.deferralInterestNote).toContain("§178의12③");
  });

  it("B1-INTEREST-1: 유예세액 × 일수 × 1일당 이자율 = floor 산출", () => {
    const r = calculateExitTax(
      base({
        deferralRequested: true,
        deferralReason: "none",
        deferralInterestDays: 365,
        deferralInterestDailyRate: 0.000022,
      }),
    );
    // deferredTaxAmount = incomeTax. 이자상당액 = floor(유예세액 × 365 × 0.000022)
    expect(r.deferralInterest).toBe(Math.floor(r.deferredTaxAmount * 365 * 0.000022));
    expect(r.deferralInterest).toBeGreaterThan(0);
  });

  it("B1-INTEREST-2: 납부유예 미신청 시 일수·이자율 입력해도 미산출", () => {
    const r = calculateExitTax(
      base({ deferralRequested: false, deferralInterestDays: 365, deferralInterestDailyRate: 0.000022 }),
    );
    expect(r.deferralInterest).toBeUndefined();
  });
});
