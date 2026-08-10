/**
 * RS: 이월과세 대상 **관계** 범위 (「소득세법」 §97조의2 ① 본문)
 *
 * > 그 **배우자** … 또는 **직계존비속**으로부터 증여받은 … 자산의 양도차익을 계산할 때
 *
 * 그 둘만 대상이다. 형제·친족·타인으로부터 증여받은 자산은 §97의2①이 아예 적용되지 않는다.
 * 종전에는 관계 필드가 판정에 쓰이지 않아, 사용자가 취득원인을 「이월과세(증여)」로 고르면
 * **관계와 무관하게** 이월과세가 걸렸다 — §97의2②3호 MAX 때문에 **과대과세** 방향이다.
 *
 * ⚠️ 「대상 자산」 축은 갭이 없다(확인 완료). 시행령 §163의2①이 §94①**2호가목**(분양권·입주권)과
 *    **4호나목**(시설물 이용권)을 추가로 정하고 있어, 법 §94①1호·3호와 합치면 이 앱이 다루는
 *    자산종류는 전부 대상이다. ⇒ 이번 범위는 **관계 축만**이다.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { CarryoverTaxationInput } from "@/lib/tax-engine/types/transfer-carryover.types";

const MOCK_RATES = makeMockRates();

/** DD anchor와 같은 픽스처 — 적용되면 A(169,060,000), 배제되면 B(79,430,000). */
function makeInput(carryover: Partial<CarryoverTaxationInput>) {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_000_000_000,
    transferDate: new Date("2030-05-31"),
    acquisitionPrice: 700_000_000,
    acquisitionDate: new Date("2010-01-01"),
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    reductions: [],
    annualBasicDeductionUsed: 0,
    acquisitionCause: "carryover_gift",
    carryoverTaxation: {
      giftRegistryDate: new Date("2023-06-01"),
      donorAcquisitionDate: new Date("2010-01-01"),
      useEstimatedAcquisition: false,
      donorAcquisitionPrice: 300_000_000,
      giftTaxAmount: 0,
      giftDateValuation: 700_000_000,
      ...carryover,
    },
  });
}

describe("RS: 「그 외」 관계는 §97의2① 대상이 아니다", () => {
  it("RS-01: donorRelation='other' → relation_invalid로 배제", () => {
    const r = calculateTransferTax(makeInput({ donorRelation: "other" }), MOCK_RATES);
    expect(r.carryoverTaxationDetail?.isEligible).toBe(false);
    expect(r.carryoverTaxationDetail?.exclusionReason).toBe("relation_invalid");
  });

  it("RS-02: 사망 여부와 **무관**하게 배제된다 (① 요건 불충족이지 ② 배제사유가 아니다)", () => {
    const r = calculateTransferTax(
      makeInput({ donorRelation: "other", donorDeceased: false }),
      MOCK_RATES,
    );
    expect(r.carryoverTaxationDetail?.exclusionReason).toBe("relation_invalid");
  });

  it("RS-03: 결정세액이 「미적용」 값으로 확정 (MAX를 타지 않는다)", () => {
    const r = calculateTransferTax(makeInput({ donorRelation: "other" }), MOCK_RATES);
    expect(r.determinedTax).toBe(79_430_000);
  });

  it("RS-04: 배우자는 그대로 **적용**된다 [양성 대조군]", () => {
    const r = calculateTransferTax(makeInput({ donorRelation: "spouse" }), MOCK_RATES);
    expect(r.carryoverTaxationDetail?.isEligible).toBe(true);
    expect(r.determinedTax).toBe(169_060_000);
  });

  it("RS-05: 직계존비속도 그대로 **적용**된다 [양성 대조군]", () => {
    const r = calculateTransferTax(makeInput({ donorRelation: "lineal" }), MOCK_RATES);
    expect(r.carryoverTaxationDetail?.isEligible).toBe(true);
    expect(r.determinedTax).toBe(169_060_000);
  });

  it("RS-06: 관계 미선택은 종전대로 **적용**된다 [회귀 — 구형 입력 보호]", () => {
    const r = calculateTransferTax(makeInput({}), MOCK_RATES);
    expect(r.carryoverTaxationDetail?.isEligible).toBe(true);
    expect(r.determinedTax).toBe(169_060_000);
  });
});
