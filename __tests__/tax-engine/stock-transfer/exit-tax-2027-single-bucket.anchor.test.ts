/**
 * 국외전출세 2027.1.1. 개정 — PR-2: 출국일 게이트 + 2호(국외주식) 단일 구분 계산 anchor
 *
 * 계획서: docs/02-design/features/stock-transfer-exit-tax-2027.engine.plan.md §4 (K-n)
 * 수치는 전부 손계산이다(엔진 실행값 복사 아님).
 *
 *   H1 코스닥 10,000주 · 취득 10,000/주 · 출국일 시가 50,000/주  → 시가 500,000,000 · 취득 100,000,000 · 차익 400,000,000
 *   F1 국외주식 1,000주 · 취득 480,000/주 · 출국일 시가 1,400,000/주 → 시가 1,400,000,000 · 취득 480,000,000 · 차익 920,000,000
 *      (이 PR은 원화 단가 경로까지다 — 외화·환율 환산은 PR-3)
 *
 *   K-1  H1 · 2026-09-01     과세표준 397,500,000 × 25% − 15,000,000 = 84,375,000
 *   K-5  F1만 · 2027-01-01   (920,000,000 − 2,500,000) × 20% = 183,500,000
 *   K-6  F1 중소(내국법인 해외상장) 10% = 91,750,000
 *   K-7  국외 합계 500,000,000 제외 / 500,000,001 과세 (39,500,000)
 */

import { describe, it, expect } from "vitest";
import { calculateExitTax } from "@/lib/tax-engine/stock-transfer/exit-tax";
import type { ExitTaxInput, ExitTaxHolding } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

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

