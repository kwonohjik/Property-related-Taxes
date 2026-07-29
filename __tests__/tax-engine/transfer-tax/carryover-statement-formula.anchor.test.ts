/**
 * Anchor — 배우자등 이월과세(§97조의2) Scenario A 채택 시 신고서 "1단계 — 양도차익 산정"
 * 취득가액·필요경비 근거(formula) 표시 + 증여세 상당액 수치 반영.
 *
 * 회귀 대상:
 * 1) (수치) 실가 모드에서 증여세 상당액이 필요경비에서 드롭되던 버그 → transferExpense(나목) 가산으로 반영.
 * 2) (표시) 취득가액 근거가 "실제 거래가액"으로 오표시 → "증여자 취득 당시 취득가액 승계 §97의2①".
 * 3) (표시) 필요경비 근거가 증여세 상당액 구성을 설명하지 못함 → "증여세 상당액 … §163의2" 명시.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

const mockRates = makeMockRates();

// 실가 모드 이월과세: 양도가액 700M, 증여자 취득가액 444,654,088, 양도비 22,120,000, 증여세 상당액 30M.
// 양도차익 = 700M − 444,654,088 − (22,120,000 + 30,000,000) = 203,225,912.
const CARRYOVER_ACTUAL_INPUT: TransferTaxInput = baseTransferInput({
  propertyType: "housing",
  transferPrice: 700_000_000,
  transferDate: new Date("2026-02-16"),
  acquisitionPrice: 444_654_088,
  acquisitionDate: new Date("2006-05-21"),
  transferExpense: 22_120_000,
  expenses: 0,
  useEstimatedAcquisition: false,
  isOneHousehold: false,
  householdHousingCount: 1,
  acquisitionCause: "carryover_gift",
  carryoverTaxation: {
    giftRegistryDate: new Date("2021-06-19"),
    donorAcquisitionDate: new Date("2006-05-21"),
    useEstimatedAcquisition: false,
    donorAcquisitionPrice: 444_654_088,
    giftTaxAmount: 30_000_000,
    giftDateValuation: 666_000_000,
  },
});

// 환산(estimated) 모드 이월과세: 본문 필요경비 = 개산공제(취득시 기준시가 404M × 3% = 12,120,000) + 증여세 10M.
const CARRYOVER_ESTIMATED_INPUT: TransferTaxInput = baseTransferInput({
  propertyType: "housing",
  transferPrice: 700_000_000,
  transferDate: new Date("2026-02-16"),
  acquisitionPrice: 0,
  acquisitionDate: new Date("2006-05-21"),
  transferExpense: 0,
  expenses: 0,
  useEstimatedAcquisition: true,
  isOneHousehold: false,
  householdHousingCount: 1,
  acquisitionCause: "carryover_gift",
  carryoverTaxation: {
    giftRegistryDate: new Date("2021-06-19"),
    donorAcquisitionDate: new Date("2006-05-21"),
    useEstimatedAcquisition: true,
    giftTaxAmount: 10_000_000,
    giftDateValuation: 666_000_000,
  },
  standardPriceAtAcquisition: 404_000_000,
  standardPriceAtTransfer: 636_000_000,
});

const formData = {
  transferDate: "2026-02-16",
  contractTotalPrice: "700000000",
  assets: [{}],
} as unknown as TransferFormData;

describe("이월과세 Scenario A — 신고서 취득가액·필요경비 근거 + 증여세 반영", () => {
  it("수치: 증여세 상당액이 양도차익에서 차감됨 (Scenario A 채택)", () => {
    const result = calculateTransferTax(CARRYOVER_ACTUAL_INPUT, mockRates);
    expect(result.carryoverTaxationDetail?.adoptedScenario).toBe("A");
    expect(result.transferGain).toBe(203_225_912);
    // echo (표시 전용)
    expect(result.carryoverTaxationDetail?.scenarioA.acquisitionWasEstimated).toBe(false);
    expect(result.carryoverTaxationDetail?.scenarioA.giftTaxAddedToExpense).toBe(30_000_000);
  });

  it("표시: 취득가액 근거가 증여자 취득가액 승계(§97의2①)로 표기", () => {
    const result = calculateTransferTax(CARRYOVER_ACTUAL_INPUT, mockRates);
    const items = buildStatementItems(result, formData, undefined, undefined, 700_000_000);
    const acq = items.get("acquisitionPrice")!;
    expect(acq.value).toBe(444_654_088);
    expect(acq.formula).toContain("증여자 취득 당시 취득가액 444,654,088");
    expect(acq.formula).toContain("이월과세 §97의2①");
    // 회귀: 일반 실가 문구가 아니어야 함
    expect(acq.formula).not.toContain("(실제 거래가액)");
  });

  it("표시: 필요경비 근거가 양도비 + 증여세 상당액(§163의2)으로 분해 표기", () => {
    const result = calculateTransferTax(CARRYOVER_ACTUAL_INPUT, mockRates);
    const items = buildStatementItems(result, formData, undefined, undefined, 700_000_000);
    const exp = items.get("expenses")!;
    // 필요경비 = 양도비 22,120,000 + 증여세 상당액 30,000,000 = 52,120,000
    expect(exp.value).toBe(52_120_000);
    expect(exp.formula).toContain("양도비 등 22,120,000");
    expect(exp.formula).toContain("증여세 상당액 30,000,000");
    expect(exp.formula).toContain("§163의2");
  });

  it("증여세 0원: 필요경비 근거에 증여세 항목 없이 양도비만 표기", () => {
    const noGift: TransferTaxInput = {
      ...CARRYOVER_ACTUAL_INPUT,
      carryoverTaxation: {
        ...CARRYOVER_ACTUAL_INPUT.carryoverTaxation!,
        giftTaxAmount: 0,
      },
    };
    const result = calculateTransferTax(noGift, mockRates);
    expect(result.transferGain).toBe(233_225_912); // 증여세 미가산 시 원래값
    const items = buildStatementItems(result, formData, undefined, undefined, 700_000_000);
    const exp = items.get("expenses")!;
    expect(exp.value).toBe(22_120_000);
    expect(exp.formula).toContain("양도비 등 22,120,000");
    expect(exp.formula).not.toContain("증여세 상당액");
  });

  it("표시(환산 모드): 본문 필요경비를 개산공제(취득시 기준시가 × 3%)로 표기 — '양도비 등' 오표시 아님", () => {
    const result = calculateTransferTax(CARRYOVER_ESTIMATED_INPUT, mockRates);
    expect(result.carryoverTaxationDetail?.adoptedScenario).toBe("A");
    expect(result.carryoverTaxationDetail?.scenarioA.acquisitionWasEstimated).toBe(true);
    const items = buildStatementItems(result, formData, undefined, undefined, 700_000_000);
    const exp = items.get("expenses")!;
    // 개산공제 12,120,000 = 404,000,000 × 3% + 증여세 상당액 10,000,000 = 22,120,000
    expect(exp.value).toBe(22_120_000);
    expect(exp.formula).toContain("개산공제 12,120,000 = 취득시 기준시가 404,000,000 × 3%");
    expect(exp.formula).toContain("증여세 상당액 10,000,000");
    // 회귀: 개산공제를 실제 양도비로 오표시하지 않음
    expect(exp.formula).not.toContain("양도비 등 12,120,000");
  });
});
