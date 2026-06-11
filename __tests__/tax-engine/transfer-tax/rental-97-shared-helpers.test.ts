// 장기임대 §97 시리즈 — 공유 헬퍼 anchor (plan §6 P1 A-1·A-2)
import { describe, it, expect } from "vitest";
import {
  calculateEffectiveRentalPeriod,
  validateRentIncrease,
  convertToStandardDeposit,
  calcRentalGainRatio,
} from "@/lib/tax-engine/transfer-reductions/rental-97-shared-helpers";

describe("rental-97-shared-helpers", () => {
  it("A-1: 공실 151일(<180) → 차감 없이 10년", () => {
    const years = calculateEffectiveRentalPeriod(
      new Date("2014-01-01"),
      new Date("2024-01-01"),
      [{ startDate: new Date("2016-01-01"), endDate: new Date("2016-06-01") }], // 152일
    );
    expect(years).toBe(10);
  });

  it("A-2: 공실 213일(≥180) → 차감되어 9년", () => {
    const years = calculateEffectiveRentalPeriod(
      new Date("2014-01-01"),
      new Date("2024-01-01"),
      [{ startDate: new Date("2016-01-01"), endDate: new Date("2016-08-01") }], // 213일
    );
    expect(years).toBe(9);
  });

  it("환산보증금: 월세 100만·전환율 4% → 보증금 + 3억", () => {
    const std = convertToStandardDeposit(
      { contractDate: new Date("2020-01-01"), monthlyRent: 1_000_000, deposit: 50_000_000, contractType: "monthly" },
      0.04,
    );
    expect(std).toBe(50_000_000 + 300_000_000);
  });

  it("임대료 5% 초과 증액 → 위반 검출", () => {
    const result = validateRentIncrease(
      [
        { contractDate: new Date("2018-01-01"), monthlyRent: 0, deposit: 200_000_000, contractType: "jeonse" },
        { contractDate: new Date("2020-01-01"), monthlyRent: 0, deposit: 212_000_000, contractType: "jeonse" }, // +6%
      ],
      0.04,
    );
    expect(result.isAllValid).toBe(false);
    expect(result.violations).toHaveLength(1);
  });

  it("임대료 5% 이내 증액 → 통과", () => {
    const result = validateRentIncrease(
      [
        { contractDate: new Date("2018-01-01"), monthlyRent: 0, deposit: 200_000_000, contractType: "jeonse" },
        { contractDate: new Date("2020-01-01"), monthlyRent: 0, deposit: 210_000_000, contractType: "jeonse" }, // +5%
      ],
      0.04,
    );
    expect(result.isAllValid).toBe(true);
  });

  describe("calcRentalGainRatio (조특령 §97의3⑤ 기준시가 안분)", () => {
    it("취득 즉시 임대 (rentalStart ≤ acquisition) → 1", () => {
      expect(
        calcRentalGainRatio({
          rentalStartDate: new Date("2014-01-01"),
          acquisitionDate: new Date("2014-01-01"),
        }),
      ).toBe(1);
    });

    it("임대개시 > 취득 + 3점 입력 → 비례 (6억−4억)/(6억−3억) = 2/3", () => {
      expect(
        calcRentalGainRatio({
          rentalStartDate: new Date("2018-01-01"),
          acquisitionDate: new Date("2014-01-01"),
          stdPriceAtAcquisition: 300_000_000,
          stdPriceAtRentalStart: 400_000_000,
          stdPriceAtTransfer: 600_000_000,
        }),
      ).toBeCloseTo(2 / 3, 10);
    });

    it("임대개시 > 취득 + 3점 미입력 → null (silent 안분 금지)", () => {
      expect(
        calcRentalGainRatio({
          rentalStartDate: new Date("2018-01-01"),
          acquisitionDate: new Date("2014-01-01"),
          stdPriceAtTransfer: 600_000_000,
        }),
      ).toBeNull();
    });
  });
});
