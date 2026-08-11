/**
 * Pre-Do Anchor — 분할 매수·분할 양도 lot 매칭 4건
 *
 * 디자인: docs/02-design/features/stock-split-lots.engine.design.md
 * AT-LOT-1: specific 개별법 N:M
 * AT-LOT-2: fifo + 단기 30% 게이트 (대주주+비SME)
 * AT-LOT-3: moving_avg 총평균법 + FIFO 보유기간
 * AT-LOT-4: cause 혼재 (매매+상속) lot별 §104② 기산점
 */

import { describe, it, expect } from "vitest";
import { allocateLots, resolveLotStartDate } from "@/lib/tax-engine/stock-transfer/lot-allocation";
import { calcSplitModeTax } from "@/lib/tax-engine/stock-transfer/lot-allocation-tax";
import type {
  AcquisitionLot,
  TransferLot,
  LotMatchingDetail,
  MatchedSubLot,
} from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/** 비대주주 분기 anchor용 최소 LotMatchingDetail (matched는 비대주주 분기에서 미사용) */
function makeNonMajorLotDetail(totalGain: number): LotMatchingDetail {
  const sub: MatchedSubLot = {
    saleDate: new Date("2025-03-10"),
    saleShares: 100,
    perShareSalePrice: 15_000,
    acquisitionDate: new Date("2023-01-15"),
    buyShares: 100,
    perShareBuyPrice: 5_000,
    holdingDays: 785,
    isShortTerm: false,
    perLotGain: totalGain,
    appliedRate: 0,
    subLotTax: 0,
  };
  return {
    method: "fifo",
    matched: [sub],
    totalTransferPrice: 1_500_000,
    totalAcquisitionPrice: 500_000,
    totalGain,
    shortTermGain: 0,
    longTermGain: totalGain,
    carryoverDonorCapex: 0,
    carryoverGiftTaxApportioned: 0,
    warnings: [],
  };
}

