/**
 * 감사 확정 결함 회귀 테스트 — 다건 양도 합산 엔진
 *
 * 대상 결함:
 *   - confirmed[1]  transfer-tax-aggregate-helpers.ts:71
 *       분양권(presale_right) 2년+ 보유가 progressive 그룹으로 오분류 → 진짜 누진 자산과 합산 시
 *       대표세율 오적용. 분양권은 §104①1호 60% 단일세율(보유기간 무관)이므로 단일세율 그룹으로
 *       분류되어 자산별 산출세액이 합산되어야 한다.
 *   - confirmed[28] transfer-tax-aggregate.ts:411
 *       같은 감면 유형 다자산의 reductionAggregated가 각각 독립 floor되어 합이 cappedAggregateReduction과
 *       최대 (n−1)원 어긋남(표시 자기일관성 드리프트). 말단 자산 잔액 흡수(raw − Σfloor(others)) 필요.
 *
 * 기대값은 §104①1호·§55 누진세율표(mock)·§133 자경 1억 한도에서 독립 도출해 하드코딩.
 */

import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();

function makeItem(
  propertyId: string,
  propertyLabel: string,
  overrides: Partial<TransferTaxItemInput>,
): TransferTaxItemInput {
  const base = baseTransferInput();
  return {
    ...(base as unknown as TransferTaxItemInput),
    propertyId,
    propertyLabel,
    ...overrides,
  };
}

// ============================================================
// confirmed[1] — 분양권 2년+ 그룹 분류 정정 (§104①1호 60% 단일세율)
// ============================================================
describe("audit confirmed[1]: 분양권 2년+ 는 short_term(단일세율) 그룹 — 누진 자산과 대표세율 혼용 금지", () => {
  // 분양권 B: 보유 41개월(≥24) → §104①1호 60% 단일세율. LTHD 배제(분양권). 양도차익 = 3억.
  const presale = (): TransferTaxItemInput =>
    makeItem("B-presale", "분양권 2년+", {
      propertyType: "presale_right",
      transferPrice: 600_000_000,
      acquisitionPrice: 300_000_000, // 차익 3억
      expenses: 0,
      acquisitionDate: new Date("2021-01-01"),
      transferDate: new Date("2024-06-01"),
      isOneHousehold: false,
      householdHousingCount: 0,
      isRegulatedArea: false,
      residencePeriodMonths: 0,
    });
  // 사업용 토지 A: 보유 29개월(≥24, <36) → 누진세율, LTHD 0. 양도차익 = 2억.
  const land = (): TransferTaxItemInput =>
    makeItem("A-land", "사업용 토지", {
      propertyType: "land",
      transferPrice: 400_000_000,
      acquisitionPrice: 200_000_000, // 차익 2억
      expenses: 0,
      acquisitionDate: new Date("2022-01-01"),
      transferDate: new Date("2024-06-01"),
      isOneHousehold: false,
      householdHousingCount: 0,
      isNonBusinessLand: false,
      residencePeriodMonths: 0,
    });

  // 기본공제는 소진 상태로 두어 배분 모호성 제거(과세표준 = 양도소득금액).
  const build = (order: "presale-first" | "land-first"): AggregateTransferInput => ({
    taxYear: 2024,
    annualBasicDeductionUsed: 2_500_000, // 이번 계산 가용 기본공제 0
    properties: order === "presale-first" ? [presale(), land()] : [land(), presale()],
  });

  // 독립 도출:
  //   분양권 그룹(short_term) = 3억 × 60% = 180,000,000
  //   토지 그룹(progressive)  = 2억 × 38% − 19,940,000 = 56,060,000
  //   byGroups = 236,060,000
  //   byGeneral = 5억 × 40% − 25,940,000 = 174,060,000
  //   §104⑤ MAX(byGroups, byGeneral) = 236,060,000  (분양권=short_term → hasSurchargeGroup true)
  const EXPECTED_CALCULATED = 236_060_000;

  it("분양권 자산의 세율군은 short_term (progressive 아님)", () => {
    const r = calculateTransferTaxAggregate(build("presale-first"), mockRates);
    const b = r.properties.find((p) => p.propertyId === "B-presale")!;
    expect(b.rateGroup).toBe("short_term");
  });

  it("합산 산출세액 = 236,060,000 — 대표세율 오적용 없이 자산별 세율 합산", () => {
    const r = calculateTransferTaxAggregate(build("presale-first"), mockRates);
    expect(r.calculatedTax).toBe(EXPECTED_CALCULATED);
    expect(r.comparedTaxApplied).toBe("groups");
  });

  it("입력 순서 무관(순서 의존 버그 제거): presale-first == land-first", () => {
    const rPresaleFirst = calculateTransferTaxAggregate(build("presale-first"), mockRates);
    const rLandFirst = calculateTransferTaxAggregate(build("land-first"), mockRates);
    expect(rPresaleFirst.calculatedTax).toBe(EXPECTED_CALCULATED);
    expect(rLandFirst.calculatedTax).toBe(EXPECTED_CALCULATED);
    expect(rPresaleFirst.calculatedTax).toBe(rLandFirst.calculatedTax);
  });

  it("분양권 단독(2년+)도 60% 단일세율 유지 = 180,000,000 (회귀 없음)", () => {
    const input: AggregateTransferInput = {
      taxYear: 2024,
      annualBasicDeductionUsed: 2_500_000,
      properties: [presale()],
    };
    const r = calculateTransferTaxAggregate(input, mockRates);
    const b = r.properties.find((p) => p.propertyId === "B-presale")!;
    expect(b.rateGroup).toBe("short_term");
    expect(r.calculatedTax).toBe(180_000_000); // 3억 × 60%
  });
});

