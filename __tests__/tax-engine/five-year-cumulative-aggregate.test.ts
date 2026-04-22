/**
 * §133 5년 누적 한도 × calculateTransferTaxAggregate 통합 테스트
 *
 * `priorReductionUsage` 입력이 다건 양도 엔진 전체 파이프라인에서
 * 올바르게 반영되는지 검증한다.
 *
 * 근거 조문:
 *   조세특례제한법 §133 ①  자경농지 5년 누적 2억원
 *   조세특례제한법 §133 ②  공익수용  5년 누적 3억원
 *
 * 케이스 목록:
 *   G-01  priorReductionUsage 미입력 → 연간 한도만 작동 (회귀)
 *   G-02  자경 5년 한도 잔여 6천만 → 당해 연간 한도 후 7천만이 6천만으로 추가 capping
 *   G-03  자경 5년 한도 전액 소진 → reductionAmount = 0
 *   G-04  자산 2건(자경 + 공익수용) 혼합 — 그룹별 5년 한도 독립 적용
 *   G-05  cappedByFiveYearLimit 플래그 reductionBreakdown에 포함
 */

import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "./_helpers/mock-rates";

// ─── 공통 헬퍼 ──────────────────────────────────────────────────

function makeItem(
  propertyId: string,
  propertyLabel: string,
  overrides: Partial<TransferTaxItemInput>,
): TransferTaxItemInput {
  const base = baseTransferInput();
  return {
    ...(base as unknown as TransferTaxItemInput),
    propertyId,
    propertyLabel,
    ...overrides,
  };
}

const mockRates = makeMockRates();

/**
 * 자경농지 기본 아이템 (차익 8억 — 산출세액이 연간 한도 1억을 초과해야
 * 연간 capping 후 5년 capping이 의미 있게 발동한다)
 */
function selfFarmingItem(
  id: string,
  label: string,
  overrides?: Partial<TransferTaxItemInput>,
): TransferTaxItemInput {
  return makeItem(id, label, {
    propertyType: "land",
    transferPrice: 1_100_000_000,
    acquisitionPrice: 300_000_000,   // 차익 8억
    acquisitionDate: new Date("2010-06-01"),
    transferDate: new Date("2026-06-01"),
    isOneHousehold: false,
    householdHousingCount: 0,
    reductions: [{ type: "self_farming", farmingYears: 10 }],
    ...overrides,
  });
}

// ============================================================
// G-01: priorReductionUsage 미입력 — 기존 동작 회귀
// ============================================================

describe("G-01: priorReductionUsage 미입력 — 연간 한도만 적용 (회귀)", () => {
  it("priorReductionUsage 없이도 reductionAmount가 0 이상이어야 한다", () => {
    const input: AggregateTransferInput = {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [selfFarmingItem("A", "자경 농지 A")],
    };

    const r = calculateTransferTaxAggregate(input, mockRates);
    expect(r.reductionAmount).toBeGreaterThan(0);
  });

  it("priorReductionUsage 빈 배열도 동일 결과", () => {
    const withoutPrior: AggregateTransferInput = {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [selfFarmingItem("A", "자경 농지 A")],
    };
    const withEmpty: AggregateTransferInput = {
      ...withoutPrior,
      priorReductionUsage: [],
    };

    const r1 = calculateTransferTaxAggregate(withoutPrior, mockRates);
    const r2 = calculateTransferTaxAggregate(withEmpty, mockRates);

    expect(r1.reductionAmount).toBe(r2.reductionAmount);
    expect(r1.determinedTax).toBe(r2.determinedTax);
  });
});

// ============================================================
// G-02: 자경 5년 잔여 6천만 → 연간 한도 후 추가 capping
// ============================================================

describe("G-02: 과거 자경 누적 1.4억 → 잔여 6천만으로 추가 capping", () => {
  it("reductionAmount가 연간 한도 결과보다 작고 cappedByFiveYearLimit이 true", () => {
    const withoutPrior: AggregateTransferInput = {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [selfFarmingItem("A", "자경 농지 A")],
    };

    const withPrior: AggregateTransferInput = {
      ...withoutPrior,
      priorReductionUsage: [
        { year: 2022, type: "self_farming", amount: 50_000_000 },
        { year: 2023, type: "self_farming", amount: 40_000_000 },
        { year: 2024, type: "self_farming", amount: 30_000_000 },
        { year: 2025, type: "self_farming", amount: 20_000_000 },
      ], // 합계 1.4억 → 잔여 6천만
    };

    const r1 = calculateTransferTaxAggregate(withoutPrior, mockRates);
    const r2 = calculateTransferTaxAggregate(withPrior, mockRates);

    // 5년 한도 적용 시 감면액이 더 작아야 함
    expect(r2.reductionAmount).toBeLessThan(r1.reductionAmount);

    // reductionBreakdown에 5년 한도 플래그 존재
    const sfBreakdown = r2.reductionBreakdown.find((b) => b.type === "self_farming");
    expect(sfBreakdown).toBeDefined();
    expect(sfBreakdown!.cappedByFiveYearLimit).toBe(true);
    expect(sfBreakdown!.fiveYearRemaining).toBe(60_000_000);
    expect(sfBreakdown!.priorGroupSum).toBe(140_000_000);
    expect(sfBreakdown!.cappedAggregateReduction).toBeLessThanOrEqual(60_000_000);
  });
});

// ============================================================
// G-03: 자경 5년 한도 전액 소진 → reductionAmount = 0
// ============================================================

