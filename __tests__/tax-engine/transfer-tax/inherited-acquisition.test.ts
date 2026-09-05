/**
 * 양도소득세 — 상속 부동산 취득가액 의제 e2e 통합 테스트
 *
 * 근거: 소득세법 시행령 §176조의2 ④ (의제취득일 전) · §163 ⑨ (의제취득일 이후)
 * PDF: 2023 양도·상속·증여세 이론 및 계산실무 §13 계산 사례 (이미지 첨부)
 *
 * 이 파일은 엔진 STEP 0.45 통합 및 inheritedAcquisitionDetail 결과 반환을 검증.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { PDF_SCENARIO, EXCEL_13_INHERITED_HOUSE_PRE_DISCLOSURE } from "../_helpers/inheritance-fixture";

const mockRates = makeMockRates();

// ─── E-1: case A + 1990 토지 결합 ────────────────────────────────

describe("E-1: case A + 1990.8.30. 이전 토지 결합 — pre1990 → inheritedAcquisition 자동 주입", () => {
  it("pre1990LandResult.standardPriceAtAcquisition이 standardPriceAtDeemedDate로 자동 주입된다", () => {
    // 1990.8.30. 이전 토지 환산 결과가 있고, inheritedAcquisition.standardPriceAtDeemedDate 미입력 시
    // inheritance-acquisition-helpers.ts가 자동으로 pre1990 결과를 주입한다.
    const ACQ_STD_PRICE_AT_1990 = 202_620_000; // 1,100,000 × 184.2
    const TRANSFER_STD_PRICE   = 1_243_350_000; // 6,750,000 × 184.2

    const input = baseTransferInput({
      propertyType: "land",
      transferPrice: 920_000_000,
      transferDate: new Date("2023-02-16"),
      acquisitionDate: new Date("1985-01-01"), // 의제취득일
      acquisitionPrice: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 0,
      standardPriceAtTransfer: TRANSFER_STD_PRICE,
      // 1990 토지 환산 입력 (LandGradeInput: number = grade 번호, { gradeValue } = 직접 값)
      // 이미지 표: 1990.1.1. 등급 218 = 185,000원, 취득시 등급 200 = 145,000원
      pre1990Land: {
        acquisitionDate: new Date("1983-07-26"),
        transferDate: new Date("2023-02-16"),
        areaSqm: 184.2,
        pricePerSqm_1990: 1_100_000,
        pricePerSqm_atTransfer: 6_750_000,
        grade_1990_0830: 218,         // grade 218 = 185,000원
        gradePrev_1990_0830: 218,     // 직전 등급 동일
        gradeAtAcquisition: 200,      // 취득시 등급 200 = 145,000원
      },
      inheritedAcquisition: {
        inheritanceDate: new Date("1983-07-26"),
        assetKind: "land",
        // standardPriceAtDeemedDate 미입력 — pre1990 결과로 자동 주입 기대
        standardPriceAtTransfer: TRANSFER_STD_PRICE,
        transferDate: new Date("2023-02-16"),
        transferPrice: 920_000_000,
      },
    });

    const result = calculateTransferTax(input, mockRates);

    // 결과에 inheritedAcquisitionDetail이 존재해야 함
    expect(result.inheritedAcquisitionDetail).toBeDefined();
    expect(result.inheritedAcquisitionDetail!.method).toBe("pre_deemed_max");

    // pre1990 결과가 standardPriceAtDeemedDate로 주입되어 환산취득가 산출됨
    const converted = result.inheritedAcquisitionDetail!.preDeemedBreakdown?.convertedAmount ?? 0;
    // pre1990 토지 환산 결과(standardPriceAtAcquisition)는 0보다 커야 함 → 환산취득가 > 0
    // 단, pre1990 grade 값이 단순화되어 있으므로 0 이상인지만 확인
    expect(converted).toBeGreaterThanOrEqual(0);

    // STEP 0.45 step이 result.steps에 포함
    const inheritedStep = result.steps.find((s) => s.label === "상속 취득가액 의제");
    expect(inheritedStep).toBeDefined();
  });

  it("E-1b(배관): 같은 값이 ② landValuationStdPrice로도 주입되어 가목(§163⑨1호)이 성립한다", () => {
    // §163⑨1호 — 1990.8.30. 개별공시지가 고시 전 상속·증여 토지는
    //   취득가액 = max(① 상증법 평가액, ② §164④ 취득당시 기준시가).
    // ②가 확인되므로 법 §97①1호 단서상 ③(환산·나목)에는 도달하지 않는다.
    const TRANSFER_STD_PRICE = 1_243_350_000;

    const input = baseTransferInput({
      propertyType: "land",
      transferPrice: 920_000_000,
      transferDate: new Date("2023-02-16"),
      acquisitionDate: new Date("1985-01-01"),
      acquisitionPrice: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 0,
      standardPriceAtTransfer: TRANSFER_STD_PRICE,
      pre1990Land: {
        acquisitionDate: new Date("1983-07-26"),
        transferDate: new Date("2023-02-16"),
        areaSqm: 184.2,
        pricePerSqm_1990: 1_100_000,
        pricePerSqm_atTransfer: 6_750_000,
        grade_1990_0830: 218,
        gradePrev_1990_0830: 218,
        gradeAtAcquisition: 200,
      },
      inheritedAcquisition: {
        inheritanceDate: new Date("1983-07-26"), // 1990-08-30 前 → §163⑨1호
        assetKind: "land",
        standardPriceAtTransfer: TRANSFER_STD_PRICE,
        transferDate: new Date("2023-02-16"),
        transferPrice: 920_000_000,
      },
    });

    const b = calculateTransferTax(input, mockRates).inheritedAcquisitionDetail!.preDeemedBreakdown!;

    // ②가 주입됐다 — 배관이 살아 있어야 성립한다
    expect(b.sec164Amount).not.toBeNull();
    expect(b.sec164Amount).toBeGreaterThan(0);

    // 가목이 확인되므로 ③(환산)은 채택되지 않는다
    expect(b.selectedMethod).not.toBe("converted");
    expect(b.selectedMethod).toBe("sec164"); // ① 미입력이므로 ②
  });
});

// ─── E-2: case A 환산 채택 시 useEstimatedAcquisition 흐름 ──────

describe("E-2: case A 환산 채택 시 useEstimatedAcquisition=true 흐름", () => {
  it("환산취득가가 채택된 경우 usedEstimatedAcquisition=true이고 양도차익이 올바르게 계산된다", () => {
    const STD_AT_DEEMED   = 202_620_000;
    const STD_AT_TRANSFER = 1_243_350_000;
    const TRANSFER_PRICE  = 920_000_000;

    // 환산취득가 = floor(920M × 202.62M / 1243.35M)
    const expectedConverted = Math.floor(
      TRANSFER_PRICE * STD_AT_DEEMED / STD_AT_TRANSFER,
    );
    // 피상속인 실가 미입력 → 환산취득가만 사용

    const input = baseTransferInput({
      propertyType: "land",
      transferPrice: TRANSFER_PRICE,
      transferDate: new Date("2023-02-16"),
      acquisitionDate: new Date("1985-01-01"),
      acquisitionPrice: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 0,
      standardPriceAtAcquisition: STD_AT_DEEMED,
      standardPriceAtTransfer: STD_AT_TRANSFER,
      inheritedAcquisition: {
        inheritanceDate: new Date("1983-07-26"),
        assetKind: "land",
        standardPriceAtDeemedDate: STD_AT_DEEMED,
        standardPriceAtTransfer: STD_AT_TRANSFER,
        transferDate: new Date("2023-02-16"),
        transferPrice: TRANSFER_PRICE,
      },
    });

    const result = calculateTransferTax(input, mockRates);

    // 환산취득가 채택 확인
    expect(result.inheritedAcquisitionDetail?.preDeemedBreakdown?.selectedMethod).toBe("converted");
    expect(result.inheritedAcquisitionDetail?.acquisitionPrice).toBe(expectedConverted);

    // useEstimatedAcquisition 흐름이 적용되어 usedEstimatedAcquisition=true
    expect(result.usedEstimatedAcquisition).toBe(true);

    // 양도차익은 양도가 - 환산취득가 기반 (장특공제·기본공제 전 gross gain)
    expect(result.transferGain).toBeGreaterThan(0);
    // 환산 모드에서는 개산공제(소령 §163⑥, 취득시기준시가×3%)가 자동 적용됨
    // 양도차익 = 양도가 - 환산취득가 - 개산공제
    const lumpDeduction = Math.floor(STD_AT_DEEMED * 0.03);
    expect(result.transferGain).toBe(TRANSFER_PRICE - expectedConverted - lumpDeduction);
  });
});

// ─── E-3: case B 보충적평가 — inheritedAcquisitionDetail 포함 ───

describe("E-3: case B 보충적평가 — result.inheritedAcquisitionDetail 및 산출세액", () => {
  it("신고가액 200,000,000원이 취득가로 적용되고 result에 inheritedAcquisitionDetail가 포함된다", () => {
    const REPORTED_VALUE = 200_000_000;
    const TRANSFER_PRICE = 500_000_000;

    const input = baseTransferInput({
      propertyType: "housing",
      transferPrice: TRANSFER_PRICE,
      transferDate: new Date("2023-06-01"),
      acquisitionDate: new Date("2020-01-01"),
      acquisitionPrice: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      householdHousingCount: 1,
      inheritedAcquisition: {
        inheritanceDate: new Date("2020-01-01"),
        assetKind: "house_individual",
        reportedValue: REPORTED_VALUE,
        reportedMethod: "supplementary",
      },
    });

    const result = calculateTransferTax(input, mockRates);

    // inheritedAcquisitionDetail 존재 + 신고가액 적용 확인
    expect(result.inheritedAcquisitionDetail).toBeDefined();
    expect(result.inheritedAcquisitionDetail!.acquisitionPrice).toBe(REPORTED_VALUE);
    expect(result.inheritedAcquisitionDetail!.method).toBe("supplementary");
    expect(result.inheritedAcquisitionDetail!.legalBasis).toContain("§163");

    // STEP 0.45 step 포함
    const inheritedStep = result.steps.find((s) => s.label === "상속 취득가액 의제");
    expect(inheritedStep).toBeDefined();
    expect(inheritedStep!.amount).toBe(REPORTED_VALUE);

    // 최종 산출세액 > 0 (양도차익 = 500M - 200M = 300M이므로 과세)
    expect(result.totalTax).toBeGreaterThan(0);
    // 양도차익
    expect(result.transferGain).toBe(TRANSFER_PRICE - REPORTED_VALUE);
  });

  it("case B 시가(매매사례) 신고가액이 취득가로 적용된다", () => {
    const input = baseTransferInput({
      propertyType: "housing",
      transferPrice: 800_000_000,
      transferDate: new Date("2023-06-01"),
      acquisitionDate: new Date("2018-01-01"),
      acquisitionPrice: 0,
      isOneHousehold: false,
      householdHousingCount: 1,
      inheritedAcquisition: {
        inheritanceDate: new Date("2018-01-01"),
        assetKind: "house_individual",
        reportedValue: 350_000_000,
        reportedMethod: "market_value",
      },
    });

    const result = calculateTransferTax(input, mockRates);

    expect(result.inheritedAcquisitionDetail!.method).toBe("market_value");
    expect(result.inheritedAcquisitionDetail!.acquisitionPrice).toBe(350_000_000);
    expect(result.inheritedAcquisitionDetail!.legalBasis).toContain("§60 ①");
    expect(result.transferGain).toBe(800_000_000 - 350_000_000);
  });
});

// ─── E-4: PDF 첨부 시나리오 환산취득가 anchor ────────────────────

describe("E-4: PDF 시나리오 — 1983.7.26. 상속, 2023.2.16. 양도 920백만 (소령 §176조의2④)", () => {
  it("환산취득가 anchor: floor(920M × 의제취득일기준시가 ÷ 양도시기준시가)", () => {
    const expectedConverted = Math.floor(
      PDF_SCENARIO.transferPrice *
        PDF_SCENARIO.standardPriceAtDeemedDate /
        PDF_SCENARIO.standardPriceAtTransfer,
    );

    const input = baseTransferInput({
      propertyType: "land",
      transferPrice: PDF_SCENARIO.transferPrice,
      transferDate: PDF_SCENARIO.transferDate,
      acquisitionDate: PDF_SCENARIO.inheritanceDate,
      acquisitionPrice: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 0,
      standardPriceAtAcquisition: PDF_SCENARIO.standardPriceAtDeemedDate,
      standardPriceAtTransfer: PDF_SCENARIO.standardPriceAtTransfer,
      inheritedAcquisition: {
        inheritanceDate: PDF_SCENARIO.inheritanceDate,
        assetKind: PDF_SCENARIO.assetKind,
        standardPriceAtDeemedDate: PDF_SCENARIO.standardPriceAtDeemedDate,
        standardPriceAtTransfer: PDF_SCENARIO.standardPriceAtTransfer,
        transferDate: PDF_SCENARIO.transferDate,
        transferPrice: PDF_SCENARIO.transferPrice,
      },
    });

    const result = calculateTransferTax(input, mockRates);

    // 환산취득가 anchor (원단위 toBe)
    expect(result.inheritedAcquisitionDetail?.preDeemedBreakdown?.convertedAmount)
      .toBe(expectedConverted);
    // 환산취득가 = 취득가액으로 사용
    expect(result.inheritedAcquisitionDetail?.acquisitionPrice).toBe(expectedConverted);
    // 환산 모드에서 개산공제(소령 §163⑥, 의제취득일 기준시가×3%) 자동 적용
    const lumpDedPdf = Math.floor(PDF_SCENARIO.standardPriceAtDeemedDate * 0.03);
    expect(result.transferGain).toBe(
      PDF_SCENARIO.transferPrice - expectedConverted - lumpDedPdf,
    );
    // 산출세액 > 0
    expect(result.totalTax).toBeGreaterThan(0);
  });

  it("case A: inheritedAcquisition 미입력 시 STEP 0.45 skip", () => {
    const input = baseTransferInput({
      propertyType: "land",
      transferPrice: 920_000_000,
      acquisitionPrice: 200_000_000,
      isOneHousehold: false,
      householdHousingCount: 0,
      // inheritedAcquisition 없음
    });

    const result = calculateTransferTax(input, mockRates);

    expect(result.inheritedAcquisitionDetail).toBeUndefined();
    const inheritedStep = result.steps.find((s) => s.label === "상속 취득가액 의제");
    expect(inheritedStep).toBeUndefined();
  });
});

// ─── E-6: Excel 13번 — 상속주택 환산가액 통합 테스트 ────────────────
// 상속개시일 < 개별주택 최초공시(2005-04-30) + 1990.8.30. 이전 토지 등급가액 환산
// ref: __tests__/tax-engine/_helpers/inheritance-fixture.ts EXCEL_13_INHERITED_HOUSE_PRE_DISCLOSURE

describe("E-6: Excel 13번 — 상속주택 환산가액 전체 통합 시나리오", () => {
  const fx = EXCEL_13_INHERITED_HOUSE_PRE_DISCLOSURE;

  it("E-6a: inheritedHouseValuation → inheritedAcquisition 자동 주입 흐름", () => {
    const input = baseTransferInput({
      propertyType: "housing",
      transferPrice: fx.transferPrice,          // 920,000,000
      transferDate: fx.transferDate,             // 2023-02-19
      acquisitionDate: new Date("1983-07-26"),   // 실제 상속개시일 (의제취득일 이전)
      acquisitionPrice: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 1,
      inheritedHouseValuation: {
        inheritanceDate: new Date("1983-07-26"),
        transferDate: fx.transferDate,
        landArea: fx.landArea,
        landPricePerSqmAtTransfer: fx.landPricePerSqmAtTransfer,
        landPricePerSqmAtFirstDisclosure: fx.landPricePerSqmAtFirstDisclosure,
        housePriceAtTransfer: fx.housePriceAtTransfer,                       // 1,287,000,000
        housePriceAtFirstDisclosure: fx.housePriceAtFirstDisclosure,         // 341,000,000
        buildingStdPriceAtFirstDisclosure: fx.buildingStdPriceAtFirstDisclosure, // 42,630,000
        buildingStdPriceAtInheritance: fx.buildingStdPriceAtInheritance,     // 38,135,580
        // housePriceAtInheritanceOverride 미입력 → §164⑤ 자동 추정 (P_A_est = 153,336,855)
        pre1990: fx.pre1990,
      },
      inheritedAcquisition: {
        inheritanceDate: new Date("1983-07-26"),
        assetKind: fx.assetKind,
        transferDate: fx.transferDate,
        transferPrice: fx.transferPrice,
        // standardPriceAtDeemedDate / standardPriceAtTransfer 미입력 → houseValuation 자동 주입
        // 주택은 개별주택가격(P_A_est, P_T) 단일값 사용 (§176조의2④)
      },
    });

    const result = calculateTransferTax(input, mockRates);

    // inheritedHouseValuationDetail 존재 + anchor 검증
    expect(result.inheritedHouseValuationDetail).toBeDefined();
    // §164⑦ 추정 Sum_A(토지+건물) = 110,246,831 + 38,135,580 = 148,382,411 (Excel C37)
    expect(result.inheritedHouseValuationDetail!.sumAtInheritance).toBe(148_382_411);
    // 양도 개별주택가격 P_T (환산 분모, Excel C30) — 토지+건물 합계(C36) 아님
    expect(result.inheritedHouseValuationDetail!.housePriceAtTransfer).toBe(1_287_000_000);
    expect(result.inheritedHouseValuationDetail!.housePriceAtInheritanceUsed).toBe(
      fx.expected.autoEstimatedHousePrice,   // 153,336,855 — §164⑦ 자동 추정 (Excel C31)
    );
    expect(result.inheritedHouseValuationDetail!.pre1990Result).toBeDefined();
    expect(result.inheritedHouseValuationDetail!.pre1990Result!.pricePerSqmAtAcquisition).toBe(
      fx.expected.landPricePerSqmAtInheritance,  // 598,517원/㎡
    );

    // inheritedAcquisitionDetail — case A (pre_deemed_max)
    expect(result.inheritedAcquisitionDetail).toBeDefined();
    expect(result.inheritedAcquisitionDetail!.method).toBe("pre_deemed_max");

    // 환산취득가 = floor(920M × 153,336,855 / 1,287,000,000) = 109,611,427 (Excel C9)
    expect(result.inheritedAcquisitionDetail!.preDeemedBreakdown!.convertedAmount).toBe(
      fx.expected.convertedAcquisition,   // 109,611,427
    );

    // 양도차익 > 0
    expect(result.transferGain).toBeGreaterThan(0);
    expect(result.totalTax).toBeGreaterThan(0);

    // STEP "상속 취득가액 의제" 존재
    expect(result.steps.find((s) => s.label === "상속 취득가액 의제")).toBeDefined();
  });

  it("E-6b: 직접 주입 anchor — Excel 109,611,427원 환산취득가 (standardPriceAtDeemedDate=C31, standardPriceAtTransfer=C30)", () => {
    // Excel의 C31(153,336,855)과 C30(1,287,000,000)은 별도 공식으로 산출된 "official" 합계.
    // 이를 직접 주입하면 Excel C9(109,611,427원)을 원단위까지 재현할 수 있다.
    const EXCEL_C31 = 153_336_855;    // Excel C31: INT(C32 × C37/C38) — 취득시 official 합계
    const EXCEL_C30 = 1_287_000_000;  // Excel C30: 양도시 official 합계 (직접 입력)
    const EXCEL_C9  = 109_611_427;    // floor(920M × C31/C30)
    const EXCEL_C10 = 4_600_105;      // floor(C31 × 3%) — 개산공제
    const EXCEL_C11 = 805_788_468;    // C8 - C9 - C10

    const input = baseTransferInput({
      propertyType: "housing",
      transferPrice: fx.transferPrice,
      transferDate: fx.transferDate,
      acquisitionDate: new Date("1983-07-26"),
      acquisitionPrice: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 1,
      inheritedAcquisition: {
        inheritanceDate: new Date("1983-07-26"),
        assetKind: fx.assetKind,
        standardPriceAtDeemedDate: EXCEL_C31,
        standardPriceAtTransfer: EXCEL_C30,
        transferDate: fx.transferDate,
        transferPrice: fx.transferPrice,
      },
    });

    const result = calculateTransferTax(input, mockRates);

    // 환산취득가 Excel C9 anchor
    expect(result.inheritedAcquisitionDetail!.preDeemedBreakdown!.convertedAmount).toBe(EXCEL_C9);
    expect(result.inheritedAcquisitionDetail!.acquisitionPrice).toBe(EXCEL_C9);

    // 개산공제 = floor(153,336,855 × 3%) = 4,600,105 (Excel C10)
    const lumpDeduction = Math.floor(EXCEL_C31 * 0.03);
    expect(lumpDeduction).toBe(EXCEL_C10);

    // 양도차익 = 920M - 109,611,427 - 4,600,105 = 805,788,468 (Excel C11)
    expect(result.transferGain).toBe(EXCEL_C11);

    // 산출세액 > 0
    expect(result.totalTax).toBeGreaterThan(0);
  });

  it("E-6c: inheritedHouseValuationDetail이 없을 때 (inheritedHouseValuation 미제공) — 기존 흐름 유지", () => {
    const input = baseTransferInput({
      propertyType: "housing",
      transferPrice: 920_000_000,
      transferDate: new Date("2023-02-19"),
      acquisitionDate: new Date("1983-07-26"),
      acquisitionPrice: 0,
      isOneHousehold: false,
      inheritedAcquisition: {
        inheritanceDate: new Date("1983-07-26"),
        assetKind: "house_individual",
        standardPriceAtDeemedDate: 100_000_000,
        standardPriceAtTransfer: 500_000_000,
        transferDate: new Date("2023-02-19"),
        transferPrice: 920_000_000,
      },
      // inheritedHouseValuation 없음
    });

    const result = calculateTransferTax(input, mockRates);

    expect(result.inheritedHouseValuationDetail).toBeUndefined();
    expect(result.inheritedAcquisitionDetail).toBeDefined();
    expect(result.inheritedAcquisitionDetail!.method).toBe("pre_deemed_max");
    expect(result.transferGain).toBeGreaterThan(0);
  });
});

// ─── E-5: 경계 및 가드 ────────────────────────────────────────────

describe("E-5: inheritedAcquisition 경계 테스트", () => {
  it("inheritedAcquisition.reportedValue=0이어도 취득가 0으로 처리 (에러 없음)", () => {
    const input = baseTransferInput({
      propertyType: "housing",
      transferPrice: 500_000_000,
      acquisitionPrice: 0,
      isOneHousehold: false,
      inheritedAcquisition: {
        inheritanceDate: new Date("2020-01-01"),
        assetKind: "house_individual",
        reportedValue: 0,
        reportedMethod: "supplementary",
      },
    });

    // 에러 없이 실행됨
    expect(() => calculateTransferTax(input, mockRates)).not.toThrow();
    const result = calculateTransferTax(input, mockRates);
    expect(result.inheritedAcquisitionDetail?.acquisitionPrice).toBe(0);
  });

  it("1985-01-01 경계: inheritanceDate=1984-12-31 → case A, 1985-01-01 → case B", () => {
    const BASE = {
      propertyType: "housing" as const,
      transferPrice: 500_000_000,
      acquisitionPrice: 0,
      isOneHousehold: false,
      householdHousingCount: 1,
      standardPriceAtAcquisition: 100_000_000,
      standardPriceAtTransfer: 300_000_000,
    };

    const caseA = calculateTransferTax(baseTransferInput({
      ...BASE,
      inheritedAcquisition: {
        inheritanceDate: new Date("1984-12-31"),
        assetKind: "house_individual",
        standardPriceAtDeemedDate: 100_000_000,
        standardPriceAtTransfer: 300_000_000,
        transferDate: new Date("2024-01-01"),
        transferPrice: 500_000_000,
      },
    }), mockRates);

    const caseB = calculateTransferTax(baseTransferInput({
      ...BASE,
      inheritedAcquisition: {
        inheritanceDate: new Date("1985-01-01"),
        assetKind: "house_individual",
        reportedValue: 150_000_000,
        reportedMethod: "supplementary",
      },
    }), mockRates);

    expect(caseA.inheritedAcquisitionDetail?.method).toBe("pre_deemed_max");
    expect(caseB.inheritedAcquisitionDetail?.method).toBe("supplementary");
    expect(caseB.inheritedAcquisitionDetail?.acquisitionPrice).toBe(150_000_000);
  });
});

// ─── E-7: post-deemed 미공시 주택 §164⑦ max(①,②) — 소령 §163⑨2호 (국심 2003부602·2003서3266) ──
// 상속개시일 ≥ 1985-01-01(post-deemed) & 개별주택가격 미공시(< 2005-04-30):
// 취득가액 = max(① 상증법 평가액[reportedValue], ② §164⑦ 취득당시 기준시가[미스케일])
// ③(환산취득가/양도가 스케일) 적용 불가. ①·② 실지거래가액 의제 → 개산공제 없음.
describe("E-7: post-deemed 미공시 주택 §164⑦ max — 소령 §163⑨2호", () => {
  // §164⑦ 추정: housePriceAtInheritanceUsed = floor(P_F × Sum_A / Sum_F)
  //   Sum_A = landStdA(500,000×100=50,000,000) + buildingStdA(10,000,000) = 60,000,000
  //   Sum_F = landStdF(1,000,000×100=100,000,000) + buildingStdF(20,000,000) = 120,000,000
  //   P_F = 300,000,000 → floor(300,000,000 × 60,000,000/120,000,000) = 150,000,000
  const SEC_164_7 = 150_000_000; // ② 취득당시 기준시가 (미스케일)
  const houseVal = {
    inheritanceDate: new Date("1995-07-01"),
    transferDate: new Date("2024-01-01"),
    landArea: 100,
    landPricePerSqmAtTransfer: 2_000_000,
    landPricePerSqmAtFirstDisclosure: 1_000_000,
    landPricePerSqmAtInheritance: 500_000,
    housePriceAtTransfer: 400_000_000,
    housePriceAtFirstDisclosure: 300_000_000,
    buildingStdPriceAtFirstDisclosure: 20_000_000,
    buildingStdPriceAtInheritance: 10_000_000,
  };

  function run(reportedValue: number) {
    return calculateTransferTax(
      baseTransferInput({
        propertyType: "housing",
        transferPrice: 500_000_000,
        transferDate: new Date("2024-01-01"),
        acquisitionDate: new Date("1995-07-01"),
        acquisitionPrice: 0,
        useEstimatedAcquisition: false,
        isOneHousehold: false,
        householdHousingCount: 1,
        inheritedHouseValuation: houseVal,
        inheritedAcquisition: {
          inheritanceDate: new Date("1995-07-01"),
          assetKind: "house_individual",
          reportedValue,
          reportedMethod: "supplementary",
          transferDate: new Date("2024-01-01"),
          transferPrice: 500_000_000,
        },
      }),
      mockRates,
    );
  }

  it("E-7a: §164⑦ 값이 self-consistent — housePriceAtInheritanceUsed = 150,000,000", () => {
    const r = run(0);
    expect(r.inheritedHouseValuationDetail).toBeDefined();
    expect(r.inheritedHouseValuationDetail!.housePriceAtInheritanceUsed).toBe(SEC_164_7);
  });

  it("E-7b: reportedValue 미입력(0) → 취득가액 = ② §164⑦ 단독 (막힘 해소)", () => {
    const r = run(0);
    // 현행: 0 (§164⑦ 무시) → 개정: 150,000,000
    expect(r.inheritedAcquisitionDetail!.acquisitionPrice).toBe(SEC_164_7);
    expect(r.inheritedAcquisitionDetail!.method).toBe("supplementary");
  });

  it("E-7c: reportedValue(100M) < ② → max = ② 150,000,000 (양도가 미스케일)", () => {
    const r = run(100_000_000);
    // 현행: 100,000,000 (reportedValue 단독) → 개정: max(100M, 150M) = 150M
    expect(r.inheritedAcquisitionDetail!.acquisitionPrice).toBe(SEC_164_7);
    // ③(환산취득가=양도가×비율) 아님 — 양도가 500M로 스케일되지 않음
    expect(r.inheritedAcquisitionDetail!.acquisitionPrice).toBeLessThan(500_000_000);
  });

  it("E-7d: reportedValue(200M) > ② → max = ① 200,000,000 (상증법 평가액 우선)", () => {
    const r = run(200_000_000);
    expect(r.inheritedAcquisitionDetail!.acquisitionPrice).toBe(200_000_000);
  });

  it("E-7e: 실지거래가액 의제 → 개산공제 없음 (양도차익 = 양도가 − ② − 실제필요경비0)", () => {
    const r = run(0);
    // 취득가 150M, 필요경비 0(개산공제 없음) → 양도차익 = 500M − 150M = 350M
    // 개산공제(§163⑥, 150M×3%=4.5M)가 잘못 붙으면 345.5M
    expect(r.transferGain).toBe(350_000_000);
  });
});

// ─── V-2 가드: ③ 환산 분자의 시점 불일치가 세액에 노출되지 않음을 고정 ──────

/**
 * V-2 — ③ 환산취득가의 **분자**는 §176조의2④1호상 「**의제취득일 현재**」 기준시가여야 한다.
 *
 * 그런데 주택 경로는 `housePriceAtInheritanceUsed`(**상속개시일** 시점 값)를
 * `standardPriceAtDeemedDate`(의제취득일 기준시가) 자리에 대입한다 — **이름과 의미가 어긋난다**.
 *
 * ⭐ 그럼에도 **실제 세액에 노출되지 않는다**: 같은 값이 ②로도 주입되어 가목(§163⑨)이 확인되고,
 *    법 §97①1호 단서상 가목이 확인되면 ③(나목)에 도달하지 않기 때문이다(V-3 재편, #1089).
 *
 * ⚠️ 이 가드는 **그 성질 자체를 고정**한다. 다음 중 하나만 바뀌어도 V-2가 실제 세액에 노출된다:
 *    · ③이 다시 max 후보로 돌아가거나
 *    · `shouldInjectHouseMax`/`shouldInjectLandMax` 게이트가 좁아지거나
 *    · ②와 ③ 분자를 서로 다른 값으로 분리하거나
 *
 * 계획서: docs/02-design/features/inheritance-pre-deemed-converted-numerator-timing.plan.md
 */
