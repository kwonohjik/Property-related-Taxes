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
  // 취득 순서 「일반(2014) → 준공후미분양(2024-02) → 농어촌(2024-04)」 (D4-01).
  // 농어촌을 미분양보다 먼저 취득하면 미분양 취득 시점에 2주택이 되어 §98의9①의
  // 「1주택을 보유한 1세대」가 성립하지 않는다 — 종전 픽스처는 이 점에서 모순이었다.
  ruralHouseAcquisitionDate: new Date("2024-04-01"),
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

  it("B-4: §99의4 + §98의9 동시 적격 → 각각 1채씩 제외 · 3 → 1채 → 비과세 (D4-01)", () => {
    const r = calculateTransferTax(
      input989({
        householdHousingCount: 3, // 종전 + 농어촌 + 미분양 — 제외 2채
        reductions: [RURAL_REDUCTION, UNSOLD_REDUCTION],
      }),
      rates,
    );
    expect(r.new994Detail?.isEligible).toBe(true);
    expect(r.unsold989Detail?.isEligible).toBe(true);
    if (r.unsold989Detail?.isEligible) {
      expect(r.unsold989Detail.dualExclusionApplied).toBe(true);
    }
    // 두 조문 step이 모두 남는다 (근거 표시)
    expect(r.steps.some((s) => s.label.includes("§99의4"))).toBe(true);
    expect(r.steps.some((s) => s.label.includes("§98의9"))).toBe(true);
    // 유효 주택수 3 − 2 = 1 → 1세대1주택 · 양도가 10억 ≤ 12억 → 전액 비과세
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });
});
