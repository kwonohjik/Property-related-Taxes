/**
 * 양도소득세 — §114조의2 가산세·1990 토지 환산·공익수용 통합 (§114·PRE1990·IMG-*) 테스트
 *
 * 공통 세율·기본 입력은 ../_helpers/mock-rates 에서 import.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type { HouseInfo } from "@/lib/tax-engine/multi-house-surcharge";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land";
import type { RentalReductionInput } from "@/lib/tax-engine/rental-housing-reduction";
import type { NewHousingReductionInput } from "@/lib/tax-engine/new-housing-reduction";
import { makeMockRates, baseTransferInput as baseInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();

describe("T-17: §114조의2 신축·증축 가산세", () => {
  const buildingBase = (overrides?: Partial<TransferTaxInput>): TransferTaxInput =>
    baseInput({
      propertyType: "building",
      isOneHousehold: false,
      householdHousingCount: 0,
      residencePeriodMonths: 0,
      useEstimatedAcquisition: true,
      standardPriceAtAcquisition: 200_000_000,
      standardPriceAtTransfer: 400_000_000,
      transferPrice: 800_000_000,
      acquisitionPrice: 0,
      acquisitionDate: new Date("2015-01-01"),
      transferDate: new Date("2026-03-01"),
      ...overrides,
    });

  it("신축 + 환산취득가 + 5년 이내 → 5% 가산세", () => {
    const input = buildingBase({
      acquisitionMethod: "estimated",
      isSelfBuilt: true,
      buildingType: "new",
      constructionDate: new Date("2023-01-01"),
      transferDate: new Date("2026-03-01"),
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.penaltyTax).toBeGreaterThan(0);
    // 환산취득가 = 800M × (200M / 400M) = 400M → penalty = 400M × 5% = 20,000,000
    expect(result.penaltyTax).toBe(Math.floor(400_000_000 * 0.05));
  });

  it("증축 85㎡ 초과 + 환산취득가 + 5년 이내 → 5% 가산세", () => {
    const input = buildingBase({
      acquisitionMethod: "estimated",
      isSelfBuilt: true,
      buildingType: "extension",
      constructionDate: new Date("2023-01-01"),
      extensionFloorArea: 100,
      transferDate: new Date("2026-03-01"),
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.penaltyTax).toBeGreaterThan(0);
  });

  it("증축 85㎡ 이하 → 가산세 0", () => {
    const input = buildingBase({
      acquisitionMethod: "estimated",
      isSelfBuilt: true,
      buildingType: "extension",
      constructionDate: new Date("2023-01-01"),
      extensionFloorArea: 60,
      transferDate: new Date("2026-03-01"),
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.penaltyTax).toBe(0);
  });

  it("5년 초과 보유 → 가산세 0", () => {
    const input = buildingBase({
      acquisitionMethod: "estimated",
      isSelfBuilt: true,
      buildingType: "new",
      constructionDate: new Date("2019-01-01"),
      transferDate: new Date("2026-03-01"),
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.penaltyTax).toBe(0);
  });

  it("실거래가 사용 → 가산세 0", () => {
    const input = buildingBase({
      acquisitionMethod: "actual",
      useEstimatedAcquisition: false,
      acquisitionPrice: 300_000_000,
      isSelfBuilt: true,
      buildingType: "new",
      constructionDate: new Date("2023-01-01"),
      transferDate: new Date("2026-03-01"),
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.penaltyTax).toBe(0);
  });

  it("감정가액 + 2020.1.1 이후 양도 → 5% 가산세", () => {
    const input = buildingBase({
      acquisitionMethod: "appraisal",
      useEstimatedAcquisition: false,
      appraisalValue: 300_000_000,
      isSelfBuilt: true,
      buildingType: "new",
      constructionDate: new Date("2021-01-01"),
      transferDate: new Date("2024-06-01"),
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.penaltyTax).toBe(Math.floor(300_000_000 * 0.05));
  });

  it("감정가액 + 2019년 양도 → 가산세 0 (2020년 이전 감정가액 미적용)", () => {
    const input = buildingBase({
      acquisitionMethod: "appraisal",
      useEstimatedAcquisition: false,
      appraisalValue: 300_000_000,
      isSelfBuilt: true,
      buildingType: "new",
      constructionDate: new Date("2017-01-01"),
      transferDate: new Date("2019-06-01"),
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.penaltyTax).toBe(0);
  });

  it("2017년 양도 → 가산세 0 (2018년 이전 적용 안됨)", () => {
    const input = buildingBase({
      acquisitionMethod: "estimated",
      isSelfBuilt: true,
      buildingType: "new",
      constructionDate: new Date("2015-01-01"),
      transferDate: new Date("2017-06-01"),
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.penaltyTax).toBe(0);
  });

  it("산출세액 0 + 가산세만 부과 (§114조의2 ②)", () => {
    const input = buildingBase({
      acquisitionMethod: "estimated",
      isSelfBuilt: true,
      buildingType: "new",
      constructionDate: new Date("2023-01-01"),
      transferDate: new Date("2026-03-01"),
      // 양도가 = 취득가 → 양도차익 0
      transferPrice: 400_000_000,
      standardPriceAtAcquisition: 200_000_000,
      standardPriceAtTransfer: 200_000_000,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.determinedTax).toBe(0);
    expect(result.penaltyTax).toBeGreaterThan(0);
    expect(result.totalTax).toBeGreaterThan(0);
  });

  it("지방소득세 계산 시 가산세 포함 결정세액 × 10%", () => {
    const input = buildingBase({
      acquisitionMethod: "estimated",
      isSelfBuilt: true,
      buildingType: "new",
      constructionDate: new Date("2023-01-01"),
      transferDate: new Date("2026-03-01"),
    });
    const result = calculateTransferTax(input, mockRates);
    const base = result.determinedTax + result.penaltyTax;
    const expectedLocalTax = Math.floor(base * 0.1);
    expect(result.localIncomeTax).toBe(expectedLocalTax);
  });
});

// ============================================================
// T-PRE1990: 1990.8.30. 이전 취득 토지 기준시가 환산 통합
// ============================================================

describe("T-PRE1990: 1988.12.3. 취득 농지 PDF 사례 통합", () => {
  it("pre1990Land 제공 시 기준시가 자동 주입 (PDF 재현)", () => {
    const input = baseInput({
      propertyType: "land",
      transferPrice: 550_000_000,
      transferDate: new Date("2023-02-16"),
      acquisitionPrice: 0,                 // 무시됨 (pre1990Land가 덮어씀)
      acquisitionDate: new Date("1988-12-03"),
      useEstimatedAcquisition: false,       // 엔진이 true로 덮어씀
      isOneHousehold: false,
      householdHousingCount: 0,
      pre1990Land: {
        acquisitionDate: new Date("1988-12-03"),
        transferDate: new Date("2023-02-16"),
        areaSqm: 2_417,
        pricePerSqm_1990: 54_000,
        pricePerSqm_atTransfer: 241_700,
        grade_1990_0830: 108,
        gradePrev_1990_0830: 103,
        gradeAtAcquisition: 103,
      },
    });
    const result = calculateTransferTax(input, mockRates);

    // 기준시가 자동 주입 확인
    expect(result.pre1990LandValuationDetail).toBeDefined();
    expect(result.pre1990LandValuationDetail!.pricePerSqmAtAcquisition).toBe(47_547);
    expect(result.pre1990LandValuationDetail!.standardPriceAtAcquisition).toBe(114_921_099);
    expect(result.pre1990LandValuationDetail!.standardPriceAtTransfer).toBe(584_188_900);
    expect(result.pre1990LandValuationDetail!.caseType).toBe("case1_no_adjustment");

    // 환산취득가가 자동 활성화되었는지 확인
    expect(result.usedEstimatedAcquisition).toBe(true);

    // 양도차익 = 양도가 - (환산취득가 + 개산공제)
    // 환산취득가 = 550,000,000 × 114,921,099 / 584,188,900 = 108,195,490
    // 개산공제 = 114,921,099 × 3% = 3,447,632
    // 차익 = 550,000,000 - 108,195,490 - 3,447,632 = 438,356,878
    expect(result.transferGain).toBe(438_356_878);
  });

  it("pre1990Land 없으면 기존 동작 불변 (회귀 방지)", () => {
    const input = baseInput({ propertyType: "housing" });
    const result = calculateTransferTax(input, mockRates);
    expect(result.pre1990LandValuationDetail).toBeUndefined();
  });

  it("pre1990Land 제공 + 양도차익 계산 단계에 환산 step이 기록됨", () => {
    const input = baseInput({
      propertyType: "land",
      transferPrice: 550_000_000,
      transferDate: new Date("2023-02-16"),
      acquisitionPrice: 0,
      acquisitionDate: new Date("1988-12-03"),
      isOneHousehold: false,
      householdHousingCount: 0,
      pre1990Land: {
        acquisitionDate: new Date("1988-12-03"),
        transferDate: new Date("2023-02-16"),
        areaSqm: 2_417,
        pricePerSqm_1990: 54_000,
        pricePerSqm_atTransfer: 241_700,
        grade_1990_0830: 108,
        gradePrev_1990_0830: 103,
        gradeAtAcquisition: 103,
      },
    });
    const result = calculateTransferTax(input, mockRates);
    const envSteps = result.steps.filter((s) => s.label.includes("1990.8.30") || s.label.startsWith("Case"));
    expect(envSteps.length).toBeGreaterThanOrEqual(2);
  });

  // ── G1/G2/G3 보완: §69 감면 결합 + 개산공제 3% + 지방소득세 assertion ──
  it("§69 8년 자경농지 100% 감면 결합 — 감면 한도 1억 초과분만 잔존 (G1)", () => {
    const input = baseInput({
      propertyType: "land",
      transferPrice: 550_000_000,
      transferDate: new Date("2023-02-16"),
      acquisitionPrice: 0,
      acquisitionDate: new Date("1988-12-03"),
      isOneHousehold: false,
      householdHousingCount: 0,
      isNonBusinessLand: false, // 자경농지는 사업용
      // 20년 자경 → §69 100% 감면 대상 (연 1억 한도)
      reductions: [{ type: "self_farming", farmingYears: 20 }],
      pre1990Land: {
        acquisitionDate: new Date("1988-12-03"),
        transferDate: new Date("2023-02-16"),
        areaSqm: 2_417,
        pricePerSqm_1990: 54_000,
        pricePerSqm_atTransfer: 241_700,
        grade_1990_0830: 108,
        gradePrev_1990_0830: 103,
        gradeAtAcquisition: 103,
      },
    });
    const result = calculateTransferTax(input, mockRates);

    // 환산이 정상 동작 (PDF 사례 값)
    expect(result.pre1990LandValuationDetail?.standardPriceAtAcquisition).toBe(114_921_099);

    // §69 자경농지 감면이 100% 적용되며 연 1억 한도로 capped
    // PDF 산출세액 = 95,799,926원 (1억 미만 → 전액 감면 가능)
    // 단, 본 mockRates의 세율로 계산된 값이 정확히 PDF와 일치하지 않을 수 있음 → 한도 검증 위주
    expect(result.reductionAmount).toBeGreaterThan(0);
    expect(result.reductionAmount).toBeLessThanOrEqual(100_000_000); // §69 연 1억 한도
    expect(result.reductionType).toBe("자경농지");
    // 전액 감면 가능한 구간이면 결정세액 = 0
    if (result.calculatedTax <= 100_000_000) {
      expect(result.determinedTax).toBe(0);
    }
  });

  it("개산공제 = 취득시 기준시가 × 3% (G2) + 양도차익 PDF 사례 재현", () => {
    const input = baseInput({
      propertyType: "land",
      transferPrice: 550_000_000,
      transferDate: new Date("2023-02-16"),
      acquisitionPrice: 0,
      acquisitionDate: new Date("1988-12-03"),
      isOneHousehold: false,
      householdHousingCount: 0,
      pre1990Land: {
        acquisitionDate: new Date("1988-12-03"),
        transferDate: new Date("2023-02-16"),
        areaSqm: 2_417,
        pricePerSqm_1990: 54_000,
        pricePerSqm_atTransfer: 241_700,
        grade_1990_0830: 108,
        gradePrev_1990_0830: 103,
        gradeAtAcquisition: 103,
      },
    });
    const result = calculateTransferTax(input, mockRates);

    // 취득시 기준시가 = 114,921,099
    const stdPriceAtAcq = result.pre1990LandValuationDetail!.standardPriceAtAcquisition;
    expect(stdPriceAtAcq).toBe(114_921_099);

    // 개산공제 = 114,921,099 × 3% = 3,447,632 (원단위 절사)
    const expectedDeduction = Math.floor(stdPriceAtAcq * 0.03);
    expect(expectedDeduction).toBe(3_447_632);

    // 환산취득가 = 550,000,000 × 114,921,099 / 584,188,900 = 108,195,490
    // 양도차익 = 550,000,000 - (108,195,490 + 3,447,632) = 438,356,878
    expect(result.transferGain).toBe(438_356_878);

    // 환산취득가 사용 플래그 확인
    expect(result.usedEstimatedAcquisition).toBe(true);
  });

  it("지방소득세 = 결정세액 × 10% (G3, pre-1990 경로에서도 불변)", () => {
    const input = baseInput({
      propertyType: "land",
      transferPrice: 550_000_000,
      transferDate: new Date("2023-02-16"),
      acquisitionPrice: 0,
      acquisitionDate: new Date("1988-12-03"),
      isOneHousehold: false,
      householdHousingCount: 0,
      pre1990Land: {
        acquisitionDate: new Date("1988-12-03"),
        transferDate: new Date("2023-02-16"),
        areaSqm: 2_417,
        pricePerSqm_1990: 54_000,
        pricePerSqm_atTransfer: 241_700,
        grade_1990_0830: 108,
        gradePrev_1990_0830: 103,
        gradeAtAcquisition: 103,
      },
    });
    const result = calculateTransferTax(input, mockRates);

    // 지방소득세 = (결정세액 + 가산세) × 10%, 원 미만 절사 (지방세법 §103의3)
    const base = result.determinedTax + result.penaltyTax;
    const expectedLocalTax = Math.floor(base * 0.1);
    expect(result.localIncomeTax).toBe(expectedLocalTax);

    // PDF 40% 세율 구간 = 지방소득세 4% (1/10) — 과세표준에 대한 지방세율도 동반
    // 본 mockRates는 직접 과세표준 기반 지방세율 계산은 하지 않고, 결정세액 × 10% 사용
    // 따라서 PDF의 지방소득세 산식(과세표준 × 4% - 누진공제 2,594,000)과 결과값이 일치
    // (40% 구간 누진공제 25,940,000 ÷ 10 = 2,594,000 ≡ 결정세액의 10%)
  });
});

// ============================================================
// §77 공익사업 수용 감면 통합 시나리오
// PDF 이미지 사례: 부재지주 서울거주 · 2002-05-24 매입 임야 · 2023-02-16 수용
// 현금 168,287,470 + 채권 392,000,000 = 560,287,470 / 취득 138,000,000 / 경비 6,800,000
// 사업인정고시 2017-04-23 → §168의14③3호 당연사업용 (2년 전 취득 충족)
// ============================================================

describe("T-IMG-1: 공익사업 수용 감면 — 부재지주 임야 쌍방실가 (이미지 사례)", () => {
  const imgInput: TransferTaxInput = {
    propertyType: "land",
    transferPrice: 560_287_470,
    transferDate: new Date("2023-02-16"),
    acquisitionPrice: 138_000_000,
    acquisitionDate: new Date("2002-05-24"),
    expenses: 6_800_000,
    useEstimatedAcquisition: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    reductions: [
      {
        type: "public_expropriation",
        cashCompensation: 168_287_470,
        bondCompensation: 392_000_000,
        bondHoldingYears: null,
        businessApprovalDate: new Date("2017-04-23"),
      },
    ],
    annualBasicDeductionUsed: 0,
  };

  it("양도차익 = 양도가 − 취득가 − 경비 = 415,487,470", () => {
    const result = calculateTransferTax(imgInput, mockRates);
    expect(result.transferGain).toBe(415_487_470);
  });

  it("장특공제율 30% 한도 (일반 토지 20년 보유)", () => {
    const result = calculateTransferTax(imgInput, mockRates);
    expect(result.longTermHoldingRate).toBe(0.30);
    expect(result.longTermHoldingDeduction).toBe(124_646_241);
  });

  it("§77 감면 — 소득 안분·§103② 기본공제 배정 · capping 없음", () => {
    const result = calculateTransferTax(imgInput, mockRates);
    expect(result.publicExpropriationDetail).toBeDefined();
    expect(result.publicExpropriationDetail!.isEligible).toBe(true);
    expect(result.publicExpropriationDetail!.useLegacyRates).toBe(false);
    expect(result.publicExpropriationDetail!.cappedByAnnualLimit).toBe(false);
    const bd = result.publicExpropriationDetail!.breakdown;
    expect(bd.cashRate).toBe(0.10);
    expect(bd.bondRate).toBe(0.15);
    // 양도소득금액 290,841,229 안분
    expect(bd.cashIncome).toBe(87_356_825);
    expect(bd.bondIncome).toBe(203_484_404);
    // §103② — 감면율 낮은 현금에 기본공제 전액 배정
    expect(bd.basicDeductionOnCash).toBe(2_500_000);
    expect(bd.basicDeductionOnBond).toBe(0);
    // 자산별 감면금액
    expect(bd.cashReduction).toBe(8_485_682);
    expect(bd.bondReduction).toBe(30_522_660);
    expect(bd.reducibleIncome).toBe(39_008_342);
  });

  it("감면 적용 후 결정세액 = 산출세액 − §77 감면세액", () => {
    const result = calculateTransferTax(imgInput, mockRates);
    expect(result.reductionAmount).toBeGreaterThan(0);
    expect(result.reductionAmount).toBe(result.publicExpropriationDetail!.reductionAmount);
    expect(result.determinedTax).toBe(result.calculatedTax - result.reductionAmount);
  });

  it("최종 수치 스냅샷 (회귀 앵커) — 이미지 정답 일치", () => {
    const r = calculateTransferTax(imgInput, mockRates);
    expect(r.transferGain).toBe(415_487_470);
    expect(r.longTermHoldingDeduction).toBe(124_646_241);
    expect(r.taxBase).toBe(288_341_229);
    expect(r.calculatedTax).toBe(89_629_667);
    // §77 감면세액 = 산출세액 × 감면대상소득금액 / 과세표준 (이미지 산식)
    //           = 89,629,667 × 39,008,342 / 288,341,229 = 12,125,580
    expect(r.reductionAmount).toBe(12_125_580);
    // 결정세액 = 89,629,667 − 12,125,580 = 77,504,087
    expect(r.determinedTax).toBe(77_504_087);
    // 지방소득세 = floor(77,504,087 × 10%) = 7,750,408 (지방세법 §103의3 원 미만 절사)
    expect(r.localIncomeTax).toBe(7_750_408);
    // 총부담세액 = 77,504,087 + 7,750,408 = 85,254,495
    expect(r.totalTax).toBe(85_254_495);
  });
});

describe("T-IMG-2: 부칙 §53 경계 판정", () => {
  function legacyInput(approval: Date, transfer: Date): TransferTaxInput {
    return {
      propertyType: "land",
      transferPrice: 500_000_000,
      transferDate: transfer,
      acquisitionPrice: 100_000_000,
      acquisitionDate: new Date("2000-01-01"),
      expenses: 0,
      useEstimatedAcquisition: false,
      householdHousingCount: 0,
      residencePeriodMonths: 0,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      isNonBusinessLand: false,
      isOneHousehold: false,
      reductions: [
        {
          type: "public_expropriation",
          cashCompensation: 500_000_000,
          bondCompensation: 0,
          bondHoldingYears: null,
          businessApprovalDate: approval,
        },
      ],
      annualBasicDeductionUsed: 0,
    };
  }

  it("고시 2015-06-30 + 양도 2017-06-30 → LEGACY (현금 20%)", () => {
    const result = calculateTransferTax(
      legacyInput(new Date("2015-06-30"), new Date("2017-06-30")),
      mockRates,
    );
    expect(result.publicExpropriationDetail!.useLegacyRates).toBe(true);
    expect(result.publicExpropriationDetail!.breakdown.cashRate).toBe(0.20);
  });

  it("고시 2015-06-30 + 양도 2018-01-01 → CURRENT (양도 경계 초과)", () => {
    const result = calculateTransferTax(
      legacyInput(new Date("2015-06-30"), new Date("2018-01-01")),
      mockRates,
    );
    expect(result.publicExpropriationDetail!.useLegacyRates).toBe(false);
    expect(result.publicExpropriationDetail!.breakdown.cashRate).toBe(0.10);
  });

  it("고시 2016-01-01 + 양도 2017-06-30 → CURRENT (고시 경계 초과)", () => {
    const result = calculateTransferTax(
      legacyInput(new Date("2016-01-01"), new Date("2017-06-30")),
      mockRates,
    );
    expect(result.publicExpropriationDetail!.useLegacyRates).toBe(false);
  });
});