describe("lot-allocation Pre-Do anchor", () => {
  // AT-LOT-1: specific 개별법 N:M 매칭
  it("AT-LOT-1: specific 개별법 — 매수 2 → 매도 1, 사용자 명시 매칭", () => {
    const acquisitionLots: AcquisitionLot[] = [
      {
        id: "buy1",
        acquisitionDate: new Date("2023-01-15"),
        shareCount: 100,
        perShareAcquisitionPrice: 10_000,
        acquisitionCause: "purchase",
      },
      {
        id: "buy2",
        acquisitionDate: new Date("2024-09-01"),
        shareCount: 200,
        perShareAcquisitionPrice: 12_000,
        acquisitionCause: "purchase",
      },
    ];
    const transferLots: TransferLot[] = [
      {
        id: "sell1",
        transferDate: new Date("2025-03-10"),
        shareCount: 250,
        perShareTransferPrice: 15_000,
      },
    ];
    const result = allocateLots(
      acquisitionLots,
      transferLots,
      "specific",
      true, // isMajorAndNonSME
      false, // isSME
      [
        { transferLotId: "sell1", acquisitionLotId: "buy1", shareCount: 100 },
        { transferLotId: "sell1", acquisitionLotId: "buy2", shareCount: 150 },
      ],
    );

    expect(result.matched.length).toBe(2);
    expect(result.totalTransferPrice).toBe(3_750_000); // 250 × 15,000
    expect(result.totalAcquisitionPrice).toBe(2_800_000); // 100×10K + 150×12K
    expect(result.totalGain).toBe(950_000);

    // buy1 sub-lot: 보유 786일 = 장기
    const buy1Match = result.matched[0];
    expect(buy1Match.buyShares).toBe(100);
    expect(buy1Match.holdingDays).toBe(785); // 2025-03-10 - 2023-01-15 (2024 leap year 포함)
    expect(buy1Match.isShortTerm).toBe(false);
    expect(buy1Match.perLotGain).toBe(500_000); // (15K - 10K) × 100

    // buy2 sub-lot: 보유 190일 = 단기
    const buy2Match = result.matched[1];
    expect(buy2Match.buyShares).toBe(150);
    expect(buy2Match.holdingDays).toBe(190); // 2025-03-10 - 2024-09-01
    expect(buy2Match.isShortTerm).toBe(true);
    expect(buy2Match.perLotGain).toBe(450_000); // (15K - 12K) × 150
  });

  // AT-LOT-2: fifo + 단기 30% 게이트 (대주주+비SME)
  it("AT-LOT-2: fifo 자동 매칭 + 단기 30% — 동일 lot 구성, 자동 산출", () => {
    const acquisitionLots: AcquisitionLot[] = [
      {
        id: "buy1",
        acquisitionDate: new Date("2023-01-15"),
        shareCount: 100,
        perShareAcquisitionPrice: 10_000,
        acquisitionCause: "purchase",
      },
      {
        id: "buy2",
        acquisitionDate: new Date("2024-09-01"),
        shareCount: 200,
        perShareAcquisitionPrice: 12_000,
        acquisitionCause: "purchase",
      },
    ];
    const transferLots: TransferLot[] = [
      {
        id: "sell1",
        transferDate: new Date("2025-03-10"),
        shareCount: 250,
        perShareTransferPrice: 15_000,
      },
    ];
    const result = allocateLots(acquisitionLots, transferLots, "fifo", true, false);

    expect(result.matched.length).toBe(2);
    // FIFO 정렬: buy1(2023-01-15) → buy2(2024-09-01)
    expect(result.matched[0].buyShares).toBe(100); // buy1 전체
    expect(result.matched[0].isShortTerm).toBe(false);
    expect(result.matched[0].perLotGain).toBe(500_000);
    expect(result.matched[1].buyShares).toBe(150); // buy2 일부
    expect(result.matched[1].isShortTerm).toBe(true);
    expect(result.matched[1].perLotGain).toBe(450_000);

    // 합계 검증
    expect(result.shortTermGain).toBe(450_000);
    expect(result.longTermGain).toBe(500_000);
    expect(result.totalGain).toBe(950_000);

    // 단기 sub-lot 세율 = 30% (§104①11호 가목 1))
    expect(result.matched[1].appliedRate).toBe(0.30);
    // 장기 sub-lot 세율 = 20% (§104①11호 가목 2) 3억 이하)
    expect(result.matched[0].appliedRate).toBe(0.20);
  });

  // AT-LOT-3: moving_avg 총평균법 + FIFO 보유기간
  it("AT-LOT-3: moving_avg 가중평균 + FIFO 보유기간", () => {
    const acquisitionLots: AcquisitionLot[] = [
      {
        id: "buy1",
        acquisitionDate: new Date("2023-01-15"),
        shareCount: 100,
        perShareAcquisitionPrice: 10_000,
        acquisitionCause: "purchase",
      },
      {
        id: "buy2",
        acquisitionDate: new Date("2024-09-01"),
        shareCount: 200,
        perShareAcquisitionPrice: 13_000,
        acquisitionCause: "purchase",
      },
    ];
    const transferLots: TransferLot[] = [
      {
        id: "sell1",
        transferDate: new Date("2025-03-10"),
        shareCount: 250,
        perShareTransferPrice: 15_000,
      },
    ];
    const result = allocateLots(acquisitionLots, transferLots, "moving_avg", true, false);

    // 가중평균 = (100×10K + 200×13K) / 300 = 3,600,000 / 300 = 12,000
    expect(result.weightedAvgPerShare).toBe(12_000);

    // FIFO 매칭: buy1 100주 (장기) + buy2 150주 (단기). 단가는 평균값
    expect(result.matched[0].buyShares).toBe(100);
    expect(result.matched[0].perShareBuyPrice).toBe(12_000); // 가중평균값
    expect(result.matched[0].isShortTerm).toBe(false);
    expect(result.matched[0].perLotGain).toBe(300_000); // (15K - 12K) × 100

    expect(result.matched[1].buyShares).toBe(150);
    expect(result.matched[1].perShareBuyPrice).toBe(12_000);
    expect(result.matched[1].isShortTerm).toBe(true);
    expect(result.matched[1].perLotGain).toBe(450_000); // (15K - 12K) × 150

    expect(result.totalAcquisitionPrice).toBe(3_000_000); // 250 × 12K
    expect(result.totalGain).toBe(750_000);
  });

  // AT-LOT-4: cause 혼재 (매매+상속) lot별 §104② 기산점
  it("AT-LOT-4: cause 혼재 — 매매 lot vs 상속 lot 각각 §104② 기산점 분기", () => {
    const acquisitionLots: AcquisitionLot[] = [
      {
        id: "buy1",
        acquisitionDate: new Date("2024-09-01"),
        shareCount: 200,
        perShareAcquisitionPrice: 12_000,
        acquisitionCause: "purchase",
      },
      {
        id: "buy2",
        acquisitionDate: new Date("2024-12-01"), // 상속 받은 일자
        shareCount: 100,
        perShareAcquisitionPrice: 14_000,
        acquisitionCause: "inheritance",
        decedentAcquisitionDate: new Date("2020-03-15"), // 피상속인 취득일 (§104②1)
      },
    ];
    const transferLots: TransferLot[] = [
      {
        id: "sell1",
        transferDate: new Date("2025-04-10"),
        shareCount: 300,
        perShareTransferPrice: 16_000,
      },
    ];
    const result = allocateLots(acquisitionLots, transferLots, "fifo", true, false);

    expect(result.matched.length).toBe(2);

    // buy1 (매매): startDate = 2024-09-01
    expect(result.matched[0].buyShares).toBe(200);
    expect(result.matched[0].acquisitionDate.getTime()).toBe(new Date("2024-09-01").getTime());
    expect(result.matched[0].holdingDays).toBe(221); // 2025-04-10 - 2024-09-01
    expect(result.matched[0].isShortTerm).toBe(true);

    // buy2 (상속): startDate = 2020-03-15 (피상속인 취득일 — §104②1)
    expect(result.matched[1].buyShares).toBe(100);
    expect(result.matched[1].acquisitionDate.getTime()).toBe(new Date("2020-03-15").getTime());
    expect(result.matched[1].holdingDays).toBe(1852); // 2025-04-10 - 2020-03-15
    expect(result.matched[1].isShortTerm).toBe(false);

    // 단기/장기 차익
    expect(result.matched[0].perLotGain).toBe(800_000); // (16K - 12K) × 200
    expect(result.matched[1].perLotGain).toBe(200_000); // (16K - 14K) × 100
    expect(result.totalGain).toBe(1_000_000);
  });

  // resolveLotStartDate 단위 테스트
  describe("resolveLotStartDate", () => {
    it("purchase → lot.acquisitionDate", () => {
      const lot: AcquisitionLot = {
        acquisitionDate: new Date("2024-01-01"),
        shareCount: 100,
        perShareAcquisitionPrice: 10_000,
        acquisitionCause: "purchase",
      };
      expect(resolveLotStartDate(lot)).toEqual(new Date("2024-01-01"));
    });

    it("inheritance → decedentAcquisitionDate", () => {
      const lot: AcquisitionLot = {
        acquisitionDate: new Date("2024-01-01"),
        shareCount: 100,
        perShareAcquisitionPrice: 10_000,
        acquisitionCause: "inheritance",
        decedentAcquisitionDate: new Date("2020-05-10"),
      };
      expect(resolveLotStartDate(lot)).toEqual(new Date("2020-05-10"));
    });

    it("gift → lot.acquisitionDate (수증일, 주식은 §97의2 미적용)", () => {
      const lot: AcquisitionLot = {
        acquisitionDate: new Date("2024-01-01"),
        shareCount: 100,
        perShareAcquisitionPrice: 10_000,
        acquisitionCause: "gift",
      };
      expect(resolveLotStartDate(lot)).toEqual(new Date("2024-01-01"));
    });

    it("merger_split → preMergerAcquisitionDate", () => {
      const lot: AcquisitionLot = {
        acquisitionDate: new Date("2024-01-01"),
        shareCount: 100,
        perShareAcquisitionPrice: 10_000,
        acquisitionCause: "merger_split",
        preMergerAcquisitionDate: new Date("2018-06-20"),
      };
      expect(resolveLotStartDate(lot)).toEqual(new Date("2018-06-20"));
    });
  });

  // ============================================================
  // calcSplitModeTax 비대주주 SME 세율 (§104①11호 나목 1) 10%)
  // 회귀: split 모드가 listed_otc_non_major에만 SME 10% 적용 →
  //       unlisted_non_major·listed_off_market_non_major + 중소기업 누락 버그
  //       (정상 경로 applyStockTaxRate는 3개 범주 전부 10% 적용)
  // ============================================================
  describe("calcSplitModeTax 비대주주 SME 세율 (회귀: 3개 범주 전부 10%)", () => {
    const TAX_BASE = 10_000_000;
    const detail = makeNonMajorLotDetail(10_000_000);

    it("AT-SPLIT-SME-1: unlisted_non_major + 중소기업 → 10% (1,000,000)", () => {
      const r = calcSplitModeTax(TAX_BASE, detail, "unlisted_non_major", true);
      expect(r.calculatedTax).toBe(1_000_000); // 10%
      expect(r.isMixedRate).toBe(false);
    });

    it("AT-SPLIT-SME-2: listed_off_market_non_major + 중소기업 → 10% (1,000,000)", () => {
      const r = calcSplitModeTax(TAX_BASE, detail, "listed_off_market_non_major", true);
      expect(r.calculatedTax).toBe(1_000_000); // 10%
    });

    it("AT-SPLIT-SME-3: listed_otc_non_major + 중소기업 → 10% (기존 정상 유지)", () => {
      const r = calcSplitModeTax(TAX_BASE, detail, "listed_otc_non_major", true);
      expect(r.calculatedTax).toBe(1_000_000); // 10%
    });

    it("AT-SPLIT-SME-4: unlisted_non_major + 비중소기업 → 20% (2,000,000)", () => {
      const r = calcSplitModeTax(TAX_BASE, detail, "unlisted_non_major", false);
      expect(r.calculatedTax).toBe(2_000_000); // 20%
    });
  });
});
