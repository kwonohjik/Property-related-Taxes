/**
 * 국외주식 외화 → 원화 환산 1원 과소 정정 (계획서 `foreign-stock-fx-fixes.engine.plan.md` §1 · A-1-1~A-1-5)
 *
 * 부동소수 `Math.floor(외화 × 환율)`은 정확한 곱이 정수일 때 1원 과소가 났다(`400000 × 1300.10` → 520,039,999).
 * 엔진 환산 8곳 + 이월과세 2곳이 공용 leaf(`fx-krw.ts`)로 바뀐 것을 **엔진 출력**으로 고정한다
 * (leaf 단위가 아니라 `calculateForeignStockTax` 결과 — 엔진이 leaf를 안 쓰면 잡힌다).
 *
 * 값은 전부 손/독립 BigInt 기준 구현으로 도출했다:
 *   양도가액 400,000 USD × 1,300.10 = 520,040,000 (함정: 부동소수 520,039,999)
 *   취득가액 24 × 4,000주 × 1,000 = 96,000,000
 *   양도차익 424,040,000 → 기본공제 2,500,000 → 과세표준 421,540,000 → 20% 산출세액 84,308,000
 *   지방소득세 = floor10(8,430,800) = 8,430,800   (현행: 84,307,999 · 8,430,790)
 */
import { describe, it, expect } from "vitest";
import { calculateForeignStockTax } from "@/lib/tax-engine/stock-transfer/foreign-stock";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import type { ForeignStockInput } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";
import { FOREIGN_CARRYOVER } from "./foreign-carryover-97-2-fixtures";

/** 독립 기준 구현 — 십진 문자열을 직접 쪼개 BigInt로 계산(구현의 decimalizeRatio와 무관). */
function referenceFloor(a: string, r: string, q = 1): number {
  const split = (s: string) => {
    const [i, f = ""] = s.split(".");
    return { n: BigInt(i + f), k: f.length };
  };
  const A = split(a);
  const R = split(r);
  return Number((A.n * R.n * BigInt(q)) / 10n ** BigInt(A.k + R.k));
}

const BASE: ForeignStockInput = {
  marketType: "foreign_stock",
  yearsResidentInKorea: 10,
  isListedForeignCorp: true,
  stockName: "Anchor Corp",
  countryCode: "US",
  shareCount: 4000,
  transferDate: new Date("2025-06-01"),
  transferPriceMode: "total",
  totalTransferPriceForeign: 400_000,
  transferCurrencyCode: "USD",
  transferExchangeRate: 1300.1,
  acquisitionDate: new Date("2020-01-02"),
  acquisitionMode: "actual",
  perShareAcquisitionPriceForeign: 24,
  acquisitionCurrencyCode: "USD",
  acquisitionExchangeRate: 1000,
  capitalExpenditureForeign: 0,
  transferCostForeign: 0,
  hasForeignTax: false,
  foreignTaxMethod: "credit",
  isElectronicFiling: false,
};

describe("A-1-1 — 측정 사례: 400,000 USD × 1,300.10", () => {
  it("양도가액 520,040,000 · 산출세액 84,308,000 · 지방세 8,430,800 (현행 84,307,999 · 8,430,790)", () => {
    expect(Math.floor(400_000 * 1300.1)).toBe(520_039_999); // 함정 고정
    const r = calculateForeignStockTax(BASE);
    expect(r.transferPriceKrw).toBe(520_040_000);
    expect(r.acquisitionPriceKrw).toBe(96_000_000);
    expect(r.transferGain).toBe(424_040_000);
    expect(r.taxBase).toBe(421_540_000);
    expect(r.incomeTax).toBe(84_308_000);
    expect(r.localIncomeTax).toBe(8_430_800);
  });

  it("1주당 100 × 4,000주 × 1,300.10 (per_share 경로)도 같은 520,040,000 — 단가×수량이 BigInt 곱에 함께 들어간다", () => {
    expect(Math.floor(100 * 4000 * 1300.1)).toBe(520_039_999); // 함정 고정
    const r = calculateForeignStockTax({
      ...BASE,
      transferPriceMode: "per_share",
      totalTransferPriceForeign: undefined,
      perShareTransferPriceForeign: 100,
    });
    expect(r.transferPriceKrw).toBe(520_040_000);
    expect(r.incomeTax).toBe(84_308_000);
    expect(r.localIncomeTax).toBe(8_430_800);
  });
});

