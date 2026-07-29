/**
 * C-7 anchor — 전세보증금 반환채권(deposit)에 §14 담보채무 유령공제 차단
 *
 * 법령(KoreanLaw MCP, 상증법 mst 276123):
 *   §14①3호 — 차감 채무는 "피상속인이 진 채무"에 한정.
 *   deposit(전세보증금 반환채권)은 피상속인=임차인이 반환받을 채권(자산)이므로 채무 아님.
 *
 * 버그: deposit + "담보채무 자동공제" 토글 ON → leaseDeposit이 §14 채무로 파생 →
 *   동일 보증금이 자산+채무 이중계상 → 과세표준 소멸.
 * 수정: (엔진) deriveCollateralDebts에 deposit 방어 가드 / (UI) 토글 노출에서 deposit 제외.
 */
import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { deriveCollateralDebts } from "@/lib/tax-engine/inheritance-collateral-debt";
import type {
  InheritanceTaxInput,
  Heir,
  EstateItem,
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
    deductionInput: { heirs: HEIRS, netFinancialAssets: 0 },
    creditInput: { priorGifts: [], isFiledOnTime: true },
  } as InheritanceTaxInput;
}

describe("C-7 deposit 유령 담보채무 차단", () => {
  it("엔진 단위: deposit + deductSecuredClaimAsDebt ON → 파생 안 됨(빈 배열)", () => {
    const items: EstateItem[] = [
      {
        id: "d1",
        category: "deposit",
        name: "전세보증금",
        leaseDeposit: 3_000_000_000,
        deductSecuredClaimAsDebt: true, // stale store로 ON된 상황 재현
      },
    ];
    expect(deriveCollateralDebts(items)).toEqual([]);
  });

  it("회귀: real_estate_building + leaseDeposit + ON → 여전히 파생(임대인 채무 정상)", () => {
    const items: EstateItem[] = [
      {
        id: "b1",
        category: "real_estate_building",
        name: "상가",
        marketValue: 1_000_000_000,
        leaseDeposit: 200_000_000,
        deductSecuredClaimAsDebt: true,
      },
    ];
    const d = deriveCollateralDebts(items);
    expect(d).toHaveLength(1);
    expect(d[0].amount).toBe(200_000_000);
  });

  it("통합: deposit 30억 + 토글 ON → 유령채무 미차감 (과세표준 소멸 방지)", () => {
    const withToggle = calcInheritanceTax(
      baseInput([
        {
          id: "d1",
          category: "deposit",
          name: "전세보증금",
          leaseDeposit: 3_000_000_000,
          deductSecuredClaimAsDebt: true,
        },
      ]),
    );
    const withoutToggle = calcInheritanceTax(
      baseInput([
        {
          id: "d1",
          category: "deposit",
          name: "전세보증금",
          leaseDeposit: 3_000_000_000,
        },
      ]),
    );
    // 토글 유무와 무관하게 동일 (deposit은 담보채무 대상 아님)
    expect(withToggle.taxBase).toBe(withoutToggle.taxBase);
    expect(withToggle.finalTax).toBe(withoutToggle.finalTax);
    // 30억 자산은 유지 — 장례비 최소 500만원만 차감(§14①2호), 유령 30억 채무 미차감
    expect(withToggle.taxableEstateValue).toBe(2_995_000_000);
    expect(withToggle.finalTax).toBeGreaterThan(0);
  });
});
