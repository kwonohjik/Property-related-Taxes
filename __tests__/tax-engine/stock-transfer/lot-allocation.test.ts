/**
 * 분할 매수·분할 양도 본 Do 단계 anchor (LOT-3~LOT-23)
 *
 * Pre-Do anchor (lot-allocation.anchor.test.ts): AT-LOT-1~4 (specific·fifo·moving_avg·cause 혼재)
 * 본 파일: 케이스 매트릭스 C-3~C-26 중 본 Do 단계 검증
 *
 * 디자인: docs/02-design/features/stock-split-lots.engine.design.md
 */

import { describe, it, expect } from "vitest";
import { allocateLots } from "@/lib/tax-engine/stock-transfer/lot-allocation";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type {
  AcquisitionLot,
  TransferLot,
  StockTransferInput,
} from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

const baseInput = (): Omit<StockTransferInput, "acquisitionDate" | "transferDate" | "shareCount"> => ({
  marketType: "kospi",
  isMajorShareholder: true,
  selfShareRatio: 0.05,
  selfMarketCap: 5_000_000_000,
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
  totalIssuedShares: 1_000_000,
  acquisitionCause: "purchase",
  cumulativeTransferRatio: 0,
  transferPriceMode: "actual",
  acquisitionMode: "actual",
  acquiredBeforeListing: false,
  tradingHaltAtTransfer: false,
  bookLost: false,
  expenseMode: "actual",
  actualExpenses: 0,
  filingType: "preliminary",
  filingDate: new Date("2025-05-31"),
  isElectronicFiling: false,
  isFraudulent: false,
  isInternationalTransaction: false,
  realEstateGroupBasicDeductionUsed: 0,
});

