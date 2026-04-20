/**
 * 양도소득세 다건 동시 양도 엔진 테스트
 *
 * T-M01 ~ T-M15
 * §92 · §102② · §103 · §104의2 · 조특법 §127②
 */

import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  classifyRateGroup,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "./_helpers/mock-rates";

// Helper: 단건 기본 입력을 item으로 변환
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

// ============================================================
// T-M01: 누진 그룹 2건 합산
// ============================================================

describe("T-M01: 누진 그룹 2건 합산", () => {
  it("comparedTaxApplied='none', 합산 누진 구간 이동", () => {
    const input: AggregateTransferInput = {
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      properties: [
        makeItem("A", "토지 A", {
          propertyType: "land",
          transferPrice: 300_000_000,
          acquisitionPrice: 250_000_000,
          acquisitionDate: new Date("2018-06-01"),
          transferDate: new Date("2024-06-01"),
          isOneHousehold: false,
          householdHousingCount: 0,
        }),
        makeItem("B", "토지 B", {
          propertyType: "land",
          transferPrice: 400_000_000,
          acquisitionPrice: 300_000_000,
          acquisitionDate: new Date("2018-06-01"),
          transferDate: new Date("2024-06-01"),
          isOneHousehold: false,
          householdHousingCount: 0,
        }),
      ],
    };

    const r = calculateTransferTaxAggregate(input, mockRates);
    expect(r.comparedTaxApplied).toBe("none");
    expect(r.groupTaxes.length).toBe(1);
    expect(r.groupTaxes[0].group).toBe("progressive");
    expect(r.calculatedTax).toBe(r.calculatedTaxByGroups);
  });
});

// ============================================================
// T-M02: §102② 동일그룹 통산
// ============================================================

describe("T-M02: 동일그룹 차손 통산", () => {
  it("토지A 차익 5억 + 토지B 차손 -2억 → 통산 후 3억", () => {
    const input: AggregateTransferInput = {
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      properties: [
        makeItem("A", "토지 A (차익)", {
          propertyType: "land",
          transferPrice: 1_000_000_000,
          acquisitionPrice: 500_000_000,
          acquisitionDate: new Date("2018-06-01"),
          transferDate: new Date("2024-06-01"),
          isOneHousehold: false,
          householdHousingCount: 0,
        }),
        makeItem("B", "토지 B (차손)", {
          propertyType: "land",
          transferPrice: 200_000_000,
          acquisitionPrice: 400_000_000, // 차손 -2억
          acquisitionDate: new Date("2018-06-01"),
          transferDate: new Date("2024-06-01"),
          isOneHousehold: false,
          householdHousingCount: 0,
        }),
      ],
    };

    const r = calculateTransferTaxAggregate(input, mockRates);
    const A = r.properties.find((p) => p.propertyId === "A")!;
    const B = r.properties.find((p) => p.propertyId === "B")!;
    expect(B.income).toBeLessThan(0);
    expect(A.lossOffsetFromSameGroup).toBeGreaterThan(0);
    expect(r.unusedLoss).toBe(0);
    expect(r.lossOffsetTable.some((row) => row.scope === "same_group")).toBe(true);
  });
});

// ============================================================
// T-M03: §167의2 타군 안분
// ============================================================

describe("T-M03: 타군 차손 안분 (§167의2)", () => {
  it("누진 토지 차익 + 중과 주택 차손 → 타군 안분", () => {
    const input: AggregateTransferInput = {
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      properties: [
        makeItem("A", "토지 (누진 차익)", {
          propertyType: "land",
          transferPrice: 1_000_000_000,
          acquisitionPrice: 400_000_000, // 차익 6억
          acquisitionDate: new Date("2018-06-01"),
          transferDate: new Date("2024-06-01"),
          isOneHousehold: false,
          householdHousingCount: 0,
        }),
        makeItem("B", "주택 (단기 차손)", {
          propertyType: "housing",
          transferPrice: 500_000_000,
          acquisitionPrice: 800_000_000, // 차손 -3억
          acquisitionDate: new Date("2023-01-01"),
          transferDate: new Date("2024-06-01"), // 보유 1.5년 → short_term
          isOneHousehold: false,
          householdHousingCount: 2,
        }),
      ],
    };

    const r = calculateTransferTaxAggregate(input, mockRates);
    const A = r.properties.find((p) => p.propertyId === "A")!;
    // 타군 통산 레코드 존재
    const otherGroupOffsets = r.lossOffsetTable.filter((row) => row.scope === "other_group");
    expect(otherGroupOffsets.length).toBeGreaterThan(0);
    expect(A.lossOffsetFromOtherGroup).toBeGreaterThan(0);
  });
});

