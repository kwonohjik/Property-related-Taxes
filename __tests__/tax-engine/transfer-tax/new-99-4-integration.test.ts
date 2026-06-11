// §99의4 풀 파이프라인 통합 anchor (B-1~B-6)
//
// 시나리오: 2주택자(일반주택 + 농어촌주택 적격)가 일반주택 양도.
// §99의4 적용 시 농어촌주택을 소유주택에서 제외 → 1세대1주택으로 보아
// §89①3호(비과세·12억 안분) + LTHD 표2(소령 §159의4) 적용.
// 산출세액 anchor는 양도연도(2024) §55 법정 누진세율 직접 계산.
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const RURAL_REDUCTION = {
  type: "new_99_4_rural" as const,
  ruralHouseAcquisitionDate: new Date("2015-03-01"),
  ruralHouseStdPrice: 200_000_000,
  isRegisteredHanok: false,
  isAdjacentArea: false,
  meetsLocationRequirement: true,
};

describe("§99의4 통합 anchor", () => {
  const rates = makeMockRates();

  function input994(overrides?: Partial<ReturnType<typeof baseTransferInput>>) {
    return baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_000_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: new Date("2014-01-01"),
      transferDate: new Date("2024-06-01"), // 보유 10년
      isOneHousehold: true,
      householdHousingCount: 2, // 일반 + 농어촌
      isRegulatedArea: false,
      residencePeriodMonths: 120, // 거주 10년 (표2)
      reductions: [RURAL_REDUCTION],
      ...overrides,
    });
  }

  it("B-1: 양도 10억(12억 이하)·2주택(농어촌 적격) → 1세대1주택 비과세 0원 + 카드 echo", () => {
    const r = calculateTransferTax(input994(), rates);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
    expect(r.new994Detail?.isEligible).toBe(true);
    // §99의4 제외 step 표시
    expect(r.steps.some((s) => s.label.includes("§99의4"))).toBe(true);
  });

  it("B-2: 양도 15억·거주 10년 → 고가주택 12억 안분 + 표2 80% — 산출세액 4,365,000 (원단위)", () => {
    const r = calculateTransferTax(input994({ transferPrice: 1_500_000_000 }), rates);
    expect(r.isExempt).toBe(false);
    expect(r.new994Detail?.isEligible).toBe(true);
    // 양도차익 10억 × (15억−12억)/15억 = 200,000,000
    expect(r.taxableGain).toBe(200_000_000);
    // 표2: 보유 10년×4% + 거주 10년×4% = 80% → 공제 160,000,000
    expect(r.longTermHoldingRate).toBeCloseTo(0.8, 10);
    expect(r.longTermHoldingDeduction).toBe(160_000_000);
    // 과세표준 = 40,000,000 − 2,500,000 = 37,500,000
    expect(r.taxBase).toBe(37_500_000);
    // §55 (1,400만~5,000만 15%·누진공제 1,260,000) = 5,625,000 − 1,260,000 = 4,365,000
    expect(r.calculatedTax).toBe(4_365_000);
  });

  it("B-3: 대조군 — reductions=[] → 2주택 과세 (numeric 영향 실증)", () => {
    const r = calculateTransferTax(input994({ reductions: [] }), rates);
    expect(r.isExempt).toBe(false);
    expect(r.new994Detail).toBeUndefined();
    // 2주택 → 비과세·12억 안분·표2 전부 미적용: 전체 차익 5억 과세 + 표1
    expect(r.taxableGain).toBe(500_000_000);
    expect(r.longTermHoldingRate).toBeCloseTo(0.2, 10); // 표1 10년 20%
  });

  it("B-4: 3주택(일반+신규+농어촌) + 일시적 2주택 → 농어촌 제외 후 E-3 결합 비과세", () => {
    const r = calculateTransferTax(
      input994({
        householdHousingCount: 3,
        temporaryTwoHouse: {
          previousAcquisitionDate: new Date("2014-01-01"), // 종전(양도) 주택 — 2년+ 보유
          newAcquisitionDate: new Date("2023-01-01"),      // 신규 취득 후 3년 내 양도
        },
      }),
      rates,
    );
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toContain("일시적 2주택");
    expect(r.new994Detail?.isEligible).toBe(true);
  });

  it("B-5: 양도 15억·거주 1년(2년 미만) → 부분과세 + 표1 (표2 거주요건 분기) — 39,910,000", () => {
    const r = calculateTransferTax(
      input994({ transferPrice: 1_500_000_000, residencePeriodMonths: 12 }),
      rates,
    );
    expect(r.isExempt).toBe(false);
    expect(r.taxableGain).toBe(200_000_000);
    // 표1: 보유 10년 → 20% (거주 2년 미만 — 표2 미적용)
    expect(r.longTermHoldingRate).toBeCloseTo(0.2, 10);
    expect(r.longTermHoldingDeduction).toBe(40_000_000);
    // 과세표준 = 160,000,000 − 2,500,000 = 157,500,000
    expect(r.taxBase).toBe(157_500_000);
    // §55 (1.5억~3억 38%·누진공제 19,940,000) = 59,850,000 − 19,940,000 = 39,910,000
    expect(r.calculatedTax).toBe(39_910_000);
  });

  it("B-6: 조정대상지역 2주택 + §99의4 적격 + 12억 이하 → 비과세 우선 (중과 이전 STEP 1a)", () => {
    // §99의4 의제로 1세대1주택 비과세가 중과 판정보다 먼저 적용됨을 고정.
    // (중과 주택수 자체는 원본 유지 — R-D. §167의3 농어촌 제외 여부 확인 후 후속)
    const r = calculateTransferTax(input994({ isRegulatedArea: true }), rates);
    expect(r.isExempt).toBe(true);
    expect(r.new994Detail?.isEligible).toBe(true);
  });
});
