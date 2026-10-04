/**
 * 이월과세(§97의2①) × 매매사례가액 — 증여자 기준 나목 경로 + B의 §163⑨
 *
 * 계획서 `docs/00-pm/stock-carryover-sale-case-donor-basis.plan.md` §6
 *
 * ── A (§97의2① 적용) ──────────────────────────────────────────────────────
 *   §97의2①1호 「취득가액은 … 배우자 또는 직계존비속이 해당 자산을 취득할 당시의 §97①1호에 따른 금액」
 *   = 가목(실가) **또는 나목(매매사례·감정·환산 순차)**. 나목이면 §97②2호 본문 → 개산공제(영 §163⑥4)
 *   의 「취득당시 기준시가」도 **증여자 취득 당시**의 것이다(Phase 3 환산과 같은 독법).
 *   증여자 자본적지출(①2호)은 §97②2호 본문상 나목에 가산되지 않는다(단서 swap은 환산 한정).
 *
 * ── B (§97의2① 미적용) ────────────────────────────────────────────────────
 *   영 §163⑨ — 증여받은 자산은 증여일 상증법 평가액을 «취득당시의 실지거래가액으로 본다»(가목).
 *   국심2007중1761: 의제 실가가 있으므로 「실지거래가액을 확인할 수 없는 경우」가 아니다 → 추계 불가.
 *   ⇒ B는 실가 모드(평가액) · 개산공제 없음 · 실비 필요경비.
 *
 *   CO-1  A 매매사례 — 증여자 사례가·증여자 기준시가로 취득가액·개산공제
 *   CO-2  A 매매사례 ±3개월 경고 기준일 = 증여자 취득일
 *   CO-9  하위 호환 — method 부재 + donorAcquisitionPrice → 가목 승계 그대로
 *   CO-10 A 매매사례 + 증여자 자본적지출 → 필요경비 = 개산공제만 · echo 0
 *   CO-B  B는 §163⑨ — 수증자가 추계 모드를 넘겨도 B는 실가(평가액)·개산공제 없음
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/**
 * 비상장 100주 · 양도 2,000,000/주 · 수증일 2025-03-01 · 양도 2025-12-01(1년 이내) ·
 * 증여자(배우자) 취득 2015-06-01 · 증여일 평가액 1,500,000/주(§163⑨ — 수증자 실가 모드)
 */
function base(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: 0.2,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0.2,
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
    acquisitionDate: new Date("2025-03-01"),
    transferDate: new Date("2025-12-01"),
    shareCount: 100,
    acquisitionCause: "carryover_gift",
    donorAcquisitionDate: new Date("2015-06-01"),
    donorRelation: "spouse",
    donorDeceased: false,
    transferPriceMode: "actual",
    perShareTransferPrice: 2_000_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 1_500_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2026-02-28"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...o,
  } as StockTransferInput;
}

/** 증여자 매매사례 300,000/주(증여자 취득일 +30일) · 증여자 취득 당시 기준시가 50,000/주 */
const DONOR_SALE_CASE: Partial<StockTransferInput> = {
  donorAcquisitionMethod: "sale_case",
  donorAcquisitionMarketSamplePrice: 300_000,
  donorAcquisitionMarketSampleDate: new Date("2015-07-01"),
  donorAcquisitionStdPrice: 50_000,
};

describe("CO-1: A 매매사례 — 증여자 기준 (§97의2①1호 → §97①1호 나목 · 영 §176의2③1호)", () => {
  const r = calculateStockTransferTax(base(DONOR_SALE_CASE));

  it("A가 채택된다 — 증여자 기준 취득가액이 낮아 A 결정세액이 B 이상", () => {
    expect(r.carryoverDetail?.outcome).toBe("applied");
    expect(r.carryoverDetail!.appliedTotalTax).toBeGreaterThanOrEqual(r.carryoverDetail!.excludedTotalTax);
  });
  it("취득가액 = 증여자 사례가 300,000 × 100주 = 30,000,000 (수증일 평가액 1억5천만원이 아니다)", () => {
    expect(r.acquisitionPrice).toBe(30_000_000);
  });
  it("개산공제 = 증여자 취득 당시 기준시가 50,000 × 100주 × 1% = 50,000 (영 §163⑥4)", () => {
    expect(r.estimatedDeduction).toBe(50_000);
    expect(r.expenses).toBe(50_000);
  });
  it("양도차익 = 200,000,000 − 30,000,000 − 50,000", () => {
    expect(r.transferIncome).toBe(200_000_000 - 30_000_000 - 50_000);
  });
});

describe("CO-2: A 매매사례 ±3개월 경고의 기준일은 증여자 취득일", () => {
  it("증여자 취득일 +30일 사례 → 경고 없음 (수증일 기준이면 3,500일 넘게 차이)", () => {
    const r = calculateStockTransferTax(base(DONOR_SALE_CASE));
    expect(r.marketSampleDetail?.acquisitionDeltaDays).toBe(30);
    expect(r.marketSampleDetail?.acquisitionOverThreeMonths).toBe(false);
  });
  it("증여자 취득일 +274일 사례 → 경고", () => {
    const r = calculateStockTransferTax(
      base({ ...DONOR_SALE_CASE, donorAcquisitionMarketSampleDate: new Date("2016-03-01") }),
    );
    expect(r.marketSampleDetail?.acquisitionOverThreeMonths).toBe(true);
  });
});

describe("CO-9: 하위 호환 — method 부재 + 증여자 실가 → 가목 승계 그대로", () => {
  it("취득가액 = 증여자 실가 200,000 × 100주", () => {
    const r = calculateStockTransferTax(base({ donorAcquisitionPrice: 200_000 }));
    expect(r.carryoverDetail?.outcome).toBe("applied");
    expect(r.acquisitionPrice).toBe(20_000_000);
    expect(r.estimatedDeduction).toBeUndefined();
  });
});

describe("CO-10: A 매매사례 + 증여자 자본적지출 — §97②2호 본문상 산입되지 않는다", () => {
  const r = calculateStockTransferTax(base({ ...DONOR_SALE_CASE, donorCapitalExpenditure: 30_000_000 }));
  it("필요경비 = 개산공제 50,000 뿐", () => {
    expect(r.expenses).toBe(50_000);
    expect(r.swapApplied).toBeFalsy();
  });
  it("결과 echo도 「산입 0」 — 산입되지 않은 금액을 산입됐다고 표시하지 않는다", () => {
    expect(r.carryoverDetail?.donorCapexIncluded).toBe(0);
  });
});

describe("CO-B: B는 영 §163⑨ — 증여일 평가액이 실지거래가액 (국심2007중1761)", () => {
  // 관계 요건 불충족(other) → 게이트에서 B로 간다. 수증자가 추계 모드·사례가를 넘겨도 B는 실가다.
  const r = calculateStockTransferTax(
    base({
      donorRelation: "other",
      acquisitionMode: "sale_case",
      acquisitionMarketSamplePrice: 1_400_000,
      acquisitionYearNetIncomePerShare: 300_000,
      acquisitionYearNetAssetPerShare: 300_000,
      expenseMode: "estimated",
    }),
  );
  it("취득가액 = 평가액 1,500,000 × 100주 (사례가 1,400,000이 아니다)", () => {
    expect(r.acquisitionPrice).toBe(150_000_000);
  });
  it("개산공제 없음 · 필요경비 = 실비(0)", () => {
    expect(r.estimatedDeduction).toBeUndefined();
    expect(r.expenses).toBe(0);
  });
});
