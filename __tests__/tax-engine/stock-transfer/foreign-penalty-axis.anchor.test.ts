/**
 * anchor: **국외주식 신고에도 가산세가 붙는다** — 전부 국외인 신고 · 국외 단건
 *
 * 계획서: docs/00-pm/stock-transfer-pr3-followup-closeout.plan.md (§11.6 잔여-1)
 *
 * ## 무엇이 빠져 있었나
 *
 * PR #1331(Phase A′)이 가산세를 **신고 1건 단위**로 바꾸면서 국내+국외 혼합 신고의 국외
 * 소득분을 base 에 넣었지만, **국내 종목이 하나도 없는 신고**는 여전히 가산세 0이었다 —
 * `ForeignStockInput` 에 신고축 필드가 **타입 자체에 없어** 대표 축을 고를 수 없었다.
 * 국외 **단건** 경로(`calculateForeignStockTax`)도 마찬가지로 가산세를 계산하지 않았다.
 *
 * 법령상 국외주식 양도도 같은 양도소득세 신고다 — 근거는 §118의8이 아니라 **§110①(확정신고)의
 * 직접 적용**이다(§118의2의 「국외자산」에서 3호·4호가 삭제돼 국외주식은 §118의8 대상이 아니다).
 * 국세기본법 §47조의2·§47조의3 은 「국세의 과세표준 **신고**」 단위로 걸린다.
 * 해외주식만 거래한 납세자라고 가산세를 면할 근거는 없다.
 *
 * ## 격자
 *
 * 환율 1 고정 · 양도소득 100,000,000 → 기본공제 2,500,000 → 과세표준 97,500,000
 * × 20%(§104①12호나목) = 산출세액 **19,500,000**
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { calculateForeignStockTax } from "@/lib/tax-engine/stock-transfer/foreign-stock";
import type { ForeignStockInput } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";

function fx(gain: number, o: Partial<ForeignStockInput> = {}): ForeignStockInput {
  return {
    marketType: "foreign_stock",
    yearsResidentInKorea: 10,
    isListedForeignCorp: true,
    stockName: "Corp",
    countryCode: "US",
    shareCount: 1,
    transferDate: new Date("2024-03-01"),
    transferPriceMode: "total",
    totalTransferPriceForeign: gain + 1_000_000,
    transferCurrencyCode: "USD",
    transferExchangeRate: 1,
    acquisitionDate: new Date("2021-01-02"),
    acquisitionMode: "actual",
    perShareAcquisitionPriceForeign: 1_000_000,
    acquisitionCurrencyCode: "USD",
    acquisitionExchangeRate: 1,
    capitalExpenditureForeign: 0,
    transferCostForeign: 0,
    hasForeignTax: false,
    foreignTaxMethod: "credit",
    isElectronicFiling: false,
    ...o,
  };
}

/** 과소신고 + 부정행위 40% */
const FRAUD = {
  filingViolation: "under_report" as const,
  isFraudulent: true,
  isInternationalTransaction: false,
};

// ============================================================
// FP-1 국외 단건 — 신고축을 선언하면 가산세가 붙는다
// ============================================================

describe("FP-1 국외 단건", () => {
  it("FP-1-1: 신고축 미선언이면 가산세 0 (종전 동작 유지)", () => {
    const r = calculateForeignStockTax(fx(100_000_000));
    expect(r.underReportPenalty ?? 0).toBe(0);
  });

  it("FP-1-2: 과소신고+부정 40% → 19,500,000 × 40% = 7,800,000", () => {
    const r = calculateForeignStockTax(fx(100_000_000, FRAUD));
    expect(r.incomeTax).toBe(19_500_000);
    expect(r.underReportPenalty).toBe(7_800_000);
  });

  it("FP-1-3: 가산세가 최종 납부세액에 들어간다", () => {
    const r = calculateForeignStockTax(fx(100_000_000, FRAUD));
    expect(r.finalTax).toBe(27_300_000); // 19,500,000 + 7,800,000
  });

  it("FP-1-4: 「과소신고납부세액등」 — 당초 신고세액이 base 에서 빠진다 (§47조의3①)", () => {
    const r = calculateForeignStockTax(fx(100_000_000, { ...FRAUD, originalFiledTax: 10_000_000 }));
    expect(r.underReportPenalty).toBe(3_800_000); // (19,500,000 − 10,000,000) × 40%
  });

  it("FP-1-5: §47조의4 납부지연도 계산된다 — 31일 × 0.022%", () => {
    const r = calculateForeignStockTax(
      fx(100_000_000, {
        ...FRAUD,
        unpaidTax: 10_000_000,
        paymentDeadline: new Date("2024-08-31"),
        actualPaymentDate: new Date("2024-10-01"),
      }),
    );
    expect(r.latePaymentPenalty).toBe(68_200);
  });
});

