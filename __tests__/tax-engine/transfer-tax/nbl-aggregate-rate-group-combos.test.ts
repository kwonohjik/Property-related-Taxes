/**
 * 다건 합산 — 정밀판정 NBL × 다른 세율군 조합 회귀 anchor (#508 후속).
 *
 * #508로 집계 그룹 분류·세율이 원시 isNonBusinessLand 대신
 * result.nonBusinessLandJudgmentDetail(정밀판정)을 쓰도록 바뀌었다.
 * 정밀판정 NBL을 다른 그룹(genuine NBL·multi_house·progressive·조악 플래그)과
 * 혼합했을 때의 분류·중과·비교과세를 고정한다.
 *
 * 픽스처는 단건 회귀 테스트(multi-house-and-nbl T-25·T-26)와 동일:
 *  - businessFarmland: 자경 농지 → 정밀판정 사업용(중과 없음)
 *  - genuineNblVacantLot: 나대지·사업용 사용 0 → 정밀판정 비사업용(+10%p)
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

/** 중과 유예 해제 세율 (다주택 중과가 실제 적용되도록) — T-M04 패턴. */
const ratesNoSuspend = makeMockRates({
  "transfer:surcharge:_default": {
    taxType: "transfer",
    category: "surcharge",
    subCategory: "_default",
    rateTable: {
      multi_house_2: { additionalRate: 0.2, condition: "조정2주택", referenceDate: "transfer_date" },
      multi_house_3plus: { additionalRate: 0.3, condition: "조정3+", referenceDate: "transfer_date" },
      non_business_land: { additionalRate: 0.1 },
      unregistered: { flatRate: 0.7, excludeDeductions: true, excludeBasicDeduction: true },
    },
    deductionRules: null,
    specialRules: { surcharge_suspended: false, suspended_types: [], suspended_until: null },
  },
} as never);

/** 자경 농지 5년+ → 정밀판정 사업용. */
function businessFarmland(acq: string, tsf: string, area: number): NonBusinessLandInput {
  return {
    landType: "farmland",
    landArea: area,
    zoneType: "agriculture_forest",
    acquisitionDate: new Date(acq),
    transferDate: new Date(tsf),
    farmingSelf: true,
    farmerResidenceDistance: 10,
    businessUsePeriods: [{ startDate: new Date(acq), endDate: new Date(tsf), usageType: "자경" }],
    gracePeriods: [],
  };
}

/** 나대지·사업용 사용 0 → 정밀판정 비사업용. */
function genuineNblVacantLot(acq: string, tsf: string, area: number): NonBusinessLandInput {
  return {
    landType: "vacant_lot",
    landArea: area,
    zoneType: "residential",
    acquisitionDate: new Date(acq),
    transferDate: new Date(tsf),
    businessUsePeriods: [],
    gracePeriods: [],
  };
}

function landItem(
  id: string,
  transferPrice: number,
  acquisitionPrice: number,
  acq: string,
  tsf: string,
  overrides: Partial<TransferTaxItemInput>,
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
    ...overrides,
  };
}

function groupOf(r: ReturnType<typeof calculateTransferTaxAggregate>, id: string) {
  return r.properties.find((p) => p.propertyId === id)!;
}

