/**
 * 감사 확정 결함 회귀 테스트 — lib/tax-engine/stock-transfer/lot-allocation-tax.ts
 *
 * ref: lot-allocation-tax.ts:48  (confirmed[8]) — SME 대주주 → 나목 단일 20% 오적용, 정상은 가목2) 누진
 * ref: lot-allocation-tax.ts:77  (confirmed[9]) — 누진세율 sub-lot별 적용 → 집계 3억 경계 회피(과소)
 * ref: lot-allocation-tax.ts:55  (confirmed[10]) — 기타자산(§94①4) → 단일 20% 오적용, 정상은 §55 누진
 *
 * 기대값은 소득세법 §104①11 가목2)·나목·§55 조문에서 독립 도출(엔진 출력 복사 아님).
 *   §104①11 가목2) 주식 대주주 누진: 3억 이하 20% / 초과 25%(누진공제 15,000,000)
 *   §104①11 나목: 비대주주 중소 10% / 비중소 20%
 *   §55 8단계(기타자산): … 5억~10억 42%(공제 35,940,000), 4천만~5천만 15%(공제 1,260,000) …
 */

import { describe, it, expect } from "vitest";
import { calcSplitModeTax } from "@/lib/tax-engine/stock-transfer/lot-allocation-tax";
import { applyStockTaxRate } from "@/lib/tax-engine/stock-transfer/stock-transfer-rate-calc";
import type {
  LotMatchingDetail,
  MatchedSubLot,
  StockTransferResult,
} from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

// 결함 재현용 최소 LotMatchingDetail 빌더 — perLotGain·isShortTerm만 유효.
function makeLotDetail(lots: { gain: number; short: boolean }[]): LotMatchingDetail {
  const matched: MatchedSubLot[] = lots.map((l) => ({
    saleDate: new Date("2025-05-10"),
    saleShares: 100,
    perShareSalePrice: 0,
    acquisitionDate: new Date("2023-01-01"),
    buyShares: 100,
    perShareBuyPrice: 0,
    holdingDays: l.short ? 100 : 800,
    isShortTerm: l.short,
    perLotGain: l.gain,
    appliedRate: 0,
    subLotTax: 0,
  }));
  const totalGain = lots.reduce((s, l) => s + l.gain, 0);
  const shortTermGain = lots.filter((l) => l.short).reduce((s, l) => s + l.gain, 0);
  return {
    method: "fifo",
    matched,
    totalTransferPrice: 0,
    totalAcquisitionPrice: 0,
    totalGain,
    shortTermGain,
    longTermGain: totalGain - shortTermGain,
    carryoverDonorCapex: 0,
    carryoverGiftTaxApportioned: 0,
    warnings: [],
  };
}

describe("confirmed[8] lot-allocation-tax.ts:48 — 중소기업 대주주는 가목2) 누진(나목 단일 아님)", () => {
  it("SME 대주주·전량 장기·taxBase 500,000,000 → §104①11 가목2) 누진 110,000,000", () => {
    // floor(500,000,000 × 0.25) − 15,000,000 = 125,000,000 − 15,000,000 = 110,000,000
    const detail = makeLotDetail([
      { gain: 250_000_000, short: false },
      { gain: 250_000_000, short: false },
    ]);
    const r = calcSplitModeTax(500_000_000, detail, "unlisted_major", /* isSME */ true);
    expect(r.calculatedTax).toBe(110_000_000);
    expect(r.calculatedTax).not.toBe(100_000_000); // 나목 단일 20% 버그값
  });

  it("SME 대주주 단기 sub-lot이어도 30% 아님(가목1은 '중소기업 외'만) → 누진 110,000,000", () => {
    const detail = makeLotDetail([{ gain: 500_000_000, short: true }]);
    const r = calcSplitModeTax(500_000_000, detail, "unlisted_major", true);
    expect(r.calculatedTax).toBe(110_000_000);
    expect(r.calculatedTax).not.toBe(150_000_000); // floor(500M×0.30) 단기30% 오적용값
  });
});

