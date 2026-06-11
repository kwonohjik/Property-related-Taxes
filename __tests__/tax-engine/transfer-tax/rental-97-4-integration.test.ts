// §97의4 통합 anchor (R-3 활성) — 장특공제 추가율 가산
//
// 효과: §95② 보유기간별 공제율에 임대기간별 추가율(6년 2%~10년 10%)을 "가산" (대체 아님).
// 가산 방식이므로 mock 표1 율에 무관하게 "일반율 + 추가율" 상대 비교로 anchor.
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

describe("§97의4 통합 anchor (R-3 활성)", () => {
  const rates = makeMockRates();

  function input974() {
    return baseTransferInput({
      propertyType: "housing",
      transferPrice: 800_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2016-01-01"),
      transferDate: new Date("2024-06-01"), // 보유 8.4년
      isOneHousehold: true,
      householdHousingCount: 2, // 12억 비과세 미적용
      isRegulatedArea: false,
      residencePeriodMonths: 0,
      reductions: [
        {
          type: "rental_97_4",
          registrationDate: new Date("2016-03-01"),
          rentalStartDate: new Date("2016-03-01"), // 임대 8.25년 → 추가율 6%
          isTaxRegistered: true,
          rentIncreaseViolated: false,
          region: "capital",
        },
      ],
    });
  }

  it("8년 임대 → 일반 장특율 + 추가율 6% 가산 (양도차익 5억 × 6% = 3천만 증가)", () => {
    const withR = calculateTransferTax(input974(), rates);
    const without = calculateTransferTax({ ...input974(), reductions: [] }, rates);

    expect(withR.rental97LthdDetail?.isEligible).toBe(true);
    expect((withR.rental97LthdDetail as { additionalRate?: number }).additionalRate).toBe(0.06);
    // 가산: 일반 공제율 + 0.06
    expect(withR.longTermHoldingRate).toBeCloseTo(without.longTermHoldingRate + 0.06, 10);
    // 양도차익 5억 × 6% = 30,000,000 추가 공제 (표1 율은 2% 배수 → floor 영향 없음)
    expect(withR.longTermHoldingDeduction).toBe(without.longTermHoldingDeduction + 30_000_000);
    expect(without.rental97LthdDetail).toBeUndefined();
  });

  it("10년 임대 → 추가율 10% 가산", () => {
    const base = input974();
    const tenYear = {
      ...base,
      acquisitionDate: new Date("2013-01-01"),
      reductions: [{ ...base.reductions[0], rentalStartDate: new Date("2013-06-01") } as (typeof base.reductions)[0]],
    };
    const withR = calculateTransferTax(tenYear, rates);
    expect((withR.rental97LthdDetail as { additionalRate?: number }).additionalRate).toBe(0.10);
  });

  it("5년 임대 → 6년 미달 불적용 (추가율 0)", () => {
    const base = input974();
    const fiveYear = {
      ...base,
      transferDate: new Date("2021-06-01"), // 임대 5년
      reductions: [{ ...base.reductions[0] } as (typeof base.reductions)[0]],
    };
    const r = calculateTransferTax(fiveYear, rates);
    expect(r.rental97LthdDetail?.isEligible).toBe(false);
  });
});