describe("A-1-2 — 환산 경로별 1건 (현행 부동소수는 전부 1원 과소)", () => {
  it("취득가액 실가: 100 × 4,000주 × 1,300.10", () => {
    const r = calculateForeignStockTax({
      ...BASE,
      perShareAcquisitionPriceForeign: 100,
      acquisitionExchangeRate: 1300.1,
      totalTransferPriceForeign: 900_000,
      transferExchangeRate: 1000,
    });
    expect(r.acquisitionPriceKrw).toBe(520_040_000);
  });

  it("취득가액 시가(market_price): 같은 식", () => {
    const r = calculateForeignStockTax({
      ...BASE,
      acquisitionMode: "market_price",
      perShareAcquisitionPriceForeign: 100,
      acquisitionExchangeRate: 1300.1,
      totalTransferPriceForeign: 900_000,
      transferExchangeRate: 1000,
    });
    expect(r.acquisitionPriceKrw).toBe(520_040_000);
  });

  it("자본적지출: 400,000 × 지출일 환율 1,300.10", () => {
    const r = calculateForeignStockTax({
      ...BASE,
      capitalExpenditureForeign: 400_000,
      capitalExpenditureExchangeRate: 1300.1,
    });
    expect(r.necessaryExpensesKrw).toBe(520_040_000);
  });

  it("양도비: 400,000 × 지출일 환율 1,300.10 (자본적지출과 별도 환율 축)", () => {
    const r = calculateForeignStockTax({
      ...BASE,
      transferCostForeign: 400_000,
      transferCostExchangeRate: 1300.1,
    });
    expect(r.necessaryExpensesKrw).toBe(520_040_000);
  });

  it("외국납부세액(필요경비 산입): 400,000 × 납세일 환율 1,300.10", () => {
    const r = calculateForeignStockTax({
      ...BASE,
      hasForeignTax: true,
      foreignTaxMethod: "expense",
      foreignTaxPaidForeign: 400_000,
      foreignTaxExchangeRate: 1300.1,
    });
    expect(r.foreignTaxPaidKrw).toBe(520_040_000);
    expect(r.necessaryExpensesKrw).toBe(520_040_000);
  });

  it("분할 수령 행(FS-09): 400,000 × 1,300.10 + 100,000 × 1,200.30 — 행별 환산 후 합산", () => {
    const r = calculateForeignStockTax({
      ...BASE,
      transferReceiptMode: "installments",
      transferInstallmentReceipts: [
        { receiptDate: new Date("2025-03-01"), amountForeign: 400_000, exchangeRate: 1300.1 },
        { receiptDate: new Date("2025-05-01"), amountForeign: 100_000, exchangeRate: 1200.3 },
      ],
    });
    expect(referenceFloor("100000", "1200.3")).toBe(120_030_000);
    expect(r.transferReceiptDetail?.receipts.map((x) => x.amountKrw)).toEqual([520_040_000, 120_030_000]);
    expect(r.transferPriceKrw).toBe(640_070_000);
  });

  it("이월과세 §97의2① 증여자 취득가액·증여일 취득가액·증여자 자본적지출 (foreign-stock-carryover.ts 2곳)", () => {
    // 증여일 취득가액 200 × 4,000주 × 1,300.10 = 1,040,080,000 (부동소수 1,040,079,999)
    // 증여자 취득가액   50 × 4,000주 × 1,300.10 =   260,020,000 (부동소수   260,019,999)
    // 증여자 자본적지출 400,000 × 1,300.10      =   520,040,000 (부동소수   520,039,999)
    // A 취득가액+지출 = 780,060,000 < B 1,040,080,000 → 이월과세 적용이 세액이 커서 «applied»
    const r = calculateStockTransferTax({
      ...FOREIGN_CARRYOVER,
      shareCount: 4000,
      perShareAcquisitionPriceForeign: 200,
      acquisitionExchangeRate: 1300.1,
      donorPerShareAcquisitionPriceForeign: 50,
      donorAcquisitionExchangeRate: 1300.1,
      donorCapitalExpenditureForeign: 400_000,
      donorCapitalExpenditureExchangeRate: 1300.1,
      perShareTransferPriceForeign: 400,
      transferExchangeRate: 1500,
    });
    expect(Math.floor(200 * 4000 * 1300.1)).toBe(1_040_079_999); // 함정 고정
    expect(r.carryoverOutcome).toBe("applied");
    expect(r.carryoverDonorAcquisitionPriceKrw).toBe(260_020_000);
    expect(r.carryoverGiftDateAcquisitionPriceKrw).toBe(1_040_080_000);
    expect(r.carryoverDonorCapexKrw).toBe(520_040_000);
  });
});

