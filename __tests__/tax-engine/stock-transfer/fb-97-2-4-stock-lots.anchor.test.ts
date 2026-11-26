/**
 * F-1 PR-1b′ — 주식 양도 §97의2④ 가업상속공제 자산 의제 취득가액 (취득 lot 단위 · 계획서 §7.7 L-a ~ L-g)
 *
 * sub-lot(매수 lot × 매도 lot) 취득원가 총액
 *   buyCost(m) = ⌊(피상속인 1주당 × m + capex(m)) × n ÷ d⌋ + ⌊평가 1주당 × m × (d − n) ÷ d⌋
 *   capex(m)   = ⌊자본적지출 총액 × m ÷ lot 주식수⌋
 *
 * 기준 사례(계획서 §7.2 F1-2와 같은 종목): 비상장 대주주 · 비중소 · 양도 8만/주 · 양도 2026-06-01(신 ③2호 시대)
 *   · 가업 lot = 상속 2024-03-01 · 평가 5만/주 · 피상속인 5천/주 · 적용률 8/10 (법인 총자산 10 · 사업무관 2)
 * 세액은 대주주 비중소 장기(가목 2) = 3억 이하 20% · 초과 25% − 1,500만 · 기본공제 250만, 10원 미만 절사.
 * 기대값은 전부 손계산이다(각 테스트 주석) — 엔진 출력을 베끼지 않았다.
 */
