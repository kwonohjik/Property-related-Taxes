/**
 * 장기보유 기산일 의제취득일 하한(2026-11-11 사용자 결정 · 계획서 docs/00-pm/remaining-4-measurements.plan.md §I) — 공통 leaf 밖 두 경로.
 * 1984.12.31. 이전 취득은 1985.1.1. 취득으로 본다(법률 제4803호 부칙 제8조) · 보유기간은 취득일부터(소득세법 §95④).
 *
 *  · 재개발 원조합원(`computeRedevelopmentLthd`) — 분기별 보유개월이 결과 카드에 그대로 보인다. 종전 1980 취득은 1980부터 셌다.
 *  · 이월과세 A 보유연수(`scenarioA.holdingPeriodYears` · §95④ 단서 증여자 취득일 기산) — 증여자 1980 취득은 1980부터 셌다.
 * 두 경우 모두 1985-01-01 입력과 같은 값이어야 한다(세액도 같다 — 15년 이상 · 10년 이상 상한 구간).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

function apt(acq: string): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt", transferPrice: 1_500_000_000, transferDate: D("2024-06-01"), acquisitionDate: D(acq), acquisitionPrice: 100_000_000,
    expenses: 0, useEstimatedAcquisition: false, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
    redevelopment: {
      subject: "apt", approvalLawBasis: "urban_renovation_art_74", approvalDate: D("2016-03-01"), rightsValue: 250_000_000, settlementDirection: "pay",
      settlementAmount: 136_000_000, preApprovalExpenses: 0, postApprovalExpenses: 0, originalAssetType: "housing", completionDate: D("2019-06-01"),
    } as RedevelopmentInfo,
  } as Partial<TransferTaxInput>);
}

function carryover(donorAcq: string): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing", transferPrice: 1_000_000_000, transferDate: D("2030-05-31"), acquisitionPrice: 700_000_000, acquisitionDate: D(donorAcq),
    expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 1, residencePeriodMonths: 0, isOneHousehold: false, reductions: [],
    acquisitionCause: "carryover_gift",
    carryoverTaxation: { giftRegistryDate: D("2023-06-01"), donorAcquisitionDate: D(donorAcq), useEstimatedAcquisition: false, donorAcquisitionPrice: 300_000_000, giftTaxAmount: 0, giftDateValuation: 700_000_000 },
  } as Partial<TransferTaxInput>);
}

describe("LD-1 재개발 원조합원 1980 취득 = 1985-01-01 취득", () => {
  it("분기별 보유개월 · 세액이 같다", () => {
    const a = calculateTransferTax(apt("1980-05-01"), rates);
    const b = calculateTransferTax(apt("1985-01-01"), rates);
    const months = (r: typeof a) => [r.redevelopmentDetail?.preApproval.holdingMonths, r.redevelopmentDetail?.postApprovalExistingHouse.holdingMonths, r.redevelopmentDetail?.settlement.holdingMonths];
    expect(months(a)).toEqual(months(b));
    expect(a.totalTax).toBe(b.totalTax);
  });
});

describe("LD-2 이월과세 A — 증여자 1980 취득 보유연수 = 1985-01-01 기산", () => {
  it("2030-05-31 양도: 45년(1985-01-01부터) · 종전 50년(1980부터)", () => {
    const a = calculateTransferTax(carryover("1980-05-01"), rates).carryoverTaxationDetail?.scenarioA.holdingPeriodYears;
    expect(a).toBe(calculateTransferTax(carryover("1985-01-01"), rates).carryoverTaxationDetail?.scenarioA.holdingPeriodYears);
    expect(a).toBe(45);
  });
});

/**
 * LD-3 재개발 원조합원 **입주권** — 인가 전 분 보유기간은 취득일부터 관리처분계획인가일까지(§166⑤1호)라 15년 · 10년 상한에 닿지 않을 수 있다.
 * 1980 취득 · 1992-06-01 인가 · 2024-06-01 양도: 의제(1985-01-01) 89개월 vs 종전(1980) 145개월 — 세액이 갈리는 유일한 경로(계획서 §I.3).
 */
function right(acq: string, oneRight: boolean): TransferTaxInput {
  return baseTransferInput({
    propertyType: "right_to_move_in", transferPrice: 1_500_000_000, transferDate: D("2024-06-01"), acquisitionDate: D(acq), acquisitionPrice: 100_000_000,
    expenses: 0, useEstimatedAcquisition: false, residencePeriodMonths: oneRight ? 144 : 0,
    ...(oneRight
      ? { isOneHousehold: true, householdHousingCount: 0, householdRightCount: 1, householdNoPresaleRightsConfirmed: true }
      : { isOneHousehold: false, householdHousingCount: 2 }),
    redevelopment: {
      subject: "right", approvalLawBasis: "urban_renovation_art_74", approvalDate: D("1992-06-01"), rightsValue: 250_000_000, settlementDirection: "pay",
      settlementAmount: 136_000_000, preApprovalExpenses: 0, postApprovalExpenses: 0, originalAssetType: "housing",
      ...(oneRight ? { exemptionEligibleAtApproval: true } : {}),
    } as RedevelopmentInfo,
  } as Partial<TransferTaxInput>);
}

describe("LD-3 재개발 원조합원 입주권 1980 취득 · 1992 인가 — 인가 전 분 보유 = 1985-01-01부터", () => {
  const pre = (r: ReturnType<typeof calculateTransferTax>) => r.redevelopmentDetail?.preApproval;
  it("표1: 89개월 14% · 장기보유 21,000,000 (종전 145개월 24% · 36,000,000)", () => {
    const a = calculateTransferTax(right("1980-05-01", false), rates);
    expect(pre(a)?.holdingMonths).toBe(89);
    expect(pre(a)?.lthdRate).toBe(0.14);
    expect(a.longTermHoldingDeduction).toBe(21_000_000);
    expect(a.totalTax).toBe(calculateTransferTax(right("1985-01-01", false), rates).totalTax);
  });
  it("표2(1세대 1입주권 · 거주 144개월): 보유 7년 28% + 거주 7년 28% = 56% · 16,800,000 (종전 80% · 24,000,000)", () => {
    const a = calculateTransferTax(right("1980-05-01", true), rates);
    expect(pre(a)?.holdingMonths).toBe(89);
    expect(pre(a)?.lthdRate).toBeCloseTo(0.56, 10);
    expect(a.longTermHoldingDeduction).toBe(16_800_000);
  });
});