describe("A-1-3 — 격자 전수: 엔진 출력 == 독립 문자열 기준 구현", () => {
  // 결정적 PRNG (LCG) — 6개 격자(계획서 §1.3 A~F)
  function makeRnd(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }
  const frac = (rnd: () => number, d: number) =>
    d === 0 ? "" : "." + String(Math.floor(rnd() * 10 ** d)).padStart(d, "0");

  /** 격자: [금액 정수부 범위, 금액 소수자리, 환율 소수자리, 주수 사용 여부] */
  const GRIDS: { name: string; amtDec: number; rateDec: number; perShare: boolean; amtInt: [number, number] }[] = [
    { name: "A 1주당 2자리 × 주수 × 환율 2자리", amtDec: 2, rateDec: 2, perShare: true, amtInt: [1, 999] },
    { name: "B 1주당 2자리 × 주수 × 환율 4자리", amtDec: 2, rateDec: 4, perShare: true, amtInt: [1, 999] },
    { name: "C 총액 2자리 × 환율 2자리", amtDec: 2, rateDec: 2, perShare: false, amtInt: [10_000, 900_000] },
    { name: "D 총액 정수 × 환율 2자리", amtDec: 0, rateDec: 2, perShare: false, amtInt: [10_000, 900_000] },
    { name: "E 총액 정수 × 환율 4자리", amtDec: 0, rateDec: 4, perShare: false, amtInt: [10_000, 900_000] },
    { name: "F 1주당 정수 × 주수 × 환율 1자리", amtDec: 0, rateDec: 1, perShare: true, amtInt: [1, 999] },
  ];

  for (const g of GRIDS) {
    it(`격자 ${g.name} — 양도가액·취득가액·자본적지출·양도비·외국세 5경로 3,000건`, () => {
      const rnd = makeRnd(1128 + g.name.charCodeAt(0));
      for (let i = 0; i < 3000; i++) {
        const [lo, hi] = g.amtInt;
        const amount = `${lo + Math.floor(rnd() * (hi - lo))}${frac(rnd, g.amtDec)}`;
        const rate = `${900 + Math.floor(rnd() * 600)}${frac(rnd, g.rateDec)}`;
        const qty = g.perShare ? 1 + Math.floor(rnd() * 5000) : 1;
        const label = `${amount} × ${qty} × ${rate}`;
        const want = referenceFloor(amount, rate, qty);
        const n = Number(amount);
        const x = Number(rate);

        const transfer = calculateForeignStockTax(
          g.perShare
            ? { ...BASE, shareCount: qty, transferPriceMode: "per_share", totalTransferPriceForeign: undefined, perShareTransferPriceForeign: n, transferExchangeRate: x }
            : { ...BASE, shareCount: 1, totalTransferPriceForeign: n, transferExchangeRate: x },
        );
        expect(transfer.transferPriceKrw, `양도 ${label}`).toBe(want);

        const acq = calculateForeignStockTax({
          ...BASE,
          shareCount: qty,
          perShareAcquisitionPriceForeign: n,
          acquisitionExchangeRate: x,
        });
        expect(acq.acquisitionPriceKrw, `취득 ${label}`).toBe(referenceFloor(amount, rate, qty));

        if (!g.perShare) {
          // 1주당 경로가 아닌 격자에서만 — 필요경비·외국세는 «총액 × 환율» 항목이다
          const cap = calculateForeignStockTax({ ...BASE, capitalExpenditureForeign: n, capitalExpenditureExchangeRate: x });
          expect(cap.necessaryExpensesKrw, `자본적지출 ${label}`).toBe(want);
          const cost = calculateForeignStockTax({ ...BASE, transferCostForeign: n, transferCostExchangeRate: x });
          expect(cost.necessaryExpensesKrw, `양도비 ${label}`).toBe(want);
          const tax = calculateForeignStockTax({
            ...BASE,
            hasForeignTax: true,
            foreignTaxMethod: "expense",
            foreignTaxPaidForeign: n,
            foreignTaxExchangeRate: x,
          });
          expect(tax.foreignTaxPaidKrw, `외국세 ${label}`).toBe(want);
        }
      }
    });
  }
});