function input(
  departure: Date,
  holdings: ExitTaxHolding[],
  over: Partial<ExitTaxInput> = {},
): ExitTaxInput {
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

describe("A-0 · 출국일 게이트 — 1호(국내) 종목은 개정 전후 동일", () => {
  it("K-1 출국 2026-09-01 H1 → 84,375,000 · pre2027", () => {
    const r = calculateExitTax(input(utc(2026, 9, 1), [domestic()]));
    expect(r.exitTaxRegime).toBe("pre2027");
    expect(r.taxBase).toBe(397_500_000);
    expect(r.incomeTax).toBe(84_375_000);
  });

  it("K-2 출국 2026-12-31 → pre2027 (경계 종전)", () => {
    const r = calculateExitTax(input(utc(2026, 12, 31), [domestic()]));
    expect(r.exitTaxRegime).toBe("pre2027");
    expect(r.incomeTax).toBe(84_375_000);
  });

  it("K-3 출국 2027-01-01 → from2027 · 1호 표는 개정 전후 동일 84,375,000", () => {
    const r = calculateExitTax(input(utc(2027, 1, 1), [domestic()]));
    expect(r.exitTaxRegime).toBe("from2027");
    expect(r.incomeTax).toBe(84_375_000);
    expect(r.appliedRate).toBe(0.25);
    expect(r.progressiveDeduction).toBe(15_000_000);
    expect(r.localIncomeTax).toBe(8_437_500);
    expect(r.localIncomeTaxAlternative).toBeUndefined();
  });

  it("문자열 출국일(JSON 경유)도 같은 구간", () => {
    const d = JSON.parse(JSON.stringify({ d: utc(2027, 1, 1) })).d as unknown as Date;
    expect(calculateExitTax(input(d, [domestic()])).exitTaxRegime).toBe("from2027");
  });
});

describe("C-4 · 2026 이전 출국 + 국외 종목 → 제외하고 echo (차단 아님)", () => {
  it("K-4 2026-12-31 H1 + F1 → F1 제외, 세액·지방세 불변", () => {
    const r = calculateExitTax(input(utc(2026, 12, 31), [domestic(), foreign()]));
    expect(r.incomeTax).toBe(84_375_000);
    expect(r.localIncomeTax).toBe(8_437_500);
    expect(r.totalTax).toBe(92_812_500);
    const f = r.holdingDetails.find((h) => h.id === "f1")!;
    expect(f.scope).toBe("excluded");
    expect(f.excludedReason).toBe("pre2027_foreign_not_covered");
    expect(r.holdingDetails.find((h) => h.id === "h1")!.scope).toBe("taxed");
    // 제외 종목은 합계에 안 들어간다
    expect(r.totalTransferGain).toBe(400_000_000);
    expect(r.foreignExclusion?.applied).toBe(true);
    expect(r.foreignExclusion?.reason).toBe("pre2027_foreign_not_covered");
  });

  it("2026 출국 + 국외 종목만 → not_liable (전부 제외)", () => {
    const r = calculateExitTax(input(utc(2026, 12, 31), [foreign()]));
    expect(r.taxCategory).toBe("not_liable");
    expect(r.totalTax).toBe(0);
    expect(r.holdingDetails[0].excludedReason).toBe("pre2027_foreign_not_covered");
  });
});

describe("2호 단일 구분 — 중소기업 10% / 그 밖 20%", () => {
  it("K-5 F1만 · 2027-01-01 → 20% = 183,500,000", () => {
    const r = calculateExitTax(input(utc(2027, 1, 1), [foreign()]));
    expect(r.taxCategory).toBe("exit_tax");
    expect(r.totalTransferGain).toBe(920_000_000);
    expect(r.basicDeduction).toBe(2_500_000);
    expect(r.taxBase).toBe(917_500_000);
    expect(r.incomeTax).toBe(183_500_000);
    expect(r.appliedRate).toBe(0.2);
    expect(r.progressiveDeduction).toBe(0);
    expect(r.holdingDetails[0].rateBucket).toBe("clause2b");
    expect(r.bucketDetails).toHaveLength(1);
    expect(r.bucketDetails![0]).toMatchObject({
      bucket: "clause2b",
      transferGain: 920_000_000,
      basicDeductionAllocated: 2_500_000,
      taxBase: 917_500_000,
      appliedRate: 0.2,
      calculatedTax: 183_500_000,
    });
  });

  it("K-5 지방소득세 — 주값 = 지방세법 §103의3⑧ 표 직독, 참고값 = 소득세 × 10%", () => {
    const r = calculateExitTax(input(utc(2027, 1, 1), [foreign()]));
    // 6,000,000 + (917,500,000 − 300,000,000) × 2.5% = 21,437,500
    expect(r.localIncomeTax).toBe(21_437_500);
    expect(r.localIncomeTaxAlternative).toBe(18_350_000);
    expect(r.totalTax).toBe(183_500_000 + 21_437_500);
  });

  it("K-6 내국법인 해외상장 중소기업 → 가목 10% = 91,750,000", () => {
    const r = calculateExitTax(
      input(utc(2027, 1, 1), [foreign({ isListedForeignCorp: false, isSmallMediumEnterprise: true })]),
    );
    expect(r.incomeTax).toBe(91_750_000);
    expect(r.appliedRate).toBe(0.1);
    expect(r.holdingDetails[0].rateBucket).toBe("clause2a");
    expect(r.localIncomeTax).toBe(21_437_500);
    expect(r.localIncomeTaxAlternative).toBe(9_175_000);
  });

  it("K-20 외국법인 발행(isListedForeignCorp=true)은 중소기업이어도 나목 20%", () => {
    const r = calculateExitTax(
      input(utc(2027, 1, 1), [foreign({ isListedForeignCorp: true, isSmallMediumEnterprise: true })]),
    );
    expect(r.incomeTax).toBe(183_500_000);
    expect(r.holdingDetails[0].rateBucket).toBe("clause2b");
  });

  it("isListedForeignCorp 미입력은 true(외국법인) — 가목 불가", () => {
    const r = calculateExitTax(
      input(utc(2027, 1, 1), [foreign({ isListedForeignCorp: undefined, isSmallMediumEnterprise: true })]),
    );
    expect(r.incomeTax).toBe(183_500_000);
  });

  it("K-15 국외주식만 + 대주주 아님 → not_liable + 국외주식 제외 문구", () => {
    const r = calculateExitTax(input(utc(2027, 1, 1), [foreign()], { isMajorShareholder: false }));
    expect(r.taxCategory).toBe("not_liable");
    expect(r.ineligibleReason).toContain("국외주식");
    expect(r.exitTaxRegime).toBe("from2027");
  });

  it("K-15 대주주 true 면 K-5와 동일 + 대주주 판정 비포함 경고", () => {
    const r = calculateExitTax(input(utc(2027, 1, 1), [foreign()], { isMajorShareholder: true }));
    expect(r.incomeTax).toBe(183_500_000);
    expect(r.warnings.some((w) => w.includes("대주주 판정에 포함되지 않습니다"))).toBe(true);
  });

  it("2호 납부유예 5년 — 유예세액 = 산출세액 (K-22)", () => {
    const r = calculateExitTax(
      input(utc(2027, 1, 1), [foreign()], { deferralRequested: true }),
    );
    expect(r.deferralYears).toBe(5);
    expect(r.deferredTaxAmount).toBe(183_500_000);
  });
});

describe("영 §178의8②1호 — 국외주식 양도가액 합계 5억원 이하 제외 (경계)", () => {
  // 국외주식 1주 단가로 합계를 맞춘다. 취득 300,000,000.
  const fx = (value: number) =>
    foreign({ shareCount: 1, perShareAcquisitionPrice: 300_000_000, departureDayMarketPrice: value });

  it("K-7 합계 500,000,000 → 제외 · 세액 0 · not_liable", () => {
    const r = calculateExitTax(input(utc(2027, 1, 1), [fx(500_000_000)]));
    expect(r.taxCategory).toBe("not_liable");
    expect(r.incomeTax).toBe(0);
    expect(r.totalTax).toBe(0);
    expect(r.holdingDetails[0].excludedReason).toBe("foreign_total_le_500m");
    expect(r.foreignExclusion).toMatchObject({
      applied: true,
      reason: "foreign_total_le_500m",
      foreignDepartureValueTotal: 500_000_000,
      threshold: 500_000_000,
    });
    expect(r.residencyEligible).toBe(true);
    expect(r.majorShareholderEligible).toBe(true);
  });

  it("K-7 합계 500,000,001 → 과세: 차익 200,000,001 → 과세표준 197,500,001 → 39,500,000", () => {
    const r = calculateExitTax(input(utc(2027, 1, 1), [fx(500_000_001)]));
    expect(r.taxCategory).toBe("exit_tax");
    expect(r.totalTransferGain).toBe(200_000_001);
    expect(r.taxBase).toBe(197_500_001);
    expect(r.incomeTax).toBe(39_500_000);
    expect(r.foreignExclusion?.applied).toBe(false);
    // 3억 이하: 197,500,001 × 2% = 3,950,000.02 → 3,950,000
    expect(r.localIncomeTax).toBe(3_950_000);
  });

  it("K-8 H1 + 국외 F2(가액 400,000,000) → F2만 제외, 세액 84,375,000 불변 (1호 종목은 5억 합계에 안 들어감)", () => {
    const f2 = foreign({
      id: "f2",
      shareCount: 5_000,
      perShareAcquisitionPrice: 40_000,
      departureDayMarketPrice: 80_000,
    });
    const r = calculateExitTax(input(utc(2027, 1, 1), [domestic(), f2]));
    expect(r.incomeTax).toBe(84_375_000);
    expect(r.holdingDetails.find((h) => h.id === "f2")!.excludedReason).toBe("foreign_total_le_500m");
    expect(r.foreignExclusion?.foreignDepartureValueTotal).toBe(400_000_000);
  });

  it("합계는 소유 국외주식 전부 — 2종목 합 250,000,000+250,000,001 → 과세", () => {
    const a = foreign({ id: "a", shareCount: 1, perShareAcquisitionPrice: 0, departureDayMarketPrice: 250_000_000 });
    const b = foreign({ id: "b", shareCount: 1, perShareAcquisitionPrice: 0, departureDayMarketPrice: 250_000_001 });
    const r = calculateExitTax(input(utc(2027, 1, 1), [a, b]));
    expect(r.taxCategory).toBe("exit_tax");
    expect(r.totalTransferGain).toBe(500_000_001);
  });
});

describe("영 §178의8②2·3호 — 외국인근로자 (C-3 병합안)", () => {
  const checksOk = {
    isOfficerOrEmployee: true,
    isNotDailyWorker: true,
    domesticWorkRatioAtLeast80: true,
    departedWithin6MonthsOfWorkEnd: true,
  };

  it("K-14 본인 + 요건 4개 true → 국외주식 전부 제외", () => {
    const r = calculateExitTax(
      input(utc(2027, 1, 1), [foreign()], {
        foreignWorkerStatus: "foreign_worker",
        foreignWorkerChecks: checksOk,
      }),
    );
    expect(r.taxCategory).toBe("not_liable");
    expect(r.holdingDetails[0].excludedReason).toBe("foreign_worker_owned");
  });

  it("K-14 요건 하나 false → 과세 (K-5와 동일)", () => {
    const r = calculateExitTax(
      input(utc(2027, 1, 1), [foreign()], {
        foreignWorkerStatus: "foreign_worker",
        foreignWorkerChecks: { ...checksOk, domesticWorkRatioAtLeast80: false },
      }),
    );
    expect(r.incomeTax).toBe(183_500_000);
  });

  it("K-13 가족(배우자): 근로 개시 전 취득 F3 제외 · 개시 후 취득 F4 과세 → 19,500,000 (합계 6억 > 5억이라 1호 비해당)", () => {
    const f3 = foreign({
      id: "f3",
      shareCount: 1,
      acquisitionDate: utc(2019, 3, 1),
      perShareAcquisitionPrice: 100_000_000,
      departureDayMarketPrice: 400_000_000,
    });
    const f4 = foreign({
      id: "f4",
      shareCount: 1,
      acquisitionDate: utc(2022, 3, 1),
      perShareAcquisitionPrice: 100_000_000,
      departureDayMarketPrice: 200_000_000,
    });
    const r = calculateExitTax(
      input(utc(2027, 1, 1), [f3, f4], {
        foreignWorkerStatus: "foreign_worker_family",
        foreignWorkerChecks: checksOk,
        foreignWorkerFamilyKind: "spouse",
        foreignWorkerStartDate: utc(2020, 1, 1),
      }),
    );
    expect(r.holdingDetails.find((h) => h.id === "f3")!.excludedReason).toBe("foreign_worker_family_pre_work");
    expect(r.holdingDetails.find((h) => h.id === "f4")!.scope).toBe("taxed");
    expect(r.totalTransferGain).toBe(100_000_000);
    expect(r.taxBase).toBe(97_500_000);
    expect(r.incomeTax).toBe(19_500_000);
  });

  it("3호 경계 — 취득일이 근로 개시일과 같으면 「전에 취득」 아님 → 과세", () => {
    const f = foreign({ acquisitionDate: utc(2020, 1, 1) });
    const r = calculateExitTax(
      input(utc(2027, 1, 1), [f], {
        foreignWorkerStatus: "foreign_worker_family",
        foreignWorkerChecks: checksOk,
        foreignWorkerFamilyKind: "child_20_or_under",
        foreignWorkerStartDate: utc(2020, 1, 1),
      }),
    );
    expect(r.incomeTax).toBe(183_500_000);
    // 하루 전 취득이면 제외
    const r2 = calculateExitTax(
      input(utc(2027, 1, 1), [foreign({ acquisitionDate: utc(2019, 12, 31) })], {
        foreignWorkerStatus: "foreign_worker_family",
        foreignWorkerChecks: checksOk,
        foreignWorkerFamilyKind: "child_20_or_under",
        foreignWorkerStartDate: utc(2020, 1, 1),
      }),
    );
    expect(r2.taxCategory).toBe("not_liable");
  });

  it("status ≠ none 인데 요건 체크 누락 → INVALID_INPUT (자동 보정 없음)", () => {
    expect(() =>
      calculateExitTax(input(utc(2027, 1, 1), [foreign()], { foreignWorkerStatus: "foreign_worker" })),
    ).toThrow(TaxCalculationError);
  });

  it("가족인데 근로 개시일/가족 구분 누락 → INVALID_INPUT", () => {
    expect(() =>
      calculateExitTax(
        input(utc(2027, 1, 1), [foreign()], {
          foreignWorkerStatus: "foreign_worker_family",
          foreignWorkerChecks: checksOk,
          foreignWorkerFamilyKind: "spouse",
        }),
      ),
    ).toThrow(TaxCalculationError);
  });
});

describe("1호 경로 회귀 · 제외 종목 오염 방지", () => {
  it("K-24 출국 2026-09-01 + 실제 양도일 2027-03-01 + 갑 조정공제·외국납부 → 41,875,000 (게이트는 양도일이 아님)", () => {
    const r = calculateExitTax(
      input(utc(2026, 9, 1), [domestic()], {
        deferralRequested: true,
        actualTransferDate: utc(2027, 3, 1),
        actualTransferPricePerShare: 45_000,
        foreignTaxPaid: 30_000_000,
      }),
    );
    expect(r.exitTaxRegime).toBe("pre2027");
    expect(r.adjustmentDeduction).toBe(12_500_000);
    expect(r.foreignTaxCreditApplied).toBe(30_000_000);
    expect(r.finalTaxAfterAdjustment).toBe(41_875_000);
  });

  it("K-25 2027-01-01 · 1호 H1만 · 조정공제 12,500,000 — 2027에서도 1호 경로 불변", () => {
    const r = calculateExitTax(
      input(utc(2027, 1, 1), [domestic()], { actualTransferPricePerShare: 45_000 }),
    );
    expect(r.adjustmentDeduction).toBe(12_500_000);
    expect(r.finalTaxAfterAdjustment).toBe(71_875_000);
  });

  it("K-18 H1 + F2(전부 제외, 5,000주) + 실제 양도 1주당 45,000 → 조정공제 12,500,000 (제외 종목 주식수가 안분에 섞이면 틀림)", () => {
    const f2 = foreign({
      id: "f2",
      shareCount: 5_000,
      perShareAcquisitionPrice: 40_000,
      departureDayMarketPrice: 80_000,
    });
    const r = calculateExitTax(
      input(utc(2027, 1, 1), [domestic(), f2], { actualTransferPricePerShare: 45_000 }),
    );
    expect(r.adjustmentDeduction).toBe(12_500_000);
    expect(r.finalTaxAfterAdjustment).toBe(71_875_000);
  });
});

describe("차단 — 2호 경정청구 (PR-7 대기) · 구분 ≥ 2 배분 미입력 (PR-4 anchor 는 exit-tax-2027-multi-bucket)", () => {
  const expectInvalid = (fn: () => unknown) => {
    try {
      fn();
      throw new Error("차단되어야 한다");
    } catch (e) {
      expect(e).toBeInstanceOf(TaxCalculationError);
      expect((e as TaxCalculationError).code).toBe(TaxErrorCode.INVALID_INPUT);
    }
  };

  it("국내 1호 + 국외 2호 과세 혼합 + 기본공제 배분 미입력 → INVALID_INPUT", () => {
    expectInvalid(() => calculateExitTax(input(utc(2027, 1, 1), [domestic(), foreign()])));
  });

  it("2호 가목(중소) + 나목(그 밖) 혼재 + 기본공제 배분 미입력 → INVALID_INPUT", () => {
    const a = foreign({ id: "a", isListedForeignCorp: false, isSmallMediumEnterprise: true });
    const b = foreign({ id: "b", isListedForeignCorp: true });
    expectInvalid(() => calculateExitTax(input(utc(2027, 1, 1), [a, b])));
  });

  it("K-17 2호 과세 + 실제 양도가 입력 → INVALID_INPUT (Q-8)", () => {
    expectInvalid(() =>
      calculateExitTax(input(utc(2027, 1, 1), [foreign()], { actualTransferPricePerShare: 1_200_000 })),
    );
  });

  it("2호 과세 + 외국납부세액·비거주자 원천징수 입력 → INVALID_INPUT", () => {
    expectInvalid(() =>
      calculateExitTax(input(utc(2027, 1, 1), [foreign()], { foreignTaxPaid: 1_000 })),
    );
    expectInvalid(() =>
      calculateExitTax(input(utc(2027, 1, 1), [foreign()], { domesticSourceTaxWithheld: 1_000 })),
    );
  });

  it("PR-3 예약 필드(외화 환산)는 PR-2 계산에 섞이지 않는다 → INVALID_INPUT", () => {
    expectInvalid(() =>
      calculateExitTax(
        input(utc(2027, 1, 1), [foreign({ departureDayPriceForeign: 1_000, departureExchangeRate: 1_400 })]),
      ),
    );
  });

  it("2호 종목의 시가 모드는 원화 거래가액(market_price)만 — 국내 비상장 평가 모드 거부", () => {
    expectInvalid(() =>
      calculateExitTax(
        input(utc(2027, 1, 1), [
          foreign({ departureDayValuationMode: "unlisted_sample", unlistedSamplePrice: 1_400_000 }),
        ]),
      ),
    );
  });

  it("2026 출국에서는 국외 종목이 제외라 구분 혼합·경정 차단이 걸리지 않는다", () => {
    const r = calculateExitTax(
      input(utc(2026, 12, 31), [domestic(), foreign()], { actualTransferPricePerShare: 45_000 }),
    );
    expect(r.adjustmentDeduction).toBe(12_500_000);
  });
});
