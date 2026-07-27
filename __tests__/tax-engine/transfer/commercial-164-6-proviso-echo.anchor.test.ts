/**
 * anchor — §164⑥ 단서 판정 echo (`sec164_5ProvisoApplicable`).
 *
 * 이 플래그는 **산출 근거 표시 전용**이다. 취득당시 건물 기준시가가 실제로 §164⑤로 산정됐는지는
 * 엔진이 알 수 없으므로(준용에 필요한 신축연도·구조·용도가 엔진 input에 없다) **계산은 바뀌지 않는다.**
 * → 판정값만 검증하고, 같은 입력의 금액이 취득연도와 무관하게 동일함을 함께 못박는다.
 *
 * 취득연도는 API 신규 필드가 아니라 `TransferTaxInput.acquisitionDate`에서 파생된다.
 *
 * 계획서: docs/01-plan/features/commercial-164-6-proviso-164-5-application.plan.md §5-3
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateCommercialBuildingValuation } from "@/lib/tax-engine/commercial-building-valuation";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** C-01(pre_disclosure) 상가 — 취득일만 바꿔가며 판정을 본다. */
function preDisclosureInput(acquisitionDate: string): TransferTaxInput {
  return baseTransferInput({
    propertyType: "commercial_building",
    transferPrice: 1_000_000_000,
    transferDate: new Date("2021-06-01"),
    acquisitionDate: new Date(acquisitionDate),
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    useEstimatedAcquisition: true,
    transferCause: "general",
    commercialBuildingValuation: {
      isPreDisclosure: true,
      exclusiveArea: 150,
      commonArea: 50,
      landArea: 100,
      unitPriceAtTransfer: 2_500_000,
      unitPriceAtFirstDisclosure: 1_200_000,
      buildingStdPriceAtAcquisition: 120_000_000,
      buildingStdPriceAtFirstDisclosure: 150_000_000,
      landPriceAtAcquisition: 1_000_000,
      landPriceAtFirstDisclosure: 1_500_000,
      landPriceAtTransfer: 3_000_000,
    },
  });
}

function detailOf(acquisitionDate: string) {
  const r = calculateTransferTax(preDisclosureInput(acquisitionDate), rates);
  return r.commercialBuildingValuationDetail;
}

describe("§164⑥ 단서 판정 echo", () => {
  it("취득 1998 → 단서 해당(나목 가액 부재 구간)", () => {
    expect(detailOf("1998-05-10")?.sec164_5ProvisoApplicable).toBe(true);
  });

  it("경계 — 2000-12-31 해당 / 2001-01-01 미해당", () => {
    expect(detailOf("2000-12-31")?.sec164_5ProvisoApplicable).toBe(true);
    expect(detailOf("2001-01-01")?.sec164_5ProvisoApplicable).toBe(false);
  });

  it("2003 취득은 나목 가액이 있어 미해당", () => {
    expect(detailOf("2003-05-10")?.sec164_5ProvisoApplicable).toBe(false);
  });

  it("★ 판정은 계산을 바꾸지 않는다 — 취득연도가 달라도 환산 금액이 동일하다", () => {
    const a = detailOf("1998-05-10")!;
    const b = detailOf("2003-05-10")!;
    expect(a.estimatedBasisAtAcq).toBe(b.estimatedBasisAtAcq);
    expect(a.estimatedAcquisitionTotal).toBe(b.estimatedAcquisitionTotal);
    expect(a.estimatedDeductionTotal).toBe(b.estimatedDeductionTotal);
  });

  it("acquisitionYear 미지정 시 판정을 생략한다 (엔진 직접 호출)", () => {
    const r = calculateCommercialBuildingValuation(
      {
        isPreDisclosure: true,
        exclusiveArea: 150,
        commonArea: 50,
        landArea: 100,
        unitPriceAtTransfer: 2_500_000,
        unitPriceAtFirstDisclosure: 1_200_000,
        buildingStdPriceAtAcquisition: 120_000_000,
        buildingStdPriceAtFirstDisclosure: 150_000_000,
        landPriceAtAcquisition: 1_000_000,
        landPriceAtFirstDisclosure: 1_500_000,
      },
      1_000_000_000,
    );
    expect(r.sec164_5ProvisoApplicable).toBeUndefined();
  });

  it("C-02(post_disclosure)는 §164⑥ 경로가 아니므로 판정이 없다", () => {
    const r = calculateCommercialBuildingValuation(
      {
        isPreDisclosure: false,
        exclusiveArea: 150,
        commonArea: 50,
        landArea: 100,
        unitPriceAtTransfer: 2_500_000,
        unitPriceAtAcquisition: 1_000_000,
        acquisitionYear: 1998,
      },
      1_000_000_000,
    );
    expect(r.sec164_5ProvisoApplicable).toBeUndefined();
  });
});
