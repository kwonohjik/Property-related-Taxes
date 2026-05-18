/**
 * unlisted-direct-calc anchor tests.
 *
 * 계획서: stock-transfer-unlisted-direct-calc.plan.md v4 §10
 * Engine: stock-transfer-unlisted-direct-calc.engine.design.md v1
 *
 * 검증 범위:
 *  - adaptUnlistedFlatToApiBody — full 모드 74 필드 → 4 필드 reduce
 *  - shouldSkipNetIncome — 5개 지점 단일 진실 derive 함수
 *  - isNetAssetOnly === true 시 NI 호출 skip
 */

import { describe, test, expect } from "vitest";
import {
  adaptUnlistedFlatToApiBody,
  shouldSkipNetIncome,
  aggregateUnlistedNiPerShare,
  aggregateUnlistedNaPerShare,
} from "@/lib/tax-engine/stock-transfer/unlisted-flat-adapter";
import {
  createInitialStockFormData,
  type StockTransferFormData,
} from "@/lib/stores/calc-wizard-stock-store";

function makeForm(patch: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return { ...createInitialStockFormData(), ...patch };
}

describe("unlisted-direct-calc — shouldSkipNetIncome (E-6 단일 진실)", () => {
  test("EU-01: netAssetOnlyReason 빈 문자열 → false", () => {
    expect(shouldSkipNetIncome({ netAssetOnlyReason: "" })).toBe(false);
  });
  test("EU-02: stock_holding_company → true", () => {
    expect(shouldSkipNetIncome({ netAssetOnlyReason: "stock_holding_company" })).toBe(true);
  });
  test("EU-03: liquidation_or_owner_death → true", () => {
    expect(shouldSkipNetIncome({ netAssetOnlyReason: "liquidation_or_owner_death" })).toBe(true);
  });
});

describe("unlisted-direct-calc — aggregateUnlistedNiPerShare (NI 24행 → 1주당 가액)", () => {
  test("EU-05: 가산 100M, 차감 20M, 주식 10,000, 환원율 10% → 80,000", () => {
    const form = makeForm({
      niAddRow1EUTransfer: "100000000",
      niSubRow14EUTransfer: "20000000",
      niShareCountEUTransfer: "10000",
      niDiscountRateEUTransfer: "10",
    });
    expect(aggregateUnlistedNiPerShare(form, "EUTransfer")).toBe(80000);
    // (100M - 20M) / 10000 = 8,000 (perShareIncome)
    // 8,000 / 0.10 = 80,000 (perShareValue)
  });

  test("EU-06: 환원율 default(빈문자열 → 10%) 적용", () => {
    const form = makeForm({
      niAddRow1EUTransfer: "100000000",
      niShareCountEUTransfer: "10000",
      niDiscountRateEUTransfer: "", // default "10"
    });
    expect(aggregateUnlistedNiPerShare(form, "EUTransfer")).toBe(100000);
  });

  test("EU-07: 환원율 9.5% — 비-default", () => {
    const form = makeForm({
      niAddRow1EUTransfer: "95000000",
      niShareCountEUTransfer: "10000",
      niDiscountRateEUTransfer: "9.5",
    });
    // (95M / 10000) = 9,500 / 0.095 = 100,000
    expect(aggregateUnlistedNiPerShare(form, "EUTransfer")).toBe(100000);
  });
});

describe("unlisted-direct-calc — aggregateUnlistedNaPerShare (NA 19행 → 1주당 가액)", () => {
  test("EU-10: 자산 50M, 부채 30M, 영업권 5M, 주식 10,000 → 2,500", () => {
    const form = makeForm({
      naAssetTotalRow1EUTransfer: "50000000",
      naLiabTotalRow8EUTransfer: "30000000",
      naGoodwillRow19EUTransfer: "5000000",
      naShareCountEUTransfer: "10000",
    });
    // (50M - 30M + 5M) / 10000 = 25M/10000 = 2,500
    expect(aggregateUnlistedNaPerShare(form, "EUTransfer")).toBe(2500);
  });

  test("EU-11: 자산 가산/차감 적용", () => {
    const form = makeForm({
      naAssetTotalRow1EUTransfer: "50000000",
      naAssetAddRow2EUTransfer: "2000000",
      naAssetSubRow6EUTransfer: "1000000",
      naLiabTotalRow8EUTransfer: "30000000",
      naShareCountEUTransfer: "10000",
    });
    // assetSubtotal = 50M + 2M - 1M = 51M
    // netAssetAmount = 51M - 30M + 0 = 21M
    // perShareAsset = 21M / 10000 = 2,100
    expect(aggregateUnlistedNaPerShare(form, "EUTransfer")).toBe(2100);
  });
});