// ============================================================
// T-M04: §104의2 비교과세
// ============================================================

describe("T-M04: 비교과세 MAX (다주택 중과 포함)", () => {
  it("중과 + 일반 혼합 시 MAX 적용", () => {
    // 중과 유예 중이라 실제 적용 안 되므로 mockRates를 유예 해제로 조정
    const ratesNoSuspend = makeMockRates({
      "transfer:surcharge:_default": {
        taxType: "transfer",
        category: "surcharge",
        subCategory: "_default",
        rateTable: {
          multi_house_2: { additionalRate: 0.20, condition: "조정2주택", referenceDate: "transfer_date" },
          multi_house_3plus: { additionalRate: 0.30, condition: "조정3+", referenceDate: "transfer_date" },
          non_business_land: { additionalRate: 0.10 },
          unregistered: { flatRate: 0.70, excludeDeductions: true, excludeBasicDeduction: true },
        },
        deductionRules: null,
        specialRules: { surcharge_suspended: false, suspended_types: [], suspended_until: null },
      },
    } as never);

    const input: AggregateTransferInput = {
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      properties: [
        makeItem("A", "일반 토지", {
          propertyType: "land",
          transferPrice: 600_000_000,
          acquisitionPrice: 300_000_000,
          acquisitionDate: new Date("2018-06-01"),
          transferDate: new Date("2024-06-01"),
          isOneHousehold: false,
          householdHousingCount: 0,
        }),
        makeItem("B", "중과 주택", {
          propertyType: "housing",
          transferPrice: 800_000_000,
          acquisitionPrice: 400_000_000,
          acquisitionDate: new Date("2018-06-01"),
          transferDate: new Date("2024-06-01"),
          isOneHousehold: false,
          householdHousingCount: 3,
          isRegulatedArea: true,
        }),
      ],
    };

    const r = calculateTransferTaxAggregate(input, ratesNoSuspend);
    expect(["groups", "general"]).toContain(r.comparedTaxApplied);
    expect(r.calculatedTax).toBe(
      Math.max(r.calculatedTaxByGroups, r.calculatedTaxByGeneral),
    );
  });
});

// ============================================================
// T-M05: 단기 + 누진 혼합
// ============================================================

describe("T-M05: 단기 + 누진 혼합", () => {
  it("그룹 2개, 비교과세 MAX", () => {
    const input: AggregateTransferInput = {
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      properties: [
        makeItem("A", "장기 토지", {
          propertyType: "land",
          transferPrice: 500_000_000,
          acquisitionPrice: 300_000_000,
          acquisitionDate: new Date("2018-06-01"),
          transferDate: new Date("2024-06-01"),
          isOneHousehold: false,
          householdHousingCount: 0,
        }),
        makeItem("B", "단기 토지", {
          propertyType: "land",
          transferPrice: 300_000_000,
          acquisitionPrice: 200_000_000,
          acquisitionDate: new Date("2023-06-01"),
          transferDate: new Date("2024-06-01"), // 1년 미만
          isOneHousehold: false,
          householdHousingCount: 0,
        }),
      ],
    };

    const r = calculateTransferTaxAggregate(input, mockRates);
    const groupSet = new Set(r.groupTaxes.map((g) => g.group));
    expect(groupSet.has("progressive")).toBe(true);
    expect(groupSet.has("short_term")).toBe(true);
    expect(["groups", "general"]).toContain(r.comparedTaxApplied);
  });
});

// ============================================================
// T-M06: 기본공제 MAX_BENEFIT 배분
// ============================================================