describe("lot-allocation Do 단계 anchor (LOT-3~LOT-23)", () => {
  // LOT-3 (C-3): single과 split 1:1 동일 결과
  it("LOT-3 (C-3): split 1매수·1매도 == single 동일 결과", () => {
    const acquisitionLots: AcquisitionLot[] = [
      {
        id: "a1",
        acquisitionDate: new Date("2023-01-15"),
        shareCount: 100,
        perShareAcquisitionPrice: 10_000,
        acquisitionCause: "purchase",
      },
    ];
    const transferLots: TransferLot[] = [
      {
        id: "t1",
        transferDate: new Date("2025-03-10"),
        shareCount: 100,
        perShareTransferPrice: 15_000,
      },
    ];
    const result = allocateLots(acquisitionLots, transferLots, "fifo", true, false);
    expect(result.totalTransferPrice).toBe(1_500_000);
    expect(result.totalAcquisitionPrice).toBe(1_000_000);
    expect(result.totalGain).toBe(500_000);
    expect(result.matched).toHaveLength(1);
  });

  // LOT-5 (C-5): 1 매수 → 2 매도 (분할 양도)
  it("LOT-5 (C-5): 1 매수 → 2 매도 분할", () => {
    const acquisitionLots: AcquisitionLot[] = [
      {
        id: "a1",
        acquisitionDate: new Date("2023-01-15"),
        shareCount: 300,
        perShareAcquisitionPrice: 10_000,
        acquisitionCause: "purchase",
      },
    ];
    const transferLots: TransferLot[] = [
      { id: "t1", transferDate: new Date("2024-06-01"), shareCount: 100, perShareTransferPrice: 13_000 },
      { id: "t2", transferDate: new Date("2025-03-10"), shareCount: 150, perShareTransferPrice: 15_000 },
    ];
    const result = allocateLots(acquisitionLots, transferLots, "fifo", true, false);
    expect(result.matched).toHaveLength(2);
    expect(result.totalTransferPrice).toBe(100 * 13_000 + 150 * 15_000); // 3,550,000
    expect(result.totalAcquisitionPrice).toBe(250 * 10_000); // 2,500,000
    expect(result.totalGain).toBe(1_050_000);
  });

  // LOT-7b (C-7b): 비대주주 + 단기 — 단기 30% 미적용
  it("LOT-7b (C-7b): 비대주주 단기 sub-lot에 30% 미적용", () => {
    const acquisitionLots: AcquisitionLot[] = [
      {
        id: "a1",
        acquisitionDate: new Date("2024-09-01"),
        shareCount: 100,
        perShareAcquisitionPrice: 10_000,
        acquisitionCause: "purchase",
      },
    ];
    const transferLots: TransferLot[] = [
      { id: "t1", transferDate: new Date("2025-03-01"), shareCount: 100, perShareTransferPrice: 15_000 },
    ];
    // isMajorAndNonSME=false (비대주주)
    const result = allocateLots(acquisitionLots, transferLots, "fifo", false, false);
    expect(result.matched[0].isShortTerm).toBe(true);
    // 단기 30% 미적용 → 비대주주 단일 세율 0.20
    expect(result.matched[0].appliedRate).toBe(0.20);
  });

  // LOT-12 (C-12): cause=gift lot — 수증일(acquisitionDate)이 §104② 기산일
  it("LOT-12 (C-12): gift lot은 lot.acquisitionDate가 §104② 기산일", () => {
    const acquisitionLots: AcquisitionLot[] = [
      {
        id: "a1",
        acquisitionDate: new Date("2024-09-01"), // 수증일
        shareCount: 100,
        perShareAcquisitionPrice: 12_000, // §163⑨ 평가가액
        acquisitionCause: "gift",
      },
    ];
    const transferLots: TransferLot[] = [
      { id: "t1", transferDate: new Date("2025-03-01"), shareCount: 100, perShareTransferPrice: 15_000 },
    ];
    const result = allocateLots(acquisitionLots, transferLots, "fifo", true, false);
    expect(result.matched[0].acquisitionDate.getTime()).toBe(new Date("2024-09-01").getTime());
    expect(result.matched[0].isShortTerm).toBe(true); // 181일 < 365
  });

  // LOT-13 (C-13): cause=merger_split — preMergerAcquisitionDate 사용
  it("LOT-13 (C-13): merger_split lot은 preMergerAcquisitionDate가 §104② 기산일", () => {
    const acquisitionLots: AcquisitionLot[] = [
      {
        id: "a1",
        acquisitionDate: new Date("2024-09-01"), // 합병 후 교부일
        shareCount: 100,
        perShareAcquisitionPrice: 12_000,
        acquisitionCause: "merger_split",
        preMergerAcquisitionDate: new Date("2018-06-20"), // §104②3 종전 주식
      },
    ];
    const transferLots: TransferLot[] = [
      { id: "t1", transferDate: new Date("2025-03-01"), shareCount: 100, perShareTransferPrice: 15_000 },
    ];
    const result = allocateLots(acquisitionLots, transferLots, "fifo", true, false);
    expect(result.matched[0].acquisitionDate.getTime()).toBe(new Date("2018-06-20").getTime());
    expect(result.matched[0].isShortTerm).toBe(false); // 장기 (2,445일)
  });

  // LOT-16 (C-16): moving_avg — 단가 동일 lot 가중평균
  it("LOT-16 (C-16): moving_avg lot 단가 동일 → 평균 = 단가", () => {
    const acquisitionLots: AcquisitionLot[] = [
      { id: "a1", acquisitionDate: new Date("2023-01-15"), shareCount: 100, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
      { id: "a2", acquisitionDate: new Date("2024-06-01"), shareCount: 200, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
    ];
    const transferLots: TransferLot[] = [
      { id: "t1", transferDate: new Date("2025-03-10"), shareCount: 250, perShareTransferPrice: 15_000 },
    ];
    const result = allocateLots(acquisitionLots, transferLots, "moving_avg", true, false);
    expect(result.weightedAvgPerShare).toBe(10_000);
    expect(result.totalAcquisitionPrice).toBe(250 * 10_000);
  });

  // LOT-17 (C-17): 매도일자 다중 — lot별 보유기간
  it("LOT-17 (C-17): 매도일자 다중 — lot별 §104② 보유기간 분리", () => {
    const acquisitionLots: AcquisitionLot[] = [
      { id: "a1", acquisitionDate: new Date("2023-01-15"), shareCount: 300, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
    ];
    const transferLots: TransferLot[] = [
      { id: "t1", transferDate: new Date("2023-09-01"), shareCount: 100, perShareTransferPrice: 12_000 }, // 단기
      { id: "t2", transferDate: new Date("2025-03-01"), shareCount: 100, perShareTransferPrice: 15_000 }, // 장기
    ];
    const result = allocateLots(acquisitionLots, transferLots, "fifo", true, false);
    expect(result.matched).toHaveLength(2);
    expect(result.matched[0].isShortTerm).toBe(true);   // 2023-09-01 < 1년
    expect(result.matched[1].isShortTerm).toBe(false);  // 2025-03-01 > 1년
  });

  // LOT-25 (C-25): 양도손실 — sub-lot perLotGain 음수
  it("LOT-25 (C-25): 양도손실 음수 perLotGain", () => {
    const acquisitionLots: AcquisitionLot[] = [
      { id: "a1", acquisitionDate: new Date("2023-01-15"), shareCount: 100, perShareAcquisitionPrice: 20_000, acquisitionCause: "purchase" },
    ];
    const transferLots: TransferLot[] = [
      { id: "t1", transferDate: new Date("2025-03-01"), shareCount: 100, perShareTransferPrice: 15_000 }, // 손실
    ];
    const result = allocateLots(acquisitionLots, transferLots, "fifo", true, false);
    expect(result.matched[0].perLotGain).toBe(-500_000);
    expect(result.totalGain).toBe(-500_000);
    expect(result.matched[0].appliedRate).toBe(0); // 손실 sub-lot 세율 0
  });

  // LOT-26 (C-26): 비대주주 단일 세율 (sub-lot 분기 무관)
  it("LOT-26 (C-26): 비대주주 단일 세율 — sub-lot 분기 무관", () => {
    const acquisitionLots: AcquisitionLot[] = [
      { id: "a1", acquisitionDate: new Date("2023-01-15"), shareCount: 100, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
      { id: "a2", acquisitionDate: new Date("2024-09-01"), shareCount: 200, perShareAcquisitionPrice: 12_000, acquisitionCause: "purchase" },
    ];
    const transferLots: TransferLot[] = [
      { id: "t1", transferDate: new Date("2025-03-10"), shareCount: 250, perShareTransferPrice: 15_000 },
    ];
    // 비대주주 (isMajorAndNonSME=false), 비SME
    const result = allocateLots(acquisitionLots, transferLots, "fifo", false, false);
    // 모든 sub-lot 단일 세율 0.20
    for (const sub of result.matched) {
      expect(sub.appliedRate).toBe(0.20);
    }
  });
});

describe("split 모드 메인 엔진 통합 (LOT-INT)", () => {
  // LOT-INT-1: split 모드 메인 엔진 호출 → lotMatchingDetail echo
  it("LOT-INT-1: split 모드 메인 엔진 result.lotMatchingDetail echo + appliedRules 추가", () => {
    const input: StockTransferInput = {
      ...baseInput(),
      acquisitionDate: new Date("2023-01-15"),
      transferDate: new Date("2025-03-10"),
      shareCount: 250,
      perShareTransferPrice: 15_000,
      acquisitionLots: [
        { id: "a1", acquisitionDate: new Date("2023-01-15"), shareCount: 100, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
        { id: "a2", acquisitionDate: new Date("2024-09-01"), shareCount: 200, perShareAcquisitionPrice: 12_000, acquisitionCause: "purchase" },
      ],
      transferLots: [
        { id: "t1", transferDate: new Date("2025-03-10"), shareCount: 250, perShareTransferPrice: 15_000 },
      ],
      costAllocationMethod: "fifo",
    };
    const result = calculateStockTransferTax(input);
    expect(result.lotMatchingDetail).toBeDefined();
    expect(result.lotMatchingDetail?.method).toBe("fifo");
    expect(result.lotMatchingDetail?.totalGain).toBe(950_000);
    expect(result.appliedRules).toContain("로트선입선출");
    // transferPrice·acquisitionPrice가 lot 합계로 채워짐
    expect(result.transferPrice).toBe(3_750_000);
    expect(result.acquisitionPrice).toBe(2_800_000);
  });

  // LOT-INT-2: split 모드 산정방법별 appliedRules
  it("LOT-INT-2: specific 모드 appliedRules에 로트개별법 추가", () => {
    const input: StockTransferInput = {
      ...baseInput(),
      acquisitionDate: new Date("2023-01-15"),
      transferDate: new Date("2025-03-10"),
      shareCount: 100,
      perShareTransferPrice: 15_000,
      acquisitionLots: [
        { id: "a1", acquisitionDate: new Date("2023-01-15"), shareCount: 100, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
      ],
      transferLots: [
        { id: "t1", transferDate: new Date("2025-03-10"), shareCount: 100, perShareTransferPrice: 15_000 },
      ],
      costAllocationMethod: "specific",
      specificMatchings: [{ transferLotId: "t1", acquisitionLotId: "a1", shareCount: 100 }],
    };
    const result = calculateStockTransferTax(input);
    expect(result.appliedRules).toContain("로트개별법");
  });

  // LOT-INT-3: split 모드 회귀 — single 모드는 lotMatchingDetail undefined
  it("LOT-INT-3: single 모드는 lotMatchingDetail undefined (회귀 보장)", () => {
    const input: StockTransferInput = {
      ...baseInput(),
      acquisitionDate: new Date("2023-01-15"),
      transferDate: new Date("2025-03-10"),
      shareCount: 100,
      perShareTransferPrice: 15_000,
      perShareAcquisitionPrice: 10_000,
      // acquisitionLots·transferLots 없음
    };
    const result = calculateStockTransferTax(input);
    expect(result.lotMatchingDetail).toBeUndefined();
    expect(result.appliedRules).not.toContain("로트선입선출");
  });
});
