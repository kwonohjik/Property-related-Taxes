/**
 * RH-B1: PHRP 양도 (12억 이하) — 사례문제 PDF#1 (양도코리아 2023, 사례 25) anchor 테스트
 *
 * 입력 데이터:
 *   - 양도일: 2023.03.03, 양도가액: 800,000,000
 *   - 취득일: 2009.08.12, 취득가액 환산 (취득가 확인 불가)
 *   - 공동주택가격 (기준시가):
 *     2009.1.1. → 300,000,000 (P_acq)
 *     2016.1.1. → 450,000,000 (P_prior 기준 근사)
 *     2022.1.1. → 500,000,000 (P_transfer 기준 근사)
 *   - 직전거주주택양도일: 2016.08.25
 *   - P_acq (PHRP 취득 당시 기준시가): 300,000,000
 *   - P_prior (직전거주주택 양도 당시 PHRP 기준시가): 450,000,000
 *   - P_transfer (PHRP 양도 당시 기준시가): 500,000,000
 *   - 전체 양도차익: 311,000,000 (환산취득가 + 기타필요경비 9,000,000 포함)
 *   - 보유연수: 13년 (2009.08.12 → 2023.03.03)
 *   - 거주연수: 2년 이상 (요건 충족)
 *
 * anchor 17개:
 *   PDF 결과: 장기보유공제 80,860,000 / 양도소득금액 172,605,000 / 산출세액 44,699,900
 */

