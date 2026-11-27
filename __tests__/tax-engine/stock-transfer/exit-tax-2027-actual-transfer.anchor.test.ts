/**
 * 국외전출세 2027.1.1. 개정 — PR-7a: 종목별 실제 양도(경정청구 일반화) anchor
 *
 * 계획서: docs/02-design/features/stock-transfer-exit-tax-2027.plan.md §2.2 · engine.plan.md §3.7 (K-16 · V-7 · V-8 · V-9 · V-14)
 * 수치는 전부 손계산이다(엔진 실행값 복사 아님).
 *
 *   H1 코스닥 10,000주 · 취득 10,000/주 · 출국일 시가 50,000/주   → 시가 500,000,000 · 취득 100,000,000 · 차익 400,000,000 (1호)
 *   F1 국외주식 1,000주 · 취득 480,000/주 · 출국일 시가 1,400,000/주 → 시가 1,400,000,000 · 취득 480,000,000 · 차익 920,000,000 (2호나목)
 *
 *   K-16  F1만 · 1,000주 전부 양도 · 외화 1,000 × 기준환율 1,200 = 1,200,000/주 → 양도 1,200,000,000
 *         하락 200,000,000 · 과세표준 917,500,000 → 717,500,000 · 산출 183,500,000 → 143,500,000 · 조정공제 40,000,000
 *         (2호가목 10%: 91,750,000 → 71,750,000 · 조정공제 20,000,000)
 *   부분  F1 400주만 양도(같은 1,200,000/주) → 출국일 시가 560,000,000 · 양도 480,000,000 · 하락 80,000,000
 *         과세표준 917,500,000 → 837,500,000 · 산출 183,500,000 → 167,500,000 · 조정공제 16,000,000
 *   혼합  H1 10,000주 40,000/주(하락 100,000,000) + F1 1,000주 1,200,000/주(하락 200,000,000) · 배분 (2,500,000 / 0)
 *         1호: 과세표준 397,500,000 → 297,500,000 · 84,375,000 → 59,500,000 = 24,875,000
 *         2호나목: 920,000,000 → 720,000,000 · 184,000,000 → 144,000,000 = 40,000,000
 *         조정공제 합 64,875,000 · 산출 268,375,000 → 경정 후 203,500,000
 */

import { describe, it, expect } from "vitest";
import { calculateExitTax } from "@/lib/tax-engine/stock-transfer/exit-tax";
import type {
  ExitTaxHolding,
  ExitTaxInput,
} from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

function h1(over: Partial<ExitTaxHolding> = {}): ExitTaxHolding {
  return {
    id: "h1",
    stockName: "H1 코스닥",
    marketType: "kosdaq",
    shareCount: 10_000,
    acquisitionDate: utc(2015, 1, 1),
    perShareAcquisitionPrice: 10_000,
    departureDayValuationMode: "market_price",
    departureDayMarketPrice: 50_000,
    ...over,
  };
}

function f1(over: Partial<ExitTaxHolding> = {}): ExitTaxHolding {
  return {
    id: "f1",
    stockName: "F1 국외주식",
    marketType: "foreign_stock",
    isListedForeignCorp: true,
    shareCount: 1_000,
    acquisitionDate: utc(2018, 1, 1),
    perShareAcquisitionPrice: 480_000,
    departureDayValuationMode: "market_price",
    departureDayMarketPrice: 1_400_000,
    ...over,
  };
}

function input(holdings: ExitTaxHolding[], over: Partial<ExitTaxInput> = {}): ExitTaxInput {
  return {
    marketType: "exit_tax",
    yearsResidentLast10: 10,
    departureDate: utc(2027, 1, 1),
    isMajorShareholder: true,
    holdings,
    deferralRequested: false,
    deferralReason: "none",
    foreignTaxExclusionReason: "none",
    hasFiledHoldingsReport: true,
    reenteredWithin5Years: false,
    ...over,
  } as ExitTaxInput;
}

