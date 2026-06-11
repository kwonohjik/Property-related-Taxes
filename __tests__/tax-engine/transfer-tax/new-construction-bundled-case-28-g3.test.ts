/**
 * 사례 28 Group F — §99의3 감면 × 부수토지 일체과세 (G-3 cross-cutting anchor)
 *
 * 법령 쟁점:
 *   §99의3(신축주택 과세특례)은 STEP 4.6에서 양도소득금액 차감 방식으로 처리.
 *   부수토지 일체과세 70%는 STEP 7 세율 결정에서 처리.
 *   두 메커니즘은 서로 독립적 — §99의3이 건물 양도소득금액을 차감해도
 *   토지 세율(70%)에는 영향 없음. 역으로, 토지 70% 세율은 건물 §99의3 감면과 무관.
 *
 * 법령 모호성 (설계 문서 의문점):
 *   §99의3은 "신축주택과 그 부수토지"를 합산한 양도소득에 적용할 수 있으나
 *   (소득세법 §89①3호 일체 원칙 준용 가능성),
 *   현행 엔진은 자산별 단건 입력이므로 건물 입력에만 new_99_3 reduction을 연결한다.
 *   토지 입력에는 별도 §99의3 적용이 없음(reductions=[] 기본값).
 *   이 분리 처리가 실무상 올바른지는 별도 검토 필요.
 *
 * 가상 케이스 설정 (취득기간 내 시나리오):
 *   자기건설(self_built) 신축주택, 사용승인일 2002-01-01 (취득기간 2001.5.23~2003.6.30 내)
 *   5년 이내 양도일 2006-06-01 / 5년 후 양도일 2023-03-06 — 나머지 수치는 사례 28 원본 동일
 *
 * 원본 테스트 (Group A~E, T-01~T-24):
 *   new-construction-bundled-case-28.test.ts
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates } from "../_helpers/mock-rates";
import {
  BUILDING_ALLOC_PRICE,
  BUILDING_ACQ_PRICE,
  BUILDING_FOOTPRINT,
  BUILDING_GAIN,
  TRANSFER_DATE,
  makeBuildingInput,
} from "./_helpers/case-28-fixtures";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

// ============================================================
// G-3 상수
// ============================================================

// 가상 사용승인일: 취득기간(2001.5.23~2003.6.30) 내
const F993_USAGE_APPROVAL_DATE = new Date("2002-01-01");

// 5년 이내 양도일 (2002-01-01 + 4년 5개월)
const F993_TRANSFER_DATE_WITHIN_5Y = new Date("2006-06-01");

// 건물 양도차익 = 82,457,619 (취득 2002-01-01, 양도 2006-06-01)
const F993_BUILDING_INCOME = BUILDING_GAIN; // 82,457,619

// 실제 가상 케이스 보유기간: 4년 5개월 → LTHD 4년분 8% (일반, 연 2%)
//   양도소득금액 = 82,457,619 - floor(82,457,619 × 0.08) = 75,861,010
//   taxBase(감면 전) = max(0, 75,861,010 - 2,500,000) = 73,361,010
//   Mock 누진세율 구간: 50,000,001~88,000,000 → 24%, 누진공제 5,760,000
//   calcTaxBefore = floor(73,361,010 × 0.24) - 5,760,000 = 11,846,642
//   §99의3 5년 이내 전액 감면 → calcTaxAfter = 0
//   ruralSurtax = floor(11,846,642 × 0.20) = 2,369,328
//   totalTax = 0(finalTax) + 0(localTax) + 2,369,328(ruralSurtax993) = 2,369,328
const F993_CALC_TAX_BEFORE = 11_846_642; // 감면 전 산출세액
const F993_RURAL_SURTAX    = 2_369_328;  // 농특세

// §99의3 기준시가 (가상값)
const F993_STD_AT_ACQ      = 50_000_000;
const F993_STD_AT_5Y       = 80_000_000;
const F993_STD_AT_TRANSFER = 93_571_201; // 건물 기준시가 (사례 28 원본 동일)

// ============================================================
// 헬퍼 팩토리
// ============================================================

/** 건물 단건 입력 — §99의3 감면 포함 (5년 이내 양도) */
function makeBuildingInputWith993Within5Y(
  overrides?: Partial<TransferTaxInput>,
): TransferTaxInput {
  return makeBuildingInput({
    transferDate: F993_TRANSFER_DATE_WITHIN_5Y,
    acquisitionDate: F993_USAGE_APPROVAL_DATE,
    reductions: [
      {
        type: "new_99_3",
        acquisitionType993: "self_built",
        usageApprovalDate993: "2002-01-01",
        region993: "outside_speculation",
        isResident993: true,
        isHousingConstructionBusiness993: false,
        standardPriceAtAcquisition993: F993_STD_AT_ACQ,
        standardPriceAt5Years: F993_STD_AT_5Y,
        standardPriceAtTransfer993: F993_STD_AT_TRANSFER,
      },
    ],
    ...overrides,
  });
}

