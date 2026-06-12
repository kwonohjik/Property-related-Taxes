/**
 * B-3 — 진정 이동평균법 (주식 분할 매수)
 *
 * 계획: docs/00-pm/stock-transfer-true-moving-avg-b3.plan.md
 * 설계: docs/02-design/features/stock-transfer-true-moving-avg-b3.{engine,ui}.design.md
 * 법령: 양도세 명문 부재 + 법인세령 §74①1마 이동평균법 표준 정의(참조). 보유기간 = FIFO 하이브리드.
 *
 * 단가 = 매도 시점까지 취득분 잔고 이동평균. 보유기간(§104②) = FIFO lot startDate(독립).
 *
 *   MA-ENGINE-1: 매수 2 → 일괄 양도 (교차 없음) → 이동평균 = 총평균 (AT-LOT-3 불변)
 *   MA-ENGINE-2: 매수a→매도→매수b→매도 (교차) → 시점별 단가 상이 + sub-lot 분할
 *   MA-ENGINE-3: MA-2 + a장기/b단기 → 단기·장기 gain 분리
 *   MA-ENGINE-4: 단일 매수 → 양도 (평균 = 단가)
 *   MA-ENGINE-6: floor 잔차 (150 나눗셈)
 *   MA-BOUNDARY-1: 매수일 == 매도일 → 그 매도 모수 포함
 */

import { describe, it, expect } from "vitest";
import { allocateLots } from "@/lib/tax-engine/stock-transfer/lot-allocation";
import type {
  AcquisitionLot,
  TransferLot,
} from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