describe("정밀판정 NBL × 다른 세율군 조합 (#508 회귀)", () => {
  it("사업용(details) + 비사업용(details) → 각각 progressive / non_business_land 분리", () => {
    const input: AggregateTransferInput = {
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      properties: [
        landItem("사업용", 500_000_000, 200_000_000, "2015-01-01", "2024-01-01", {
          isNonBusinessLand: true, // 원시 플래그 true지만 정밀판정 사업용
          nonBusinessLandDetails: businessFarmland("2015-01-01", "2024-01-01", 5000),
        }),
        landItem("비사업용", 500_000_000, 200_000_000, "2019-06-01", "2024-06-01", {
          isNonBusinessLand: false, // 원시 플래그 false지만 정밀판정 비사업용
          nonBusinessLandDetails: genuineNblVacantLot("2019-06-01", "2024-06-01", 1000),
        }),
      ],
    };
    const r = calculateTransferTaxAggregate(input, mockRates);

    expect(groupOf(r, "사업용").rateGroup).toBe("progressive");
    expect(groupOf(r, "사업용").surchargeRate ?? 0).toBe(0);
    expect(groupOf(r, "비사업용").rateGroup).toBe("non_business_land");
    // 비사업용 그룹은 +10%p 중과 유지
    expect(r.groupTaxes.find((g) => g.group === "non_business_land")?.surchargeRate).toBe(0.1);
    expect(r.groupTaxes.some((g) => g.group === "non_business_land")).toBe(true);
  });

  it("비사업용(details) + 일반 누진 주택 → 비교과세 MAX, 비사업용 중과 보존", () => {
    const input: AggregateTransferInput = {
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      properties: [
        landItem("비사업용", 500_000_000, 200_000_000, "2019-06-01", "2024-06-01", {
          isNonBusinessLand: false,
          nonBusinessLandDetails: genuineNblVacantLot("2019-06-01", "2024-06-01", 1000),
        }),
        {
          ...(baseTransferInput() as unknown as TransferTaxItemInput),
          propertyId: "일반주택",
          propertyLabel: "일반주택",
          propertyType: "housing",
          transferPrice: 400_000_000,
          acquisitionPrice: 200_000_000,
          acquisitionDate: new Date("2015-06-01"),
          transferDate: new Date("2024-06-01"),
          isOneHousehold: false,
          householdHousingCount: 0,
        },
      ],
    };
    const r = calculateTransferTaxAggregate(input, mockRates);

    expect(groupOf(r, "비사업용").rateGroup).toBe("non_business_land");
    expect(groupOf(r, "일반주택").rateGroup).toBe("progressive");
    // 중과 그룹 존재 → 비교과세 발동, calculatedTax = max(그룹별, 전체누진)
    expect(["groups", "general"]).toContain(r.comparedTaxApplied);
    expect(r.calculatedTax).toBe(Math.max(r.calculatedTaxByGroups, r.calculatedTaxByGeneral));
  });

  it("사업용(details) + 다주택 중과 주택 → 사업용은 progressive, 주택은 multi_house_surcharge", () => {
    const input: AggregateTransferInput = {
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      properties: [
        landItem("사업용", 500_000_000, 200_000_000, "2015-01-01", "2024-01-01", {
          isNonBusinessLand: true,
          nonBusinessLandDetails: businessFarmland("2015-01-01", "2024-01-01", 5000),
        }),
        {
          ...(baseTransferInput() as unknown as TransferTaxItemInput),
          propertyId: "중과주택",
          propertyLabel: "중과주택",
          propertyType: "housing",
          transferPrice: 800_000_000,
          acquisitionPrice: 400_000_000,
          acquisitionDate: new Date("2018-06-01"),
          transferDate: new Date("2024-06-01"),
          isOneHousehold: false,
          householdHousingCount: 3,
          isRegulatedArea: true,
        },
      ],
    };
    const r = calculateTransferTaxAggregate(input, ratesNoSuspend);

    expect(groupOf(r, "사업용").rateGroup).toBe("progressive");
    expect(groupOf(r, "중과주택").rateGroup).toBe("multi_house_surcharge");
    expect(r.groupTaxes.some((g) => g.group === "non_business_land")).toBe(false);
  });

  it("조악 플래그 비사업용(details 없음) + 정밀판정 비사업용 → 둘 다 non_business_land 중과", () => {
    const input: AggregateTransferInput = {
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      properties: [
        landItem("조악", 500_000_000, 200_000_000, "2018-06-01", "2024-06-01", {
          isNonBusinessLand: true, // details 없음 → 조악 플래그 그대로 (effective=원시)
        }),
        landItem("정밀", 500_000_000, 200_000_000, "2019-06-01", "2024-06-01", {
          isNonBusinessLand: false,
          nonBusinessLandDetails: genuineNblVacantLot("2019-06-01", "2024-06-01", 1000),
        }),
      ],
    };
    const r = calculateTransferTaxAggregate(input, mockRates);

    expect(groupOf(r, "조악").rateGroup).toBe("non_business_land");
    expect(groupOf(r, "정밀").rateGroup).toBe("non_business_land");
    expect(r.groupTaxes.find((g) => g.group === "non_business_land")?.surchargeRate).toBe(0.1);
  });
});
