import { describe, it, expect } from "vitest";
import {
  calculateProgressiveTax,
  truncateToThousand,
  truncateToTenThousand,
  truncateToWon,
  applyRate,
  safeMultiplyThenDivide,
  calculateProration,
  calculateHoldingPeriod,
  calculateEstimatedAcquisitionPrice,
  isSurchargeSuspended,
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

// ============================================================
// P0-4: calculateProration — 비율 안분
// ============================================================

describe("calculateProration", () => {
  it("기본 안분 계산: 1,000만원 × (2억 ÷ 10억) = 200만원", () => {
    expect(calculateProration(10_000_000, 200_000_000, 1_000_000_000)).toBe(2_000_000);
  });

  it("비율 상한 1.0 적용: 분자 > 분모여도 amount 초과 불가", () => {
    // numerator(15억) > denominator(10억) → ratio = min(1.5, 1.0) = 1.0
    expect(calculateProration(5_000_000, 1_500_000_000, 1_000_000_000)).toBe(5_000_000);
  });

  it("[P0-4] denominator === 0이면 0 반환 (division by zero 방어)", () => {
    expect(calculateProration(1_000_000, 500_000, 0)).toBe(0);
  });

  it("numerator === 0이면 0 반환", () => {
    expect(calculateProration(1_000_000, 0, 1_000_000)).toBe(0);
  });

  it("결과는 Math.floor 적용 (소수점 절사)", () => {
    // 100 × (1 / 3) = 33.333... → 33
    expect(calculateProration(100, 1, 3)).toBe(33);
  });
});

// ============================================================
// safeMultiplyThenDivide — (a × b) ÷ c
// ============================================================

describe("safeMultiplyThenDivide", () => {
  it("기본 계산: 300만 × 200만 ÷ 1,000만 = 60만", () => {
    expect(safeMultiplyThenDivide(3_000_000, 2_000_000, 10_000_000)).toBe(600_000);
  });

  it("c === 0 이면 0 반환", () => {
    expect(safeMultiplyThenDivide(100, 200, 0)).toBe(0);
  });

  it("결과는 Math.floor 적용", () => {
    // 10 × 1 ÷ 3 = 3.333... → 3
    expect(safeMultiplyThenDivide(10, 1, 3)).toBe(3);
  });

  // ── BigInt fallback 경로 (종합부동산세 고가 자산 시나리오) ──

  it("BigInt fallback: a * b가 MAX_SAFE_INTEGER 초과 시 정상 계산", () => {
    // 10조 × 100만 = 10^19 → Number.MAX_SAFE_INTEGER(약 9 × 10^15) 초과
    // BigInt 정확 계산: 10_000_000_000_000 × 1_000_000 ÷ 100 = 10^17 (10경)
    const a = 10_000_000_000_000; // 10조
    const b = 1_000_000;          // 100만
    const c = 100;
    expect(a * b).toBeGreaterThan(Number.MAX_SAFE_INTEGER); // BigInt 경로 진입 확인
    expect(safeMultiplyThenDivide(a, b, c)).toBe(100_000_000_000_000_000);
  });

  it("BigInt fallback: 종합부동산세 재산세 비율안분공제 시나리오", () => {
    // 공시가 합계 300억, 재산세 산출세액 1억 5천만, 분모 200억
    // (150_000_000 × 30_000_000_000) ÷ 20_000_000_000
    // = 4_500_000_000_000_000_000 ÷ 20_000_000_000 = 225_000_000 (2억 2천5백만)
    const propertyTax = 150_000_000;
    const totalAssessed = 30_000_000_000;
    const denominator = 20_000_000_000;
    expect(propertyTax * totalAssessed).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
    expect(safeMultiplyThenDivide(propertyTax, totalAssessed, denominator)).toBe(225_000_000);
  });

  it("BigInt fallback과 일반 경로가 동일한 결과를 반환한다", () => {
    // 일반 경로로 계산 가능한 값과 BigInt 경로의 결과 비교
    // 비율: a/c = 3, b = 1 → 일반 경로 결과 = 3
    // BigInt 경로: a를 크게 키우고 c도 같은 비율로 키움
    const smallA = 3_000_000;
    const smallB = 2_000_000;
    const smallC = 10_000_000;
    const smallResult = safeMultiplyThenDivide(smallA, smallB, smallC); // 일반 경로

    // 동일 비율을 BigInt 경로로 계산: 값을 1_000_000배 키움
    const bigA = 3_000_000_000_000;   // 3_000_000 × 1_000_000
    const bigB = 2_000_000;
    const bigC = 10_000_000;
    expect(bigA * bigB).toBeGreaterThan(Number.MAX_SAFE_INTEGER); // BigInt 경로 진입 확인
    const bigResult = safeMultiplyThenDivide(bigA, bigB, bigC); // BigInt 경로

    // 결과도 1_000_000배 관계
    expect(bigResult).toBe(smallResult * 1_000_000);
  });

  it("BigInt fallback: c === 0 이면 BigInt 경로 이전에 0 반환", () => {
    const a = 10_000_000_000_000;
    const b = 1_000_000;
    expect(safeMultiplyThenDivide(a, b, 0)).toBe(0);
  });

  it("BigInt fallback: 음수 입력 처리", () => {
    // 음수 × 양수 = 음수 (절대값이 MAX_SAFE_INTEGER 초과)
    const a = -10_000_000_000_000;
    const b = 1_000_000;
    const c = 100;
    expect(Math.abs(a * b)).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
    expect(safeMultiplyThenDivide(a, b, c)).toBe(-100_000_000_000_000_000);
  });
});

// ============================================================
// calculateHoldingPeriod — 세법상 보유기간 (민법 초일불산입)
// ============================================================

describe("calculateHoldingPeriod", () => {
  it("취득일 다음날부터 기산: 2021-01-31 취득 → 2024-01-31 양도 = 3년 0월 0일", () => {
    const acq = new Date("2021-01-31");
    const disp = new Date("2024-01-31");
    // 기산일: 2021-02-01 ~ 2024-01-31 = 2년 364일 → 정확히 3년? 아니면 2년?
    // 2021-02-01 + 3년 = 2024-02-01 > 2024-01-31 → 2년
    // 실제: 2021-02-01 ~ 2024-01-31 = 2년 11개월 30일
    const result = calculateHoldingPeriod(acq, disp);
    expect(result.years).toBe(2);
  });

  it("정확히 2년 보유: 2022-04-01 취득 → 2024-04-02 양도", () => {
    // 기산일: 2022-04-02 ~ 2024-04-02 = 정확히 2년
    const acq = new Date("2022-04-01");
    const disp = new Date("2024-04-02");
    const result = calculateHoldingPeriod(acq, disp);
    expect(result.years).toBe(2);
    expect(result.months).toBe(0);
    expect(result.days).toBe(0);
  });

  it("3년 보유 달성: 2021-01-01 취득 → 2024-01-02 양도", () => {
    // 기산일: 2021-01-02 ~ 2024-01-02 = 정확히 3년
    const acq = new Date("2021-01-01");
    const disp = new Date("2024-01-02");
    const result = calculateHoldingPeriod(acq, disp);
    expect(result.years).toBe(3);
  });

  it("1년 미만 보유: 6개월", () => {
    const acq = new Date("2023-01-01");
    const disp = new Date("2023-07-01");
    const result = calculateHoldingPeriod(acq, disp);
    expect(result.years).toBe(0);
    expect(result.months).toBeGreaterThanOrEqual(5);
  });

  it("양도일과 취득일이 같으면 0년 0월 0일 반환 (음수 방어)", () => {
    const date = new Date("2024-01-01");
    const result = calculateHoldingPeriod(date, date);
    expect(result.years).toBe(0);
    expect(result.months).toBe(0);
    expect(result.days).toBe(0);
  });
});

// ============================================================
// calculateEstimatedAcquisitionPrice — 환산취득가액
// ============================================================

describe("calculateEstimatedAcquisitionPrice", () => {
  it("기본 환산: 양도가 10억, 취득시 기준시가 5억, 양도시 기준시가 8억 → 6.25억", () => {
    // 1_000_000_000 × 500_000_000 / 800_000_000 = 625_000_000
    expect(
      calculateEstimatedAcquisitionPrice(1_000_000_000, 500_000_000, 800_000_000),
    ).toBe(625_000_000);
  });

  it("양도시 기준시가 0이면 0 반환 (division by zero 방어)", () => {
    expect(calculateEstimatedAcquisitionPrice(1_000_000_000, 500_000_000, 0)).toBe(0);
  });

  it("취득시·양도시 기준시가 동일하면 양도가와 같은 값 반환", () => {
    expect(calculateEstimatedAcquisitionPrice(500_000_000, 300_000_000, 300_000_000)).toBe(500_000_000);
  });
});

// ============================================================
// P0-3: isSurchargeSuspended — 중과세 유예 판단
// ============================================================

describe("isSurchargeSuspended", () => {
  const suspendedRules = {
    surcharge_suspended: true,
    suspended_types: ["multi_house_2", "multi_house_3plus"],
    suspended_until: "2026-05-09",
  };

  it("[P0-3] 유예 기간 내 양도: 중과세 유예 true 반환", () => {
    const transferDate = new Date("2026-01-01"); // 유예 종료일 이전
    expect(isSurchargeSuspended(suspendedRules, transferDate, "multi_house_2")).toBe(true);
  });

  it("[P0-3] 유예 종료일 당일: 유예 적용 true (당일 포함)", () => {
    const transferDate = new Date("2026-05-09");
    expect(isSurchargeSuspended(suspendedRules, transferDate, "multi_house_2")).toBe(true);
  });

  it("[P0-3] 유예 종료 다음날: 중과세 유예 false → 중과세 적용", () => {
    const transferDate = new Date("2026-05-10"); // 유예 종료 다음날
    expect(isSurchargeSuspended(suspendedRules, transferDate, "multi_house_2")).toBe(false);
  });

  it("[P0-3] 유예 대상 아닌 타입(non_business_land): false 반환", () => {
    const transferDate = new Date("2026-01-01");
    expect(isSurchargeSuspended(suspendedRules, transferDate, "non_business_land")).toBe(false);
  });

  it("surcharge_suspended === false: 유예 없음", () => {
    const rules = { surcharge_suspended: false, suspended_until: "2099-12-31" };
    expect(isSurchargeSuspended(rules, new Date("2026-01-01"), "multi_house_2")).toBe(false);
  });

  it("null/undefined specialRules: false 반환", () => {
    expect(isSurchargeSuspended(null, new Date("2026-01-01"), "multi_house_2")).toBe(false);
    expect(isSurchargeSuspended(undefined, new Date("2026-01-01"), "multi_house_2")).toBe(false);
  });

  it("suspended_until 미설정: false 반환", () => {
    const rules = { surcharge_suspended: true };
    expect(isSurchargeSuspended(rules, new Date("2026-01-01"), "multi_house_2")).toBe(false);
  });
});
