// 그룹 K — §98의6 2호 결과 카드: 인정 임대기간 echo(⑦)와 등록 기한 사유가 보인다
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IncomeDeductionDetailCard } from "@/components/calc/results/transfer/IncomeDeductionDetailCard";
import { evaluateUnsold986 } from "@/lib/tax-engine/transfer-reductions/unsold-98-6";

const D = (s: string) => new Date(s);
const base = {
  transferDate: D("2018-12-31"),
  acquisitionDate: D("2011-11-01"),
  hoType: "buyer_rented" as const,
  stdPriceSumAtBase: 400_000_000,
  floorAreaSqm: 84,
  isUnsoldAfterCompletion: true,
  isFirstContract: true,
  isNotOccupiedAfterCompletion: true,
  isNotRecontract: true,
  rentalContractDate: D("2011-11-15"),
  rentalStartDate: D("2011-12-01"),
  businessRegistrationDate: D("2011-11-20"),
  rentalRegistrationDate: D("2011-11-25"),
  transferIncome: 100_000_000,
  standardPriceAtAcquisition: 200_000_000,
  standardPriceAt5Years: 300_000_000,
  standardPriceAtTransfer: 400_000_000,
};

describe("§98의6 2호 결과 카드", () => {
  it("적격: 「임대기간 N개월(기산일, 공실 M개월 제외)」", () => {
    const result = evaluateUnsold986({ ...base, rentalVacancies: [{ startDate: D("2014-01-01"), endDate: D("2014-12-31") }] });
    render(<IncomeDeductionDetailCard kind="unsold_98_6" result={result} calculatedTax={0} />);
    expect(screen.getByTestId("unsold986-rental-period").textContent).toBe("임대기간 73개월(기산일 2011-12-01, 공실 12개월 제외)");
  });

  it("부적격: 2012.1.1. 이후 등록 사유가 카드에 보인다", () => {
    const result = evaluateUnsold986({ ...base, rentalRegistrationDate: D("2012-01-01") });
    render(<IncomeDeductionDetailCard kind="unsold_98_6" result={result} calculatedTax={0} />);
    expect(screen.getByText(/임대사업자등록이 2012\.1\.1\. 이후에 이뤄졌습니다/)).toBeTruthy();
  });
});
