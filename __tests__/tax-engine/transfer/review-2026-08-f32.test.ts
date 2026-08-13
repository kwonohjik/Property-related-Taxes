/**
 * F32 — 조특법 §77의2(대토보상)·§77의3(개발제한구역 매수대상) 감면 detail이 단건 결과에 실려야 한다.
 *
 * `finalizeTransferTax`는 `gbDesignatedLandDetail`·`replacementLandDetail`을 `FinalizeResult`
 * **필수 필드**로 돌려주는데, `transfer-tax.ts` 오케스트레이터의 구조분해·return 객체가 그 두 키만
 * 빠뜨려 결과에 실리지 않았다. `TransferTaxResult`에서 optional이라 TypeScript가 잡지 못한다.
 * 그 결과 `ReductionDetailCards`·다건 breakdown(`transfer-tax-aggregate-pickers.ts`)·
 * 별지84호 부표2 ⑲(`FilingFormTableHelpers.ts`)·상세명세서가 전부 undefined를 받았다.
 *
 * 세액은 불변이다(감면 자체는 이미 적용되고 있었다) — 소실된 것은 **산출근거와 ⑲ 표시값**이다.
 * 기대값은 전부 엔진을 실제로 호출해 관측한 값이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { reductionEligibleIncome } from "@/components/calc/results/transfer/reduction-eligible-income";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();

/** 토지 10억(2010-01-01 취득 3억 → 2024-06-01 양도) — 두 시나리오 공통 */
const landBase = {
  propertyType: "land" as const,
  isOneHousehold: false,
  householdHousingCount: 0,
  transferPrice: 1_000_000_000,
  acquisitionPrice: 300_000_000,
  acquisitionDate: new Date("2010-01-01"),
  transferDate: new Date("2024-06-01"),
};

describe("F32 — §77의2·§77의3 감면 detail이 단건 결과에 실린다", () => {
  it("§77의2 대토보상: replacementLandDetail이 결과에 존재한다 (세액 불변)", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        ...landBase,
        reductions: [
          {
            type: "replacement_land_comp",
            cashCompensation: 500_000_000,
            replacementLandComp: 500_000_000,
            businessApprovalDate: new Date("2023-06-01"),
          },
        ],
      }),
      mockRates,
    );

    // 감면 자체는 종전에도 적용됐다 — 이 값들이 바뀌면 수정이 세액을 건드린 것이다.
    expect(r.reductionTypeApplied).toBe("replacement_land_comp");
    expect(r.reductionAmount).toBe(35_112_167);
    expect(r.determinedTax).toBe(139_577_833);
    expect(r.totalTax).toBe(153_535_616);

    // 본체: detail이 실제로 실린다.
    expect(r.replacementLandDetail).toBeDefined();
    expect(r.replacementLandDetail!.isEligible).toBe(true);
    expect(r.replacementLandDetail!.replacementRatio).toBe(0.5);
    expect(r.replacementLandDetail!.eligibleTransferIncome).toBe(252_000_000);
    expect(r.replacementLandDetail!.reducibleIncome).toBe(100_800_000);
    expect(r.replacementLandDetail!.reductionAmount).toBe(35_112_167);
  });

  it("§77의2: 별지84호 부표2 ⑲ 세액감면대상금액이 감면율 곱값이 아닌 감면대상 소득금액이 된다", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        ...landBase,
        reductions: [
          {
            type: "replacement_land_comp",
            cashCompensation: 500_000_000,
            replacementLandComp: 500_000_000,
            businessApprovalDate: new Date("2023-06-01"),
          },
        ],
      }),
      mockRates,
    );

    const fullTransferIncome = r.taxableGain - r.longTermHoldingDeduction;
    const cell19 = reductionEligibleIncome(
      r.reductionTypeApplied,
      fullTransferIncome,
      r.reducibleIncome ?? 0,
      r.replacementLandDetail?.eligibleTransferIncome,
    );
    // 배선 전에는 4번째 인자가 undefined라 reducibleIncome(감면율 40% 곱값) 100,800,000으로 떨어졌다.
    expect(cell19).toBe(252_000_000);
    expect(cell19).not.toBe(100_800_000);
  });

  it("§77의3 개발제한구역: gbDesignatedLandDetail이 결과에 존재한다 (세액 불변)", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        ...landBase,
        reductions: [
          {
            type: "gb_designated_land",
            branch: "in_zone",
            designationDate: new Date("2015-01-01"),
            triggerDate: new Date("2024-01-01"),
            residedFromAcqToTrigger: true,
          },
        ],
      }),
      mockRates,
    );

    expect(r.reductionTypeApplied).toBe("gb_designated_land");
    expect(r.reductionAmount).toBe(69_876_000);
    expect(r.determinedTax).toBe(104_814_000);
    expect(r.totalTax).toBe(115_295_400);

    expect(r.gbDesignatedLandDetail).toBeDefined();
    expect(r.gbDesignatedLandDetail!.isEligible).toBe(true);
    expect(r.gbDesignatedLandDetail!.appliedClause).toBe("1호");
    expect(r.gbDesignatedLandDetail!.reducibleIncome).toBe(200_600_000);
    expect(r.gbDesignatedLandDetail!.reductionAmount).toBe(69_876_000);
  });
});
