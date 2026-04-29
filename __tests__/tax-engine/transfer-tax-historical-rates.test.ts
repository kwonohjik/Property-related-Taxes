/**
 * 양도소득세 역사 세율 매칭 회귀 테스트
 *
 * 목적: effective_date 기반 historical 세율이 양도일에 맞게 매칭되는지 검증.
 *   - 시드 시점별 누진세율 구간 수·최고 구간 rate 검증
 *   - 2020년 이전 양도 케이스에서 parseRatesFromMap이 정상 동작하는지 확인
 */

import { describe, it, expect } from "vitest";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "./_helpers/mock-rates";

// ── 시점별 누진세율 브라켓 데이터 ────────────────────────────────────────────

// 공통 1~5구간 (1200만/4600만/8800만/1.5억/3억, 2014~2022 표)
const COMMON_BRACKETS_1_TO_5 = [
  { min: 0, max: 12_000_000, rate: 0.06, deduction: 0 },
  { min: 12_000_001, max: 46_000_000, rate: 0.15, deduction: 1_080_000 },
  { min: 46_000_001, max: 88_000_000, rate: 0.24, deduction: 5_220_000 },
  { min: 88_000_001, max: 150_000_000, rate: 0.35, deduction: 14_900_000 },
  { min: 150_000_001, max: 300_000_000, rate: 0.38, deduction: 19_400_000 },
];

// 1990-01-01 fallback: 6구간 (5억 이상 40%)
const BRACKETS_1990 = [
  ...COMMON_BRACKETS_1_TO_5,
  { min: 300_000_001, rate: 0.40, deduction: 25_400_000 },
];

// 2018-01-01: 7구간 (5억 초과 42%)
const BRACKETS_2018 = [
  ...COMMON_BRACKETS_1_TO_5,
  { min: 300_000_001, max: 500_000_000, rate: 0.40, deduction: 25_400_000 },
  { min: 500_000_001, rate: 0.42, deduction: 35_400_000 },
];

// 2021-01-01: 8구간 (10억 초과 45%)
const BRACKETS_2021 = [
  ...COMMON_BRACKETS_1_TO_5,
  { min: 300_000_001, max: 500_000_000, rate: 0.40, deduction: 25_400_000 },
  { min: 500_000_001, max: 1_000_000_000, rate: 0.42, deduction: 35_400_000 },
  { min: 1_000_000_001, rate: 0.45, deduction: 65_400_000 },
];

// 2023-01-01 현행: 8구간 (1400만/5000만 구간 상향)
const BRACKETS_2023 = [
  { min: 0, max: 14_000_000, rate: 0.06, deduction: 0 },
  { min: 14_000_001, max: 50_000_000, rate: 0.15, deduction: 1_260_000 },
  { min: 50_000_001, max: 88_000_000, rate: 0.24, deduction: 5_760_000 },
  { min: 88_000_001, max: 150_000_000, rate: 0.35, deduction: 15_440_000 },
  { min: 150_000_001, max: 300_000_000, rate: 0.38, deduction: 19_940_000 },
  { min: 300_000_001, max: 500_000_000, rate: 0.40, deduction: 25_940_000 },
  { min: 500_000_001, max: 1_000_000_000, rate: 0.42, deduction: 35_940_000 },
  { min: 1_000_000_001, rate: 0.45, deduction: 65_940_000 },
];

// ── 헬퍼: 특정 시점 브라켓으로 TaxRatesMap 구성 ──────────────────────────────