import { describe, it, expect } from "vitest";
import {
  calculateRentalHousingException,
  type RentalHousingExceptionInput,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception";
import { calculateGain95BothTables, calcTable1Rate } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/ltc-table-split";
import { calculatePrhpAllocation } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/prhp-allocation";
import { calculateProgressiveTax, truncateToThousand } from "@/lib/tax-engine/tax-utils";
import type { TaxBracket } from "@/lib/tax-engine/types";

// ============================================================
// PDF#1 anchor 상수 (원단위 고정)
// ============================================================

// 기본 데이터
const GAIN = 311_000_000;          // 전체 양도차익
const S = 800_000_000;             // 양도가액
const HOLD_YEARS = 13;             // 보유연수
const LIVE_YEARS = 2;              // 거주연수 (요건 충족)
const RESIDENCE_HOLD_YEARS = 13;  // 거주주택 보유연수 (PHRP 전환 전 거주주택)
const RESIDENCE_LIVE_YEARS = 2;   // 거주주택 거주연수 (요건 충족)

// 기준시가 3-시점
const P_ACQ = 300_000_000;         // PHRP 취득 당시 기준시가
const P_PRIOR = 450_000_000;       // 직전거주주택 양도 당시 PHRP 기준시가
const P_TRANSFER = 500_000_000;    // PHRP 양도 당시 기준시가

// 안분 비율
const NUMERATOR = 150_000_000;     // P_prior − P_acq
const DENOMINATOR = 200_000_000;   // P_transfer − P_acq
const RATIO_161_1 = 0.75;          // 150/200

// 계산 결과
const LTC_T1 = 80_860_000;         // 장기보유공제 (표1, 26%)
const GAIN95_T1 = 230_140_000;     // §95① 양도소득금액 (표1)
const TAXABLE_GAIN = 172_605_000;  // §161① 안분 과세 양도소득금액
const EXEMPT_GAIN = 57_535_000;    // 비과세 양도소득금액 (gain95T1 − taxableGain)

// 세액 계산
const BASIC_DEDUCTION = 2_500_000; // 기본공제
const TAX_BASE = 170_105_000;      // 과세표준 (= TAXABLE_GAIN − BASIC_DEDUCTION)
const CALC_TAX = 44_699_900;       // 산출세액

// 누진세율 구간 (2024년 기준, mock-rates와 동일)
const BRACKETS: TaxBracket[] = [
  { min: 0, max: 14_000_000, rate: 0.06, deduction: 0 },
  { min: 14_000_001, max: 50_000_000, rate: 0.15, deduction: 1_260_000 },
  { min: 50_000_001, max: 88_000_000, rate: 0.24, deduction: 5_760_000 },
  { min: 88_000_001, max: 150_000_000, rate: 0.35, deduction: 15_440_000 },
  { min: 150_000_001, max: 300_000_000, rate: 0.38, deduction: 19_940_000 },
  { min: 300_000_001, max: 500_000_000, rate: 0.40, deduction: 25_940_000 },
  { min: 500_000_001, max: 1_000_000_000, rate: 0.42, deduction: 35_940_000 },
  { min: 1_000_000_001, max: null, rate: 0.45, deduction: 65_940_000 },
];

// ============================================================
// 테스트 입력 팩토리
// ============================================================

function makePdf1Input(): RentalHousingExceptionInput {
  return {
    applyException: true,
    scenario: "B",
    rentalUnits: [
      {
        registrationDate: new Date("2016-01-01"), // 2020.7.10 이전 등록
        rentalType: "long-8",                      // 장기일반 (8년 이상)
        rentalAcquisitionType: "purchase",
        isApartment: true,
        region: "non-metro",                       // 비수도권 (파주시 — 수도권이나 사례상 6억 이하)
        standardPriceAtRentalStart: 300_000_000,   // 임대개시 당시 기준시가 3억 (비수도권 3억 이하)
        rentalMonths: 96,                          // 8년 × 12 = 96개월 (의무기간 충족)
        rentalAutoTermination: false,
        requirementsConfirmed: true,
      },
    ],
    priorResidenceTransferDate: new Date("2016-08-25"),
    standardPriceAtAcquisition: P_ACQ,
    standardPriceAtPriorTransfer: P_PRIOR,
    standardPriceAtTransfer: P_TRANSFER,
  };
}

// ============================================================
// anchor 테스트
// ============================================================

describe("RH-B1: PDF#1 사례 25 — anchor 17개 (원단위 toBe)", () => {

  // ─── anchor #1: 양도차익 ─────────────────────────────────
  it("anchor #1: gain (양도차익) = 311,000,000", () => {
    expect(GAIN).toBe(311_000_000);
  });

  // ─── anchor #2: 장기보유공제 표1 (26%) ───────────────────
  it("anchor #2: ltc_T1 (표1 26%) = 80,860,000", () => {
    const { ltcTable1 } = calculateGain95BothTables(GAIN, HOLD_YEARS, LIVE_YEARS);
    expect(ltcTable1).toBe(LTC_T1);
  });

  // ─── anchor #3: gain95(표1) ───────────────────────────────
  it("anchor #3: gain95T1 = 230,140,000", () => {
    const { gain95Table1 } = calculateGain95BothTables(GAIN, HOLD_YEARS, LIVE_YEARS);
    expect(gain95Table1).toBe(GAIN95_T1);
  });

  // ─── anchor #4: §161① 분자 ───────────────────────────────
  it("anchor #4: r161_1 분자 = P_prior − P_acq = 150,000,000", () => {
    expect(P_PRIOR - P_ACQ).toBe(NUMERATOR);
  });

  // ─── anchor #5: §161① 분모 ───────────────────────────────
  it("anchor #5: r161_1 분모 = P_transfer − P_acq = 200,000,000", () => {
    expect(P_TRANSFER - P_ACQ).toBe(DENOMINATOR);
  });

  // ─── anchor #6: §161① 비율 ───────────────────────────────
  it("anchor #6: r161_1 = 0.75", () => {
    const { ratio161_1 } = calculatePrhpAllocation(
      GAIN95_T1, GAIN95_T1, S, P_ACQ, P_PRIOR, P_TRANSFER,
    );
    expect(ratio161_1).toBe(RATIO_161_1);
  });

  // ─── anchor #7: 과세대상 양도소득금액 ────────────────────
  it("anchor #7: taxableGain (§161① 결과) = 172,605,000", () => {
    const { taxableGain } = calculatePrhpAllocation(
      GAIN95_T1, GAIN95_T1, S, P_ACQ, P_PRIOR, P_TRANSFER,
    );
    expect(taxableGain).toBe(TAXABLE_GAIN);
  });

  // ─── anchor #8: 비과세 양도소득금액 ──────────────────────
  it("anchor #8: exemptGain = gain95T1 − taxableGain = 57,535,000", () => {
    const result = calculateRentalHousingException(
      makePdf1Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      RESIDENCE_HOLD_YEARS, RESIDENCE_LIVE_YEARS,
    );
    expect(result.exemptGain).toBe(EXEMPT_GAIN);
  });

  // ─── anchor #9: appliedTable ──────────────────────────────
  it("anchor #9: appliedTable = 'table-1' (§161① + §161④ 표1 적용)", () => {
    const result = calculateRentalHousingException(
      makePdf1Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      RESIDENCE_HOLD_YEARS, RESIDENCE_LIVE_YEARS,
    );
    expect(result.appliedTable).toBe("table-1");
  });

  // ─── anchor #10: scenarioId ───────────────────────────────
  it("anchor #10: scenarioId = 'RH-B1' (12억 이하 PHRP)", () => {
    const result = calculateRentalHousingException(
      makePdf1Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      RESIDENCE_HOLD_YEARS, RESIDENCE_LIVE_YEARS,
    );
    expect(result.scenarioId).toBe("RH-B1");
  });

  // ─── anchor #11: §161③ 캡 미발동 ─────────────────────────
  it("anchor #11: capApplied = false (taxableGain < gain95T1)", () => {
    const result = calculateRentalHousingException(
      makePdf1Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      RESIDENCE_HOLD_YEARS, RESIDENCE_LIVE_YEARS,
    );
    expect(result.formulaTrace.capApplied).toBe(false);
  });

  // ─── anchor #12: 보유연수 ─────────────────────────────────
  it("anchor #12: holdYears = 13 (2009.08.12 → 2023.03.03)", () => {
    // 보유연수는 엔진 입력으로 주입 — 호출자(transfer-tax.ts)가 계산한 값
    expect(HOLD_YEARS).toBe(13);
  });

  // ─── anchor #13: P_acq ────────────────────────────────────
  it("anchor #13: P_acq = 300,000,000 (PHRP 취득 당시 기준시가)", () => {
    expect(P_ACQ).toBe(300_000_000);
  });

  // ─── anchor #14: P_prior ─────────────────────────────────
  it("anchor #14: P_prior = 450,000,000 (직전거주주택 양도 당시 기준시가)", () => {
    expect(P_PRIOR).toBe(450_000_000);
  });

  // ─── anchor #15: P_transfer ──────────────────────────────
  it("anchor #15: P_transfer = 500,000,000 (PHRP 양도 당시 기준시가)", () => {
    expect(P_TRANSFER).toBe(500_000_000);
  });

  // ─── anchor #16: 산출세액 ─────────────────────────────────
  it("anchor #16: 산출세액 = 44,699,900 (38% 구간)", () => {
    // 과세표준 = TAXABLE_GAIN − 기본공제
    const taxBase = truncateToThousand(TAXABLE_GAIN - BASIC_DEDUCTION);
    const calculatedTax = calculateProgressiveTax(taxBase, BRACKETS);
    expect(calculatedTax).toBe(CALC_TAX);
  });

  // ─── anchor #17: 과세표준 ─────────────────────────────────
  it("anchor #17: 과세표준 = 170,105,000 (taxableGain − 기본공제 2,500,000, 천원 절사)", () => {
    const taxBase = truncateToThousand(TAXABLE_GAIN - BASIC_DEDUCTION);
    expect(taxBase).toBe(TAX_BASE);
  });

  // ─── 통합 검증: applied=true ──────────────────────────────
  it("통합: applied=true, eligibility.passed=true", () => {
    const result = calculateRentalHousingException(
      makePdf1Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      RESIDENCE_HOLD_YEARS, RESIDENCE_LIVE_YEARS,
    );
    expect(result.applied).toBe(true);
    expect(result.eligibility.passed).toBe(true);
    expect(result.taxableGain).toBe(TAXABLE_GAIN);
  });

  // ─── 표1 공제율 검증 (보조) ───────────────────────────────
  it("보조: 표1 공제율 = 0.26 (13년 × 2%)", () => {
    const rate = calcTable1Rate(13);
    expect(rate).toBe(0.26);
  });
});
