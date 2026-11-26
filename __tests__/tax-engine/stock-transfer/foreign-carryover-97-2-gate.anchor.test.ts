/**
 * 국외주식 이월과세 §97의2① — 게이트(G) · 필요경비(E) anchor
 *
 * 기준 사례 FC-1(`foreign-carryover-97-2-fixtures.ts`): A 49,500,000 / B 39,500,000.
 * 기대값은 손계산(양도차익 − 기본공제 250만원 → ×20%)이며 계획서 §8 probe 값과 일치한다.
 */
import { describe, it, expect } from "vitest";

import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { calculateForeignStockTax } from "@/lib/tax-engine/stock-transfer/foreign-stock";
import {
  buildForeignScenarioA,
  isForeignCarryoverEligible,
} from "@/lib/tax-engine/stock-transfer/foreign-stock-carryover";
import { FOREIGN_BASE, FOREIGN_CARRYOVER } from "./foreign-carryover-97-2-fixtures";

const D = (s: string) => new Date(s);

describe("G — 게이트", () => {
  it("G-1 미선언/purchase는 종전 결과와 한 톨도 다르지 않다 (donor 잔존 입력도 무시)", () => {
    const before = calculateForeignStockTax(FOREIGN_BASE);
    const viaOrchestrator = calculateStockTransferTax(FOREIGN_BASE);
    expect(viaOrchestrator).toEqual(before);
    expect("carryoverOutcome" in viaOrchestrator).toBe(false);

    const purchaseWithResidue = calculateStockTransferTax({ ...FOREIGN_CARRYOVER, acquisitionCause: "purchase" });
    expect(purchaseWithResidue).toEqual(before);
  });

  it("G-2 증여일 2024-12-31 → ⓒ 시기 불충족(부칙 §8 증여받는 자산부터 2025.1.1.)", () => {
    const r = calculateStockTransferTax({
      ...FOREIGN_CARRYOVER,
      acquisitionDate: D("2024-12-31"),
      donorAcquisitionDate: D("2024-08-01"),
      transferDate: D("2025-06-02"),
    });
    expect(r.incomeTax).toBe(39_500_000);
    expect(r.carryoverComparison).toBeUndefined();
  });

  it("G-3 증여일 2025-01-01 → 대상(ⓒ 경계)", () => {
    const r = calculateStockTransferTax({
      ...FOREIGN_CARRYOVER,
      acquisitionDate: D("2025-01-01"),
      donorAcquisitionDate: D("2024-08-01"),
      transferDate: D("2025-12-02"),
    });
    expect(r.incomeTax).toBe(49_500_000);
    expect(r.carryoverOutcome).toBe("applied");
  });

  it("G-4/G-5 양도일 = 증여일 + 1년은 대상, + 1일은 제외 (ⓓ 경계)", () => {
    const on = calculateStockTransferTax({ ...FOREIGN_CARRYOVER, transferDate: D("2027-01-05") });
    expect(on.carryoverOutcome).toBe("applied");
    const over = calculateStockTransferTax({ ...FOREIGN_CARRYOVER, transferDate: D("2027-01-06") });
    expect(over.carryoverComparison).toBeUndefined();
    expect(over.incomeTax).toBe(39_500_000);
  });

  it("G-6/G-7 배우자: 이혼 소멸(사망 아님)은 적용, 사별은 제외", () => {
    expect(calculateStockTransferTax({ ...FOREIGN_CARRYOVER, donorDeceased: false }).incomeTax).toBe(49_500_000);
    const widowed = calculateStockTransferTax({ ...FOREIGN_CARRYOVER, donorDeceased: true });
    expect(widowed.incomeTax).toBe(39_500_000);
    expect(widowed.carryoverComparison).toBeUndefined();
  });

  it("G-8 직계존비속 양도 당시 사망: 양도일 2025-12-31은 적용, 2026-01-01은 제외 (제21221호 부칙 §7)", () => {
    const base = {
      ...FOREIGN_CARRYOVER,
      donorRelation: "lineal" as const,
      donorDeceased: true,
      acquisitionDate: D("2025-06-01"),
      donorAcquisitionDate: D("2025-01-01"),
    };
    expect(calculateStockTransferTax({ ...base, transferDate: D("2025-12-31") }).carryoverOutcome).toBe("applied");
    const after = calculateStockTransferTax({ ...base, transferDate: D("2026-01-01") });
    expect(after.carryoverComparison).toBeUndefined();
    expect(after.incomeTax).toBe(39_500_000);
  });

  it("G-9 관계 「그 밖」은 제외 / 직계존비속 생존은 적용", () => {
    expect(calculateStockTransferTax({ ...FOREIGN_CARRYOVER, donorRelation: "other" }).incomeTax).toBe(39_500_000);
    expect(calculateStockTransferTax({ ...FOREIGN_CARRYOVER, donorRelation: "lineal" }).incomeTax).toBe(49_500_000);
  });

  it("G-10 거주 5년 미만(§118의2)은 납세의무 없음 — 비교 없음", () => {
    const r = calculateStockTransferTax({ ...FOREIGN_CARRYOVER, yearsResidentInKorea: 4 });
    expect(r.taxCategory).toBe("not_liable");
    expect(r.incomeTax).toBe(0);
    expect(r.carryoverComparison).toBeUndefined();
  });

  it("G-11 승계 입력이 비어 직접 도달하면 0원 취득가액으로 계산하지 않고 대상에서 제외한다", () => {
    for (const patch of [
      { donorPerShareAcquisitionPriceForeign: undefined },
      { donorAcquisitionExchangeRate: undefined },
      { donorAcquisitionMode: undefined },
      { donorAcquisitionDate: undefined },
      { donorCapitalExpenditureForeign: 100 }, // 지출일 환율 없음 — 양도일 환율로 대신하지 않는다(Q-4)
    ]) {
      const input = { ...FOREIGN_CARRYOVER, ...patch };
      expect(isForeignCarryoverEligible(input)).toBe(false);
      expect(calculateStockTransferTax(input).incomeTax).toBe(39_500_000);
    }
  });
});

