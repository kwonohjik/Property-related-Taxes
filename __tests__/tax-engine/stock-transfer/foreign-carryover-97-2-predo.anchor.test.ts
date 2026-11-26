/**
 * Pre-Do anchor PD-1~PD-5 — 국외주식(§94①3호다목) 이월과세 §97의2①
 *
 * 엔진 미수정 상태에서 **먼저 실패**하는 것을 확인한 뒤 구현한다(feedback_pre_anchor_verification).
 * 기대값은 현행 `calculateForeignStockTax`에 취득 슬롯을 수동 치환해 얻은 probe 값이다
 * (계획서 engine.plan §8.1 · 본문 §8).
 */
import { describe, it, expect } from "vitest";

import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { FOREIGN_BASE, FOREIGN_CARRYOVER } from "./foreign-carryover-97-2-fixtures";
import { STOCK_FOREIGN_CARRYOVER } from "@/lib/tax-engine/legal-codes/stock-foreign-carryover";

describe("PD — 국외주식 이월과세 §97의2① (FC-1 교재 사례)", () => {
  it("PD-1 FC-1: 적용(A) 49,500,000 ≥ 미적용(B) 39,500,000 → applied", () => {
    const r = calculateStockTransferTax(FOREIGN_CARRYOVER);
    expect(r.incomeTax).toBe(49_500_000);
    expect(r.carryoverOutcome).toBe("applied");
    expect(r.carryoverComparison).toEqual({ appliedTotalTax: 49_500_000, excludedTotalTax: 39_500_000 });
    // 취득가액 = 증여자 USD 400 × 100주 × 1,250 = 50,000,000 (수증자 100,000,000 아님)
    expect(r.acquisitionPriceKrw).toBe(50_000_000);
    // 적용 조문 목록에 이월과세 근거(§97의2① 3호 자산 1년 · §104② 12호 미열거 · 영 §178의4)가 실린다
    expect(r.appliedRules).toEqual(
      expect.arrayContaining([
        STOCK_FOREIGN_CARRYOVER.SCOPE_STOCK_3HO_ONE_YEAR,
        STOCK_FOREIGN_CARRYOVER.HOLDING_PERIOD_NOT_12HO,
        STOCK_FOREIGN_CARRYOVER.DECREE_178_4_NECESSARY,
      ]),
    );
  });

  it("PD-2 증여자 취득가가 증여가보다 높으면(USD 1,600@1,250) A < B → 배제(②3호)", () => {
    const r = calculateStockTransferTax({ ...FOREIGN_CARRYOVER, donorPerShareAcquisitionPriceForeign: 1_600 });
    expect(r.incomeTax).toBe(39_500_000);
    expect(r.carryoverOutcome).toBe("excluded");
    expect(r.carryoverComparison).toEqual({ appliedTotalTax: 19_500_000, excludedTotalTax: 39_500_000 });
  });

  it("PD-3 양도가 증여일로부터 1년 초과(2027-01-06) → ⓓ 불충족, 비교 없음", () => {
    const r = calculateStockTransferTax({ ...FOREIGN_CARRYOVER, transferDate: new Date("2027-01-06") });
    expect(r.incomeTax).toBe(39_500_000);
    expect(r.carryoverComparison).toBeUndefined();
  });

  it("PD-4 관계 「그 밖」 → ⓔ 불충족, 비교 없음", () => {
    const r = calculateStockTransferTax({ ...FOREIGN_CARRYOVER, donorRelation: "other" });
    expect(r.incomeTax).toBe(39_500_000);
    expect(r.carryoverComparison).toBeUndefined();
  });

  it("PD-5 증여자 취득일 환율(1,100)을 쓴다 — 수증일 환율(1,250) 아님", () => {
    const r = calculateStockTransferTax({ ...FOREIGN_CARRYOVER, donorAcquisitionExchangeRate: 1_100 });
    // 취득 400 × 100 × 1,100 = 44,000,000 → 양도차익 256,000,000 → 과표 253,500,000
    expect(r.acquisitionPriceKrw).toBe(44_000_000);
    expect(r.incomeTax).toBe(50_700_000);
  });

  it("PD-0 미선언 기준 입력은 B 그대로(39,500,000)", () => {
    expect(calculateStockTransferTax(FOREIGN_BASE).incomeTax).toBe(39_500_000);
  });
});