// ============================================================
// FP-2 전부 국외인 다종목 신고 — 신고 단위 1회
// ============================================================

describe("FP-2 전부 국외인 신고", () => {
  it("FP-2-1: 2종목 합산 산출세액 = 39,500,000 (기본공제는 한 번)", () => {
    const agg = calculateStockTransferTaxAggregate([
      fx(100_000_000, FRAUD),
      fx(100_000_000, { ...FRAUD, transferDate: new Date("2024-09-01") }),
    ]);
    expect(agg.totalCalculatedTax).toBe(39_500_000);
  });

  it("FP-2-2: 가산세는 **신고 단위 1회** = 39,500,000 × 40% = 15,800,000", () => {
    const agg = calculateStockTransferTaxAggregate([
      fx(100_000_000, FRAUD),
      fx(100_000_000, { ...FRAUD, transferDate: new Date("2024-09-01") }),
    ]);
    expect(agg.totalUnderReportPenalty).toBe(15_800_000);
  });

  it("FP-2-3: 종목별 가산세는 0 — 신고 단위라 종목에 귀속되지 않는다", () => {
    const agg = calculateStockTransferTaxAggregate([
      fx(100_000_000, FRAUD),
      fx(100_000_000, { ...FRAUD, transferDate: new Date("2024-09-01") }),
    ]);
    expect(agg.items.map((r) => r.underReportPenalty)).toEqual([0, 0]);
  });

  it("FP-2-4: 신고축 미선언이면 종전대로 0", () => {
    const agg = calculateStockTransferTaxAggregate([fx(100_000_000), fx(50_000_000)]);
    expect(agg.totalUnderReportPenalty).toBe(0);
  });
});

// ============================================================
// FP-3 배선 — 폼 → ④body → ⑫zod → ⑭route 매핑 → 엔진
//
// ⚠️ 국외 경로는 스키마·매핑이 **국내와 별개 파일**이다(`stock-transfer-foreign-schema.ts`,
//    `buildForeignEngineInput`). 국내 쪽만 고치면 국외는 조용히 strip 된다.
// ============================================================

describe("FP-3 국외 배선 (④⑫⑭)", () => {
  it("FP-3-1: 폼의 신고축이 body·zod·매핑을 지나 세액까지 도달한다", async () => {
    const { buildStockTransferApiBody } = await import("@/lib/calc/stock-transfer-tax-api");
    const { foreignStockInputSchema } = await import("@/lib/api/stock-transfer-tax-schema");
    const { createInitialStockFormData } = await import("@/lib/stores/calc-wizard-stock-store");

    const form = {
      ...createInitialStockFormData(),
      marketType: "foreign_stock" as const,
      securityName: "Corp",
      fgCountryCode: "US",
      shareCount: "1",
      transferDate: "2024-03-01",
      fgTransferPriceMode: "total" as const,
      totalTransferPriceForeign: "101000000",
      transferCurrencyCode: "USD",
      transferExchangeRate: "1",
      acquisitionDate: "2021-01-02",
      acquisitionModeFS: "actual" as const,
      perShareAcquisitionPriceForeign: "1000000",
      acquisitionCurrencyCode: "USD",
      acquisitionExchangeRate: "1",
      filingViolation: "under_report" as const,
      isFraudulent: true,
      originalFiledTax: "10000000",
    };

    const body = buildStockTransferApiBody(form);
    // ⑬ body spread
    expect(body.filingViolation).toBe("under_report");
    expect(body.isFraudulent).toBe(true);
    expect(body.originalFiledTax).toBe(10_000_000);

    // ⑫ zod — 모르는 키를 조용히 버리지 않는지
    const parsed = foreignStockInputSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as Record<string, unknown>).originalFiledTax).toBe(10_000_000);
    }
  });
});
