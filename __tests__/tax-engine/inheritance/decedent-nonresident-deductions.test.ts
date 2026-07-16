/**
 * 비거주자 피상속인 상속공제·§14 게이트 anchor (C-12·C-13·H-33 / 근인 G-1)
 *
 * 법령(KoreanLaw MCP, mst 276123, 시행 20260102):
 *  - §18 기초공제 2억: "거주자나 비거주자" → 둘 다.
 *  - §19 배우자·§20 인적·§21 일괄(5억)·§22 금융·§23 재해·§23의2 동거주택·§18의2 가업·§18의3 영농:
 *    전부 "거주자의 사망으로" 한정 → 비거주자 배제.
 *  - §14② 비거주자: 해당재산 공과금·국내재산 담보채무·국내사업장 장부채무만 차감.
 *    장례비(§14①2호)·무담보 일반채무는 §14② 미열거 → 차감 불가.
 *
 * 재현: decedentType이 엔진에서 미소비되어 resident==non_resident였음(G-1). 수정 후 분기.
 */
import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import type {
  Heir,
  InheritanceTaxInput,
} from "@/lib/tax-engine/types/inheritance-gift.types";

const HEIRS: Heir[] = [
  { id: "s", relation: "spouse" },
  { id: "c", relation: "child" },
];

function makeInput(
  decedentType: "resident" | "non_resident",
  over: Partial<InheritanceTaxInput> = {},
): InheritanceTaxInput {
  return {
    decedentType,
    deathDate: "2024-03-01",
    estateItems: [
      { id: "e1", category: "real_estate_apartment", name: "국내 아파트", marketValue: 8_000_000_000 },
    ],
    funeralExpense: 10_000_000,
    funeralIncludesBongan: false,
    debts: 100_000_000, // 무담보 일반채무 (legacy 경로, 미분류)
    debtItems: [],
    preGiftsWithin10Years: [],
    heirs: HEIRS,
    deductionInput: {
      heirs: HEIRS,
      netFinancialAssets: 500_000_000,
    },
    creditInput: { priorGifts: [], isFiledOnTime: true },
    isGenerationSkip: false,
    ...over,
  };
}

describe("비거주자 상속공제 게이트 (C-12·H-33)", () => {
  const resident = calcInheritanceTax(makeInput("resident"));
  const nonResident = calcInheritanceTax(makeInput("non_resident"));

  it("G-1 회귀: resident ≠ non_resident (엔진이 decedentType 소비)", () => {
    expect(resident.totalDeduction).not.toBe(nonResident.totalDeduction);
    expect(resident.finalTax).not.toBe(nonResident.finalTax);
  });

  it("C-12: 비거주자 상속공제 = §18 기초공제 2억만 (배우자·일괄·금융 배제)", () => {
    expect(nonResident.totalDeduction).toBe(200_000_000);
    // resident: 일괄 5억 + 배우자 30억(법정지분 47.34억 → §19 상한 30억) + 금융 1억 = 36억
    expect(resident.totalDeduction).toBe(3_600_000_000);
  });

  it("H-33: 비거주자 §14② — 장례비·무담보 일반채무 차감 배제 (taxableEstateValue = grossEstate)", () => {
    // resident: 8억 − (장례비 1천만 + 채무 1억) = 7.89억
    expect(resident.taxableEstateValue).toBe(7_890_000_000);
    // non_resident: 차감 0 → 8억 그대로
    expect(nonResident.taxableEstateValue).toBe(8_000_000_000);
  });

  it("비거주자 과세표준·결정세액 (과다과소 정정)", () => {
    expect(nonResident.taxBase).toBe(7_800_000_000); // 8억 − §18 2억
    expect(nonResident.taxBase).toBeGreaterThan(resident.taxBase);
    // 현행 미소비 버그였다면 resident와 동일했을 것 — 이제 세액 상향 정정
    expect(nonResident.finalTax).toBeGreaterThan(resident.finalTax);
  });
});

describe("비거주자 가업상속공제 부적격 (C-13)", () => {
  it("비거주자 + 가업상속공제 직접 10억 → familyBusinessDeduction 0 (§18의2① 거주자 요건)", () => {
    const nr = calcInheritanceTax(
      makeInput("non_resident", {
        deductionInput: { heirs: HEIRS, netFinancialAssets: 500_000_000, familyBusinessDirectAmount: 1_000_000_000 },
      }),
    );
    expect(nr.deductionDetail?.familyBusinessDeduction).toBe(0);
    // 가업공제 배제로 총공제는 여전히 §18 2억
    expect(nr.totalDeduction).toBe(200_000_000);
  });

  it("거주자 + 가업 직접 10억 → familyBusinessDeduction 10억 (회귀 — 거주자 정상 적용)", () => {
    const r = calcInheritanceTax(
      makeInput("resident", {
        deductionInput: { heirs: HEIRS, netFinancialAssets: 500_000_000, familyBusinessDirectAmount: 1_000_000_000 },
      }),
    );
    expect(r.deductionDetail?.familyBusinessDeduction).toBe(1_000_000_000);
  });
});
