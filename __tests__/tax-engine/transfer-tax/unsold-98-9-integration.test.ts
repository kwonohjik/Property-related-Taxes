// §98의9 풀 파이프라인 통합 anchor (B-1~B-4)
//
// 2주택자(종전주택 + 수도권 밖 준공후미분양 적격)가 종전주택 양도 — §99의4와 동일
// 주입 경로(비과세·12억 안분·표2). B-2는 §99의4 B-2와 입력 동형 → 산출세액 4,365,000 재사용 검증.
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const UNSOLD_REDUCTION = {
  type: "unsold_98_9" as const,
  unsoldHouseAcquisitionDate: new Date("2024-02-01"),
  unsoldHouseAcquisitionPrice: 500_000_000,
  unsoldHouseExclusiveArea: 84,
  isNonCapitalRegion: true,
  wasOneHouseholdAtAcquisition: true,
  meetsSellerAndContractRequirement: true,
};

const RURAL_REDUCTION = {
  type: "new_99_4_rural" as const,
  ruralHouseAcquisitionDate: new Date("2015-03-01"),
  ruralHouseStdPrice: 200_000_000,
  isRegisteredHanok: false,
  isAdjacentArea: false,
  meetsLocationRequirement: true,
};

describe("§98의9 통합 anchor", () => {
  const rates = makeMockRates();

  function input989(overrides?: Partial<ReturnType<typeof baseTransferInput>>) {
    return baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_000_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: new Date("2014-01-01"),
      transferDate: new Date("2024-06-01"),
      isOneHousehold: true,
      householdHousingCount: 2, // 종전 + 미분양
      isRegulatedArea: false,
      residencePeriodMonths: 120,
      reductions: [UNSOLD_REDUCTION],
      ...overrides,
    });
  }

  it("B-1: 양도 10억(12억 이하)·2주택(미분양 적격) → 비과세 0원 + §98의9 step·echo", () => {
    const r = calculateTransferTax(input989(), rates);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
    expect(r.unsold989Detail?.isEligible).toBe(true);
    expect(r.steps.some((s) => s.label.includes("§98의9"))).toBe(true);
  });

  it("B-2: 양도 15억·거주 10년 → 12억 안분 + 표2 80% — 산출세액 4,365,000 (§99의4 B-2 동형)", () => {
    const r = calculateTransferTax(input989({ transferPrice: 1_500_000_000 }), rates);
    expect(r.isExempt).toBe(false);
    expect(r.taxableGain).toBe(200_000_000);
    expect(r.longTermHoldingRate).toBeCloseTo(0.8, 10);
    expect(r.longTermHoldingDeduction).toBe(160_000_000);
    expect(r.taxBase).toBe(37_500_000);
    expect(r.calculatedTax).toBe(4_365_000);
  });

  it("B-3: 대조군 — reductions=[] → 2주택 과세·표1", () => {
    const r = calculateTransferTax(input989({ reductions: [] }), rates);
    expect(r.isExempt).toBe(false);
    expect(r.unsold989Detail).toBeUndefined();
    expect(r.taxableGain).toBe(500_000_000);
    expect(r.longTermHoldingRate).toBeCloseTo(0.2, 10);
  });

  it("B-4: §99의4 + §98의9 동시 적격 → §99의4 우선 step + §98의9 경고 echo (F-4)", () => {
    const r = calculateTransferTax(
      input989({
        householdHousingCount: 3, // 종전 + 농어촌 + 미분양 (제외는 1채만 — F-4)
        reductions: [RURAL_REDUCTION, UNSOLD_REDUCTION],
      }),
      rates,
    );
    // §99의4 우선 — count 3 − 1 = 2 → 비과세 아님 (일시적 2주택 미해당)
    expect(r.isExempt).toBe(false);
    expect(r.steps.some((s) => s.label.includes("§99의4"))).toBe(true);
    expect(r.steps.some((s) => s.label.includes("§98의9"))).toBe(false);
    expect(r.new994Detail?.isEligible).toBe(true);
    expect(r.unsold989Detail?.isEligible).toBe(true);
    if (r.unsold989Detail?.isEligible) {
      expect(r.unsold989Detail.dualExclusionWarning).toBe(true);
    }
  });
});
