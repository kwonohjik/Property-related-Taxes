/**
 * 감사 확정 결함 회귀 테스트 — lib/tax-engine/transfer-tax-helpers.ts
 *
 * ref D1 (transfer-tax-helpers.ts:458): 부수토지 일체과세(L-1b) 장기보유특별공제에
 *   3년 보유 게이트 누락 → 주 주택 2~3년 보유 구간에서 존재하지 않는 LTHD 부여.
 *   법령근거: 소득세법 §95② — 장기보유특별공제 진입요건 = 보유기간 3년 이상.
 *   같은 함수 일반경로 rateForYears는 `years < 3 → 0` 게이트 보유(내부 정합).
 *
 * ref D2 (transfer-tax-helpers.ts:536): 토지/건물 분리(split) 12억 초과분 안분에
 *   safeMultiplyThenDivide(BigInt 가드) 대신 원시 곱셈 → 분자 2^53 초과 시 ±1원 오차.
 *   법령근거: 정수연산 정책 P0-2/P0-4 + 소득세법 §89①3호 12억 초과분 안분.
 *   비-split 경로(calcOneHouseProration → calculateProration)와 결과 일관성.
 *
 * 기대값은 조문(§95²)·정수정의(BigInt exact)에서 독립 도출. 수정 코드 출력 복사 아님.
 */
import { describe, it, expect } from "vitest";
import {
  calcLongTermHoldingDeduction,
  parseRatesFromMap,
} from "@/lib/tax-engine/transfer-tax-helpers";
import { calculateProration, applyRate } from "@/lib/tax-engine/tax-utils";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type { SplitGainResult } from "@/lib/tax-engine/types/transfer.types";

const RULES = parseRatesFromMap(makeMockRates()).longTermHoldingRules;

/** 부수토지 일체과세(L-1b) 진입 입력 — primaryContextForCompanionRate 주입 */
function appurtenantLandInput(over: Partial<TransferTaxInput>, holdingMonths: number): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    landNature: "appurtenant_to_housing",
    acquisitionDate: new Date("2021-01-01"),
    transferDate: new Date("2024-06-01"),
    isUnregistered: false,
    primaryContextForCompanionRate: {
      propertyType: "housing",
      holdingMonths,
      buildingFootprintArea: 100,
      isUrbanArea: true,
    },
    ...over,
  });
}

describe("D1 — 부수토지 일체과세 LTHD 3년 게이트 (§95②)", () => {
  const TAXABLE_GAIN = 100_000_000;

  it("표1(일반): 주 주택 30개월(2.5년) 보유 → LTHD 배제 (deduction 0, rate 0)", () => {
    // §95②: 보유 3년 미만 → 장기보유공제 없음. (버그 시 표1 min(2×2%,30%)=4% → 4,000,000)
    const input = appurtenantLandInput(
      { isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 },
      30,
    );
    const res = calcLongTermHoldingDeduction(TAXABLE_GAIN, input, RULES, false, false);
    expect(res.deduction).toBe(0);
    expect(res.rate).toBe(0);
  });

  it("표2(1세대1주택): 주 주택 30개월 + 거주 30개월 → LTHD 배제 (deduction 0)", () => {
    // 버그 시 표2 (보유 2년×4% + 거주 2년×4%) = 16% → 16,000,000. §95② 3년 미만이므로 0.
    const input = appurtenantLandInput(
      { isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 30 },
      30,
    );
    const res = calcLongTermHoldingDeduction(TAXABLE_GAIN, input, RULES, false, false);
    expect(res.deduction).toBe(0);
    expect(res.rate).toBe(0);
  });

  it("경계: 주 주택 35개월(3년 미만) → LTHD 배제 (deduction 0)", () => {
    const input = appurtenantLandInput(
      { isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 },
      35,
    );
    const res = calcLongTermHoldingDeduction(TAXABLE_GAIN, input, RULES, false, false);
    expect(res.deduction).toBe(0);
    expect(res.rate).toBe(0);
  });

  it("경계: 주 주택 36개월(정확히 3년) 표1 → rate 6%, deduction 6,000,000", () => {
    // §95② 표1: 보유 3년 × 2% = 6%. applyRate(1억, 0.06) = 6,000,000.
    const input = appurtenantLandInput(
      { isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 },
      36,
    );
    const res = calcLongTermHoldingDeduction(TAXABLE_GAIN, input, RULES, false, false);
    expect(res.rate).toBeCloseTo(0.06, 10);
    expect(res.deduction).toBe(6_000_000);
  });

  it("양성대조: 주 주택 36개월 표2(보유3년+거주3년) → rate 24%, deduction 24,000,000", () => {
    // §95② 표2: 보유 3년×4% + 거주 3년×4% = 24%. applyRate(1억, 0.24) = 24,000,000.
    const input = appurtenantLandInput(
      { isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 36 },
      36,
    );
    const res = calcLongTermHoldingDeduction(TAXABLE_GAIN, input, RULES, false, false);
    expect(res.rate).toBeCloseTo(0.24, 10);
    expect(res.deduction).toBe(24_000_000);
  });
});

