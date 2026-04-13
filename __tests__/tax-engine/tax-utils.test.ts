import { describe, it, expect } from "vitest";
import {
  calculateProgressiveTax,
  truncateToThousand,
  truncateToTenThousand,
  truncateToWon,
  applyRate,
} from "@/lib/tax-engine/tax-utils";
import type { TaxBracket } from "@/lib/tax-engine/types";

// 2024년 양도소득세 기본세율 구간 (테스트용)
const TRANSFER_TAX_BRACKETS: TaxBracket[] = [
  { min: 0, max: 14_000_000, rate: 0.06, deduction: 0 },
  { min: 14_000_001, max: 50_000_000, rate: 0.15, deduction: 1_260_000 },
  { min: 50_000_001, max: 88_000_000, rate: 0.24, deduction: 5_760_000 },
  { min: 88_000_001, max: 150_000_000, rate: 0.35, deduction: 15_440_000 },
  { min: 150_000_001, max: 300_000_000, rate: 0.38, deduction: 19_940_000 },
  { min: 300_000_001, max: 500_000_000, rate: 0.4, deduction: 25_940_000 },
  { min: 500_000_001, max: 1_000_000_000, rate: 0.42, deduction: 35_940_000 },
  { min: 1_000_000_001, max: null, rate: 0.45, deduction: 65_940_000 },
];

describe("calculateProgressiveTax", () => {
  it("0원 이하는 0을 반환한다", () => {
    expect(calculateProgressiveTax(0, TRANSFER_TAX_BRACKETS)).toBe(0);
    expect(calculateProgressiveTax(-100, TRANSFER_TAX_BRACKETS)).toBe(0);
  });

  it("1,400만원 과세표준에 대해 정확한 세액을 계산한다", () => {
    // 14,000,000 * 0.06 - 0 = 840,000
    expect(calculateProgressiveTax(14_000_000, TRANSFER_TAX_BRACKETS)).toBe(
      840_000,
    );
  });

  it("5,000만원 과세표준에 대해 정확한 세액을 계산한다", () => {
    // 50,000,000 * 0.15 - 1,260,000 = 6,240,000
    expect(calculateProgressiveTax(50_000_000, TRANSFER_TAX_BRACKETS)).toBe(
      6_240_000,
    );
  });

  it("3억원 과세표준에 대해 정확한 세액을 계산한다", () => {
    // 300,000,000 * 0.38 - 19,940,000 = 94,060,000
    expect(calculateProgressiveTax(300_000_000, TRANSFER_TAX_BRACKETS)).toBe(
      94_060_000,
    );
  });
});

describe("truncateToThousand", () => {
  it("천원 미만을 절사한다", () => {
    expect(truncateToThousand(1_234_567)).toBe(1_234_000);
    expect(truncateToThousand(999)).toBe(0);
    expect(truncateToThousand(1_000)).toBe(1_000);
  });
});

describe("truncateToTenThousand", () => {
  it("만원 미만을 절사한다", () => {
    expect(truncateToTenThousand(1_234_567)).toBe(1_230_000);
    expect(truncateToTenThousand(9_999)).toBe(0);
  });
});

describe("truncateToWon", () => {
  it("원 미만을 절사한다", () => {
    expect(truncateToWon(1234.56)).toBe(1234);
    expect(truncateToWon(0.99)).toBe(0);
  });
});

describe("applyRate", () => {
  it("비율 적용 후 절사한다", () => {
    // 100,000,000 * 0.06 = 6,000,000
    expect(applyRate(100_000_000, 0.06)).toBe(6_000_000);
  });

  it("부동소수점 오차가 발생할 수 있는 값도 절사로 처리한다", () => {
    // 33,333 * 0.1 = 3333.3 → 3333
    expect(applyRate(33_333, 0.1)).toBe(3_333);
  });
});
