/**
 * 국외전출세 2027.1.1. 개정 — PR-3: 외화·환율 정수 환산 anchor
 *
 * 계획서: docs/02-design/features/stock-transfer-exit-tax-2027.engine.plan.md §3.4·§4(K-9·K-10)
 * 수치는 전부 손계산이다(엔진 실행값 복사 아님).
 *
 *   K-9   10,000주 × $40 × 환율 1,300.10 → 520,040,000 (부동소수 곱은 520,039,999 — 1원 과소)
 *   K-5fx F1 1,000주: 출국일 $1,000 × 1,400 = 1,400,000,000 · 취득 $400 × 1,200 = 480,000,000
 *         차익 920,000,000 → 과세표준 917,500,000 × 20% = 183,500,000 (PR-2 K-5 원화 경로와 같은 값)
 *   K-10  취득도 출국일 환율(1,400)로 환산하면 취득 560,000,000 · 차익 840,000,000 ·
 *         과세표준 837,500,000 × 20% = 167,500,000 → K-5fx와 16,000,000 차(환율 기준일 쟁점, anchor 아님)
 *   경계  1,000주 × $236.58 × 2,113.45 = 500,000,001 (정확값) — double 곱은 500,000,000이라 제외로 오판
 */

import { describe, it, expect } from "vitest";
import { calculateExitTax } from "@/lib/tax-engine/stock-transfer/exit-tax";
import { toKrwExact } from "@/lib/tax-engine/stock-transfer/exit-tax-fx";
import type { ExitTaxHolding, ExitTaxInput } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

/** 국외주식 외화 경로 — F1: 1,000주 · 출국일 $1,000 × 1,400 · 취득 $400 × 1,200 */
function fxHolding(over: Partial<ExitTaxHolding> = {}): ExitTaxHolding {
  return {
    id: "f1",
    stockName: "F1 국외주식",
    marketType: "foreign_stock",
    isListedForeignCorp: true,
    foreignCurrencyCode: "USD",
    shareCount: 1_000,
    acquisitionDate: utc(2018, 1, 1),
    perShareAcquisitionPrice: 0,
    departureDayValuationMode: "foreign_market_price",
    departureDayPriceForeign: 1_000,
    departureExchangeRate: 1_400,
    perShareAcquisitionPriceForeign: 400,
    acquisitionExchangeRate: 1_200,
    ...over,
  };
}

function domestic(over: Partial<ExitTaxHolding> = {}): ExitTaxHolding {
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

function input(departure: Date, holdings: ExitTaxHolding[], over: Partial<ExitTaxInput> = {}): ExitTaxInput {
  return {
    marketType: "exit_tax",
    yearsResidentLast10: 10,
    departureDate: departure,
    isMajorShareholder: true,
    holdings,
    deferralRequested: false,
    deferralReason: "none",
    foreignTaxExclusionReason: "none",
    hasFiledHoldingsReport: true,
    reenteredWithin5Years: false,
    ...over,
  };
}

function expectInvalid(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(TaxCalculationError);
    expect((e as TaxCalculationError).code).toBe(TaxErrorCode.INVALID_INPUT);
    return e as TaxCalculationError;
  }
  throw new Error("차단되어야 한다");
}

describe("toKrwExact — 정수 스케일 환산 (K-9)", () => {
  it("K-9 10,000 × 40 × 1,300.10 = 520,040,000 (부동소수 곱은 520,039,999)", () => {
    expect(Math.floor(10_000 * 40 * 1300.1)).toBe(520_039_999); // 함정 실측 — 이 값이 바뀌면 전제가 깨진 것
    expect(toKrwExact(10_000 * 40, 1300.1)).toBe(520_040_000);
    expect(toKrwExact(40, 1300.1, 10_000)).toBe(520_040_000); // 단가 × 주수를 안에서 곱해도 같다
  });

  it("원 미만 절사 — 소수 4자리 환율·소수 단가", () => {
    // 123.45 × 1,234.5678 = 152,407.394910 → × 1,000주 = 152,407,394.91 → 절사 152,407,394
    expect(toKrwExact(123.45, 1234.5678, 1_000)).toBe(152_407_394);
    // 0.1 × 3 은 double로 0.30000000000000004 — 단가×수량을 BigInt로 곱해 300원 정확
    expect(toKrwExact(0.1, 1_000, 3)).toBe(300);
    expect(toKrwExact(1, 1_000.9999)).toBe(1_000); // 절사(반올림 아님)
  });

  it("금액 0은 0, 정수 환율도 그대로", () => {
    expect(toKrwExact(0, 1_400)).toBe(0);
    expect(toKrwExact(1_000, 1_400)).toBe(1_400_000);
  });

  it("소수 5자리 이상·비유한·0 이하 환율 → INVALID_INPUT", () => {
    expectInvalid(() => toKrwExact(100, 1300.12345));
    expectInvalid(() => toKrwExact(100, Number.NaN));
    expectInvalid(() => toKrwExact(100, Number.POSITIVE_INFINITY));
    expectInvalid(() => toKrwExact(100, 0));
    expectInvalid(() => toKrwExact(100, -1_300));
  });

  it("음수·비유한 금액, 0 이하·비정수 수량, 안전정수 밖 결과 → INVALID_INPUT", () => {
    expectInvalid(() => toKrwExact(-1, 1_300));
    expectInvalid(() => toKrwExact(Number.NaN, 1_300));
    expectInvalid(() => toKrwExact(100, 1_300, 0));
    expectInvalid(() => toKrwExact(100, 1_300, 1.5));
    expectInvalid(() => toKrwExact(1e15, 1_300));
  });
});