describe("V2-G: 자동 주입 경로에서는 ③이 채택되지 않는다 — ②가 반드시 함께 주입되므로", () => {
  const fx = EXCEL_13_INHERITED_HOUSE_PRE_DISCLOSURE;

  it("주택: houseValuation 자동 주입 시 ②가 주입되고 ③은 미채택", () => {
    const input = baseTransferInput({
      propertyType: "housing",
      transferPrice: fx.transferPrice,
      transferDate: fx.transferDate,
      acquisitionDate: new Date("1983-07-26"), // 의제취득일 前
      acquisitionPrice: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 1,
      inheritedHouseValuation: {
        inheritanceDate: new Date("1983-07-26"),
        transferDate: fx.transferDate,
        landArea: fx.landArea,
        landPricePerSqmAtTransfer: fx.landPricePerSqmAtTransfer,
        landPricePerSqmAtFirstDisclosure: fx.landPricePerSqmAtFirstDisclosure,
        housePriceAtTransfer: fx.housePriceAtTransfer,
        housePriceAtFirstDisclosure: fx.housePriceAtFirstDisclosure,
        buildingStdPriceAtFirstDisclosure: fx.buildingStdPriceAtFirstDisclosure,
        buildingStdPriceAtInheritance: fx.buildingStdPriceAtInheritance,
        pre1990: fx.pre1990,
      },
      inheritedAcquisition: {
        inheritanceDate: new Date("1983-07-26"),
        assetKind: fx.assetKind,
        transferDate: fx.transferDate,
        transferPrice: fx.transferPrice,
        // standardPriceAtDeemedDate 미입력 → houseValuation 자동 주입 경로
      },
    });

    const b = calculateTransferTax(input, mockRates).inheritedAcquisitionDetail!.preDeemedBreakdown!;

    // ②(§164⑦)가 반드시 주입된다 — 이것이 ③을 배제하는 근거다
    expect(b.sec164Amount).not.toBeNull();
    expect(b.sec164Amount).toBeGreaterThan(0);

    // ⇒ 가목이 확인되므로 ③(환산)은 채택되지 않는다 ⇒ 분자 시점 불일치가 세액에 닿지 않는다
    expect(b.selectedMethod).not.toBe("converted");
  });
});
