/**
 * 국외주식 이월과세 §97의2② — 단건↔합산 일치(M-1) · 혼합 후보 집합(M-2~M-6) · 국내 회귀(M-4)
 *
 * 국내(가·나목)·국외(다목)는 §102①2호 통산 · §103①2호 기본공제 250만원이 **같은 그룹**이라
 * 한 후보 집합의 2ⁿ 조합으로 함께 푼다.
 */
import { describe, it, expect } from "vitest";

import {
  calculateStockTransferTax,
  calculateStockTransferTaxAggregate,
} from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { ForeignStockInput } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";
import { FOREIGN_BASE, FOREIGN_CARRYOVER } from "./foreign-carryover-97-2-fixtures";
import { carryover, stock, D } from "./carryover-97-2-fixtures";

/** 국내 픽스처와 같은 과세기간(2025)에 양도하는 국외 종목 */
const F2025: ForeignStockInput = {
  ...FOREIGN_BASE,
  acquisitionDate: D("2025-06-01"),
  transferDate: D("2025-12-01"),
};
const F2025_CARRY: ForeignStockInput = {
  ...FOREIGN_CARRYOVER,
  acquisitionDate: D("2025-06-01"),
  transferDate: D("2025-12-01"),
  donorAcquisitionDate: D("2025-03-01"),
};
/** 수동으로 시나리오 A를 만든 종목 — 취득 슬롯을 증여자 값으로 치환(오라클) */
const manualA = (f: ForeignStockInput): ForeignStockInput => ({
  ...f,
  acquisitionCause: undefined,
  perShareAcquisitionPriceForeign: f.donorPerShareAcquisitionPriceForeign,
  acquisitionExchangeRate: f.donorAcquisitionExchangeRate!,
});
const manualB = (f: ForeignStockInput): ForeignStockInput => ({ ...f, acquisitionCause: undefined });

describe("M-1 단건 = 합산 n=1 (dual-truth 방지)", () => {
  it("FC-1: 적용", () => {
    const single = calculateStockTransferTax(FOREIGN_CARRYOVER);
    const agg = calculateStockTransferTaxAggregate([FOREIGN_CARRYOVER]);
    expect(agg.totalFinalTax).toBe(single.finalTax);
    expect(agg.items[0].carryoverDetail).toEqual({
      outcome: "applied",
      appliedTotalTax: single.carryoverComparison!.appliedTotalTax,
      excludedTotalTax: single.carryoverComparison!.excludedTotalTax,
      comparisonPerformed: true,
      donorCapexIncluded: 0,
      giftTaxIncluded: 0,
    });
  });

  it("PD-2: 배제", () => {
    const input = { ...FOREIGN_CARRYOVER, donorPerShareAcquisitionPriceForeign: 1_600 };
    const single = calculateStockTransferTax(input);
    const agg = calculateStockTransferTaxAggregate([input]);
    expect(agg.totalFinalTax).toBe(single.finalTax);
    expect(agg.totalFinalTax).toBe(39_500_000);
    expect(agg.items[0].carryoverDetail?.outcome).toBe("excluded");
  });

  it("어댑터가 원화 환산 echo(foreignDetail.carryover)를 싣는다 — 다건 카드가 뜨는 길", () => {
    const agg = calculateStockTransferTaxAggregate([FOREIGN_CARRYOVER]);
    expect(agg.items[0].foreignDetail?.carryover).toEqual({
      donorAcquisitionPriceKrw: 50_000_000,
      giftDateAcquisitionPriceKrw: 100_000_000,
      donorExchangeRate: 1_250,
      donorAcquisitionCurrencyCode: "USD",
      donorAcquisitionDate: D("2025-08-01"),
    });
  });
});

describe("M-3 국외 이월과세 2건 — 2² 조합", () => {
  it("두 종목 모두 적용: 비교 금액은 그 종목만 토글한 전체 결정세액이다 (수동 조합 오라클)", () => {
    const agg = calculateStockTransferTaxAggregate([F2025_CARRY, F2025_CARRY]);
    const total = (list: ForeignStockInput[]) => calculateStockTransferTaxAggregate(list).totalFinalTax;
    const AA = total([manualA(F2025_CARRY), manualA(F2025_CARRY)]);
    const AB = total([manualA(F2025_CARRY), manualB(F2025_CARRY)]);
    expect(AA).toBe(99_500_000); // (250M+250M−2.5M) × 20%
    expect(AB).toBe(89_500_000);
    expect(agg.totalFinalTax).toBe(AA);
    for (const item of agg.items) {
      expect(item.carryoverDetail).toMatchObject({ outcome: "applied", appliedTotalTax: AA, excludedTotalTax: AB });
    }
  });
});

describe("M-4 국내 이월과세 + 국외 비-이월과세 — 종전 결과 불변", () => {
  it("HEAD(국외 미지원) 트리에서 실측한 값과 같다", () => {
    // 값은 이 변경 이전 트리(HEAD)에서 같은 입력으로 실측했다(2026-11-26 probe).
    const agg = calculateStockTransferTaxAggregate([carryover({ filingType: "final" }), F2025], "aggregate");
    expect(agg.totalFinalTax).toBe(199_375_000);
    expect(agg.totalLocalIncomeTax).toBe(19_937_500);
    expect(agg.items[0].finalTax).toBe(159_375_000);
    expect(agg.items[0].carryoverDetail).toMatchObject({
      outcome: "applied",
      appliedTotalTax: 199_375_000,
      excludedTotalTax: 99_250_000,
    });
    expect(agg.items[1].finalTax).toBe(40_000_000);
    expect(agg.items[1].carryoverDetail).toBeUndefined();
  });
});

describe("M-2·M-5 국내와 국외가 한 후보 집합", () => {
  it("M-2 국내 비-이월과세가 먼저 기본공제를 소진하면 국외 A−B 차이는 순수 20%×50,000,000", () => {
    const domestic = stock({ acquisitionDate: D("2024-01-01"), transferDate: D("2025-03-01"), filingType: "final" });
    const agg = calculateStockTransferTaxAggregate([domestic, F2025_CARRY], "aggregate");
    const cmp = agg.items[1].carryoverDetail!;
    expect(cmp.outcome).toBe("applied");
    expect(cmp.appliedTotalTax - cmp.excludedTotalTax).toBe(10_000_000);
    expect(agg.totalFinalTax).toBe(cmp.appliedTotalTax);
  });

  it("M-5 국내+국외 모두 이월과세: 각 종목이 자기 재생산(고정점) 조합이다", () => {
    const agg = calculateStockTransferTaxAggregate(
      [carryover({ filingType: "final" }), F2025_CARRY],
      "aggregate",
    );
    for (const item of agg.items) {
      const c = item.carryoverDetail!;
      expect(c.outcome === "applied").toBe(c.appliedTotalTax >= c.excludedTotalTax);
      expect(agg.totalFinalTax).toBe(c.outcome === "applied" ? c.appliedTotalTax : c.excludedTotalTax);
    }
  });
});

describe("M-6 대상 종목 상한", () => {
  it("국내+국외 합산 11건이면 조합 비교를 계산하지 않고 오류", () => {
    const eleven = Array.from({ length: 11 }, () => F2025_CARRY);
    expect(() => calculateStockTransferTaxAggregate(eleven)).toThrow(/이월과세 대상 종목이 11건/);
  });
});
