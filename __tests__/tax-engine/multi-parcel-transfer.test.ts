/**
 * 다필지 분리 계산 Pure Engine 단위 테스트
 *
 * MP-1 ~ MP-7: 알고리즘 핵심 로직 검증
 * MP-8 (EX-1): PDF 파주시 교하동 581번지 사례 원단위 앵커
 *
 * 교재: 양도·상속·증여세 이론 및 계산실무 (2023) §6편 §3장 사례06
 */

import { describe, it, expect } from "vitest";
import {
  calculateMultiParcelTransfer,
  type ParcelInput,
  type MultiParcelInput,
} from "@/lib/tax-engine/multi-parcel-transfer";

// ── 공통 상수 ──
const TRANSFER_DATE = new Date("2023-02-15");

// ── PDF 사례 필지 데이터 ──
const PARCEL_1: ParcelInput = {
  id: "parcel-1",
  acquisitionDate: new Date("1996-02-18"),
  acquisitionMethod: "estimated",
  acquisitionArea: 490,
  transferArea: 396.8,
  standardPricePerSqmAtAcq: 80_200,      // 1995년 공시지가
  standardPricePerSqmAtTransfer: 709_500, // 2022년 공시지가
  isUnregistered: false,
};

const PARCEL_2: ParcelInput = {
  id: "parcel-2",
  acquisitionDate: new Date("2007-04-27"), // 환지확정일 익일 (2007-04-26 + 1)
  acquisitionMethod: "actual",
  acquisitionArea: 32.2,
  transferArea: 32.2,
  acquisitionPrice: 34_000_000,
  expenses: 0,
  isUnregistered: false,
};

// ── MP-1: 단필지 1건 — actual 방식 단건 계산 ──
describe("MP-1: 단필지 parcels=[1건]", () => {
  it("단건 양도차익을 올바르게 계산한다", () => {
    const input: MultiParcelInput = {
      totalTransferPrice: 100_000_000,
      transferDate: new Date("2023-01-01"),
      parcels: [
        {
          id: "p1",
          acquisitionDate: new Date("2010-01-01"),
          acquisitionMethod: "actual",
          acquisitionArea: 100,
          transferArea: 100,
          acquisitionPrice: 50_000_000,
          expenses: 2_000_000,
          isUnregistered: false,
        },
      ],
    };
    const result = calculateMultiParcelTransfer(input);
    expect(result.parcelResults).toHaveLength(1);
    // 양도차익 = 100,000,000 - 50,000,000 - 2,000,000 = 48,000,000
    expect(result.parcelResults[0].transferGain).toBe(48_000_000);
    expect(result.totalTransferGain).toBe(48_000_000);
    expect(result.totalTransferPrice).toBe(100_000_000);
  });
});

// ── MP-2: 면적 안분 합계 검증 ──
describe("MP-2: 면적 안분 합계", () => {
  it("Σ allocatedTransferPrice = totalTransferPrice", () => {
    const input: MultiParcelInput = {
      totalTransferPrice: 525_000_000,
      transferDate: TRANSFER_DATE,
      parcels: [PARCEL_1, PARCEL_2],
    };
    const result = calculateMultiParcelTransfer(input);
    const sum = result.parcelResults.reduce((s, r) => s + r.allocatedTransferPrice, 0);
    expect(sum).toBe(525_000_000);
  });

  it("PDF 사례: 토지1 안분 485,594,405 / 토지2 안분 39,405,595", () => {
    const input: MultiParcelInput = {
      totalTransferPrice: 525_000_000,
      transferDate: TRANSFER_DATE,
      parcels: [PARCEL_1, PARCEL_2],
    };
    const result = calculateMultiParcelTransfer(input);
    expect(result.parcelResults[0].allocatedTransferPrice).toBe(485_594_405);
    expect(result.parcelResults[1].allocatedTransferPrice).toBe(39_405_595);
  });
});

// ── MP-3: 환산취득가 (취득면적≠양도면적) ──
describe("MP-3: 환산취득가액 계산", () => {
  it("PDF 토지1 환산취득가 = 67,782,886", () => {
    // standardAtAcq = 490 × 80,200 = 39,298,000
    // standardAtTransfer = 396.8 × 709,500 = floor(281,487,600) → 실제 281,529,600
    // 단 BigInt 연산: safeMultiplyThenDivide(485594405, 39298000, 281529600) = 67,782,886
    const input: MultiParcelInput = {
      totalTransferPrice: 525_000_000,
      transferDate: TRANSFER_DATE,
      parcels: [PARCEL_1, PARCEL_2],
    };
    const result = calculateMultiParcelTransfer(input);
    expect(result.parcelResults[0].acquisitionPrice).toBe(67_782_886);
  });
});

