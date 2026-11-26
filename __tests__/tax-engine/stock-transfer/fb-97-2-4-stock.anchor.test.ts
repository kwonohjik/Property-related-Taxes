/**
 * F-1 PR-1b — 주식 양도 §97의2④ 가업상속공제 자산 의제 취득가액 (단건 취득)
 *
 * 「소득세법」 §97의2④: 취득가액 = 피상속인 취득가액 × 적용률 + 상속개시일 현재 자산가액 × (1 − 적용률)
 * 「상속세 및 증여세법 시행령」 §15㉑: §18의2⑩ 양도소득세 상당액 = §97의2④ 세액 − §97 세액 (결정세액 · 계획서 Q-6)
 *
 * 사례(계획서 §7.2): 비상장 대주주 · 비중소 · 1만 주 · 상속평가 5만/주(5억) · 피상속인 5천/주 · 양도 8만/주(8억)
 *   상속개시 2024-03-01 · 양도 2026-06-01. 수정 전 실측(§3.3): 엔진에 §97의2④ 경로가 없어 59,500,000.
 * 계획서: docs/02-design/features/fb-97-2-4-fixes.plan.md §7
 */
import { describe, it, expect } from "vitest";
import {
  calculateStockTransferTax,
  calculateStockTransferTaxAggregate,
} from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { FamilyBusinessRateBasis } from "@/lib/tax-engine/family-business-applied-rate";
import { STOCK_FB_PRE_2014_NOTICE } from "@/lib/tax-engine/stock-transfer/stock-family-business";

const D = (s: string) => new Date(s);

function unlisted(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: 0.6,
    selfMarketCap: 2_000_000_000,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: D("2025-12-31"),
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    isListedSmallShareholder: false,
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    acquisitionDate: D("2024-03-01"),
    transferDate: D("2026-06-01"),
    shareCount: 10_000,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "inheritance",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: 80_000,
    acquisitionMode: "actual",
    acquiredBeforeListing: false,
    perShareAcquisitionPrice: 50_000,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    ...o,
  } as StockTransferInput;
}

/**
 * 기본 양도일(2026-06-01)은 신 ③2호 시대다 — 주식(법인가업 대상 자산)의 적용률은
 * (총자산가액 − 사업무관자산) ÷ 총자산가액이라 분자 n · 분모 d를 그 모양으로 싣는다.
 */
const ratio = (n: number, d: number): FamilyBusinessRateBasis => ({
  kind: "corporate_business_assets",
  totalAssets: d,
  nonBusinessAssets: d - n,
});
/** 구 ③(양도일 2026.2.26. 이전) — 공제금액 ÷ 가업상속 재산가액 */
const deduction = (deductionAmount: number, businessEstateValue: number): FamilyBusinessRateBasis => ({
  kind: "deduction_ratio",
  deductionAmount,
  businessEstateValue,
});

function fb(basis: FamilyBusinessRateBasis, o: Partial<StockTransferInput> = {}, perShare = 5_000) {
  return unlisted({
    familyBusinessInheritance: { decedentAcquisitionPricePerShare: perShare, fbRateBasis: basis },
    ...o,
  });
}