import { describe, it, expect } from "vitest";
import { calculateStockTransferTax, calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { STOCK_FB_PRE_2014_NOTICE, STOCK_FB_LOT_UNALLOCATED_NOTICE } from "@/lib/tax-engine/stock-transfer/stock-family-business";
import { FB_MOVING_AVG_NOTICE } from "@/lib/tax-engine/stock-transfer/stock-family-business-lot";
import type { AcquisitionLot, StockTransferInput, TransferLot } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { FamilyBusinessRateBasis } from "@/lib/tax-engine/family-business-applied-rate";
import { D, unlisted, ratio, deduction, fb } from "./fb-97-2-4-stock-fixtures";

type Method = "fifo" | "specific" | "moving_avg";

/** 매수 lot — 기본은 일반 매수 */
function lot(id: string, date: string, shares: number, perShare: number, o: Partial<AcquisitionLot> = {}): AcquisitionLot {
  return { id, acquisitionDate: D(date), shareCount: shares, perShareAcquisitionPrice: perShare, acquisitionCause: "purchase", ...o };
}

/** 가업상속 lot — 상속 원인 · 상속개시일 = lot 취득일 · 평가 = lot 단가 */
function fbLot(
  id: string,
  date: string,
  shares: number,
  perShare: number,
  decedentPerShare: number,
  basis: FamilyBusinessRateBasis,
  capex?: number,
): AcquisitionLot {
  return lot(id, date, shares, perShare, {
    acquisitionCause: "inheritance",
    familyBusinessInheritance: {
      decedentAcquisitionPricePerShare: decedentPerShare,
      fbRateBasis: basis,
      ...(capex !== undefined ? { decedentCapitalExpenditure: capex } : {}),
    },
  });
}

function sale(id: string, date: string, shares: number, perShare = 80_000): TransferLot {
  return { id, transferDate: D(date), shareCount: shares, perShareTransferPrice: perShare };
}

/** lot 단위 종목 — `shareCount`·`acquisitionDate`·`transferDate`는 lot에서 파생(엔진은 split 모드에서 lot을 읽는다) */
function lots(
  acq: AcquisitionLot[],
  trn: TransferLot[],
  method: Method = "fifo",
  o: Partial<StockTransferInput> = {},
): StockTransferInput {
  return unlisted({
    acquisitionCause: "purchase",
    acquisitionLots: acq,
    transferLots: trn,
    costAllocationMethod: method,
    acquisitionDate: acq[0].acquisitionDate,
    transferDate: trn[trn.length - 1].transferDate,
    shareCount: trn.reduce((s, t) => s + t.shareCount, 0),
    perShareAcquisitionPrice: undefined,
    ...o,
  });
}

describe("F-1 lot — 단건 ≡ lot 1개 전량 양도 (L-c · 같은 의제 취득가·세액·detail)", () => {
  // 손계산: buyCost = ⌊(5,000 × 10,000) × 8/10⌋ + ⌊50,000 × 10,000 × 2/10⌋ = 40,000,000 + 100,000,000 = 140,000,000
  //   양도 800,000,000 − 140,000,000 = 660,000,000 · 과표 657,500,000 · 25% − 15,000,000 = 149,375,000 · 지방세 14,937,500
  const single = calculateStockTransferTax(fb(ratio(8, 10)));

  for (const method of ["fifo", "specific", "moving_avg"] as const) {
    it(`${method}: 취득가 140,000,000 · 산출 149,375,000 · 공제 89,875,000 · detail이 단건과 같다`, () => {
      const r = calculateStockTransferTax(
        lots(
          [fbLot("b", "2024-03-01", 10_000, 50_000, 5_000, ratio(8, 10))],
          [sale("t", "2026-06-01", 10_000)],
          method,
          method === "specific" ? { specificMatchings: [{ transferLotId: "t", acquisitionLotId: "b", shareCount: 10_000 }] } : {},
        ),
      );
      expect(r.acquisitionPrice).toBe(140_000_000);
      expect(r.transferIncome).toBe(660_000_000);
      expect(r.taxBase).toBe(657_500_000);
      expect(r.calculatedTax).toBe(149_375_000);
      expect(r.localIncomeTax).toBe(14_937_500);
      expect(r.familyBusinessDetail).toMatchObject({
        imputedAcquisitionPrice: 140_000_000,
        cgtUnderSection97_2_4: 149_375_000,
        cgtUnderSection97: 59_500_000,
        creditAmount: 89_875_000,
        fbItemCount: 1,
      });
      expect(r.calculatedTax).toBe(single.calculatedTax);
      expect(r.acquisitionPrice).toBe(single.acquisitionPrice);
      // 이동평균은 풀 평균 단가라 `pooled` 표지가 붙는다 — 그 외 필드는 단건 detail과 같다
      const { pooled, ...rest } = r.familyBusinessDetail!;
      expect(rest).toEqual(single.familyBusinessDetail);
      expect(pooled).toBe(method === "moving_avg" ? true : undefined);
    });
  }

  it("자본적지출도 같다 — 총액 1천만을 전량 양도하면 전액 산입(F1-18): 취득가 148,000,000", () => {
    // 손계산: ⌊(50,000,000 + 10,000,000) × 8/10⌋ = 48,000,000 + ⌊500,000,000 × 2/10⌋ = 100,000,000 → 148,000,000
    const r = calculateStockTransferTax(
      lots([fbLot("b", "2024-03-01", 10_000, 50_000, 5_000, ratio(8, 10), 10_000_000)], [sale("t", "2026-06-01", 10_000)]),
    );
    expect(r.acquisitionPrice).toBe(148_000_000);
    expect(r.familyBusinessDetail?.decedentCapitalExpenditure).toBe(10_000_000);
  });
});

describe("F1-10 혼재 — 가업 lot + 일반 상속 lot + 매수 lot, 가업 lot 일부 양도 (fifo · specific)", () => {
  // lot: A 매수 2023-01-10 2,000주 @30,000 · C 일반 상속 2024-01-15 1,000주 @40,000 · B 가업 상속 2024-03-01 6,000주
  //   (평가 50,000 · 피상속인 5,000 · 자본적지출 총액 12,000,000 · 8/10). 양도 5,000주 @80,000 → FIFO: A 2,000 · C 1,000 · B 2,000
  // B 2,000주 배정: capex(2,000) = ⌊12,000,000 × 2,000 ÷ 6,000⌋ = 4,000,000
  //   buyCost = ⌊(5,000 × 2,000 + 4,000,000) × 8/10⌋ + ⌊50,000 × 2,000 × 2/10⌋ = 11,200,000 + 20,000,000 = 31,200,000
  // 취득가 합 = A 60,000,000 + C 40,000,000 + B 31,200,000 = 131,200,000 · 양도 400,000,000 · 차익 268,800,000
  //   과표 266,300,000 · 20% = 53,260,000 · 지방세 5,326,000
  // 일반(가업 lot 되돌림): B 2,000 × 50,000 = 100,000,000 → 취득가 200,000,000 · 차익 200,000,000 · 과표 197,500,000 · 39,500,000
  //   공제 = 53,260,000 − 39,500,000 = 13,760,000
  const acq = [
    lot("a", "2023-01-10", 2_000, 30_000),
    lot("c", "2024-01-15", 1_000, 40_000, { acquisitionCause: "inheritance" }),
    fbLot("b", "2024-03-01", 6_000, 50_000, 5_000, ratio(8, 10), 12_000_000),
  ];
  const trn = [sale("t", "2026-06-01", 5_000)];

  const expectBlend = (r: ReturnType<typeof calculateStockTransferTax>) => {
    expect(r.acquisitionPrice).toBe(131_200_000);
    expect(r.transferIncome).toBe(268_800_000);
    expect(r.taxBase).toBe(266_300_000);
    expect(r.calculatedTax).toBe(53_260_000);
    expect(r.localIncomeTax).toBe(5_326_000);
    expect(r.familyBusinessDetail).toMatchObject({
      imputedAcquisitionPrice: 31_200_000,
      decedentAcquisitionPrice: 10_000_000,
      inheritanceMarketValue: 100_000_000,
      decedentCapitalExpenditure: 4_000_000,
      shareCount: 2_000,
      decedentAcquisitionPricePerShare: 5_000,
      appliedRate: 0.8,
      cgtUnderSection97_2_4: 53_260_000,
      cgtUnderSection97: 39_500_000,
      creditAmount: 13_760_000,
      fbItemCount: 1,
    });
    expect(r.familyBusinessDetail?.lots).toBeUndefined(); // 가업 lot 하나 — lot 목록은 둘 이상일 때만
  };

  it("fifo — 가업 lot 배정분(2,000주)만 의제 · 나머지 lot은 종전 단가", () => {
    const r = calculateStockTransferTax(lots(acq, trn, "fifo"));
    expectBlend(r);
    const subs = r.lotMatchingDetail!.matched;
    expect(subs.map((m) => [m.buyShares, m.buyCost])).toEqual([[2_000, undefined], [1_000, undefined], [2_000, 31_200_000]]);
    expect(r.lotMatchingDetail!.familyBusinessSummary).toMatchObject({ shares: 2_000, buyCost: 31_200_000, capex: 4_000_000, pooled: false });
  });

  it("specific — 같은 배정이면 같은 값", () => {
    const r = calculateStockTransferTax(
      lots(acq, trn, "specific", {
        specificMatchings: [
          { transferLotId: "t", acquisitionLotId: "a", shareCount: 2_000 },
          { transferLotId: "t", acquisitionLotId: "c", shareCount: 1_000 },
          { transferLotId: "t", acquisitionLotId: "b", shareCount: 2_000 },
        ],
      }),
    );
    expectBlend(r);
  });

  it("개별법으로 가업 lot을 배정하지 않으면 의제 없음 — 가업 lot 미배정 안내 · detail 없음 · 일반 §97과 같은 세액", () => {
    const r = calculateStockTransferTax(
      lots(acq, [sale("t", "2026-06-01", 3_000)], "specific", {
        specificMatchings: [
          { transferLotId: "t", acquisitionLotId: "a", shareCount: 2_000 },
          { transferLotId: "t", acquisitionLotId: "c", shareCount: 1_000 },
        ],
      }),
    );
    // 손계산: 양도 240,000,000 − (60,000,000 + 40,000,000) = 140,000,000 → 과표 137,500,000 → 20% = 27,500,000
    expect(r.acquisitionPrice).toBe(100_000_000);
    expect(r.calculatedTax).toBe(27_500_000);
    expect(r.familyBusinessDetail).toBeUndefined();
    expect(r.warnings).toContain(STOCK_FB_LOT_UNALLOCATED_NOTICE);
  });
});

describe("F1-10b 가업 lot이 두 매도에 나뉨 — 매도(sub-lot)마다 항별 절사 · capex 배정 합 ≤ 총액", () => {
  // lot B 6,000주 · 적용률 1/3(법인 총자산 3 · 사업무관 2) · 평가 50,000 · 피상속인 5,000 · 자본적지출 총액 12,000,000
  //   매도 1,000주(2026-03-01) · 2,000주(2026-06-01) @80,000 (둘 다 신 ③2호 시대 · 같은 과세기간)
  // m=1,000: capex = ⌊12,000,000 × 1,000 ÷ 6,000⌋ = 2,000,000 · ⌊(5,000,000 + 2,000,000) ÷ 3⌋ = 2,333,333 · ⌊50,000 × 1,000 × 2 ÷ 3⌋ = 33,333,333 → 35,666,666
  // m=2,000: capex = 4,000,000 · ⌊(10,000,000 + 4,000,000) ÷ 3⌋ = 4,666,666 · ⌊100,000,000 × 2 ÷ 3⌋ = 66,666,666 → 71,333,332
  // Σ buyCost = 106,999,998 (한 번에 3,000주를 팔면 ⌊21,000,000 ÷ 3⌋ + ⌊150,000,000 × 2 ÷ 3⌋ = 107,000,000 — sub-lot 항별 절사 2원 차이)
  // Σ capex = 6,000,000 ≤ 12,000,000 (남은 3,000주 몫은 다음 양도)
  // 양도 240,000,000 − 106,999,998 = 133,000,002 · 과표 130,500,002 · 20% = 26,100,000.4 → 26,100,000
  const acq = [fbLot("b", "2024-03-01", 6_000, 50_000, 5_000, ratio(1, 3), 12_000_000)];
  const trn = [sale("t1", "2026-03-01", 1_000), sale("t2", "2026-06-01", 2_000)];

  it("fifo", () => {
    const r = calculateStockTransferTax(lots(acq, trn, "fifo"));
    expect(r.lotMatchingDetail!.matched.map((m) => m.buyCost)).toEqual([35_666_666, 71_333_332]);
    expect(r.acquisitionPrice).toBe(106_999_998);
    expect(r.transferIncome).toBe(133_000_002);
    expect(r.taxBase).toBe(130_500_002);
    expect(r.calculatedTax).toBe(26_100_000);
    expect(r.familyBusinessDetail).toMatchObject({ decedentCapitalExpenditure: 6_000_000, shareCount: 3_000, imputedAcquisitionPrice: 106_999_998 });
    expect(r.familyBusinessDetail!.decedentCapitalExpenditure!).toBeLessThanOrEqual(12_000_000);
  });

  it("specific — 같은 배정", () => {
    const r = calculateStockTransferTax(
      lots(acq, trn, "specific", {
        specificMatchings: [
          { transferLotId: "t1", acquisitionLotId: "b", shareCount: 1_000 },
          { transferLotId: "t2", acquisitionLotId: "b", shareCount: 2_000 },
        ],
      }),
    );
    expect(r.acquisitionPrice).toBe(106_999_998);
    expect(r.calculatedTax).toBe(26_100_000);
  });
});

describe("L-d 이동평균 (Q-12) — 가업 lot의 유리수 단가를 평균에 넣는다", () => {
  // 매수 A 2023-01-10 4,000주 @30,002 · 가업 B 6,000주(평가 50,000 · 피상속인 5,001 · 적용률 1/3 · 자본적지출 없음) · 양도 10,000주 @80,000
  // B 정확 단가 = [(5,001 × 6,000) × 1 + 50,000 × 6,000 × 2] ÷ (3 × 6,000) = 630,006,000 ÷ 18,000 = 35,000.3333…
  // 평균 = (4,000 × 30,002 + 6,000 × 35,000.3333…) ÷ 10,000 = (120,008,000 + 210,002,000) ÷ 10,000 = 33,001 (정확히)
  //   (B를 35,000으로 먼저 절사하면 330,008,000 ÷ 10,000 = 33,000.8 → 33,000 — 취득가 10,000원 과소)
  // 취득가 = 10,000 × 33,001 = 330,010,000 · 차익 469,990,000 · 과표 467,490,000 · 25% − 15,000,000 = 101,872,500
  // 일반(B 평가 50,000): (120,008,000 + 300,000,000) ÷ 10,000 = 42,000.8 → 42,000 → 취득가 420,000,000 · 차익 380,000,000 · 과표 377,500,000 · 79,375,000
  // 공제 = 101,872,500 − 79,375,000 = 22,497,500
  const acq = [lot("a", "2023-01-10", 4_000, 30_002), fbLot("b", "2024-03-01", 6_000, 50_000, 5_001, ratio(1, 3))];

  it("평균 33,001 · 취득가 330,010,000 · 산출 101,872,500 · 공제 22,497,500 · 구분 관리 확인 필요 고지", () => {
    const r = calculateStockTransferTax(lots(acq, [sale("t", "2026-06-01", 10_000)], "moving_avg"));
    expect(r.lotMatchingDetail!.matched.map((m) => m.perShareBuyPrice)).toEqual([33_001, 33_001]);
    expect(r.acquisitionPrice).toBe(330_010_000);
    expect(r.taxBase).toBe(467_490_000);
    expect(r.calculatedTax).toBe(101_872_500);
    expect(r.familyBusinessDetail).toMatchObject({ cgtUnderSection97: 79_375_000, creditAmount: 22_497_500, pooled: true, shareCount: 6_000 });
    // 요약 주식수는 FIFO 물량 트랙 — A 4,000 다음 B 6,000 전량. 금액은 참고값: ⌊30,006,000 ÷ 3⌋ + ⌊300,000,000 × 2 ÷ 3⌋ = 10,002,000 + 200,000,000
    expect(r.lotMatchingDetail!.familyBusinessSummary).toMatchObject({ pooled: true, shares: 6_000, buyCost: 210_002_000 });
    expect(r.lotMatchingDetail!.warnings).toContain(FB_MOVING_AVG_NOTICE);
  });

  it("매도 두 번 — 첫 매도(가업 lot 포함 풀)와 둘째 매도 모두 정확 평균을 따른다", () => {
    // 1차 2026-03-01 5,000주: 풀 = A 4,000 + B 6,000 → 평균 33,001 (위와 같다) · FIFO: A 4,000 + B 1,000
    // 2차 2026-06-01 5,000주: 잔고 5,000주(모든 lot 같은 비율 축소 — A 2,000 · B 3,000, w 비율 4:6) → 평균은 그대로 33,001 · FIFO: B 5,000
    // 취득가 = 10,000 × 33,001 = 330,010,000 (매도 주식수 합 10,000 × 같은 평균)
    const r = calculateStockTransferTax(lots(acq, [sale("t1", "2026-03-01", 5_000), sale("t2", "2026-06-01", 5_000)], "moving_avg"));
    expect(r.lotMatchingDetail!.matched.map((m) => m.perShareBuyPrice)).toEqual([33_001, 33_001, 33_001]);
    expect(r.acquisitionPrice).toBe(330_010_000);
  });
});

describe("L-e 자본조정(무상증자) 희석 — 피상속인 1주당 취득가액도 총액 보존으로 희석", () => {
  // 가업 lot 6,000주 · 평가 50,000 · 피상속인 5,000 · 적용률 8/10 · 2025-01-15 자본준비금 무상증자 50% → 9,000주
  //   평가 단가: ⌊6,000 × 50,000 ÷ 9,000⌋ = 33,333 · 피상속인 단가: ⌊6,000 × 5,000 ÷ 9,000⌋ = 3,333
  // 9,000주 양도: ⌊3,333 × 9,000 × 8/10⌋ = ⌊29,997,000 × 0.8⌋ = 23,997,600 · ⌊33,333 × 9,000 × 2/10⌋ = ⌊299,997,000 × 0.2⌋ = 59,999,400
  //   → 83,997,000 (희석 전 총액 기준 84,000,000 — 1주당 floor 차이 3,000)
  it("피상속인 단가 3,333 · 취득가 83,997,000", () => {
    const r = calculateStockTransferTax(
      lots(
        [fbLot("b", "2024-03-01", 6_000, 50_000, 5_000, ratio(8, 10))],
        [sale("t", "2026-06-01", 9_000)],
        "fifo",
        { capitalAdjustments: [{ type: "bonus_capital_reserve", eventDate: D("2025-01-15"), ratio: 0.5 }] },
      ),
    );
    expect(r.lotMatchingDetail!.matched[0].buyCost).toBe(83_997_000);
    expect(r.acquisitionPrice).toBe(83_997_000);
    expect(r.familyBusinessDetail).toMatchObject({ decedentAcquisitionPricePerShare: 3_333, shareCount: 9_000 });
  });
});

describe("L-a·L-b 입력 불변식 · 게이트", () => {
  const sold = [sale("t", "2026-06-01", 10_000)];

  it("L-a: 상속 원인이 아닌 lot의 가업 입력은 throw", () => {
    const bad = lot("b", "2024-03-01", 10_000, 50_000, {
      acquisitionCause: "purchase",
      familyBusinessInheritance: { decedentAcquisitionPricePerShare: 5_000, fbRateBasis: ratio(8, 10) },
    });
    expect(() => calculateStockTransferTax(lots([bad], sold))).toThrow(/상속/);
  });

  it("L-a: 종목 축과 lot에 가업 입력이 함께 있으면 throw · 종목 축만 있는 split도 throw(조용히 버려지지 않게)", () => {
    const withLot = lots([fbLot("b", "2024-03-01", 10_000, 50_000, 5_000, ratio(8, 10))], sold, "fifo", {
      familyBusinessInheritance: { decedentAcquisitionPricePerShare: 5_000, fbRateBasis: ratio(8, 10) },
    });
    expect(() => calculateStockTransferTax(withLot)).toThrow(/함께/);
    const axisOnly = lots([lot("b", "2024-03-01", 10_000, 50_000, { acquisitionCause: "inheritance" })], sold, "fifo", {
      acquisitionCause: "inheritance",
      familyBusinessInheritance: { decedentAcquisitionPricePerShare: 5_000, fbRateBasis: ratio(8, 10) },
    });
    expect(() => calculateStockTransferTax(axisOnly)).toThrow(/해당 상속 lot에 입력/);
  });

  it("L-a: 피상속인 1주당 ≤ 0 · 분모 0 · 분할 입력이 아닌데 lot에 가업 입력", () => {
    expect(() => calculateStockTransferTax(lots([fbLot("b", "2024-03-01", 10_000, 50_000, 0, ratio(8, 10))], sold))).toThrow(/피상속인/);
    expect(() => calculateStockTransferTax(lots([fbLot("b", "2024-03-01", 10_000, 50_000, 5_000, ratio(0, 0))], sold))).toThrow(/총자산가액/);
    const notSplit = lots([fbLot("b", "2024-03-01", 10_000, 50_000, 5_000, ratio(8, 10))], sold, "fifo", { costAllocationMethod: undefined });
    expect(() => calculateStockTransferTax(notSplit)).toThrow(/분할·다건/);
  });

  it("L-b: 매도 양도일과 법정량 종류가 다르면 throw — 02-26 매도에 신 ③2호 · 02-27 매도에 구 ③ (fifo · moving_avg)", () => {
    for (const method of ["fifo", "moving_avg"] as const) {
      expect(() =>
        calculateStockTransferTax(lots([fbLot("b", "2024-03-01", 10_000, 50_000, 5_000, ratio(8, 10))], [sale("t", "2026-02-26", 10_000)], method)),
      ).toThrow(/구 소득세법 시행령 §163의2③/);
      expect(() =>
        calculateStockTransferTax(lots([fbLot("b", "2024-03-01", 10_000, 50_000, 5_000, deduction(8, 10))], [sale("t", "2026-02-27", 10_000)], method)),
      ).toThrow(/§163의2 ③ 2호/);
    }
  });

  it("L-b: 양도일 경계 — 02-26 매도에 구 ③ · 02-27 매도에 신 ③2호는 같은 취득가 140,000,000", () => {
    const old = calculateStockTransferTax(lots([fbLot("b", "2024-03-01", 10_000, 50_000, 5_000, deduction(8, 10))], [sale("t", "2026-02-26", 10_000)]));
    expect(old.acquisitionPrice).toBe(140_000_000);
    expect(old.familyBusinessDetail?.appliedRateBasis.kind).toBe("deduction_ratio");
    const fresh = calculateStockTransferTax(lots([fbLot("b", "2024-03-01", 10_000, 50_000, 5_000, ratio(8, 10))], [sale("t", "2026-02-27", 10_000)]));
    expect(fresh.acquisitionPrice).toBe(140_000_000);
  });

  it("G-1 lot마다: 상속개시일 2013-12-31 lot은 일반 상속 lot + 안내 · 2014-01-01 lot은 의제", () => {
    // 2013-12-31 lot 6,000주 + 2014-01-01 lot 4,000주 @50,000 · 양도 10,000주 — 후자만 ⌊(5,000 × 4,000) × 8/10⌋ + ⌊50,000 × 4,000 × 2/10⌋ = 16,000,000 + 40,000,000 = 56,000,000
    // 전자는 6,000 × 50,000 = 300,000,000 → 취득가 356,000,000
    const r = calculateStockTransferTax(
      lots(
        [fbLot("old", "2013-12-31", 6_000, 50_000, 5_000, ratio(8, 10)), fbLot("new", "2014-01-01", 4_000, 50_000, 5_000, ratio(8, 10))],
        sold,
      ),
    );
    expect(r.acquisitionPrice).toBe(356_000_000);
    expect(r.familyBusinessDetail?.imputedAcquisitionPrice).toBe(56_000_000);
    expect(r.warnings).toContain(STOCK_FB_PRE_2014_NOTICE);
    // 전부 2014 이전이면 detail 없이 안내만(일반 상속 lot)
    const none = calculateStockTransferTax(lots([fbLot("old", "2013-12-31", 10_000, 50_000, 5_000, ratio(8, 10))], sold));
    expect(none.acquisitionPrice).toBe(500_000_000);
    expect(none.familyBusinessDetail).toBeUndefined();
    expect(none.warnings).toContain(STOCK_FB_PRE_2014_NOTICE);
  });
});

describe("회귀 — 가업 입력이 없는(또는 G-1 탈락한) 입력은 종전과 비트 동일", () => {
  // 손계산: fifo A 2,000 @30,000 + B 상속 3,000 @50,000 → 양도 5,000 @80,000: 400,000,000 − (60,000,000 + 150,000,000) = 190,000,000
  //   과표 187,500,000 · 20% = 37,500,000
  const acq = [lot("a", "2023-01-10", 2_000, 30_000), lot("b", "2024-03-01", 3_000, 50_000, { acquisitionCause: "inheritance" })];
  for (const method of ["fifo", "moving_avg"] as const) {
    it(`${method}: 정수 단가 lot만이면 buyCost 없음 · 취득가 210,000,000 · 산출 37,500,000`, () => {
      const r = calculateStockTransferTax(lots(acq, [sale("t", "2026-06-01", 5_000)], method));
      // moving_avg: (2,000 × 30,000 + 3,000 × 50,000) ÷ 5,000 = 42,000 → 5,000 × 42,000 = 210,000,000
      expect(r.acquisitionPrice).toBe(210_000_000);
      expect(r.calculatedTax).toBe(37_500_000);
      expect(r.lotMatchingDetail!.matched.every((m) => m.buyCost === undefined)).toBe(true);
      expect(r.lotMatchingDetail!.familyBusinessSummary).toBeUndefined();
      expect(r.familyBusinessDetail).toBeUndefined();
    });
  }

  it("G-1 탈락 가업 lot은 가업 입력이 없는 같은 입력과 결과가 같다(경고만 추가)", () => {
    const plain = lots([lot("b", "2013-12-31", 10_000, 50_000, { acquisitionCause: "inheritance" })], [sale("t", "2026-06-01", 10_000)]);
    const withFb = lots([fbLot("b", "2013-12-31", 10_000, 50_000, 5_000, ratio(8, 10))], [sale("t", "2026-06-01", 10_000)]);
    const a = calculateStockTransferTax(plain);
    const b = calculateStockTransferTax(withFb);
    expect(b.acquisitionPrice).toBe(a.acquisitionPrice);
    expect(b.calculatedTax).toBe(a.calculatedTax);
    expect(b.lotMatchingDetail!.matched.map((m) => m.perShareBuyPrice)).toEqual(a.lotMatchingDetail!.matched.map((m) => m.perShareBuyPrice));
  });
});

describe("Q-11 lot 종목 + 단건 종목 합산 — 신고 단위 총차이 1회", () => {
  it("가업 종목 2건(lot · 단건) — 두 종목에 같은 공제 · fbItemCount 2 · 둘 다 §97로 되돌린 합산과 견준다", () => {
    const lotItem = lots(
      [fbLot("b", "2024-03-01", 10_000, 50_000, 5_000, ratio(8, 10))],
      [sale("t", "2026-03-01", 10_000, 30_000)],
    );
    const singleItem = fb(ratio(8, 10), { perShareTransferPrice: 70_000 }, 40_000);
    const r = calculateStockTransferTaxAggregate([lotItem, singleItem]);
    const regular = calculateStockTransferTaxAggregate([
      { ...lotItem, acquisitionLots: lotItem.acquisitionLots!.map((l) => ({ ...l, familyBusinessInheritance: undefined })) },
      { ...singleItem, familyBusinessInheritance: undefined },
    ]);
    // 취득가 손계산: lot = ⌊50,000,000 × 8/10⌋ + ⌊500,000,000 × 2/10⌋ = 40,000,000 + 100,000,000 = 140,000,000
    //   단건(피상속인 4만) = ⌊400,000,000 × 8/10⌋ + 100,000,000 = 320,000,000 + 100,000,000 = 420,000,000
    expect(r.items.map((x) => x.acquisitionPrice)).toEqual([140_000_000, 420_000_000]);
    const d0 = r.items[0].familyBusinessDetail!;
    const d1 = r.items[1].familyBusinessDetail!;
    expect(d0.fbItemCount).toBe(2);
    expect(d0.cgtUnderSection97_2_4).toBe(r.totalDeterminedTax);
    expect(d0.cgtUnderSection97).toBe(regular.totalDeterminedTax);
    expect(d0.creditAmount).toBe(Math.max(0, r.totalDeterminedTax - regular.totalDeterminedTax));
    expect(d1).toMatchObject({ cgtUnderSection97_2_4: d0.cgtUnderSection97_2_4, cgtUnderSection97: d0.cgtUnderSection97, creditAmount: d0.creditAmount });
  });

  it("가업 lot이 배정되지 않은 lot 종목은 가업 종목 수에 세지 않는다", () => {
    const idle = lots(
      [lot("a", "2023-01-10", 5_000, 30_000), fbLot("b", "2024-03-01", 5_000, 50_000, 5_000, ratio(8, 10))],
      [sale("t", "2026-03-01", 2_000, 30_000)],
    );
    const r = calculateStockTransferTaxAggregate([idle, fb(ratio(8, 10), { perShareTransferPrice: 70_000 }, 40_000)]);
    expect(r.items[0].familyBusinessDetail).toBeUndefined();
    expect(r.items[0].warnings).toContain(STOCK_FB_LOT_UNALLOCATED_NOTICE);
    expect(r.items[1].familyBusinessDetail?.fbItemCount).toBe(1);
  });
});
