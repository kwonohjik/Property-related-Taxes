/**
 * A-2 (Pre-Do) — 교재 K-1 풀 시나리오 + 음성 시료(매입률·매도율) + 오답 함정(K-2·K-4·K-5).
 * 교재 정답: 양도소득금액 437,000,000 · 과세표준 434,500,000. 산출세액 147,860,000은 §118의5① §55① 문언에서 계산한 값(계획서 V-3).
 */
import { describe, it, expect } from "vitest";
import { calculateForeignRealEstateTransferTax as calc } from "@/lib/tax-engine/foreign-realestate";
import { k1Asset, k1Input, ratesAt, usd } from "./_fixtures";

const rates = ratesAt("2026-07-10");

describe("A-2 — 교재 K-1 (기준환율)", () => {
  const r = calc(k1Input(), rates);
  const row = r.rows[0];

  it("환산 3종 echo: 990,000,000 · 520,000,000 · 33,000,000", () => {
    expect(row.transferValueKrw).toBe(990_000_000);
    expect(row.acquisitionValueKrw).toBe(520_000_000);
    expect(row.transferCostKrw).toBe(33_000_000);
    expect(row.transfer).toMatchObject({ amountForeign: 900_000, exchangeRate: 1_100, date: "2026-07-10", amountKrw: 990_000_000 });
  });

  it("양도차익 = 양도소득금액 = 437,000,000 (장특 0)", () => {
    expect(row.capitalGain).toBe(437_000_000);
    expect(r.longTermDeduction).toBe(0);
    expect(r.incomeAmountTotal).toBe(437_000_000);
  });

  it("기본공제 2,500,000 · 과세표준 434,500,000 · 산출세액 147,860,000", () => {
    expect(r.basicDeduction).toBe(2_500_000);
    expect(r.taxBase).toBe(434_500_000);
    expect(r.appliedRate).toBe(0.4);
    expect(r.progressiveDeduction).toBe(25_940_000);
    expect(r.calculatedTax).toBe(147_860_000);
    expect(r.determinedTax).toBe(147_860_000);
  });

  it("지방소득세 14,786,000 · 합계 162,646,000", () => {
    expect(r.localIncomeTaxBase).toBe(434_500_000);
    expect(r.localIncomeTax).toBe(14_786_000);
    expect(r.totalTax).toBe(162_646_000);
    expect(r.taxCategory).toBe("foreign_realestate");
  });

  it("오답 함정 K-2·K-4·K-5·K-6은 나오지 않는다", () => {
    expect(r.taxBase).not.toBe(399_540_000); // K-2 장특 8%
    expect(r.calculatedTax).not.toBe(133_876_000); // K-2
    expect(r.taxBase).not.toBe(437_000_000); // K-4 기본공제 배제
    expect(r.calculatedTax).not.toBe(148_860_000); // K-4
    expect(r.calculatedTax).not.toBe(304_150_000); // K-5 미등기 70%
    expect(row.acquisitionValueKrw).not.toBe(440_000_000); // K-6 양도일 환율
  });
});

describe("A-2 음성 시료 — 고객 거래율(매입률·매도율)은 기준환율과 다른 값을 낸다", () => {
  it("매입률 양도 1,050 · 취득 1,250 · 양도비 1,050 → 양도차익 413,500,000 · 산출세액 138,460,000 (≠ 147,860,000)", () => {
    const r = calc(
      k1Input({
        assets: [
          k1Asset({
            transfer: usd(900_000, "2026-07-10", 1_050),
            acquisition: usd(400_000, "2022-01-15", 1_250),
            transferCosts: [usd(30_000, "2026-07-10", 1_050)],
          }),
        ],
      }),
      rates,
    );
    expect(r.rows[0].capitalGain).toBe(413_500_000);
    expect(r.taxBase).toBe(411_000_000);
    expect(r.calculatedTax).toBe(138_460_000);
    expect(r.calculatedTax).not.toBe(147_860_000);
  });

  it("매도율 양도 1,150 · 취득 1,350 · 양도비 1,150 → 양도차익 460,500,000 · 산출세액 157,260,000 (≠ 147,860,000)", () => {
    const r = calc(
      k1Input({
        assets: [
          k1Asset({
            transfer: usd(900_000, "2026-07-10", 1_150),
            acquisition: usd(400_000, "2022-01-15", 1_350),
            transferCosts: [usd(30_000, "2026-07-10", 1_150)],
          }),
        ],
      }),
      rates,
    );
    expect(r.rows[0].capitalGain).toBe(460_500_000);
    expect(r.taxBase).toBe(458_000_000);
    expect(r.calculatedTax).toBe(157_260_000);
    expect(r.calculatedTax).not.toBe(147_860_000);
  });

  it("K-6: 취득가액에 양도일 환율 1,100을 쓰면 다른 값 — 항목별 환율 축은 독립이다", () => {
    const wrong = calc(k1Input({ assets: [k1Asset({ acquisition: usd(400_000, "2022-01-15", 1_100) })] }), rates);
    expect(wrong.rows[0].capitalGain).toBe(517_000_000);
    expect(wrong.calculatedTax).not.toBe(147_860_000);
  });

  it("환율이 날짜 필드가 아니라 항목에 달려 있음 — 날짜만 바꿔도 환산액은 불변", () => {
    const r = calc(k1Input({ assets: [k1Asset({ transfer: usd(900_000, "2026-07-11", 1_100) })] }), rates);
    expect(r.rows[0].transferValueKrw).toBe(990_000_000);
  });
});
