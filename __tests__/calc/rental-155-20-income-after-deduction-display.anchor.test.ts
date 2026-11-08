/**
 * 표시 — §155⑳ 거주주택 특례 경로의 「감면후 소득금액」은 과세대상 양도소득금액(§161 안분 후)에서 소득금액 감면대상을 뺀 값이다.
 *
 * 종전: 두 표시 헬퍼(상세 명세 `DetailedStatementHelpers` · 신고서 표 `FilingFormTableHelpers`)가 이 경로에서 `result.taxableGain`
 * (엔진이 차감 **전** 값으로 싣는다 — `transfer-tax-rental-housing-step.ts` 결과 조립)을 그대로 적어, 차감이 있으면
 * 「소득금액 감면대상 36,000,000」 바로 아래 「감면후 소득금액 72,000,000」이 나와 과세표준 + 기본공제와 어긋났다
 * (2026-11-08 브라우저 확인 — §98의5 · US-43). §99·§99의3(NH-37)도 같은 분기를 탔다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";

const D = (s: string) => new Date(s);
const R985 = {
  type: "unsold_98_5", contractDate985: D("2010-06-15"), priceReductionRatePct985: 25, isNonCapitalUnsoldAtCutoff985: true,
  isFirstContract985: true, isNotOccupiedAtContract985: true, isNotRecontract985: true,
  standardPriceAtAcquisition985: 400_000_000, standardPriceAt5Years985: 600_000_000, standardPriceAtTransfer985: 800_000_000,
};
const unit = {
  businessRegistrationDate: D("2018-06-01"), rentalRegistrationDate: D("2018-06-01"), rentalCategory: "long_general" as const,
  rentalAcquisitionType: "purchase" as const, isApartment: false, region: "non-metro" as const, isExcluded918Rule: false,
  standardPriceAtRentalStart: 250_000_000, hasMinimum2Units: false, rentalMonths: 120, rentalAutoTermination: false, requirementsConfirmed: true,
};
const calc = (reductions: unknown[]) =>
  calculateTransferTax(
    baseTransferInput({
      propertyType: "housing", acquisitionDate: D("2010-07-01"), transferDate: D("2024-06-01"), residencePeriodMonths: 60,
      isOneHousehold: true, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0, transferPrice: 1_500_000_000,
      acquisitionPrice: 600_000_000, reductions, rentalHousingException: { applyException: true, scenario: "A", rentalUnits: [unit] },
    } as never),
    makeMockRates(),
  );
const filingAfter = (r: ReturnType<typeof calc>) =>
  buildRows(r, "single").find((row) => row.label.includes("감면후 소득금액"))?.values.total;

describe("§155⑳ 경로 「감면후 소득금액」 = 과세대상 양도소득금액 − 소득금액 감면대상", () => {
  it("§98의5 차감 36,000,000: 72,000,000 − 36,000,000 = 36,000,000 = 과세표준 + 기본공제", () => {
    const r = calc([R985]);
    expect(r.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(r.taxableGain).toBe(72_000_000);
    const item = buildStatementItems(r, undefined, undefined, undefined, undefined).get("incomeAmountAfter");
    expect(item?.value).toBe(36_000_000);
    expect(item?.formula).toContain("− 소득금액 감면대상 36,000,000");
    expect(filingAfter(r)).toBe(36_000_000);
    expect(r.taxBase + r.basicDeduction).toBe(36_000_000);
  });
  it("짝: 감면 없음이면 종전과 같다(과세대상 양도소득금액 그대로)", () => {
    const r = calc([]);
    const item = buildStatementItems(r, undefined, undefined, undefined, undefined).get("incomeAmountAfter");
    expect(item?.value).toBe(r.taxableGain);
    expect(item?.formula).toContain("세액감면방식 소득금액 미차감");
    expect(filingAfter(r)).toBe(r.taxableGain);
  });
});
