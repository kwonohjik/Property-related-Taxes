/**
 * 다종목 aggregate — 대주주 가목 2) 합산 보정의 **합계 10원 절사** anchor (V-8)
 *
 * 계획서: docs/00-pm/stock-major-bracket-floorten-v8.plan.md (Q-1 b · Q-2 a, 2026-11-11)
 *
 * ## 결함 (구현 전)
 * 보정 `adjustment = floorTen(f(ΣL)) − Σ floorTen(f(Lᵢ))`의 «종목별 합»은 장기분만 따로 절사했지만 종목 행은
 * `floorTen(단기 + 장기)`다. 단기+장기가 섞인 종목이 군에 있으면 합계가 단일 절사값과 −20~+20원 어긋났고
 * (3,000건 중 402건은 **정확값을 넘음**) — 절사가 값을 올린 셈이다.
 *
 * ## 기대 (구현 후)
 * 대주주 군 합계를 **한 번** 절사한다: `groupTax = floorTen(f(ΣL) + Σ단기분 30% 세액)`.
 * 합계 = `floorTen(Σ 행 + groupTax − Σ 군 소속 행)`. 군 밖 종목은 종전 규약(행 절사 합) 그대로.
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { applyStockTaxRate } from "@/lib/tax-engine/stock-transfer/stock-transfer-rate-calc";
import type {
  StockTransferInput,
  AcquisitionLot,
  TransferLot,
} from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/** 비상장 대주주(비중소기업) 장기 — 종목당 양도소득 400,000,000 (주당 5,000,000 − 1,000,000 × 100주) */
function major(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: 0.05,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
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
    acquisitionDate: new Date("2021-01-01"),
    transferDate: new Date("2025-06-01"),
    shareCount: 100,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 5_000_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 1_000_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2025-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...o,
  } as StockTransferInput;
}


const ten = (n: number) => Math.floor(n / 10) * 10;
const f = (b: number) => (b <= 300_000_000 ? Math.floor(b * 0.2) : Math.floor(b * 0.25) - 15_000_000);

/** 장기 lot + 단기 lot 분할 종목 (2025-07-01 양도) */
function split(
  a: [number, number],
  b: [number, number],
  transferPrice: number,
): StockTransferInput {
  const lA: AcquisitionLot = {
    id: "a",
    acquisitionDate: new Date("2022-01-10"),
    shareCount: a[0],
    perShareAcquisitionPrice: a[1],
    acquisitionCause: "purchase",
  };
  const lB: AcquisitionLot = {
    id: "b",
    acquisitionDate: new Date("2025-03-01"),
    shareCount: b[0],
    perShareAcquisitionPrice: b[1],
    acquisitionCause: "purchase",
  };
  const n = a[0] + b[0];
  const t: TransferLot = { id: "t1", transferDate: new Date("2025-07-01"), shareCount: n, perShareTransferPrice: transferPrice };
  return major({
    transferDate: new Date("2025-07-01"),
    shareCount: n,
    perShareTransferPrice: transferPrice,
    perShareAcquisitionPrice: a[1],
    costAllocationMethod: "fifo",
    acquisitionLots: [lA, lB],
    transferLots: [t],
  });
}

describe("MF-1 재현 시료 — 단기+장기 혼합 종목 + 단독 종목 (엔진 합계가 정확값을 넘던 입력)", () => {
  const r = calculateStockTransferTaxAggregate(
    [
      split([318, 92_704], [86, 89_938], 468_834),
      major({ shareCount: 86, perShareTransferPrice: 4_270_746, perShareAcquisitionPrice: 1_211_468, transferDate: new Date("2025-06-09") }),
    ],
    "aggregate",
  );

  it("MF-1-1 합계 = 단일 절사값 89,827,320 (정확값 89,827,328 이하 · 구현 전 89,827,330)", () => {
    // f(380,207,248) = 80,051,812 ; 단기분 30% 세액 9,775,516 ; 합 89,827,328
    expect(r.totalCalculatedTax).toBe(89_827_320);
  });

  it("MF-1-2 종목 행은 단독 산출 그대로 (안분 안 함)", () => {
    expect(r.items.map((x) => x.calculatedTax)).toEqual([33_697_380, 52_119_580]);
  });

  it("MF-1-3 echo — 단순 합은 군 소속 행 합, 합산 세액은 군 전체 한 번 절사(단기분 포함)", () => {
    expect(r.majorProgressiveGroupTax).toEqual({
      itemCount: 2,
      aggregatedTaxBase: 380_207_248,
      itemSumTax: 85_816_960,
      aggregatedTax: 89_827_320,
      adjustment: 4_010_360,
    });
  });
});

