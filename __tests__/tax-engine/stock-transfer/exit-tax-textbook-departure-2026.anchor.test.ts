/**
 * 국외전출세 교재 사례 anchor — 갑(코스닥 A)·을(비상장 B), 2026.9.1. 출국
 *
 * 법령: 소득세법 §118의10(과세표준)·§118의11(세율)·§118의12(조정공제)·§118의13(외국납부세액공제)
 *
 * 사례
 *   갑  코스닥 상장 A  취득 100,000,000 · 출국일 시가 500,000,000 · 실제 양도 450,000,000 · 외국 납부 30,000,000
 *   을  비상장 B       취득 200,000,000 · 출국일 시가 300,000,000 · 실제 양도 600,000,000 · 외국 납부 20,000,000
 *   이민 국가는 실제 취득가액으로 과세했다 → §118의13② 배제 사유 없음.
 *
 * 교재 해답
 *   [물음 1] 과세표준 397,500,000 / 97,500,000 · 산출세액 84,375,000 / 19,500,000
 *   [물음 2] 갑 조정공제 12,500,000 · 외국납부세액공제 30,000,000 · 납부 41,875,000
 *            을 조정공제 없음 · 외국납부세액공제 5,000,000 · 납부 14,500,000
 *
 * 교재 문제에는 엔진 입력이 아닌 자료도 있다. 엔진 밖에서 정리되므로 여기서는 다루지 않는다.
 *   - 상가: 국외전출세 과세 대상이 아니다(§118의9①은 주식등만 정한다).
 *   - 같은 해 비상장 C 양도: §118의10⑤에 따라 과세표준을 따로 계산하므로 §118의10④ 250만원 공제는
 *     국외전출세에서 따로 적용된다.
 *   - 중소기업 여부: §118의11 1호(§94①3가·나목)는 중소기업이어도 20%/25%다.
 * 교재 조정공제 산식에 적힌 「(450,000,000 − 400,000,000) × 25%」는 차액 50,000,000의 오기다.
 * 정답은 (500,000,000 − 450,000,000) × 25% = 12,500,000이다. 두 과세표준(397,500,000 → 347,500,000)이
 * 모두 3억원 초과 구간이라, 엔진의 「출국일 기준 산출세액 − 실제 양도가액 기준 산출세액」과 값이 같다.
 */

import { describe, it, expect } from "vitest";
import { calculateExitTax } from "@/lib/tax-engine/stock-transfer/exit-tax";
import type { ExitTaxInput, ExitTaxHolding } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";

const SHARES = 10_000;

function makeInput(holding: Partial<ExitTaxHolding>, overrides?: Partial<ExitTaxInput>): ExitTaxInput {
  return {
    marketType: "exit_tax",
    yearsResidentLast10: 10,
    departureDate: new Date("2026-09-01"),
    isMajorShareholder: true,
    holdings: [
      {
        id: "h-1",
        stockName: "교재 사례",
        marketType: "kosdaq",
        shareCount: SHARES,
        acquisitionDate: new Date("2015-01-01"),
        perShareAcquisitionPrice: 0,
        departureDayValuationMode: "market_price",
        ...holding,
      },
    ],
    deferralRequested: true,
    deferralReason: "none",
    foreignTaxExclusionReason: "none",
    hasFiledHoldingsReport: true,
    reenteredWithin5Years: false,
    ...overrides,
  };
}

// 갑: 취득 10,000 × 10,000주 = 100,000,000 · 시가 50,000 × 10,000주 = 500,000,000
const GAP = { marketType: "kosdaq", perShareAcquisitionPrice: 10_000, departureDayMarketPrice: 50_000 } as const;
// 을: 취득 20,000 × 10,000주 = 200,000,000 · 시가 30,000 × 10,000주 = 300,000,000
const EUL = { marketType: "unlisted", perShareAcquisitionPrice: 20_000, departureDayMarketPrice: 30_000 } as const;

describe("국외전출세 교재 사례 [물음 1] 산출세액", () => {
  it("갑: 과세표준 397,500,000 · 산출세액 84,375,000", () => {
    const r = calculateExitTax(makeInput(GAP));
    expect(r.totalTransferGain).toBe(400_000_000);
    expect(r.basicDeduction).toBe(2_500_000);
    expect(r.taxBase).toBe(397_500_000);
    expect(r.incomeTax).toBe(84_375_000);
  });

  it("을: 과세표준 97,500,000 · 산출세액 19,500,000", () => {
    const r = calculateExitTax(makeInput(EUL));
    expect(r.totalTransferGain).toBe(100_000_000);
    expect(r.basicDeduction).toBe(2_500_000);
    expect(r.taxBase).toBe(97_500_000);
    expect(r.incomeTax).toBe(19_500_000);
  });
});

describe("국외전출세 교재 사례 [물음 2] 실제 양도 후 납부세액", () => {
  it("갑: 조정공제 12,500,000 · 외국납부세액공제 30,000,000 · 납부 41,875,000", () => {
    const r = calculateExitTax(
      makeInput(GAP, {
        actualTransferDate: new Date("2027-03-01"),
        actualTransferPricePerShare: 45_000, // 450,000,000
        foreignTaxPaid: 30_000_000,
      }),
    );
    expect(r.adjustmentDeduction).toBe(12_500_000);
    // 30,000,000 × (450,000,000 − 100,000,000) ÷ (450,000,000 − 100,000,000) — 한도 71,875,000 이내
    expect(r.foreignTaxCreditApplied).toBe(30_000_000);
    expect(r.finalTaxAfterAdjustment).toBe(41_875_000);
  });

  it("을: 조정공제 없음 · 외국납부세액공제 5,000,000 · 납부 14,500,000", () => {
    const r = calculateExitTax(
      makeInput(EUL, {
        actualTransferDate: new Date("2027-03-01"),
        actualTransferPricePerShare: 60_000, // 600,000,000
        foreignTaxPaid: 20_000_000,
      }),
    );
    expect(r.adjustmentDeduction ?? 0).toBe(0);
    // 20,000,000 × (300,000,000 − 200,000,000) ÷ (600,000,000 − 200,000,000)
    expect(r.foreignTaxCreditApplied).toBe(5_000_000);
    expect(r.finalTaxAfterAdjustment).toBe(14_500_000);
  });
});