describe("F-1 주식 §97의2④ — 단건", () => {
  it("F1-B: 가업상속 입력 없음 — 상속개시일 평가액 5억 그대로(수정 전과 같음)", () => {
    const r = calculateStockTransferTax(unlisted());
    expect(r.acquisitionPrice).toBe(500_000_000);
    expect(r.transferIncome).toBe(300_000_000);
    expect(r.taxBase).toBe(297_500_000);
    expect(r.finalTax).toBe(59_500_000);
    expect(r.localIncomeTax).toBe(5_950_000);
    expect(r.familyBusinessDetail).toBeUndefined();
  });

  it("F1-2·2c: 적용률 0.8 — 의제 취득가 140,000,000 · 산출 149,375,000 · §18의2⑩ 공제 89,875,000", () => {
    const r = calculateStockTransferTax(fb(ratio(8, 10)));
    expect(r.acquisitionPrice).toBe(140_000_000);
    expect(r.transferIncome).toBe(660_000_000);
    expect(r.taxBase).toBe(657_500_000);
    expect(r.calculatedTax).toBe(149_375_000);
    expect(r.finalTax).toBe(149_375_000);
    expect(r.localIncomeTax).toBe(14_937_500);
    expect(r.familyBusinessDetail).toMatchObject({
      imputedAcquisitionPrice: 140_000_000,
      decedentAcquisitionPrice: 50_000_000,
      decedentAcquisitionPricePerShare: 5_000,
      shareCount: 10_000,
      inheritanceMarketValue: 500_000_000,
      appliedRate: 0.8,
      appliedRateBasis: ratio(8, 10),
      cgtUnderSection97_2_4: 149_375_000,
      cgtUnderSection97: 59_500_000,
      creditAmount: 89_875_000,
    });
  });

  it("Q-6: 비교는 결정세액(가산세 전) — 과소신고 가산세가 붙어도 공제는 89,875,000", () => {
    const r = calculateStockTransferTax(fb(ratio(8, 10), { filingViolation: "under_report" }));
    expect(r.underReportPenalty).toBeGreaterThan(0);
    expect(r.finalTax).toBeGreaterThan(r.calculatedTax);
    expect(r.familyBusinessDetail).toMatchObject({
      cgtUnderSection97_2_4: 149_375_000,
      cgtUnderSection97: 59_500_000,
      creditAmount: 89_875_000,
    });
  });

  it("F1-4: 적용률 1/3 — 항별 절사 16,666,666 + 333,333,333 = 349,999,999 · 산출 96,875,000", () => {
    const r = calculateStockTransferTax(fb(ratio(1, 3)));
    expect(r.acquisitionPrice).toBe(349_999_999);
    expect(r.transferIncome).toBe(450_000_001);
    expect(r.taxBase).toBe(447_500_001);
    expect(r.finalTax).toBe(96_875_000);
    expect(r.localIncomeTax).toBe(9_687_500);
  });

  it("F1-3: 적용률 0 → 상속개시일 평가액 · 1 → 피상속인 취득가액", () => {
    expect(calculateStockTransferTax(fb(ratio(0, 10))).acquisitionPrice).toBe(500_000_000);
    expect(calculateStockTransferTax(fb(ratio(10, 10))).acquisitionPrice).toBe(50_000_000);
  });

  it("F1-18: 피상속인 자본적지출은 base에 더한 뒤 적용률을 곱한다 — (5천만 + 1천만) × 0.8 + 5억 × 0.2", () => {
    const r = calculateStockTransferTax(
      unlisted({
        familyBusinessInheritance: {
          decedentAcquisitionPricePerShare: 5_000,
          decedentCapitalExpenditure: 10_000_000,
          fbRateBasis: ratio(8, 10),
        },
      }),
    );
    expect(r.acquisitionPrice).toBe(148_000_000);
    expect(r.familyBusinessDetail?.decedentCapitalExpenditure).toBe(10_000_000);
  });

  it("F1-5: 의제 취득가가 평가액보다 커서 세액이 줄면 §18의2⑩ 공제 0(음수 가드)", () => {
    const r = calculateStockTransferTax(fb(ratio(8, 10), {}, 60_000));
    expect(r.acquisitionPrice).toBe(580_000_000);
    expect(r.familyBusinessDetail!.cgtUnderSection97_2_4).toBeLessThan(59_500_000);
    expect(r.familyBusinessDetail!.creditAmount).toBe(0);
  });

  it("F1-6: 상속개시일 2013-12-31 → 특례 미적용 + 안내 · 2014-01-01 → 적용 (부칙 법률 제12169호 §12)", () => {
    const pre = calculateStockTransferTax(fb(ratio(8, 10), { acquisitionDate: D("2013-12-31") }));
    expect(pre.acquisitionPrice).toBe(500_000_000);
    expect(pre.familyBusinessDetail).toBeUndefined();
    expect(pre.warnings).toContain(STOCK_FB_PRE_2014_NOTICE);
    const on = calculateStockTransferTax(fb(ratio(8, 10), { acquisitionDate: D("2014-01-01") }));
    expect(on.acquisitionPrice).toBe(140_000_000);
  });

  it("F1-7: 양도일 경계 — 02-26은 구 ③(공제 ÷ 재산가액) · 02-27은 ③2호(법인 총자산) · 섞으면 throw", () => {
    const old = calculateStockTransferTax(fb(deduction(8, 10), { transferDate: D("2026-02-26") }));
    expect(old.acquisitionPrice).toBe(140_000_000);
    expect(old.familyBusinessDetail?.appliedRateBasis.kind).toBe("deduction_ratio");
    const corp = calculateStockTransferTax(
      fb(
        { kind: "corporate_business_assets", totalAssets: 5_000_000_000, nonBusinessAssets: 1_000_000_000 },
        { transferDate: D("2026-02-27") },
      ),
    );
    expect(corp.acquisitionPrice).toBe(140_000_000);
    expect(corp.finalTax).toBe(149_375_000);
    expect(() => calculateStockTransferTax(fb(deduction(8, 10), { transferDate: D("2026-02-27") }))).toThrow(/§163의2 ③ 2호/);
    expect(() => calculateStockTransferTax(fb(ratio(8, 10), { transferDate: D("2026-02-26") }))).toThrow(/구 소득세법 시행령 §163의2③/);
  });

  it("F1-13: 의제 취득가가 양도가를 넘으면 양도차손 — 손실 그대로(공제 0)", () => {
    // 피상속인 9만/주 · 적용률 1 → 의제 9억 > 양도가 8억
    const r = calculateStockTransferTax(fb(ratio(10, 10), {}, 90_000));
    expect(r.acquisitionPrice).toBe(900_000_000);
    expect(r.transferIncome).toBe(-100_000_000);
    expect(r.finalTax).toBe(0);
    expect(r.familyBusinessDetail).toMatchObject({ cgtUnderSection97_2_4: 0, cgtUnderSection97: 59_500_000, creditAmount: 0 });
  });

  it("F1-14: 상장 대주주(코스닥) 주식도 같은 의제 취득가", () => {
    const r = calculateStockTransferTax(fb(ratio(8, 10), { marketType: "kosdaq", selfMarketCap: 10_000_000_000 }));
    expect(r.acquisitionPrice).toBe(140_000_000);
    expect(r.familyBusinessDetail?.imputedAcquisitionPrice).toBe(140_000_000);
  });

  it("F1-8·9·17: 상속 외 원인 · 실가 외 모드 · 피상속인 취득가 0 · 분모 0은 엔진이 throw(route는 ⑨⑩⑫가 먼저 막는다)", () => {
    expect(() => calculateStockTransferTax(fb(ratio(8, 10), { acquisitionCause: "purchase" }))).toThrow(/상속/);
    expect(() => calculateStockTransferTax(fb(ratio(8, 10), { acquisitionMode: "estimated" }))).toThrow(/실지거래가액/);
    expect(() => calculateStockTransferTax(fb(ratio(8, 10), {}, 0))).toThrow(/피상속인/);
    expect(() => calculateStockTransferTax(fb(ratio(0, 0)))).toThrow(/총자산가액/);
  });

  it("합계 입력 모드 상속평가(5억 총액)도 같은 값 — 평가액은 실가 취득가 총액 leaf에서 읽는다", () => {
    const r = calculateStockTransferTax(
      fb(ratio(8, 10), {
        acquisitionActualInputMode: "total",
        acquisitionTotalPrice: 500_000_000,
        perShareAcquisitionPrice: undefined,
      }),
    );
    expect(r.acquisitionPrice).toBe(140_000_000);
  });
});