/** F1 실제 양도 1,200,000/주 (외화 1,000 × 기준환율 1,200) */
const f1Sold = (shareCount: number, extra: object = {}) => ({
  shareCount,
  priceForeign: 1_000,
  exchangeRate: 1_200,
  ...extra,
});

function expectInvalid(fn: () => unknown, messagePart?: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(TaxCalculationError);
    expect((e as TaxCalculationError).code).toBe(TaxErrorCode.INVALID_INPUT);
    if (messagePart) expect((e as TaxCalculationError).message).toContain(messagePart);
    return;
  }
  throw new Error("INVALID_INPUT 이어야 한다");
}

describe("K-16 — 2호 단독 · 종목별 실제 양도", () => {
  it("2호나목 20%: 하락 200,000,000 → 조정공제 40,000,000 (183,500,000 − 143,500,000)", () => {
    const r = calculateExitTax(input([f1({ actualTransfer: f1Sold(1_000) })]));
    expect(r.incomeTax).toBe(183_500_000);
    expect(r.adjustmentDeduction).toBe(40_000_000);
    expect(r.finalTaxAfterAdjustment).toBe(143_500_000);
    // 종목 echo — 양도 주수·출국일 시가·필요경비·양도가액·하락분
    const echo = r.holdingDetails[0].actualTransfer;
    expect(echo).toMatchObject({
      soldShareCount: 1_000,
      departureValueSold: 1_400_000_000,
      acquisitionCostSold: 480_000_000,
      actualTransferValue: 1_200_000_000,
      priceDrop: 200_000_000,
    });
  });

  it("2호가목 10%(내국법인 해외상장 중소): 같은 하락 → 조정공제 20,000,000", () => {
    const r = calculateExitTax(
      input([f1({ isListedForeignCorp: false, isSmallMediumEnterprise: true, actualTransfer: f1Sold(1_000) })]),
    );
    expect(r.incomeTax).toBe(91_750_000);
    expect(r.adjustmentDeduction).toBe(20_000_000);
    expect(r.finalTaxAfterAdjustment).toBe(71_750_000);
  });

  it("실제 양도가 ≥ 출국일 시가 → 조정공제 0", () => {
    const r = calculateExitTax(
      input([f1({ actualTransfer: { shareCount: 1_000, priceForeign: 1_200, exchangeRate: 1_200 } })]),
    );
    expect(r.adjustmentDeduction).toBe(0);
    expect(r.finalTaxAfterAdjustment).toBe(183_500_000);
  });
});

describe("부분 양도 — 양도한 주수만 계산한다", () => {
  it("F1 1,000주 중 400주 → 하락 80,000,000 · 조정공제 16,000,000", () => {
    const r = calculateExitTax(input([f1({ actualTransfer: f1Sold(400) })]));
    expect(r.incomeTax).toBe(183_500_000);
    expect(r.adjustmentDeduction).toBe(16_000_000);
    expect(r.finalTaxAfterAdjustment).toBe(167_500_000);
    expect(r.holdingDetails[0].actualTransfer).toMatchObject({
      soldShareCount: 400,
      departureValueSold: 560_000_000,
      acquisitionCostSold: 192_000_000,
      actualTransferValue: 480_000_000,
      priceDrop: 80_000_000,
    });
  });

  it("양도 주수 > 보유 주수 / 0 / 소수 → INVALID_INPUT", () => {
    expectInvalid(() => calculateExitTax(input([f1({ actualTransfer: f1Sold(1_001) })])), "보유");
    expectInvalid(() => calculateExitTax(input([f1({ actualTransfer: f1Sold(0) })])));
    expectInvalid(() => calculateExitTax(input([f1({ actualTransfer: f1Sold(10.5) })])));
  });

  it("actualTransfer가 없는 종목은 양도하지 않은 것 — 조정공제에 섞이지 않는다", () => {
    // H1은 양도하지 않음. F1만 양도(하락 200,000,000) → 2호나목 40,000,000
    const r = calculateExitTax(
      input([h1(), f1({ actualTransfer: f1Sold(1_000) })], {
        basicDeductionAllocation: { clause1: 2_500_000, clause2b: 0 },
      }),
    );
    expect(r.adjustmentDeduction).toBe(40_000_000);
    expect(r.holdingDetails.find((d) => d.id === "h1")?.actualTransfer).toBeUndefined();
  });
});

