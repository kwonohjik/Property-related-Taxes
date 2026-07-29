/**
 * Anchor — M-7·L-1 정수 안분 정밀도 (부동소수 나눗셈 → safeMultiplyThenDivide BigInt 단일 floor)
 *
 * 두 지점 모두 "곱셈 후 부동소수 나눗셈을 단일 Math.floor"로 처리해, 곱이 2^53를 초과하는
 * 대형 재산 규모에서 나눗셈 전 반올림으로 1원 오차가 발생할 수 있었다. 코드베이스 정본 정수
 * 헬퍼(safeMultiplyThenDivide — BigInt 단일 floor)로 대체.
 *
 * - M-7: inheritance-house-valuation.ts §164⑦ 개별주택가격 추정
 *     estimated = floor(P_F × Sum_A / Sum_F)
 * - L-1: inheritance-generation-skip.ts §27 세대생략 per-heir 할증 안분
 *     surcharge = floor(computedTax × numerator × rate / denominator)
 *     (정본 calcGenerationSkipSurcharge 안분 경로와 동일 패턴으로 통일)
 *
 * 앵커 입력은 실제 대형 상속 규모에서 float 경로가 정수 경로보다 정확히 1원 큰(과대) 값을
 * 내는 경계 케이스로 선정(브루트포스 탐색). 수정 전 값은 각 기대치 + 1.
 */
import { describe, it, expect } from "vitest";
import { calculateInheritanceHouseValuation } from "@/lib/tax-engine/inheritance-house-valuation";
import { computeGenerationSkipSurcharge } from "@/lib/tax-engine/inheritance-generation-skip";
import type { InheritanceHouseValuationInput } from "@/lib/tax-engine/types/inheritance-house-valuation.types";
import type {
  InheritanceTaxInput,
  Heir,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";

describe("M-7 §164⑦ 개별주택가격 추정 정수 정밀도", () => {
  it("[M7] P_F=31.4억 · Sum_A=47.5억 · Sum_F=24.6억 → 정확 정수 6,061,239,195 (수정 전 float은 …196)", () => {
    const input: InheritanceHouseValuationInput = {
      inheritanceDate: new Date("2024-01-01"),
      transferDate: new Date("2024-06-01"),
      landArea: 100,
      landPricePerSqmAtTransfer: 30_000_000,
      housePriceAtTransfer: 5_000_000_000,
      // Sum_F = 최초고시 토지기준시가(10,000,000×100) + 건물기준시가 = 2,464,488,418
      landPricePerSqmAtFirstDisclosure: 10_000_000,
      buildingStdPriceAtFirstDisclosure: 1_464_488_418,
      housePriceAtFirstDisclosure: 3_142_879_696, // P_F
      // Sum_A = 취득시 토지기준시가(20,000,000×100) + 건물기준시가 = 4,752,919,374
      landPricePerSqmAtInheritance: 20_000_000,
      buildingStdPriceAtInheritance: 2_752_919_374,
    } as InheritanceHouseValuationInput;

    const r = calculateInheritanceHouseValuation(input);
    expect(r.estimationMethod).toBe("estimated_phd");
    expect(r.sumAtInheritance).toBe(4_752_919_374);
    expect(r.sumAtFirstDisclosure).toBe(2_464_488_418);
    // floor(3,142,879,696 × 4,752,919,374 / 2,464,488,418) = 6,061,239,195 (BigInt 정확값)
    expect(r.housePriceAtInheritanceUsed).toBe(6_061_239_195);
  });
});

describe("L-1 §27 세대생략 per-heir 할증 정수 정밀도", () => {
  function makeInput(gk: Heir, gift: PriorGift): InheritanceTaxInput {
    return {
      decedentType: "resident",
      deathDate: "2024-01-01",
      estateItems: [],
      funeralExpense: 0,
      funeralIncludesBongan: false,
      debts: 0,
      debtItems: [],
      preGiftsWithin10Years: [gift],
      heirs: [gk],
      deductionInput: {
        heirs: [gk],
        netFinancialAssets: 0,
        cohabitHouseStdPrice: 0,
        farmingAssetValue: 0,
        familyBusinessValue: 0,
      },
      creditInput: { priorGifts: [], isFiledOnTime: true },
    } as unknown as InheritanceTaxInput;
  }

  it("[L1] computedTax=440억 · numerator=91.9억 · denom=858억 · 30% → 정확 정수 1,413,340,123 (수정 전 float은 …124)", () => {
    const gk: Heir = {
      id: "gk",
      relation: "legatee", // 손자(비상속인 수유자) — 코드베이스 세대생략 모델
      name: "손자",
      birthDate: "1980-01-01",
      isGenerationSkipBeneficiary: true,
    };
    // per-heir numerator는 사전증여(donee 집계)로 주입 — 단독 손자는 estate 배분 0.
    const gift: PriorGift = {
      giftDate: "2020-01-01",
      isHeir: false,
      giftAmount: 9_190_521_402,
      giftTaxPaid: 0,
      doneeId: "gk",
      beneficiaryType: "legatee",
    };

    const r = computeGenerationSkipSurcharge({
      input: makeInput(gk, gift),
      computedTax: 44_014_405_491,
      taxBase: 80_000_000_000,
      taxableEstateValue: 85_863_691_717, // = adjustedDenominator (영리법인 사전증여 0)
      preGifts: [gift],
      cutoffFilteredGifts: [gift],
      valuatedAmountById: new Map(),
    });

    const row = r.generationSkipDetail?.rows?.[0];
    expect(row?.numerator).toBe(9_190_521_402);
    expect(row?.rate).toBe(0.3);
    expect(r.generationSkipDetail?.denominator).toBe(85_863_691_717);
    // floor(44,014,405,491 × 9,190,521,402 × 0.3 / 85,863,691,717) = 1,413,340,123 (BigInt 정확값)
    expect(r.generationSkipSurcharge).toBe(1_413_340_123);
  });
});