describe("confirmed[9] lot-allocation-tax.ts:77 — 누진은 집계 과세표준 1회(sub-lot 분할 회피 금지)", () => {
  it("비중소 대주주·장기 2 lot·taxBase 450,000,000 → 집계 누진 97,500,000 (per-lot 90,000,000 아님)", () => {
    // 집계: floor(450,000,000 × 0.25) − 15,000,000 = 112,500,000 − 15,000,000 = 97,500,000
    // 버그(각 225M×20%): 45,000,000 × 2 = 90,000,000
    const detail = makeLotDetail([
      { gain: 225_000_000, short: false },
      { gain: 225_000_000, short: false },
    ]);
    const r = calcSplitModeTax(450_000_000, detail, "listed_major", /* isSME */ false);
    expect(r.calculatedTax).toBe(97_500_000);
    expect(r.calculatedTax).not.toBe(90_000_000);
    expect(r.isMixedRate).toBe(false);
  });

  it("lot 개수 불변성: 동일 과세표준을 1 lot으로 입력해도 97,500,000", () => {
    const detail = makeLotDetail([{ gain: 450_000_000, short: false }]);
    const r = calcSplitModeTax(450_000_000, detail, "listed_major", false);
    expect(r.calculatedTax).toBe(97_500_000);
  });

  it("혼합(단기 100M + 장기 300M)·taxBase 400,000,000 → 단기30% + 장기누진 = 90,000,000", () => {
    // 단기분 base = 400M×100M/400M = 100,000,000 → 30% = 30,000,000
    // 장기분 base = 300,000,000 → 20%(≤3억) = 60,000,000 ; 합 90,000,000
    const detail = makeLotDetail([
      { gain: 100_000_000, short: true },
      { gain: 300_000_000, short: false },
    ]);
    const r = calcSplitModeTax(400_000_000, detail, "listed_major", false);
    expect(r.calculatedTax).toBe(90_000_000);
    expect(r.isMixedRate).toBe(true);
  });
});

describe("confirmed[10] lot-allocation-tax.ts:55 — 기타자산(§94①4)은 §55 누진(단일 20% 아님)", () => {
  it("과점주주 기타자산·taxBase 1,000,000,000 → §55 42% 구간 384,060,000", () => {
    // floor(1,000,000,000 × 0.42) − 35,940,000 = 420,000,000 − 35,940,000 = 384,060,000
    const detail = makeLotDetail([{ gain: 1_000_000_000, short: false }]);
    const r = calcSplitModeTax(1_000_000_000, detail, "other_asset_block_shareholder", false);
    expect(r.calculatedTax).toBe(384_060_000);
    expect(r.calculatedTax).not.toBe(200_000_000); // 단일 20% 버그값
  });

  it("기타자산 저과표 taxBase 50,000,000 → §55 15% 구간 6,240,000 (단일 20%는 과대 10,000,000)", () => {
    // floor(50,000,000 × 0.15) − 1,260,000 = 7,500,000 − 1,260,000 = 6,240,000
    const detail = makeLotDetail([{ gain: 50_000_000, short: false }]);
    const r = calcSplitModeTax(50_000_000, detail, "other_asset_heavy_re", true);
    expect(r.calculatedTax).toBe(6_240_000);
    expect(r.calculatedTax).not.toBe(10_000_000);
  });
});

describe("정상경로(applyStockTaxRate) 일치 — split↔single 드리프트 방지", () => {
  const cats: StockTransferResult["taxCategory"][] = [
    "listed_major",
    "unlisted_major",
    "other_asset_block_shareholder",
    "other_asset_heavy_re",
  ];
  const bases = [50_000_000, 500_000_000, 1_200_000_000];

  for (const cat of cats) {
    for (const isSME of [false, true]) {
      for (const base of bases) {
        it(`전량 장기: ${cat} isSME=${isSME} base=${base} → single 경로와 동일`, () => {
          const detail = makeLotDetail([{ gain: base, short: false }]);
          const split = calcSplitModeTax(base, detail, cat, isSME);
          const single = applyStockTaxRate(base, cat, isSME, /* isShortTerm */ false);
          expect(split.calculatedTax).toBe(single.calculatedTax);
        });
      }
    }
  }

  it("비중소 대주주 전량 단기 → single 30% 경로와 동일", () => {
    const base = 500_000_000;
    const detail = makeLotDetail([{ gain: base, short: true }]);
    const split = calcSplitModeTax(base, detail, "listed_major", false);
    const single = applyStockTaxRate(base, "listed_major", false, /* isShortTerm */ true);
    expect(split.calculatedTax).toBe(single.calculatedTax);
    expect(split.calculatedTax).toBe(150_000_000); // floor(500M × 0.30)
  });
});

describe("비대주주 단일세율 회귀(불변) — 기존 정상 동작 보존", () => {
  it("비상장 비대주주 중소 10% / 비중소 20%", () => {
    const detail = makeLotDetail([{ gain: 10_000_000, short: false }]);
    expect(calcSplitModeTax(10_000_000, detail, "unlisted_non_major", true).calculatedTax).toBe(
      1_000_000,
    );
    expect(calcSplitModeTax(10_000_000, detail, "unlisted_non_major", false).calculatedTax).toBe(
      2_000_000,
    );
  });
});