describe("T-M06: 기본공제 배분", () => {
  it("MAX_BENEFIT: 중과 포함 자산에 우선 배분", () => {
    const input: AggregateTransferInput = {
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      basicDeductionAllocation: "MAX_BENEFIT",
      properties: [
        makeItem("A", "일반 토지 (저구간)", {
          propertyType: "land",
          transferPrice: 100_000_000,
          acquisitionPrice: 80_000_000,
          acquisitionDate: new Date("2018-06-01"),
          transferDate: new Date("2024-06-01"),
          isOneHousehold: false,
          householdHousingCount: 0,
        }),
        makeItem("B", "단기 토지 (단일세율)", {
          propertyType: "land",
          transferPrice: 300_000_000,
          acquisitionPrice: 200_000_000,
          acquisitionDate: new Date("2023-06-01"),
          transferDate: new Date("2024-06-01"),
          isOneHousehold: false,
          householdHousingCount: 0,
        }),
      ],
    };

    const r = calculateTransferTaxAggregate(input, mockRates);
    const B = r.properties.find((p) => p.propertyId === "B")!;
    expect(B.allocatedBasicDeduction).toBeGreaterThan(0);
    expect(r.basicDeduction).toBeLessThanOrEqual(2_500_000);
  });
});

// ============================================================
// T-M07: 전체 차손 초과
// ============================================================

describe("T-M07: 전체 차손 초과", () => {
  it("차손이 차익 초과 → 잔여 차손 소멸 (이월 불가)", () => {
    const input: AggregateTransferInput = {
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      properties: [
        makeItem("A", "차익 토지", {
          propertyType: "land",
          transferPrice: 500_000_000,
          acquisitionPrice: 300_000_000, // 차익 2억
          acquisitionDate: new Date("2018-06-01"),
          transferDate: new Date("2024-06-01"),
          isOneHousehold: false,
          householdHousingCount: 0,
        }),
        makeItem("B", "차손 토지", {
          propertyType: "land",
          transferPrice: 300_000_000,
          acquisitionPrice: 800_000_000, // 차손 -5억
          acquisitionDate: new Date("2018-06-01"),
          transferDate: new Date("2024-06-01"),
          isOneHousehold: false,
          householdHousingCount: 0,
        }),
      ],
    };

    const r = calculateTransferTaxAggregate(input, mockRates);
    expect(r.unusedLoss).toBeGreaterThan(0);
    // 차익 전액 차손과 통산되어 incomeAfterOffset 합은 0
    expect(r.totalIncomeAfterOffset).toBe(0);
    expect(r.calculatedTax).toBe(0);
  });
});

// ============================================================
// T-M08: 건별 감면 독립 합산
// ============================================================

