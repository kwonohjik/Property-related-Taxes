/**
 * Pre-Do anchor — 다건 합산이 정밀판정을 무시하고 원시 isNonBusinessLand 플래그로
 * 비사업용 중과(+10%p)를 재적용하는 버그.
 *
 * 시나리오: 토지 2건, 원시 플래그 isNonBusinessLand=true이나 nonBusinessLandDetails
 *   정밀판정은 "사업용"(자경 농지). 단건 엔진은 result.nonBusinessLandJudgmentDetail로
 *   사업용을 노출하고 중과를 적용하지 않는다(surchargeType undefined).
 *   그러나 집계 classifyRateGroup(item.isNonBusinessLand)·aggregateByGroup(calcTax(rep.singleInput))이
 *   원시 플래그를 참조해 non_business_land 그룹으로 오분류 + 방법 B에 +10%p 재적용 → 과다과세.
 *
 * 수정(Option C): 집계가 result.nonBusinessLandJudgmentDetail.isNonBusinessLand(+ratio)를
 *   읽어 교정된 item으로 분류·세액계산.
 */
import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land";

const mockRates = makeMockRates();

/** 자경 농지 5년 이상 → 정밀판정 사업용 (multi-house-and-nbl T-26 픽스처 재사용). */
function businessFarmland(acq: string, tsf: string, area: number): NonBusinessLandInput {
  return {
    landType: "farmland",
    landArea: area,
    zoneType: "agriculture_forest",
    acquisitionDate: new Date(acq),
    transferDate: new Date(tsf),
    farmingSelf: true,
    farmerResidenceDistance: 10,
    businessUsePeriods: [
      { startDate: new Date(acq), endDate: new Date(tsf), usageType: "자경" },
    ],
    gracePeriods: [],
  };
}

function landItem(
  id: string,
  transferPrice: number,
  acquisitionPrice: number,
  acq: string,
  tsf: string,
  area: number,
): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    propertyType: "land",
    isOneHousehold: false,
    householdHousingCount: 0,
    transferPrice,
    acquisitionPrice,
    acquisitionDate: new Date(acq),
    transferDate: new Date(tsf),
    isNonBusinessLand: true, // 원시 플래그 true (사용자 체크박스) — 정밀판정은 사업용
    nonBusinessLandDetails: businessFarmland(acq, tsf, area),
  };
}

describe("다건 합산 — 정밀판정 사업용인데 원시 플래그로 비사업용 중과 재적용 (회귀 방지)", () => {
  const input: AggregateTransferInput = {
    taxYear: 2022,
    annualBasicDeductionUsed: 0,
    basicDeductionAllocation: "MAX_BENEFIT",
    properties: [
      landItem("토지1", 826_000_000, 100_000_000, "2015-01-01", "2022-01-01", 5000),
      landItem("토지2", 325_000_000, 50_000_000, "2015-01-01", "2022-01-01", 3000),
    ],
  };

  it("자산별 정밀판정이 사업용이면 rateGroup은 progressive (non_business_land 아님)", () => {
    const r = calculateTransferTaxAggregate(input, mockRates);
    expect(r.properties[0].rateGroup).toBe("progressive");
    expect(r.properties[1].rateGroup).toBe("progressive");
  });

  it("세율군 집계에 non_business_land 그룹이 없어야 한다", () => {
    const r = calculateTransferTaxAggregate(input, mockRates);
    expect(r.groupTaxes.some((g) => g.group === "non_business_land")).toBe(false);
  });

  it("자산별 +10%p 비사업용 중과가 적용되지 않아야 한다", () => {
    const r = calculateTransferTaxAggregate(input, mockRates);
    expect(r.properties[0].surchargeRate ?? 0).toBe(0);
    expect(r.properties[1].surchargeRate ?? 0).toBe(0);
  });
});