describe("unlisted-direct-calc — adaptUnlistedFlatToApiBody (4 필드 reduce)", () => {
  test("EU-13: full 모드 양/취 모두 산출 (isNetAssetOnly === false)", () => {
    const form = makeForm({
      unlistedValuationMode: "full",
      netAssetOnlyReason: "",
      niAddRow1EUTransfer: "100000000",
      niShareCountEUTransfer: "10000",
      niDiscountRateEUTransfer: "10",
      naAssetTotalRow1EUTransfer: "50000000",
      naLiabTotalRow8EUTransfer: "30000000",
      naShareCountEUTransfer: "10000",
      niAddRow1EUAcq: "80000000",
      niShareCountEUAcq: "10000",
      niDiscountRateEUAcq: "10",
      naAssetTotalRow1EUAcq: "40000000",
      naLiabTotalRow8EUAcq: "25000000",
      naShareCountEUAcq: "10000",
    });
    const reduced = adaptUnlistedFlatToApiBody(form);
    expect(reduced.transferNi).toBe(100000); // (100M/10000)/0.10
    expect(reduced.transferNa).toBe(2000);    // (50M-30M)/10000
    expect(reduced.acqNi).toBe(80000);
    expect(reduced.acqNa).toBe(1500);
  });

  test("EU-17: full + isNetAssetOnly === true → NI = 0, NA만 산출 (E-6 (2))", () => {
    const form = makeForm({
      unlistedValuationMode: "full",
      netAssetOnlyReason: "stock_holding_company",
      // NI 입력 (그러나 isNetAssetOnly이므로 skip)
      niAddRow1EUTransfer: "100000000",
      niShareCountEUTransfer: "10000",
      // NA 입력
      naAssetTotalRow1EUTransfer: "50000000",
      naLiabTotalRow8EUTransfer: "30000000",
      naShareCountEUTransfer: "10000",
      naAssetTotalRow1EUAcq: "40000000",
      naLiabTotalRow8EUAcq: "25000000",
      naShareCountEUAcq: "10000",
    });
    const reduced = adaptUnlistedFlatToApiBody(form);
    expect(reduced.transferNi).toBe(0); // skip
    expect(reduced.acqNi).toBe(0);       // skip
    expect(reduced.transferNa).toBe(2000);
    expect(reduced.acqNa).toBe(1500);
  });

  test("EU-17b: opts.niSkip 명시 → form.netAssetOnlyReason 비어있어도 skip", () => {
    const form = makeForm({
      unlistedValuationMode: "full",
      netAssetOnlyReason: "",
      niAddRow1EUTransfer: "100000000",
      niShareCountEUTransfer: "10000",
      naAssetTotalRow1EUTransfer: "50000000",
      naLiabTotalRow8EUTransfer: "30000000",
      naShareCountEUTransfer: "10000",
    });
    const reduced = adaptUnlistedFlatToApiBody(form, { niSkip: true });
    expect(reduced.transferNi).toBe(0);
    expect(reduced.transferNa).toBe(2000);
  });
});

describe("unlisted-direct-calc — store factory defaults (3중 패턴)", () => {
  test("EU-14: factory default — unlistedValuationMode === 'simple'", () => {
    const form = createInitialStockFormData();
    expect(form.unlistedValuationMode).toBe("simple");
  });

  test("EU-14b: factory default — 환원율 EUTransfer/EUAcq === '10'", () => {
    const form = createInitialStockFormData();
    expect(form.niDiscountRateEUTransfer).toBe("10");
    expect(form.niDiscountRateEUAcq).toBe("10");
  });

  test("EU-14c: factory default — 74 신규 필드 빈 문자열 (sample)", () => {
    const form = createInitialStockFormData();
    expect(form.niAddRow1EUTransfer).toBe("");
    expect(form.naGoodwillRow19EUAcq).toBe("");
    expect(form.naShareCountEUTransfer).toBe("");
  });
});
