/**
 * G4-6 — 엔진 계산 과정 step의 「이월과세 적용배제 (사유: …)」에 내부 enum(snake_case)이 나오지 않는다.
 * 결과 산식은 한국어로 풀어 쓴다(CLAUDE.md). 라벨은 결과 카드와 같은 단일 소스(`transfer-carryover-exclusion-labels.ts`).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import {
  CARRYOVER_EXCLUSION_REASON_LABELS,
  carryoverExclusionReasonLabel,
} from "@/lib/tax-engine/transfer-carryover-exclusion-labels";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

function stepOf(carryoverOver: Record<string, unknown>, over: Record<string, unknown> = {}) {
  const r = calculateTransferTax(
    baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_500_000_000,
      transferDate: new Date("2026-02-16"),
      acquisitionPrice: 0,
      acquisitionDate: new Date("2025-06-01"),
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      isRegulatedArea: false,
      acquisitionCause: "carryover_gift",
      carryoverTaxation: {
        giftRegistryDate: new Date("2025-06-01"),
        donorAcquisitionDate: new Date("2000-06-01"),
        donorAcquisitionPrice: 10_000_000,
        useEstimatedAcquisition: false,
        giftTaxAmount: 0,
        giftDateValuation: 1_500_000_000,
        ...carryoverOver,
      },
      ...over,
    } as Partial<TransferTaxInput>),
    rates,
  );
  return {
    reason: r.carryoverTaxationDetail?.exclusionReason,
    formula: r.steps.find((s) => s.label === "배우자등 이월과세 판정")?.formula ?? "",
  };
}

describe("G4-6 적용배제 step formula — 한국어 라벨", () => {
  it.each([
    ["one_house_exemption", {}, {}],
    ["period_exceeded", { giftRegistryDate: new Date("2012-06-01") }, { acquisitionDate: new Date("2012-06-01") }],
    ["relation_invalid", { donorRelation: "spouse", donorDeceased: true }, {}],
    ["expropriation", { exclusionDeclared: { expropriationWithin2Years: true } }, {}],
    ["family_business", { exclusionDeclared: { isFamilyBusinessInheritedAsset: true } }, {}],
  ] as const)("%s", (reason, co, over) => {
    const s = stepOf({ ...co }, { ...over });
    expect(s.reason).toBe(reason); // 전제: 그 사유 분기에 도달
    expect(s.formula).toBe(`이월과세 적용배제 (사유: ${CARRYOVER_EXCLUSION_REASON_LABELS[reason]})`);
    expect(s.formula).not.toMatch(/[a-z]+_[a-z_]+/);
  });

  it("사유가 없으면 「없음」", () => {
    expect(carryoverExclusionReasonLabel(undefined)).toBe("없음");
  });

  it("긍정 짝 — 이월과세가 성립하는 분기의 step은 시나리오 비교 문구 그대로", () => {
    const s = stepOf({ giftRegistryDate: new Date("2023-06-01") }, { acquisitionDate: new Date("2023-06-01") });
    expect(s.formula).toMatch(/^Scenario A\(결정세액 [\d,]+\) vs B\([\d,]+\) → [AB] 채택/);
  });
});
