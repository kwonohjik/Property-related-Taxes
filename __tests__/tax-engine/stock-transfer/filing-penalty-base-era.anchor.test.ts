/**
 * 신고불성실가산세 — 2015.7.1. 전 양도분 «시기 고지» anchor (V-15 · V-18 · Q-2 a)
 *
 * 계획서: docs/00-pm/stock-penalty-base-guideline-v15.plan.md (Q-1 a · Q-2 a, 2026-11-11)
 *
 * 국세기본법 개정 부칙 제12848호(2014.12.23.) 제10조②: 양도소득세의 §47조의2·§47조의3 개정규정(기준 = «그 신고로 납부하여야 할
 * 세액»)은 **2015년 7월 1일 이후 양도하는 분부터** 적용한다. 그 전 양도분은 종전 규정(산출세액 기준 등)이다. 엔진 가산세 기준은
 * 양도일을 받지 않고 현행 기준을 쓰므로, 신고 위반을 선언했고 가산세가 실제로 계산된 2015.7.1. 전 양도분에는 **세액 불변 고지**를 싣는다.
 */
import { describe, it, expect } from "vitest";
import {
  calculateStockTransferTax,
  calculateStockTransferTaxAggregate,
} from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import {
  FILING_PENALTY_BASE_ERA_NOTICE,
  isFilingPenaltyBaseEraBefore,
  stockFilingPenaltyEraNotice,
} from "@/lib/tax-engine/data/filing-penalty-base-era";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/** 비상장 대주주(비중소기업) 장기 — 종목당 양도소득 400,000,000 (주당 5,000,000 − 1,000,000 × 100주) */
function major(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: 0.05,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2024-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: new Date("2021-01-01"),
    transferDate: new Date("2025-06-01"),
    shareCount: 100,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 5_000_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 1_000_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2025-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...o,
  } as StockTransferInput;
}


const pre = (o: Partial<StockTransferInput> = {}) =>
  major({ transferDate: new Date("2015-06-30"), filingViolation: "non_report", filingDate: new Date("2015-12-31"), ...o });

describe("PE-1 순수 판정 — 경계일은 양도일 2015-07-01", () => {
  it("PE-1-1 2015-06-30은 종전, 2015-07-01은 현행", () => {
    expect(isFilingPenaltyBaseEraBefore(new Date("2015-06-30"))).toBe(true);
    expect(isFilingPenaltyBaseEraBefore(new Date("2015-07-01"))).toBe(false);
    expect(isFilingPenaltyBaseEraBefore("2015-06-30")).toBe(true);
    expect(isFilingPenaltyBaseEraBefore("2015-07-01")).toBe(false);
  });

  it("PE-1-2 위반 선언 + 종전 양도일 + 가산세 > 0 → 고지", () => {
    expect(
      stockFilingPenaltyEraNotice({ filingViolation: "non_report", transferDate: new Date("2014-12-31"), penalty: 1 }),
    ).toBe(FILING_PENALTY_BASE_ERA_NOTICE);
  });

  it("PE-1-3 고지하지 않는 입력 — 정상 신고 · 현행 양도일 · 가산세 0 · 양도일 없음", () => {
    const d = new Date("2014-12-31");
    expect(stockFilingPenaltyEraNotice({ filingViolation: "none", transferDate: d, penalty: 1 })).toBeUndefined();
    expect(stockFilingPenaltyEraNotice({ filingViolation: undefined, transferDate: d, penalty: 1 })).toBeUndefined();
    expect(stockFilingPenaltyEraNotice({ filingViolation: "non_report", transferDate: new Date("2015-07-01"), penalty: 1 })).toBeUndefined();
    expect(stockFilingPenaltyEraNotice({ filingViolation: "non_report", transferDate: d, penalty: 0 })).toBeUndefined();
    expect(stockFilingPenaltyEraNotice({ filingViolation: "non_report", transferDate: undefined, penalty: 1 })).toBeUndefined();
  });

  it("PE-1-4 문구는 부칙·종전 규정·확인 필요를 말한다(법령 상수 인용)", () => {
    expect(FILING_PENALTY_BASE_ERA_NOTICE).toContain("부칙 §12848호 제10조②");
    expect(FILING_PENALTY_BASE_ERA_NOTICE).toContain("국세기본법 §47의2");
    expect(FILING_PENALTY_BASE_ERA_NOTICE).toContain("2015년 7월 1일");
    expect(FILING_PENALTY_BASE_ERA_NOTICE).toContain("확인 필요");
  });
});

