/**
 * 채무·공과·장례비 legacy(OFF 모드) 회귀 anchor — IDA-LEGACY
 *
 * 방안 C 3-state (`debtItems: DebtItem[] | undefined`) 적용 후에도
 * `debtItems === undefined` (OFF 모드) 케이스에서 legacy `debts`·`funeralExpense`·`funeralIncludesBongan` 경로가 무손상 작동해야 함.
 *
 * 종합사례 PDF 책 1858 (3) 시나리오를 단일금액으로 표현해 회귀 차단.
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import type {
  InheritanceTaxInput,
  Heir,
} from "@/lib/tax-engine/types/inheritance-gift.types";

const HEIRS: Heir[] = [
  { id: "h1", name: "장남", relation: "child" },
];

function baseInput(overrides: Partial<InheritanceTaxInput>): InheritanceTaxInput {
  return {
    decedentType: "resident",
    deathDate: "2024-03-01",
    estateItems: [
      {
        id: "estate-1",
        category: "real_estate_apartment",
        name: "주택",
        marketValue: 2_000_000_000,
      },
    ],
    heirs: HEIRS,
    preGiftsWithin10Years: [],
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    deductionInput: {
      heirs: HEIRS,
      spouseActualAmount: 0,
      netFinancialAssets: 0,
      cohabitHouseStdPrice: 0,
      farmingAssetValue: 0,
      familyBusinessValue: 0,
    },
    creditInput: {
      priorGifts: [],
      isFiledOnTime: true,
    },
    ...overrides,
  } as InheritanceTaxInput;
}

describe("채무·장례 legacy 경로 회귀 (IDA-LEGACY)", () => {
  it("IDA-LEGACY-1: debtItems undefined + debts 1,200M + 장례 33M (봉안 포함, 한도 15M)", () => {
    const input = baseInput({
      debtItems: undefined,
      debts: 1_200_000_000,
      funeralExpense: 33_000_000,
      funeralIncludesBongan: true,
    });

    const result = calcInheritanceTax(input);

    // 채무 1,200M + 장례 한도 15M = 1,215M 차감 → 과세가액 (불변)
    expect(result.taxableEstateValue).toBe(2_000_000_000 - 1_215_000_000);
    // 2026-05-26 정책(항상 배부): legacy 경로여도 자연인 상속인 → 법정상속분 배부 생성
    expect(result.heirAllocationResult).toBeDefined();
  });

  it("IDA-LEGACY-2: 봉안 미사용 — 식대 18M 입력 → 한도 10M 적용", () => {
    const input = baseInput({
      debtItems: undefined,
      debts: 0,
      funeralExpense: 18_000_000,
      funeralIncludesBongan: false,
    });

    const result = calcInheritanceTax(input);

    // 봉안 미사용 시 한도 10M (식대만 18M → 10M 적용)
    expect(result.taxableEstateValue).toBe(2_000_000_000 - 10_000_000);
  });

  it("IDA-LEGACY-3: 모든 채무·장례 0 — 차감 없음 (baseline 회귀)", () => {
    const inputZero = baseInput({
      debtItems: undefined,
      debts: 0,
      funeralExpense: 0,
      funeralIncludesBongan: false,
    });
    const inputWithDebts = baseInput({
      debtItems: undefined,
      debts: 100_000_000,
      funeralExpense: 0,
      funeralIncludesBongan: false,
    });

    const resultZero = calcInheritanceTax(inputZero);
    const resultWithDebts = calcInheritanceTax(inputWithDebts);

    // baseline 대비 정확히 100M 추가 차감 (장례 0이라 100M 채무만 차감)
    expect(resultZero.taxableEstateValue - resultWithDebts.taxableEstateValue).toBe(
      100_000_000,
    );
  });

  it("IDA-LEGACY-4: debtItems가 빈 배열일 때도 legacy 경로 작동 (엔진 fallback)", () => {
    // FormState normalize에서는 빈 배열을 undefined로 강등하지만,
    // 엔진 input에 직접 빈 배열이 들어와도 legacy 경로 사용해야 함 (inheritance-tax.ts:110 분기).
    const input = baseInput({
      debtItems: [],
      debts: 500_000_000,
      funeralExpense: 12_000_000,
      funeralIncludesBongan: false,
    });

    const result = calcInheritanceTax(input);

    // 채무 500M + 장례 한도 10M = 510M 차감
    expect(result.taxableEstateValue).toBe(2_000_000_000 - 510_000_000);
  });
});
