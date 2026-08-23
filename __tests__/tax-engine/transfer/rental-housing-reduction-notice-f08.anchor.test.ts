/**
 * anchor: §155⑳ 특례 경로가 조특법 감면을 **말없이 0으로 만들지 않는다** (F08)
 *
 * ## 무엇이 침묵이었나
 *
 * 거주주택 비과세 특례(「소득세법 시행령」 §155⑳) 경로는 `finalizeTransferTax`를 거치지 않아
 * `calcReductions`가 **아예 호출되지 않는다**. 그래서 사용자가 고른 감면이 **한 줄의 안내도 없이**
 * 0이 됐다.
 *
 * 실측(mock 세율 · 아래 픽스처): 같은 자산에서 특례를 끄면 조특법 §77 공익수용 감면
 * **80,660,250**이 잡힌다. 켜면 감면 0 · 경고 0건 · 감면 관련 step 0건이었다.
 *
 * ## 왜 「계산」이 아니라 「고지」인가
 *
 * | 조문 | 병용 |
 * |---|---|
 * | §99·§99의3 (신축주택) | 고가주택 **배제 단서가 명문** ⇒ 0이 정답 |
 * | §77·§97 시리즈·§97의5·§98의8·§99의2 | 배제 문언 **없음** ⇒ 감면 여지가 실재 |
 *
 * 그런데 병용 가부를 직접 판단한 **예규·심판례를 찾지 못했고**, 소득금액 차감형 감면을
 * 「소득세법 시행령」 §161 안분의 **앞/뒤 어디에 얹을지** 정한 명문도 없다.
 * ⇒ 근거가 확정될 때까지 **반영하지 않되, 반영하지 않았다는 사실을 표시**한다.
 *   침묵이 가장 나쁜 선택지다 — 사용자는 감면이 적용된 줄 안다.
 *
 * ⚠️ 이 anchor는 **세액이 움직이지 않음**도 함께 고정한다(F08-04). 고지는 계산이 아니다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

const rentalUnit = {
  businessRegistrationDate: D("2015-06-01"),
  rentalRegistrationDate: D("2015-06-01"),
  rentalCategory: "long_general" as const,
  rentalAcquisitionType: "purchase" as const,
  isApartment: false,
  region: "non-metro" as const,
  isExcluded918Rule: false,
  standardPriceAtRentalStart: 250_000_000,
  hasMinimum2Units: false,
  rentalMonths: 120,
  rentalAutoTermination: false,
  requirementsConfirmed: true,
};

const rheA = { applyException: true, scenario: "A" as const, rentalUnits: [rentalUnit] };

/** 조특법 §77 공익수용 — 배제 문언이 **없는** 조문 축의 대표 */
const EXPROPRIATION_REDUCTION = [
  {
    type: "public_expropriation" as const,
    cashCompensation: 2_000_000_000,
    bondCompensation: 0,
    bondHoldingYears: null,
    businessApprovalDate: D("2024-01-01"),
  },
];

function fixture(o: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    acquisitionDate: D("2018-01-01"),
    transferDate: D("2026-03-01"),
    residencePeriodMonths: 36,
    isOneHousehold: true,
    householdHousingCount: 1,
    expenses: 0,
    annualBasicDeductionUsed: 0,
    // 고가주택이라 과세분이 남는다 — 전액 비과세면 감면 소실 자체를 관측할 수 없다
    transferPrice: 2_000_000_000,
    acquisitionPrice: 400_000_000,
    ...o,
  } as Partial<TransferTaxInput>);
}

const NOTICE = /감면 1건은 이 계산에 반영되지 않았습니다/;

describe("F08 · §155⑳ × 조특법 감면 — 미반영 고지", () => {
  it("F08-01: 감면을 골랐으면 경고와 step으로 **미반영 사실**을 알린다", () => {
    const r = calculateTransferTax(
      fixture({ rentalHousingException: rheA, reductions: EXPROPRIATION_REDUCTION }),
      rates,
    );
    expect(r.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(r.warnings ?? []).toHaveLength(1);
    expect((r.warnings ?? [])[0]).toMatch(NOTICE);
    // 명문 배제 조문과 그 밖의 조문을 구분해 적는다 — 「전부 안 된다」로 읽히면 오해다
    expect((r.warnings ?? [])[0]).toMatch(/§99·§99의3/);
    expect(r.steps.some((s) => s.label === "조특법 감면 — 미반영")).toBe(true);
  });

  it("F08-02: 감면을 고르지 않았으면 아무 말도 하지 않는다 (노이즈 금지)", () => {
    const r = calculateTransferTax(fixture({ rentalHousingException: rheA }), rates);
    expect(r.warnings ?? []).toHaveLength(0);
    expect(r.steps.some((s) => s.label === "조특법 감면 — 미반영")).toBe(false);
  });

  it("F08-03: 대조군 — 특례를 끄면 같은 감면이 실제로 잡힌다", () => {
    const r = calculateTransferTax(
      fixture({
        householdHousingCount: 2,
        isOneHousehold: false,
        reductions: EXPROPRIATION_REDUCTION,
      }),
      rates,
    );
    expect(r.reductionTypeApplied).toBe("public_expropriation");
    expect(r.reductionAmount).toBe(80_660_250);
  });

  it("F08-04: 고지는 세액을 바꾸지 않는다", () => {
    const withReduction = calculateTransferTax(
      fixture({ rentalHousingException: rheA, reductions: EXPROPRIATION_REDUCTION }),
      rates,
    );
    const without = calculateTransferTax(fixture({ rentalHousingException: rheA }), rates);
    expect(withReduction.determinedTax).toBe(without.determinedTax);
    expect(withReduction.determinedTax).toBe(116_420_000);
    expect(withReduction.reductionAmount ?? 0).toBe(0);
  });
});
