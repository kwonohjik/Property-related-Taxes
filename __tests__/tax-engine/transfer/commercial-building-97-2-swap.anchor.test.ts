/**
 * Pre-Do anchor A1 — 상가건물 환산 §97②2호 단서 swap 미배선 (silent-drop 갭).
 *
 * 계획서: docs/00-pm/general-commercial-estimated-97-2-swap.plan.md (Phase 1 = 상가).
 *
 * 갭: `transfer-tax-commercial-step.ts:128-129`가 상가 환산 STEP에서 capitalExpenditure·
 *     transferExpense를 명시적 undefined로 폐기 → §97②2호 단서 swap(필요경비 = MAX(개산공제,
 *     자본적지출+양도비)) 미발동. UI(`AssetSectionExpense`)는 입력을 받고 "§97② 단서" 안내까지
 *     하지만 엔진이 조용히 버린다.
 *
 * 수치 (probe 실측 2026-07-21):
 *   base(general, capex 없음): transferGain = 594,000,000 (10억 − 환산취득가 4억 − 개산공제 600만)
 *   estimatedSide = 환산취득가(400,000,000) + 개산공제(취득호별총액 2억 × 3% = 6,000,000) = 406,000,000
 *   A1: capex 450,000,000 + 양도비 10,000,000 = directSide 460,000,000 (> estimatedSide 406,000,000)
 *     현행(버그): transferGain = 594,000,000 (capex 완전 폐기 — capex 없을 때와 동일)
 *     기대(swap): transferGain = 10억 − 460,000,000(나목) = 540,000,000  ← 환산취득가 미차감(§97②2호)
 *     과다과세 gain = 594,000,000 − 540,000,000 = 54,000,000
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** 상가 환산 — 연면적 200㎡, 양도 10억, 취득 2010-06-01, 양도 2020-06-01(10년) */
function cb(overrides: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "commercial_building",
    transferPrice: 1_000_000_000,
    transferDate: new Date("2020-06-01"),
    acquisitionDate: new Date("2010-06-01"),
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    useEstimatedAcquisition: true,
    transferCause: "general",
    commercialBuildingValuation: {
      isPreDisclosure: false,
      exclusiveArea: 150,
      commonArea: 50,
      unitPriceAtTransfer: 2_500_000,
      unitPriceAtAcquisition: 1_000_000,
    },
    ...overrides,
  } as Partial<TransferTaxInput>);
}

describe("anchor A1 — 상가 환산 §97②2호 단서 swap (Phase 1 배선)", () => {
  it("baseline — capex 없음: 본문(개산공제) 유지, swap 미발동", () => {
    const r = calculateTransferTax(cb(), rates);
    expect(r.transferGain).toBe(594_000_000);
    expect(r.swapApplied ?? false).toBe(false);
  });

  it("§97②2호 단서 swap 발동 — transferGain 540,000,000 + swapApplied=true (Phase 1 배선)", () => {
    const r = calculateTransferTax(
      cb({ capitalExpenditure: 450_000_000, transferExpense: 10_000_000 }),
      rates,
    );
    // §97②2호: 가목(406,000,000) < 나목(460,000,000) → 나목을 필요경비 전체로, 환산취득가 미차감
    expect(r.transferGain).toBe(540_000_000);
    expect(r.swapApplied).toBe(true);
    expect(r.swapComparison).toEqual({
      estimatedSide: 406_000_000,
      directSide: 460_000_000,
      chosen: "direct",
    });
  });

  it("음성 경계 — capex+양도비 ≤ estimatedSide → 본문 유지(swap 미발동)", () => {
    // directSide = 300,000,000 < estimatedSide 406,000,000 → 개산공제 본문, gain 불변
    const r = calculateTransferTax(
      cb({ capitalExpenditure: 290_000_000, transferExpense: 10_000_000 }),
      rates,
    );
    expect(r.transferGain).toBe(594_000_000);
    expect(r.swapApplied ?? false).toBe(false);
  });
});