describe("A-1-5 — 회귀: 환율이 정수인 기존 값 불변 · 항목별 절사 (FX-4)", () => {
  it("정수 환율 — 종전 FS-09b 환산값 그대로 (70,000 × 1,100 / 80,000 × 1,300)", () => {
    const r = calculateForeignStockTax({
      ...BASE,
      transferReceiptMode: "installments",
      transferInstallmentReceipts: [
        { receiptDate: new Date("2025-03-31"), amountForeign: 70_000, exchangeRate: 1_100 },
        { receiptDate: new Date("2025-09-30"), amountForeign: 80_000, exchangeRate: 1_300 },
      ],
    });
    expect(r.transferReceiptDetail?.receipts.map((x) => x.amountKrw)).toEqual([77_000_000, 104_000_000]);
  });

  it("필요경비는 항목별로 floor 한다 (합산 후 floor 아님): 0.5 × 3 + 0.5 × 3 → 1 + 1", () => {
    const r = calculateForeignStockTax({
      ...BASE,
      capitalExpenditureForeign: 0.5,
      capitalExpenditureExchangeRate: 3,
      transferCostForeign: 0.5,
      transferCostExchangeRate: 3,
    });
    expect(r.necessaryExpensesKrw).toBe(2);
  });

  it("금액 0인 항목은 환율을 보지 않는다 (필요경비 0 + 환율 stale 5자리)", () => {
    const r = calculateForeignStockTax({
      ...BASE,
      capitalExpenditureForeign: 0,
      capitalExpenditureExchangeRate: 1300.12345,
    });
    expect(r.necessaryExpensesKrw).toBe(0);
  });
});

describe("Q-5 — 한도 위반이 엔진에 직접 도달하면 던진다 (조용히 틀린 값을 내지 않는다)", () => {
  it("환율 소수 5자리 · 외화액 소수 5자리 · 환율 0 · 외화액 1e11 초과", () => {
    const cases: Partial<ForeignStockInput>[] = [
      { transferExchangeRate: 1300.12345 },
      { totalTransferPriceForeign: 400_000.12345 },
      { transferExchangeRate: 0 },
      { totalTransferPriceForeign: 1e11 + 1 },
    ];
    for (const patch of cases) {
      expect(() => calculateForeignStockTax({ ...BASE, ...patch }), JSON.stringify(patch)).toThrow(TaxCalculationError);
    }
  });
});