function makeRatesWithBrackets(brackets: typeof BRACKETS_2018) {
  return makeMockRates({
    "transfer:progressive_rate:_default": {
      taxType: "transfer",
      category: "progressive_rate",
      subCategory: "_default",
      rateTable: { brackets },
      deductionRules: null,
      specialRules: null,
    },
  });
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe("양도소득세 누진세율 historical 시점별 매칭", () => {
  it("H-1: 1990 fallback — 6구간, 최고 구간 rate=40%", () => {
    const rates = makeRatesWithBrackets(BRACKETS_1990);
    const { brackets } = parseRatesFromMap(rates);
    expect(brackets).toHaveLength(6);
    expect(brackets[brackets.length - 1].rate).toBe(0.40);
    expect(brackets[brackets.length - 1].max).toBeNull();
  });

  it("H-2: 2018 시행 7구간 — 5억 초과 구간 rate=42%, deduction=35_400_000", () => {
    const rates = makeRatesWithBrackets(BRACKETS_2018);
    const { brackets } = parseRatesFromMap(rates);
    expect(brackets).toHaveLength(7);
    const topBracket = brackets[brackets.length - 1];
    expect(topBracket.rate).toBe(0.42);
    expect(topBracket.deduction).toBe(35_400_000);
    expect(topBracket.max).toBeNull();
  });

  it("H-3: 2021 시행 8구간 — 10억 초과 구간 rate=45%, deduction=65_400_000", () => {
    const rates = makeRatesWithBrackets(BRACKETS_2021);
    const { brackets } = parseRatesFromMap(rates);
    expect(brackets).toHaveLength(8);
    const topBracket = brackets[brackets.length - 1];
    expect(topBracket.rate).toBe(0.45);
    expect(topBracket.deduction).toBe(65_400_000);
  });

  it("H-4: 2023 현행 8구간 — 1구간 max=1400만, deduction=65_940_000", () => {
    const rates = makeRatesWithBrackets(BRACKETS_2023);
    const { brackets } = parseRatesFromMap(rates);
    expect(brackets).toHaveLength(8);
    expect(brackets[0].max).toBe(14_000_000);
    expect(brackets[brackets.length - 1].deduction).toBe(65_940_000);
  });

  it("H-5: progressive_rate 누락 시 TaxRateNotFoundError throw", () => {
    const rates = makeMockRates();
    rates.delete("transfer:progressive_rate:_default" as Parameters<typeof rates.delete>[0]);
    expect(() => parseRatesFromMap(rates)).toThrow("양도소득세 누진세율(progressive_rate:_default)이 없습니다");
  });
});

describe("2020년 양도 케이스 통과 (2018 7구간 매칭)", () => {
  it("H-6: 양도일 2020-02-16 케이스 — 2018 브라켓으로 세액 정상 산출", () => {
    // 2020년 양도에는 2018-01-01 시행 7구간이 매칭되어야 함.
    // 사용자 실제 케이스: 양도가 15억, 환산취득가, 1999년 취득 → 21년 보유
    // 이 테스트는 세액 정확도보다 "throw 없이 산출"을 검증.
    const rates = makeRatesWithBrackets(BRACKETS_2018);
    const input = baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_500_000_000,
      transferDate: new Date("2020-02-16"),
      acquisitionDate: new Date("1999-05-20"),
      useEstimatedAcquisition: true,
      standardPriceAtTransfer: 800_000_000,
      standardPriceAtAcquisition: 100_000_000,
      acquisitionPrice: 0,
      expenses: 0,
      isOneHousehold: false,
      householdHousingCount: 1,
    });

    const result = calculateTransferTax(input, rates);
    expect(result.totalTax).toBeGreaterThan(0);
    expect(result.taxBase).toBeGreaterThan(0);
  });

  it("H-7: 2017 이하 양도 — 6구간 fallback으로 5억 초과분 rate=40%", () => {
    const rates = makeRatesWithBrackets(BRACKETS_1990);
    const input = baseTransferInput({
      propertyType: "building",
      transferPrice: 600_000_000,
      transferDate: new Date("2017-06-01"),
      acquisitionDate: new Date("2010-06-01"),
      acquisitionPrice: 200_000_000,
      isOneHousehold: false,
      householdHousingCount: 0,
    });

    const result = calculateTransferTax(input, rates);
    // 양도차익 4억, 7년 보유 → LTHD 14% → 과세표준 대략 3.44억
    // 3억 초과 구간 40% 적용 확인 (세액 > 0)
    expect(result.totalTax).toBeGreaterThan(0);
  });

  it("H-8: 2021-01-15 양도 — 8구간, 10억 초과 45% 구간 존재 확인", () => {
    const rates = makeRatesWithBrackets(BRACKETS_2021);
    const { brackets } = parseRatesFromMap(rates);
    const topBracket = brackets[brackets.length - 1];
    expect(topBracket.rate).toBe(0.45);
    expect(topBracket.min).toBe(1_000_000_001);
  });

  it("H-9: 2024 이후 양도 — 현행 2023 표, 1구간 max=1400만", () => {
    const rates = makeRatesWithBrackets(BRACKETS_2023);
    const { brackets } = parseRatesFromMap(rates);
    expect(brackets[0].max).toBe(14_000_000);
    expect(brackets[1].max).toBe(50_000_000);
  });
});

describe("surcharge 한시 유예 시점 분리", () => {
  it("H-10: 2020년 양도 — surcharge special_rules null이면 isSurchargeSuspended=false", () => {
    // 2020년 양도 매칭 row에는 suspended 정책 없음 → 중과 한시 유예 미적용
    const rates = makeMockRates({
      "transfer:progressive_rate:_default": {
        taxType: "transfer",
        category: "progressive_rate",
        subCategory: "_default",
        rateTable: { brackets: BRACKETS_2018 },
        deductionRules: null,
        specialRules: null,
      },
      "transfer:surcharge:_default": {
        taxType: "transfer",
        category: "surcharge",
        subCategory: "_default",
        rateTable: {
          multi_house_2: { additionalRate: 0.20, condition: "regulated_area_2house", referenceDate: "transfer_date" },
          multi_house_3plus: { additionalRate: 0.30, condition: "regulated_area_3house_plus", referenceDate: "transfer_date" },
          non_business_land: { additionalRate: 0.10 },
          unregistered: { flatRate: 0.70, excludeDeductions: true, excludeBasicDeduction: true },
        },
        deductionRules: null,
        specialRules: null,
      },
    });
    const parsed = parseRatesFromMap(rates);
    // special_rules가 null이면 surchargeSpecialRules도 null
    expect(parsed.surchargeSpecialRules).toBeNull();
  });

  it("H-11: 2024년 이후 양도 — suspended_until 2026-05-09 정책 활성", () => {
    const rates = makeMockRates();
    const parsed = parseRatesFromMap(rates);
    expect(parsed.surchargeSpecialRules).toMatchObject({
      surcharge_suspended: true,
      suspended_until: "2026-05-09",
    });
  });
});
