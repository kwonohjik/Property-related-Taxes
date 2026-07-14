/**
 * C6 회귀 — 다필지 양도차손 통산 (§102② · 시행령 §167의2)
 *
 * 손실 필지를 0으로 절사하지 않고 이익 필지와 통산해야 한다.
 * 기대값은 법령·산술로 독립 도출(엔진 출력 베끼지 않음).
 *
 * 안분: 두 필지 transferArea 동일(100㎡ each) → 각 필지 안분 양도가액 = 500,000,000 × 100/200 = 250,000,000.
 */

import { describe, it, expect } from "vitest";
import {
  calculateMultiParcelTransfer,
  type MultiParcelInput,
} from "@/lib/tax-engine/multi-parcel-transfer";

describe("C6: 다필지 양도차손 통산", () => {
  it("손실 필지(-20,000,000)와 이익 필지(150,000,000)를 통산한다 (LTHD 0 케이스)", () => {
    // 보유 1년(< 3년) → 장기보유특별공제율 0% → LTHD = 0 (통산만 검증)
    const input: MultiParcelInput = {
      totalTransferPrice: 500_000_000,
      transferDate: new Date("2023-06-01"),
      parcels: [
        {
          id: "loss",
          acquisitionDate: new Date("2022-06-01"),
          acquisitionMethod: "actual",
          acquisitionArea: 100,
          transferArea: 100,
          acquisitionPrice: 270_000_000, // 안분가 250M − 270M = −20M 손실
          expenses: 0,
        },
        {
          id: "gain",
          acquisitionDate: new Date("2022-06-01"),
          acquisitionMethod: "actual",
          acquisitionArea: 100,
          transferArea: 100,
          acquisitionPrice: 100_000_000, // 안분가 250M − 100M = +150M 이익
          expenses: 0,
        },
      ],
    };

    const r = calculateMultiParcelTransfer(input);

    // 필지별 rawGain 유지 (손실 음수 표시)
    expect(r.parcelResults[0].transferGain).toBe(-20_000_000);
    expect(r.parcelResults[1].transferGain).toBe(150_000_000);

    // 통산 총차익 = −20,000,000 + 150,000,000 = 130,000,000 (버그 시 150,000,000)
    expect(r.totalTransferGain).toBe(130_000_000);

    // LTHD 0 → 통산 양도소득금액 = max(0, 130,000,000 − 0) = 130,000,000
    expect(r.totalLongTermHoldingDeduction).toBe(0);
    expect(r.totalTransferIncome).toBe(130_000_000);

    // 손실 필지 경고 존재
    expect(r.warnings.some((w) => w.includes("loss") && w.includes("통산"))).toBe(true);
  });

  it("장기보유특별공제는 양수 차익 필지에만 적용한다 (손실 필지 LTHD=0)", () => {
    // 보유 10년 → 장기보유율 min(10×2%,30%)=20%. 손실 필지는 rawGain<0 → LTHD=0.
    const input: MultiParcelInput = {
      totalTransferPrice: 500_000_000,
      transferDate: new Date("2023-06-01"),
      parcels: [
        {
          id: "loss",
          acquisitionDate: new Date("2013-01-01"),
          acquisitionMethod: "actual",
          acquisitionArea: 100,
          transferArea: 100,
          acquisitionPrice: 270_000_000, // −20,000,000 손실
          expenses: 0,
        },
        {
          id: "gain",
          acquisitionDate: new Date("2013-01-01"),
          acquisitionMethod: "actual",
          acquisitionArea: 100,
          transferArea: 100,
          acquisitionPrice: 100_000_000, // +150,000,000 이익
          expenses: 0,
        },
      ],
    };

    const r = calculateMultiParcelTransfer(input);

    // 손실 필지: 보유율은 20% 표시되나 LTHD 금액은 0
    expect(r.parcelResults[0].longTermHoldingRate).toBeCloseTo(0.2, 10);
    expect(r.parcelResults[0].longTermHoldingDeduction).toBe(0);

    // 이익 필지: LTHD = 150,000,000 × 20% = 30,000,000
    expect(r.parcelResults[1].longTermHoldingDeduction).toBe(30_000_000);

    // 통산: 총차익 130,000,000, 총 LTHD 30,000,000,
    // 양도소득금액 = max(0, (−20,000,000) + (150,000,000 − 30,000,000)) = 100,000,000
    expect(r.totalTransferGain).toBe(130_000_000);
    expect(r.totalLongTermHoldingDeduction).toBe(30_000_000);
    expect(r.totalTransferIncome).toBe(100_000_000);
  });

  it("전 필지 이익이면 기존 동작 불변", () => {
    const input: MultiParcelInput = {
      totalTransferPrice: 500_000_000,
      transferDate: new Date("2023-06-01"),
      parcels: [
        {
          id: "a",
          acquisitionDate: new Date("2022-06-01"),
          acquisitionMethod: "actual",
          acquisitionArea: 100,
          transferArea: 100,
          acquisitionPrice: 100_000_000, // +150,000,000
          expenses: 0,
        },
        {
          id: "b",
          acquisitionDate: new Date("2022-06-01"),
          acquisitionMethod: "actual",
          acquisitionArea: 100,
          transferArea: 100,
          acquisitionPrice: 120_000_000, // +130,000,000
          expenses: 0,
        },
      ],
    };

    const r = calculateMultiParcelTransfer(input);
    expect(r.totalTransferGain).toBe(280_000_000);
    expect(r.totalTransferIncome).toBe(280_000_000);
    expect(r.warnings).toHaveLength(0);
  });
});