/** 건물 단건 입력 — §99의3 감면 포함 (5년 후 양도, 사례 28 원본 날짜) */
function makeBuildingInputWith993After5Y(
  overrides?: Partial<TransferTaxInput>,
): TransferTaxInput {
  return makeBuildingInput({
    transferPrice: BUILDING_ALLOC_PRICE,
    transferDate: TRANSFER_DATE,          // 2023-03-06 (취득 2002-01-01 기준 21년 후)
    acquisitionDate: F993_USAGE_APPROVAL_DATE,
    acquisitionPrice: BUILDING_ACQ_PRICE,
    reductions: [
      {
        type: "new_99_3",
        acquisitionType993: "self_built",
        usageApprovalDate993: "2002-01-01",
        region993: "outside_speculation",
        isResident993: true,
        isHousingConstructionBusiness993: false,
        standardPriceAtAcquisition993: F993_STD_AT_ACQ,
        standardPriceAt5Years: F993_STD_AT_5Y,
        standardPriceAtTransfer993: F993_STD_AT_TRANSFER,
      },
    ],
    ...overrides,
  });
}

// ============================================================
// Group F — T-25 ~ T-28b
// ============================================================

describe("사례 28 Group F — §99의3 감면 × 부수토지 일체과세 (G-3 cross-cutting, 조특법 §99의3)", () => {
  /**
   * T-25: §99의3 5년 이내 전액 감면 — 건물 산출세액 = 0, totalTax = ruralSurtax993
   *
   * 건물(취득 2002-01-01, 양도 2006-06-01, 보유 4년 5개월):
   *   양도차익 = 82,457,619
   *   LTHD = floor(82,457,619 × 8%) = 6,596,609 (4년분, 일반 연 2%)
   *   양도소득금액 = 75,861,010
   *   §99의3 5년 이내 전액 감면 → 감면 후 양도소득금액 = 0
   *   과세표준 = max(0, 0 - 2,500,000) = 0 → 산출세액 = 0
   *   totalTax = 0(finalTax) + 0(localTax) + 2,369,328(ruralSurtax993) = 2,369,328
   *
   * 부수토지 일체과세 70%는 토지 단건에 별도 작동 — 건물 §99의3과 독립.
   */
  it("T-25 §99의3 5년 이내 전액 감면 — 건물 산출세액 = 0, totalTax = ruralSurtax993", () => {
    const result = calculateTransferTax(makeBuildingInputWith993Within5Y(), makeMockRates());
    expect(result.calculatedTax).toBe(0);
    // totalTax = ruralSurtax993(2,369,328) — §99의3 농특세가 포함됨
    expect(result.totalTax).toBe(F993_RURAL_SURTAX); // 2,369,328
    expect(result.new993Detail?.isEligible).toBe(true);
    expect(result.new993Detail?.isWithin5Years).toBe(true);
    // reducibleTransferIncome = max(0, 양도소득금액) = 75,861,010 (LTHD 차감 후)
    // F993_BUILDING_INCOME(82,457,619)과 다름 — 엔진이 양도소득금액(LTHD 차감 후)을 기준으로 함
    expect(result.new993Detail?.reducibleTransferIncome).toBeGreaterThan(0);
    expect(result.new993Detail?.isWithin5Years).toBe(true);
  });

  /**
   * T-26: §99의3 5년 이내 감면 — 농특세 검증
   *
   * 감면 전 산출세액: floor(73,361,010 × 0.24) - 5,760,000 = 11,846,642
   *   (Mock 세율표: 50,000,001~88,000,000 → 24%, 누진공제 5,760,000)
   * 감면 후 산출세액: 0
   * 농특세 = floor(11,846,642 × 20%) = 2,369,328
   */
  it("T-26 §99의3 농특세 = 2,369,328 (감면세액 11,846,642 × 20%)", () => {
    const result = calculateTransferTax(makeBuildingInputWith993Within5Y(), makeMockRates());
    expect(result.new993Detail?.taxReductionForRuralSurtax).toBe(F993_CALC_TAX_BEFORE); // 11,846,642
    expect(result.new993Detail?.ruralSurtax).toBe(F993_RURAL_SURTAX);                  // 2,369,328
  });

  /**
   * T-27: §99의3 × legacy new_housing 동시 입력 — calcReductions 감면 = 0 (자연 중복배제)
   *
   * §99의3은 STEP 4.6(양도소득금액 차감)에서 처리 → 산출세액 = 0.
   * STEP 8 calcReductions()의 new_housing 감면: min(amount, 0) = 0.
   * §99의3이 과세특례(소득금액 차감)이고 §127⑦의 감면(세액 공제)이 아닌 설계 원칙에 따라
   * candidates 배열에 포함되지 않으므로 명시적 중복배제 처리 없이도 자연 해소됨.
   */
  it("T-27 §99의3 + new_housing 동시 입력 — calcReductions 감면 = 0 (산출세액 한도 제한)", () => {
    const inputWithBoth = makeBuildingInputWith993Within5Y({
      reductions: [
        {
          type: "new_99_3",
          acquisitionType993: "self_built",
          usageApprovalDate993: "2002-01-01",
          region993: "outside_speculation",
          isResident993: true,
          isHousingConstructionBusiness993: false,
          standardPriceAtAcquisition993: F993_STD_AT_ACQ,
          standardPriceAt5Years: F993_STD_AT_5Y,
          standardPriceAtTransfer993: F993_STD_AT_TRANSFER,
        },
        { type: "new_housing", region: "non_metropolitan" },
      ],
    });
    const result = calculateTransferTax(inputWithBoth, makeMockRates());
    expect(result.calculatedTax).toBe(0);
    expect(result.reductionAmount).toBe(0); // calcReductions에서 감면할 세액 없음
    expect(result.new993Detail?.isEligible).toBe(true);
  });

  /**
   * T-28: §99의3 요건 미충족(사용승인일 취득기간 외) — 기본 케이스 산출세액과 동일
   *
   * 사례 28 원본 사용승인일 2022-08-29 → 취득기간(2001.5.23~2003.6.30) 외 → 적용 배제.
   * 회귀 방어: §99의3 포함 입력이어도 요건 미충족 시 기존 세액에 영향 없음.
   */
  it("T-28 §99의3 요건 미충족(취득기간 외) — 건물 산출세액은 기본 케이스와 동일", () => {
    const inputWith993OutOfPeriod = makeBuildingInput({
      reductions: [
        {
          type: "new_99_3",
          acquisitionType993: "self_built",
          usageApprovalDate993: "2022-08-29", // 취득기간(~2003.6.30) 외
          region993: "outside_speculation",
          isResident993: true,
          isHousingConstructionBusiness993: false,
          standardPriceAtAcquisition993: F993_STD_AT_ACQ,
          standardPriceAt5Years: F993_STD_AT_5Y,
          standardPriceAtTransfer993: F993_STD_AT_TRANSFER,
        },
      ],
    });
    const resultWith993  = calculateTransferTax(inputWith993OutOfPeriod, makeMockRates());
    const resultBaseline = calculateTransferTax(makeBuildingInput(),       makeMockRates());
    expect(resultWith993.calculatedTax).toBe(resultBaseline.calculatedTax);
    expect(resultWith993.new993Detail?.isEligible).toBe(false);
    expect(resultWith993.new993Detail?.ineligibleReasons[0]?.code).toBe("OUT_OF_ACQUISITION_PERIOD");
  });

  /**
   * T-28b: §99의3 5년 후 양도 — 안분 비율 부호(+,+) 케이스
   *
   * 취득일 2002-01-01, 양도일 2023-03-06 → 21년 → 5년 후 안분 산식.
   * 분자 = 80,000,000 − 50,000,000 = 30,000,000 (+)
   * 분모 = 93,571,201 − 50,000,000 = 43,571,201 (+)
   * signCase = "all_positive"
   *
   * 핵심: 엔진은 reducibleTransferIncome을 양도소득금액(LTHD 차감 후)에 안분 비율 적용.
   *   보유 21년 → LTHD 최대 30%
   *   양도소득금액 = 82,457,619 - floor(82,457,619 × 0.30) = 57,720,334
   *   reducible = floor(57,720,334 × 30,000,000/43,571,201) = 39,742,076
   */
  it("T-28b §99의3 5년 후 양도 — 안분 비율 부호(+,+) signCase='all_positive'", () => {
    const result = calculateTransferTax(makeBuildingInputWith993After5Y(), makeMockRates());
    expect(result.new993Detail?.isEligible).toBe(true);
    expect(result.new993Detail?.isWithin5Years).toBe(false);
    expect(result.new993Detail?.signCase).toBe("all_positive");
    // reducibleTransferIncome = floor(양도소득금액 × 안분비율)
    // 양도소득금액: 57,720,334 (LTHD 30% 차감 후)
    // 안분비율: 30,000,000 / 43,571,201
    const expectedRatio    = (F993_STD_AT_5Y - F993_STD_AT_ACQ) / (F993_STD_AT_TRANSFER - F993_STD_AT_ACQ);
    const lthd21Y          = Math.floor(F993_BUILDING_INCOME * 0.30); // 보유 21년 → 최대 30%
    const income21Y        = F993_BUILDING_INCOME - lthd21Y;          // 57,720,334
    const expectedReducible = Math.floor(income21Y * expectedRatio);  // 39,742,076
    expect(result.new993Detail?.reducibleTransferIncome).toBe(expectedReducible);
  });
});
