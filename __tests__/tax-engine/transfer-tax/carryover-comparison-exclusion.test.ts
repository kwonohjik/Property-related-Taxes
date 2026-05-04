/**
 * C-05 / C-14: 비교과세 관련 anchor
 *
 * C-05: 이월과세 A < B → §97조의2 ② 3호 자동 적용배제, B 채택
 * C-14: 증여자 장기보유(2010.01.01 취득) → 수증자 단기양도(2025.03.01) → A < B → B 채택
 *
 * 법령: 소득세법 §97조의2 ② 3호 (비교과세)
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

const MOCK_RATES = makeMockRates();

describe("C-05: 비교과세 — Scenario A 결정세액 < B → B 채택 (§97조의2 ② 3호)", () => {
  /**
   * A < B 조건 구성:
   * - 증여자 취득가액이 수증자 증여 당시 평가액보다 낮아야 A가 차익이 커야 하나,
   *   LTHD 등으로 A가 오히려 낮아지는 역전 케이스.
   * - 단순하게: A에서 증여자 취득가가 높아서 양도차익이 작고 결정세액도 작은 케이스.
   *   증여자 취득가 = 950M, 증여 당시 평가액 = 300M, 양도가액 = 1,000M
   *   A 양도차익 = 1,000M - 950M = 50M (작음)
   *   B 양도차익 = 1,000M - 300M = 700M (큼)
   *   → B 결정세액 > A 결정세액 → B 채택
   */
  const input = baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_000_000_000,
    transferDate: new Date("2026-06-01"),
    acquisitionPrice: 950_000_000,
    acquisitionDate: new Date("2015-01-01"),
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false, // 비과세 없이 전액 과세 → 비교과세 의미 있음
    reductions: [],
    annualBasicDeductionUsed: 0,
    acquisitionCause: "carryover_gift",
    carryoverTaxation: {
      giftRegistryDate: new Date("2023-06-01"), // 2023.1.1 이후 → 10년 룰 (3년 이내 양도)
      donorAcquisitionDate: new Date("2015-01-01"),
      useEstimatedAcquisition: false,
      donorAcquisitionPrice: 950_000_000, // 높은 취득가 → A 차익 작음
      giftTaxAmount: 0,
      giftDateValuation: 300_000_000,    // 낮은 증여 평가액 → B 차익 큼
    },
  });

  it("C-05-1: Scenario A 결정세액 < B 결정세액", () => {
    const result = calculateTransferTax(input, MOCK_RATES);
    const d = result.carryoverTaxationDetail!;
    expect(d.scenarioA.determinedTax).toBeLessThan(d.scenarioB.determinedTax);
  });

  it("C-05-2: adoptedScenario = B (비교과세 적용배제)", () => {
    const result = calculateTransferTax(input, MOCK_RATES);
    expect(result.carryoverTaxationDetail?.adoptedScenario).toBe("B");
  });

  it("C-05-3: comparisonExclusion = true", () => {
    const result = calculateTransferTax(input, MOCK_RATES);
    expect(result.carryoverTaxationDetail?.comparisonExclusion).toBe(true);
  });

  it("C-05-4: exclusionReason = tax_comparison", () => {
    const result = calculateTransferTax(input, MOCK_RATES);
    expect(result.carryoverTaxationDetail?.exclusionReason).toBe("tax_comparison");
  });

  it("C-05-5: 최종 결정세액 = Scenario B 결정세액", () => {
    const result = calculateTransferTax(input, MOCK_RATES);
    const detB = result.carryoverTaxationDetail!.scenarioB.determinedTax;
    expect(result.determinedTax).toBe(detB);
  });
});

describe("C-14: 비교과세 역전 — 증여자 장기보유 + 수증자 단기양도 (설계 §9.3)", () => {
  /**
   * 증여자 취득일: 2010.01.01 (보유 ~15년)
   * 증여일: 2024.06.01 (수증자 취득)
   * 양도일: 2025.03.01 (증여 후 9개월)
   *
   * Scenario A (이월과세, 증여자 기준):
   *   취득가액 = 200M, 양도가액 = 1,500M → 차익 1,300M
   *   보유 15년 → LTHD 30% → 소득금액 910M → 과세표준 ~907M
   *   누진세율 45% → 결정세액 ≈ 345M
   *
   * Scenario B (미적용, 수증자 기준):
   *   취득가액 = 1,200M, 양도가액 = 1,500M → 차익 300M
   *   보유 9개월 → 1년 미만 단기 70% 세율 → 결정세액 ≈ 210M
   *
   * 결과: A(345M) > B(210M) → A 채택
   * 참고: 설계 문서 §9.3의 "역전" 패턴은 A < B를 가정했으나,
   *   이 케이스에서는 증여자 차익(1,300M)이 수증자 차익(300M)보다 크므로
   *   실제로는 A > B → A 채택. 세금 회피 시도 실패 케이스.
   *   진정한 A < B 역전은 증여자 취득가가 매우 높아야 함 (C-05 참조).
   */
  const input = baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_500_000_000,
    transferDate: new Date("2025-03-01"),
    acquisitionPrice: 200_000_000,
    acquisitionDate: new Date("2010-01-01"),
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    reductions: [],
    annualBasicDeductionUsed: 0,
    acquisitionCause: "carryover_gift",
    carryoverTaxation: {
      giftRegistryDate: new Date("2024-06-01"),
      donorAcquisitionDate: new Date("2010-01-01"),
      useEstimatedAcquisition: false,
      donorAcquisitionPrice: 200_000_000,
      giftTaxAmount: 0,
      giftDateValuation: 1_200_000_000,
    },
  });

  it("C-14-1: Scenario A 보유기간 = 15년 (증여자 취득일 기산)", () => {
    const result = calculateTransferTax(input, MOCK_RATES);
    expect(result.carryoverTaxationDetail?.scenarioA.holdingPeriodYears).toBe(15);
  });

  it("C-14-2: Scenario B 보유기간 = 0년 (9개월 → 1년 미만)", () => {
    const result = calculateTransferTax(input, MOCK_RATES);
    expect(result.carryoverTaxationDetail?.scenarioB.holdingPeriodYears).toBe(0);
  });

  it("C-14-3: A.determinedTax > B.determinedTax (증여자 대차익이 수증자 단기세 초과)", () => {
    // 이 케이스에서는 A(1,300M 차익)가 B(300M 차익 ×70%)보다 큼 → A 채택
    const result = calculateTransferTax(input, MOCK_RATES);
    const d = result.carryoverTaxationDetail!;
    expect(d.scenarioA.determinedTax).toBeGreaterThan(d.scenarioB.determinedTax);
  });

  it("C-14-4: A 채택 (이월과세 큰 세액 → 정부 세수 증가)", () => {
    const result = calculateTransferTax(input, MOCK_RATES);
    expect(result.carryoverTaxationDetail?.adoptedScenario).toBe("A");
    expect(result.carryoverTaxationDetail?.comparisonExclusion).toBe(false);
  });

  it("C-14-5: 최종 결정세액 = A 결정세액", () => {
    const result = calculateTransferTax(input, MOCK_RATES);
    const detA = result.carryoverTaxationDetail!.scenarioA.determinedTax;
    expect(result.determinedTax).toBe(detA);
    expect(result.determinedTax).toBeGreaterThan(0);
  });
});
