/**
 * 사례 35 — 주택을 상가로 용도변경 anchor 테스트
 *
 * 갑氏 2주택자 + A주택을 2020-08-07 상가로 용도변경 후 2023-02-19 양도.
 * 다주택 + 중과배제기간(2022-05-10 ~ 2024-05-09) 내 양도 → 일반 누진세율 +
 * LTHD 보유기간 기산일 = 용도변경일 (사전법규재산 2022-684·881).
 *
 * 핵심 anchor (PDF p.539–544):
 *  - longTermHoldingDeduction = 0 (변경일~양도일 2년 6개월 → 3년 미만)
 *  - taxBase                  = 397,500,000
 *  - calculatedTax            = 133,060,000  (40% × 397,500,000 − 25,940,000)
 *  - localIncomeTax           = 13,306,000   (10%)
 *
 * 추가 회귀 anchor:
 *  - 35-2  1주택 케이스 (wasMultiHouseAtConversion=false) → 당초 취득일 기산 14년 → 표1 28%
 *  - 35-3  다주택 + 변경일~양도일 만 5년 → 표1 10%
 *  - 35-5  경계값: 변경일 +3년 0일 → 6% / 변경일 +3년 -1일 → 0%
 *  - 35-7  변경일 무시 보장: 1주택 케이스 + conversionDate 입력 → 당초 취득일 기산
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  resolveLTHDStartDate,
} from "@/lib/tax-engine/transfer-tax-finalize";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const RATES = makeMockRates();

// 사례 35 PDF 메인 입력 (다주택 + 중과배제기간 양도)
function case35MainInput(): TransferTaxInput {
  return baseTransferInput({
    // 양도 시점 자산종류는 상가(비주택) — building으로 단건 엔진 진입
    propertyType: "building",
    transferPrice: 800_000_000,
    transferDate: new Date("2023-02-19"),
    acquisitionPrice: 400_000_000,
    acquisitionDate: new Date("2008-05-02"),
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,           // 다주택 상태
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    // 사례 35 신규 필드
    houseToCommercialConversion: true,
    conversionDate: new Date("2020-08-07"),
    wasMultiHouseAtConversion: true,
  });
}

describe("사례 35-1: 다주택 + 중과배제기간 양도 (PDF 메인 anchor)", () => {
  const result = calculateTransferTax(case35MainInput(), RATES);

  it("양도차익 = 400,000,000", () => {
    expect(result.transferGain).toBe(400_000_000);
  });

  it("장기보유특별공제 = 0 (변경일~양도일 만 2년 → 3년 미만)", () => {
    expect(result.longTermHoldingDeduction).toBe(0);
    expect(result.longTermHoldingRate).toBe(0);
  });

  it("lthdStartDate = 용도변경일(2020-08-07)", () => {
    expect(result.lthdStartDate.getTime()).toBe(new Date("2020-08-07").getTime());
  });

  it("기본공제 = 2,500,000", () => {
    expect(result.basicDeduction).toBe(2_500_000);
  });

  it("과세표준 = 397,500,000", () => {
    expect(result.taxBase).toBe(397_500_000);
  });

  it("산출세액 = 133,060,000 (40% − 누진공제 25,940,000)", () => {
    expect(result.calculatedTax).toBe(133_060_000);
  });

  it("지방소득세 = 13,306,000 (산출세액 × 10%)", () => {
    expect(result.localIncomeTax).toBe(13_306_000);
  });
});

describe("사례 35-2: 1주택 케이스 — 당초 취득일 기산 14년 = 28%", () => {
  it("wasMultiHouseAtConversion=false 시 lthdStartDate = acquisitionDate", () => {
    const input = case35MainInput();
    input.wasMultiHouseAtConversion = false;
    input.isOneHousehold = true;
    input.householdHousingCount = 1;
    input.residencePeriodMonths = 0; // 거주 0 → 표1만 적용
    const result = calculateTransferTax(input, RATES);
    // 2008-05-02 ~ 2023-02-19 = 만 14년 → 14 × 2% = 28%
    expect(result.longTermHoldingRate).toBe(0.28);
    expect(result.lthdStartDate.getTime()).toBe(input.acquisitionDate.getTime());
  });
});

describe("사례 35-3: 다주택 + 변경일~양도일 만 5년 = 10%", () => {
  it("conversionDate=2015-01-01, transferDate=2020-01-15 → 표1 10%", () => {
    const input: TransferTaxInput = baseTransferInput({
      propertyType: "building",
      transferPrice: 800_000_000,
      transferDate: new Date("2020-01-15"),
      acquisitionPrice: 400_000_000,
      acquisitionDate: new Date("2010-01-01"),
      expenses: 0,
      isOneHousehold: false,
      householdHousingCount: 2,
      residencePeriodMonths: 0,
      houseToCommercialConversion: true,
      conversionDate: new Date("2015-01-01"),
      wasMultiHouseAtConversion: true,
    });
    const result = calculateTransferTax(input, RATES);
    expect(result.longTermHoldingRate).toBe(0.10);
    expect(result.lthdStartDate.getTime()).toBe(new Date("2015-01-01").getTime());
  });
});

describe("사례 35-5: 경계값 — 변경일 +3년 0일 = 6% 진입", () => {
  it("conversionDate=2017-06-01, transferDate=2020-06-02 → 표1 6%", () => {
    const input: TransferTaxInput = baseTransferInput({
      propertyType: "building",
      transferPrice: 500_000_000,
      transferDate: new Date("2020-06-02"),
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2010-01-01"),
      expenses: 0,
      isOneHousehold: false,
      householdHousingCount: 2,
      residencePeriodMonths: 0,
      houseToCommercialConversion: true,
      conversionDate: new Date("2017-06-01"),
      wasMultiHouseAtConversion: true,
    });
    const result = calculateTransferTax(input, RATES);
    expect(result.longTermHoldingRate).toBe(0.06);
  });

  it("conversionDate=2017-06-01, transferDate=2020-06-01 → 만 2년 → 0%", () => {
    const input: TransferTaxInput = baseTransferInput({
      propertyType: "building",
      transferPrice: 500_000_000,
      transferDate: new Date("2020-06-01"),
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2010-01-01"),
      expenses: 0,
      isOneHousehold: false,
      householdHousingCount: 2,
      residencePeriodMonths: 0,
      houseToCommercialConversion: true,
      conversionDate: new Date("2017-06-01"),
      wasMultiHouseAtConversion: true,
    });
    const result = calculateTransferTax(input, RATES);
    expect(result.longTermHoldingRate).toBe(0);
  });
});

describe("사례 35-6: skip — 다주택 + 중과배제기간 직전(2022-05-09) 양도 (후속 PR)", () => {
  it.skip("중과세율 분기 검증 — 본 PR 범위 밖", () => {
    // TODO: 후속 PR — multi-house-surcharge 모듈과 통합 검증
  });
});

describe("사례 35-7: 변경일 무시 보장 — 1주택 케이스", () => {
  it("wasMultiHouseAtConversion=false + conversionDate 입력 시 acquisitionDate 기산", () => {
    const input: TransferTaxInput = baseTransferInput({
      propertyType: "building",
      transferPrice: 500_000_000,
      transferDate: new Date("2022-01-01"),
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2010-01-01"),
      expenses: 0,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      houseToCommercialConversion: true,
      conversionDate: new Date("2021-12-31"), // 양도 직전 — 다주택 케이스라면 LTHD 0%
      wasMultiHouseAtConversion: false,        // 1주택 → conversionDate 무시
    });
    const result = calculateTransferTax(input, RATES);
    // 2010-01-01 ~ 2022-01-01: 초일불산입(민법 §157) → 2010-01-02 ~ 2022-01-01 = 만 11년 → 표1 22%
    expect(result.lthdStartDate.getTime()).toBe(input.acquisitionDate.getTime());
    expect(result.longTermHoldingRate).toBe(0.22);
  });
});

describe("resolveLTHDStartDate 순수 함수 단위 anchor", () => {
  it("houseToCommercialConversion=false → acquisitionDate", () => {
    const input = baseTransferInput({
      acquisitionDate: new Date("2010-01-01"),
    });
    expect(resolveLTHDStartDate(input).getTime()).toBe(new Date("2010-01-01").getTime());
  });

  it("=true + wasMultiHouseAtConversion=false → acquisitionDate (1주택)", () => {
    const input = baseTransferInput({
      acquisitionDate: new Date("2010-01-01"),
      houseToCommercialConversion: true,
      conversionDate: new Date("2018-01-01"),
      wasMultiHouseAtConversion: false,
    });
    expect(resolveLTHDStartDate(input).getTime()).toBe(new Date("2010-01-01").getTime());
  });

  it("=true + wasMultiHouseAtConversion=true → conversionDate (다주택)", () => {
    const input = baseTransferInput({
      acquisitionDate: new Date("2010-01-01"),
      houseToCommercialConversion: true,
      conversionDate: new Date("2018-01-01"),
      wasMultiHouseAtConversion: true,
    });
    expect(resolveLTHDStartDate(input).getTime()).toBe(new Date("2018-01-01").getTime());
  });
});
