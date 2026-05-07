/**
 * 사례 29 — 상업용건물·오피스텔 환산취득가 (호별고시 전 취득) anchor 테스트
 *
 * 케이스 인벤토리:
 *   C-01 ★ 호별고시 전 취득 (사례 29 primary anchor)
 *   C-02    호별고시 후 취득 (단순 호별고시가 비율)
 *   C-03    실가 모드 (환산 미적용)
 *   C-04    보유기간 경계 — 14년 → 28%
 *   C-05    보유기간 경계 — 15년 → 30%
 *   C-06    보유기간 경계 — 16년 → 30% (상한 유지)
 *   C-07    validation — 호별고시가 미입력 에러
 *   C-08    validation — C-01 분기 건물기준시가 미입력 에러
 *   유닛    calcStdPriceSum·calcEstimatedStdPriceAtAcq·calcEstimatedAcquisitionTotal 단위 테스트
 *
 * anchor 정책 (절대 준수):
 *   - 산출세액·지방소득세는 2022년 양도 적용 §55 / §103조의3 정확 세율 사용
 *   - 외부 자료(양도코리아 PDF: 86,384,292 / 8,638,429) 따라가지 않음
 *   - 지방소득세 = floor(278,379,718 × 0.038 − 1,994,000) = 8,584,429 (누진 직접 계산)
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  calculateCommercialBuildingValuation,
  calcStdPriceSum,
  calcEstimatedStdPriceAtAcq,
  calcEstimatedAcquisitionTotal,
} from "@/lib/tax-engine/commercial-building-valuation";
import type { CommercialBuildingValuationInput } from "@/lib/tax-engine/commercial-building-valuation";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import {
  TRANSFER_DATE,
  ACQUISITION_DATE,
  TRANSFER_PRICE,
  EXCLUSIVE_AREA,
  COMMON_AREA,
  FLOOR_AREA_TOTAL,
  LAND_AREA,
  UNIT_PRICE_AT_TRANSFER,
  UNIT_PRICE_AT_FIRST,
  BUILDING_STD_AT_ACQ,
  BUILDING_STD_AT_FIRST,
  LAND_PRICE_AT_ACQ,
  LAND_PRICE_AT_FIRST,
  UNIT_TOTAL_AT_TRANSFER,
  UNIT_TOTAL_AT_FIRST,
  COMBINED_STD_AT_ACQ,
  COMBINED_STD_AT_FIRST,
  ESTIMATED_BASIS_AT_ACQ,
  ESTIMATED_ACQ_TOTAL,
  LUMP_SUM_DEDUCTION,
  CAPITAL_GAIN,
  LONG_TERM_RATE,
  LONG_TERM_DEDUCTION,
  INCOME_AMOUNT,
  TAX_BASE,
  CALCULATED_TAX,
  LOCAL_INCOME_TAX,
  TOTAL_TAX,
  ESTIMATED_ACQ_LAND,
  ESTIMATED_ACQ_BUILDING,
  CB_VALUATION_INPUT_C01,
  makeCase29Input,
  ACQ_DATE_14Y,
  ACQ_DATE_15Y_EXACT,
  ACQ_DATE_16Y,
} from "./_helpers/case-29-fixtures";

const mockRates = makeMockRates();

// ============================================================
// 유닛 테스트 — 개별 순수 함수
// ============================================================

describe("유닛: calcStdPriceSum (소령 §164①)", () => {
  it("C-01-유닛1: 취득시 기준시가합 = 개공지 × 대지면적 + 건물 기준시가(총액)", () => {
    const sum = calcStdPriceSum(
      LAND_PRICE_AT_ACQ,    // 3,978,096
      LAND_AREA,            // 12.57
      BUILDING_STD_AT_ACQ,  // 69,602,659.28 (총액)
    );
    // 3,978,096 × 12.57 + 69,602,659.28 = 119,607,326
    expect(Math.round(sum)).toBe(COMBINED_STD_AT_ACQ);
  });

  it("C-01-유닛1b: 최초고시시 기준시가합 = 208,560,000", () => {
    const sumF = calcStdPriceSum(
      LAND_PRICE_AT_FIRST,    // 11,060,632
      LAND_AREA,              // 12.57
      BUILDING_STD_AT_FIRST,  // 69,527,855.76 (총액)
    );
    expect(Math.round(sumF)).toBe(COMBINED_STD_AT_FIRST); // 208,560,000
  });
});

describe("유닛: calcEstimatedStdPriceAtAcq (소령 §164⑧)", () => {
  it("C-01-유닛2: P_A = INT(hobelF × Sum_A / Sum_F) = 119,607,326", () => {
    const pa = calcEstimatedStdPriceAtAcq(
      UNIT_TOTAL_AT_FIRST,    // 208,560,000
      COMBINED_STD_AT_ACQ,    // 119,607,326
      COMBINED_STD_AT_FIRST,  // 208,560,000
    );
    expect(pa).toBe(ESTIMATED_BASIS_AT_ACQ); // 119,607,326
  });
});

describe("유닛: calcEstimatedAcquisitionTotal (소령 §176조의2②2호)", () => {
  it("C-01-유닛3: 환산취득가합계 = INT(540M × P_A / hobelT) = 135,155,041 (safeMultiply 오버플로 방지)", () => {
    // 540,000,000 × 119,607,326 ≈ 6.46 × 10^16 > MAX_SAFE_INTEGER(9 × 10^15)
    const total = calcEstimatedAcquisitionTotal(
      TRANSFER_PRICE,          // 540,000,000
      ESTIMATED_BASIS_AT_ACQ,  // 119,607,326
      UNIT_TOTAL_AT_TRANSFER,  // 477,880,480
    );
    expect(total).toBe(ESTIMATED_ACQ_TOTAL); // 135,155,041
  });
});

// ============================================================
// C-01: 호별고시 전 취득 — calculateCommercialBuildingValuation 단위 테스트
// ============================================================

describe("C-01: 호별고시 전 취득 — calculateCommercialBuildingValuation", () => {
  const result = calculateCommercialBuildingValuation(CB_VALUATION_INPUT_C01, TRANSFER_PRICE);

  it("C-01-01: 환산취득가 합계 = 135,155,041", () => {
    expect(result.estimatedAcquisitionTotal).toBe(ESTIMATED_ACQ_TOTAL);
  });

  it("C-01-02: 개산공제 합계 = 3,588,219 (취득시 환산기준시가 P_A × 3%)", () => {
    expect(result.estimatedDeductionTotal).toBe(LUMP_SUM_DEDUCTION);
  });

  it("C-01-11: 환산취득가 토지분 = 56,504,756", () => {
    expect(result.estimatedAcquisitionLand).toBe(ESTIMATED_ACQ_LAND);
  });

  it("C-01-12: 환산취득가 건물분 = 78,650,285 (= 합계 − 토지분)", () => {
    expect(result.estimatedAcquisitionBuilding).toBe(ESTIMATED_ACQ_BUILDING);
  });

  it("토지분 + 건물분 = 합계", () => {
    expect(result.estimatedAcquisitionLand + result.estimatedAcquisitionBuilding)
      .toBe(result.estimatedAcquisitionTotal);
  });

  it("estimatedBasisAtAcq (P_A) = 119,607,326", () => {
    expect(result.estimatedBasisAtAcq).toBe(ESTIMATED_BASIS_AT_ACQ);
  });

  it("floorAreaTotal ≈ 69.52 (전용 + 공유, 부동소수점 허용)", () => {
    // 36 + 33.52 = 69.52000000000001 (IEEE 754 덧셈 오차 허용)
    expect(result.floorAreaTotal).toBeCloseTo(FLOOR_AREA_TOTAL, 5);
  });

  it("unitPriceTotalAtTransfer ≈ 477,880,480 (C2022 × 69.52, 부동소수점 허용)", () => {
    // 6,874,000 × 69.52 = 477,880,480.00000006 (소수 곱셈 오차 허용)
    expect(Math.round(result.unitPriceTotalAtTransfer)).toBe(UNIT_TOTAL_AT_TRANSFER);
  });

  it("unitPriceTotalAtFirst ≈ 208,560,000 (C2005 × 69.52, 부동소수점 허용)", () => {
    // 3,000,000 × 69.52 = 208,560,000.00000003 (소수 곱셈 오차 허용)
    expect(Math.round(result.unitPriceTotalAtFirst!)).toBe(UNIT_TOTAL_AT_FIRST);
  });
});

// ============================================================
// C-01: 전체 calculateTransferTax 통합 anchor
// ============================================================

describe("C-01: 사례 29 전체 계산 anchor (양도연도 2022 §55 / §103조의3 정확 세율)", () => {
  const input = makeCase29Input();
  const result = calculateTransferTax(input, mockRates);

  it("C-01-03: 양도차익 = 401,256,740 (540M − 환산취득가 − 개산공제)", () => {
    expect(result.transferGain).toBe(CAPITAL_GAIN);
  });

  it("C-01-04: 장특공률 = 30% (MIN(15,21)×2% = 상한)", () => {
    expect(result.longTermHoldingRate).toBe(LONG_TERM_RATE);
  });

  it("C-01-05: 장특공 = 120,377,022 (floor(양도차익 × 30%))", () => {
    expect(result.longTermHoldingDeduction).toBe(LONG_TERM_DEDUCTION);
  });

  it("C-01-06: 양도소득금액 = 280,879,718 (양도차익 − 장특공)", () => {
    // transferGain − longTermHoldingDeduction
    expect(result.transferGain - result.longTermHoldingDeduction).toBe(INCOME_AMOUNT);
  });

  it("C-01-07: 과세표준 = 278,379,718 (양도소득금액 − 기본공제 2,500,000, 절사 규정 없음)", () => {
    expect(result.taxBase).toBe(TAX_BASE);
  });

  it("C-01-08 ★: 산출세액 = 85,844,292 (2022 §55: 38%, 누진공제 19,940,000)", () => {
    expect(result.calculatedTax).toBe(CALCULATED_TAX);
  });

  it("C-01-09 ★: 지방소득세 = 8,584,429 (§103조의3: 3.8%, 누진공제 1,994,000 — 누진 직접 호출)", () => {
    // §103조의3 누진 산식: floor(278,379,718 × 0.038 − 1,994,000)
    // "산출세액 × 10%" 가정이 우연히 일치하는지 여부와 무관하게 절대값으로 anchor
    expect(result.localIncomeTax).toBe(LOCAL_INCOME_TAX);
  });

  it("C-01-10 ★: 총 납부세액 = 94,428,721 (산출세액 + 지방소득세)", () => {
    expect(result.totalTax).toBe(TOTAL_TAX);
  });

  it("commercialBuildingValuationDetail이 결과에 포함됨", () => {
    expect(result.commercialBuildingValuationDetail).toBeDefined();
    expect(result.commercialBuildingValuationDetail?.estimatedAcquisitionTotal)
      .toBe(ESTIMATED_ACQ_TOTAL);
    expect(result.commercialBuildingValuationDetail?.estimatedDeductionTotal)
      .toBe(LUMP_SUM_DEDUCTION);
  });

  it("usedEstimatedAcquisition = false (엔진이 실가 경로로 교체 — cbStep 분기 내부 동작)", () => {
    // 설계: STEP 0.35에서 effectiveInput.useEstimatedAcquisition=false로 교체 후 실가 경로 진입.
    // result.usedEstimatedAcquisition은 effectiveInput 기준이므로 false.
    // 환산취득가 사용 여부는 commercialBuildingValuationDetail 존재로 판단.
    expect(result.usedEstimatedAcquisition).toBe(false);
    expect(result.commercialBuildingValuationDetail).toBeDefined();
  });

  it("비과세 아님 (상업용 건물)", () => {
    expect(result.isExempt).toBe(false);
  });

  it("외부 자료(양도코리아 86,384,292)와 다름 — 2022 정확 세율 적용으로 540,000원 차이 (정상)", () => {
    // 외부 자료: 누진공제 19,400,000(2020년 이전 표) 적용 → 86,384,292
    // 본 프로젝트: 누진공제 19,940,000(2021 시행 표) 적용 → 85,844,292
    expect(result.calculatedTax).not.toBe(86_384_292);
    expect(result.calculatedTax).toBe(85_844_292);
  });
});

// ============================================================
// C-02: 호별고시 후 취득 (단순 비율 환산)
// ============================================================

describe("C-02: 호별고시 후 취득 (2005.1.1 이후)", () => {
  const cbInputC02: CommercialBuildingValuationInput = {
    isPreDisclosure:     false,
    exclusiveArea:       36,
    commonArea:          33.52,
    landArea:            12.57,
    unitPriceAtTransfer: 6_874_000,
    unitPriceAtAcquisition: 3_000_000, // C-02: 취득시 호별고시가 직접 입력
  };

  it("C-02: 환산취득가 합계 = INT(540M × 취득시호별총액 / 양도시호별총액)", () => {
    const result = calculateCommercialBuildingValuation(cbInputC02, TRANSFER_PRICE);
    const unitTotalAtAcq = 3_000_000 * FLOOR_AREA_TOTAL; // 208,560,000
    const expected = Math.floor(TRANSFER_PRICE * unitTotalAtAcq / UNIT_TOTAL_AT_TRANSFER);
    expect(result.estimatedAcquisitionTotal).toBe(expected);
  });

  it("C-02: 개산공제 = INT(취득시호별총액 × 3%)", () => {
    const result = calculateCommercialBuildingValuation(cbInputC02, TRANSFER_PRICE);
    const unitTotalAtAcq = 3_000_000 * FLOOR_AREA_TOTAL;
    const expectedDeduction = Math.floor(unitTotalAtAcq * 0.03);
    expect(result.estimatedDeductionTotal).toBe(expectedDeduction);
  });

  it("C-02: estimatedBasisAtAcq는 undefined (역환산 없음)", () => {
    const result = calculateCommercialBuildingValuation(cbInputC02, TRANSFER_PRICE);
    expect(result.estimatedBasisAtAcq).toBeUndefined();
  });
});

// ============================================================
// C-03: 실가 모드 (환산 미적용)
// ============================================================

describe("C-03: 실가 모드 (useEstimatedAcquisition=false)", () => {
  it("C-03: commercialBuildingValuation 있어도 환산 분기 미진입 — 취득가 직접 사용", () => {
    const input = makeCase29Input({
      useEstimatedAcquisition: false,
      acquisitionPrice: 100_000_000,
      expenses: 5_000_000,
    });
    const result = calculateTransferTax(input, mockRates);
    // 환산 분기 미진입: 양도차익 = 540M - 100M - 5M = 435M
    expect(result.transferGain).toBe(435_000_000);
    expect(result.commercialBuildingValuationDetail).toBeUndefined();
    expect(result.usedEstimatedAcquisition).toBe(false);
  });
});

// ============================================================
// C-04 ~ C-06: 보유기간 경계 테스트 (소법 §95④ 1년 미만 절사)
// ============================================================

describe("C-04: 보유기간 14년 → 장특공률 28% (소법 §95② 표1)", () => {
  it("취득일 2007-03-16 → 기산 2007-03-17 → 양도 2022-02-16 = 14년 → MIN(15,14)×2% = 28%", () => {
    const input = makeCase29Input({ acquisitionDate: ACQ_DATE_14Y });
    const result = calculateTransferTax(input, mockRates);
    expect(result.longTermHoldingRate).toBe(0.28);
  });
});

describe("C-05: 보유기간 정확히 15년 → 장특공률 30%", () => {
  it("취득일 2007-02-15 → 기산 2007-02-16 → 양도 2022-02-16 = 정확히 15년 → MIN(15,15)×2% = 30%", () => {
    const input = makeCase29Input({ acquisitionDate: ACQ_DATE_15Y_EXACT });
    const result = calculateTransferTax(input, mockRates);
    expect(result.longTermHoldingRate).toBe(0.30);
  });
});

describe("C-06: 보유기간 16년 → 장특공률 30% (상한 유지)", () => {
  it("16년 보유해도 MIN(15,16)×2% = 30% — 15년 이상은 모두 30% 상한", () => {
    const input = makeCase29Input({ acquisitionDate: ACQ_DATE_16Y });
    const result = calculateTransferTax(input, mockRates);
    expect(result.longTermHoldingRate).toBe(0.30);
  });
});

// ============================================================
// C-07: Validation — 호별고시가 미입력
// ============================================================

describe("C-07: validation — 호별고시가 미입력 시 에러", () => {
  it("unitPriceAtFirstDisclosure 없으면 calculateCommercialBuildingValuation가 Error를 던짐", () => {
    const badInput: CommercialBuildingValuationInput = {
      isPreDisclosure:              true,
      exclusiveArea:                36,
      commonArea:                   33.52,
      landArea:                     12.57,
      unitPriceAtTransfer:          6_874_000,
      // unitPriceAtFirstDisclosure: 누락
      buildingStdPriceAtAcquisition:     1_001_189,
      buildingStdPriceAtFirstDisclosure: 1_000_113,
      landPriceAtAcquisition:       3_978_096,
      landPriceAtFirstDisclosure:   11_060_632,
    };
    expect(() => calculateCommercialBuildingValuation(badInput, TRANSFER_PRICE)).toThrow();
  });
});

// ============================================================
// C-08: Validation — C-01 분기 건물기준시가 미입력
// ============================================================

describe("C-08: validation — 건물기준시가 미입력 시 에러", () => {
  it("buildingStdPriceAtAcquisition 없으면 Error를 던짐", () => {
    const badInput: CommercialBuildingValuationInput = {
      isPreDisclosure:              true,
      exclusiveArea:                36,
      commonArea:                   33.52,
      landArea:                     12.57,
      unitPriceAtTransfer:          6_874_000,
      unitPriceAtFirstDisclosure:   3_000_000,
      // buildingStdPriceAtAcquisition: 누락
      buildingStdPriceAtFirstDisclosure: 1_000_113,
      landPriceAtAcquisition:       3_978_096,
      landPriceAtFirstDisclosure:   11_060_632,
    };
    expect(() => calculateCommercialBuildingValuation(badInput, TRANSFER_PRICE)).toThrow();
  });

  it("buildingStdPriceAtFirstDisclosure 없으면 Error를 던짐", () => {
    const badInput: CommercialBuildingValuationInput = {
      isPreDisclosure:              true,
      exclusiveArea:                36,
      commonArea:                   33.52,
      landArea:                     12.57,
      unitPriceAtTransfer:          6_874_000,
      unitPriceAtFirstDisclosure:   3_000_000,
      buildingStdPriceAtAcquisition:     1_001_189,
      // buildingStdPriceAtFirstDisclosure: 누락
      landPriceAtAcquisition:       3_978_096,
      landPriceAtFirstDisclosure:   11_060_632,
    };
    expect(() => calculateCommercialBuildingValuation(badInput, TRANSFER_PRICE)).toThrow();
  });
});

// ============================================================
// 지방소득세 anchor 보충 — "산출세액 × 10%" 단순 곱셈 가정 vs 누진 직접 계산
// ============================================================

describe("지방소득세 §103조의3 누진 계산 vs 단순 10% 비교 anchor", () => {
  it("floor(85,844,292 × 0.1) = 8,584,429 — 이번 케이스 우연히 일치, 일반화 금지", () => {
    // 이 케이스에서는 두 값이 같지만, 다른 과세표준에서는 다를 수 있음
    const tenPercent = Math.floor(85_844_292 * 0.1);
    expect(tenPercent).toBe(8_584_429);
    expect(tenPercent).toBe(LOCAL_INCOME_TAX); // 이번엔 일치
  });

  it("§103조의3 누진 산식 직접 검증: floor(278,379,718 × 0.038 − 1,994,000) = 8,584,429", () => {
    const directCalc = Math.floor(278_379_718 * 0.038 - 1_994_000);
    expect(directCalc).toBe(LOCAL_INCOME_TAX);
  });
});
