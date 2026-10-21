/**
 * anchor BD-7 · BD-8 · BD-9(주식) — 주식 부담부증여 채무비율(B/C) 소수 곱 부동소수 1원 과소.
 *
 * 계획: docs/00-pm/burdened-gift-debt-ratio-precision.plan.md §4 표 F(F3·F4) · §7 S-1 · §9.1 · §13
 *
 * - F3(④ `buildGiftStockBurdenedTransferBody`, actual 모드): `Math.floor(실지취득가 × (B/C))` — `applyRatio`조차 거치지 않아
 *   B/C가 정수 %(57% 등)여도 참값이 정수인 곱이 1원 모자랐다. ④ 안에 B(`assumedDebtForGift`)·C(`valuationAmount`) 원값이 있어
 *   `safeMultiplyThenDivide(취득가, B, C)`로 와이어 변경 없이 정확화한다.
 * - F4(엔진 `resolveAcquisitionBasis`, estimated 모드): S-1은 `applyRatio`로 짧은 소수(정수 %류)만 정확화했고 순환 소수 비율은 한계였다.
 *   S-2(`docs/00-pm/stock-burdened-debt-fraction-wire.plan.md`)가 와이어에 증여가액 C(`burdenedGiftValuationAmount`)를 싣고
 *   엔진이 `safeMultiplyThenDivide(estimatedBase, transferPrice(=B), C)`로 곱해 순환 소수까지 참값으로 닫았다.
 *
 * 참값은 BigInt `취득가 × B / C`의 floor로 독립 계산한다.
 */
