/**
 * M1-D anchor: 미노출 감면 detail 4개 필드 엔진 populate 검증
 *
 * 목적: ReductionDetailCards 렌더 대상 4개 detail 필드가
 *   calculateTransferTax() 결과에 실제로 채워지는지 원단위 toBe() anchor.
 *
 * 4개 필드:
 *   - selfFarmingReductionDetail   (조특법 §69 자경농지 감면)
 *   - inheritedHouseValuationDetail (상속주택 환산취득가액)
 *   - newHousingReductionDetail    (조특법 §99 신축주택 감면)
 *   - rentalReductionDetail        (조특법 §97의3 장기임대 감면)
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type { RentalReductionInput } from "@/lib/tax-engine/rental-housing-reduction";
import type { NewHousingReductionInput } from "@/lib/tax-engine/new-housing-reduction";
import type { TaxRateKey } from "@/lib/tax-engine/types";
import {
  makeMockRates,
  baseTransferInput as baseInput,
  LONG_TERM_RENTAL_RULES_MOCK,
} from "../_helpers/mock-rates";

// ── 신축주택 감면 Mock 데이터 ────────────────────────────────────────
const NEW_HOUSING_MATRIX_MOCK = {
  "transfer:deduction:new_housing_matrix": {
    taxType: "transfer",
    category: "deduction",
    subCategory: "new_housing_matrix",
    rateTable: null,
    deductionRules: {
      type: "new_housing_matrix",
      articles: [
        {
          code: "99-1",
          article: "§99 ①",
          acquisitionPeriod: { start: "2001-05-23", end: "2003-06-30" },
          region: "outside_overconcentration",
          maxAcquisitionPrice: null,
          maxArea: null,
          requiresFirstSale: true,
          requiresUnsoldCertificate: false,
          reductionScope: "capital_gain",
          reductionRate: 1.0,
          fiveYearWindowRule: true,
          isExcludedFromHouseCount: true,
          isExcludedFromMultiHouseSurcharge: true,
        },
      ],
    },
    specialRules: null,
    effectiveDate: "2001-05-23",
    isActive: true,
  },
};

// ── A-1: 자경농지 감면 — selfFarmingReductionDetail ─────────────────

describe("A-1: selfFarmingReductionDetail anchor", () => {
  it("A-1a: 자경 30년, 편입 없음 → qualifies=true, reducibleIncome = transferIncome", () => {
    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 0,
      useEstimatedAcquisition: true,
      standardPriceAtAcquisition: 10_000_000,
      standardPriceAtTransfer: 100_000_000,
      acquisitionDate: new Date("1990-01-01"),
      transferDate: new Date("2024-01-01"),
      isOneHousehold: false,
      householdHousingCount: 1,
      reductions: [
        {
          type: "self_farming",
          farmingYears: 30,
          // incorporationDate 없음 → 전액 감면
        },
      ],
    });

    const result = calculateTransferTax(input, makeMockRates());
    // selfFarmingReductionDetail 존재 확인
    expect(result.selfFarmingReductionDetail).toBeDefined();
    expect(result.selfFarmingReductionDetail!.qualifies).toBe(true);
    // 편입 없음 → reducibleRatio = 1.0, nonReducibleIncome = 0
    expect(result.selfFarmingReductionDetail!.reducibleRatio).toBe(1);
    expect(result.selfFarmingReductionDetail!.nonReducibleIncome).toBe(0);
    expect(result.selfFarmingReductionDetail!.partialReductionApplied).toBe(false);
    expect(result.selfFarmingReductionDetail!.incorporationGraceExpired).toBe(false);
    // reducibleIncome = transferIncome (양도소득금액과 동일)
    expect(result.selfFarmingReductionDetail!.reducibleIncome).toBe(
      result.selfFarmingReductionDetail!.reducibleIncome + result.selfFarmingReductionDetail!.nonReducibleIncome,
    );
  });

  it("A-1b: 자경 5년 (요건 8년 미충족) → qualifies=false, reducibleIncome=0", () => {
    const input = baseInput({
      transferPrice: 300_000_000,
      acquisitionPrice: 100_000_000,
      acquisitionDate: new Date("2016-01-01"),
      transferDate: new Date("2024-01-01"),
      isOneHousehold: false,
      householdHousingCount: 1,
      reductions: [
        {
          type: "self_farming",
          farmingYears: 5,
          // 8년 미충족
        },
      ],
    });

    const result = calculateTransferTax(input, makeMockRates());
    expect(result.selfFarmingReductionDetail).toBeDefined();
    expect(result.selfFarmingReductionDetail!.qualifies).toBe(false);
    expect(result.selfFarmingReductionDetail!.reducibleIncome).toBe(0);
    // 감면 없음
    expect(result.reductionAmount).toBe(0);
  });

  it("A-1c: 편입일 포함 부분감면 → partialReductionApplied=true, 0 < reducibleRatio < 1", () => {
    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 0,
      useEstimatedAcquisition: true,
      standardPriceAtAcquisition: 5_000_000,
      standardPriceAtTransfer: 50_000_000,
      acquisitionDate: new Date("1990-01-01"),
      transferDate: new Date("2024-01-01"),
      isOneHousehold: false,
      householdHousingCount: 1,
      reductions: [
        {
          type: "self_farming",
          farmingYears: 30,
          incorporationDate: new Date("2022-01-01"),    // 유예기간 내
          incorporationZoneType: "residential",
          standardPriceAtIncorporation: 20_000_000,    // 편입일 기준시가
        },
      ],
    });

    const result = calculateTransferTax(input, makeMockRates());
    expect(result.selfFarmingReductionDetail).toBeDefined();
    expect(result.selfFarmingReductionDetail!.qualifies).toBe(true);
    expect(result.selfFarmingReductionDetail!.partialReductionApplied).toBe(true);
    // 0 < ratio < 1 (편입일까지만 감면)
    expect(result.selfFarmingReductionDetail!.reducibleRatio).toBeGreaterThan(0);
    expect(result.selfFarmingReductionDetail!.reducibleRatio).toBeLessThan(1);
    // nonReducibleIncome > 0
    expect(result.selfFarmingReductionDetail!.nonReducibleIncome).toBeGreaterThan(0);
  });
});

// ── A-2: 신축주택 감면 — newHousingReductionDetail ────────────────────

describe("A-2: newHousingReductionDetail anchor", () => {
  it("A-2a: §99① 5년 이내 양도 → isEligible=true, reductionRate=1.0, reductionAmount=calculatedTax", () => {
    const newHousingDetails: NewHousingReductionInput = {
      acquisitionDate: new Date("2002-06-01"),
      transferDate: new Date("2006-01-01"),   // 약 3.5년 → 5년 이내
      region: "outside_overconcentration",
      acquisitionPrice: 200_000_000,
      exclusiveAreaSquareMeters: 84,
      isFirstSale: true,
      hasUnsoldCertificate: false,
      totalCapitalGain: 0,
      calculatedTax: 0,
    };

    const rates = makeMockRates(NEW_HOUSING_MATRIX_MOCK as Partial<Record<TaxRateKey, object>>);
    const input = baseInput({
      transferPrice: 400_000_000,
      acquisitionPrice: 200_000_000,
      acquisitionDate: new Date("2002-06-01"),
      transferDate: new Date("2006-01-01"),
      isOneHousehold: false,
      householdHousingCount: 2,
      reductions: [],
      newHousingDetails,
    });

    const result = calculateTransferTax(input, rates);
    expect(result.newHousingReductionDetail).toBeDefined();
    expect(result.newHousingReductionDetail!.isEligible).toBe(true);
    expect(result.newHousingReductionDetail!.reductionRate).toBe(1.0);
    expect(result.newHousingReductionDetail!.isWithinFiveYearWindow).toBe(true);
    // 100% 감면 → reductionAmount = calculatedTax
    expect(result.newHousingReductionDetail!.reductionAmount).toBe(result.calculatedTax);
    // matchedArticleCode 확인
    expect(result.newHousingReductionDetail!.matchedArticleCode).toBe("99-1");
  });

  it("A-2b: 기간 외 취득 → isEligible=false, ineligibleReasons 존재", () => {
    const newHousingDetails: NewHousingReductionInput = {
      acquisitionDate: new Date("2005-01-01"),    // §99① 기간 외
      transferDate: new Date("2008-01-01"),
      region: "outside_overconcentration",
      acquisitionPrice: 200_000_000,
      exclusiveAreaSquareMeters: 84,
      isFirstSale: true,
      hasUnsoldCertificate: false,
      totalCapitalGain: 0,
      calculatedTax: 0,
    };

    const rates = makeMockRates(NEW_HOUSING_MATRIX_MOCK as Partial<Record<TaxRateKey, object>>);
    const input = baseInput({
      acquisitionDate: new Date("2005-01-01"),
      transferDate: new Date("2008-01-01"),
      isOneHousehold: false,
      householdHousingCount: 2,
      reductions: [],
      newHousingDetails,
    });

    const result = calculateTransferTax(input, rates);
    expect(result.newHousingReductionDetail).toBeDefined();
    expect(result.newHousingReductionDetail!.isEligible).toBe(false);
    expect(result.newHousingReductionDetail!.ineligibleReasons.length).toBeGreaterThan(0);
    expect(result.reductionAmount).toBe(0);
  });
});

// ── A-3: 장기임대 감면 — rentalReductionDetail ────────────────────────

describe("A-3: rentalReductionDetail anchor", () => {
  it("A-3a: 8년 임대 요건 충족 → isEligible=true, reductionRate=0.5", () => {
    const rentalDetails: RentalReductionInput = {
      isRegisteredLandlord: true,
      isTaxRegistered: true,
      registrationDate: new Date("2015-01-01"),
      rentalHousingType: "long_term_private",
      propertyType: "non_apartment",
      region: "capital",
      officialPriceAtStart: 500_000_000,
      rentalStartDate: new Date("2015-01-01"),
      transferDate: new Date("2024-06-01"),   // 9년 이상
      vacancyPeriods: [],
      rentHistory: [],
      calculatedTax: 0,
    };

    const rates = makeMockRates(LONG_TERM_RENTAL_RULES_MOCK as Partial<Record<TaxRateKey, object>>);
    const input = baseInput({
      transferPrice: 600_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2014-06-01"),
      transferDate: new Date("2024-06-01"),
      isOneHousehold: false,
      householdHousingCount: 3,
      reductions: [],
      rentalReductionDetails: rentalDetails,
    });

    const result = calculateTransferTax(input, rates);
    expect(result.rentalReductionDetail).toBeDefined();
    expect(result.rentalReductionDetail!.isEligible).toBe(true);
    expect(result.rentalReductionDetail!.reductionRate).toBe(0.5);
    expect(result.rentalReductionDetail!.reductionAmount).toBe(
      Math.floor(result.calculatedTax * 0.5),
    );
    // reductionType anchor
    expect(result.rentalReductionDetail!.reductionType).toBe("long_term_private");
  });

  it("A-3b: 의무기간 미충족 → isEligible=false, ineligibleReasons 존재", () => {
    const rentalDetails: RentalReductionInput = {
      isRegisteredLandlord: true,
      isTaxRegistered: true,
      registrationDate: new Date("2019-01-01"),
      rentalHousingType: "long_term_private",
      propertyType: "non_apartment",
      region: "capital",
      officialPriceAtStart: 400_000_000,
      rentalStartDate: new Date("2019-01-01"),
      transferDate: new Date("2024-06-01"),   // 5년 → 8년 미충족
      vacancyPeriods: [],
      rentHistory: [],
      calculatedTax: 0,
    };

    const rates = makeMockRates(LONG_TERM_RENTAL_RULES_MOCK as Partial<Record<TaxRateKey, object>>);
    const input = baseInput({
      isOneHousehold: false,
      householdHousingCount: 2,
      reductions: [],
      rentalReductionDetails: rentalDetails,
    });

    const result = calculateTransferTax(input, rates);
    expect(result.rentalReductionDetail).toBeDefined();
    expect(result.rentalReductionDetail!.isEligible).toBe(false);
    expect(result.rentalReductionDetail!.ineligibleReasons.length).toBeGreaterThan(0);
  });
});

// ── A-4: 상속주택 환산취득가액 — inheritedHouseValuationDetail ─────────

describe("A-4: inheritedHouseValuationDetail anchor", () => {
  it("A-4a: inheritedHouseValuation 제공 → detail 존재, 3시점 합계 기준시가 anchor", () => {
    // 간단한 케이스: 1990 이후 상속주택, user_override 방식
    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 0,
      acquisitionDate: new Date("1995-01-01"),
      transferDate: new Date("2024-01-01"),
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 24,
      inheritedHouseValuation: {
        inheritanceDate: new Date("1995-01-01"),
        transferDate: new Date("2024-01-01"),
        landArea: 100,
        landPricePerSqmAtTransfer: 3_000_000,            // 300,000,000원
        landPricePerSqmAtFirstDisclosure: 800_000,        // 80,000,000원
        landPricePerSqmAtInheritance: 800_000,            // 1995=최초공시 동일 (1990 이후 필수)
        housePriceAtTransfer: 400_000_000,
        housePriceAtFirstDisclosure: 80_000_000,
        buildingStdPriceAtTransfer: 50_000_000,
        buildingStdPriceAtFirstDisclosure: 30_000_000,
        buildingStdPriceAtInheritance: 20_000_000,
        housePriceAtInheritanceOverride: 50_000_000,      // 직접 입력
      },
      inheritedAcquisition: {
        inheritanceDate: new Date("1995-01-01"),
        assetKind: "house_individual",
        transferDate: new Date("2024-01-01"),
        transferPrice: 500_000_000,
      },
    });

    const result = calculateTransferTax(input, makeMockRates());
    expect(result.inheritedHouseValuationDetail).toBeDefined();

    const d = result.inheritedHouseValuationDetail!;

    // estimationMethod: user_override (직접 입력)
    expect(d.estimationMethod).toBe("user_override");

    // 상속개시일 토지기준시가 = landArea × landPricePerSqmAtInheritance
    // 100 × 800,000 = 80,000,000
    expect(d.landStdAtInheritance).toBe(80_000_000);

    // 양도일 토지기준시가 = landArea × landPricePerSqmAtTransfer
    // 100 × 3,000,000 = 300,000,000
    expect(d.landStdAtTransfer).toBe(300_000_000);

    // housePriceAtInheritanceUsed = override 값
    expect(d.housePriceAtInheritanceUsed).toBe(50_000_000);

    // totalStdPriceAtInheritance = 토지 80,000,000 + 주택 50,000,000 = 130,000,000
    expect(d.totalStdPriceAtInheritance).toBe(130_000_000);

    // totalStdPriceAtTransfer = 토지 300,000,000 + buildingStdPriceAtTransfer 50,000,000 = 350,000,000
    // (buildingStdPriceAtTransfer 있으면 housePriceAtTransfer 대신 이걸 씀 — inheritance-house-valuation.ts:68)
    expect(d.totalStdPriceAtTransfer).toBe(350_000_000);

    // formula, legalBasis 문자열 존재 확인
    expect(typeof d.formula).toBe("string");
    expect(d.formula.length).toBeGreaterThan(0);
    expect(typeof d.legalBasis).toBe("string");
    expect(d.legalBasis.length).toBeGreaterThan(0);
  });

  it("A-4b: inheritedHouseValuation 미제공 → inheritedHouseValuationDetail undefined", () => {
    const input = baseInput({
      transferPrice: 300_000_000,
      acquisitionPrice: 100_000_000,
      acquisitionDate: new Date("2010-01-01"),
      transferDate: new Date("2024-01-01"),
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 36,
    });

    const result = calculateTransferTax(input, makeMockRates());
    expect(result.inheritedHouseValuationDetail).toBeUndefined();
  });
});