// ── MP-4: 개산공제 3% ──
describe("MP-4: 개산공제 (취득기준시가 × 3%)", () => {
  it("PDF 토지1 개산공제 = 1,178,940", () => {
    // standardAtAcq = floor(490 × 80,200) = 39,298,000
    // 개산공제 = floor(39,298,000 × 0.03) = 1,178,940
    const input: MultiParcelInput = {
      totalTransferPrice: 525_000_000,
      transferDate: TRANSFER_DATE,
      parcels: [PARCEL_1, PARCEL_2],
    };
    const result = calculateMultiParcelTransfer(input);
    expect(result.parcelResults[0].estimatedDeduction).toBe(1_178_940);
  });
});

// ── MP-5: 환지확정일 익일 보정 ──
describe("MP-5: 환지확정일 익일 취득일 의제", () => {
  it("replottingConfirmDate + 1일이 effectiveAcquisitionDate가 된다", () => {
    const input: MultiParcelInput = {
      totalTransferPrice: 50_000_000,
      transferDate: TRANSFER_DATE,
      parcels: [
        {
          id: "p1",
          acquisitionDate: new Date("2005-01-01"),
          useDayAfterReplotting: true,
          replottingConfirmDate: new Date("2007-04-26"),
          acquisitionMethod: "actual",
          acquisitionArea: 32.2,
          transferArea: 32.2,
          acquisitionPrice: 30_000_000,
          isUnregistered: false,
        },
      ],
    };
    const result = calculateMultiParcelTransfer(input);
    const r = result.parcelResults[0];
    expect(r.didUseReplotting).toBe(true);
    expect(r.effectiveAcquisitionDate).toEqual(new Date("2007-04-27"));
  });

  it("useDayAfterReplotting=false이면 originalAcquisitionDate 그대로", () => {
    const input: MultiParcelInput = {
      totalTransferPrice: 50_000_000,
      transferDate: TRANSFER_DATE,
      parcels: [
        {
          id: "p1",
          acquisitionDate: new Date("2007-04-26"),
          useDayAfterReplotting: false,
          acquisitionMethod: "actual",
          acquisitionArea: 32.2,
          transferArea: 32.2,
          acquisitionPrice: 30_000_000,
          isUnregistered: false,
        },
      ],
    };
    const result = calculateMultiParcelTransfer(input);
    expect(result.parcelResults[0].didUseReplotting).toBe(false);
    expect(result.parcelResults[0].effectiveAcquisitionDate).toEqual(new Date("2007-04-26"));
  });
});

// ── MP-6: 필지별 장특공제 독립 계산 ──
describe("MP-6: 장기보유특별공제 필지별 독립 계산", () => {
  it("각 필지의 보유기간으로 장특공제율이 독립 적용된다 (30% 한도)", () => {
    const input: MultiParcelInput = {
      totalTransferPrice: 525_000_000,
      transferDate: TRANSFER_DATE,
      parcels: [PARCEL_1, PARCEL_2],
    };
    const result = calculateMultiParcelTransfer(input);
    // 토지1: 1996-02-18 취득 → 2023-02-15 양도 ≈ 26년 → 30% 한도
    expect(result.parcelResults[0].longTermHoldingRate).toBe(0.30);
    // 토지2: 2007-04-27 취득 → 2023-02-15 양도 ≈ 15년 → 30% 한도
    expect(result.parcelResults[1].longTermHoldingRate).toBe(0.30);
  });

  it("미등기 필지는 장특공제율 0%", () => {
    const input: MultiParcelInput = {
      totalTransferPrice: 100_000_000,
      transferDate: new Date("2023-01-01"),
      parcels: [
        {
          id: "p1",
          acquisitionDate: new Date("2000-01-01"),
          acquisitionMethod: "actual",
          acquisitionArea: 100,
          transferArea: 100,
          acquisitionPrice: 30_000_000,
          isUnregistered: true,
        },
      ],
    };
    const result = calculateMultiParcelTransfer(input);
    expect(result.parcelResults[0].longTermHoldingRate).toBe(0);
    expect(result.parcelResults[0].longTermHoldingDeduction).toBe(0);
  });
});