describe("B-3: 진정 이동평균법", () => {
  it("MA-ENGINE-1: 매수 2 → 일괄 양도 (교차 없음) → 이동평균 = 총평균 15,000", () => {
    const acq: AcquisitionLot[] = [
      { id: "a", acquisitionDate: new Date("2023-01-15"), shareCount: 100, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
      { id: "b", acquisitionDate: new Date("2024-01-15"), shareCount: 100, perShareAcquisitionPrice: 20_000, acquisitionCause: "purchase" },
    ];
    const trn: TransferLot[] = [
      { id: "s1", transferDate: new Date("2025-03-10"), shareCount: 200, perShareTransferPrice: 25_000 },
    ];
    const r = allocateLots(acq, trn, "moving_avg", true, false);
    // 양도 시점에 a·b 모두 잔고 → 이동평균 (100×10K + 100×20K)/200 = 15,000
    expect(r.weightedAvgPerShare).toBe(15_000);
    expect(r.totalAcquisitionPrice).toBe(3_000_000); // 200 × 15,000
    expect(r.matched.every((m) => m.perShareBuyPrice === 15_000)).toBe(true);
  });

  it("MA-ENGINE-2: 교차 (a→매도50→b→매도100) → 시점별 단가 + sub-lot 분할", () => {
    const acq: AcquisitionLot[] = [
      { id: "a", acquisitionDate: new Date("2023-01-01"), shareCount: 100, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
      { id: "b", acquisitionDate: new Date("2024-06-01"), shareCount: 100, perShareAcquisitionPrice: 20_000, acquisitionCause: "purchase" },
    ];
    const trn: TransferLot[] = [
      { id: "s1", transferDate: new Date("2024-03-01"), shareCount: 50, perShareTransferPrice: 12_000 },  // b 취득 전
      { id: "s2", transferDate: new Date("2024-12-01"), shareCount: 100, perShareTransferPrice: 25_000 }, // b 취득 후
    ];
    const r = allocateLots(acq, trn, "moving_avg", true, false);

    // s1(2024-03): 잔고 = a 100주 @10,000 → 이동평균 10,000. 50주 매도 단가 10,000
    const s1subs = r.matched.filter((m) => m.saleDate.getTime() === new Date("2024-03-01").getTime());
    expect(s1subs).toHaveLength(1);
    expect(s1subs[0].perShareBuyPrice).toBe(10_000);
    expect(s1subs[0].buyShares).toBe(50);

    // s2(2024-12): 잔고 = a잔여50@10,000(원가 500,000) + b100@20,000(2,000,000) = 150주·2,500,000
    //   → 이동평균 floor(2,500,000/150) = 16,666
    //   FIFO 차감: a잔여50 + b50 → 2 sub-lot, 단가 둘 다 16,666
    const s2subs = r.matched.filter((m) => m.saleDate.getTime() === new Date("2024-12-01").getTime());
    expect(s2subs).toHaveLength(2);
    expect(s2subs.every((m) => m.perShareBuyPrice === 16_666)).toBe(true);
    expect(s2subs.reduce((s, m) => s + m.buyShares, 0)).toBe(100);
    // a sub-lot startDate 2023-01-01, b sub-lot startDate 2024-06-01
    expect(s2subs.some((m) => m.acquisitionDate.getTime() === new Date("2023-01-01").getTime())).toBe(true);
    expect(s2subs.some((m) => m.acquisitionDate.getTime() === new Date("2024-06-01").getTime())).toBe(true);
  });

  it("MA-ENGINE-3: 교차 + a장기/b단기 → 단기·장기 gain 분리 (단가 공통)", () => {
    const acq: AcquisitionLot[] = [
      { id: "a", acquisitionDate: new Date("2023-01-01"), shareCount: 100, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
      { id: "b", acquisitionDate: new Date("2024-06-01"), shareCount: 100, perShareAcquisitionPrice: 20_000, acquisitionCause: "purchase" },
    ];
    const trn: TransferLot[] = [
      { id: "s1", transferDate: new Date("2024-03-01"), shareCount: 50, perShareTransferPrice: 12_000 },
      { id: "s2", transferDate: new Date("2024-12-01"), shareCount: 100, perShareTransferPrice: 25_000 },
    ];
    const r = allocateLots(acq, trn, "moving_avg", true, false);
    const s2subs = r.matched.filter((m) => m.saleDate.getTime() === new Date("2024-12-01").getTime());
    // a sub-lot(2023-01-01 → 2024-12-01 = 700일, 장기) / b sub-lot(2024-06-01 → 2024-12-01 = 183일, 단기)
    const aSub = s2subs.find((m) => m.acquisitionDate.getTime() === new Date("2023-01-01").getTime())!;
    const bSub = s2subs.find((m) => m.acquisitionDate.getTime() === new Date("2024-06-01").getTime())!;
    expect(aSub.isShortTerm).toBe(false);
    expect(bSub.isShortTerm).toBe(true);
    expect(aSub.perShareBuyPrice).toBe(bSub.perShareBuyPrice); // 단가 공통 16,666
  });

  it("MA-ENGINE-4: 단일 매수 → 양도 (평균 = 단가)", () => {
    const acq: AcquisitionLot[] = [
      { id: "a", acquisitionDate: new Date("2023-01-01"), shareCount: 100, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
    ];
    const trn: TransferLot[] = [
      { id: "s1", transferDate: new Date("2025-01-01"), shareCount: 100, perShareTransferPrice: 15_000 },
    ];
    const r = allocateLots(acq, trn, "moving_avg", true, false);
    expect(r.weightedAvgPerShare).toBe(10_000); // 전량 매도 → 마지막 매도 시점 단가
    expect(r.totalAcquisitionPrice).toBe(1_000_000);
  });

  it("MA-ENGINE-6: floor 잔차 — 잔고 150주 나눗셈 (16,666)", () => {
    const acq: AcquisitionLot[] = [
      { id: "a", acquisitionDate: new Date("2023-01-01"), shareCount: 50, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
      { id: "b", acquisitionDate: new Date("2023-06-01"), shareCount: 100, perShareAcquisitionPrice: 20_000, acquisitionCause: "purchase" },
    ];
    const trn: TransferLot[] = [
      { id: "s1", transferDate: new Date("2025-01-01"), shareCount: 150, perShareTransferPrice: 25_000 },
    ];
    const r = allocateLots(acq, trn, "moving_avg", true, false);
    // 잔고 (50×10K + 100×20K)/150 = 2,500,000/150 = 16,666.67 → floor 16,666
    expect(r.matched.every((m) => m.perShareBuyPrice === 16_666)).toBe(true);
    expect(r.totalAcquisitionPrice).toBe(150 * 16_666); // 2,499,900 (floor 잔차 −100 일관)
  });

  it("MA-BOUNDARY-1: 매수일 == 매도일 → 그 매도 모수 포함", () => {
    const acq: AcquisitionLot[] = [
      { id: "a", acquisitionDate: new Date("2024-01-01"), shareCount: 100, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
      { id: "b", acquisitionDate: new Date("2024-06-01"), shareCount: 100, perShareAcquisitionPrice: 20_000, acquisitionCause: "purchase" },
    ];
    const trn: TransferLot[] = [
      { id: "s1", transferDate: new Date("2024-06-01"), shareCount: 100, perShareTransferPrice: 25_000 }, // b 취득일 == 매도일
    ];
    const r = allocateLots(acq, trn, "moving_avg", true, false);
    // b 동일자 취득분 포함 → 잔고 (100×10K + 100×20K)/200 = 15,000
    expect(r.matched.every((m) => m.perShareBuyPrice === 15_000)).toBe(true);
  });
});