import { describe, it, expect } from "vitest";
import { buildGiftStockBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import { addStockRefines, stockTransferInputSchema } from "@/lib/api/stock-transfer-tax-schema";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { coerceDates } from "@/lib/api/date-coerce";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { FormState } from "@/components/calc/gift-tax-form-shared";
import type { BurdenedGiftStockTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

const DATE_FIELDS = ["transferDate", "acquisitionDate", "filingDate", "priorYearEndDate", "listingDate"] as const;

/** 참값 floor(x × b / c) — BigInt 독립 계산 */
const truth = (x: number, b: number, c: number): number => Number((BigInt(x) * BigInt(b)) / BigInt(c));

const GIFT_DATE = "2025-06-02";

function item(opts: {
  marketValue: number;
  debt: number;
  shares?: number;
  bgt: Partial<BurdenedGiftStockTransferTaxInput>;
}): EstateItem {
  return {
    id: "s1",
    name: "삼성전자",
    category: "listed_stock",
    marketValue: opts.marketValue,
    listedStockShares: opts.shares ?? 1000,
    assumedDebtForGift: opts.debt,
    burdenedGiftStockTransferTax: { marketType: "kospi", acquisitionDate: "2015-03-02", ...opts.bgt },
  } as unknown as EstateItem;
}

const bodyOf = (it: EstateItem) => buildGiftStockBurdenedTransferBody(it, { giftDate: GIFT_DATE } as unknown as FormState);

/** ④ → ⑫ → ⑭ → 엔진 전 계층 */
function runFullStack(it: EstateItem) {
  const body = bodyOf(it);
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | "));
  const coerced = coerceDates(parsed.data as Record<string, unknown>, DATE_FIELDS as unknown as string[]);
  return { body, result: calculateStockTransferTax(buildEngineInput(coerced)) };
}

// ─────────────────────────────────────────────────────────────────────────────
// BD-7 · F3 — ④ actual 모드 안분 취득가
// ─────────────────────────────────────────────────────────────────────────────
describe("BD-7 · ④ actual 모드 — 실지취득가 × B/C (정수 %)", () => {
  const actual = (debt: number, price: number, shares = 1000) =>
    item({ marketValue: 100_000_000, debt, shares, bgt: { acquisitionMode: "actual", actualAcquisitionPrice: price } });

  it("🔴 B/C = 57% · 취득가 40,000,000 · 1,000주 → 1주당 22,800 (옛 22,799 — 1원이 주식수만큼 증폭)", () => {
    const body = bodyOf(actual(57_000_000, 40_000_000));
    expect(body.perShareAcquisitionPrice).toBe(22_800);
    expect(body.perShareAcquisitionPrice).toBe(Math.floor(truth(40_000_000, 57_000_000, 100_000_000) / 1000));
  });

  it("🔴 풀 파이프라인 — 엔진 취득가액 총액 22,800,000 (옛 22,799,000)", () => {
    const { result } = runFullStack(actual(57_000_000, 40_000_000));
    expect(result.acquisitionPrice).toBe(22_800_000);
  });

  it("주식수 경계 — 7주: floor(floor(40,000,000 × 57%) / 7) = 3,257,142", () => {
    const body = bodyOf(actual(57_000_000, 40_000_000, 7));
    expect(body.perShareAcquisitionPrice).toBe(Math.floor(truth(40_000_000, 57_000_000, 100_000_000) / 7));
    expect(body.perShareAcquisitionPrice).toBe(3_257_142);
  });

  it("짧은 소수 회귀 — 10%: 40,000,000 × 10% / 1,000 = 4,000", () => {
    expect(bodyOf(actual(10_000_000, 40_000_000)).perShareAcquisitionPrice).toBe(4_000);
  });

  it("B = C (r = 1) — 취득가 전액", () => {
    expect(bodyOf(actual(100_000_000, 40_000_000)).perShareAcquisitionPrice).toBe(40_000);
  });

  it("격자 — B/C 1~99% × 취득가(만원 단위) × 주식수: 이중 floor 참값과 전건 일치", () => {
    const bad: string[] = [];
    let n = 0;
    for (let pct = 1; pct <= 99; pct++) {
      for (const price of [10_000_000, 25_000_000, 40_000_000, 123_450_000]) {
        for (const shares of [1, 7, 1000]) {
          const body = bodyOf(actual(pct * 1_000_000, price, shares));
          const expected = Math.floor(truth(price, pct * 1_000_000, 100_000_000) / shares);
          n++;
          if (body.perShareAcquisitionPrice !== expected) {
            bad.push(`pct=${pct} price=${price} shares=${shares} got=${body.perShareAcquisitionPrice} truth=${expected}`);
          }
        }
      }
    }
    expect(n).toBe(99 * 4 * 3);
    expect(bad.slice(0, 5), `${bad.length}건 불일치`).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BD-8 · F4 — 엔진 estimated 모드 개산공제 base 안분
// ─────────────────────────────────────────────────────────────────────────────
describe("BD-8 · 엔진 estimated 모드 — 개산공제 base(취득기준시가 총액) × B/C (증여가액 C 와이어)", () => {
  const estimated = (marketValue: number, debt: number, acqAvg: number) =>
    item({
      marketValue,
      debt,
      bgt: { acquisitionMode: "estimated", transferDatePriceAvg1Month: 100_000, acquisitionDatePriceAvg1Month: acqAvg },
    });

  it("🔴 B/C = 57% · 취득기준시가 총액 50,000,000(50,000 × 1,000주) → estimatedBase 28,500,000 · 개산공제 285,000 (옛 28,499,999 / 284,999)", () => {
    const { result } = runFullStack(estimated(100_000_000, 57_000_000, 50_000));
    expect(result.estimatedBase).toBe(28_500_000);
    expect(result.estimatedDeduction).toBe(285_000);
  });

  it("짧은 소수 회귀 — 10%(기존 BG-DR-2): estimatedBase 5,000,000 · 개산공제 50,000", () => {
    const { result } = runFullStack(estimated(100_000_000, 10_000_000, 50_000));
    expect(result.estimatedBase).toBe(5_000_000);
    expect(result.estimatedDeduction).toBe(50_000);
  });

  it("B = C (r = 1) — 안분 없음 · estimatedBase 50,000,000", () => {
    const { result } = runFullStack(estimated(100_000_000, 100_000_000, 50_000));
    expect(result.estimatedBase).toBe(50_000_000);
  });

  it("격자 — B/C 정수 %(1~99) × 취득기준시가 총액(만원 단위): estimatedBase가 BigInt 참값과 전건 일치", () => {
    const bad: string[] = [];
    let n = 0;
    for (let pct = 1; pct <= 99; pct++) {
      for (const acqAvg of [20_000, 50_000, 70_000]) {
        const { result } = runFullStack(estimated(100_000_000, pct * 1_000_000, acqAvg));
        const expected = truth(acqAvg * 1000, pct * 1_000_000, 100_000_000);
        n++;
        if (result.estimatedBase !== expected) bad.push(`pct=${pct} acqAvg=${acqAvg} got=${result.estimatedBase} truth=${expected}`);
      }
    }
    expect(n).toBe(99 * 3);
    expect(bad.slice(0, 5), `${bad.length}건 불일치`).toEqual([]);
  });

  it("🔴 순환 소수 비율(14/110) — 와이어에 증여가액 C를 싣고 safeMultiplyThenDivide로 곱한다 (S-2: 옛 KNOWN-LIMIT 6,999,999 → 참값 7,000,000)", () => {
    // B = 14,000,000 · C = 110,000,000 · 취득기준시가 총액 55,000,000 → 참값 7,000,000.
    const { body, result } = runFullStack(estimated(110_000_000, 14_000_000, 55_000));
    expect(truth(55_000_000, 14_000_000, 110_000_000)).toBe(7_000_000);
    expect(body.burdenedGiftValuationAmount).toBe(110_000_000);
    expect(body.burdenedGiftDebtRatio).toBeUndefined();
    expect(result.estimatedBase).toBe(7_000_000);
    expect(result.estimatedDeduction).toBe(70_000);
  });
});