describe("F-1 주식 §97의2④ — 다종목(신고 단위 결정세액 비교)", () => {
  /** 매매 종목 — 비상장 중소 소액주주 10% · 차익 3,750만 · 먼저 양도해 기본공제 250만을 가져간다 */
  const purchase = unlisted({
    isMajorShareholder: false,
    selfShareRatio: 0.001,
    selfMarketCap: 10_000_000,
    isSmallMediumEnterprise: true,
    acquisitionCause: "purchase",
    acquisitionDate: D("2025-01-10"),
    transferDate: D("2026-03-01"),
    shareCount: 1_000,
    perShareAcquisitionPrice: 10_000,
    perShareTransferPrice: 47_500,
  });

  it("F1-11: 가업(0.8) + 매매 — A 153,500,000 · B 63,500,000 · 공제 90,000,000(종목 단독 89,875,000과 다르다)", () => {
    const r = calculateStockTransferTaxAggregate([purchase, fb(ratio(8, 10))]);
    expect(r.totalFinalTax).toBe(153_500_000);
    expect(r.items[0].familyBusinessDetail).toBeUndefined();
    expect(r.items[1].acquisitionPrice).toBe(140_000_000);
    expect(r.items[1].familyBusinessDetail).toMatchObject({
      cgtUnderSection97_2_4: 153_500_000,
      cgtUnderSection97: 63_500_000,
      creditAmount: 90_000_000,
      fbItemCount: 1,
    });
  });

  it("가업 2종목 — 공제는 둘 다 §97로 되돌린 신고 단위 총차이 1회 · 두 종목에 같은 값(리뷰 반례: 종목별 한계 합 98,875,000 > 의제 세액)", () => {
    const a = fb(ratio(8, 10), { transferDate: D("2026-03-01"), perShareTransferPrice: 30_000 });
    const b = fb(ratio(8, 10), { perShareTransferPrice: 70_000 }, 40_000);
    const r = calculateStockTransferTaxAggregate([a, b]);
    const allRegular = calculateStockTransferTaxAggregate([
      { ...a, familyBusinessInheritance: undefined },
      { ...b, familyBusinessInheritance: undefined },
    ]);
    const d0 = r.items[0].familyBusinessDetail!;
    const d1 = r.items[1].familyBusinessDetail!;
    expect(d0.cgtUnderSection97_2_4).toBe(r.totalDeterminedTax);
    expect(d0.cgtUnderSection97).toBe(allRegular.totalDeterminedTax);
    expect(d0.creditAmount).toBe(Math.max(0, r.totalDeterminedTax - allRegular.totalDeterminedTax));
    expect(d0.creditAmount).toBeLessThanOrEqual(r.totalDeterminedTax);
    expect(d0.fbItemCount).toBe(2);
    expect(d1).toMatchObject({ cgtUnderSection97_2_4: d0.cgtUnderSection97_2_4, cgtUnderSection97: d0.cgtUnderSection97, creditAmount: d0.creditAmount });
    expect(r.items.map((x) => x.acquisitionPrice)).toEqual([140_000_000, 420_000_000]);
  });

  it("F1-12: 이월과세 종목과 섞여도 가업 종목 위치에만 detail · 공제는 신고 단위 차이", () => {
    const gift = unlisted({
      acquisitionCause: "carryover_gift",
      acquisitionDate: D("2025-09-01"),
      transferDate: D("2026-03-01"),
      donorAcquisitionDate: D("2015-03-01"),
      donorRelation: "spouse",
      donorDeceased: false,
      donorAcquisitionPrice: 30_000,
      shareCount: 1_000,
      perShareAcquisitionPrice: 60_000,
    });
    const r = calculateStockTransferTaxAggregate([gift, fb(ratio(8, 10))]);
    expect(r.items[0].familyBusinessDetail).toBeUndefined();
    expect(r.items[1].familyBusinessDetail?.fbItemCount).toBe(1);
    expect(r.items[1].familyBusinessDetail?.cgtUnderSection97_2_4).toBe(r.totalDeterminedTax);
  });

  it("F1-15: 단건 ≡ 합산 n=1", () => {
    const single = calculateStockTransferTax(fb(ratio(1, 3)));
    const agg = calculateStockTransferTaxAggregate([fb(ratio(1, 3))]);
    expect(agg.totalFinalTax).toBe(single.finalTax);
    expect(agg.items[0].familyBusinessDetail).toEqual(single.familyBusinessDetail);
  });

  it("다종목 G-1 탈락 종목은 안내만 붙고 detail이 없다", () => {
    const r = calculateStockTransferTaxAggregate([purchase, fb(ratio(8, 10), { acquisitionDate: D("2013-06-01") })]);
    expect(r.items[1].acquisitionPrice).toBe(500_000_000);
    expect(r.items[1].familyBusinessDetail).toBeUndefined();
    expect(r.items[1].warnings).toContain(STOCK_FB_PRE_2014_NOTICE);
  });
});