describe("외화 경로 — 2호 단일 구분 (K-5fx · K-6fx · K-9 · K-10)", () => {
  it("K-5fx F1만 외화 입력 · 2027-01-01 → PR-2 원화 경로와 같은 183,500,000", () => {
    const r = calculateExitTax(input(utc(2027, 1, 1), [fxHolding()]));
    const h = r.holdingDetails[0];
    expect(h.departureDayValue).toBe(1_400_000_000);
    expect(h.acquisitionCost).toBe(480_000_000);
    expect(h.transferGain).toBe(920_000_000);
    expect(h.valuationMode).toBe("foreign_market_price");
    expect(h.scope).toBe("taxed");
    expect(h.rateBucket).toBe("clause2b");
    expect(r.taxBase).toBe(917_500_000);
    expect(r.incomeTax).toBe(183_500_000);
    expect(r.appliedRate).toBe(0.2);
  });

  it("fx echo — 통화·외화 단가·환율·환산 원화 금액", () => {
    const h = calculateExitTax(input(utc(2027, 1, 1), [fxHolding()])).holdingDetails[0];
    expect(h.fx).toEqual({
      currency: "USD",
      departureForeign: 1_000,
      departureRate: 1_400,
      departureValueKrw: 1_400_000_000,
      acquisitionForeign: 400,
      acquisitionRate: 1_200,
      acquisitionCostKrw: 480_000_000,
    });
    // 1주당 시가는 표시용 환산 단가(절사)
    expect(h.departureDayValuePerShare).toBe(1_400_000);
  });

  it("환산 기준일 «확인 필요» 고지 + 근거 규칙", () => {
    const r = calculateExitTax(input(utc(2027, 1, 1), [fxHolding()]));
    expect(r.warnings.some((w) => w.includes("환산 기준일은 법령") && w.includes("확인 필요"))).toBe(true);
  });

  it("K-6fx 내국법인 해외상장 중소기업 외화 입력 → 가목 10% = 91,750,000", () => {
    const r = calculateExitTax(
      input(utc(2027, 1, 1), [fxHolding({ isListedForeignCorp: false, isSmallMediumEnterprise: true })]),
    );
    expect(r.incomeTax).toBe(91_750_000);
    expect(r.holdingDetails[0].rateBucket).toBe("clause2a");
  });

  it("K-9 10,000주 × $40 × 1,300.10 / 취득 $20 × 1,250.50 → 520,040,000 · 250,100,000 · 53,488,000", () => {
    const r = calculateExitTax(
      input(utc(2027, 1, 1), [
        fxHolding({
          shareCount: 10_000,
          departureDayPriceForeign: 40,
          departureExchangeRate: 1300.1,
          perShareAcquisitionPriceForeign: 20,
          acquisitionExchangeRate: 1250.5,
        }),
      ]),
    );
    const h = r.holdingDetails[0];
    expect(h.departureDayValue).toBe(520_040_000); // double 곱이면 520,039,999
    expect(h.acquisitionCost).toBe(250_100_000);
    expect(h.transferGain).toBe(269_940_000);
    expect(r.taxBase).toBe(267_440_000); // 269,940,000 − 2,500,000
    expect(r.incomeTax).toBe(53_488_000); // × 20%
  });

  it("K-10 취득일 환율(1,200)과 출국일 환율(1,400)은 세액이 16,000,000 갈린다 — 취득 환율은 취득일 값을 쓴다", () => {
    const main = calculateExitTax(input(utc(2027, 1, 1), [fxHolding()]));
    const altBothDepartureRate = calculateExitTax(
      input(utc(2027, 1, 1), [fxHolding({ acquisitionExchangeRate: 1_400 })]),
    );
    expect(main.incomeTax).toBe(183_500_000);
    expect(altBothDepartureRate.holdingDetails[0].acquisitionCost).toBe(560_000_000);
    expect(altBothDepartureRate.taxBase).toBe(837_500_000);
    expect(altBothDepartureRate.incomeTax).toBe(167_500_000);
    expect(main.incomeTax - altBothDepartureRate.incomeTax).toBe(16_000_000);
  });

  it("foreign_decree_178_3 — 같은 환산 + §178의9②3호 근거", () => {
    const r = calculateExitTax(
      input(utc(2027, 1, 1), [fxHolding({ departureDayValuationMode: "foreign_decree_178_3" })]),
    );
    expect(r.holdingDetails[0].valuationMode).toBe("foreign_decree_178_3");
    expect(r.incomeTax).toBe(183_500_000);
    expect(r.appliedRules).toContain("소득세법 시행령 §178의9②3호");
    const marketMode = calculateExitTax(input(utc(2027, 1, 1), [fxHolding()]));
    expect(marketMode.appliedRules).not.toContain("소득세법 시행령 §178의9②3호");
  });

  it("종목당 총액 1회 절사 — 단가 환산 합이 아니라 총액을 곱한다", () => {
    // 2주 × $1.0005 × 1,000 = 2,001 (총액에서 1회 절사) — 단가 환산을 먼저 절사하면 1,000 × 2 = 2,000
    const r = calculateExitTax(
      input(utc(2027, 1, 1), [fxHolding({ shareCount: 2, departureDayPriceForeign: 1.0005, departureExchangeRate: 1_000 })]),
    );
    expect(r.holdingDetails[0].departureDayValue).toBe(2_001);
  });
});