// ============================================================
// confirmed[28] — 감면 배분 말단 잔액 흡수 (표시 자기일관성)
// ============================================================
describe("audit confirmed[28]: 같은 유형 감면 다자산 배분 합 === cappedAggregateReduction (말단 잔액 흡수)", () => {
  // 자경농지 2필지(편입 없음 → 전액 감면). 보유 → LTHD 10%(엔진 실측).
  //   토지1 차익 3억 → 소득 270,000,000, 토지2 차익 6억 → 소득 540,000,000 (비율 정확히 1:2).
  //   reducibleIncome(전액) = 소득. 합산 산출세액 기준 원시 감면 > 1억 → §133 자경 1억 한도로 cap.
  const farmland = (
    id: string,
    transferPrice: number,
    acquisitionPrice: number,
  ): TransferTaxItemInput =>
    makeItem(id, id, {
      propertyType: "land",
      transferPrice,
      acquisitionPrice,
      expenses: 0,
      acquisitionDate: new Date("2018-06-01"),
      transferDate: new Date("2024-06-01"), // 6년 보유
      isOneHousehold: false,
      householdHousingCount: 0,
      isNonBusinessLand: false,
      residencePeriodMonths: 0,
      reductions: [{ type: "self_farming", farmingYears: 30 }],
    });

  const input: AggregateTransferInput = {
    taxYear: 2024,
    annualBasicDeductionUsed: 0,
    properties: [
      farmland("F1", 500_000_000, 200_000_000), // 차익 3억 → 소득 270,000,000
      farmland("F2", 800_000_000, 200_000_000), // 차익 6억 → 소득 540,000,000
    ],
  };

  it("두 자경농지 모두 self_farming 감면대상 소득 노출 (비율 1:2)", () => {
    const r = calculateTransferTaxAggregate(input, mockRates);
    const f1 = r.properties.find((p) => p.propertyId === "F1")!;
    const f2 = r.properties.find((p) => p.propertyId === "F2")!;
    expect(f1.reductionType).toBe("self_farming");
    expect(f2.reductionType).toBe("self_farming");
    expect(f1.reducibleIncome).toBe(270_000_000);
    expect(f2.reducibleIncome).toBe(540_000_000);
    // 감면대상 소득 비율 정확히 1:2 (배분 floor 드리프트를 발생시키는 조건)
    expect(f2.reducibleIncome).toBe(f1.reducibleIncome * 2);
  });

  it("§133 자경 1억 한도로 cap: cappedAggregateReduction = 100,000,000", () => {
    const r = calculateTransferTaxAggregate(input, mockRates);
    const entry = r.reductionBreakdown.find((b) => b.type === "self_farming")!;
    expect(entry).toBeDefined();
    expect(entry.cappedAggregateReduction).toBe(100_000_000);
  });

  it("자산별 배분 합 = cappedAggregateReduction (드리프트 제거) — 말단 흡수 66,666,667", () => {
    const r = calculateTransferTaxAggregate(input, mockRates);
    const f1 = r.properties.find((p) => p.propertyId === "F1")!;
    const f2 = r.properties.find((p) => p.propertyId === "F2")!;

    // 독립 도출: 100,000,000 × (1/3) = 33,333,333.33 → floor 33,333,333.
    //           마지막 자산(F2)이 잔액 흡수 = 100,000,000 − 33,333,333 = 66,666,667.
    expect(f1.reductionAggregated).toBe(33_333_333);
    expect(f2.reductionAggregated).toBe(66_666_667);

    // 합계 자기일관성: Σ = §133 cap
    expect(f1.reductionAggregated + f2.reductionAggregated).toBe(100_000_000);

    // 비-공허 가드: 잔액 흡수 없는 순수 독립 floor 합은 99,999,999로 부족했음을 확인.
    const naiveSum =
      Math.floor(100_000_000 * (1 / 3)) + Math.floor(100_000_000 * (2 / 3));
    expect(naiveSum).toBe(99_999_999);
    expect(naiveSum).toBeLessThan(100_000_000);

    // 음수 배분 없음
    expect(f1.reductionAggregated).toBeGreaterThanOrEqual(0);
    expect(f2.reductionAggregated).toBeGreaterThanOrEqual(0);
  });
});
