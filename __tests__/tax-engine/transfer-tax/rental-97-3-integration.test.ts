// §97의3 풀 파이프라인 통합 anchor — plan §6 P2 B-1 (법정 산식 직접 계산, 35% 구간 검산 완료)
//
// 시나리오: 2주택자(비조정— 중과 없음)가 장기일반민간임대 등록 주택(취득 즉시 임대) 10년 임대 후 양도.
//   양도가 8억 − 취득가 3억 = 양도차익 5억
//   장특공제 (§97의3 특례 70%·ratio=1) = 350,000,000
//   양도소득금액 = 150,000,000 → 기본공제 §103 250만 → 과세표준 147,500,000
//   산출세액 (§55: 8,800만 초과~1.5억 이하 35%·누진공제 15,440,000) = 36,185,000
//   §97의3은 세액감면 아님 → reductionAmount = 0
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

describe("§97의3 통합 anchor (B-1)", () => {
  const rates = makeMockRates();

  function input973() {
    return baseTransferInput({
      propertyType: "housing",
      transferPrice: 800_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2014-01-01"),
      transferDate: new Date("2024-06-01"),
      isOneHousehold: true,
      householdHousingCount: 2, // 거주주택 + 임대주택 — 12억 비과세 미적용
      isRegulatedArea: false,
      residencePeriodMonths: 0,
      reductions: [
        {
          type: "rental_97_3",
          registrationDate: new Date("2014-01-01"),
          rentalStartDate: new Date("2014-01-01"),
          isTaxRegistered: true,
          rentIncreaseViolated: false,
          officialPriceAtStart: 400_000_000,
          isNationalHousingScale: true,
          region: "capital",
          propertyType: "non_apartment",
          rentalHousingType: "long_term_private",
          isConvertedFromShortTerm: false,
        },
      ],
    });
  }

  it("B-1: 장특공제 3.5억 (70%)·과세표준 147,500,000·산출세액 36,185,000·감면 0", () => {
    const result = calculateTransferTax(input973(), rates);

    expect(result.isExempt).toBe(false);
    expect(result.transferGain).toBe(500_000_000);
    expect(result.longTermHoldingDeduction).toBe(350_000_000);
    expect(result.longTermHoldingRate).toBeCloseTo(0.7, 10);
    expect(result.taxBase).toBe(147_500_000);
    expect(result.calculatedTax).toBe(36_185_000);
    // §97의3은 장특공제율 특례 — 세액감면 아님
    expect(result.reductionAmount).toBe(0);
    // echo 필드
    expect(result.rental97LthdDetail?.isEligible).toBe(true);
  });

  it("B-1 대조군: §97의3 미적용 시 장특 일반율 (10년 보유 표1 20%) → 공제 1억", () => {
    const noReduction = { ...input973(), reductions: [] };
    const result = calculateTransferTax(noReduction, rates);
    expect(result.longTermHoldingDeduction).toBe(100_000_000); // 5억 × 10년 × 2%
    expect(result.rental97LthdDetail).toBeUndefined();
  });

  it("불적격 (기준시가 6억 초과) → 특례 미적용·일반율 + 사유 echo", () => {
    const base = input973();
    const ineligible = {
      ...base,
      reductions: [{ ...base.reductions[0], officialPriceAtStart: 700_000_000 } as (typeof base.reductions)[0]],
    };
    const result = calculateTransferTax(ineligible, rates);
    expect(result.longTermHoldingDeduction).toBe(100_000_000); // 일반율 20%
    expect(result.rental97LthdDetail?.isEligible).toBe(false);
  });
});
