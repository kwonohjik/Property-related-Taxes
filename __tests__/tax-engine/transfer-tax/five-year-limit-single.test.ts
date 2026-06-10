/**
 * §133② 5년 누적 한도 — 단건 엔진 경로 (H-1 회귀)
 *
 * 2026-06-11 review-autofix: 단건 calculateTransferTax가 input.priorReductionUsage를
 * 무시하던 결함 수정 (transfer-tax-finalize.ts STEP 8.5 신설).
 * aggregate 경로(M-8)는 기존 five-year-cumulative-aggregate.test.ts가 커버.
 *
 * 근거 조문: 조세특례제한법 §133 ① — 자경농지 등 1년 1억·5년 2억 종합한도.
 *
 * 케이스:
 *   FS-01  이력 없음 → 연간 한도 1억 그대로 (기존 동작 회귀 가드)
 *   FS-02  과거 4년 누적 2억 (소진) → 당해 감면 0, 결정세액 = 산출세액
 *   FS-03  과거 누적 1.4억 → 잔여 6천만으로 capping, 결정세액 차감 일치
 *   FS-04  5년 윈도우 밖(양도연도-5) 이력은 무시
 *   FS-05  한도 그룹 밖 유형(long_term_rental) 이력은 자경 감면에 영향 없음
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

const mockRates = makeMockRates();

/** 자경농지 감면 100% — 연간 한도 1억 도달 케이스 (T-41 farmlandBase 동일) */
const farmlandBase = () =>
  baseTransferInput({
    propertyType: "land",
    transferPrice: 1_000_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: new Date("2009-01-01"),
    transferDate: new Date("2024-01-02"),
    isOneHousehold: false,
    householdHousingCount: 0,
    reductions: [{ type: "self_farming", farmingYears: 8 }],
  });

describe("FS: §133② 5년 누적 한도 — 단건 경로 (STEP 8.5)", () => {
  it("FS-01: 이력 없음 → 연간 한도 1억 감면 유지 (회귀 가드)", () => {
    const result = calculateTransferTax(
      { ...farmlandBase(), priorReductionUsage: [] },
      mockRates,
    );
    expect(result.reductionAmount).toBe(100_000_000);
    expect(result.determinedTax).toBe(result.calculatedTax - 100_000_000);
  });

  it("FS-02: 과거 4년 누적 2억 소진 → 당해 감면 0, 결정세액 = 산출세액", () => {
    const result = calculateTransferTax(
      {
        ...farmlandBase(),
        priorReductionUsage: [
          { year: 2022, type: "self_farming", amount: 100_000_000 },
          { year: 2023, type: "self_farming", amount: 100_000_000 },
        ],
      },
      mockRates,
    );
    expect(result.reductionAmount).toBe(0);
    expect(result.determinedTax).toBe(result.calculatedTax);
    // STEP 8.5 산식 step 노출 확인
    expect(result.steps.some((s) => s.label === "§133 5년 누적 한도")).toBe(true);
  });

  it("FS-03: 과거 누적 1.4억 → 잔여 6천만으로 capping", () => {
    const result = calculateTransferTax(
      {
        ...farmlandBase(),
        priorReductionUsage: [
          { year: 2020, type: "self_farming", amount: 50_000_000 },
          { year: 2021, type: "self_farming", amount: 40_000_000 },
          { year: 2022, type: "self_farming", amount: 30_000_000 },
          { year: 2023, type: "self_farming", amount: 20_000_000 },
        ],
      },
      mockRates,
    );
    expect(result.reductionAmount).toBe(60_000_000); // 2억 − 1.4억
    expect(result.determinedTax).toBe(result.calculatedTax - 60_000_000);
  });

  it("FS-04: 5년 윈도우 밖(2019년) 이력은 무시 — 감면 1억 유지", () => {
    const result = calculateTransferTax(
      {
        ...farmlandBase(),
        priorReductionUsage: [
          { year: 2019, type: "self_farming", amount: 200_000_000 },
        ],
      },
      mockRates,
    );
    expect(result.reductionAmount).toBe(100_000_000);
  });

  it("FS-05: 한도 그룹 밖 유형 이력은 자경 감면에 영향 없음", () => {
    const result = calculateTransferTax(
      {
        ...farmlandBase(),
        priorReductionUsage: [
          { year: 2023, type: "long_term_rental", amount: 500_000_000 },
        ],
      },
      mockRates,
    );
    expect(result.reductionAmount).toBe(100_000_000);
  });
});