describe("MF-2 무작위 스윕(시드 고정) — 합계 = floorTen(f(Σ장기분) + Σ단기분 세액) 이고 정확값을 넘지 않는다", () => {
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

  it("MF-2-1 600건: 오차 0 · 정확값 초과 0", () => {
    let checked = 0;
    for (let k = 0; k < 600; k++) {
      const m = ri(2, 3);
      const nSplit = ri(1, m);
      const inputs: StockTransferInput[] = [];
      for (let i = 0; i < m; i++) {
        inputs.push(
          i < nSplit
            ? split([ri(100, 900), ri(50_000, 120_000)], [ri(50, 500), ri(50_000, 120_000)], ri(300_000, 900_000) + ri(0, 999))
            : major({
                shareCount: ri(50, 300),
                perShareTransferPrice: ri(2_000_000, 6_000_000) + ri(0, 999),
                perShareAcquisitionPrice: ri(500_000, 1_500_000) + ri(0, 999),
                transferDate: new Date(2025, ri(0, 5), ri(1, 28)),
              }),
        );
      }
      const r = calculateStockTransferTaxAggregate(inputs, "aggregate");
      let sumL = 0;
      let sumS = 0;
      r.items.forEach((it, i) => {
        if (it.isExempt || it.taxBase <= 0) return;
        const det = it.lotMatchingDetail;
        if (inputs[i].acquisitionLots && det) {
          let shortNet = 0;
          for (const s of det.matched) if (s.isShortTerm) shortNet += s.perLotGain;
          const shortGain = Math.min(shortNet, det.totalGain);
          const sB = shortGain > 0 ? Math.floor((it.taxBase * shortGain) / det.totalGain) : 0;
          if (sB > 0) sumS += applyStockTaxRate(sB, it.taxCategory, false, true).calculatedTax;
          sumL += it.taxBase - sB;
        } else sumL += it.taxBase;
      });
      expect(r.totalCalculatedTax).toBe(ten(f(sumL) + sumS));
      checked++;
    }
    expect(checked).toBe(600);
  });
});

describe("MF-3 군 밖 종목(비대주주 나목 20%)은 종전 규약 — 행 절사 값 그대로 합계에 더해진다", () => {
  it("MF-3-1 합계 = floorTen(군 밖 행 + 군 합계 단일 절사값)", () => {
    const nonMajor = major({
      isMajorShareholder: false,
      selfShareRatio: 0.001,
      shareCount: 77,
      perShareTransferPrice: 3_333_337,
      perShareAcquisitionPrice: 1_000_003,
      transferDate: new Date("2025-04-10"),
    });
    const inputs = [
      split([318, 92_704], [86, 89_938], 468_834),
      major({ shareCount: 86, perShareTransferPrice: 4_270_746, perShareAcquisitionPrice: 1_211_468, transferDate: new Date("2025-06-09") }),
      nonMajor,
    ];
    const r = calculateStockTransferTaxAggregate(inputs, "aggregate");
    expect(r.majorProgressiveGroupTax?.itemCount).toBe(2);
    const outsideRow = r.items[2].calculatedTax;
    expect(outsideRow).toBeGreaterThan(0);
    expect(r.totalCalculatedTax).toBe(ten(outsideRow + (r.majorProgressiveGroupTax?.aggregatedTax ?? 0)));
  });
});