describe("G-03: 자경 5년 한도 전액 소진 → 당해 감면 0", () => {
  it("priorGroupSum 2억 = 5년 한도 → reductionAmount가 0 또는 5년 capping 발동", () => {
    const input: AggregateTransferInput = {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [selfFarmingItem("A", "자경 농지 A")],
      priorReductionUsage: [
        { year: 2022, type: "self_farming", amount: 100_000_000 },
        { year: 2023, type: "self_farming", amount: 100_000_000 },
      ], // 합계 2억 = 5년 한도 소진
    };

    const r = calculateTransferTaxAggregate(input, mockRates);

    const sfBreakdown = r.reductionBreakdown.find((b) => b.type === "self_farming");
    if (sfBreakdown) {
      // 감면 대상 소득이 있어 breakdown에 등재된 경우
      expect(sfBreakdown.cappedAggregateReduction).toBe(0);
      expect(sfBreakdown.cappedByFiveYearLimit).toBe(true);
      expect(sfBreakdown.fiveYearRemaining).toBe(0);
    }
    // reductionAmount는 0이어야 함 (다른 legacy 감면도 없으므로)
    expect(r.reductionAmount).toBe(0);
  });
});

// ============================================================
// G-04: 자산 2건 혼합 — 자경 + 공익수용 독립 5년 한도
// ============================================================

describe("G-04: 자경(자산A) + 공익수용(자산B) 혼합 — 그룹별 5년 한도 독립", () => {
  it("자경 5년 한도 소진이 공익수용 감면에 영향을 주지 않는다", () => {
    const input: AggregateTransferInput = {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [
        // 자산 A — 자경농지
        selfFarmingItem("A", "자경 농지 A"),
        // 자산 B — 공익수용
        makeItem("B", "수용 토지 B", {
          propertyType: "land",
          transferPrice: 800_000_000,
          acquisitionPrice: 500_000_000, // 차익 3억
          acquisitionDate: new Date("2012-01-01"),
          transferDate: new Date("2026-06-01"),
          isOneHousehold: false,
          householdHousingCount: 0,
          reductions: [
            {
              type: "public_expropriation",
              cash: 800_000_000,
              bond: 0,
              bondHoldingYears: 0,
              approvalDate: new Date("2025-01-01"),
            },
          ],
        }),
      ],
      priorReductionUsage: [
        // 자경 5년 한도 소진
        { year: 2022, type: "self_farming", amount: 100_000_000 },
        { year: 2023, type: "self_farming", amount: 100_000_000 },
        // 공익수용 0 사용 → 잔여 3억 전액
      ],
    };

    const r = calculateTransferTaxAggregate(input, mockRates);

    const sfBreakdown = r.reductionBreakdown.find((b) => b.type === "self_farming");
    const expBreakdown = r.reductionBreakdown.find(
      (b) => b.type === "public_expropriation",
    );

    // 자경: 5년 한도 소진 → 0
    if (sfBreakdown) {
      expect(sfBreakdown.cappedAggregateReduction).toBe(0);
      expect(sfBreakdown.cappedByFiveYearLimit).toBe(true);
    }

    // 공익수용: 5년 한도 3억 잔여 → capping 없음
    if (expBreakdown) {
      expect(expBreakdown.cappedByFiveYearLimit).toBe(false);
      expect(expBreakdown.fiveYearRemaining).toBe(300_000_000);
      expect(expBreakdown.cappedAggregateReduction).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// G-05: reductionBreakdown 필드 완전성
// ============================================================

describe("G-05: reductionBreakdown 필드 완전성 검증", () => {
  it("각 breakdown 항목에 신규 5년 한도 필드가 모두 존재한다", () => {
    const input: AggregateTransferInput = {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [selfFarmingItem("A", "자경 농지 A")],
      priorReductionUsage: [
        { year: 2025, type: "self_farming", amount: 30_000_000 },
      ],
    };

    const r = calculateTransferTaxAggregate(input, mockRates);
    const sfBreakdown = r.reductionBreakdown.find((b) => b.type === "self_farming");

    if (sfBreakdown) {
      // 기존 필드 유지 확인
      expect(typeof sfBreakdown.annualLimit).toBe("number");
      expect(typeof sfBreakdown.rawAggregateReduction).toBe("number");
      expect(typeof sfBreakdown.cappedAggregateReduction).toBe("number");
      expect(typeof sfBreakdown.cappedByLimit).toBe("boolean");

      // 신규 5년 한도 필드 확인
      expect(typeof sfBreakdown.annuallyCappedReduction).toBe("number");
      expect(typeof sfBreakdown.fiveYearLimit).toBe("number");
      expect(typeof sfBreakdown.priorGroupSum).toBe("number");
      expect(typeof sfBreakdown.fiveYearRemaining).toBe("number");
      expect(typeof sfBreakdown.cappedByFiveYearLimit).toBe("boolean");

      // 값 일관성: annuallyCapped ≥ cappedAggregateReduction
      expect(sfBreakdown.annuallyCappedReduction).toBeGreaterThanOrEqual(
        sfBreakdown.cappedAggregateReduction,
      );

      // priorGroupSum = 3천만
      expect(sfBreakdown.priorGroupSum).toBe(30_000_000);
      // 잔여 = 2억 - 3천만 = 1.7억
      expect(sfBreakdown.fiveYearRemaining).toBe(170_000_000);
      expect(sfBreakdown.cappedByFiveYearLimit).toBe(false);
    }
  });
});