describe("영 §178의8②1호 5억 경계 — 환산한 원화 정수로 판정", () => {
  it("1,000주 × $236.58 × 2,113.45 = 500,000,001 → 과세 (double 곱 500,000,000이면 제외로 오판)", () => {
    expect(Math.floor(1_000 * 236.58 * 2113.45)).toBe(500_000_000); // 함정 실측
    const r = calculateExitTax(
      input(utc(2027, 1, 1), [
        fxHolding({
          departureDayPriceForeign: 236.58,
          departureExchangeRate: 2113.45,
          perShareAcquisitionPriceForeign: 100,
          acquisitionExchangeRate: 1_000,
        }),
      ]),
    );
    expect(r.holdingDetails[0].departureDayValue).toBe(500_000_001);
    expect(r.holdingDetails[0].scope).toBe("taxed");
    expect(r.foreignExclusion?.applied).toBe(false);
    expect(r.foreignExclusion?.foreignDepartureValueTotal).toBe(500_000_001);
    // 차익 500,000,001 − 100,000,000 = 400,000,001 → 과세표준 397,500,001 → 20% 절사 79,500,000
    expect(r.taxBase).toBe(397_500_001);
    expect(r.incomeTax).toBe(79_500_000);
  });

  it("1,000주 × $250 × 2,000 = 500,000,000 정확히 → 「이하」라 제외 · not_liable", () => {
    const r = calculateExitTax(
      input(utc(2027, 1, 1), [
        fxHolding({ departureDayPriceForeign: 250, departureExchangeRate: 2_000, perShareAcquisitionPriceForeign: 100 }),
      ]),
    );
    expect(r.taxCategory).toBe("not_liable");
    expect(r.holdingDetails[0].excludedReason).toBe("foreign_total_le_500m");
    expect(r.foreignExclusion?.foreignDepartureValueTotal).toBe(500_000_000);
    expect(r.totalTax).toBe(0);
  });

  it("국내 1호 + 외화 국외 종목 — 제외된 국외분은 1호 세액에 안 섞인다 (K-8 외화판)", () => {
    // F2: 1,000주 × $200 × 2,000 = 400,000,000 (≤ 5억) → 제외, H1 단독 84,375,000
    const r = calculateExitTax(
      input(utc(2027, 1, 1), [
        domestic(),
        fxHolding({ id: "f2", departureDayPriceForeign: 200, departureExchangeRate: 2_000, perShareAcquisitionPriceForeign: 100 }),
      ]),
    );
    expect(r.incomeTax).toBe(84_375_000);
    expect(r.holdingDetails.find((h) => h.id === "f2")?.scope).toBe("excluded");
    expect(r.holdingDetails.find((h) => h.id === "f2")?.fx?.departureValueKrw).toBe(400_000_000);
    expect(r.holdingDetails.find((h) => h.id === "h1")?.fx).toBeUndefined();
  });
});

