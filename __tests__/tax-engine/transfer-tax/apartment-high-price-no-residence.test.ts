/**
 * 공동주택(아파트) 고가주택 + 거주 2년 미만 — 통합 세액 anchor 테스트
 *
 * 사례 23 anchor: 양도코리아 검증값 기준
 *   - 전체 양도차익:          1,066,517,093
 *   - 과세 양도차익(12억 초과): 96,956,099
 *   - LTHL (표1, 30%):        29,086,829
 *   - 양도소득금액:            67,869,270
 *   - 과세표준:                65,369,270
 *   - 산출세액:                9,928,624
 *
 * 입력 전제:
 *   - PHD 역산값: P_A_est = 283,039,674 → standardPriceAtAcquisition
 *   - P_T = 1,525,000,000 → standardPriceAtTransfer
 *   - 1세대1주택 (householdHousingCount=1) + 양도가 12억 초과 → 부분과세
 *   - 거주 0개월 → 표1 LTHL (보유연수 × 2%, 최대 30%)
 *   - 보유 31년(1992-01-30 ~ 2023-02-19) → 30% 상한
 *
 * 법령: 소득세법 §89①3호, §95②, §97①, §104①, 소령 §163⑥, §164⑤·⑦
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import {
  A23_TRANSFER_PRICE,
  A23_P_A_EST,
  A23_TRANSFER_HOUSING_PRICE,
  A23_LUMP_DEDUCTION,
  A23_TOTAL_GAIN,
  A23_TAXABLE_GAIN,
  A23_NON_TAXABLE_GAIN,
  A23_LTHD,
  A23_INCOME,
  A23_BASIC_DED,
  A23_TAX_BASE,
  A23_CALCULATED_TAX,
} from "./_helpers/apartment-pre-disclosure-fixture";

const mockRates = makeMockRates();

/**
 * 사례 23 통합 입력
 * - standardPriceAtAcquisition = A23_P_A_EST (PHD 역산값)
 * - standardPriceAtTransfer = A23_TRANSFER_HOUSING_PRICE
 * - expenses = 0 (개산공제는 엔진이 stdAcq × 3% 자동 적용)
 */
const a23Input = baseTransferInput({
  propertyType: "housing",
  transferPrice: A23_TRANSFER_PRICE,
  transferDate: new Date("2023-02-19"),
  acquisitionDate: new Date("1992-01-30"),
  acquisitionPrice: 0,
  useEstimatedAcquisition: true,
  acquisitionMethod: "estimated",
  standardPriceAtAcquisition: A23_P_A_EST,            // 283,039,674 (PHD 역산)
  standardPriceAtTransfer: A23_TRANSFER_HOUSING_PRICE, // 1,525,000,000
  expenses: 0,
  isOneHousehold: true,
  householdHousingCount: 1,
  residencePeriodMonths: 0,     // 거주 2년 미만 → 표1 LTHL
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
});

// ──────────────────────────────────────────────────────────────
// T-A23-5: 전체 양도차익 (양도코리아 anchor)
// ──────────────────────────────────────────────────────────────

describe("T-A23-5: 전체 양도차익 = 1,066,517,093 (양도코리아 anchor)", () => {
  it("T-A23-5-1 환산취득가 + 개산공제 적용 후 전체 양도차익", () => {
    const result = calculateTransferTax(a23Input, mockRates);
    expect(result.transferGain).toBe(A23_TOTAL_GAIN);
  });
});

// ──────────────────────────────────────────────────────────────
// T-A23-6: 12억 초과 과세 양도차익 (양도코리아 anchor)
// ──────────────────────────────────────────────────────────────

describe("T-A23-6: 12억 초과 과세 양도차익 = 96,956,099 (양도코리아 anchor)", () => {
  it("T-A23-6-1 과세 양도차익 = 전체 × (120M / 1,320M)", () => {
    const result = calculateTransferTax(a23Input, mockRates);
    expect(result.taxableGain).toBe(A23_TAXABLE_GAIN);
  });

  it("T-A23-6-2 비과세 + 과세 = 전체 양도차익", () => {
    const result = calculateTransferTax(a23Input, mockRates);
    expect(result.taxableGain + A23_NON_TAXABLE_GAIN).toBe(A23_TOTAL_GAIN);
  });
});

// ──────────────────────────────────────────────────────────────
// T-A23-7: 장기보유특별공제 표1 30% 상한 (보유 31년)
// ──────────────────────────────────────────────────────────────

describe("T-A23-7: LTHL 표1 30% = 29,086,829 (양도코리아 anchor)", () => {
  it("T-A23-7-1 거주 0개월 → 표1 적용, 보유 31년 → 30% 상한", () => {
    const result = calculateTransferTax(a23Input, mockRates);
    expect(result.longTermHoldingDeduction).toBe(A23_LTHD);
  });

  it("T-A23-7-2 LTHL = floor(과세 양도차익 × 30%)", () => {
    expect(Math.floor(A23_TAXABLE_GAIN * 0.30)).toBe(A23_LTHD);
  });
});

// ──────────────────────────────────────────────────────────────
// T-A23-8: 양도소득금액·과세표준 (양도코리아 anchor)
// ──────────────────────────────────────────────────────────────

describe("T-A23-8: 양도소득금액 = 67,869,270 / 과세표준 = 65,369,270 (양도코리아 anchor)", () => {
  it("T-A23-8-1 양도소득금액 = 과세 양도차익 - LTHL", () => {
    expect(A23_TAXABLE_GAIN - A23_LTHD).toBe(A23_INCOME);
  });

  it("T-A23-8-2 과세표준 = 양도소득금액 - 기본공제 2,500,000", () => {
    const result = calculateTransferTax(a23Input, mockRates);
    expect(result.taxBase).toBe(A23_TAX_BASE);
  });
});

// ──────────────────────────────────────────────────────────────
// T-A23-9: 산출세액 24% 구간 (양도코리아 anchor)
// ──────────────────────────────────────────────────────────────

describe("T-A23-9: 산출세액 = 9,928,624 (양도코리아 anchor)", () => {
  it("T-A23-9-1 산출세액 = 과세표준 × 24% - 누진공제 5,760,000", () => {
    // 65,369,270 × 0.24 = 15,688,624.8 → floor = 15,688,624
    // 15,688,624 - 5,760,000 = 9,928,624
    const derived = Math.floor(A23_TAX_BASE * 0.24) - 5_760_000;
    expect(derived).toBe(A23_CALCULATED_TAX);
  });

  it("T-A23-9-2 calculateTransferTax 통합 산출세액 = 9,928,624 (사례 23 전체 anchor)", () => {
    const result = calculateTransferTax(a23Input, mockRates);
    expect(result.calculatedTax).toBe(A23_CALCULATED_TAX);
  });
});