// ── MP-7: 기본공제는 MultiParcelResult에 포함되지 않음 (합산 후 상위 엔진에서 처리) ──
describe("MP-7: 기본공제 분리 원칙", () => {
  it("MultiParcelResult에는 기본공제 관련 필드가 없다", () => {
    const input: MultiParcelInput = {
      totalTransferPrice: 525_000_000,
      transferDate: TRANSFER_DATE,
      parcels: [PARCEL_1, PARCEL_2],
    };
    const result = calculateMultiParcelTransfer(input);
    // @ts-expect-error — basicDeduction 필드가 없어야 함
    expect(result.basicDeduction).toBeUndefined();
    // @ts-expect-error
    expect(result.taxBase).toBeUndefined();
  });
});

// ── MP-8 (EX-1): PDF 파주시 교하동 581번지 전체 원단위 앵커 ──
describe("MP-8 (EX-1): PDF 파주시 교하동 581번지 전체 앵커", () => {
  const input: MultiParcelInput = {
    totalTransferPrice: 525_000_000,
    transferDate: TRANSFER_DATE,
    parcels: [PARCEL_1, PARCEL_2],
  };

  it("전체 파이프라인 실행 (오류 없음)", () => {
    expect(() => calculateMultiParcelTransfer(input)).not.toThrow();
  });

  describe("토지1 (종전 권리분 — 환산 방식)", () => {
    it("양도가액 안분 = 485,594,405", () => {
      const r = calculateMultiParcelTransfer(input).parcelResults[0];
      expect(r.allocatedTransferPrice).toBe(485_594_405);
    });
    it("환산취득가액 = 67,782,886", () => {
      const r = calculateMultiParcelTransfer(input).parcelResults[0];
      expect(r.acquisitionPrice).toBe(67_782_886);
    });
    it("개산공제 = 1,178,940", () => {
      const r = calculateMultiParcelTransfer(input).parcelResults[0];
      expect(r.estimatedDeduction).toBe(1_178_940);
    });
    it("양도차익 = 416,632,579", () => {
      const r = calculateMultiParcelTransfer(input).parcelResults[0];
      expect(r.transferGain).toBe(416_632_579);
    });
    it("장특공제 (30%) = 124,989,773", () => {
      const r = calculateMultiParcelTransfer(input).parcelResults[0];
      expect(r.longTermHoldingDeduction).toBe(124_989_773);
    });
    it("양도소득금액 = 291,642,806", () => {
      const r = calculateMultiParcelTransfer(input).parcelResults[0];
      expect(r.transferIncome).toBe(291_642_806);
    });
  });

  describe("토지2 (과도 취득분 — 실가 방식)", () => {
    it("양도가액 안분 = 39,405,595", () => {
      const r = calculateMultiParcelTransfer(input).parcelResults[1];
      expect(r.allocatedTransferPrice).toBe(39_405_595);
    });
    it("취득가액 = 34,000,000", () => {
      const r = calculateMultiParcelTransfer(input).parcelResults[1];
      expect(r.acquisitionPrice).toBe(34_000_000);
    });
    it("양도차익 = 5,405,595", () => {
      const r = calculateMultiParcelTransfer(input).parcelResults[1];
      expect(r.transferGain).toBe(5_405_595);
    });
    it("장특공제 (30%) = 1,621,678", () => {
      const r = calculateMultiParcelTransfer(input).parcelResults[1];
      expect(r.longTermHoldingDeduction).toBe(1_621_678);
    });
    it("양도소득금액 = 3,783,917", () => {
      const r = calculateMultiParcelTransfer(input).parcelResults[1];
      expect(r.transferIncome).toBe(3_783_917);
    });
  });

  describe("합산", () => {
    it("합계 양도차익 = 422,038,174", () => {
      const result = calculateMultiParcelTransfer(input);
      expect(result.totalTransferGain).toBe(422_038_174);
    });
    it("합계 장특공제 = 126,611,451", () => {
      const result = calculateMultiParcelTransfer(input);
      expect(result.totalLongTermHoldingDeduction).toBe(126_611_451);
    });
    it("합계 양도소득금액 = 295,426,723", () => {
      const result = calculateMultiParcelTransfer(input);
      expect(result.totalTransferIncome).toBe(295_426_723);
    });
  });
});
