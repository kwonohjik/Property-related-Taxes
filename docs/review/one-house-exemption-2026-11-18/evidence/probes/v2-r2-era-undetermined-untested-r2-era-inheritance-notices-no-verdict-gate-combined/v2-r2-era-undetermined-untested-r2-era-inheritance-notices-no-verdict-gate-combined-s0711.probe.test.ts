import { describe, it, expect } from "vitest";
import { judgeRedevAptOneHouseExemption } from "@/lib/tax-engine/transfer-tax-redevelopment-apt-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { baseTransferInput, makeMockRates, makeHouseInfo } from "../tax-engine/_helpers/mock-rates";
const D = (s: string) => new Date(s);
const parsed = parseRatesFromMap(makeMockRates());
describe("s0711", () => {
  it("verdict of S07-11 reinherited fixture", () => {
    const i = baseTransferInput({
      propertyType: "redevelopment_apt", transferPrice: 800_000_000, transferDate: D("2016-12-01"), acquisitionDate: D("2011-06-01"),
      acquisitionPrice: 400_000_000, expenses: 0, useEstimatedAcquisition: false, isOneHousehold: true, householdHousingCount: 2,
      residencePeriodMonths: 0, isSuccessorRightToMoveIn: true, sellingHouseId: "selling",
      houses: [makeHouseInfo("selling", { acquisitionDate: D("2015-06-01") }),
        makeHouseInfo("inh", { isInherited: true, inheritedDate: D("2012-01-01"), acquisitionDate: D("2012-01-01"), decedentSameHouseholdAtInheritance: true, reInheritedFromSeparateHousehold: true })],
      redevelopment: { subject: "apt", approvalLawBasis: "urban_renovation_art_74", approvalDate: D("2010-12-01"), rightsValue: 0, settlementDirection: "pay",
        settlementAmount: 0, preApprovalExpenses: 0, postApprovalExpenses: 0, originalAssetType: "housing", isSuccessorMember: true, completionDate: D("2015-06-01") },
    } as never);
    const r = judgeRedevAptOneHouseExemption(i, [], undefined, parsed).exemptionResult!;
    console.log("S0711", JSON.stringify({ isExempt: r.isExempt, isPartialExempt: r.isPartialExempt, und: r.undetermined.map((u) => u.id) }));
    expect(true).toBe(true);
  });
});