describe("PE-2 단건 경로 — 고지가 붙고 세액은 그대로", () => {
  const r = calculateStockTransferTax(pre());
  it("PE-2-1 종전 양도일 + 무신고 → warnings에 고지, 가산세는 계산됨", () => {
    expect(r.underReportPenalty).toBeGreaterThan(0);
    expect(r.warnings.filter((w) => w === FILING_PENALTY_BASE_ERA_NOTICE)).toHaveLength(1);
  });

  it("PE-2-2 세액 불변 — 같은 입력을 현행 양도일로 바꿔도 가산세 산식이 같다(양도일만 다르다)", () => {
    const cur = calculateStockTransferTax(pre({ transferDate: new Date("2015-07-01") }));
    expect(cur.warnings.includes(FILING_PENALTY_BASE_ERA_NOTICE)).toBe(false);
    // 세율표 연혁이 같은 두 날짜라 산출세액이 같고, 가산세도 같다
    expect(cur.calculatedTax).toBe(r.calculatedTax);
    expect(cur.underReportPenalty).toBe(r.underReportPenalty);
  });

  it("PE-2-3 정상 신고면 고지 없음", () => {
    const ok = calculateStockTransferTax(pre({ filingViolation: "none" }));
    expect(ok.warnings.includes(FILING_PENALTY_BASE_ERA_NOTICE)).toBe(false);
  });
});

describe("PE-3 합산 경로 — 신고 단위 1회, 종목 행에는 싣지 않는다", () => {
  const a = calculateStockTransferTaxAggregate(
    [pre({ filingViolation: "none" }), pre({ transferDate: new Date("2015-06-20") })],
    "aggregate",
  );
  it("PE-3-1 종전 양도 종목이 있으면 합산 echo `penaltyEraNotice` 1건", () => {
    expect(a.totalUnderReportPenalty).toBeGreaterThan(0);
    expect(a.penaltyEraNotice).toBe(FILING_PENALTY_BASE_ERA_NOTICE);
  });

  it("PE-3-2 종목 행 warnings에는 중복해서 싣지 않는다", () => {
    for (const it of a.items) expect(it.warnings.includes(FILING_PENALTY_BASE_ERA_NOTICE)).toBe(false);
  });

  it("PE-3-3 전 종목이 현행 양도일이면 echo 없음", () => {
    const cur = calculateStockTransferTaxAggregate(
      [pre({ transferDate: new Date("2015-07-01") }), pre({ transferDate: new Date("2016-01-04") })],
      "aggregate",
    );
    expect(cur.totalUnderReportPenalty).toBeGreaterThan(0);
    expect(cur.penaltyEraNotice).toBeUndefined();
  });

  it("PE-3-4 가산세가 0이면 echo 없음(위반 선언이 없는 합산)", () => {
    const none = calculateStockTransferTaxAggregate(
      [pre({ filingViolation: "none" }), pre({ filingViolation: "none", transferDate: new Date("2015-06-20") })],
      "aggregate",
    );
    expect(none.totalUnderReportPenalty).toBe(0);
    expect(none.penaltyEraNotice).toBeUndefined();
  });
});

describe("PE-4 each_item 단축 경로도 같은 echo를 싣는다", () => {
  it("PE-4-1 종목 1건(단건 단축 경로) 종전 양도일 + 무신고", () => {
    const one = calculateStockTransferTaxAggregate([pre()], "aggregate");
    expect(one.totalUnderReportPenalty).toBeGreaterThan(0);
    expect(one.penaltyEraNotice).toBe(FILING_PENALTY_BASE_ERA_NOTICE);
  });

  it("PE-4-2 each_item 모드 2건", () => {
    const each = calculateStockTransferTaxAggregate([pre(), pre({ transferDate: new Date("2015-06-20") })], "each_item");
    expect(each.penaltyEraNotice).toBe(FILING_PENALTY_BASE_ERA_NOTICE);
  });

  it("PE-4-3 종전·현행 혼재 — 가장 이른 양도일로 판정한다", () => {
    const mixed = calculateStockTransferTaxAggregate(
      [pre({ transferDate: new Date("2016-02-01") }), pre({ transferDate: new Date("2015-06-20") })],
      "aggregate",
    );
    expect(mixed.penaltyEraNotice).toBe(FILING_PENALTY_BASE_ERA_NOTICE);
  });
});
