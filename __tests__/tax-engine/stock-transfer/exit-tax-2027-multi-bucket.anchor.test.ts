/**
 * 국외전출세 2027.1.1. 개정 — PR-4: 세율 구분 2개 이상 (기본공제 배분 입력 · 구분 간 손실 차단 · 구분별 지방소득세)
 *
 * 계획서: docs/02-design/features/stock-transfer-exit-tax-2027.plan.md §2.1(C-1·C-2·C-5) ·
 *         stock-transfer-exit-tax-2027.engine.plan.md K-11·K-12·K-23
 * 수치는 전부 손계산이다(엔진 실행값 복사 아님).
 *
 *   H1 코스닥 10,000주 · 취득 10,000/주 · 시가 50,000/주   → 시가 500,000,000 · 취득 100,000,000 · 차익 400,000,000 (1호)
 *   F1 국외주식(외국법인) 1,000주 · 취득 480,000/주 · 시가 1,400,000/주 → 차익 920,000,000 (2호나목)
 *
 *   K-11 배분 (1호 2,500,000 / 0 / 0)  : 1호 (397,500,000 → 60,000,000 + 97,500,000 × 25% = 84,375,000)
 *                                       + 2호나 (920,000,000 × 20% = 184,000,000) = 268,375,000
 *        배분 (0 / 0 / 2,500,000)      : 1호 (400,000,000 → 85,000,000) + 2호나 (917,500,000 × 20% = 183,500,000) = 268,500,000
 *        → 차이 125,000 = 2,500,000 × (25% − 20%)
 *   K-23 2호가목(10%) 차익 300,000,000 + 2호나목(20%) 차익 300,000,000
 *        배분 (가목 2,500,000 / 나목 0) : 297,500,000 × 10% + 300,000,000 × 20% = 29,750,000 + 60,000,000 = 89,750,000
 *        배분 (가목 0 / 나목 2,500,000) : 300,000,000 × 10% + 297,500,000 × 20% = 30,000,000 + 59,500,000 = 89,500,000
 *        → 차이 250,000 = 2,500,000 × (20% − 10%)
 *   지방소득세(지방세법 §103의3⑧ 표: 3억 이하 2% / 초과 600만원 + 초과액 × 2.5%) 구분별
 *        K-11 (2.5M/0/0): 1호 8,437,500 + 2호나 (6,000,000 + 620,000,000 × 2.5% = 21,500,000) = 29,937,500
 *        K-11 (0/0/2.5M): 1호 8,500,000 + 2호나 (6,000,000 + 617,500,000 × 2.5% = 21,437,500) = 29,937,500
 *        합산 과세표준(1,317,500,000) 직독이면 6,000,000 + 1,017,500,000 × 2.5% = 31,437,500 (참고, 주값 아님)
 */

import { describe, it, expect } from "vitest";
import { calculateExitTax } from "@/lib/tax-engine/stock-transfer/exit-tax";
import type { ExitTaxInput, ExitTaxHolding } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const DEPARTURE = utc(2027, 1, 1);

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