describe("E — 필요경비", () => {
  it("E-1 증여자 취득일 환율을 쓴다 — 취득가액 항목별 floor", () => {
    const r = calculateStockTransferTax({
      ...FOREIGN_CARRYOVER,
      donorPerShareAcquisitionPriceForeign: 400.55,
      donorAcquisitionExchangeRate: 1_250.5,
    });
    // 400.55 × 100 × 1,250.5 = 50,088,... → floor
    expect(r.acquisitionPriceKrw).toBe(Math.floor(400.55 * 100 * 1_250.5));
    expect(r.carryoverDonorAcquisitionPriceKrw).toBe(r.acquisitionPriceKrw);
    expect(r.carryoverGiftDateAcquisitionPriceKrw).toBe(100_000_000);
  });

  it("E-2 증여자 자본적지출은 증여자 지출일 환율, 수증자 필요경비는 각자 환율로 — 합산", () => {
    const r = calculateStockTransferTax({
      ...FOREIGN_CARRYOVER,
      donorCapitalExpenditureForeign: 1_000,
      donorCapitalExpenditureExchangeRate: 1_200, // 1,200,000
      capitalExpenditureForeign: 100,
      capitalExpenditureExchangeRate: 1_300, // 130,000
      transferCostForeign: 200, // 양도비는 수증자 것만 — 양도일 환율 1,500 → 300,000
    });
    expect(r.carryoverDonorCapexKrw).toBe(1_200_000);
    expect(r.necessaryExpensesKrw).toBe(1_630_000);
    // 양도차익 300,000,000 − 50,000,000 − 1,630,000 = 248,370,000 → 과표 245,870,000 → 49,174,000
    expect(r.incomeTax).toBe(49_174_000);
    expect(r.carryoverComparison?.excludedTotalTax).toBe(39_414_000); // B: 199,570,000 → 197,070,000
  });

  it("E-3 증여세 상당액: 안분(BigInt) 후 필요경비에 가산", () => {
    const r = calculateStockTransferTax({
      ...FOREIGN_CARRYOVER,
      giftTaxAmount: 10_000_000,
      transferredAssetValue: 50_000_000,
      giftTaxableValue: 100_000_000,
    });
    expect(r.carryoverGiftTaxIncluded).toBe(5_000_000);
    // 양도차익 250,000,000 − 5,000,000 = 245,000,000 → 과표 242,500,000 → 48,500,000
    expect(r.incomeTax).toBe(48_500_000);
  });

  it("E-3b 증여세 한도 = 증여세 가산 직전 양도차익 (영 §163의2② 후단)", () => {
    const a = buildForeignScenarioA(
      { ...FOREIGN_CARRYOVER, giftTaxAmount: 400_000_000, transferredAssetValue: 100_000_000, giftTaxableValue: 100_000_000 },
      (i) => calculateForeignStockTax(i).transferGain,
    );
    expect(a.carryoverGiftTaxExpense).toBe(250_000_000); // 안분 400,000,000이 아니라 한도 250,000,000
  });

  it("E-5 외국납부세액공제(credit): 비교는 공제 후 결정세액", () => {
    const r = calculateStockTransferTax({
      ...FOREIGN_CARRYOVER,
      hasForeignTax: true,
      foreignTaxPaidForeign: 20_000,
      foreignTaxExchangeRate: 1_500, // 30,000,000
      foreignTaxMethod: "credit",
    });
    expect(r.incomeTax).toBe(49_500_000);
    expect(r.foreignTaxCreditApplied).toBe(30_000_000);
    expect(r.carryoverComparison).toEqual({ appliedTotalTax: 19_500_000, excludedTotalTax: 9_500_000 });
  });

  it("E-6 외국납부세액 필요경비 산입(expense)은 A·B 공통", () => {
    const r = calculateStockTransferTax({
      ...FOREIGN_CARRYOVER,
      hasForeignTax: true,
      foreignTaxPaidForeign: 20_000,
      foreignTaxExchangeRate: 1_500,
      foreignTaxMethod: "expense",
    });
    // A: 250,000,000 − 30,000,000 = 220,000,000 → 217,500,000 → 43,500,000 / B: 170,000,000 → 33,500,000
    expect(r.incomeTax).toBe(43_500_000);
    expect(r.carryoverComparison).toEqual({ appliedTotalTax: 43_500_000, excludedTotalTax: 33_500_000 });
  });

  it("E-7 중소기업 10%: 세율은 A·B 공통이고 필요경비만 갈린다", () => {
    const r = calculateStockTransferTax({ ...FOREIGN_CARRYOVER, isSmallMediumEnterprise: true });
    expect(r.appliedRate).toBe(0.1);
    expect(r.incomeTax).toBe(24_750_000);
    expect(r.carryoverComparison).toEqual({ appliedTotalTax: 24_750_000, excludedTotalTax: 19_750_000 });
  });

  it("E-8 market_price(영 §178의3 시가)는 같은 슬롯 + 시가 확인 경고", () => {
    const r = calculateStockTransferTax({ ...FOREIGN_CARRYOVER, donorAcquisitionMode: "market_price" });
    expect(r.incomeTax).toBe(49_500_000);
    expect(r.warnings.some((w) => w.includes("§178의3"))).toBe(true);
  });

  it("E-11 동률이면 적용을 유지한다 (「적은 경우」가 아니다)", () => {
    const r = calculateStockTransferTax({
      ...FOREIGN_CARRYOVER,
      donorPerShareAcquisitionPriceForeign: 800,
      donorAcquisitionExchangeRate: 1_250,
    });
    expect(r.carryoverOutcome).toBe("applied");
    expect(r.carryoverComparison).toEqual({ appliedTotalTax: 39_500_000, excludedTotalTax: 39_500_000 });
  });

  it("세율·보유기간은 이월과세로 바뀌지 않는다 — §104②가 12호를 열거하지 않는다", () => {
    const r = calculateStockTransferTax(FOREIGN_CARRYOVER);
    expect(r.appliedRate).toBe(0.2);
    expect(r.progressiveDeduction).toBe(0);
  });
});