describe("D2 — split 12억 초과분 안분 BigInt 가드 (P0-2/P0-4)", () => {
  const THRESHOLD = 1_200_000_000;
  // 경계 케이스: 분자 g×(s−12억) > 2^53 → 원시 double 곱은 1원 과대(1,562,477,801),
  // BigInt 정확값은 1,562,477,800. (독립 도출: BigInt floor(g×(s−12억)/s).)
  const g = 2_655_651_946; // 건물분 양도차익
  const s = 2_915_164_386; // 본인 소유 파트 양도가액 (> 12억)

  it("BigInt 정확 안분값 = 1,562,477,800 (원시 double = 1,562,477,801, 1원 과대)", () => {
    const exact = Number((BigInt(g) * (BigInt(s) - BigInt(THRESHOLD))) / BigInt(s));
    const rawDouble = Math.floor((g * (s - THRESHOLD)) / s);
    expect(exact).toBe(1_562_477_800);
    expect(rawDouble).toBe(1_562_477_801); // 수정 전 코드가 내던 잘못된 값
    // 수정 코드가 사용하는 헬퍼는 정확값을 반환해야 한다.
    expect(calculateProration(g, s - THRESHOLD, s)).toBe(1_562_477_800);
  });

  it("split 경로 building.longTermDeduction = 정확 안분값 기반 (raw 곱셈 미사용)", () => {
    // 1세대1주택 + selfOwns 'both' + selfTransferPrice=s>12억 → 12억 초과분 안분 적용.
    // 건물분 보유 10년, 거주 0 → 표1 rate 20%. deduction = applyRate(정확안분, 0.20).
    const input = baseTransferInput({
      propertyType: "housing",
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      transferPrice: s,
      acquisitionDate: new Date("2010-01-01"),
      transferDate: new Date("2024-06-01"),
    });
    const split: SplitGainResult = {
      selfOwns: "both",
      note: "",
      apportionRatio: { land: 0, building: 1 },
      land: {
        transferPrice: 0, acquisitionPrice: 0, directExpenses: 0, appraisalDeduction: 0,
        gain: 0, holdingYears: 10, longTermRate: 0, longTermDeduction: 0,
      },
      building: {
        transferPrice: s, acquisitionPrice: 0, directExpenses: 0, appraisalDeduction: 0,
        gain: g, holdingYears: 10, longTermRate: 0, longTermDeduction: 0,
      },
    };
    const exactProrated = 1_562_477_800;
    const expectedBuildingDed = applyRate(exactProrated, 0.20); // = 312,495,560

    calcLongTermHoldingDeduction(0, input, RULES, false, false, undefined, split);

    expect(split.building.longTermRate).toBeCloseTo(0.20, 10);
    expect(split.building.longTermDeduction).toBe(expectedBuildingDed);
    expect(split.land.longTermDeduction).toBe(0);
  });
});