describe("혼합 조정공제 (V-7) — 구분별 세율", () => {
  const mixed = () =>
    input(
      [
        h1({ actualTransfer: { shareCount: 10_000, pricePerShare: 40_000 } }),
        f1({ actualTransfer: f1Sold(1_000) }),
      ],
      { basicDeductionAllocation: { clause1: 2_500_000, clause2b: 0 } },
    );

  it("1호 24,875,000 + 2호나목 40,000,000 = 64,875,000", () => {
    const r = calculateExitTax(mixed());
    expect(r.incomeTax).toBe(268_375_000);
    expect(r.adjustmentDeduction).toBe(64_875_000);
    expect(r.finalTaxAfterAdjustment).toBe(203_500_000);
    const b1 = r.bucketDetails!.find((b) => b.bucket === "clause1")!;
    const b2 = r.bucketDetails!.find((b) => b.bucket === "clause2b")!;
    expect(b1.adjustmentDeduction).toBe(24_875_000);
    expect(b2.adjustmentDeduction).toBe(40_000_000);
  });

  it("«확인 필요» 고지 — 구분별 세율 · 환산 기준일", () => {
    const r = calculateExitTax(mixed());
    expect(r.warnings.some((w) => w.includes("구분별") && w.includes("조정공제") && w.includes("확인 필요"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("실제 양도일") && w.includes("환산 기준일") && w.includes("확인 필요"))).toBe(true);
  });
});

describe("외국납부세액공제 (V-8) — 종목별 안분 · 한도는 총액", () => {
  it("H1(실양도 60,000 > 시가 → 안분 0.8) 10,000,000 + F1(조정공제 구간 → 1.0) 30,000,000 = 38,000,000", () => {
    // H1: 시가 500,000,000 · 양도 600,000,000 · 필요경비 100,000,000 → 분자 400,000,000 / 분모 500,000,000
    //     10,000,000 × 400/500 = 8,000,000
    // F1: 양도 1,200,000,000 < 시가 → 분자 = 분모 → 30,000,000
    // 한도 = 268,375,000 − 조정공제(F1 40,000,000) = 228,375,000 → 미달
    const r = calculateExitTax(
      input(
        [
          h1({ actualTransfer: { shareCount: 10_000, pricePerShare: 60_000, foreignTaxPaid: 10_000_000 } }),
          f1({ actualTransfer: f1Sold(1_000, { foreignTaxPaid: 30_000_000 }) }),
        ],
        { basicDeductionAllocation: { clause1: 2_500_000, clause2b: 0 } },
      ),
    );
    expect(r.adjustmentDeduction).toBe(40_000_000);
    expect(r.foreignTaxCreditApplied).toBe(38_000_000);
    expect(r.finalTaxAfterAdjustment).toBe(268_375_000 - 40_000_000 - 38_000_000);
    expect(r.foreignTaxPaidKrw).toBe(40_000_000);
  });

  it("한도 = 산출세액 − 조정공제액 (총액) — 초과분은 공제하지 않는다", () => {
    const r = calculateExitTax(
      input([f1({ actualTransfer: f1Sold(1_000, { foreignTaxPaid: 500_000_000 }) })]),
    );
    expect(r.foreignTaxCreditApplied).toBe(143_500_000);
    expect(r.finalTaxAfterAdjustment).toBe(0);
  });

  it("외화 납부세액 + 기준환율은 toKrwExact로 환산한다", () => {
    const r = calculateExitTax(
      input([
        f1({
          actualTransfer: f1Sold(1_000, {
            foreignTaxPaidForeign: 10_000,
            foreignTaxExchangeRate: 1_300.1,
          }),
        }),
      ]),
    );
    // 10,000 × 1,300.1 = 13,001,000 (float 곱은 13,000,999.999…)
    expect(r.foreignTaxPaidKrw).toBe(13_001_000);
    expect(r.foreignTaxCreditApplied).toBe(13_001_000);
  });

  it("§118의13② 배제 사유(step_up)이면 0", () => {
    const r = calculateExitTax(
      input([f1({ actualTransfer: f1Sold(1_000, { foreignTaxPaid: 30_000_000 }) })], {
        foreignTaxExclusionReason: "step_up",
      }),
    );
    expect(r.foreignTaxCreditApplied).toBe(0);
  });

  it("원화 납부세액과 외화 납부세액을 한 종목에 같이 넣으면 INVALID_INPUT (조용한 우선순위 없음)", () => {
    expectInvalid(() =>
      calculateExitTax(
        input([
          f1({
            actualTransfer: f1Sold(1_000, {
              foreignTaxPaid: 1_000,
              foreignTaxPaidForeign: 1,
              foreignTaxExchangeRate: 1_000,
            }),
          }),
        ]),
      ),
    );
  });
});

describe("외화 실제 양도가 환산 (V-9) — toKrwExact 1원 정밀도", () => {
  it("10,000 × 기준환율 1,300.1 × 40주 = 520,040,000 (float은 520,039,999)", () => {
    // 외화판 F: 시가 11,000 × 1,300 × 40 = 572,000,000 · 취득 5,000 × 1,200 × 40 = 240,000,000 · 차익 332,000,000
    // 과세표준 329,500,000 · 2호나목 65,900,000. 하락 = 572,000,000 − 520,040,000 = 51,960,000
    // 과세표준 277,540,000 → 55,508,000 · 조정공제 10,392,000 (float이면 10,392,001)
    const fx = f1({
      shareCount: 40,
      perShareAcquisitionPrice: 0,
      departureDayValuationMode: "foreign_market_price",
      departureDayMarketPrice: undefined,
      departureDayPriceForeign: 11_000,
      departureExchangeRate: 1_300,
      perShareAcquisitionPriceForeign: 5_000,
      acquisitionExchangeRate: 1_200,
      actualTransfer: { shareCount: 40, priceForeign: 10_000, exchangeRate: 1_300.1 },
    });
    const r = calculateExitTax(input([fx]));
    expect(r.incomeTax).toBe(65_900_000);
    expect(r.holdingDetails[0].actualTransfer?.actualTransferValue).toBe(520_040_000);
    expect(r.adjustmentDeduction).toBe(10_392_000);
  });
});

describe("§118의14 비거주자 세액공제 (V-14) — §119 11호 가목(내국법인 발행)만", () => {
  it("1호(내국법인) 종목 원천징수액은 공제 — 한도는 산출세액 − 조정공제", () => {
    const r = calculateExitTax(
      input([h1({ actualTransfer: { shareCount: 10_000, pricePerShare: 40_000, domesticSourceTaxWithheld: 5_000_000 } })]),
    );
    // 1호: TB 397,500,000 → 84,375,000 / 하락 100,000,000 → 297,500,000 → 59,500,000 · 조정공제 24,875,000
    expect(r.adjustmentDeduction).toBe(24_875_000);
    expect(r.domesticTaxCreditApplied).toBe(5_000_000);
    expect(r.finalTaxAfterAdjustment).toBe(84_375_000 - 24_875_000 - 5_000_000);
  });

  it("2호 중 내국법인 발행(isListedForeignCorp=false)은 공제", () => {
    const r = calculateExitTax(
      input([
        f1({
          isListedForeignCorp: false,
          actualTransfer: f1Sold(1_000, { domesticSourceTaxWithheld: 7_000_000 }),
        }),
      ]),
    );
    expect(r.domesticTaxCreditApplied).toBe(7_000_000);
  });

  it("2호 중 외국법인 발행(기본값 true)에 원천징수액을 넣으면 INVALID_INPUT — 근거 불명확이라 차단", () => {
    expectInvalid(
      () => calculateExitTax(input([f1({ actualTransfer: f1Sold(1_000, { domesticSourceTaxWithheld: 7_000_000 }) })])),
      "§119",
    );
  });

  it("§118의14② — 비거주자 공제를 하면 외국납부세액공제는 적용하지 않는다", () => {
    const r = calculateExitTax(
      input([
        h1({
          actualTransfer: {
            shareCount: 10_000,
            pricePerShare: 40_000,
            domesticSourceTaxWithheld: 5_000_000,
            foreignTaxPaid: 3_000_000,
          },
        }),
      ]),
    );
    expect(r.domesticTaxCreditApplied).toBe(5_000_000);
    expect(r.foreignTaxCreditApplied).toBe(0);
  });
});

describe("호환 · 차단", () => {
  it("전역 입력 + 종목별 입력 동시 → INVALID_INPUT", () => {
    expectInvalid(
      () =>
        calculateExitTax(
          input([f1({ actualTransfer: f1Sold(1_000) })], { actualTransferPricePerShare: 1_200_000 }),
        ),
      "동시",
    );
    expectInvalid(() =>
      calculateExitTax(input([f1({ actualTransfer: f1Sold(1_000) })], { foreignTaxPaid: 1_000 })),
    );
  });

  it("2호 과세 종목 + 전역 입력은 종전처럼 차단하고 종목별 입력을 안내한다", () => {
    expectInvalid(
      () => calculateExitTax(input([f1()], { actualTransferPricePerShare: 1_200_000 })),
      "종목별",
    );
  });

  it("국내 종목에 외화 양도가, 국외 종목에 원화 양도가 → INVALID_INPUT", () => {
    expectInvalid(() =>
      calculateExitTax(input([h1({ actualTransfer: { shareCount: 10, priceForeign: 1, exchangeRate: 1_000 } })])),
    );
    expectInvalid(() =>
      calculateExitTax(input([f1({ actualTransfer: { shareCount: 10, pricePerShare: 1_000_000 } })])),
    );
  });

  it("외화 양도가에 환율이 없으면 INVALID_INPUT (자동 보정 없음)", () => {
    expectInvalid(() => calculateExitTax(input([f1({ actualTransfer: { shareCount: 10, priceForeign: 1 } })])));
  });

  it("제외된 종목(국외 합계 5억 이하)에 실제 양도를 넣으면 INVALID_INPUT — 조용히 무시하지 않는다", () => {
    const small = f1({ shareCount: 100, actualTransfer: { shareCount: 10, priceForeign: 1_000, exchangeRate: 1_200 } });
    expectInvalid(() => calculateExitTax(input([small])), "제외");
  });

  it("실제 양도일이 출국일보다 앞 → INVALID_INPUT", () => {
    expectInvalid(() =>
      calculateExitTax(input([f1({ actualTransfer: f1Sold(1_000, { transferDate: utc(2026, 12, 31) }) })])),
    );
  });

  it("기존 전역 입력은 그대로 — 교재 갑 41,875,000 (2026-09-01 출국 · 양도 2027-03-01)", () => {
    const r = calculateExitTax(
      input([h1()], {
        departureDate: utc(2026, 9, 1),
        deferralRequested: true,
        actualTransferDate: utc(2027, 3, 1),
        actualTransferPricePerShare: 45_000,
        foreignTaxPaid: 30_000_000,
      }),
    );
    expect(r.adjustmentDeduction).toBe(12_500_000);
    expect(r.finalTaxAfterAdjustment).toBe(41_875_000);
  });
});
