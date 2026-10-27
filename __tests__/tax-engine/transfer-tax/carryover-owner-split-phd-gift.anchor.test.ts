/**
 * 이월과세 × 소유자 분리 × §164⑦ PHD 3시점 분리 — 증여세 상당액이 빠지지 않는다(계획서 `carryover-owner-split-display-gift-tax.plan.md` §6 · 리뷰 게이트 FAIL 1).
 *
 * PHD 분리 경로(`calcSplitGainPreDisclosure`)는 처음에 본인 파트 증여세 장치(`splitCarryoverBasis.giftTaxExpense`)를 읽지 않아 증여세 상당액이 조용히 사라졌다
 * (표시 `giftTaxAddedToExpense` 20,000,000 · 양도차익 불변). #2620은 종전 갈래(실가 전환)로 돌렸고, 이제 PHD 경로도 그 장치를 읽는다(계획서
 * `carryover-phd-owner-split-residuals.plan.md` V-3) — 같은 값이 분리 상세와 함께 나온다. 화면 경로는 `transfer.route.carryover-phd-scenario-a.anchor.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import { PHD_INPUT, PHD_TRANSFER_PRICE } from "./_helpers/pre-housing-disclosure-fixture";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

const run = (selfOwns: "land_only" | "building_only", giftTaxAmount: number) =>
  calculateTransferTax(
    baseTransferInput({
      propertyType: "housing", transferPrice: PHD_TRANSFER_PRICE, transferDate: D("2023-02-16"),
      acquisitionDate: D("2020-01-01"), landAcquisitionDate: D("2020-01-01"), acquisitionPrice: 0,
      useEstimatedAcquisition: true, acquisitionMethod: "estimated", expenses: 0,
      isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
      landSplitMode: "apportioned", preHousingDisclosure: PHD_INPUT, selfOwns,
      acquisitionCause: "carryover_gift",
      carryoverTaxation: { giftRegistryDate: D("2020-01-01"), donorAcquisitionDate: D("2014-09-14"), useEstimatedAcquisition: true, giftTaxAmount, giftDateValuation: 600_000_000 },
    } as Partial<TransferTaxInput>),
    rates,
  ).carryoverTaxationDetail!.scenarioA;

describe("PHD 분리 × 소유자 분리 — 시나리오 A 증여세 상당액", () => {
  it("토지만 — 2천만이 양도차익에서 전액 빠진다(139,089,851 → 119,089,851)", () => {
    expect(run("land_only", 0).transferGain).toBe(139_089_851);
    const a = run("land_only", 20_000_000);
    expect([a.giftTaxAddedToExpense, a.transferGain]).toEqual([20_000_000, 119_089_851]);
  });

  it("건물만 — 한도(증여세 가산 전 본인 파트 양도차익 8,490,962)까지 빠져 0", () => {
    const a = run("building_only", 20_000_000);
    expect([a.giftTaxLimitCap, a.giftTaxAddedToExpense, a.giftTaxLimitApplied, a.transferGain]).toEqual([8_490_962, 8_490_962, true, 0]);
  });
});
