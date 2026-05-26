/**
 * 담보채무 §14 자동 반영 anchor (CDA / AC)
 *
 * 계획: docs/00-pm/inheritance-collateral-debt-auto-deduction.plan.md
 * 설계: docs/02-design/features/inheritance-collateral-debt-auto-deduction.design.md
 *
 * - CDA-1·2·6·8: deriveCollateralDebts 단위 (opt-in·금융채무·임대보증금·물상보증)
 * - CDA-4·4b: scaleAllocations 비율 환산 + floor 잔액 흡수 (E-1)
 * - AC-1: calcInheritanceTax 통합 — opt-in ON 시 §14 자동공제 (Pre-Do: A5 전 실패)
 * - AC-2(CD-1): opt-in OFF 회귀 (§14 미반영)
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import {
  deriveCollateralDebts,
  scaleAllocations,
} from "@/lib/tax-engine/inheritance-collateral-debt";
import {
  validateCollateralDebtOptIn,
  warnCollateralDebtDuplication,
} from "@/lib/calc/inheritance-validate";
import type {
  InheritanceTaxInput,
  Heir,
  EstateItem,
  DebtItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

const HEIRS: Heir[] = [
  { id: "h-spouse", name: "배우자", relation: "spouse" },
  { id: "h-son", name: "장남", relation: "child" },
];

function baseInput(estateItems: EstateItem[]): InheritanceTaxInput {
  return {
    decedentType: "resident",
    deathDate: "2024-03-01",
    estateItems,
    heirs: HEIRS,
    preGiftsWithin10Years: [],
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    deductionInput: {
      heirs: HEIRS,
      spouseActualAmount: 0,
      preferLumpSum: true,
      netFinancialAssets: 0,
      cohabitHouseStdPrice: 0,
      farmingAssetValue: 0,
      familyBusinessValue: 0,
    },
    creditInput: { priorGifts: [], isFiledOnTime: true },
  } as InheritanceTaxInput;
}

// ============================================================
// deriveCollateralDebts 단위
// ============================================================

describe("deriveCollateralDebts (CDA 단위)", () => {
  it("CDA-1: opt-in OFF(undefined) → 빈 배열", () => {
    const items: EstateItem[] = [
      { id: "e1", category: "real_estate_apartment", name: "주택", marketValue: 500_000_000, mortgageAmount: 150_000_000 },
    ];
    expect(deriveCollateralDebts(items)).toEqual([]);
  });

  it("CDA-2: opt-in ON, 저당 1.5억 → amount 1.5억 / financialDebtAmount 0(금융채무 미지정)", () => {
    const items: EstateItem[] = [
      { id: "e1", category: "real_estate_apartment", name: "주택", marketValue: 500_000_000, mortgageAmount: 150_000_000, deductSecuredClaimAsDebt: true },
    ];
    const d = deriveCollateralDebts(items);
    expect(d).toHaveLength(1);
    expect(d[0].amount).toBe(150_000_000);
    expect(d[0].financialDebtAmount).toBe(0);
    expect(d[0].creditorName).toBe("주택 담보채무");
  });

  it("CDA-3(단위): 금융채무 ON → financialDebtAmount = mortgage", () => {
    const items: EstateItem[] = [
      { id: "e1", category: "real_estate_apartment", name: "주택", marketValue: 500_000_000, mortgageAmount: 150_000_000, deductSecuredClaimAsDebt: true, securedClaimIsFinancialDebt: true },
    ];
    const d = deriveCollateralDebts(items);
    expect(d[0].financialDebtAmount).toBe(150_000_000);
  });

  it("CDA-6: 임대보증금만, ON → amount=lease / financialDebtAmount=0 (임대보증금 §22 제외)", () => {
    const items: EstateItem[] = [
      { id: "e1", category: "real_estate_building", name: "상가", marketValue: 1_000_000_000, leaseDeposit: 200_000_000, deductSecuredClaimAsDebt: true, securedClaimIsFinancialDebt: true },
    ];
    const d = deriveCollateralDebts(items);
    expect(d[0].amount).toBe(200_000_000);
    // securedClaimIsFinancialDebt=true여도 mortgage=0이므로 financialDebtAmount=0
    expect(d[0].financialDebtAmount).toBe(0);
  });

  it("CDA-8: opt-in 미설정(물상보증 OFF) → 빈 배열 (§14 미공제)", () => {
    const items: EstateItem[] = [
      { id: "e1", category: "real_estate_land", name: "토지", standardPrice: 300_000_000, mortgageAmount: 150_000_000 },
    ];
    expect(deriveCollateralDebts(items)).toEqual([]);
  });

  it("CDA-amount0: opt-in ON이나 담보채권액 0 → skip", () => {
    const items: EstateItem[] = [
      { id: "e1", category: "real_estate_apartment", name: "주택", marketValue: 500_000_000, deductSecuredClaimAsDebt: true },
    ];
    expect(deriveCollateralDebts(items)).toEqual([]);
  });
});

// ============================================================
// scaleAllocations 비율 환산 (E-1)
// ============================================================

describe("scaleAllocations 비율 환산 (CDA-4)", () => {
  it("CDA-4: 자산 5억(배우자 3억·장남 2억) → 담보 1.5억 환산 → 배우자 9천만·장남 6천만", () => {
    const assetAllocs = [
      { heirId: "h-spouse", amount: 300_000_000 },
      { heirId: "h-son", amount: 200_000_000 },
    ];
    const r = scaleAllocations(assetAllocs, 150_000_000)!;
    expect(r[0]).toEqual({ heirId: "h-spouse", amount: 90_000_000 });
    expect(r[1]).toEqual({ heirId: "h-son", amount: 60_000_000 });
    expect(r[0].amount + r[1].amount).toBe(150_000_000);
  });

  it("CDA-4b: 1/3·2/3 분배 floor 잔액 → 마지막 흡수, Σ=담보액 정확", () => {
    const assetAllocs = [
      { heirId: "a", amount: 100_000_000 }, // 1/3
      { heirId: "b", amount: 200_000_000 }, // 2/3
    ];
    const collateral = 100_000_000;
    const r = scaleAllocations(assetAllocs, collateral)!;
    // a = floor(1억 × 1억 / 3억) = 33,333,333 / b = 잔액 = 66,666,667
    expect(r[0].amount).toBe(33_333_333);
    expect(r[1].amount).toBe(66_666_667);
    expect(r[0].amount + r[1].amount).toBe(collateral);
  });

  it("CDA-4-none: 자산 분배 없음 → undefined (법정상속분 fallback)", () => {
    expect(scaleAllocations(undefined, 150_000_000)).toBeUndefined();
    expect(scaleAllocations([], 150_000_000)).toBeUndefined();
  });
});

// ============================================================
// calcInheritanceTax 통합 (AC — Pre-Do 실패 대상)
// ============================================================

describe("담보채무 §14 자동공제 통합 (AC)", () => {
  // 현행: funeralExpense=0이어도 상증령 §9 기본 장례비 5,000,000 항상 적용.
  // 담보채무 효과 = deductedBeforeAggregation − 기본장례 5,000,000.
  const BASE_FUNERAL = 5_000_000;

  it("AC-1: opt-in ON, 저당 1.5억 → §14 자동공제 (기본장례 + 담보 1.5억) + collateralDebtDetail", () => {
    const input = baseInput([
      { id: "e1", category: "real_estate_apartment", name: "주택", marketValue: 2_000_000_000, mortgageAmount: 150_000_000, deductSecuredClaimAsDebt: true },
    ]);
    const result = calcInheritanceTax(input);
    expect(result.deductedBeforeAggregation).toBe(BASE_FUNERAL + 150_000_000);
    expect(result.collateralDebtDetail).toBeDefined();
    expect(result.collateralDebtDetail).toHaveLength(1);
    expect(result.collateralDebtDetail![0].amount).toBe(150_000_000);
  });

  it("AC-2(CD-1): opt-in OFF → §14 미반영 (기본장례만, 담보 0)", () => {
    const input = baseInput([
      { id: "e1", category: "real_estate_apartment", name: "주택", marketValue: 2_000_000_000, mortgageAmount: 150_000_000 },
    ]);
    const result = calcInheritanceTax(input);
    expect(result.deductedBeforeAggregation).toBe(BASE_FUNERAL);
    expect(result.collateralDebtDetail ?? []).toHaveLength(0);
  });
});

// ============================================================
// validate — CDA-5, CDA-7 (B8 UI 레이어 검증)
// ============================================================

describe("validateCollateralDebtOptIn (CDA-5b/CDA-7)", () => {
  it("CDA-5b: opt-in ON + 담보채권액 0 → 오류 반환", () => {
    const item: EstateItem = {
      id: "e1",
      category: "real_estate_apartment",
      name: "주택",
      marketValue: 500_000_000,
      deductSecuredClaimAsDebt: true,
      // mortgageAmount·leaseDeposit 미입력 → 0
    };
    const err = validateCollateralDebtOptIn(item);
    expect(err).not.toBeNull();
    expect(err).toContain("담보채권액");
  });

  it("CDA-7a: opt-in OFF → null (검증 통과)", () => {
    const item: EstateItem = {
      id: "e1",
      category: "real_estate_apartment",
      name: "주택",
      marketValue: 500_000_000,
      mortgageAmount: 150_000_000,
      // deductSecuredClaimAsDebt 미설정 = OFF
    };
    expect(validateCollateralDebtOptIn(item)).toBeNull();
  });

  it("CDA-7b: opt-in ON + 담보채권액 >0 → null (검증 통과)", () => {
    const item: EstateItem = {
      id: "e1",
      category: "real_estate_apartment",
      name: "주택",
      marketValue: 500_000_000,
      mortgageAmount: 150_000_000,
      deductSecuredClaimAsDebt: true,
    };
    expect(validateCollateralDebtOptIn(item)).toBeNull();
  });
});

describe("warnCollateralDebtDuplication (CDA-5 중복 warning)", () => {
  const estateItems: EstateItem[] = [
    {
      id: "e1",
      category: "real_estate_apartment",
      name: "주택",
      marketValue: 500_000_000,
      mortgageAmount: 150_000_000,
      deductSecuredClaimAsDebt: true,
    },
  ];

  it("CDA-5: debtItems에 동일 금액(1.5억) → warning 반환", () => {
    const debtItems: DebtItem[] = [
      { id: "d1", category: "financial", name: "근저당", amount: 150_000_000 },
    ];
    const warnings = warnCollateralDebtDuplication(estateItems, debtItems);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("이중 공제 위험");
  });

  it("CDA-7: debtItems 비어있음 → warning 없음, debtItems 불변", () => {
    const debtItems: DebtItem[] = [];
    const before = [...debtItems];
    const warnings = warnCollateralDebtDuplication(estateItems, debtItems);
    expect(warnings).toHaveLength(0);
    // debtItems가 변경되지 않았음을 확인 (derive only)
    expect(debtItems).toEqual(before);
  });

  it("CDA-5-nodup: 금액 다름 → warning 없음", () => {
    const debtItems: DebtItem[] = [
      { id: "d1", category: "financial", name: "다른 채무", amount: 80_000_000 },
    ];
    expect(warnCollateralDebtDuplication(estateItems, debtItems)).toHaveLength(0);
  });
});
