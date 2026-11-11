/**
 * 다종목 aggregate — 대주주 가목 2) 합산 보정의 **합계 10원 절사** anchor (V-8 · V-8 후속 MF-4)
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

// ── MF-4 (V-8 후속) 혼합 종목 군 + 군 밖 종목(국외·기타자산 §168②·기타자산 2건 §104⑤) 조합 ──────────────────
// 계획서 `stock-major-bracket-floorten-v8-followup.plan.md` — 실측에서 결함 없음(전부 오차 0)이라 **고정용** anchor다.
// 합계는 «군 밖 행(또는 군 밖 단독 합계)과 군 단일 절사값의 합»과 같고, 지방소득세·결정세액은 합계에서 파생된다.
const Y = { priorYearEndDate: new Date("2025-12-31"), filingDate: new Date("2026-04-30") };

const foreign = (gain: number) =>
  ({
    marketType: "foreign_stock", yearsResidentInKorea: 10, isListedForeignCorp: true, stockName: "F", countryCode: "US", shareCount: 1,
    transferDate: new Date("2025-02-01"), transferPriceMode: "total", totalTransferPriceForeign: gain + 1_000_000,
    transferCurrencyCode: "USD", transferExchangeRate: 1, acquisitionDate: new Date("2021-01-02"), acquisitionMode: "actual",
    perShareAcquisitionPriceForeign: 1_000_000, acquisitionCurrencyCode: "USD", acquisitionExchangeRate: 1,
    capitalExpenditureForeign: 0, transferCostForeign: 0, hasForeignTax: true, foreignTaxPaidForeign: 5_000_000,
    foreignTaxCurrencyCode: "USD", foreignTaxExchangeRate: 1, foreignTaxMethod: "credit", isElectronicFiling: false,
  }) as unknown as StockTransferInput;

/** 기타자산 다목 대주주(영 §168② 기납부 차감 대상) 1건 */
const otherAsset168 = (extra: number, prior: number) =>
  major({
    ...Y, marketType: "other_asset", isQualifyingBlockShareholder: true, blockShareholderRealEstateRatio: 0.65,
    blockShareholderOwnershipRatio: 0.7, cumulativeTransferRatio: 0.7, aggregationFirstTransferDate: new Date("2023-06-20"),
    selfShareRatio: 0.7, isSmallMediumEnterprise: true, acquisitionDate: new Date("2003-02-17"), transferDate: new Date("2026-02-26"),
    shareCount: 70_000, perShareTransferPrice: 30_000 + extra, perShareAcquisitionPrice: 15_000, actualExpenses: 5_000_000 + extra,
    totalIssuedShares: 100_000, priorMajorShareholderTax: prior,
  });

/** 기타자산(과점주주) 단순 1건 — 2건 이상이면 §104⑤ 비교과세 */
const otherAssetPlain = (gain: number) =>
  major({
    marketType: "other_asset", isMajorShareholder: false, selfShareRatio: 0, isQualifyingBlockShareholder: true,
    blockShareholderRealEstateRatio: 0.65, blockShareholderOwnershipRatio: 0.7, cumulativeTransferRatio: 0.7,
    aggregationFirstTransferDate: new Date("2023-06-20"), acquisitionDate: new Date("2020-01-01"), transferDate: new Date("2025-06-01"),
    shareCount: 100, perShareTransferPrice: gain / 100 + 10_000, perShareAcquisitionPrice: 10_000, priorMajorShareholderTax: 0,
  });