function foreign(over: Partial<ExitTaxHolding> = {}): ExitTaxHolding {
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

/** 2호가목(중소기업·내국법인 해외상장) / 2호나목(그 밖) 각 시가 600,000,000 · 취득 300,000,000 → 차익 300,000,000 */
const f2a = () =>
  foreign({
    id: "f2a",
    stockName: "F2a 중소",
    isListedForeignCorp: false,
    isSmallMediumEnterprise: true,
    shareCount: 1_000,
    perShareAcquisitionPrice: 300_000,
    departureDayMarketPrice: 600_000,
  });
const f2b = () =>
  foreign({
    id: "f2b",
    stockName: "F2b 그 밖",
    isListedForeignCorp: true,
    shareCount: 1_000,
    perShareAcquisitionPrice: 300_000,
    departureDayMarketPrice: 600_000,
  });

function input(holdings: ExitTaxHolding[], over: Partial<ExitTaxInput> = {}): ExitTaxInput {
  return {
    marketType: "exit_tax",
    yearsResidentLast10: 10,
    departureDate: DEPARTURE,
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

function expectInvalid(fn: () => unknown, pathPart?: string) {
  let thrown: unknown;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  expect(thrown).toBeInstanceOf(TaxCalculationError);
  expect((thrown as TaxCalculationError).code).toBe(TaxErrorCode.INVALID_INPUT);
  if (pathPart) {
    expect(JSON.stringify((thrown as TaxCalculationError).details ?? {})).toContain(pathPart);
  }
}

describe("K-11 · 1호 + 2호나목 혼합 — 기본공제 배분 입력에 따라 세액이 갈린다", () => {
  it("배분 (1호 2,500,000 / 0 / 0) → 268,375,000", () => {
    const r = calculateExitTax(
      input([domestic(), foreign()], { basicDeductionAllocation: { clause1: 2_500_000, clause2a: 0, clause2b: 0 } }),
    );
    expect(r.totalTransferGain).toBe(1_320_000_000);
    expect(r.basicDeduction).toBe(2_500_000);
    expect(r.taxBase).toBe(1_317_500_000);
    expect(r.incomeTax).toBe(268_375_000);
    expect(r.bucketDetails).toHaveLength(2);
    const b1 = r.bucketDetails!.find((b) => b.bucket === "clause1")!;
    const b2 = r.bucketDetails!.find((b) => b.bucket === "clause2b")!;
    expect([b1.transferGain, b1.basicDeductionAllocated, b1.taxBase, b1.calculatedTax]).toEqual([
      400_000_000, 2_500_000, 397_500_000, 84_375_000,
    ]);
    expect([b1.appliedRate, b1.progressiveDeduction]).toEqual([0.25, 15_000_000]);
    expect([b2.transferGain, b2.basicDeductionAllocated, b2.taxBase, b2.calculatedTax]).toEqual([
      920_000_000, 0, 920_000_000, 184_000_000,
    ]);
    expect([b2.appliedRate, b2.progressiveDeduction]).toEqual([0.2, 0]);
    expect(r.basicDeductionBasis).toBe("user_allocation");
  });

  it("배분 (0 / 0 / 2호나 2,500,000) → 268,500,000 — 위와 125,000 차이", () => {
    const r = calculateExitTax(
      input([domestic(), foreign()], { basicDeductionAllocation: { clause1: 0, clause2a: 0, clause2b: 2_500_000 } }),
    );
    expect(r.incomeTax).toBe(268_500_000);
    const b1 = r.bucketDetails!.find((b) => b.bucket === "clause1")!;
    expect([b1.taxBase, b1.calculatedTax]).toEqual([400_000_000, 85_000_000]);
    expect(r.bucketDetails!.find((b) => b.bucket === "clause2b")!.calculatedTax).toBe(183_500_000);
    expect(268_500_000 - 268_375_000).toBe(125_000);
  });

  it("지방소득세 — 구분별 표 직독이 주값, 소득세 10%가 참고값 (C-5)", () => {
    const a = calculateExitTax(
      input([domestic(), foreign()], { basicDeductionAllocation: { clause1: 2_500_000, clause2b: 0 } }),
    );
    expect(a.localIncomeTax).toBe(29_937_500);
    expect(a.localIncomeTaxAlternative).toBe(26_837_500);
    expect(a.finalTax).toBe(268_375_000);
    expect(a.totalTax).toBe(268_375_000 + 29_937_500);
    const b = calculateExitTax(
      input([domestic(), foreign()], { basicDeductionAllocation: { clause1: 0, clause2b: 2_500_000 } }),
    );
    expect(b.localIncomeTax).toBe(29_937_500);
    expect(b.localIncomeTaxAlternative).toBe(26_850_000);
  });

  it("결과 고지 — 배분 규정 없음 · 구분별/합산 지방소득세 · 1호 3억 구간 기준은 «확인 필요»", () => {
    const r = calculateExitTax(
      input([domestic(), foreign()], { basicDeductionAllocation: { clause1: 2_500_000, clause2b: 0 } }),
    );
    const joined = r.warnings.join("\n");
    expect(joined).toContain("배분 규정이 없어 입력값 기준");
    expect(joined).toContain("31,437,500"); // 합산 과세표준 직독 참고값
    expect(joined).toContain("3억원 구간");
  });

  it("구분이 둘 이상이면 단일 세율 echo 는 0 (서식은 bucketDetails 를 읽는다)", () => {
    const r = calculateExitTax(
      input([domestic(), foreign()], { basicDeductionAllocation: { clause1: 2_500_000, clause2b: 0 } }),
    );
    expect(r.appliedRate).toBe(0);
    expect(r.progressiveDeduction).toBe(0);
  });
});

describe("K-23 · 2호가목(10%) + 2호나목(20%) 혼합", () => {
  it("배분 (가목 2,500,000 / 나목 0) → 89,750,000", () => {
    const r = calculateExitTax(
      input([f2a(), f2b()], { basicDeductionAllocation: { clause2a: 2_500_000, clause2b: 0 } }),
    );
    expect(r.incomeTax).toBe(89_750_000);
    expect(r.taxBase).toBe(597_500_000);
    // 지방소득세: 가목 297,500,000 × 2% = 5,950,000 + 나목 300,000,000 × 2% = 6,000,000
    expect(r.localIncomeTax).toBe(11_950_000);
    expect(r.localIncomeTaxAlternative).toBe(8_975_000);
  });

  it("배분 (가목 0 / 나목 2,500,000) → 89,500,000 — 위와 250,000 차이", () => {
    const r = calculateExitTax(
      input([f2a(), f2b()], { basicDeductionAllocation: { clause2a: 0, clause2b: 2_500_000 } }),
    );
    expect(r.incomeTax).toBe(89_500_000);
  });

  it("구분 안 종목 간 통산은 유지 — 2호나목 종목 둘(차익 +300,000,000 / −100,000,000)은 합산 200,000,000", () => {
    const loss = foreign({
      id: "f2c",
      isListedForeignCorp: true,
      shareCount: 1_000,
      perShareAcquisitionPrice: 700_000,
      departureDayMarketPrice: 600_000,
    });
    const r = calculateExitTax(
      input([f2a(), f2b(), loss], { basicDeductionAllocation: { clause2a: 0, clause2b: 2_500_000 } }),
    );
    const b2b = r.bucketDetails!.find((b) => b.bucket === "clause2b")!;
    expect(b2b.transferGain).toBe(200_000_000);
    expect(b2b.taxBase).toBe(197_500_000);
    expect(b2b.calculatedTax).toBe(39_500_000);
  });
});

describe("C-1 · 배분 입력 검증 (자동 안분 fallback 금지)", () => {
  const two = () => [domestic(), foreign()];

  it("구분 ≥2 + 배분 미입력 → INVALID_INPUT", () => {
    expectInvalid(() => calculateExitTax(input(two())), "basicDeductionAllocation");
  });

  it("합계가 2,500,000 이 아니면 → INVALID_INPUT (±1원)", () => {
    expectInvalid(() =>
      calculateExitTax(input(two(), { basicDeductionAllocation: { clause1: 2_499_999, clause2b: 0 } })),
    );
    expectInvalid(() =>
      calculateExitTax(input(two(), { basicDeductionAllocation: { clause1: 2_500_000, clause2b: 1 } })),
    );
    expectInvalid(() =>
      calculateExitTax(input(two(), { basicDeductionAllocation: { clause1: 0, clause2b: 0 } })),
    );
  });

  it("합계가 2,500,000 이면 각 구분에 나눠도 통과 (1,000,000 + 1,500,000)", () => {
    const r = calculateExitTax(
      input(two(), { basicDeductionAllocation: { clause1: 1_000_000, clause2b: 1_500_000 } }),
    );
    expect(r.basicDeduction).toBe(2_500_000);
    expect(r.incomeTax).toBe(60_000_000 + Math.floor((400_000_000 - 1_000_000 - 300_000_000) * 0.25) + Math.floor((920_000_000 - 1_500_000) * 0.2));
  });

  it("과세 대상이 아닌 구분(2호가목)에 금액을 넣으면 → INVALID_INPUT", () => {
    expectInvalid(
      () =>
        calculateExitTax(
          input(two(), { basicDeductionAllocation: { clause1: 2_000_000, clause2a: 500_000, clause2b: 0 } }),
        ),
      "clause2a",
    );
  });

  it("음수·비정수·비유한 → INVALID_INPUT", () => {
    for (const bad of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectInvalid(() =>
        calculateExitTax(
          input(two(), { basicDeductionAllocation: { clause1: 2_500_000 - bad, clause2b: bad } }),
        ),
      );
    }
  });

  it("과세 구분의 값이 빠져 있으면(undefined) 0 으로 채우지 않고 → INVALID_INPUT", () => {
    expectInvalid(
      () => calculateExitTax(input(two(), { basicDeductionAllocation: { clause1: 2_500_000 } })),
      "clause2b",
    );
  });

  it("배분액이 그 구분 양도소득금액을 넘으면 → INVALID_INPUT (구분 소득금액 한도)", () => {
    // 1호 차익 400,000,000 은 넘지 않지만, 2호나목 차익이 1,000,000 인 경우 2,500,000 배분은 초과
    const small = foreign({ perShareAcquisitionPrice: 1_399_000, departureDayMarketPrice: 1_400_000 });
    expect(small.shareCount * (1_400_000 - 1_399_000)).toBe(1_000_000);
    expectInvalid(
      () =>
        calculateExitTax(input([domestic(), small], { basicDeductionAllocation: { clause1: 0, clause2b: 2_500_000 } })),
      "clause2b",
    );
    // 같은 입력에서 1호에 몰아주면 통과
    const r = calculateExitTax(
      input([domestic(), small], { basicDeductionAllocation: { clause1: 2_500_000, clause2b: 0 } }),
    );
    expect(r.basicDeduction).toBe(2_500_000);
  });

  it("합산 양도소득금액이 2,500,000 미만이면 합계는 그 금액(min) — 구분별 한도와 모순되지 않는다", () => {
    // 1호 차익 1,000,000 + 2호나 차익 1,000,000 → 합계 2,000,000 → 공제 합계 2,000,000
    const h = domestic({ perShareAcquisitionPrice: 49_900 }); // 10,000주 × 100 = 1,000,000
    const f = foreign({ perShareAcquisitionPrice: 1_399_000 }); // 1,000주 × 1,000 = 1,000,000
    // 5억 이하 제외를 피하려고 국외 시가는 1,400,000,000 그대로
    const r = calculateExitTax(
      input([h, f], { basicDeductionAllocation: { clause1: 1_000_000, clause2b: 1_000_000 } }),
    );
    expect(r.totalTransferGain).toBe(2_000_000);
    expect(r.basicDeduction).toBe(2_000_000);
    expect(r.taxBase).toBe(0);
    expectInvalid(() =>
      calculateExitTax(input([h, f], { basicDeductionAllocation: { clause1: 2_500_000, clause2b: 0 } })),
    );
  });
});

describe("C-1 · 구분이 1개이면 자동(법문 직접) — 입력이 들어오면 무시하지 않고 검증", () => {
  it("1호만 + 배분 미입력 → 종전과 같다 (397,500,000 → 84,375,000)", () => {
    const r = calculateExitTax(input([domestic()]));
    expect(r.taxBase).toBe(397_500_000);
    expect(r.incomeTax).toBe(84_375_000);
    expect(r.basicDeductionBasis).toBeUndefined();
  });

  it("1호만 + 배분 {clause1: 2,500,000} → 같은 값 (입력이 법문 직접 값과 일치)", () => {
    const r = calculateExitTax(input([domestic()], { basicDeductionAllocation: { clause1: 2_500_000 } }));
    expect(r.incomeTax).toBe(84_375_000);
  });

  it("1호만 + 합계 불일치 / 다른 구분에 금액 → INVALID_INPUT", () => {
    expectInvalid(() => calculateExitTax(input([domestic()], { basicDeductionAllocation: { clause1: 2_000_000 } })));
    expectInvalid(() => calculateExitTax(input([domestic()], { basicDeductionAllocation: { clause2b: 2_500_000 } })));
    expectInvalid(() =>
      calculateExitTax(input([domestic()], { basicDeductionAllocation: { clause1: 2_000_000, clause2b: 500_000 } })),
    );
  });

  it("2호나목만 + 배분 {clause2b: 2,500,000} → 183,500,000 (K-5 와 같다)", () => {
    const r = calculateExitTax(input([foreign()], { basicDeductionAllocation: { clause2b: 2_500_000 } }));
    expect(r.incomeTax).toBe(183_500_000);
    expect(r.basicDeductionBasis).toBeUndefined();
  });
});

describe("C-2 · 구분 간 손실 = 차단 (구분 안 통산은 유지)", () => {
  it("K-12 1호 차익 +400,000,000 / 2호나목 차익 −300,000,000 → INVALID_INPUT", () => {
    const lossy = foreign({ perShareAcquisitionPrice: 900_000, departureDayMarketPrice: 600_000 });
    // 시가 600,000,000(5억 초과라 과세) · 취득 900,000,000 → 차익 −300,000,000
    expect(lossy.shareCount * (600_000 - 900_000)).toBe(-300_000_000);
    expectInvalid(
      () =>
        calculateExitTax(input([domestic(), lossy], { basicDeductionAllocation: { clause1: 2_500_000, clause2b: 0 } })),
      "clause2b",
    );
    // 배분을 넣지 않아도 손실 구분이 먼저 막는다
    expectInvalid(() => calculateExitTax(input([domestic(), lossy])), "clause2b");
  });

  it("2호가목 +300,000,000 / 2호나목 −100,000,000 → INVALID_INPUT", () => {
    const lossB = foreign({
      id: "f2b",
      isListedForeignCorp: true,
      perShareAcquisitionPrice: 700_000,
      departureDayMarketPrice: 600_000,
    });
    expectInvalid(() =>
      calculateExitTax(input([f2a(), lossB], { basicDeductionAllocation: { clause2a: 2_500_000, clause2b: 0 } })),
    );
  });

  it("구분이 하나뿐이면 손실은 종전처럼 과세표준 0 (차단하지 않는다)", () => {
    const lossy = domestic({ perShareAcquisitionPrice: 60_000 });
    const r = calculateExitTax(input([lossy]));
    expect(r.totalTransferGain).toBe(-100_000_000);
    expect(r.taxBase).toBe(0);
    expect(r.incomeTax).toBe(0);
  });

  it("양도소득금액이 정확히 0 인 구분은 통과 (배분 0)", () => {
    const flat = foreign({ perShareAcquisitionPrice: 1_400_000 });
    const r = calculateExitTax(
      input([domestic(), flat], { basicDeductionAllocation: { clause1: 2_500_000, clause2b: 0 } }),
    );
    expect(r.incomeTax).toBe(84_375_000);
    expect(r.bucketDetails!.find((b) => b.bucket === "clause2b")!.calculatedTax).toBe(0);
  });
});

describe("범위 밖 유지 — 구분 ≥2 + 경정청구 입력은 PR-7 까지 차단", () => {
  it("1호 + 2호 과세 + 실제 양도가 → INVALID_INPUT (전 종목 동일 단가 단순화 때문에 성립하지 않는다)", () => {
    expectInvalid(() =>
      calculateExitTax(
        input([domestic(), foreign()], {
          basicDeductionAllocation: { clause1: 2_500_000, clause2b: 0 },
          actualTransferPricePerShare: 45_000,
        }),
      ),
    );
  });

  it("1호 + 2호(전부 제외, 5억 이하) 는 구분이 하나라 경정청구 허용 — K-18 불변", () => {
    const f2 = foreign({ id: "f2", shareCount: 5_000, perShareAcquisitionPrice: 40_000, departureDayMarketPrice: 80_000 });
    const r = calculateExitTax(input([domestic(), f2], { actualTransferPricePerShare: 45_000 }));
    expect(r.adjustmentDeduction).toBe(12_500_000);
    expect(r.bucketDetails).toHaveLength(1);
  });
});