describe("2026 이전 출국 · 원화 경로 — 기존 값 불변", () => {
  it("2026-12-31 출국 + 외화 국외 종목 → 제외 echo(환산값 포함), 1호 세액 불변, 환산 고지 없음", () => {
    const r = calculateExitTax(input(utc(2026, 12, 31), [domestic(), fxHolding()]));
    expect(r.incomeTax).toBe(84_375_000);
    expect(r.totalTax).toBe(92_812_500);
    const f = r.holdingDetails.find((h) => h.id === "f1")!;
    expect(f.scope).toBe("excluded");
    expect(f.excludedReason).toBe("pre2027_foreign_not_covered");
    expect(f.departureDayValue).toBe(1_400_000_000);
    expect(r.warnings.some((w) => w.includes("환산 기준일"))).toBe(false);
  });

  it("국내 종목·원화 단가 국외 종목에는 fx echo가 없다", () => {
    const d = calculateExitTax(input(utc(2026, 9, 1), [domestic()])).holdingDetails[0];
    expect(d.fx).toBeUndefined();
    const f = calculateExitTax(
      input(utc(2027, 1, 1), [
        {
          ...fxHolding(),
          perShareAcquisitionPrice: 480_000,
          departureDayValuationMode: "market_price",
          departureDayMarketPrice: 1_400_000,
          departureDayPriceForeign: undefined,
          departureExchangeRate: undefined,
          perShareAcquisitionPriceForeign: undefined,
          acquisitionExchangeRate: undefined,
        },
      ]),
    );
    expect(f.holdingDetails[0].fx).toBeUndefined();
    expect(f.incomeTax).toBe(183_500_000);
    expect(f.warnings.some((w) => w.includes("환산 기준일"))).toBe(false);
  });
});

describe("차단 — 섞임·누락 (조용한 fallback 금지)", () => {
  const run = (over: Partial<ExitTaxHolding>) => calculateExitTax(input(utc(2027, 1, 1), [fxHolding(over)]));

  it("외화 모드 + 원화 단가 혼용 → INVALID_INPUT", () => {
    expectInvalid(() => run({ departureDayMarketPrice: 1_400_000 }));
    expectInvalid(() => run({ perShareAcquisitionPrice: 480_000 }));
  });

  it("원화 거래가액(market_price) + 외화 필드 혼용 → INVALID_INPUT", () => {
    expectInvalid(() =>
      calculateExitTax(
        input(utc(2027, 1, 1), [
          fxHolding({
            departureDayValuationMode: "market_price",
            departureDayMarketPrice: 1_400_000,
            perShareAcquisitionPrice: 480_000,
          }),
        ]),
      ),
    );
  });

  it("외화 모드인데 외화 단가·환율 4개 중 하나라도 없으면 INVALID_INPUT (0 취급 금지)", () => {
    for (const k of [
      "departureDayPriceForeign",
      "departureExchangeRate",
      "perShareAcquisitionPriceForeign",
      "acquisitionExchangeRate",
    ] as const) {
      const e = expectInvalid(() => run({ [k]: undefined }));
      expect(e.details?.path).toBe(`holdings.f1.${k}`);
    }
  });

  it("환율 0 이하·소수 5자리·음수 단가 → INVALID_INPUT", () => {
    expectInvalid(() => run({ departureExchangeRate: 0 }));
    expectInvalid(() => run({ acquisitionExchangeRate: -1_200 }));
    expectInvalid(() => run({ departureExchangeRate: 1_400.12345 }));
    expectInvalid(() => run({ perShareAcquisitionPriceForeign: -1 }));
  });

  it("국내 종목에 외화 시가 모드·외화 필드 → INVALID_INPUT (시가 0 침묵 방지)", () => {
    expectInvalid(() =>
      calculateExitTax(input(utc(2027, 1, 1), [domestic({ departureDayValuationMode: "foreign_market_price" })])),
    );
    expectInvalid(() =>
      calculateExitTax(input(utc(2026, 9, 1), [domestic({ departureExchangeRate: 1_400 })])),
    );
  });

  it("PR-4·PR-7 차단은 그대로 — 구분 ≥2 · 2호 경정청구 입력", () => {
    expectInvalid(() => calculateExitTax(input(utc(2027, 1, 1), [domestic(), fxHolding()])));
    expectInvalid(() =>
      calculateExitTax(input(utc(2027, 1, 1), [fxHolding()], { actualTransferPricePerShare: 1_200_000 })),
    );
    expectInvalid(() =>
      calculateExitTax(
        input(utc(2027, 1, 1), [
          fxHolding({ id: "a", isListedForeignCorp: false, isSmallMediumEnterprise: true }),
          fxHolding({ id: "b" }),
        ]),
      ),
    );
  });
});