describe("MF-4 군 밖 종목과 섞여도 합계 = 군 단일 절사값 + 군 밖 몫, 파생값은 합계에서 나온다", () => {
  let seed = 777;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

  const cov: Record<string, { runs: number; grp: number; ded: number; fc: number; cmp: number; bad: number }> = {};
  const groupInputs = (withY: boolean) => {
    const m = ri(2, 3);
    const nSplit = ri(1, m);
    const arr: StockTransferInput[] = [];
    for (let i = 0; i < m; i++) {
      arr.push(
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
    return withY ? arr.map((g) => ({ ...g, ...Y })) : arr;
  };
  const truth = (r: ReturnType<typeof calculateStockTransferTaxAggregate>, inputs: StockTransferInput[], n: number) => {
    let sumL = 0;
    let sumS = 0;
    for (let i = 0; i < n; i++) {
      const it = r.items[i];
      if (it.isExempt || it.taxBase <= 0) continue;
      const det = it.lotMatchingDetail;
      if (inputs[i].acquisitionLots && det) {
        let shortNet = 0;
        for (const s of det.matched) if (s.isShortTerm) shortNet += s.perLotGain;
        const shortGain = Math.min(shortNet, det.totalGain);
        const sB = shortGain > 0 ? Math.floor((it.taxBase * shortGain) / det.totalGain) : 0;
        if (sB > 0) sumS += applyStockTaxRate(sB, it.taxCategory, false, true).calculatedTax;
        sumL += it.taxBase - sB;
      } else sumL += it.taxBase;
    }
    return ten(f(sumL) + sumS);
  };

  const scenarios: Record<string, (g: StockTransferInput[]) => { inputs: StockTransferInput[]; outsiders: StockTransferInput[]; y: boolean }> = {
    nonMajor: (g) => ({ inputs: [...g, major({ isMajorShareholder: false, selfShareRatio: 0.001, shareCount: ri(30, 120), perShareTransferPrice: 3_000_000 + ri(0, 99_999), perShareAcquisitionPrice: 1_000_000 + ri(0, 999), transferDate: new Date("2025-04-10") })], outsiders: [], y: false }),
    foreign: (g) => ({ inputs: [...g, foreign(ri(20_000_000, 90_000_000))], outsiders: [], y: false }),
    otherAsset168: (g) => ({ inputs: [...g, otherAsset168(ri(0, 99), 29_200_000 + ri(0, 9999) * 10)], outsiders: [], y: true }),
    otherAsset2: (g) => {
      const o = [otherAssetPlain(ri(100, 400) * 1_000_000 + ri(0, 999)), otherAssetPlain(ri(100, 400) * 1_000_000 + ri(0, 999))];
      return { inputs: [...g, ...o], outsiders: o, y: false };
    },
  };

  for (const [name, build] of Object.entries(scenarios)) {
    it(`MF-4 ${name} — 150건`, () => {
      cov[name] = { runs: 0, grp: 0, ded: 0, fc: 0, cmp: 0, bad: 0 };
      for (let k = 0; k < 150; k++) {
        const g = groupInputs(name === "otherAsset168");
        const s = build(g);
        const r = calculateStockTransferTaxAggregate(s.inputs, "aggregate");
        const gT = truth(r, s.inputs, g.length);
        const outsideRows = r.items.slice(g.length).reduce((a, x) => a + x.calculatedTax, 0);
        const expected =
          name === "otherAsset2"
            ? gT + calculateStockTransferTaxAggregate(s.outsiders, "aggregate").totalCalculatedTax
            : ten(outsideRows + gT);
        const fc = r.items.reduce((a, x) => a + (x.foreignDetail?.foreignTaxCreditApplied ?? 0), 0);
        const c = cov[name];
        c.runs++;
        if (r.majorProgressiveGroupTax) c.grp++;
        if ((r.totalClause168_2Deducted ?? 0) > 0) c.ded++;
        if (fc > 0) c.fc++;
        if (r.otherAssetComparativeTax) c.cmp++;
        if (
          r.totalCalculatedTax !== expected ||
          r.totalLocalIncomeTax !== ten(Math.floor((r.totalCalculatedTax - fc) * 0.1)) ||
          r.totalFinalTax !== Math.max(0, ten(r.totalCalculatedTax - fc - (r.electronicFilingCredit ?? 0)))
        )
          c.bad++;
      }
      const c = cov[name];
      expect(c.bad).toBe(0);
      // 조합이 실제로 일어났는지 — 비어 있는 시나리오가 통과하지 않게 막는다
      expect(c.grp).toBeGreaterThan(100);
      if (name === "foreign") expect(c.fc).toBe(150);
      if (name === "otherAsset168") expect(c.ded).toBe(150);
      if (name === "otherAsset2") expect(c.cmp).toBe(150);
    });
  }
});