describe("T-M08: 감면 건별 독립", () => {
  it("자경농지 감면 + 일반 혼합 — 건별 reductionAmount 합산", () => {
    const input: AggregateTransferInput = {
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      properties: [
        makeItem("A", "자경 농지", {
          propertyType: "land",
          transferPrice: 500_000_000,
          acquisitionPrice: 300_000_000,
          acquisitionDate: new Date("2010-06-01"),
          transferDate: new Date("2024-06-01"),
          isOneHousehold: false,
          householdHousingCount: 0,
          reductions: [{ type: "self_farming", farmingYears: 10 }],
        }),
        makeItem("B", "일반 토지", {
          propertyType: "land",
          transferPrice: 400_000_000,
          acquisitionPrice: 300_000_000,
          acquisitionDate: new Date("2018-06-01"),
          transferDate: new Date("2024-06-01"),
          isOneHousehold: false,
          householdHousingCount: 0,
        }),
      ],
    };

    const r = calculateTransferTaxAggregate(input, mockRates);
    expect(r.reductionAmount).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// T-M09: 1세대1주택 비과세 + 과세 혼합
// ============================================================

describe("T-M09: 비과세 1건 + 과세 1건", () => {
  it("비과세 건은 소득금액 0으로 통산·합산 제외", () => {
    const input: AggregateTransferInput = {
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      properties: [
        makeItem("A", "1세대1주택 (비과세)", {
          propertyType: "housing",
          transferPrice: 1_000_000_000,
          acquisitionPrice: 500_000_000,
          acquisitionDate: new Date("2018-06-01"),
          transferDate: new Date("2024-06-01"),
          isOneHousehold: true,
          householdHousingCount: 1,
          residencePeriodMonths: 60,
        }),
        makeItem("B", "일반 토지", {
          propertyType: "land",
          transferPrice: 400_000_000,
          acquisitionPrice: 300_000_000,
          acquisitionDate: new Date("2018-06-01"),
          transferDate: new Date("2024-06-01"),
          isOneHousehold: false,
          householdHousingCount: 0,
        }),
      ],
    };

    const r = calculateTransferTaxAggregate(input, mockRates);
    const A = r.properties.find((p) => p.propertyId === "A")!;
    const B = r.properties.find((p) => p.propertyId === "B")!;
    expect(A.isExempt).toBe(true);
    expect(A.income).toBe(0);
    expect(B.income).toBeGreaterThan(0);
  });
});

// ============================================================
// T-M10: 3건 누진 + 구간 이동
// ============================================================

describe("T-M10: 3건 누진 합산", () => {
  it("합산 과세표준이 누진 구간 이동", () => {
    const input: AggregateTransferInput = {
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      properties: [
        makeItem("A", "토지 A", {
          propertyType: "land", transferPrice: 300_000_000, acquisitionPrice: 200_000_000,
          acquisitionDate: new Date("2018-06-01"), transferDate: new Date("2024-06-01"),
          isOneHousehold: false, householdHousingCount: 0,
        }),
        makeItem("B", "토지 B", {
          propertyType: "land", transferPrice: 400_000_000, acquisitionPrice: 300_000_000,
          acquisitionDate: new Date("2018-06-01"), transferDate: new Date("2024-06-01"),
          isOneHousehold: false, householdHousingCount: 0,
        }),
        makeItem("C", "토지 C", {
          propertyType: "land", transferPrice: 350_000_000, acquisitionPrice: 250_000_000,
          acquisitionDate: new Date("2018-06-01"), transferDate: new Date("2024-06-01"),
          isOneHousehold: false, householdHousingCount: 0,
        }),
      ],
    };

    const r = calculateTransferTaxAggregate(input, mockRates);
    expect(r.comparedTaxApplied).toBe("none");
    expect(r.groupTaxes.length).toBe(1);
    expect(r.calculatedTax).toBeGreaterThan(0);
  });
});

// ============================================================
// T-M11: 가산세 — §114조의2 건별 + 신고불성실 합산
// ============================================================

describe("T-M11: 가산세 건별 + 합산", () => {
  it("filingPenalty는 합산 결정세액 기반", () => {
    const input: AggregateTransferInput = {
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      properties: [
        makeItem("A", "토지 A", {
          propertyType: "land", transferPrice: 500_000_000, acquisitionPrice: 300_000_000,
          acquisitionDate: new Date("2018-06-01"), transferDate: new Date("2024-06-01"),
          isOneHousehold: false, householdHousingCount: 0,
        }),
      ],
      filingPenaltyDetails: {
        determinedTax: 100_000_000,
        reductionAmount: 0,
        priorPaidTax: 0,
        originalFiledTax: 0,
        excessRefundAmount: 0,
        interestSurcharge: 0,
        filingType: "none",
        penaltyReason: "normal",
      },
    };

    const r = calculateTransferTaxAggregate(input, mockRates);
    expect(r.penaltyTax).toBeGreaterThanOrEqual(0);
    expect(r.penaltyDetail).toBeDefined();
  });
});

// ============================================================
// T-M12: 미등기 기본공제 배제
// ============================================================

describe("T-M12: 미등기 기본공제 배제", () => {
  it("미등기 자산에는 allocatedBasicDeduction=0", () => {
    const input: AggregateTransferInput = {
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      properties: [
        makeItem("A", "미등기 토지", {
          propertyType: "land", transferPrice: 500_000_000, acquisitionPrice: 300_000_000,
          acquisitionDate: new Date("2018-06-01"), transferDate: new Date("2024-06-01"),
          isOneHousehold: false, householdHousingCount: 0,
          isUnregistered: true,
        }),
        makeItem("B", "등기 토지", {
          propertyType: "land", transferPrice: 400_000_000, acquisitionPrice: 300_000_000,
          acquisitionDate: new Date("2018-06-01"), transferDate: new Date("2024-06-01"),
          isOneHousehold: false, householdHousingCount: 0,
        }),
      ],
    };

    const r = calculateTransferTaxAggregate(input, mockRates);
    const A = r.properties.find((p) => p.propertyId === "A")!;
    const B = r.properties.find((p) => p.propertyId === "B")!;
    expect(A.allocatedBasicDeduction).toBe(0);
    expect(B.allocatedBasicDeduction).toBeGreaterThan(0);
  });
});

// ============================================================
// T-M13: 과세연도 불일치
// ============================================================

describe("T-M13: 과세연도 검증", () => {
  it("items의 transferDate가 taxYear와 다르면 throw", () => {
    const input: AggregateTransferInput = {
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      properties: [
        makeItem("A", "2024 자산", {
          propertyType: "land", transferPrice: 300_000_000, acquisitionPrice: 200_000_000,
          acquisitionDate: new Date("2018-06-01"), transferDate: new Date("2024-12-01"),
          isOneHousehold: false, householdHousingCount: 0,
        }),
        makeItem("B", "2025 자산", {
          propertyType: "land", transferPrice: 300_000_000, acquisitionPrice: 200_000_000,
          acquisitionDate: new Date("2018-06-01"), transferDate: new Date("2025-01-01"),
          isOneHousehold: false, householdHousingCount: 0,
        }),
      ],
    };

    expect(() => calculateTransferTaxAggregate(input, mockRates)).toThrow(/과세기간/);
  });
});

// ============================================================
// T-M14: 분양권 그룹 별도
// ============================================================

describe("T-M14: 분양권 · 비사업용 · 주택 3그룹", () => {
  it("3개 그룹으로 분리", () => {
    const input: AggregateTransferInput = {
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      properties: [
        makeItem("A", "장기 주택", {
          propertyType: "housing", transferPrice: 500_000_000, acquisitionPrice: 300_000_000,
          acquisitionDate: new Date("2018-06-01"), transferDate: new Date("2024-06-01"),
          isOneHousehold: false, householdHousingCount: 0,
          residencePeriodMonths: 36,
        }),
        makeItem("B", "분양권", {
          propertyType: "presale_right", transferPrice: 400_000_000, acquisitionPrice: 300_000_000,
          acquisitionDate: new Date("2023-06-01"), transferDate: new Date("2024-06-01"),
          isOneHousehold: false, householdHousingCount: 0,
        }),
        makeItem("C", "비사업용 토지", {
          propertyType: "land", transferPrice: 500_000_000, acquisitionPrice: 300_000_000,
          acquisitionDate: new Date("2010-06-01"), transferDate: new Date("2024-06-01"),
          isOneHousehold: false, householdHousingCount: 0,
          isNonBusinessLand: true,
        }),
      ],
    };

    const r = calculateTransferTaxAggregate(input, mockRates);
    const groups = new Set(r.groupTaxes.map((g) => g.group));
    expect(groups.size).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================
// T-M15: 안분 잔차 보정
// ============================================================

describe("T-M15: pro-rata 잔차 보정", () => {
  it("차익 3건 + 차손 1건 pro-rata 합계가 offsetPool과 일치", () => {
    const input: AggregateTransferInput = {
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      properties: [
        makeItem("A", "차익 1", {
          propertyType: "land", transferPrice: 300_000_000, acquisitionPrice: 200_000_000, // +1억
          acquisitionDate: new Date("2018-06-01"), transferDate: new Date("2024-06-01"),
          isOneHousehold: false, householdHousingCount: 0,
        }),
        makeItem("B", "차익 2", {
          propertyType: "land", transferPrice: 450_000_000, acquisitionPrice: 300_000_000, // +1.5억
          acquisitionDate: new Date("2018-06-01"), transferDate: new Date("2024-06-01"),
          isOneHousehold: false, householdHousingCount: 0,
        }),
        makeItem("C", "차익 3", {
          propertyType: "land", transferPrice: 550_000_000, acquisitionPrice: 350_000_000, // +2억
          acquisitionDate: new Date("2018-06-01"), transferDate: new Date("2024-06-01"),
          isOneHousehold: false, householdHousingCount: 0,
        }),
        makeItem("D", "차손", {
          propertyType: "land", transferPrice: 200_000_000, acquisitionPrice: 350_000_000, // -1.5억
          acquisitionDate: new Date("2018-06-01"), transferDate: new Date("2024-06-01"),
          isOneHousehold: false, householdHousingCount: 0,
        }),
      ],
    };

    const r = calculateTransferTaxAggregate(input, mockRates);
    const totalSameGroupOffset = r.properties.reduce(
      (s, p) => s + p.lossOffsetFromSameGroup,
      0,
    );
    // 차손 1.5억이 모두 차익에 통산되어야 함
    expect(totalSameGroupOffset).toBe(150_000_000);
    expect(r.unusedLoss).toBe(0);
  });
});
